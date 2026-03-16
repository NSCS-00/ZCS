# 零核服务器 (Zero-Core-Server)

<div align="center">

![Version](https://img.shields.io/badge/version-1.5.0.2-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Node.js](https://img.shields.io/badge/Node.js-%3E%3D14.0.0-brightgreen.svg)

**一个基于 Node.js 的模块化用户管理系统**

[English](README_EN.md) | **简体中文**

</div>

---

## 📖 目录

- [简介](#简介)
- [功能特性](#功能特性)
- [快速开始](#快速开始)
- [系统架构](#系统架构)
- [核心系统详解](#核心系统详解)
- [模块开发指南](#模块开发指南)
- [API 参考](#api 参考)
- [二次开发指南](#二次开发指南)
- [常见问题](#常见问题)
- [更新日志](#更新日志)
- [许可证](#许可证)

---

## 简介

零核服务器（Zero-Core-Server）是一个基于 Node.js + Express + Socket.IO + EJS 构建的模块化用户管理系统。它提供了完整的用户认证、权限管理、模块扩展、论坛交流、评论收藏等功能，支持高度自定义的模块开发和集成。

### 技术栈

- **后端框架**: Express.js 4.x
- **模板引擎**: EJS + Handlebars + Pug + Mustache
- **实时通信**: Socket.IO 4.x
- **加密系统**: Node.js Crypto (AES-256-CBC)
- **文件处理**: Multer + Sharp
- **日志系统**: BSIO (自研)

---

## 功能特性

### 核心功能

| 功能 | 描述 |
|------|------|
| 🔐 用户认证 | 支持用户名/密码、UUID 登录，AES-256-CBC 加密存储 |
| 👥 权限系统 | 四级权限：`user` → `admin` → `developer` → `system` |
| 🧩 模块沙盒 | 安全的模块运行环境，支持多种模板引擎 |
| 💬 论坛系统 | 完整的发帖、回复、点赞、收藏功能 |
| 📝 评论系统 | 模块评论、回复、点赞 |
| ⭐ 收藏系统 | 模块收藏管理 |
| 🔍 搜索功能 | 模块搜索、论坛搜索 |
| 📊 数据统计 | 用户统计、模块统计、访问统计 |
| 🎨 主题切换 | 支持亮色/暗色主题 |
| 📱 响应式设计 | 适配桌面端和移动端 |

### BSIO 日志系统

- 🎨 彩色日志输出（支持 Windows/Linux/macOS）
- 📋 多级日志：DEBUG、INFO、WARNING、ERROR
- 📁 文件检查与自动补充
- 🔧 系统信息展示

---

## 快速开始

### 环境要求

- Node.js >= 14.0.0
- npm >= 6.0.0

### 安装步骤

```bash
# 1. 克隆仓库
git clone https://github.com/NSCS-00/ZCS.git
cd ZCS

# 2. 安装依赖
npm install

# 3. 启动服务器
npm start

# 开发模式（支持热重载）
npm run dev
```

### 初次启动

1. 访问 `http://localhost:5000`
2. 注册第一个用户（自动获得 `system` 权限）
3. 系统会自动生成加密密钥文件 `data/secret.json`

### 默认配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| 端口 | 5000 | 可通过 `PORT` 环境变量修改 |
| 数据目录 | `./data/` | 存储用户数据和配置 |
| 模块目录 | `./module/` | 存放扩展模块 |
| Session 时长 | 24 小时 | Cookie 有效期 |

---

## 系统架构

### 目录结构

```
Zero-Core-Server/
├── server.js              # 主服务器文件
├── bsio.js                # BSIO 日志系统
├── package.json           # 项目配置
├── .gitignore             # Git 忽略配置
│
├── data/                  # 数据目录
│   ├── secret.json        # 加密密钥（敏感！）
│   ├── server.json        # 服务器配置和更新日志
│   └── user/              # 用户数据
│       └── {userId}/      # 用户个人目录
│           ├── avatar.jpg # 头像
│           └── intro/     # 个人简介
│               └── background.jpg
│
├── module/                # 模块目录
│   └── {moduleName}/      # 模块文件夹
│       ├── setting.json   # 模块配置
│       ├── {name}.js      # 模块主逻辑
│       ├── views/         # 模块视图
│       └── public/        # 模块静态资源
│
├── views/                 # 主视图目录
│   ├── index.ejs          # 主页
│   ├── system/            # 系统视图
│   │   ├── layout.ejs     # 布局模板
│   │   └── update-log.ejs # 更新日志
│   ├── user/              # 用户视图
│   │   ├── settings.ejs   # 设置页面
│   │   └── intro.ejs      # 个人简介
│   ├── auth/              # 认证视图
│   ├── admin/             # 管理视图
│   ├── forum/             # 论坛视图
│   └── modules/           # 模块视图
│
└── public/                # 静态资源
    ├── css/               # 样式文件
    ├── js/                # 脚本文件
    ├── images/            # 图片资源
    └── favicon.ico
```

### 核心模块关系

```
┌─────────────────────────────────────────────────────────┐
│                      server.js                          │
│  ┌─────────────────┐  ┌─────────────────┐              │
│  │  AdvancedEncryption │  │  ModuleSandbox  │              │
│  │  - AES-256-CBC  │  │  - VM 沙盒      │              │
│  │  - 三级密钥     │  │  - 模板引擎     │              │
│  └─────────────────┘  └─────────────────┘              │
│  ┌─────────────────────────────────────────────────┐   │
│  │              BSIO 日志系统                      │   │
│  │  - 彩色输出  - 文件检查  - 自动补充            │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
   ┌────▼────┐     ┌─────▼─────┐    ┌──────▼──────┐
   │ 用户系统 │     │  模块系统  │    │  论坛系统   │
   │ - 认证  │     │ - 沙盒    │    │ - 发帖     │
   │ - 权限  │     │ - 路由    │    │ - 回复     │
   │ - 资料  │     │ - 评论    │    │ - 收藏     │
   └─────────┘     └───────────┘    └─────────────┘
```

---

## 核心系统详解

### 1. 加密系统 (AdvancedEncryption)

#### 密钥层级

```
┌─────────────────────────────────────────┐
│           Main Secret (主密钥)           │
│         用户设置的数字/字母密码          │
└─────────────────┬───────────────────────┘
                  │ 加密
┌─────────────────▼───────────────────────┐
│          Deputy Secret (副密钥)          │
│         64 位随机十六进制字符串           │
└─────────────────┬───────────────────────┘
                  │ 加密
┌─────────────────▼───────────────────────┐
│         System Secret (系统密钥)         │
│         64 位随机十六进制字符串           │
└─────────────────┬───────────────────────┘
                  │ 加密
┌─────────────────▼───────────────────────┐
│           File Secrets (文件密钥)        │
│         每个文件独立的 MD5 密钥           │
└─────────────────────────────────────────┘
```

#### 使用示例

```javascript
const encryption = new AdvancedEncryption('./data/secret.json');

// 加密内容
const content = '敏感数据';
const encrypted = encryption.encrypt(content, '/path/to/file');
// 返回：{ encryptedContent, encryptedFileKey, encryptedSystemKey, ... }

// 解密内容
const decrypted = encryption.decrypt(encryptedData, '/path/to/file');
```

#### 密钥管理

```javascript
// 更新主密钥
encryption.updateMainSecret('newMainSecret123');

// 更新副密钥
encryption.updateDeputySecret('64 位十六进制字符串');

// 更新系统密钥
encryption.updateSystemSecret('64 位十六进制字符串');

// 密钥轮换
const reencryptedData = encryption.rotateKeys(allEncryptedData);
```

### 2. 模块沙盒系统 (ModuleSandbox)

#### 沙盒隔离

模块在 VM 沙盒中运行，只能访问受限的全局变量和允许的 Node.js 模块：

**允许的内部模块**:
- `path`, `fs`, `crypto`, `util`, `events`, `stream`, `querystring`, `url`

**受限的全局变量**:
- `console` (重定向到 BSIO 日志)
- `process` (仅 `env` 和 `version`)
- `Buffer`, `setTimeout`, `setInterval` 等

#### 模块配置 (setting.json)

```json
{
  "name": "模块名称",
  "version": "1.0.0",
  "description": "模块描述",
  "author": "作者",
  "main": "index.js",
  "viewEngine": "ejs",
  "language": "javascript",
  "permissions": ["read", "write"],
  "dependencies": [],
  "routes": [
    {
      "path": "/api/module/action",
      "method": "POST",
      "handler": "handleAction"
    }
  ]
}
```

#### 模块导出格式

```javascript
// index.js
module.exports = {
  // 初始化函数
  init: function(sandbox) {
    // 模块初始化逻辑
  },
  
  // API 接口
  api: function(method, path, params) {
    // 处理 API 请求
    return { success: true, data: {} };
  }
};
```

### 3. BSIO 日志系统

#### 日志等级

```javascript
const { BSIO, LogLevel } = require('./bsio');

const bsio = new BSIO({
  logLevel: LogLevel.DEBUG,  // DEBUG < INFO < WARNING < ERROR
  showColors: true,          // 启用彩色输出
  showTimestamp: true        // 显示时间戳
});

bsio.debug('调试信息');    // 蓝色
bsio.info('普通信息');     // 白色
bsio.warning('警告信息');  // 黄色
bsio.error('错误信息');    // 红色
```

#### 文件检查

```javascript
// 检查文件是否存在
const exists = bsio.checkFile('./data/config.json');

// 检查并创建文件
bsio.checkAndCreateFile(
  './data/config.json',
  { default: 'value' },
  __dirname
);

// 检查并修复 JSON 文件
bsio.checkAndFixJSON(
  './data/server.json',
  { 'update-log': [] },
  __dirname
);

// 打印文件报告
bsio.printFileReport();
```

#### 系统信息展示

```javascript
bsio.printSystemInfo({
  nodeVersion: process.version,
  npmVersion: '6.14.0',
  zcsVersion: '1.5.0.1'
});

bsio.printLoadedModules(['module-a', 'module-b']);
```

---

## 模块开发指南

### 模块系统概述

零核服务器的模块系统是一个完整的插件架构，允许开发者在不修改核心代码的情况下扩展服务器功能。每个模块在独立的沙盒中运行，拥有自己的路由、视图和 API。

### 模块架构

```
module/
└── my-module/              # 模块目录
    ├── setting.json        # 模块配置（必需）
    ├── index.js            # 模块主逻辑（必需）
    ├── views/              # 视图文件目录
    │   ├── index.ejs       # 主视图
    │   └── about.ejs       # 关于视图
    ├── public/             # 静态资源目录
    │   ├── css/
    │   │   └── style.css
    │   └── js/
    │       └── main.js
    └── README.md           # 模块说明文档
```

### 创建第一个模块

#### 步骤 1: 创建模块目录

```bash
cd module
mkdir my-first-module
cd my-first-module
mkdir views public
```

#### 步骤 2: 编写配置文件

创建 `setting.json`:

```json
{
  "name": "my-first-module",
  "displayName": "我的第一个模块",
  "version": "1.0.0",
  "description": "这是一个示例模块，展示如何开发零核服务器模块",
  "author": "开发者名称",
  "main": "index.js",
  "viewEngine": "ejs",
  "language": "javascript",
  "permissions": ["read", "write"],
  "dependencies": [],
  "routes": [
    {
      "path": "/api/greet",
      "method": "GET",
      "handler": "handleGreet"
    }
  ],
  "page": true,
  "icon": "🚀"
}
```

**配置字段说明**:

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `name` | string | ✓ | 模块唯一标识符（小写，连字符分隔） |
| `displayName` | string | ✓ | 模块显示名称 |
| `version` | string | ✓ | 版本号（语义化版本） |
| `description` | string | ✓ | 模块描述 |
| `author` | string | ✓ | 作者信息 |
| `main` | string | ✓ | 入口文件路径（通常是 `index.js`） |
| `viewEngine` | string | ✓ | 视图引擎，可选值：`ejs`、`handlebars`、`pug`、`mustache` |
| `language` | string | ✓ | 编程语言（目前仅支持 `javascript`） |
| `permissions` | array | ✓ | 所需权限列表，如 `["read", "write"]` |
| `dependencies` | array | ✓ | 依赖模块列表 |
| `routes` | array | ✗ | 路由配置 |
| `page` | boolean | ✗ | 是否有页面（默认 `false`，表示纯 API 模块） |
| `icon` | string | ✗ | 模块图标（emoji） |

**⚠️ 重要提示 - viewEngine 配置**:

- **支持的值**: `ejs`、`handlebars`、`pug`、`mustache`
- **默认值**: 如果未配置或配置了不支持的值，将自动回退到 `ejs`
- **常见错误**: 不要设置为 `'js'`、`'html'` 等无效值

```json
// ✅ 正确配置
{
  "viewEngine": "ejs"
}

// ❌ 错误配置（会导致回退到 EJS）
{
  "viewEngine": "js"
}
```

#### 步骤 3: 编写模块逻辑

创建 `index.js`:

```javascript
/**
 * 我的第一个模块
 * 版本：1.0.0
 */

module.exports = {
  /**
   * 模块初始化函数
   * @param {Object} sandbox - 沙盒上下文
   * @param {Object} moduleConfig - 模块配置
   */
  init: function(sandbox, moduleConfig) {
    console.log(`[${moduleConfig.name}] 模块初始化完成`);
    
    // 可以在这里进行初始化操作
    // 如：加载配置、建立连接等
  },
  
  /**
   * 模块 API 接口
   * @param {string} method - HTTP 方法
   * @param {string} path - 请求路径
   * @param {Object} params - 请求参数
   * @returns {Object} API 响应
   */
  api: function(method, path, params) {
    // 路由处理
    if (path === '/greet' && method === 'GET') {
      return this.handleGreet(params);
    }
    
    if (path === '/calculate' && method === 'POST') {
      return this.handleCalculate(params);
    }
    
    return {
      success: false,
      error: '未知的 API 路径或方法'
    };
  },
  
  /**
   * 处理问候请求
   */
  handleGreet: function(params) {
    const name = params.name || '访客';
    return {
      success: true,
      message: `你好，${name}！欢迎使用我的模块`,
      timestamp: Date.now()
    };
  },
  
  /**
   * 处理计算请求
   */
  handleCalculate: function(params) {
    const { a, b, operation } = params;
    
    let result;
    switch (operation) {
      case 'add':
        result = a + b;
        break;
      case 'subtract':
        result = a - b;
        break;
      case 'multiply':
        result = a * b;
        break;
      case 'divide':
        if (b === 0) {
          return { success: false, error: '除数不能为零' };
        }
        result = a / b;
        break;
      default:
        return { success: false, error: '未知的运算类型' };
    }
    
    return {
      success: true,
      result,
      operation
    };
  }
};
```

#### 步骤 4: 创建视图文件

创建 `views/index.ejs`:

```html
<%- include('../../system/layout', { title: moduleInfo.displayName }) %>

<div class="module-container">
  <div class="module-header">
    <h1><%= moduleInfo.icon || '🚀' %> <%= moduleInfo.displayName %></h1>
    <p class="module-description"><%= moduleInfo.description %></p>
  </div>
  
  <div class="module-content">
    <div class="card">
      <h2>问候功能</h2>
      <div class="form-group">
        <input type="text" id="nameInput" placeholder="请输入你的名字" />
        <button onclick="greet()" class="btn btn-primary">问候</button>
      </div>
      <div id="greetResult" class="result"></div>
    </div>
    
    <div class="card">
      <h2>计算功能</h2>
      <div class="form-group">
        <input type="number" id="numA" placeholder="数字 A" />
        <select id="operation">
          <option value="add">加法 (+)</option>
          <option value="subtract">减法 (-)</option>
          <option value="multiply">乘法 (×)</option>
          <option value="divide">除法 (÷)</option>
        </select>
        <input type="number" id="numB" placeholder="数字 B" />
        <button onclick="calculate()" class="btn btn-primary">计算</button>
      </div>
      <div id="calcResult" class="result"></div>
    </div>
  </div>
</div>

<style>
.module-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.module-header {
  text-align: center;
  margin-bottom: 30px;
}

.module-description {
  color: var(--text-secondary);
}

.card {
  background: var(--bg-secondary);
  border-radius: 10px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: var(--shadow-medium);
}

.form-group {
  display: flex;
  gap: 10px;
  margin: 15px 0;
}

.form-group input,
.form-group select {
  flex: 1;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  background: var(--accent-color);
  color: white;
}

.btn:hover {
  background: var(--accent-hover);
}

.result {
  margin-top: 15px;
  padding: 10px;
  border-radius: 5px;
  background: var(--bg-tertiary);
}
</style>

<script>
async function greet() {
  const name = document.getElementById('nameInput').value;
  
  try {
    const response = await fetch('/api/module/execute/my-first-module', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: '/greet',
        method: 'GET',
        params: { name }
      })
    });
    
    const data = await response.json();
    document.getElementById('greetResult').innerHTML = 
      data.success ? 
        `<span style="color: var(--success-color)">${data.message}</span>` :
        `<span style="color: var(--error-color)">${data.error}</span>`;
  } catch (error) {
    document.getElementById('greetResult').innerHTML = 
      `<span style="color: var(--error-color)">请求失败：${error.message}</span>`;
  }
}

async function calculate() {
  const a = parseFloat(document.getElementById('numA').value);
  const b = parseFloat(document.getElementById('numB').value);
  const operation = document.getElementById('operation').value;
  
  if (isNaN(a) || isNaN(b)) {
    document.getElementById('calcResult').innerHTML = 
      '<span style="color: var(--error-color)">请输入有效的数字</span>';
    return;
  }
  
  try {
    const response = await fetch('/api/module/execute/my-first-module', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: '/calculate',
        method: 'POST',
        params: { a, b, operation }
      })
    });
    
    const data = await response.json();
    document.getElementById('calcResult').innerHTML = 
      data.success ? 
        `<span style="color: var(--success-color)">结果：${data.result}</span>` :
        `<span style="color: var(--error-color)">${data.error}</span>`;
  } catch (error) {
    document.getElementById('calcResult').innerHTML = 
      `<span style="color: var(--error-color)">请求失败：${error.message}</span>`;
  }
}
</script>
```

#### 步骤 5: 测试模块

1. 重启服务器或刷新模块列表
2. 访问 `/modules` 查看模块
3. 点击模块进入页面测试功能

### 高级模块开发

#### 使用沙盒 API

模块可以访问受限的沙盒 API:

```javascript
module.exports = {
  init: function(sandbox, moduleConfig) {
    // 访问受限的 Node.js 模块
    const path = sandbox.require('path');
    const fs = sandbox.require('fs');
    const crypto = sandbox.require('crypto');
    
    // 使用受限的全局变量
    sandbox.console.log('模块初始化');
    
    // 设置定时器
    sandbox.setInterval(() => {
      // 定期任务
    }, 60000);
  },
  
  api: function(method, path, params) {
    // 处理 API 请求
    return { success: true };
  }
};
```

#### 模块间通信

```javascript
// 模块 A - 发布事件
module.exports = {
  init: function(sandbox, moduleConfig) {
    // 发布事件
    global.moduleEvents = global.moduleEvents || [];
    global.moduleEvents.push({
      from: moduleConfig.name,
      event: 'dataUpdated',
      data: { /* ... */ }
    });
  }
};

// 模块 B - 监听事件
module.exports = {
  init: function(sandbox, moduleConfig) {
    // 轮询检查事件
    sandbox.setInterval(() => {
      if (global.moduleEvents) {
        const newEvents = global.moduleEvents.filter(
          e => e.from !== moduleConfig.name
        );
        newEvents.forEach(event => {
          console.log(`收到事件：${event.event}`, event.data);
        });
      }
    }, 1000);
  }
};
```

#### 使用外部 API

```javascript
const https = require('https');

module.exports = {
  api: function(method, path, params) {
    if (path === '/fetch-weather') {
      return this.fetchWeather(params.city);
    }
    return { success: false, error: '未知路径' };
  },
  
  fetchWeather: function(city) {
    return new Promise((resolve, reject) => {
      const url = `https://api.weather.com/weather/${encodeURIComponent(city)}`;
      
      https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({
              success: true,
              data: JSON.parse(data)
            });
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });
  }
};
```

### 模块调试技巧

#### 1. 使用 BSIO 日志

```javascript
module.exports = {
  init: function(sandbox, moduleConfig) {
    sandbox.console.log('[初始化] 模块启动');
    sandbox.console.info('[信息] 配置加载完成');
    sandbox.console.warn('[警告] 某些功能受限');
    sandbox.console.error('[错误] 连接失败');
  }
};
```

#### 2. 错误处理

```javascript
module.exports = {
  api: function(method, path, params) {
    try {
      // 业务逻辑
      const result = this.doSomething(params);
      return { success: true, data: result };
    } catch (error) {
      sandbox.console.error(`API 错误：${error.message}`);
      return { 
        success: false, 
        error: error.message,
        stack: error.stack 
      };
    }
  }
};
```

#### 3. 性能分析

```javascript
module.exports = {
  api: function(method, path, params) {
    const startTime = Date.now();
    
    try {
      const result = this.doSomething(params);
      const duration = Date.now() - startTime;
      
      if (duration > 1000) {
        sandbox.console.warn(`性能警告：${path} 耗时 ${duration}ms`);
      }
      
      return { success: true, data: result, duration };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};
```

### 模块发布规范

#### 1. 模块命名规范

- 使用小写字母和连字符
- 前缀建议：`zcs-` 表示零核服务器模块
- 示例：`zcs-chat`, `zcs-shop`, `zcs-blog`

#### 2. 版本号规范

遵循语义化版本（Semantic Versioning）:
- `MAJOR.MINOR.PATCH`
- 示例：`1.0.0`, `1.2.3`, `2.0.0-beta.1`

#### 3. README 模板

```markdown
# 模块名称

模块描述

## 功能特性

- 功能 1
- 功能 2

## 安装

将模块文件夹放入 `module/` 目录

## 配置

```json
{
  "settingKey": "settingValue"
}
```

## 使用说明

1. 访问 `/modules/模块名称`
2. ...

## 更新日志

### v1.0.0
- 初始版本
```

### 模块开发最佳实践

1. **保持模块单一职责** - 每个模块只做一件事
2. **使用沙盒 API** - 不要尝试绕过沙盒限制
3. **错误处理** - 始终捕获和处理可能的错误
4. **日志记录** - 使用 BSIO 记录重要操作
5. **性能考虑** - 避免阻塞操作，使用异步处理
6. **安全考虑** - 验证所有用户输入
7. **文档完善** - 提供清晰的安装和使用说明

---

## API 参考

### 认证相关 API

| 端点 | 方法 | 权限 | 描述 | 请求体 | 响应 |
|------|------|------|------|--------|------|
| `/api/register` | POST | 无 | 用户注册 | `{ username, password, confirmPassword }` | 重定向到 `/login` |
| `/api/login` | POST | 无 | 用户登录 | `{ username, password }` | 重定向到 `/` |
| `/api/logout` | POST | 已登录 | 用户登出 | 无 | 重定向到 `/login` |

**注册示例**:
```javascript
fetch('/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'newuser',
    password: 'password123',
    confirmPassword: 'password123'
  })
});
```

### 用户相关 API

| 端点 | 方法 | 权限 | 描述 | 请求体 | 响应 |
|------|------|------|------|--------|------|
| `/api/user/info` | GET | 已登录 | 获取当前用户信息 | 无 | `{ success, user }` |
| `/settings` | POST | 已登录 | 更新用户资料 | `{ newName, newPassword, oldPassword, theme }` + 文件上传 | 渲染设置页面 |
| `/settings/intro` | POST | 已登录 | 更新个人简介 | `{ introContent }` | 渲染设置页面 |
| `/:userId/intro` | GET | 已登录 | 查看用户简介 | 无 | 渲染简介页面 |

**更新用户资料示例**:
```javascript
const formData = new FormData();
formData.append('newName', '新用户名');
formData.append('theme', 'dark');
// 头像上传
formData.append('avatar', avatarFile);

fetch('/settings', {
  method: 'POST',
  body: formData
});
```

### 管理员 API

| 端点 | 方法 | 权限 | 描述 | 请求体 | 响应 |
|------|------|------|------|--------|------|
| `/panel` | GET | admin+ | 管理面板总览 | 无 | 渲染管理面板 |
| `/panel/users` | GET | admin+ | 用户管理列表 | 无 | 渲染用户列表 |
| `/panel/users/:id` | POST | admin+ | 更新用户信息 | `{ name, author, points, avatar }` | `{ success, message }` |
| `/panel/users/:id` | DELETE | admin+ | 删除用户 | 无 | `{ success }` |
| `/panel/users` | POST | admin+ | 创建用户 | `{ name, password, author, points }` | 重定向到用户列表 |
| `/panel/system` | GET | system | 系统控制面板 | 无 | 渲染系统面板 |
| `/panel/system/restart` | POST | system | 重启服务器 | 无 | 文本响应 |
| `/panel/system/shutdown` | POST | system | 关闭服务器 | 无 | 文本响应 |

**删除用户示例**:
```javascript
fetch('/panel/users/0000-0000-0000-0000', {
  method: 'DELETE'
}).then(res => res.json()).then(data => {
  console.log(data); // { success: true }
});
```

### 加密系统 API

| 端点 | 方法 | 权限 | 描述 | 请求体 | 响应 |
|------|------|------|------|--------|------|
| `/api/update-main-secret` | POST | system | 更新主密钥 | `{ secret }` | `{ success, message }` |
| `/api/update-deputy-secret` | POST | system | 更新副密钥 | `{ secret }` | `{ success, message }` |
| `/api/update-system-secret` | POST | system | 更新系统密钥 | `{ secret }` | `{ success, message }` |
| `/api/secrets-info` | GET | system | 获取密钥信息 | 无 | `{ mainSecret, deputySecret, systemSecret, needsRotation }` |

**密钥格式要求**:
- **主密钥**: 仅包含字母和数字
- **副密钥**: 64 位十六进制字符串（256 位）
- **系统密钥**: 64 位十六进制字符串（256 位）

### 模块系统 API

| 端点 | 方法 | 权限 | 描述 | 请求体 | 响应 |
|------|------|------|------|--------|------|
| `/modules` | GET | 无 | 模块列表页面 | 无 | 渲染模块列表 |
| `/module/:moduleName` | GET | 已登录 | 模块页面 | 无 | 渲染模块视图 |
| `/api/module/favorites` | GET | 已登录 | 获取收藏列表 | 无 | `{ success, favorites }` |
| `/api/module/favorite` | POST | 已登录 | 收藏/取消收藏 | `{ moduleId, action }` | `{ success, message, count }` |
| `/api/module/favorite-count/:moduleId` | GET | 无 | 获取收藏数量 | 无 | `{ success, count }` |
| `/api/module/comments/:moduleId` | GET | 无 | 获取评论列表 | 无 | `{ success, comments }` |
| `/api/module/comments` | POST | 已登录 | 发表评论 | `{ moduleId, content, parentId }` | `{ success, message, comment }` |
| `/api/module/comments/:moduleId/:commentId` | DELETE | 已登录 | 删除评论 | 无 | `{ success, message }` |

**收藏操作示例**:
```javascript
// 收藏模块
fetch('/api/module/favorite', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    moduleId: 'chat-module',
    action: 'add'
  })
}).then(res => res.json()).then(data => {
  console.log(`收藏成功，当前收藏数：${data.count}`);
});

// 取消收藏
fetch('/api/module/favorite', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    moduleId: 'chat-module',
    action: 'remove'
  })
});
```

### 论坛系统 API

| 端点 | 方法 | 权限 | 描述 | 请求体 | 响应 |
|------|------|------|------|--------|------|
| `/forum` | GET | 已登录 | 论坛首页 | 无 | 渲染论坛首页 |
| `/forum/category/:categoryId` | GET | 已登录 | 分类页面 | 无 | 渲染分类页面 |
| `/forum/new` | GET | 已登录 | 发帖页面 | 无 | 渲染发帖表单 |
| `/forum/new` | POST | 已登录 | 创建帖子 | `{ title, content, category }` | 重定向到帖子 |
| `/forum/post/:postId` | GET | 已登录 | 帖子详情 | 无 | 渲染帖子详情 |
| `/forum/post/:postId/reply` | POST | 已登录 | 回复帖子 | `{ content }` | 重定向到帖子 |
| `/forum/post/:postId` | DELETE | admin+ | 删除帖子 | 无 | `{ success, message }` |
| `/forum/post/:postId/edit` | GET | 已登录 | 编辑帖子页面 | 无 | 渲染编辑表单 |
| `/forum/post/:postId/edit` | POST | 已登录 | 更新帖子 | `{ title, content, category }` | 重定向到帖子 |

**发帖示例**:
```javascript
fetch('/forum/new', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'title=新帖子标题&content=帖子内容&category=tech'
});
```

### 聊天系统 API

| 端点 | 方法 | 权限 | 描述 | 请求体 | 响应 |
|------|------|------|------|--------|------|
| `/chat` | GET | 已登录 | 聊天页面 | 无 | 渲染聊天界面 |
| `/api/chat/send` | POST | 已登录 | 发送消息 | `{ recipient, content }` | `{ success, message }` |

**发送消息示例**:
```javascript
fetch('/api/chat/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    recipient: '0000-0000-0000-0000',
    content: '你好！'
  })
}).then(res => res.json()).then(data => {
  if (data.success) {
    console.log('消息发送成功');
  }
});
```

### 系统相关 API

| 端点 | 方法 | 权限 | 描述 | 请求体 | 响应 |
|------|------|------|------|--------|------|
| `/api/time` | GET | 无 | 获取时间信息 | 无 | `{ ZCS_time, windows_time, local_time, timestamp }` |
| `/api/announcement` | GET | 无 | 获取系统公告 | 无 | `{ announcement }` |
| `/api/announcement` | POST | system | 更新系统公告 | `{ announcement }` | `{ success, message }` |
| `/updates` | GET | 无 | 更新日志页面 | 无 | 渲染更新日志 |

**时间 API 响应示例**:
```json
{
  "ZCS_time": "2026-03-16T12:00:00.000Z",
  "windows_time": "2026-03-16T12:00:00.000Z",
  "local_time": "2026-03-16T12:00:00.000Z",
  "timestamp": 1710590400000
}
```

---

## 二次开发指南

### 扩展服务器功能

#### 1. 添加新的路由

**步骤**:

1. 在 `server.js` 中找到路由定义区域
2. 添加新的路由处理函数

```javascript
// 示例：添加一个简单的 API 接口
app.get('/api/custom/hello', (req, res) => {
  res.json({ 
    success: true, 
    message: '你好，世界！',
    timestamp: Date.now()
  });
});

