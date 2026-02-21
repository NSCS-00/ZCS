/**
 * 零核服务器模块沙盒管理系统
 * Module Sandbox Management System
 * 
 * 提供模块隔离执行环境，支持多视图引擎
 * 支持旧版模块配置自动迁移
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ejs = require('ejs');

class ModuleSandbox {
  constructor(modulePath, moduleConfig, app) {
    this.modulePath = modulePath;
    this.config = moduleConfig;
    this.app = app;
    this.sandbox = null;
    this.context = null;
    this.initialized = false;
    
    // 初始化沙盒环境
    this.initSandbox();
  }

  /**
   * 迁移旧版配置到新版格式
   * @param {Object} config - 原始配置对象
   * @param {String} moduleDir - 模块目录名
   * @returns {Object} 迁移后的配置对象
   */
  static migrateConfig(config, moduleDir) {
    const migratedConfig = { ...config };
    let needsMigration = false;
    let migrationNotes = [];

    // 检查是否为旧版配置（缺少新字段）
    if (!config.description) {
      migratedConfig.description = config.intro || '模块描述';
      needsMigration = true;
      migrationNotes.push('添加了 description 字段');
    }

    if (!config.author) {
      migratedConfig.author = '未知作者';
      needsMigration = true;
      migrationNotes.push('添加了 author 字段');
    }

    if (!config.viewEngine) {
      // 根据 main 文件扩展名推断视图引擎
      const ext = path.extname(config.main || '').toLowerCase();
      if (ext === '.hbs') {
        migratedConfig.viewEngine = 'handlebars';
      } else if (ext === '.pug') {
        migratedConfig.viewEngine = 'pug';
      } else if (ext === '.mustache') {
        migratedConfig.viewEngine = 'mustache';
      } else {
        migratedConfig.viewEngine = 'ejs';
      }
      needsMigration = true;
      migrationNotes.push(`添加了 viewEngine 字段 (推断为 ${migratedConfig.viewEngine})`);
    }

    if (!config.language) {
      migratedConfig.language = 'javascript';
      needsMigration = true;
      migrationNotes.push('添加了 language 字段');
    }

    if (!config.permissions) {
      migratedConfig.permissions = ['read'];
      needsMigration = true;
      migrationNotes.push('添加了 permissions 字段');
    }

    if (!config.dependencies) {
      migratedConfig.dependencies = [];
      needsMigration = true;
      migrationNotes.push('添加了 dependencies 字段');
    }

    if (!config.routes) {
      migratedConfig.routes = [];
      needsMigration = true;
      migrationNotes.push('添加了 routes 字段');
    }

    // 如果 main 字段指向的是视图文件而非 JS 文件，需要调整
    if (config.main && /\.(ejs|hbs|pug|mustache)$/.test(config.main)) {
      // 旧版可能直接指向视图文件，新版应该指向 JS 入口文件
      const baseName = path.basename(config.main, path.extname(config.main));
      const jsEntryPoint = path.join(moduleDir, `${baseName}.js`);
      
      if (!fs.existsSync(path.join(moduleDir, config.main.replace(/^\//, '')))) {
        // 如果原文件不存在，尝试使用 JS 文件
        migratedConfig.main = `${baseName}.js`;
        needsMigration = true;
        migrationNotes.push(`更新了 main 字段为 ${migratedConfig.main}`);
      }
    }

    if (needsMigration) {
      console.log(`模块 ${config.name || moduleDir} 配置迁移：`, migrationNotes.join(', '));
    }

    return migratedConfig;
  }

  /**
   * 保存迁移后的配置
   * @param {String} modulePath - 模块路径
   * @param {Object} config - 迁移后的配置
   */
  static saveMigratedConfig(modulePath, config) {
    const settingPath = path.join(modulePath, 'setting.json');
    try {
      fs.writeFileSync(settingPath, JSON.stringify(config, null, 2), 'utf8');
      console.log(`模块配置已自动更新：${modulePath}`);
    } catch (error) {
      console.error(`保存迁移配置失败 ${modulePath}:`, error);
    }
  }

  /**
   * 初始化沙盒环境
   */
  initSandbox() {
    // 创建受限的全局对象
    const restrictedGlobals = {
      console: {
        log: (...args) => console.log(`[Module ${this.config.name}]`, ...args),
        error: (...args) => console.error(`[Module ${this.config.name}]`, ...args),
        warn: (...args) => console.warn(`[Module ${this.config.name}]`, ...args),
        info: (...args) => console.info(`[Module ${this.config.name}]`, ...args)
      },
      process: {
        env: {},
        version: process.version
      },
      Buffer: Buffer,
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
      setInterval: setInterval,
      clearInterval: clearInterval,
      setImmediate: setImmediate,
      clearImmediate: clearImmediate
    };

    // 创建沙盒上下文
    this.sandbox = vm.createContext({
      ...restrictedGlobals,
      module: { exports: {} },
      exports: {},
      require: this.createRestrictedRequire(),
      __moduleName: this.config.name,
      __moduleVersion: this.config.version,
      __modulePath: this.modulePath
    });

    this.initialized = true;
  }

  /**
   * 创建受限的require函数
   */
  createRestrictedRequire() {
    const allowedModules = [
      'path',
      'fs',
      'crypto',
      'util',
      'events',
      'stream',
      'querystring',
      'url'
    ];

    return (moduleName) => {
      if (!allowedModules.includes(moduleName)) {
        throw new Error(`Module '${moduleName}' is not allowed in sandbox`);
      }
      return require(moduleName);
    };
  }

  /**
   * 加载模块代码
   */
  loadModuleCode() {
    const mainFile = path.join(this.modulePath, this.config.main);
    
    if (!fs.existsSync(mainFile)) {
      throw new Error(`Module main file not found: ${mainFile}`);
    }

    const code = fs.readFileSync(mainFile, 'utf8');
    
    try {
      const script = new vm.Script(code, {
        filename: mainFile,
        displayErrors: true
      });
      
      const result = script.runInContext(this.sandbox);
      return this.sandbox.module.exports || result;
    } catch (error) {
      console.error(`Error loading module ${this.config.name}:`, error);
      throw error;
    }
  }

  /**
   * 渲染模块视图
   */
  async renderView(viewName, data) {
    const viewEngine = this.config.viewEngine || 'ejs';
    const viewPath = path.join(this.modulePath, 'views', `${viewName}.${this.getViewExtension(viewEngine)}`);

    if (!fs.existsSync(viewPath)) {
      throw new Error(`View file not found: ${viewPath}`);
    }

    const viewContent = fs.readFileSync(viewPath, 'utf8');

    try {
      switch (viewEngine) {
        case 'ejs':
          return await this.renderEJS(viewContent, data);
        case 'handlebars':
          return await this.renderHandlebars(viewContent, data);
        case 'pug':
          return await this.renderPug(viewPath, data);
        case 'mustache':
          return await this.renderMustache(viewContent, data);
        default:
          return await this.renderEJS(viewContent, data);
      }
    } catch (error) {
      console.error(`Error rendering view ${viewName}:`, error);
      throw error;
    }
  }

  /**
   * 获取视图文件扩展名
   */
  getViewExtension(engine) {
    const extensions = {
      'ejs': 'ejs',
      'handlebars': 'hbs',
      'pug': 'pug',
      'mustache': 'mustache'
    };
    return extensions[engine] || 'ejs';
  }

  /**
   * 渲染EJS视图
   */
  async renderEJS(content, data) {
    return new Promise((resolve, reject) => {
      ejs.render(content, data, {
        filename: 'module-view',
        async: true
      }, (err, html) => {
        if (err) reject(err);
        else resolve(html);
      });
    });
  }

  /**
   * 渲染Handlebars视图
   */
  async renderHandlebars(content, data) {
    const handlebars = require('handlebars');
    const template = handlebars.compile(content);
    return template(data);
  }

  /**
   * 渲染Pug视图
   */
  async renderPug(viewPath, data) {
    const pug = require('pug');
    return pug.renderFile(viewPath, data);
  }

  /**
   * 渲染Mustache视图
   */
  async renderMustache(content, data) {
    const mustache = require('mustache');
    return mustache.render(content, data);
  }

  /**
   * 执行模块API
   */
  async executeAPI(method, path, params) {
    const moduleExports = this.loadModuleCode();
    
    if (typeof moduleExports.api === 'function') {
      return await moduleExports.api(method, path, params);
    }
    
    throw new Error('Module does not export an API function');
  }

  /**
   * 销毁沙盒
   */
  destroy() {
    this.sandbox = null;
    this.context = null;
    this.initialized = false;
  }
}

module.exports = ModuleSandbox;
