// 消息处理模块
const MessageHandler = {
  // 消息选择器
  selectors: {
    messages: [
      '.Message',                    // 主消息容器
      '.message',                    // 消息容器
      '.text-content',              // 文本内容
      '.message-content',           // 消息内容
      '.message-text',              // 消息文本
      '.text-entity',               // 文本实体
      '.message-text-content',      // 消息文本内容
      'div[class*="message"]',      // 动态类名的消息
      'div[class*="text"]',         // 动态类名的文本
      '.bubble'                     // 消息气泡
    ],
    sender: [
      '.sender-name',
      '.peer-title',
      '.name',
      '.from-name',
      '.message-author',
      '.author'
    ]
  },

  // 处理单条消息
  async processMessage(text, node = null, timestamp = Date.now()) {
    if (!text || !window.isMonitoringActive) {
      return null;
    }

    // 清理文本内容
    const cleanedText = this.cleanMessageText(text);
    if (!cleanedText) {
      return null;
    }

    // 检查是否已处理
    if (this.isMessageProcessed(cleanedText, timestamp)) {
      return null;
    }

    const keywords = await this.getKeywords();
    if (!keywords?.length) {
      return null;
    }

    const { matched, matchedKeyword } = await this.matchKeywords(cleanedText, keywords);
    if (!matched) {
      return null;
    }

    window.ErrorHandler.Logger.info('Match found:', {
      keyword: matchedKeyword,
      text: cleanedText.substring(0, 100)
    });

    const messageInfo = node ? this.extractMessageInfo(node) : null;
    const result = {
      text: cleanedText,
      info: messageInfo,
      matchedKeyword,
      timestamp
    };

    await this.notifyMatch(result);
    return result;
  },

  // 处理多条消息
  async processMessages(messages, isBatchScan = false) {
    const currentTime = Date.now();
    const matchedMessages = new Set();

    try {
      await window.ErrorHandler.withContext(async () => {
        if (isBatchScan) {
          await this.waitForDialogsLoad();
        }

        window.ErrorHandler.Logger.debug('Starting message scan:', {
          messageCount: messages.length,
          isBatchScan
        });

        // 获取所有消息元素
        const messageElements = Array.from(messages).reduce((acc, container) => {
          // 如果容器本身是消息元素，直接添加
          if (container.matches(this.selectors.messages.join(','))) {
            acc.push(container);
          }
          // 查找容器内的消息元素
          const messageContents = container.querySelectorAll(this.selectors.messages.join(','));
          if (messageContents.length > 0) {
            acc.push(...messageContents);
          }
          return acc;
        }, []);

        // 处理每个消息元素
        for (const messageElement of messageElements) {
          try {
            // 获取消息文本
            let text = messageElement.textContent?.trim();
            
            // 如果消息元素本身没有文本，尝试查找子元素
            if (!text) {
              const textElement = messageElement.querySelector('.text-content, .message-text, .text-entity');
              if (textElement) {
                text = textElement.textContent?.trim();
              }
            }

            if (!text) continue;

            // 清理文本内容
            const cleanedText = this.cleanMessageText(text);
            if (!cleanedText) continue;

            window.ErrorHandler.Logger.debug('Processing message:', {
              original: text.substring(0, 100),
              cleaned: cleanedText.substring(0, 100)
            });

            const result = await this.processMessage(cleanedText, messageElement, currentTime);
            if (result) {
              matchedMessages.add(JSON.stringify(result));
            }
          } catch (error) {
            if (error.message === 'Extension context invalidated') {
              throw error;
            }
            window.ErrorHandler.Logger.debug('Error processing message:', error);
            continue;
          }
        }

        window.ErrorHandler.Logger.info('Scan complete:', {
          scanned: messageElements.length,
          matched: matchedMessages.size,
          time: new Date().toLocaleString()
        });

        const results = Array.from(matchedMessages).map(msg => JSON.parse(msg));
        if (results.length > 0) {
          window.lastProcessedTime = currentTime;
        }

        return results;
      }, 'processMessages');

      return Array.from(matchedMessages).map(msg => JSON.parse(msg));
    } catch (error) {
      if (error.message === 'Extension context invalidated') {
        window.ErrorHandler.Logger.debug('Extension context lost during message processing');
        return [];
      }
      window.ErrorHandler.Logger.error('Error in batch message processing:', error);
      return [];
    }
  },

  // 匹配关键词
  async matchKeywords(text, keywords) {
    const normalizedText = text.toLowerCase();
    let matched = false;
    let matchedKeyword = '';

    // 先检查组合关键词
    for (const keyword of keywords) {
      if (keyword.includes(' ')) {
        const parts = keyword.split(' ').filter(k => k.trim());
        const allPartsMatch = parts.every(part => 
          normalizedText.includes(part.toLowerCase())
        );
        
        if (allPartsMatch) {
          matched = true;
          matchedKeyword = keyword;
          break;
        }
      }
    }

    // 如果组合关键词没有匹配，再检查单个关键词
    if (!matched) {
      for (const keyword of keywords) {
        if (!keyword.includes(' ')) {
          if (normalizedText.includes(keyword.toLowerCase())) {
            matched = true;
            matchedKeyword = keyword;
            break;
          }
        }
      }
    }

    return { matched, matchedKeyword };
  },

  // 提取消息信息
  extractMessageInfo(node) {
    try {
      const sender = this.findSender(node);
      const timestamp = this.formatTimestamp(new Date());

      return {
        sender: sender || 'Unknown Sender',
        timestamp
      };
    } catch (error) {
      window.ErrorHandler.Logger.error('Error extracting message info:', error);
      return {
        sender: 'Unknown Sender',
        timestamp: new Date().toLocaleString()
      };
    }
  },

  // 查找发送者
  findSender(node) {
    let messageNode = node;
    while (messageNode && 
           !messageNode.classList.contains('message') && 
           !messageNode.classList.contains('Message') && 
           !messageNode.classList.contains('bubble')) {
      messageNode = messageNode.parentElement;
    }

    if (messageNode) {
      for (const selector of this.selectors.sender) {
        const senderElement = messageNode.querySelector(selector);
        if (senderElement) {
          return senderElement.textContent.trim();
        }
      }
    }
    return null;
  },

  // 格式化时间戳
  formatTimestamp(date) {
    return date.toLocaleString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  },

  // 检查消息是否已处理
  isMessageProcessed(text, timestamp) {
    // 移除重复的时间戳和日期
    const cleanedText = text
      .replace(/(\d{1,2}:\d{2}\s*(?:AM|PM))\s*\1/gi, '$1')  // 移除重复的时间
      .replace(/(\d{4}\/\d{1,2}\/\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4})\s*\1/g, '$1')  // 移除重复的日期
      .replace(/(Today|Yesterday)\s*\1/gi, '$1')  // 移除重复的日期词
      .replace(/\s+/g, ' ')  // 压缩空格
      .trim();

    // 生成消息唯一标识
    const messageKey = this.generateMessageKey(cleanedText, timestamp);

    // 检查是否已处理过
    if (window.processedMessages.has(messageKey)) {
      window.ErrorHandler.Logger.debug('Message already processed:', {
        key: messageKey,
        preview: cleanedText.substring(0, 50)
      });
      return true;
    }

    // 检查是否是旧消息
    if (timestamp < window.lastProcessedTime - 60000) { // 1分钟内的消息才处理
      window.ErrorHandler.Logger.debug('Skipping old message:', {
        timestamp,
        lastProcessed: window.lastProcessedTime
      });
      return true;
    }

    // 添加到已处理集合
    window.processedMessages.add(messageKey);
    
    // 清理旧消息记录
    this.cleanupProcessedMessages();

    return false;
  },

  // 生成消息唯一标识
  generateMessageKey(text, timestamp) {
    // 提取消息的实际内容（移除时间戳等）
    const contentMatch = text.match(/^[^0-9]*([^]*?)[^0-9]*$/);
    const content = contentMatch ? contentMatch[1].trim() : text;
    
    // 使用内容和时间戳生成唯一标识
    const hashInput = `${content}_${Math.floor(timestamp / 60000)}`; // 按分钟分组
    
    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString();
  },

  // 清理过期的消息记录
  cleanupProcessedMessages() {
    if (window.processedMessages.size > 1000) {
      const messages = Array.from(window.processedMessages);
      window.processedMessages = new Set(messages.slice(-500));
      window.ErrorHandler.Logger.debug('Cleaned up processed messages:', {
        before: messages.length,
        after: window.processedMessages.size
      });
    }
  },

  // 获取关键词
  async getKeywords() {
    try {
      // 先检查扩展上下文
      if (!chrome.runtime || !chrome.storage) {
        throw new Error('Extension context invalidated');
      }

      // 缓存关键词，避免频繁请求
      if (this._cachedKeywords && Date.now() - this._lastKeywordsFetch < 5000) {
        return this._cachedKeywords;
      }

      return new Promise((resolve, reject) => {
        chrome.storage.sync.get(['keywords'], result => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            this._cachedKeywords = result.keywords || [];
            this._lastKeywordsFetch = Date.now();
            resolve(this._cachedKeywords);
          }
        });
      });
    } catch (error) {
      if (error.message === 'Extension context invalidated') {
        // 如果有缓存的关键词，使用缓存
        if (this._cachedKeywords) {
          return this._cachedKeywords;
        }
        // 否则等待上下文恢复
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.getKeywords();
      }
      window.ErrorHandler.Logger.error('Error getting keywords:', error);
      return [];
    }
  },

  // 发送通知
  async notifyMatch(result) {
    try {
      const formattedMessage = this.formatNotification(result);
      await this.sendNotification(formattedMessage);
      window.lastProcessedTime = result.timestamp;
    } catch (error) {
      window.ErrorHandler.Logger.error('Error sending notification:', error);
    }
  },

  // 格式化通知消息
  formatNotification(result) {
    const truncatedText = result.text.length > 100 ? 
      result.text.substring(0, 97) + '...' : 
      result.text;

    return {
      type: 'basic',
      title: '🔍 Keyword Match Found',
      message: [
        `👤 From: ${result.info.sender}`,
        `💬 Message: ${truncatedText}`,
        `🕒 Time: ${result.info.timestamp}`
      ].join('\n'),
      requireInteraction: true
    };
  },

  // 发送通知到后台
  async sendNotification(options) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'showNotification',
        options: options,
        isBatchScan: false
      }, response => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  },

  // 添加等待对话列表加载完成的方法
  async waitForDialogsLoad() {
    const maxWaitTime = 10000; // 最大等待时间 10 秒
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      // 检查是否存在正在加载的对话列表
      const loadingIndicator = document.querySelector('.loading, .loading-dots');
      if (!loadingIndicator) {
        // 等待一小段时间确保完全加载
        await new Promise(resolve => setTimeout(resolve, 500));
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    window.ErrorHandler.Logger.warn('Dialogs load timeout, proceeding anyway');
  },

  // 添加正则表达式转义函数
  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },

  // 添加文本规范化函数
  normalizeText(text) {
    return text
      // 移除重复的日期和网址
      .replace(/(\d{4}\/\d{1,2}\/\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4})\s*\1/g, '$1')
      .replace(/(https?:\/\/[^\s]+)\s*\1/g, '$1')
      // 移除重复的域名
      .replace(/([a-zA-Z0-9-]+\.com)\s*\1/g, '$1')
      // 移除重复的单词
      .replace(/(\b\w+\b)\s+\1/g, '$1')
      // 移除特殊字符
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ')
      // 压缩空白字符
      .replace(/\s+/g, ' ')
      .trim();
  },

  // 添加消息文本清理函数
  cleanMessageText(text) {
    return text
      // 移除重复的时间戳
      .replace(/\d{1,2}:\d{2}\s*(?:AM|PM)(?:\s*\d{1,2}:\d{2}\s*(?:AM|PM))+/gi, '')
      // 移除重复的日期
      .replace(/(?:Today|Yesterday|[A-Z][a-z]+ \d{1,2})\s*(?:Today|Yesterday|[A-Z][a-z]+ \d{1,2})+/g, '')
      // 移除域名重复
      .replace(/([a-zA-Z0-9-]+\.(?:com|org|net))\s*\1/g, '$1')
      // 移除管理员标记
      .replace(/(?:admin|administrator|bot)\s*(?:admin|administrator|bot)*/gi, '')
      // 移除多余空白
      .replace(/\s+/g, ' ')
      .trim();
  }
};

// 导出模块
window.MessageHandler = MessageHandler; 