// 带权限验证的接口
app.post('/api/custom/action', requireAuth, (req, res) => {
  const user = getUserBySession(req);
  const { action } = req.body;
  
  // 处理逻辑
  const result = performAction(user, action);
  
  res.json({ success: true, data: result });
});
```

#### 2. 添加自定义中间件

**权限等级中间件**:

```javascript
// 权限等级定义
const permissionLevels = {
  'user': 0,
  'admin': 1,
  'developer': 2,
  'system': 3
};

// 创建权限检查中间件
function requirePermission(level) {
  return (req, res, next) => {
    const user = getUserBySession(req);
    
    if (!user) {
      return res.status(401).json({ error: '未登录' });
    }
    
    if (permissionLevels[user.author] < permissionLevels[level]) {
      bsio.warning(`权限不足：${user.name} 尝试访问 ${level} 级别资源`);
      return res.status(403).json({ error: '权限不足' });
    }
    
    next();
  };
}

// 使用示例
app.get('/api/admin/data', requirePermission('admin'), (req, res) => {
  // 仅 admin 及以上权限可访问
});
```

**请求日志中间件**:

```javascript
// 记录所有 API 请求
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    bsio.debug(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  
  next();
});
```

#### 3. 扩展 BSIO 日志系统

**添加新的日志方法**:

在 `bsio.js` 中添加:

```javascript
// 成功消息
printSuccess(message) {
  console.log(this.applyColor(`✓ ${message}`, colors.green));
}

