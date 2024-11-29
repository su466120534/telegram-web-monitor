document.addEventListener('DOMContentLoaded', function() {
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

  // 加载消息列表
  const messageList = document.getElementById('messageList');
  if (messageList) {
    chrome.runtime.sendMessage({ type: 'getMessages' }, response => {
      if (!response || !response.messages) return;
      
      messageList.innerHTML = '';
      
      if (response.messages.length === 0) {
        messageList.innerHTML = '<div class="message">No matched messages</div>';
        return;
      }

      response.messages.reverse().forEach((msg, index) => {
        const div = document.createElement('div');
        div.className = `message ${msg.read ? '' : 'unread'}`;
        div.innerHTML = `
          <div class="message-title">${msg.title}</div>
          <div class="message-time">${msg.timestamp}</div>
          <div class="message-content">${msg.message}</div>
        `;
        
        div.addEventListener('click', () => {
          chrome.runtime.sendMessage({ 
            type: 'markAsRead', 
            messageId: response.messages.length - 1 - index 
          });
          div.classList.remove('unread');
        });
        
        messageList.appendChild(div);
      });
    });
  }

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
});
