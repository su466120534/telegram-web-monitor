// 存储匹配的消息
let matchedMessages = [];
let unreadCount = 0;

// 初始化函数
function initializeState() {
  matchedMessages = [];
  unreadCount = 0;
  chrome.action.setBadgeText({ text: '' });
}

// 在扩展启动时初始化状态
initializeState();

// 播放提示音
async function playNotificationSound(tabId) {
  try {
    console.log('Telegram Monitor BG: Requesting sound playback');
    
    // 发送消息给 content script 播放音频
    await chrome.tabs.sendMessage(tabId, {
      type: 'playSound'
    });
  } catch (error) {
    console.error('Telegram Monitor BG: Error playing sound:', error);
  }
}

// 显示系统通知
async function showSystemNotification(options) {
  try {
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: 'eye_icon_48.png',
      ...options
    });
  } catch (error) {
    console.error('Telegram Monitor BG: Error showing notification:', error);
  }
}

// 更新徽章
function updateBadge() {
  const count = unreadCount > 0 ? unreadCount.toString() : '';
  chrome.action.setBadgeText({ text: count });
  chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
}

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Telegram Monitor BG: Received message:', request);

  switch (request.type) {
    case 'showNotification':
      // 显示系统通知
      showSystemNotification(request.options)
        .then(() => {
          // 播放提示音
          if (sender.tab?.id) {
            return playNotificationSound(sender.tab.id);
          }
        })
        .catch(console.error);

      // 更新未读消息计数
      if (!request.isBatchScan) {
        unreadCount++;
        updateBadge();
      }

      // 添加到匹配消息列表
      matchedMessages.push({
        text: request.options.message,
        timestamp: Date.now()
      });

      sendResponse({ success: true });
      return true;

    case 'getMessages':
      sendResponse({ messages: matchedMessages });
      return false;

    case 'clearMessages':
      matchedMessages = [];
      unreadCount = 0;
      updateBadge();
      sendResponse({ success: true });
      return false;

    case 'markAsRead':
      if (unreadCount > 0) {
        unreadCount--;
        updateBadge();
      }
      sendResponse({ success: true });
      return false;

    case 'initializeState':
      initializeState();
      sendResponse({ success: true });
      return false;

    case 'resetExtension':
      console.log('Telegram Monitor BG: Resetting extension...');
      
      // 清除所有消息
      matchedMessages = [];
      unreadCount = 0;
      
      // 清除徽章
      chrome.action.setBadgeText({ text: '' });
      
      console.log('Telegram Monitor BG: Extension reset complete');
      sendResponse({ success: true });
      return false;
  }
});

// 监听通知点击
chrome.notifications.onClicked.addListener((notificationId) => {
  console.log('Telegram Monitor BG: Notification clicked:', notificationId);
});