// 系统信息
printInfo(message) {
  console.log(this.applyColor(`ℹ ${message}`, colors.cyan));
}

// 调试信息（带堆栈）
debugStack(message, error) {
  if (this.logLevel.level <= LogLevel.DEBUG.level) {
    console.log(this.applyColor(`[DEBUG] ${message}`, colors.blue));
    console.error(error.stack);
  }
}
```

**使用示例**:

```javascript
bsio.printSuccess('操作完成');
bsio.printInfo('系统运行正常');
bsio.debugStack('数据库错误', error);
```

### 自定义视图开发

#### 1. 添加新页面

**步骤**:

1. 在 `views/` 目录下创建 EJS 文件
2. 添加对应的路由

**示例：创建帮助页面**

```html
<!-- views/help.ejs -->
<%- include('./system/layout', { title: '帮助中心' }) %>

<div class="help-container">
  <h1>帮助中心</h1>
  
  <div class="help-section">
    <h2>常见问题</h2>
    <ul>
      <li><a href="#q1">如何注册账号？</a></li>
      <li><a href="#q2">如何修改密码？</a></li>
      <li><a href="#q3">如何管理模块？</a></li>
    </ul>
  </div>
  
  <div class="help-section">
    <h2>联系方式</h2>
    <p>如有问题，请联系管理员</p>
  </div>
