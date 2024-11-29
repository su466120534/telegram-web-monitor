# Telegram Message Monitor

[English](#english) | [中文说明](#chinese)

<h2 id="english">English</h2>

A Chrome extension that helps you monitor and filter Telegram Web messages using keywords.

## Background

With the increasing number of Telegram bots and message volume, it's becoming harder to keep track of important messages. This extension provides a second-layer filtering mechanism for Telegram Web, allowing you to monitor specific keywords and get notified when they appear.

## Features

- 🔍 Real-time keyword monitoring
- 🔔 Visual and audio notifications
- 📝 Easy keyword management
- 🎯 Focus on current chat window
- 🌐 Works in background
- 🔄 Auto-scanning of existing messages

## Detailed Usage Guide

### Initial Setup
1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (top right corner)
4. Click "Load unpacked" and select the extension folder
5. Pin the extension to your browser toolbar for easy access

### Configuration
1. Open Telegram Web (https://web.telegram.org)
2. Click the extension icon in your browser toolbar
3. Add keywords you want to monitor:
   - Type a keyword in the input box
   - Press Enter or click "Add Keyword"
   - Add multiple keywords as needed
   - For combined keywords (AND logic), use space between words
     - Example: "binance api" will match messages containing both "binance" AND "api"
     - Single keywords like "binance" or "api" will match independently
   - Click '×' next to a keyword to remove it

### Monitoring
1. Click "Start Monitor" to begin monitoring
2. The status indicator will turn green when active
3. Keep the extension visible in your browser toolbar
4. The extension will monitor both:
   - New incoming messages
   - Existing messages in the current chat

### Notifications
You'll be notified of matching messages in several ways:
1. Visual Indicators:
   - Red badge with number on extension icon
   - List of matched messages in popup window
2. Audio Alert:
   - Sound notification after first user interaction
   - Requires clicking anywhere on the webpage first

### Managing Messages
1. Click the extension icon to view matched messages
2. Click "Clear Messages" to remove all notifications
3. Click individual messages to mark them as read
4. Badge count automatically updates as you read messages

### Tips
- Pin the extension to your toolbar for better visibility
- Keep Telegram Web open in a tab while monitoring
- Check the extension regularly for matched messages
- Use specific keywords to reduce false positives
- Use space-separated keywords for more precise matching
  - Example: "crypto trading" will only match messages containing both words
  - This helps reduce irrelevant notifications

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension folder

---

<h2 id="chinese">中文说明</h2>

一个帮助你监控和过滤 Telegram Web 消息的 Chrome 插件。

## 背景

随着 Telegram 机器人的增多和消息量的增大，重要消息很容易被淹没。本插件为 Telegram Web 提供了二次过滤机制，让你可以监控特定关键词并及时获得通知。

## 功能特点

- 🔍 实时关键词监控
- 🔔 视觉和声音提醒
- 📝 简单的关键词管理
- 🎯 监控当前聊天窗口
- 🌐 后台持续工作
- 🔄 自动扫描已有消息

## 详细使用指南

### 初始设置
1. 下载或克隆此仓库
2. 打开 Chrome，访问 `chrome://extensions/`
3. 开启"开发者模式"（右上角）
4. 点击"加载已解压的扩展程序"，选择插件文件夹
5. 将插件固定在浏览器工具栏以方便访问

### 配置
1. 打开 Telegram Web (https://web.telegram.org)
2. 点击浏览器工具栏中的插件图标
3. 添加需要监控的关键词：
   - 在输入框中输入关键词
   - 按回车或点击"添加关键词"
   - 可以添加多个关键词
   - 组合关键词（与逻辑）使用空格分隔
     - 例如："币安 API" 将只匹配同时包含"币安"和"API"的消息
     - 单个关键词如"币安"或"API"会独立匹配
   - 点击关键词旁的'×'可删除

### 监控
1. 点击"启动监控"开始监控
2. 状态指示器会变成绿色表示正在监控
3. 保持插件在浏览器工具栏可见
4. 插件会同时监控：
   - 新收到的消息
   - 当前聊天中的已有消息

### 通知方式
匹配到关键词时会通过多种方式通知：
1. 视觉提示：
   - 插件图标上显示红色数字徽章
   - 弹窗中显示匹配消息列表
2. 声音提示：
   - 首次用户交互后会有声音提示
   - 需要先点击网页任意位置

### 消息管理
1. 点击插件图标查看匹配的消息
2. 点击"清空消息"可删除所有通知
3. 点击单条消息可标记为已读
4. 阅读消息后徽章数字会自动更新

### 使用技巧
- 将插件固定在工具栏以便查看通知
- 保持 Telegram Web 在标签页中打开
- 定期检查插件是否有匹配消息
- 使用具体的关键词以减少误匹配
- 使用空格分隔的组合关键词实现精确匹配
  - 例如："交易 机器人" 只会匹配同时包含这两个词的消息
  - 这可以帮助减少不相关的通知

## License

MIT License

## Author

[Jimmy Su](https://github.com/su466120534)