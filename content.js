console.log('Telegram Monitor: Content script loaded at:', new Date().toLocaleString());

// 全局变量
let observer = null;
let retryCount = 0;
const MAX_RETRIES = 5;
const RETRY_INTERVAL = 5000;
const CHECK_INTERVAL = 60000;
let isMonitoring = false;
let lastProcessedMessage = null;
let initialScanDone = false;
let isInitializing = false;
let currentUrl = location.href;
let isMonitoringActive = false;
let audioContext = null;
let hasUserInteracted = false;
let audio = null;
let lastCheckTime = Date.now();
let lastHeartbeat = Date.now();
const HEARTBEAT_INTERVAL = 60000; // 1分钟
let lastProcessedTime = Date.now();

// 添加用户交互检测
document.addEventListener('click', () => {
  hasUserInteracted = true;
  // 初始化音频
  if (!audio) {
    audio = new Audio(chrome.runtime.getURL('notification.mp3'));
    audio.volume = 0.3; // 设置适中的音量
  }
}, { once: true }); // 只需要检测一次用户交互

// 添加错误处理函数
function handleExtensionError(error) {
  if (error.message === 'Extension context invalidated') {
    console.log('Telegram Monitor: Extension context invalidated, attempting to recover...');
    
    // 清理现有状态
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    isMonitoring = false;
    isInitializing = false;
    
    // 开始恢复过程
    attemptRecovery();
    return true;
  }
  return false;
}

