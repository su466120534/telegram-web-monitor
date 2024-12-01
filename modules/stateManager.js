// 状态管理模块
const StateManager = {
  // 状态检查
  checkState() {
    const now = Date.now();
    if (window.isMonitoringActive) {
      window.ErrorHandler.Logger.debug('Status check:', {
        isMonitoring: window.isMonitoring,
        isMonitoringActive: window.isMonitoringActive,
        isInitializing: window.isInitializing,
        observerActive: window.observer !== null,
        timeSinceLastCheck: (now - window.lastCheckTime) / 1000,
        processedMessagesCount: window.processedMessages.size
      });

      // 检查 Telegram Web 连接状态
      const connectionIndicator = document.querySelector('.connection-status');
      if (connectionIndicator) {
        window.ErrorHandler.Logger.debug('Telegram connection status:', connectionIndicator.textContent);
      }

      window.lastCheckTime = now;
      this.checkMonitorHealth();
    }
  },

  // 检查监控健康状态
  checkMonitorHealth() {
    if (window.isMonitoringActive && (!window.isMonitoring || !window.observer)) {
      window.ErrorHandler.Logger.info('Monitor needs restart');
      window.processedMessages.clear();
      window.lastProcessedTime = Date.now();
      window.initMonitor();
    }
  },

  // 心跳检查
  heartbeat() {
    const now = Date.now();
    const timeSinceLastHeartbeat = now - window.lastHeartbeat;
    
    if (window.isMonitoringActive && window.isMonitoring) {
      window.ErrorHandler.Logger.debug('Heartbeat check:', {
        timeSinceLastHeartbeat: timeSinceLastHeartbeat / 1000,
        isMonitoring: window.isMonitoring,
        isMonitoringActive: window.isMonitoringActive
      });

      if (timeSinceLastHeartbeat > 120000) {
        window.ErrorHandler.Logger.info('Heartbeat missed, reinitializing...');
        window.processedMessages.clear();
        window.lastProcessedTime = now;
        window.initMonitor();
      }
    }
    
    window.lastHeartbeat = now;
  },

  // 重置状态
  reset() {
    window.ErrorHandler.Logger.info('Resetting extension state...');
    
    // 清理定时器
    if (this._checkIntervals) {
      this._checkIntervals.forEach(clearInterval);
      this._checkIntervals = [];
    }
    this._heartbeatInterval = null;
    this._stateCheckInterval = null;
    this._cleanupInterval = null;
    
    // 清理观察器
    if (window.observer) {
      window.observer.disconnect();
      window.observer = null;
    }
    
    // 重置状态
    window.isMonitoring = false;
    window.isMonitoringActive = false;
    window.isInitializing = false;
    window.initialScanDone = false;
    window.lastProcessedTime = Date.now();
    window.retryCount = 0;
    window.recoveryAttempts = 0;
    window.processedMessages.clear();
    
    window.ErrorHandler.Logger.info('Extension state reset complete');
  },

  // 更新监控状态
  setMonitoringState(active) {
    window.isMonitoringActive = active;
    window.ErrorHandler.Logger.info('Monitor state updated:', { active });
    
    if (active) {
      window.initMonitor();
    } else if (window.observer) {
      window.observer.disconnect();
      window.observer = null;
      window.isMonitoring = false;
    }
  },

  // 保存状态到存储
  async saveState() {
    try {
      await chrome.storage.sync.set({
        monitorActive: window.isMonitoringActive,
        lastProcessedTime: window.lastProcessedTime
      });
      window.ErrorHandler.Logger.info('State saved successfully');
    } catch (error) {
      window.ErrorHandler.Logger.error('Error saving state:', error);
    }
  },

  // 从存储加载状态
  async loadState() {
    try {
      const state = await chrome.storage.sync.get(['monitorActive', 'lastProcessedTime']);
      window.isMonitoringActive = state.monitorActive || false;
      window.lastProcessedTime = state.lastProcessedTime || Date.now();
      window.ErrorHandler.Logger.info('State loaded:', state);
      return state;
    } catch (error) {
      window.ErrorHandler.Logger.error('Error loading state:', error);
      return { monitorActive: false, lastProcessedTime: Date.now() };
    }
  },

  // 初始化状态
  async init() {
    // 防止重复初始化
    if (this._initialized) {
      window.ErrorHandler.Logger.debug('State manager already initialized');
      return;
    }

    await this.loadState();
    if (window.isMonitoringActive) {
      window.initMonitor();
    }
    
    // 只在第一次初始化时设置检查
    this.setupStateChecks();
    this._initialized = true;
    window.ErrorHandler.Logger.info('State manager initialized');
  },

  // 设置定期状态检查
  setupStateChecks() {
    // 清除可能存在的旧定时器
    if (this._checkIntervals) {
      this._checkIntervals.forEach(interval => {
        clearInterval(interval);
      });
    }
    this._checkIntervals = [];

    // 设置新的定时器，但要避免重复设置
    if (!this._heartbeatInterval) {
      this._heartbeatInterval = setInterval(() => {
        if (window.isMonitoringActive && window.isMonitoring) {
          this.heartbeat();
        }
      }, window.HEARTBEAT_INTERVAL);
      this._checkIntervals.push(this._heartbeatInterval);
    }

    if (!this._stateCheckInterval) {
      this._stateCheckInterval = setInterval(() => {
        if (window.isMonitoringActive) {
          this.checkState();
        }
      }, 30000);
      this._checkIntervals.push(this._stateCheckInterval);
    }

    if (!this._cleanupInterval) {
      this._cleanupInterval = setInterval(() => {
        if (window.isMonitoringActive) {
          this.cleanupOldMessages();
        }
      }, 3600000);
      this._checkIntervals.push(this._cleanupInterval);
    }

    // 修改定期扫描的间隔和条件
    if (!this._scanInterval) {
      this._scanInterval = setInterval(() => {
        // 只在以下条件都满足时才扫描：
        // 1. 监控激活
        // 2. 页面可见
        // 3. 距离上次扫描至少5分钟
        // 4. 有新消息（通过DOM变化检测）
        if (window.isMonitoringActive && 
            !document.hidden && 
            this.shouldScan()) {
          window.ErrorHandler.Logger.info('Starting periodic scan');
          window.MessageHandler.processMessages(
            document.querySelectorAll(window.MessageHandler.selectors.messages.join(','))
          );
        }
      }, 300000); // 改为5分钟
      this._checkIntervals.push(this._scanInterval);
    }
  },

  // 添加消息清理方法
  cleanupOldMessages() {
    const now = Date.now();
    const ONE_HOUR = 3600000; // 1小时的毫秒数
    
    window.processedMessages.clear();
    window.ErrorHandler.Logger.debug('Cleaned up old messages');
  },

  // 添加新消息检查方法
  hasNewMessages() {
    const lastScanTime = this._lastScanTime || 0;
    const now = Date.now();
    
    // 如果距离上次扫描不到1分钟，跳过
    if (now - lastScanTime < 60000) {
      return false;
    }
    
    this._lastScanTime = now;
    return true;
  },

  // 添加扫描判断方法
  shouldScan() {
    const now = Date.now();
    const lastScan = this._lastScanTime || 0;
    const messageCount = document.querySelectorAll(
      window.MessageHandler.selectors.messages.join(',')
    ).length;

    // 如果消息数量变化或者距离上次扫描超过5分钟
    if (messageCount !== this._lastMessageCount || 
        now - lastScan >= 300000) {
      this._lastScanTime = now;
      this._lastMessageCount = messageCount;
      return true;
    }
    return false;
  },

  // 添加销毁方法
  destroy() {
    this.reset();
    this._initialized = false;
  }
};

// 导出模块
window.StateManager = StateManager;

// 移除这部分，让 content.js 来控制初始化
// StateManager.init().then(() => {
//   StateManager.setupStateChecks();
// }); 