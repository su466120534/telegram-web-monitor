console.log('Telegram Monitor: Content script loaded at:', new Date().toLocaleString());

// 全局变量
let observer = null;
let retryCount = 0;
const MAX_RETRIES = 5;
const RETRY_INTERVAL = 3000;
const CHECK_INTERVAL = 60000;
let isMonitoring = false;
let lastProcessedMessage = null;
let initialScanDone = false;
let isInitializing = false;
let lastUrl = location.href;
let isMonitoringActive = false;
let audioContext = null;

// 获取关键词列表
async function getKeywords() {
  return new Promise(resolve => {
    chrome.storage.sync.get(['keywords'], function(result) {
      console.log('Telegram Monitor: Current keywords:', result.keywords);
      resolve(result.keywords || []);
    });
  });
}

// 显示通知
async function showNotification(text, messageInfo = null, isBatchScan = false) {
  try {
    console.log('Telegram Monitor: Attempting to show notification for:', text);
    
    const message = messageInfo ? 
      `Chat: ${messageInfo.chatTitle}\nFrom: ${messageInfo.sender}\nContent: ${text}` : 
      `Content: ${text}\nTime: ${new Date().toLocaleString()}`;

    const notificationOptions = {
      type: 'basic',
      title: 'Keyword Match Found',
      message: message,
      requireInteraction: true
    };

    chrome.runtime.sendMessage({
      type: 'showNotification',
      options: notificationOptions,
      isBatchScan: isBatchScan
    }, response => {
      if (chrome.runtime.lastError) {
        console.error('Telegram Monitor: Notification error:', chrome.runtime.lastError);
      } else {
        console.log('Telegram Monitor: Notification sent:', response);
      }
    });
  } catch (error) {
    console.error('Telegram Monitor: Error showing notification:', error);
  }
}

// 处理消息文本
async function processMessageText(text) {
  if (!isMonitoringActive || !text) {
    console.log('Telegram Monitor: Skipping message processing - monitoring inactive or empty text');
    return;
  }

  console.log('Telegram Monitor: Processing new message:', text.substring(0, 100));
  
  try {
    const keywords = await getKeywords();
    if (!keywords || !keywords.length) {
      console.log('Telegram Monitor: No keywords set');
      return;
    }

    console.log('Telegram Monitor: Checking against keywords:', keywords);
    for (const keyword of keywords) {
      if (text.toLowerCase().includes(keyword.toLowerCase())) {
        console.log('Telegram Monitor: Match found! Keyword:', keyword);
        console.log('Telegram Monitor: Matched message:', text);
        await showNotification(text);
        break;
      }
    }
  } catch (error) {
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

    return {
      chatTitle: chatTitle || 'Unknown Chat',
      sender: sender || 'Unknown Sender',
      timestamp: new Date().toLocaleString()
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
      console.log('Telegram Monitor: No keywords set, skipping scan');
      return [];
    }

    console.log('Telegram Monitor: Scanning with keywords:', keywords);

    const matchedMessages = new Set();
    let foundMessages = false;

    // 遍历所有可能的消息选择器
    for (const selector of messageSelectors) {
      const messages = document.querySelectorAll(selector);
      console.log(`Telegram Monitor: Found ${messages.length} messages with selector "${selector}"`);
      
      if (messages.length > 0) {
        foundMessages = true;
        messages.forEach(message => {
          const text = message.textContent.trim();
          if (text) {
            console.log('Telegram Monitor: Checking message:', text.substring(0, 100));
            const matched = keywords.some(keyword => 
              text.toLowerCase().includes(keyword.toLowerCase())
            );
            if (matched) {
              const messageInfo = extractMessageInfo(message);
              matchedMessages.add(JSON.stringify({
                text,
                info: messageInfo
              }));
              console.log('Telegram Monitor: Found matching message:', text);
            }
          }
        });
      }
    }

    const results = Array.from(matchedMessages).map(msg => JSON.parse(msg));
    console.log('Telegram Monitor: Scan complete, found matches:', results.length);
    
    // 如果找到匹配的消息，发送通知
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
    console.log('Telegram Monitor: Waiting for page load...');
    await new Promise(resolve => setTimeout(resolve, 2000));

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
      'div[class^="messages"]'
    ];

    console.log('Telegram Monitor: Searching for chat container...');
    let chatContent = null;
    for (const selector of containerSelectors) {
      chatContent = document.querySelector(selector);
      if (chatContent) {
        console.log('Telegram Monitor: Found chat container:', selector);
        break;
      }
    }

    if (!chatContent) {
      console.log('Telegram Monitor: No chat container found, will retry');
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
      console.log('Telegram Monitor: Detected DOM mutations:', mutations.length);
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const text = node.textContent.trim();
            if (text) {
              console.log('Telegram Monitor: New message detected:', text.substring(0, 100));
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
    if (retryCount < MAX_RETRIES) {
      console.log('Telegram Monitor: Will retry initialization');
      retryInitialization();
    }
  }
}

// 重试初始化
function retryInitialization() {
  if (retryCount < MAX_RETRIES) {
    console.log('Telegram Monitor: Retrying initialization...');
    retryCount++;
    setTimeout(initMonitor, RETRY_INTERVAL);
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

// 定期检查监控状态
setInterval(() => {
  if (isMonitoringActive && !isMonitoring && !isInitializing) {
    initMonitor();
  }
}, CHECK_INTERVAL);

// 监听来自 background 的音频播放请求
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'playSound') {
    console.log('Telegram Monitor: Attempting to play sound');
    
    try {
      // 使用 Web Audio API
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      // 创建振荡器
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      // 配置音频
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(500, audioContext.currentTime + 0.2);

      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

      // 连接节点
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // 播放声音
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);

      console.log('Telegram Monitor: Sound played successfully');
    } catch (error) {
      console.error('Telegram Monitor: Error playing sound:', error);
      
      // 如果 Web Audio API 失败，尝试使用通知
      try {
        // 发送无声通知
        new Notification('New Message Alert', {
          silent: false,
          requireInteraction: false,
          tag: 'sound-notification'
        });
      } catch (notificationError) {
        console.error('Telegram Monitor: Notification fallback failed:', notificationError);
      }
    }
  }
});

// 请求通知权限
if (Notification.permission !== 'granted') {
  Notification.requestPermission();
}