</div>

<style>
.help-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}
.help-section {
  margin-bottom: 30px;
}
</style>
```

```javascript
// 在 server.js 中添加路由
app.get('/help', requireAuth, (req, res) => {
  const user = getUserBySession(req);
  res.render('help', { user, currentPath: '/help' });
});
```

#### 2. 创建可复用组件

**侧边栏组件**:

```html
<!-- views/partials/sidebar.ejs -->
<div class="sidebar">
  <div class="sidebar-header">
    <h2>零核服务器</h2>
  </div>
  
  <nav class="sidebar-nav">
    <a href="/" class="<%= currentPath === '/' ? 'active' : '' %>">
      <span class="icon">🏠</span>
      <span>首页</span>
    </a>
    
    <% if (user && user.author === 'system') { %>
    <a href="/panel/system" class="<%= currentPath === '/panel/system' ? 'active' : '' %>">
      <span class="icon">⚙️</span>
      <span>系统管理</span>
    </a>
    <% } %>
  </nav>
</div>
```

**使用组件**:

```html
<%- include('./partials/sidebar', { user, currentPath }) %>
```

### 数据库扩展

#### 1. 添加新的数据表

```javascript
// 在 initializeDatabase() 中添加新字段
function initializeDatabase() {
  const initialData = {
    users: [],
    stats: { visitCount: 0, userCount: 0 },
    'update-log': [],
    forum: { posts: [], categories: [] },
    modules: { favorites: {}, comments: {} },
    // 新增字段
    notifications: [],  // 系统通知
    settings: {},       // 全局设置
    logs: []            // 操作日志
  };
  // ...
}
```

#### 2. 创建数据访问层

```javascript
// 封装数据库操作
class Database {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.cache = null;
    this.cacheTime = 0;
  }
  
  read() {
    // 检查缓存
    if (this.cache && Date.now() - this.cacheTime < 5000) {
      return this.cache;
    }
    
    const data = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
    this.cache = data;
    this.cacheTime = Date.now();
    return data;
  }
  
  write(data) {
    fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2));
    this.cache = data;
    this.cacheTime = Date.now();
  }
  
  // 用户相关操作
  getUserById(uuid) {
    const db = this.read();
    return db.users.find(u => u.UUID === uuid);
  }
  
  addUser(user) {
    const db = this.read();
    db.users.push(user);
    this.write(db);
  }
  
  // 通知相关操作
  addNotification(notification) {
    const db = this.read();
    if (!db.notifications) db.notifications = [];
    db.notifications.push(notification);
    this.write(db);
  }
  
  getNotifications(userId) {
    const db = this.read();
    return (db.notifications || []).filter(n => n.userId === userId);
  }
}

