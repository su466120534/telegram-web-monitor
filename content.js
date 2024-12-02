// 初始化全局变量
window.observer = null;
window.retryCount = 0;
window.MAX_RETRIES = 5;
window.RETRY_INTERVAL = 5000;
window.CHECK_INTERVAL = 60000;
window.HEARTBEAT_INTERVAL = 60000;
window.FULL_SCAN_INTERVAL = 300000;

window.isMonitoring = false;
window.isMonitoringActive = false;
window.isInitializing = false;
window.initialScanDone = false;
window.currentUrl = location.href;

window.hasUserInteracted = false;
window.audio = null;
window.lastCheckTime = Date.now();
window.lastHeartbeat = Date.now();
window.lastProcessedTime = Date.now();
window.processedMessages = new Set();
window.recoveryTimer = null;
window.recoveryAttempts = 0;

// 初始化监控函数
window.initMonitor = async function() {
  if (window.isMonitoring || window.isInitializing) {
    window.ErrorHandler.Logger.info('Monitor already running or initializing');
    return;
  }

  window.ErrorHandler.Logger.info('Starting monitor initialization...');
  window.isInitializing = true;
  window.retryCount = 0;
  
  try {
    // 等待页面加载
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 查找消息容器
    const containerSelectors = [
      '.chat-content', '.bubbles', '.messages-container', '.history',
      'div[role="main"]', '.message-list-wrapper', '.chat-container',
      '.messages-layout', 'div[class^="messages"]', '.chat-history',
      '.messages-list', '.dialog-messages', '.messages', '#message-list',
      '#chat-content'
    ];

    let chatContent = await findChatContainer(containerSelectors);
    if (!chatContent) {
      throw new Error('Chat content not found');
    }

    // 断开现有观察器
    if (window.observer) {
      window.observer.disconnect();
    }

    // 执行初始扫描
    const matchedMessages = await window.MessageHandler.processMessages(
      document.querySelectorAll(window.MessageHandler.selectors.messages.join(','))
    );
    window.ErrorHandler.Logger.info('Initial scan complete, matches found:', matchedMessages.length);

    // 设置新的观察器
    setupObserver(chatContent);

    window.isInitializing = false;
    window.isMonitoring = true;
    window.ErrorHandler.Logger.info('Monitor initialized successfully');
  } catch (error) {
    window.ErrorHandler.Logger.error('Error during initialization:', error);
    window.isInitializing = false;
    
    if (window.retryCount < window.MAX_RETRIES) {
      retryInitialization();
    }
  }
};

