/**
 * BSIO - Better System I/O
 * 零核服务器高级系统 IO 模块
 * 提供彩色日志输出、文件检查、自动补充等功能
 */

const fs = require('fs');
const path = require('path');

// ANSI 颜色代码
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  
  // 前景色
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  
  // 背景色
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m'
};

// IO 等级配置
const LogLevel = {
  DEBUG: { level: 0, color: colors.blue, label: 'DEBUG' },
  INFO: { level: 1, color: colors.white, label: 'INFO' },
  WARNING: { level: 2, color: colors.yellow, label: 'WARNING' },
  ERROR: { level: 3, color: colors.red, label: 'ERROR' }
};

class BSIO {
  constructor(options = {}) {
    this.logLevel = options.logLevel || LogLevel.INFO;
    this.showTimestamp = options.showTimestamp !== false;
    this.showColors = options.showColors !== false;
    this.checkedFiles = [];
    this.missingFiles = [];
    this.supplementedFiles = [];
  }

  /**
   * 格式化时间戳
   * @returns {string} 格式化的时间戳 [年。月。日 时：分：秒]
   */
  formatTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    return `[${year}.${month}.${day} ${hours}:${minutes}:${seconds}]`;
  }

  /**
   * 应用颜色到文本
   * @param {string} text - 要着色的文本
   * @param {string} colorCode - ANSI 颜色代码
   * @returns {string} 着色后的文本
   */
  applyColor(text, colorCode) {
    if (!this.showColors) {
      return text;
    }
    return `${colorCode}${text}${colors.reset}`;
  }

  /**
   * 输出日志
   * @param {string} message - 日志消息
   * @param {object} level - 日志等级
   */
  log(message, level = LogLevel.INFO) {
    if (level.level < this.logLevel.level) {
      return;
    }

    const timestamp = this.showTimestamp ? this.formatTimestamp() : '';
    const levelLabel = this.applyColor(level.label, level.color);
    const levelTag = `[${levelLabel}]`;
    
    // 颜色应用到整条信息
    const coloredMessage = this.applyColor(message, level.color);
    const logLine = `${timestamp}${levelTag}${coloredMessage}`;
    console.log(logLine);
  }

  debug(message) {
    this.log(message, LogLevel.DEBUG);
  }

  info(message) {
    this.log(message, LogLevel.INFO);
  }

  warning(message) {
    this.log(message, LogLevel.WARNING);
  }

  error(message) {
    this.log(message, LogLevel.ERROR);
  }

  /**
   * 打印分隔线
   * @param {string} char - 分隔线字符
   * @param {number} length - 分隔线长度
   */
  printSeparator(char = '-', length = 50) {
    console.log(this.applyColor(char.repeat(length), colors.dim));
  }

  /**
   * 打印系统信息头部
   */
  printHeader() {
    const header = '零核服务器';
    const separatorLength = 50;
    const padding = Math.floor((separatorLength - header.length) / 2);
    
    console.log(this.applyColor('-'.repeat(separatorLength), colors.dim));
    console.log(this.applyColor(header.padStart(padding + header.length).padEnd(separatorLength + padding), colors.cyan));
    console.log(this.applyColor('-'.repeat(separatorLength), colors.dim));
  }

  /**
   * 打印系统信息
   * @param {object} info - 系统信息对象
   */
  printSystemInfo(info) {
    this.printHeader();
    if (info.nodeVersion) {
      console.log(`${this.applyColor('Node.js 版本:', colors.white)} ${this.applyColor(info.nodeVersion, colors.white)}`);
    }
    if (info.npmVersion) {
      console.log(`${this.applyColor('npm 版本:', colors.white)} ${this.applyColor(info.npmVersion, colors.white)}`);
    }
    if (info.zcsVersion) {
      console.log(`${this.applyColor('ZCS 版本:', colors.white)} ${this.applyColor(info.zcsVersion, colors.white)}`);
    }
    console.log(this.applyColor('-'.repeat(50), colors.dim));
  }

  /**
   * 打印模块加载信息
   * @param {array} modules - 已加载模块列表
   */
  printLoadedModules(modules) {
    console.log(this.applyColor('已加载模块:', colors.white));
    modules.forEach(module => {
      console.log(`  ${this.applyColor('✓', colors.green)} ${this.applyColor(module, colors.white)}`);
    });
    console.log(this.applyColor('-'.repeat(50), colors.dim));
  }

  /**
   * 检查文件是否存在
   * @param {string} filePath - 文件路径
   * @param {string} basePath - 基础路径（用于显示相对路径）
   * @returns {boolean} 文件是否存在
   */
  checkFile(filePath, basePath = '') {
    const relativePath = basePath ? path.relative(basePath, filePath) : filePath;
    const exists = fs.existsSync(filePath);
    
    this.checkedFiles.push(relativePath);
    
    if (!exists) {
      this.missingFiles.push(relativePath);
      this.debug(`检查 [${relativePath}] - ${this.applyColor('缺失', colors.red)}`);
    } else {
      this.debug(`检查 [${relativePath}] - ${this.applyColor('存在', colors.green)}`);
    }
    
    return exists;
  }

  /**
   * 检查并创建文件
   * @param {string} filePath - 文件路径
   * @param {string|object} defaultContent - 默认内容
   * @param {string} basePath - 基础路径（用于显示相对路径）
   */
  checkAndCreateFile(filePath, defaultContent = '', basePath = '') {
    const relativePath = basePath ? path.relative(basePath, filePath) : filePath;
    const dir = path.dirname(filePath);
    
    this.checkedFiles.push(relativePath);
    
    if (!fs.existsSync(filePath)) {
      // 确保目录存在
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        this.debug(`创建目录 [${path.relative(basePath, dir)}]`);
      }
      
      // 创建文件
      const content = typeof defaultContent === 'object' ? JSON.stringify(defaultContent, null, 2) : defaultContent;
      fs.writeFileSync(filePath, content);
      
      this.missingFiles.push(relativePath);
      this.supplementedFiles.push(relativePath);
      this.info(`补充 [${relativePath}]`);
      return true;
    }
    
    return false;
  }

  /**
   * 检查 JSON 文件结构
   * @param {string} filePath - 文件路径
   * @param {object} defaultStructure - 默认结构
   * @param {string} basePath - 基础路径
   * @returns {boolean} 是否补充了文件
   */
  checkAndFixJSON(filePath, defaultStructure, basePath = '') {
    const relativePath = basePath ? path.relative(basePath, filePath) : filePath;
    this.checkedFiles.push(relativePath);
    
    if (!fs.existsSync(filePath)) {
      // 文件不存在，创建
      this.checkAndCreateFile(filePath, defaultStructure, basePath);
      return true;
    }
    
    try {
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      let needsFix = false;
      
      // 检查必要字段
      for (const key in defaultStructure) {
        if (!(key in content)) {
          content[key] = defaultStructure[key];
          needsFix = true;
        }
      }
      
      if (needsFix) {
        fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
        this.supplementedFiles.push(relativePath);
        this.info(`修复 [${relativePath}]`);
        return true;
      }
      
      return false;
    } catch (error) {
      // 文件损坏，重新创建
      this.warning(`文件损坏 [${relativePath}]: ${error.message}`);
      fs.writeFileSync(filePath, JSON.stringify(defaultStructure, null, 2));
      this.supplementedFiles.push(relativePath);
      this.info(`重建 [${relativePath}]`);
      return true;
    }
  }

  /**
   * 打印文件检查报告
   */
  printFileReport() {
    this.printSeparator('-', 50);
    this.info(`共检查${this.checkedFiles.length}个文件，缺失文件${this.missingFiles.length}个`);
    
    if (this.supplementedFiles.length > 0) {
      this.info(`开始补充缺失文件......`);
      this.supplementedFiles.forEach(file => {
        this.info(`补充 [${file}]`);
      });
      this.info(`缺失文件补充完成`);
    }
  }

  /**
   * 重置统计
   */
  reset() {
    this.checkedFiles = [];
    this.missingFiles = [];
    this.supplementedFiles = [];
  }
}

// 导出
module.exports = {
  BSIO,
  LogLevel,
  colors
};