// 使用示例
const db = new Database('./data/server.json');
db.addUser(newUser);
```

### 集成第三方服务

#### 1. 邮件通知服务

```javascript
const nodemailer = require('nodemailer');

// 配置邮件传输器
const transporter = nodemailer.createTransport({
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  auth: {
    user: 'your-email@example.com',
    pass: 'your-password'
  }
});

// 发送邮件函数
function sendEmail(to, subject, html) {
  return transporter.sendMail({
    from: '零核服务器 <noreply@example.com>',
    to,
    subject,
    html
  });
}

// 使用示例：注册欢迎邮件
app.post('/register', async (req, res) => {
  // ... 注册逻辑
  
  await sendEmail(
    newUser.email,
    '欢迎加入零核服务器',
    `<p>你好，${newUser.name}！</p><p>欢迎加入零核服务器！</p>`
  );
  
  res.redirect('/login');
});
```

#### 2. 对象存储（头像等）

```javascript
const AWS = require('aws-sdk');

// 配置 S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  bucket: 'your-bucket-name'
});

// 上传头像到 S3
async function uploadAvatarToS3(userId, fileBuffer) {
  const params = {
    Bucket: 'your-bucket-name',
    Key: `avatars/${userId}.jpg`,
    Body: fileBuffer,
    ContentType: 'image/jpeg'
  };
  
  const result = await s3.upload(params).promise();
  return result.Location;
}
```

#### 3. 使用 Redis 缓存

```javascript
const redis = require('redis');
const client = redis.createClient();

// 缓存用户信息
async function cacheUser(userId, userData) {
  await client.setEx(`user:${userId}`, 3600, JSON.stringify(userData));
}

// 获取缓存的用户信息
async function getCachedUser(userId) {
  const cached = await client.get(`user:${userId}`);
  return cached ? JSON.parse(cached) : null;
}

// 使用示例
app.get('/api/user/info', async (req, res) => {
  const userId = req.session.userId;
  
  let user = await getCachedUser(userId);
  if (!user) {
    user = getUserById(userId);
    await cacheUser(userId, user);
  }
  
  res.json({ success: true, user });
});
```

### 性能优化

#### 1. 数据库查询优化

```javascript
// 添加索引（对于 JSON 数据库，使用内存索引）
const userIndex = new Map();

