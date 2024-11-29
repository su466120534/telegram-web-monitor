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
function playNotificationSound() {
  try {
    console.log('Telegram Monitor BG: Requesting sound playback');
    
    // 发送消息给 content script 播放音频
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'playSound'
        });
      } else {
        // 如果没有活动标签，使用系统通知
        chrome.notifications.create('', {
          type: 'basic',
          title: 'New Message Alert',
          message: 'New matching message detected',
          iconUrl: chrome.runtime.getURL('eye_icon_48.png'),
          silent: false
        });
      }
    });
  } catch (error) {
    console.error('Telegram Monitor BG: Error in playNotificationSound:', error);
  }
}

// 创建通知
async function createNotification(options) {
  try {
    // 存储消息
    matchedMessages.push({
      title: options.title,
      message: options.message,
      timestamp: new Date().toLocaleString(),
      read: false
    });
    
    // 更新未读计数
    unreadCount = matchedMessages.filter(msg => !msg.read).length;
    
    // 更新插件图标上的数字
    updateBadge();

    // 播放提示音
    playNotificationSound();
    console.log('Telegram Monitor BG: Notification sound requested');

    return Promise.resolve({ success: true, messageId: matchedMessages.length - 1 });
  } catch (error) {
    console.error('Telegram Monitor BG: Error in createNotification:', error);
    return { success: false, error };
  }
}

// 更新徽章显示
function updateBadge() {
  const count = matchedMessages.filter(msg => !msg.read).length;
  chrome.action.setBadgeText({ 
    text: count > 0 ? count.toString() : '' 
  });
  chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
}

// 监听标签页更新
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('web.telegram.org')) {
    console.log('Telegram Monitor BG: Tab updated, reinitializing state');
    initializeState();
  }
});

// 获取未读消息
function getUnreadMessages() {
  return matchedMessages.filter(msg => !msg.read);
}

// 标记消息为已读
function markMessageAsRead(index) {
  if (matchedMessages[index]) {
    matchedMessages[index].read = true;
    unreadCount = getUnreadMessages().length;
    if (unreadCount === 0) {
      chrome.action.setBadgeText({ text: '' });
    } else {
      chrome.action.setBadgeText({ text: unreadCount.toString() });
    }
  }
}

// 清除所有消息
function clearAllMessages() {
  matchedMessages = [];
  unreadCount = 0;
  chrome.action.setBadgeText({ text: '' });
}

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Telegram Monitor BG: Received message:', request);

  switch (request.type) {
    case 'showNotification':
      createNotification(request.options)
        .then(result => {
          console.log('Telegram Monitor BG: Notification result:', result);
          sendResponse(result);
        })
        .catch(error => {
          console.error('Telegram Monitor BG: Error:', error);
          sendResponse({ success: false, error });
        });
      return true;

    case 'getMessages':
      console.log('Telegram Monitor BG: Sending messages:', matchedMessages);
      sendResponse({ messages: matchedMessages });
      return false;

    case 'markAsRead':
      markMessageAsRead(request.messageId);
      sendResponse({ success: true });
      return false;

    case 'clearMessages':
      clearAllMessages();
      sendResponse({ success: true });
      return false;

    case 'initializeState':
      initializeState();
      sendResponse({ success: true });
      return false;
  }
});

// 监听通知点击
chrome.notifications.onClicked.addListener((notificationId) => {
  console.log('Telegram Monitor BG: Notification clicked:', notificationId);
});