// 辅助函数：查找聊天容器
async function findChatContainer(selectors) {
  let retryAttempt = 0;
  const maxRetries = 3;
  
  while (retryAttempt < maxRetries) {
    for (const selector of selectors) {
      const container = document.querySelector(selector);
      if (container) {
        window.ErrorHandler.Logger.info('Found chat container:', selector);
        return container;
      }
    }
    
    retryAttempt++;
    window.ErrorHandler.Logger.info(`Container not found, retry ${retryAttempt}/${maxRetries}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return null;
}

// 修改观察器设置函数
function setupObserver(container) {
  window.observer = new MutationObserver((mutations) => {
    try {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // 查找消息内容
            const messageElements = node.querySelectorAll(
              window.MessageHandler.selectors.messages.join(',')
            );
            
            // 如果找到消息元素，处理每个消息
            if (messageElements.length > 0) {
              messageElements.forEach(messageElement => {
                const text = messageElement.textContent?.trim();
                if (text) {
                  window.MessageHandler.processMessage(text, messageElement)
                    .catch(error => {
                      if (!error.message.includes('Extension context invalidated')) {
                        console.error('Telegram Monitor: Error processing message:', error);
                      }
                    });
                }
              });
            } else if (node.matches(window.MessageHandler.selectors.messages.join(','))) {
              // 如果节点本身是消息元素
              const text = node.textContent?.trim();
              if (text) {
                window.MessageHandler.processMessage(text, node)
                  .catch(error => {
                    if (!error.message.includes('Extension context invalidated')) {
                      console.error('Telegram Monitor: Error processing message:', error);
                    }
                  });
              }
            }
          }
        }
      }
    } catch (error) {
      if (!error.message.includes('Extension context invalidated')) {
        console.error('Telegram Monitor: Error in mutation observer:', error);
      }
    }
  });

  window.observer.observe(container, {
    childList: true,
    subtree: true,
    characterData: true
  });
  
  window.ErrorHandler.Logger.info('Observer started');
}

// 辅助函数：重试初始化
function retryInitialization() {
  window.retryCount++;
  window.ErrorHandler.Logger.info(`Scheduling retry ${window.retryCount}/${window.MAX_RETRIES}`);
  setTimeout(window.initMonitor, window.RETRY_INTERVAL);
}

// 修改初始化逻辑
(async function initializeExtension() {
  try {
    console.log('Telegram Monitor: Starting initialization...');

    // 等待所有模块加载完成
    for (let i = 0; i < 10; i++) {
      if (window.ErrorHandler && window.StateManager && 
          window.EventHandler && window.MessageHandler) {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 检查必要的模块是否都已加载
    if (!window.ErrorHandler || !window.StateManager || 
        !window.EventHandler || !window.MessageHandler) {
      throw new Error('Required modules not loaded');
    }

    // 等待页面完全加载
    if (document.readyState !== 'complete') {
      await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
    }

    // 等待 Telegram Web 加载完成
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 初始化各个模块
    await window.StateManager.init();
    await window.EventHandler.init();

    // 激活监控并执行初始扫描
    window.isMonitoringActive = true;
    window.isMonitoring = false; // 确保重新初始化
    window.processedMessages.clear(); // 清除旧消息记录

    // 立即执行一次扫描
    const messages = document.querySelectorAll(
      window.MessageHandler.selectors.messages.join(',')
    );

    console.log('Telegram Monitor: Found messages:', messages.length);

    if (messages.length > 0) {
      const matchedMessages = await window.MessageHandler.processMessages(messages, true);
      console.log('Telegram Monitor: Initial scan found matches:', matchedMessages.length);
    }

    // 启动监控
    await window.initMonitor();
    
    console.log('Telegram Monitor: Extension initialized successfully');

  } catch (error) {
    console.error('Error initializing extension:', error);
    // 如果初始化失败，5秒后重试
    setTimeout(initializeExtension, 5000);
  }
})();

// 添加重新连接机制
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

function attemptReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log('Max reconnection attempts reached, reloading page...');
    window.location.reload();
    return;
  }

  reconnectAttempts++;
  console.log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
  
  // 清理现有状态
  if (window.observer) {
    window.observer.disconnect();
    window.observer = null;
  }
  window.isMonitoring = false;
  window.isInitializing = false;

  // 延迟重试初始化
  setTimeout(initializeExtension, 2000);
}

// 监听扩展连接状态
window.addEventListener('error', (event) => {
  if (event.error?.message?.includes('Extension context invalidated') ||
      event.error?.message?.includes('could not establish connection')) {
    attemptReconnect();
  }
});

// 修改 URL 变化检测部分
const urlCheckInterval = setInterval(() => {
  const newUrl = window.location.href;
  if (newUrl !== window.currentUrl) {
    window.ErrorHandler.Logger.info('URL changed:', {
      from: window.currentUrl,
      to: newUrl
    });
    window.currentUrl = newUrl;
    
    // 清理旧状态
    if (window.observer) {
      window.observer.disconnect();
      window.observer = null;
    }
    window.isMonitoring = false;
    window.processedMessages.clear();
    
    // 等待DOM更新后重新初始化
    setTimeout(() => {
      if (window.isMonitoringActive) {
        window.ErrorHandler.Logger.info('Reinitializing monitor after URL change');
        window.initMonitor();
      }
    }, 2000); // 给足够的时间让新页面加载
  }
}, 1000);


