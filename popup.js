document.addEventListener('DOMContentLoaded', async function() {
  console.log('Telegram Monitor Popup: Initializing...');
  
  // 获取 DOM 元素并添加错误检查
  const keywordInput = document.getElementById('keywordInput');
  const addKeywordBtn = document.getElementById('addKeyword');
  const keywordList = document.getElementById('keywordList');
  const toggleMonitorBtn = document.getElementById('toggleMonitor');
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');

  // 检查必要的元素是否存在
  if (!keywordInput || !addKeywordBtn || !keywordList || !toggleMonitorBtn || !statusIndicator || !statusText) {
    console.error('Telegram Monitor Popup: Some required elements are missing');
    return;
  }

  // 加载关键词列表
  function loadKeywords() {
    console.log('Telegram Monitor Popup: Loading keywords...');
    chrome.storage.sync.get(['keywords'], function(result) {
      if (!keywordList) return;
      
      const keywords = result.keywords || [];
      console.log('Telegram Monitor Popup: Current keywords:', keywords);
      
      keywordList.innerHTML = '';
      keywords.forEach(function(keyword) {
        const div = document.createElement('div');
        div.className = 'keyword-item';
        div.innerHTML = `
          <span>${keyword}</span>
          <button class="delete-btn" data-keyword="${keyword}">×</button>
        `;
        keywordList.appendChild(div);
      });
    });
  }

  // 添加关键词
  function addKeyword() {
    if (!keywordInput) return;
    
    const keyword = keywordInput.value.trim();
    if (keyword) {
      console.log('Telegram Monitor Popup: Adding keyword:', keyword);
      chrome.storage.sync.get(['keywords'], function(result) {
        const keywords = result.keywords || [];
        if (!keywords.includes(keyword)) {
          keywords.push(keyword);
          chrome.storage.sync.set({ keywords: keywords }, function() {
            console.log('Telegram Monitor Popup: Keyword added successfully');
            loadKeywords();
            keywordInput.value = '';
          });
        } else {
          console.log('Telegram Monitor Popup: Keyword already exists');
        }
      });
    }
  }

  // 删除关键词
  if (keywordList) {
    keywordList.addEventListener('click', function(e) {
      if (e.target.classList.contains('delete-btn')) {
        const keyword = e.target.dataset.keyword;
        console.log('Telegram Monitor Popup: Removing keyword:', keyword);
        chrome.storage.sync.get(['keywords'], function(result) {
          const keywords = result.keywords || [];
          const newKeywords = keywords.filter(k => k !== keyword);
          chrome.storage.sync.set({ keywords: newKeywords }, function() {
            console.log('Telegram Monitor Popup: Keyword removed successfully');
            loadKeywords();
          });
        });
      }
    });
  }

  // 更新监控状态显示
  function updateMonitorStatus(isActive) {
    if (!statusIndicator || !statusText || !toggleMonitorBtn) return;
    
    console.log('Telegram Monitor Popup: Updating monitor status:', isActive);
    
    statusIndicator.style.backgroundColor = isActive ? '#4CAF50' : '#FF5252';
    statusText.textContent = isActive ? 'Monitoring Active' : 'Monitoring Stopped';
    toggleMonitorBtn.textContent = isActive ? 'Stop Monitor' : 'Start Monitor';
    if (isActive) {
      toggleMonitorBtn.classList.add('active');
    } else {
      toggleMonitorBtn.classList.remove('active');
    }
  }

  // 检查当前监控状态
  function checkMonitorStatus() {
    console.log('Telegram Monitor Popup: Checking monitor status...');
    chrome.storage.sync.get(['monitorActive'], function(result) {
      const isActive = result.monitorActive || false;
      console.log('Telegram Monitor Popup: Current monitor status:', isActive);
      updateMonitorStatus(isActive);
    });
  }

  // 切换监控状态
  async function toggleMonitor() {
    try {
      console.log('Telegram Monitor Popup: Toggling monitor...');
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        console.log('Telegram Monitor Popup: No active tab found');
        return;
      }

      const result = await chrome.storage.sync.get(['monitorActive']);
      const newStatus = !(result.monitorActive || false);
      
      console.log('Telegram Monitor Popup: Setting new status:', newStatus);
      await chrome.storage.sync.set({ monitorActive: newStatus });
      updateMonitorStatus(newStatus);
      
      if (tab.url && tab.url.includes('web.telegram.org')) {
        try {
          await chrome.tabs.sendMessage(tab.id, { 
            type: 'toggleMonitor',
            active: newStatus 
          });
          console.log('Telegram Monitor Popup: Message sent to content script');
        } catch (error) {
          console.log('Telegram Monitor Popup: Error sending message to content script:', error);
        }
      }
    } catch (error) {
      console.error('Telegram Monitor Popup: Error toggling monitor:', error);
    }
  }

  // 添加事件监听器
  if (addKeywordBtn) {
    addKeywordBtn.addEventListener('click', addKeyword);
    console.log('Telegram Monitor Popup: Add keyword button listener added');
  }

  if (keywordInput) {
    keywordInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        addKeyword();
      }
    });
    console.log('Telegram Monitor Popup: Keyword input listener added');
  }

  if (toggleMonitorBtn) {
    toggleMonitorBtn.addEventListener('click', toggleMonitor);
    console.log('Telegram Monitor Popup: Toggle monitor button listener added');
  }

  // 初始化
  console.log('Telegram Monitor Popup: Starting initialization...');
  loadKeywords();
  checkMonitorStatus();
  console.log('Telegram Monitor Popup: Initialization complete');

  // 添加 createClickableLinks 函数
  function createClickableLinks(text) {
    if (!text) return 'No content';
    
    // 匹配 URL 的正则表达式
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, url => `<a href="${url}" target="_blank" class="message-link">${url}</a>`);
  }

  // 修改 loadMessages 函数
  async function loadMessages() {
    console.log('Telegram Monitor Popup: Loading messages...');
    const messageList = document.getElementById('messageList');
    if (!messageList) return;

    try {
      // 获取消息
      const response = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'getMessages' }, resolve);
      });

      console.log('Telegram Monitor Popup: Got messages response:', response);

      if (!response || !response.messages) {
        console.log('Telegram Monitor Popup: No messages available');
        messageList.innerHTML = '<div class="message">No matched messages</div>';
        return;
      }

      // 清空现有消息
      messageList.innerHTML = '';
      
      if (response.messages.length === 0) {
        messageList.innerHTML = '<div class="message">No matched messages</div>';
        return;
      }

      // 渲染消息
      response.messages.reverse().forEach((msg, index) => {
        const div = document.createElement('div');
        div.className = `message ${msg.read ? '' : 'unread'}`;
        
        // 使用消息的实际属性
        const messageContent = msg.text || msg.message || 'No content';
        const messageTime = new Date(msg.timestamp).toLocaleString();
        const messageKeyword = msg.keyword ? `Matched: "${msg.keyword}"` : '';
        
        div.innerHTML = `
          <div class="message-title">🔍 ${messageKeyword}</div>
          <div class="message-content">${createClickableLinks(messageContent)}</div>
          <div class="message-time">${messageTime}</div>
        `;
        
        // 添加点击事件处理
        div.addEventListener('click', () => {
          chrome.runtime.sendMessage({ 
            type: 'markAsRead', 
            messageId: response.messages.length - 1 - index 
          });
          div.classList.remove('unread');
        });
        
        messageList.appendChild(div);
      });

      console.log('Telegram Monitor Popup: Messages rendered successfully');
    } catch (error) {
      console.error('Telegram Monitor Popup: Error loading messages:', error);
      messageList.innerHTML = '<div class="message">Error loading messages</div>';
    }
  }

  // 初始化时立即加载消息
  loadMessages();

  // 定期刷新消息列表（可选）
  setInterval(loadMessages, 2000); // 每2秒更新一次

  // 添加清空按钮功能
  const clearMessagesBtn = document.getElementById('clearMessages');
  if (clearMessagesBtn) {
    clearMessagesBtn.addEventListener('click', function() {
      console.log('Telegram Monitor Popup: Clearing all messages');
      chrome.runtime.sendMessage({ type: 'clearMessages' }, response => {
        if (response.success) {
          // 清空消息列表显示
          const messageList = document.getElementById('messageList');
          if (messageList) {
            messageList.innerHTML = '<div class="message">No matched messages</div>';
          }
          console.log('Telegram Monitor Popup: Messages cleared successfully');
        }
      });
    });
  }

  // 添加重置功能
  const resetExtensionBtn = document.getElementById('resetExtension');
  if (resetExtensionBtn) {
    resetExtensionBtn.addEventListener('click', async function() {
      console.log('Telegram Monitor Popup: Resetting extension...');
      
      try {
        // 清除存储的关键词
        await chrome.storage.sync.clear();
        
        // 停止监控
        await chrome.storage.sync.set({ monitorActive: false });
        
        // 发送重置消息给 content script
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.url?.includes('web.telegram.org')) {
          await chrome.tabs.sendMessage(tab.id, { type: 'resetExtension' });
        }
        
        // 发送重置消息给 background script
        await chrome.runtime.sendMessage({ type: 'resetExtension' });
        
        // 重新加载插件页面
        window.location.reload();
        
        console.log('Telegram Monitor Popup: Extension reset complete');
      } catch (error) {
        console.error('Telegram Monitor Popup: Error resetting extension:', error);
      }
    });
  }
});