function buildUserIndex() {
  const db = readDatabase();
  userIndex.clear();
  db.users.forEach(user => {
    userIndex.set(user.UUID, user);
  });
}

function getUserById(uuid) {
  return userIndex.get(uuid);
}

// 启动时构建索引
buildUserIndex();
```

#### 2. 静态资源缓存

```javascript
// 添加静态资源缓存头
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',  // 缓存 1 天
  etag: true,
  lastModified: true
}));
```

#### 3. 响应压缩

```javascript
const compression = require('compression');

// 启用 Gzip 压缩
app.use(compression({
  level: 6,  // 压缩级别 1-9
  threshold: 1024  // 超过 1KB 的响应才压缩
}));
```

### 安全加固

#### 1. 防止暴力破解

```javascript
const loginAttempts = new Map();

function rateLimitLogin(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  
  // 获取该 IP 的登录尝试记录
  let attempts = loginAttempts.get(ip) || { count: 0, resetTime: now + 60000 };
  
  // 如果超过限制
  if (attempts.count >= 5) {
    if (now < attempts.resetTime) {
      return res.status(429).json({ 
        error: '尝试次数过多，请稍后再试',
        retryAfter: Math.ceil((attempts.resetTime - now) / 1000)
      });
    }
    // 重置计数
    attempts = { count: 0, resetTime: now + 60000 };
  }
  
  attempts.count++;
  loginAttempts.set(ip, attempts);
  
  next();
}

// 应用到登录接口
app.post('/login', rateLimitLogin, (req, res) => {
  // ... 登录逻辑
});
```

#### 2. CSRF 保护

```javascript
const csrf = require('csurf');
const csrfProtection = csrf({ cookie: true });

// 应用到需要 CSRF 保护的路由
app.get('/settings', csrfProtection, (req, res) => {
  res.render('settings', { 
    csrfToken: req.csrfToken(),
    user
  });
});

app.post('/settings', csrfProtection, (req, res) => {
  // ... 设置更新逻辑
});
```

在视图中使用：
```html
<input type="hidden" name="_csrf" value="<%= csrfToken %>">
```

#### 3. 输入验证

```javascript
const validator = require('validator');

// 验证用户输入
function validateUserInput(input) {
  const errors = [];
  
  // 用户名验证
  if (!input.username || input.username.length < 3) {
    errors.push('用户名至少 3 个字符');
  }
  if (!validator.isAlphanumeric(input.username)) {
    errors.push('用户名只能包含字母和数字');
  }
  
  // 密码验证
  if (!input.password || input.password.length < 6) {
    errors.push('密码至少 6 个字符');
  }
  
  // 邮箱验证（如果有）
  if (input.email && !validator.isEmail(input.email)) {
    errors.push('邮箱格式不正确');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// 使用示例
app.post('/register', (req, res) => {
  const validation = validateUserInput(req.body);
  
  if (!validation.valid) {
    return res.render('auth/register', { 
      error: validation.errors.join(', ') 
    });
  }
  
  // ... 继续注册流程
});
```

---

## 核心系统详解

### 1. 加密系统 (AdvancedEncryption)

#### 密钥层级

```
┌─────────────────────────────────────────┐
│           Main Secret (主密钥)           │
│         用户设置的数字/字母密码          │
└─────────────────┬───────────────────────┘
                  │ 加密
┌─────────────────▼───────────────────────┐
│          Deputy Secret (副密钥)          │
│         64 位随机十六进制字符串           │
└─────────────────┬───────────────────────┘
                  │ 加密
┌─────────────────▼───────────────────────┐
│         System Secret (系统密钥)         │
│         64 位随机十六进制字符串           │
└─────────────────┬───────────────────────┘
                  │ 加密
┌─────────────────▼───────────────────────┐
│           File Secrets (文件密钥)        │
│         每个文件独立的 MD5 密钥           │
└─────────────────────────────────────────┘
```

#### 使用示例

```javascript
const encryption = new AdvancedEncryption('./data/secret.json');

// 加密内容
const content = '敏感数据';
const encrypted = encryption.encrypt(content, '/path/to/file');
// 返回：{ encryptedContent, encryptedFileKey, encryptedSystemKey, ... }

// 解密内容
const decrypted = encryption.decrypt(encryptedData, '/path/to/file');
```

#### 密钥管理

```javascript
// 更新主密钥
encryption.updateMainSecret('newMainSecret123');

// 更新副密钥
encryption.updateDeputySecret('64 位十六进制字符串');

// 更新系统密钥
encryption.updateSystemSecret('64 位十六进制字符串');

// 密钥轮换
const reencryptedData = encryption.rotateKeys(allEncryptedData);
```

### 2. 模块沙盒系统 (ModuleSandbox)

#### 沙盒隔离

模块在 VM 沙盒中运行，只能访问受限的全局变量和允许的 Node.js 模块：

**允许的内部模块**:
- `path`, `fs`, `crypto`, `util`, `events`, `stream`, `querystring`, `url`

**受限的全局变量**:
- `console` (重定向到 BSIO 日志)
- `process` (仅 `env` 和 `version`)
- `Buffer`, `setTimeout`, `setInterval` 等

#### 模块配置迁移

系统会自动迁移旧版模块配置：

```javascript
// 自动添加缺失的字段
ModuleSandbox.migrateConfig(config, moduleDir);
```

### 3. BSIO 日志系统

#### 日志等级

```javascript
const { BSIO, LogLevel } = require('./bsio');

const bsio = new BSIO({
  logLevel: LogLevel.DEBUG,  // DEBUG < INFO < WARNING < ERROR
  showColors: true,          // 启用彩色输出
  showTimestamp: true        // 显示时间戳
});

bsio.debug('调试信息');    // 蓝色
bsio.info('普通信息');     // 白色
bsio.warning('警告信息');  // 黄色
bsio.error('错误信息');    // 红色
```

#### 文件检查

```javascript
// 检查文件是否存在
const exists = bsio.checkFile('./data/config.json');

// 检查并创建文件
bsio.checkAndCreateFile(
  './data/config.json',
  { default: 'value' },
  __dirname
);

// 检查并修复 JSON 文件
bsio.checkAndFixJSON(
  './data/server.json',
  { 'update-log': [] },
  __dirname
);

// 打印文件报告
bsio.printFileReport();
```

#### 系统信息展示

```javascript
bsio.printSystemInfo({
  nodeVersion: process.version,
  npmVersion: '6.14.0',
  zcsVersion: '1.5.0.1'
});

bsio.printLoadedModules(['module-a', 'module-b']);
```

---

## 系统架构

### 目录结构详解

```
Zero-Core-Server/
├── server.js              # 主服务器文件（2768 行）
├── bsio.js                # BSIO 日志系统
├── package.json           # 项目配置
├── .gitignore             # Git 忽略配置
│
├── data/                  # 数据目录
│   ├── secret.json        # 加密密钥（敏感！）
│   │   └── 结构：
│   │       {
│   │         "main": { "secret": "主密钥" },
│   │         "deputy": { "secret": "加密的副密钥" },
│   │         "system": { "secret": "加密的系统密钥" },
│   │         "file": { "路径": { "secret": "文件密钥" } }
│   │       }
│   ├── server.json        # 服务器配置和更新日志
│   │   └── 包含：users, stats, forum, modules, update-log
│   └── user/              # 用户数据
│       └── {userId}/      # 用户个人目录
│           ├── avatar.jpg # 头像
│           └── intro/     # 个人简介
│               ├── background.jpg  # 背景图
│               └── text.json       # 简介内容
│
├── module/                # 模块目录
│   ├── {moduleName}/      # 模块文件夹
│   │   ├── setting.json   # 模块配置
│   │   ├── index.js       # 模块主逻辑
│   │   ├── views/         # 模块视图
│   │   └── public/        # 模块静态资源
│   └── data/
│       └── comments.json  # 模块评论数据
│
├── views/                 # 主视图目录
│   ├── index.ejs          # 主页
│   ├── system/            # 系统视图
│   │   ├── layout.ejs     # 布局模板
│   │   └── update-log.ejs # 更新日志
│   ├── user/              # 用户视图
│   │   ├── settings.ejs   # 设置页面
│   │   └── intro.ejs      # 个人简介
│   ├── auth/              # 认证视图
│   │   ├── login.ejs      # 登录页面
│   │   └── register.ejs   # 注册页面
│   ├── admin/             # 管理视图
│   │   ├── overview.ejs   # 总览页面
│   │   ├── users.ejs      # 用户管理
│   │   └── system.ejs     # 系统控制
│   ├── forum/             # 论坛视图
│   │   ├── index.ejs      # 论坛首页
│   │   ├── category.ejs   # 分类页面
│   │   ├── new.ejs        # 发帖页面
│   │   ├── post.ejs       # 帖子详情
│   │   └── edit.ejs       # 编辑帖子
│   └── modules/           # 模块视图
│       └── list.ejs       # 模块列表
│
└── public/                # 静态资源
    ├── css/
    │   └── style.css      # 主样式文件（607 行）
    ├── js/
    │   └── main.js        # 主脚本文件（148 行）
    ├── images/            # 图片资源
    │   ├── default-avatar.png
    │   └── default-background.jpg
    └── favicon.ico
```

### 权限系统

| 权限等级 | 标识 | 说明 | 特殊能力 |
|----------|------|------|----------|
| user | `user` | 普通用户 | 基本功能 |
| admin | `admin` | 管理员 | 用户管理、论坛管理 |
| developer | `developer` | 开发者 | 模块开发、调试 |
| system | `system` | 系统管理员 | 所有权限、密钥管理 |

**权限获取**:
- 第一个注册用户自动获得 `system` 权限
- UUID 固定为 `0000-0000-0000-0000`
- 其他用户通过管理员提升权限

### 数据库结构

```json
{
  "users": [
    {
      "name": "用户名",
      "UUID": "0000-0000-0000-0000",
      "code": { "encryptedContent": "...", "salt1": "...", ... },
      "author": "system",
      "avatar": "/data/user/0000-0000-0000-0000/avatar.jpg",
      "time": "2026-01-05T00:00:00.000Z",
      "points": 0,
      "friends": [],
      "theme": "dark",
      "lastLoginDate": "2026-03-16"
    }
  ],
  "stats": {
    "visitCount": 1000,
    "userCount": 10
  },
  "update-log": [
    {
      "1": "修复 BSIO 在 Windows 终端颜色显示问题",
      "2": "修复 BSIO printHeader 居中计算问题",
      "3": "清理 server.json 只保留更新日志",
      "version": "1.5.0.1",
      "quantity": 3,
      "time": "2026-03-02"
    }
  ],
  "forum": {
    "posts": [
      {
        "id": "abc123",
        "title": "帖子标题",
        "content": "帖子内容",
        "category": "tech",
        "author": "作者名",
        "authorId": "UUID",
        "createdAt": "2026-03-16T12:00:00.000Z",
        "updatedAt": "2026-03-16T12:00:00.000Z",
        "replies": []
      }
    ],
    "categories": [
      { "id": "general", "name": "综合讨论", "description": "一般性话题讨论区" },
      { "id": "tech", "name": "技术交流", "description": "技术相关话题讨论区" },
      { "id": "feedback", "name": "意见反馈", "description": "对零核服务器的意见和建议" }
    ]
  },
  "modules": {
    "favorites": {
      "module-id-1": ["UUID1", "UUID2"],
      "module-id-2": ["UUID1"]
    },
    "comments": {
      "module-id-1": [
        {
          "id": "1234567890",
          "userId": "UUID",
          "userName": "用户名",
          "content": "评论内容",
          "createdAt": "2026-03-16T12:00:00.000Z",
          "parentId": null,
          "replies": []
        }
      ]
    }
  },
  "chat": [
    {
      "key": "UUID1_UUID2",
      "participants": ["UUID1", "UUID2"],
      "messages": [
        {
          "sender": "UUID1",
          "recipient": "UUID2",
          "content": "消息内容",
          "timestamp": "2026-03-16T12:00:00.000Z"
        }
      ]
    }
  ],
  "ann": {
    "text": "系统公告内容"
  }
}
```

---

## 二次开发指南

### 扩展服务器功能

#### 1. 添加新的路由

在 `server.js` 中添加路由：

```javascript
// 在适当位置添加
app.get('/api/custom/endpoint', (req, res) => {
  // 权限验证
  if (!req.session || !req.session.userId) {
    return res.json({ success: false, error: '未登录' });
  }

  // 业务逻辑
  const result = doSomething();

  res.json({ success: true, data: result });
});
```

#### 2. 添加中间件

```javascript
// 权限验证中间件
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.session || !req.session.userPermission) {
      return res.status(403).json({ error: '无权限' });
    }

    const userPerm = req.session.userPermission;
    const permLevels = { 'user': 0, 'admin': 1, 'developer': 2, 'system': 3 };

    if (permLevels[userPerm] < permLevels[permission]) {
      return res.status(403).json({ error: '权限不足' });
    }

    next();
  };
}

