// 错误处理模块
const ErrorHandler = {
  // 统一的错误日志输出
  log(error, context = '') {
    // 如果是扩展上下文失效错误，使用普通日志而不是错误日志
    if (error.message === 'Extension context invalidated') {
      console.log(`Telegram Monitor: Context invalidated${context ? ' in ' + context : ''}`);
    } else {
      console.error(`Telegram Monitor: Error${context ? ' in ' + context : ''}: `, error);
    }
  },

  // 处理扩展上下文失效错误
  handleExtensionContext(error, context = '') {
    if (error.message === 'Extension context invalidated') {
      // 使用普通日志记录恢复尝试
      console.log('Telegram Monitor: Extension context invalidated, attempting to recover...');
      
      // 清理现有状态
      if (window.observer) {
        window.observer.disconnect();
        window.observer = null;
      }
      window.isMonitoring = false;
      window.isInitializing = false;
      
      this.scheduleRecovery();
      return true;
    }
    
    // 只有非上下文失效错误才记录为错误
    if (!error.message.includes('Extension context invalidated')) {
      this.log(error, context);
    }
    return false;
  },

  // 调度恢复过程
  scheduleRecovery() {
    if (!window.recoveryTimer) {
      window.recoveryTimer = setTimeout(() => {
        window.recoveryTimer = null;
        this.attemptRecovery();
      }, 2000);
    }
  },

  // 尝试恢复
  attemptRecovery() {
    if (window.recoveryAttempts >= 3) {
      console.log('Telegram Monitor: Max recovery attempts reached, will reload page');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
      return;
    }

    window.recoveryAttempts = (window.recoveryAttempts || 0) + 1;
    console.log(`Telegram Monitor: Recovery attempt ${window.recoveryAttempts}`);

    if (chrome.runtime && chrome.storage) {
      console.log('Telegram Monitor: Extension context restored');
      window.recoveryAttempts = 0;
      window.initMonitor?.();
    } else {
      setTimeout(() => this.attemptRecovery(), 5000);
    }
  },

  // 日志处理方法
  Logger: {
    info(message, data = null) {
      const logMessage = `Telegram Monitor: ${message}`;
      data ? console.log(logMessage, data) : console.log(logMessage);
    },

    error(message, error = null) {
      const logMessage = `Telegram Monitor: ${message}`;
      error ? console.error(logMessage, error) : console.error(logMessage);
    },

    debug(message, data = null) {
      const logMessage = `Telegram Monitor: ${message}`;
      data ? console.debug(logMessage, data) : console.debug(logMessage);
    },

    warn(message, data = null) {
      const logMessage = `Telegram Monitor: ${message}`;
      data ? console.warn(logMessage, data) : console.warn(logMessage);
    }
  },

  // 添加 withContext 方法
  async withContext(action, context = '') {
    try {
      // 检查扩展上下文
      if (!chrome.runtime || !chrome.storage) {
        throw new Error('Extension context invalidated');
      }
      // 执行操作
      return await action();
    } catch (error) {
      // 处理错误
      if (error.message === 'Extension context invalidated') {
        this.Logger.info(`Context invalidated in ${context}, attempting recovery...`);
        this.scheduleRecovery();
      } else {
        this.Logger.error(`Error in ${context}:`, error);
      }
      return null;
    }
  }
};

// 导出模块
window.ErrorHandler = ErrorHandler; 