// 修改 chrome.runtime.sendMessage 的调用
async function sendMessageToBackground(message) {
  try {
    return new Promise((resolve, reject) => {
      if (!chrome.runtime) {
        reject(new Error('Extension context invalidated'));
        return;
      }
      
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  } catch (error) {
    if (!handleExtensionError(error)) {
      console.error('Telegram Monitor: Message send error:', error);
    }
    throw error;
  }
}

// 获取关键词列表
async function getKeywords() {
  try {
    return new Promise((resolve, reject) => {
      if (!chrome.storage) {
        reject(new Error('Extension context invalidated'));
        return;
      }
      
      chrome.storage.sync.get(['keywords'], function(result) {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          console.log('Telegram Monitor: Current keywords:', result.keywords);
          resolve(result.keywords || []);
        }
      });
    });
  } catch (error) {
    if (!handleExtensionError(error)) {
      console.error('Telegram Monitor: Error getting keywords:', error);
    }
    return [];
  }
}

// 显示通知
async function showNotification(text, messageInfo = null, isBatchScan = false) {
  try {
    console.log('Telegram Monitor: Attempting to show notification for:', text);
    
    // 格式化消息内容，移除群聊名称
    let formattedMessage;
    if (messageInfo) {
      // 限制消息长度，避免过长
      const truncatedText = text.length > 100 ? text.substring(0, 97) + '...' : text;
      formattedMessage = [
        `👤 From: ${messageInfo.sender}`,
        `💬 Message: ${truncatedText}`,
        `🕒 Time: ${messageInfo.timestamp}`
      ].join('\n');
    } else {
      const truncatedText = text.length > 100 ? text.substring(0, 97) + '...' : text;
      formattedMessage = [
        `💬 Message: ${truncatedText}`,
        `🕒 Time: ${new Date().toLocaleString()}`
      ].join('\n');
    }

    const notificationOptions = {
      type: 'basic',
      title: '🔍 Keyword Match Found',
      message: formattedMessage,
      requireInteraction: true
    };

    await sendMessageToBackground({
      type: 'showNotification',
      options: notificationOptions,
      isBatchScan: isBatchScan
    });
  } catch (error) {
    if (!handleExtensionError(error)) {
      console.error('Telegram Monitor: Error showing notification:', error);
    }
  }
}

// 处理消息文本
async function processMessageText(text) {
  try {
    if (!chrome.runtime || !isMonitoringActive || !text) {
      return;
    }

    const currentTime = Date.now();
    const keywords = await getKeywords();
    if (!keywords || !keywords.length) {
      return;
    }

    // 改进的关键词匹配逻辑
    for (const keyword of keywords) {
      if (keyword.includes(' ')) {
        // 组合关键词必须所有部分都匹配
        const parts = keyword.split(' ').filter(k => k.trim());
        const allPartsMatch = parts.every(part => 
          text.toLowerCase().includes(part.toLowerCase())
        );
        
        if (allPartsMatch) {
          lastProcessedTime = currentTime;
          await showNotification(text);
          break;
        }
      } else {
        // 单个关键词匹配，只要包含就行
        if (text.toLowerCase().includes(keyword.toLowerCase())) {
          lastProcessedTime = currentTime;
          await showNotification(text);
          break;
        }
      }
    }
  } catch (error) {
    if (error.message === 'Extension context invalidated') {
      return;
    }
    console.error('Telegram Monitor: Error processing message:', error);
  }
}

// 提取消息信息
function extractMessageInfo(node) {
  try {
    let chatTitle = '';
    let sender = '';

    // 尝试获取聊天标题
    const titleSelectors = [
      '.chat-info .title',
      '.top .title',
      '.peer-title',
      '.chat-title',
      '.info .title',
      '.TopBar .title'
    ];

    for (const selector of titleSelectors) {
      const titleElement = document.querySelector(selector);
      if (titleElement) {
        chatTitle = titleElement.textContent.trim();
        break;
      }
    }

    // 尝试获取发送者
    let messageNode = node;
    while (messageNode && !messageNode.classList.contains('message') && !messageNode.classList.contains('Message') && !messageNode.classList.contains('bubble')) {
      messageNode = messageNode.parentElement;
    }

    if (messageNode) {
      const senderSelectors = [
        '.sender-name',
        '.peer-title',
        '.name',
        '.from-name',
        '.message-author',
        '.author'
      ];

      for (const selector of senderSelectors) {
        const senderElement = messageNode.querySelector(selector);
        if (senderElement) {
          sender = senderElement.textContent.trim();
          break;
        }
      }
    }

    // 格式化时
    const now = new Date();
    const timeString = now.toLocaleString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    return {
      chatTitle: chatTitle || 'Unknown Chat',
      sender: sender || 'Unknown Sender',
      timestamp: timeString
    };
  } catch (error) {
    console.error('Telegram Monitor: Error extracting message info:', error);
    return {
      chatTitle: 'Unknown Chat',
      sender: 'Unknown Sender',
      timestamp: new Date().toLocaleString()
    };
  }
}

// 扫描现有消息
async function scanMessages() {
  console.log('Telegram Monitor: Starting to scan existing messages...');
  
  // 扩展消息选择器以适应新版 Telegram Web
  const messageSelectors = [
    '.Message',
    '.message',
    '.bubble',
    '.history-message',
    '.im_message_text',
    '.text-content',
    '.message-content',
    // 添加新的选择器
    'div[class^="message"]',
    '.text',
    '.message-text-content',
    '.text-entity',
    '.message-text',
    '.Message_message__text'
  ];

  try {
    // 等待消息容器加载
    await new Promise(resolve => setTimeout(resolve, 2000));

    const keywords = await getKeywords();
    if (!keywords.length) {
      return [];
    }

    const currentTime = Date.now();
    console.log('Telegram Monitor: Starting scan, time since last scan:', (currentTime - lastProcessedTime) / 1000);

    console.log('Telegram Monitor: Scanning with keywords:', keywords);
    const matchedMessages = new Set();

    for (const selector of messageSelectors) {
      const messages = document.querySelectorAll(selector);
      console.log(`Telegram Monitor: Found ${messages.length} messages with selector "${selector}"`);
      
      if (messages.length > 0) {
        messages.forEach(message => {
          const text = message.textContent.trim();
          if (!text) return;

          // 使用相同的改进匹配逻辑
          for (const keyword of keywords) {
            let matched = false;

            if (keyword.includes(' ')) {
              // 组合关键词匹配
              const parts = keyword.split(' ').filter(k => k.trim());
              matched = parts.every(part => 
                text.toLowerCase().includes(part.toLowerCase())
              );
            } else {
              // 单个关键词匹配，只要包含就行
              matched = text.toLowerCase().includes(keyword.toLowerCase());
            }

            if (matched) {
              const messageInfo = extractMessageInfo(message);
              matchedMessages.add(JSON.stringify({
                text,
                info: messageInfo
              }));
              break;
            }
          }
        });
      }
    }

    const results = Array.from(matchedMessages).map(msg => JSON.parse(msg));
    console.log('Telegram Monitor: Scan complete, found matches:', results.length);
    
    // 更新初始扫描状态
    if (!initialScanDone) {
      initialScanDone = true;
      console.log('Telegram Monitor: Initial scan completed');
    }

    // 发送通知
    results.forEach(result => {
      showNotification(result.text, result.info, true);
    });

    return results;
  } catch (error) {
    console.error('Telegram Monitor: Error scanning messages:', error);
    return [];
  }
}

// 初始化监控
async function initMonitor() {
  if (isMonitoring || isInitializing) {
    console.log('Telegram Monitor: Monitor already running or initializing');
    return;
  }

  console.log('Telegram Monitor: Starting monitor initialization...');
  isInitializing = true;
  retryCount = 0;
  
  try {
    // 增加等待时间，确保页面完全加载
    console.log('Telegram Monitor: Waiting for page load...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 扩展容器选择器
    const containerSelectors = [
      '.chat-content',
      '.bubbles',
      '.messages-container',
      '.history',
      'div[role="main"]',
      '.message-list-wrapper',
      '.chat-container',
      '.messages-layout',
      'div[class^="messages"]',
      // 添加更多可能的选择器
      '.chat-history',
      '.messages-list',
      '.dialog-messages',
      '.messages',
      '#message-list',
      '#chat-content'
    ];

    console.log('Telegram Monitor: Searching for chat container...');
    let chatContent = null;
    
    // 添加重试循环
    let retryAttempt = 0;
    const maxRetries = 3;
    
    while (!chatContent && retryAttempt < maxRetries) {
      for (const selector of containerSelectors) {
        chatContent = document.querySelector(selector);
        if (chatContent) {
          console.log('Telegram Monitor: Found chat container:', selector);
          break;
        }
      }
      
      if (!chatContent) {
        retryAttempt++;
        console.log(`Telegram Monitor: Container not found, retry ${retryAttempt}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (!chatContent) {
      console.log('Telegram Monitor: No chat container found after retries');
      throw new Error('Chat content not found');
    }

    // 断开现有观察器
    if (observer) {
      console.log('Telegram Monitor: Disconnecting existing observer');
      observer.disconnect();
    }

    // 执行初始扫描
    console.log('Telegram Monitor: Starting initial message scan...');
    const matchedMessages = await scanMessages();
    console.log('Telegram Monitor: Initial scan complete, matches found:', matchedMessages.length);

    // 设置新的观察器
    console.log('Telegram Monitor: Setting up mutation observer');
    observer = new MutationObserver((mutations) => {
      console.log('Telegram Monitor: Detected mutations:', {
        time: new Date().toLocaleString(),
        count: mutations.length,
        details: mutations.map(m => ({
          type: m.type,
          addedNodes: m.addedNodes.length,
          target: m.target.className
        }))
      });

      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const text = node.textContent.trim();
            if (text) {
              console.log('Telegram Monitor: New element:', {
                text: text.substring(0, 100),
                nodeType: node.nodeName,
                className: node.className
              });
              processMessageText(text);
            }
          }
        });
      });
    });
    
    // 开始观察
    observer.observe(chatContent, {
      childList: true,
      subtree: true,
      characterData: true
    });
    console.log('Telegram Monitor: Observer started');

    isInitializing = false;
    isMonitoring = true;
    console.log('Telegram Monitor: Monitor initialized successfully');
  } catch (error) {
    console.error('Telegram Monitor: Error during initialization:', error);
    isInitializing = false;
    
    // 改进重试逻辑
    if (retryCount < MAX_RETRIES) {
      console.log(`Telegram Monitor: Will retry initialization (${retryCount + 1}/${MAX_RETRIES})`);
      retryInitialization();
    } else {
      console.log('Telegram Monitor: Max retries reached, waiting for next check interval');
    }
  }
}

// 重试初始化
function retryInitialization() {
  if (retryCount < MAX_RETRIES) {
    console.log(`Telegram Monitor: Scheduling retry ${retryCount + 1}/${MAX_RETRIES} in ${RETRY_INTERVAL/1000}s`);
    retryCount++;
    setTimeout(() => {
      console.log('Telegram Monitor: Executing scheduled retry');
      initMonitor();
    }, RETRY_INTERVAL);
  }
}

// 启动监控
chrome.storage.sync.get(['monitorActive'], function(result) {
  console.log('Telegram Monitor: Checking initial monitor status');
  isMonitoringActive = result.monitorActive || false;
  console.log('Telegram Monitor: Initial monitor status:', isMonitoringActive);
  
  if (isMonitoringActive) {
    console.log('Telegram Monitor: Starting monitor automatically');
    initMonitor();
  } else {
    console.log('Telegram Monitor: Monitor not active, waiting for activation');
  }
});

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Telegram Monitor: Received message:', request);
  
  if (request.type === 'toggleMonitor') {
    console.log('Telegram Monitor: Toggle monitor request received, new status:', request.active);
    isMonitoringActive = request.active;
    
    if (isMonitoringActive) {
      console.log('Telegram Monitor: Starting monitor from popup request');
      initMonitor();
    } else {
      console.log('Telegram Monitor: Stopping monitor from popup request');
      if (observer) {
        observer.disconnect();
        observer = null;
        isMonitoring = false;
      }
    }
    sendResponse({ success: true });
  }
});

// 添加心跳检测
function heartbeat() {
  const now = Date.now();
  const timeSinceLastHeartbeat = now - lastHeartbeat;
  console.log('Telegram Monitor: Heartbeat check:', {
    timeSinceLastHeartbeat: timeSinceLastHeartbeat / 1000,
    isMonitoring,
    isMonitoringActive
  });

  // 如果超过2分钟没有心跳，重新初始化
  if (timeSinceLastHeartbeat > 120000) {
    console.log('Telegram Monitor: Heartbeat missed, reinitializing...');
    initMonitor();
  }
  
  lastHeartbeat = now;
}

setInterval(heartbeat, HEARTBEAT_INTERVAL);

// 添加网络状态监控
window.addEventListener('online', () => {
  console.log('Telegram Monitor: Network connected');
  if (isMonitoringActive) {
    console.log('Telegram Monitor: Reinitializing after network recovery');
    initMonitor();
  }
});

window.addEventListener('offline', () => {
  console.log('Telegram Monitor: Network disconnected');
});

// 添加定期完整扫描
const FULL_SCAN_INTERVAL = 300000; // 5分钟

setInterval(async () => {
  if (isMonitoringActive && !document.hidden) {
    console.log('Telegram Monitor: Performing periodic full scan');
    await scanMessages();
  }
}, FULL_SCAN_INTERVAL);

// 改进监控状态检查
function checkMonitorStatus() {
  const now = Date.now();
  console.log('Telegram Monitor: Status check:', {
    isMonitoring,
    isMonitoringActive,
    isInitializing,
    observerActive: observer !== null,
    timeSinceLastCheck: (now - lastCheckTime) / 1000,
    timeSinceLastHeartbeat: (now - lastHeartbeat) / 1000,
    time: new Date().toLocaleString()
  });

  // 检查 Telegram Web 连接状态
  const connectionIndicator = document.querySelector('.connection-status');
  if (connectionIndicator) {
    console.log('Telegram Monitor: Telegram connection status:', connectionIndicator.textContent);
  }

  lastCheckTime = now;

  if (isMonitoringActive && (!isMonitoring || !observer)) {
    console.log('Telegram Monitor: Monitor needs restart');
    initMonitor();
  }
}

// 添加页面可见性监听（在文件末尾添加）
document.addEventListener('visibilitychange', () => {
  console.log('Telegram Monitor: Page visibility changed:', {
    isVisible: !document.hidden,
    time: new Date().toLocaleString()
  });

  if (!document.hidden && isMonitoringActive) {
    // 页面变为可见时重新检查监控状态
    checkMonitorStatus();
  }
});

// 修改定期检查间隔（替换原有的 setInterval）
setInterval(() => {
  if (!checkExtensionContext()) return;
  
  if (isMonitoringActive) {
    checkMonitorStatus();
    if (!isMonitoring && !isInitializing) {
      initMonitor();
    }
  }
}, 30000); // 每30秒检查一次

// 监听来自 background 的音频播放请求
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'playSound') {
    console.log('Telegram Monitor: Attempting to play sound, user interaction status:', hasUserInteracted);
    
    try {
      if (!hasUserInteracted) {
        console.log('Telegram Monitor: No user interaction yet, sound will be played after interaction');
        return;
      }

      // 确保音频对象存在
      if (!audio) {
        audio = new Audio(chrome.runtime.getURL('notification.mp3'));
        audio.volume = 0.5;
      }

      // 创建新的音频实例以确保每次都播放
      const soundInstance = new Audio(chrome.runtime.getURL('notification.mp3'));
      soundInstance.volume = 0.5;
      
      soundInstance.play()
        .then(() => {
          console.log('Telegram Monitor: Sound played successfully');
        })
        .catch(error => {
          console.error('Telegram Monitor: Error playing sound:', error);
          // 尝试使用系统通知作为后备
          if (Notification.permission === 'granted') {
            new Notification('New Message Alert', {
              silent: false,
              requireInteraction: false,
              tag: 'sound-notification'
            });
          }
        });
    } catch (error) {
      console.error('Telegram Monitor: Error in sound playback:', error);
    }
  }
});

// 请求通知权限
if (Notification.permission !== 'granted') {
  Notification.requestPermission();
}

// 添加更多的用户交互事件监听
['click', 'keydown', 'mousedown', 'touchstart'].forEach(eventType => {
  document.addEventListener(eventType, () => {
    if (!hasUserInteracted) {
      console.log('Telegram Monitor: User interaction detected');
      hasUserInteracted = true;
      // 预加载音频
      audio = new Audio(chrome.runtime.getURL('notification.mp3'));
      audio.load(); // 预加载音频
      audio.volume = 0.5; // 设置更大的音量
    }
  }, { once: true });
});

// 在页面加载时重置状态
window.addEventListener('load', () => {
  console.log('Telegram Monitor: Page loaded, initializing state');
  chrome.runtime.sendMessage({ type: 'initializeState' }, response => {
    if (response.success) {
      console.log('Telegram Monitor: State initialized successfully');
    }
  });
});

// 添加扩展状态检查
function checkExtensionContext() {
  if (!chrome.runtime) {
    console.log('Telegram Monitor: Extension context lost, reloading page...');
    window.location.reload();
    return false;
  }
  return true;
}

// 添加扩展状态恢复检查
let recoveryAttempts = 0;
const MAX_RECOVERY_ATTEMPTS = 3;
const RECOVERY_INTERVAL = 5000;

function attemptRecovery() {
  if (recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
    console.log('Telegram Monitor: Max recovery attempts reached');
    return;
  }

  recoveryAttempts++;
  console.log(`Telegram Monitor: Recovery attempt ${recoveryAttempts}`);

  setTimeout(() => {
    if (chrome.runtime) {
      console.log('Telegram Monitor: Extension context restored');
      recoveryAttempts = 0;
      initMonitor();
    } else {
      attemptRecovery();
    }
  }, RECOVERY_INTERVAL);
}

// 修改 URL 变化检测部分
const urlCheckInterval = setInterval(() => {
  const newUrl = window.location.href;
  if (newUrl !== currentUrl) {
    console.log('Telegram Monitor: URL changed, reinitializing monitor');
    currentUrl = newUrl;
    if (isMonitoringActive) {
      initMonitor();
    }
  }
}, 1000);