// 使用
app.post('/api/admin/action', requirePermission('admin'), (req, res) => {
  // ...
});
```

#### 3. 扩展 BSIO 日志系统

```javascript
// 在 bsio.js 中添加新的日志方法
printSuccess(message) {
  console.log(this.applyColor(`✓ ${message}`, colors.green));
}

// 使用
bsio.printSuccess('操作完成');
```

### 自定义视图

#### 1. 添加新页面

在 `views/` 目录下创建 EJS 文件：

```html
<!-- views/custom/page.ejs -->
<%- include('../system/layout', { title: '自定义页面' }) %>

<div class="custom-page">
  <h1><%= title %></h1>
  <p><%= content %></p>
</div>
```

#### 2. 添加路由

```javascript
app.get('/custom/page', (req, res) => {
  res.render('custom/page', {
    title: '自定义页面',
    content: '页面内容'
  });
});
```

### 数据库扩展

当前系统使用 JSON 文件存储数据，如需扩展：

```javascript
// 读取数据
const db = JSON.parse(fs.readFileSync('./data/server.json', 'utf8'));

// 修改数据
db.users.push(newUser);

// 保存数据
fs.writeFileSync('./data/server.json', JSON.stringify(db, null, 2));
```

### 集成第三方服务

#### 1. 时间 API

```javascript
// 获取三方时间
app.get('/api/time', async (req, res) => {
  const response = await fetch('https://api.worldtimeapi.org/api/ip');
  const data = await response.json();
  res.json({ time: data.datetime });
});
```

#### 2. Socket.IO 实时通信

```javascript
const io = require('socket.io')(server);

io.on('connection', (socket) => {
  console.log('用户连接:', socket.id);
  
  socket.on('message', (data) => {
    io.emit('message', data);
  });
  
  socket.on('disconnect', () => {
    console.log('用户断开连接:', socket.id);
  });
});
```

---

## 常见问题

### 启动与配置问题

#### Q1: 启动时提示端口被占用

**解决方案**: 修改启动端口

```bash
# 方法 1: 使用环境变量
PORT=5001 npm start

