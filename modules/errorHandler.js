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

  // 添加 Telegram 内部错误过滤
  isTelegramInternalError(error) {
    const internalPatterns = [
      'superMessagePort',
      'VAPID key',
      'WindowClient',
      'MessagePort',
      'cancelling all downloads',
      'window connected',
      'window disconnected'
    ];

    if (error instanceof Error) {
      return internalPatterns.some(pattern => 
        error.message.includes(pattern) || error.stack?.includes(pattern)
      );
    } else if (typeof error === 'string') {
      return internalPatterns.some(pattern => error.includes(pattern));
    }
    return false;
  },

  // 日志处理方法
  Logger: {
    // 添加调试模式标志
    debugMode: false, // 默认关闭调试模式

    info(message, data = null) {
      // 过滤 Telegram 内部消息
      if (this.shouldLog(message, data)) {
        const logMessage = `Telegram Monitor: ${message}`;
        data ? console.log(logMessage, data) : console.log(logMessage);
      }
    },

    error(message, error = null) {
      // 过滤 Telegram 内部错误
      if (error && ErrorHandler.isTelegramInternalError(error)) {
        return;
      }
      
      if (error?.message === 'Extension context invalidated') {
        this.info(message, error);
      } else {
        const logMessage = `Telegram Monitor: ${message}`;
        error ? console.error(logMessage, error) : console.error(logMessage);
      }
    },

    debug(message, data = null) {
      if (this.debugMode && this.shouldLog(message, data)) {
        const logMessage = `Telegram Monitor: ${message}`;
        data ? console.debug(logMessage, data) : console.debug(logMessage);
      }
    },

    warn(message, data = null) {
      if (this.shouldLog(message, data)) {
        const logMessage = `Telegram Monitor: ${message}`;
        data ? console.warn(logMessage, data) : console.warn(logMessage);
      }
    },

    // 添加日志过滤方法
    shouldLog(message, data) {
      const internalPatterns = [
        'SW',
        'VAPID',
        'WindowClient',
        'MessagePort',
        'downloads',
        'window connected',
        'window disconnected'
      ];

      // 检查消息
      if (internalPatterns.some(pattern => message.includes(pattern))) {
        return false;
      }

      // 检查数据
      if (data && typeof data === 'object') {
        const dataString = JSON.stringify(data);
        if (internalPatterns.some(pattern => dataString.includes(pattern))) {
          return false;
        }
      }

      return true;
    },

    // 添加设置调试模式的方法
    setDebugMode(enabled) {
      this.debugMode = enabled;
      this.info(`Debug mode ${enabled ? 'enabled' : 'disabled'}`);
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
        // 使用普通日志记录上下文失效
        console.log(`Telegram Monitor: Context invalidated in ${context}`);
        
        // 如果是观察器错误，不需要重复恢复
        if (context === 'mutationObserver') {
          return null;
        }
        
        // 其他情况尝试恢复
        this.scheduleRecovery();
      } else {
        // 其他错误使用 debug 级别记录，避免控制台出现太多错误
        this.Logger.debug(`Error in ${context}:`, error);
      }
      return null;
    }
  }
};

// 导出模块
window.ErrorHandler = ErrorHandler;

// 初始化时设置调试模式（默认关闭）
ErrorHandler.Logger.setDebugMode(false); 