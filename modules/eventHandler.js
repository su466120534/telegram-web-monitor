// 事件处理模块
const EventHandler = {
  // 用户交互相关
  setupUserInteractionListeners() {
    // 主要的点击事件监听
    document.addEventListener('click', () => {
      if (!window.hasUserInteracted) {
        window.ErrorHandler.Logger.info('User interaction detected');
        this.initAudio();
      }
    }, { once: true });

    // 其他交互事件监听
    ['keydown', 'mousedown', 'touchstart'].forEach(eventType => {
      document.addEventListener(eventType, () => {
        if (!window.hasUserInteracted) {
          window.ErrorHandler.Logger.info('User interaction detected via', eventType);
          this.initAudio();
        }
      }, { once: true });
    });
  },

  // 页面状态相关
  setupPageStateListeners() {
    // 页面可见性变化
    document.addEventListener('visibilitychange', () => {
      window.ErrorHandler.Logger.info('Page visibility changed:', {
        isVisible: !document.hidden,
        time: new Date().toLocaleString()
      });

      if (!document.hidden && window.isMonitoringActive) {
        window.StateManager.checkState();
      }
    });

    // 页面加载完成
    window.addEventListener('load', () => {
      window.ErrorHandler.Logger.info('Page loaded, initializing state');
      chrome.runtime.sendMessage({ type: 'initializeState' }, response => {
        if (response?.success) {
          window.ErrorHandler.Logger.info('State initialized successfully');
        }
      });
    });

    // 网络状态变化
    window.addEventListener('online', () => {
      window.ErrorHandler.Logger.info('Network connected');
      if (window.isMonitoringActive) {
        window.ErrorHandler.Logger.info('Reinitializing after network recovery');
        window.initMonitor();
      }
    });

    window.addEventListener('offline', () => {
      window.ErrorHandler.Logger.info('Network disconnected');
    });
  },

  // 音频初始化
  initAudio() {
    window.hasUserInteracted = true;
    if (!window.audio) {
      window.audio = new Audio(chrome.runtime.getURL('notification.mp3'));
      window.audio.load();
      window.audio.volume = 0.5;
    }
  },

  // 设置所有定时器
  setupIntervals() {
    // URL 检查
    setInterval(() => {
      const newUrl = window.location.href;
      if (newUrl !== window.currentUrl) {
        window.ErrorHandler.Logger.info('URL changed, reinitializing monitor');
        window.currentUrl = newUrl;
        if (window.isMonitoringActive) {
          window.initMonitor();
        }
      }
    }, 1000);

    // 心跳检查
    setInterval(() => window.StateManager.heartbeat(), window.HEARTBEAT_INTERVAL);

    // 定期完整扫描
    setInterval(async () => {
      if (window.isMonitoringActive && !document.hidden) {
        window.ErrorHandler.Logger.info('Performing periodic full scan');
        await window.MessageHandler.processMessages(
          document.querySelectorAll(window.MessageHandler.selectors.messages.join(','))
        );
      }
    }, window.FULL_SCAN_INTERVAL);

    // 状态检查
    setInterval(() => {
      window.ErrorHandler.withContext(async () => {
        if (window.isMonitoringActive) {
          window.StateManager.checkState();
        }
      }, 'periodicCheck');
    }, 30000);
  },

  // 设置消息监听器
  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      window.ErrorHandler.Logger.info('Message received:', request);

      switch (request.type) {
        case 'resetExtension':
          window.StateManager.reset();
          sendResponse({ success: true });
          break;

        case 'toggleMonitor':
          window.StateManager.setMonitoringState(request.active);
          sendResponse({ success: true });
          break;

        case 'playSound':
          this.handleSoundRequest();
          sendResponse({ success: true });
          break;
      }
    });
  },

  // 处理声音请求
  handleSoundRequest() {
    window.ErrorHandler.Logger.info('Sound request received, user interaction status:', window.hasUserInteracted);
    
    try {
      if (!window.hasUserInteracted) {
        window.ErrorHandler.Logger.info('No user interaction yet, sound will be played after interaction');
        return;
      }

      // 创建新的音频实例以确保每次都播放
      const soundInstance = new Audio(chrome.runtime.getURL('notification.mp3'));
      soundInstance.volume = 0.5;
      
      soundInstance.play()
        .then(() => {
          window.ErrorHandler.Logger.info('Sound played successfully');
        })
        .catch(error => {
          window.ErrorHandler.Logger.error('Error playing sound:', error);
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
      window.ErrorHandler.Logger.error('Error in sound playback:', error);
    }
  },

  // 初始化所有事件监听器
  async init() {
    try {
      // 请求通知权限
      if (Notification.permission !== 'granted') {
        await Notification.requestPermission();
      }

      this.setupUserInteractionListeners();
      this.setupPageStateListeners();
      this.setupMessageListeners();
      this.setupIntervals();

      window.ErrorHandler.Logger.info('Event handlers initialized');
    } catch (error) {
      window.ErrorHandler.Logger.error('Error initializing event handlers:', error);
    }
  }
};

// 导出模块
window.EventHandler = EventHandler;

// 初始化事件处理器
EventHandler.init().catch(error => {
  window.ErrorHandler.Logger.error('Failed to initialize event handlers:', error);
}); 