# 方法 2: 修改 server.js
const PORT = process.env.PORT || 5001;
```

#### Q2: 加密密钥文件丢失

**解决方案**: 删除 `data/secret.json`，重启服务器会自动生成新密钥。

⚠️ **注意**: 这会导致之前加密的数据无法解密！建议定期备份密钥文件。

#### Q3: 模块无法加载

**检查清单**:
- [ ] `setting.json` 配置是否正确
- [ ] `main` 指定的入口文件是否存在
- [ ] 模块目录权限是否正确
- [ ] 查看 BSIO 日志中的错误信息

**调试步骤**:
```javascript
// 在 server.js 中查看模块加载日志
bsio.debug(`尝试加载模块：${module.name}`);
```

#### Q4: 颜色在 Windows 终端不显示

**解决方案**: BSIO 已自动处理，确保使用 Windows 10 build 10586+ 或 Windows Terminal。

如仍有问题，检查：
1. 终端是否支持 ANSI 转义序列
2. 是否使用了兼容的命令行工具（推荐 Windows Terminal）

#### Q5: Session 失效过快

**解决方案**: 修改 session 配置

```javascript
app.use(session({
  // ...
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 天
}));
```

#### Q5.5: 模块视图引擎错误（`require('js')` 错误）

**现象**: 加载模块时出现 `Error: Cannot find module 'js'` 或类似错误

**原因**: 模块的 `setting.json` 中 `viewEngine` 配置了不支持的值（如 `'js'`、`'html'`）

**解决方案**:

1. **检查模块配置**
   ```json
   // 检查 module/模块名/setting.json
   {
     "viewEngine": "js"  // ❌ 错误
   }
   ```

2. **修改为支持的引擎**
   ```json
   {
     "viewEngine": "ejs"  // ✅ 正确
   }
   ```

3. **系统已自动修复**
   - 系统现在会自动检测不支持的引擎并回退到 EJS
   - 会在控制台输出警告信息
   - 模块仍可正常运行

**支持的视图引擎**:
- `ejs`（默认）
- `handlebars`（.hbs 文件）
- `pug`（.pug 文件）
- `mustache`（.mustache 文件）

### 用户与权限问题

#### Q6: 第一个用户注册失败

**现象**: 注册第一个用户后没有获得 system 权限

**原因**: 数据库中已存在 UUID 为 "0000-0000-0000-0000" 的用户

**解决方案**:
1. 检查 `data/server.json` 中 users 数组
2. 删除该文件或清空 users 数组后重新注册

#### Q7: 无法修改用户权限

**现象**: 管理员用户无法修改其他用户权限

**原因**: 只有 `system` 权限用户可以修改权限

**解决方案**:
1. 手动编辑 `data/server.json`
2. 找到目标用户的 `author` 字段
3. 修改为 `admin`、`developer` 或 `system`
4. 保存并重启服务器

#### Q8: 登录后立即被踢出

**可能原因**:
1. Session 配置问题
2. Cookie 被浏览器阻止
3. 使用了无痕模式

**解决方案**:
1. 检查浏览器是否允许 Cookie
2. 清除浏览器缓存
3. 检查 session 配置中的 `secret` 是否一致

### 模块开发问题

#### Q9: 模块视图无法渲染

**现象**: 访问模块页面显示空白或错误

**检查清单**:
- [ ] 视图文件是否在 `views/` 目录下
- [ ] 视图引擎配置是否正确
- [ ] 视图文件扩展名是否匹配

**示例配置**:
```json
{
  "viewEngine": "ejs",
  "main": "index.js"
}
```

**视图文件**: `views/index.ejs`

#### Q10: 模块 API 无法调用

**调试步骤**:
1. 检查模块是否导出 `api` 函数
2. 查看 BSIO 日志中的错误信息
3. 确认路由配置正确

```javascript
// 正确的模块导出格式
module.exports = {
  init: function() {},
  api: function(method, path, params) {
    return { success: true };
  }
};
```

#### Q11: 模块无法访问 Node.js 模块

**原因**: 沙盒安全限制

**允许的模块**: `path`, `fs`, `crypto`, `util`, `events`, `stream`, `querystring`, `url`

**解决方案**: 如需使用其他模块，需要在 `server.js` 的 `createRestrictedRequire` 方法中添加。

### 数据库问题

#### Q12: 数据库文件损坏

**现象**: 启动时提示 JSON 解析错误

**解决方案**:
1. 备份当前数据
2. 删除 `data/server.json`
3. 重启服务器自动重建

**预防措施**: 定期备份数据文件

#### Q13: 用户数据丢失

**可能原因**:
1. 用户目录被误删
2. 数据库文件损坏
3. UUID 变更

**恢复步骤**:
1. 从备份恢复 `data/server.json`
2. 恢复 `data/user/` 目录
3. 检查用户 UUID 是否一致

### 论坛与聊天问题

#### Q14: 论坛帖子无法显示

**检查清单**:
- [ ] 数据库 forum 字段是否存在
- [ ] 帖子数据格式是否正确
- [ ] Markdown 渲染函数是否正常

**手动修复**:
```javascript
// 在 server.js 中检查 forum 数据结构
const db = JSON.parse(fs.readFileSync('./data/server.json', 'utf8'));
if (!db.forum) {
  db.forum = { posts: [], categories: [] };
  fs.writeFileSync('./data/server.json', JSON.stringify(db, null, 2));
}
```

#### Q15: 聊天消息发送失败

**常见错误**:
1. "必须先添加对方为好友" - 检查好友关系
2. "接收者不存在" - 确认用户 UUID 正确
3. "消息内容过长" - 限制 500 字以内

### 性能问题

#### Q16: 服务器响应变慢

**可能原因**:
1. 数据库文件过大
2. 缓存未生效
3. 模块数量过多

**优化建议**:
1. 定期清理旧数据
2. 调整缓存时间 `CACHE_DURATION`
3. 按需加载模块

#### Q17: 内存占用过高

**监控方法**:
```javascript
// 在管理面板查看内存使用
const memoryUsage = process.memoryUsage();
console.log(memoryUsage);
```

**解决方案**:
1. 重启服务器释放内存
2. 检查是否有内存泄漏
3. 限制聊天记录数量

### 安全问题

#### Q18: 如何防止 XSS 攻击

**已实现措施**:
1. HTML 标签转义
2. Markdown 渲染时过滤危险标签

**建议**:
- 不要直接渲染用户输入的 HTML
- 使用 `renderForumMarkdown` 等安全函数

#### Q19: 如何保护 API 接口

**权限验证中间件**:
```javascript
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
}
```

**使用示例**:
```javascript
app.get('/api/protected', requireAuth, (req, res) => {
  // 受保护的接口
});
```

#### Q20: 密钥轮换后数据无法解密

**原因**: 密钥轮换后旧数据未重新加密

**解决方案**:
1. 使用 `updateDeputySecret` 或 `updateSystemSecret` 时提供回调函数
2. 回调函数中重新加密所有数据
3. 保存更新后的数据库

```javascript
encryption.updateDeputySecret(newSecret, (enc) => {
  // 重新加密所有用户密码
  db.users.forEach(user => {
    const decrypted = enc.decrypt(user.code);
    user.code = enc.encrypt(decrypted);
  });
  writeDatabase(db);
});
```

---

## 更新日志

详见 [更新日志页面](https://github.com/NSCS-00/ZCS/releases) 或服务器内 `/update-log` 页面。

### 最新版本：v1.5.0.1

- 修复 BSIO 在 Windows 终端颜色显示问题
- 修复 BSIO printHeader 居中计算问题
- 清理 server.json 只保留更新日志

---

## 许可证

MIT License

Copyright (c) 2026 等离子工作室

---

## 相关链接

- [GitHub 仓库](https://github.com/NSCS-00/ZCS)
- [问题反馈](https://github.com/NSCS-00/ZCS/issues)
- [NPM 包](https://www.npmjs.com/package/zero-core-server)

---

<div align="center">

**零核服务器** - 简洁、高效、可扩展的 Node.js 服务器框架

Made with ❤️ by 等离子工作室

</div>
