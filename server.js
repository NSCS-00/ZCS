const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const multer = require('multer');
const sharp = require('sharp');
const bodyParser = require('body-parser');
const http = require('http');
const os = require('os');
const vm = require('vm');
const ejs = require('ejs');
const handlebars = require('handlebars');
const pug = require('pug');
const mustache = require('mustache');
const { BSIO, LogLevel } = require('./bsio');
const { ZCNET_CONFIG, CreditPoolManager, ZCnetNetwork } = require('./zcnet');

// 初始化 BSIO
const bsio = new BSIO({ logLevel: LogLevel.DEBUG, showColors: true });

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// 模块沙盒管理器
const moduleSandboxes = new Map();

// ============================================
// 高级加密模块 (原 encryption.js)
// ============================================
class AdvancedEncryption {
  constructor(secretFilePath = './data/secret.json') {
    this.secretFilePath = secretFilePath;
    this.ensureSecretFileExists();
    this.loadSecrets();
  }

  ensureSecretFileExists() {
    if (!fs.existsSync(path.dirname(this.secretFilePath))) {
      fs.mkdirSync(path.dirname(this.secretFilePath), { recursive: true });
    }

    if (!fs.existsSync(this.secretFilePath)) {
      const defaultStructure = {
        main: { secret: "0000" },
        deputy: { secret: "" },
        system: { secret: "" },
        file: {}
      };
      fs.writeFileSync(this.secretFilePath, JSON.stringify(defaultStructure, null, 2));
    }
  }

  loadSecrets() {
    const secretsData = JSON.parse(fs.readFileSync(this.secretFilePath, 'utf8'));
    this.mainSecret = secretsData.main.secret;

    if (secretsData.deputy && secretsData.deputy.secret && secretsData.deputy.secret !== "") {
      try {
        this.deputySecret = this.decryptSimple(secretsData.deputy.secret, this.mainSecret);
      } catch (e) {
        console.error('Failed to decrypt deputy key:', e);
        this.deputySecret = null;
      }
    } else {
      this.deputySecret = null;
    }

    if (secretsData.system && secretsData.system.secret && this.deputySecret && secretsData.system.secret !== "") {
      try {
        this.systemSecret = this.decryptSimple(secretsData.system.secret, this.deputySecret);
      } catch (e) {
        console.error('Failed to decrypt system key:', e);
        this.systemSecret = null;
      }
    } else {
      this.systemSecret = null;
    }

    this.fileSecrets = secretsData.file || {};
    this.autoGenerateMissingKeys();
  }

  autoGenerateMissingKeys() {
    let updated = false;

    if (!this.deputySecret) {
      this.deputySecret = this.generateRandomKey();
      bsio.info('Generated new deputy key');
      updated = true;
    }

    if (!this.systemSecret) {
      this.systemSecret = this.generateRandomKey();
      bsio.info('Generated new system key');
      updated = true;
    }

    if (updated) {
      this.saveSecrets();
    }
  }

  saveSecrets() {
    const secretsData = {
      main: { secret: this.mainSecret },
      deputy: {
        secret: this.deputySecret && this.mainSecret ?
          this.encryptSimple(this.deputySecret, this.mainSecret) : ""
      },
      system: {
        secret: this.systemSecret && this.deputySecret ?
          this.encryptSimple(this.systemSecret, this.deputySecret) : ""
      },
      file: this.fileSecrets
    };
    const jsonData = JSON.stringify(secretsData, null, 2);
    fs.writeFileSync(this.secretFilePath, jsonData);

    try {
      fs.chmodSync(this.secretFilePath, 0o600);
    } catch (err) {
      console.warn('Could not set file permissions on secret file:', err.message);
    }
  }

  encryptSimple(data, password) {
    if (!data || !password) {
      throw new Error('Data and password are required for encryption');
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `${salt}:${iv.toString('hex')}:${encrypted}`;
  }

  decryptSimple(encryptedData, password) {
    if (!encryptedData || !password) {
      throw new Error('Encrypted data and password are required for decryption');
    }

    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const [salt, ivHex, encrypted] = parts;
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  generateSalt(seed = null) {
    const seedValue = seed || this.mainSecret;
    const platform = os.platform();
    const arch = os.arch();
    const release = os.release();
    const hostname = os.hostname();
    const time = Date.now().toString();
    const primaryEntropy = crypto.randomBytes(32).toString('hex');

    const cpus = os.cpus();
    const totalCpuTime = cpus.reduce((acc, cpu) => {
      const times = cpu.times;
      return acc + times.user + times.nice + times.sys + times.idle;
    }, 0);
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    const saltBase = `${primaryEntropy}${seedValue}${platform}${arch}${release}${hostname}${time}${totalCpuTime}${usedMem}`;
    return crypto.createHash('sha256').update(saltBase).digest('hex');
  }

  deriveKey(password, salt, keyLen = 32) {
    if (!password || !salt) {
      throw new Error('Password and salt are required for key derivation');
    }
    return crypto.pbkdf2Sync(password, salt, 100000, keyLen, 'sha256');
  }

  createFileKey(content) {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  generateSystemKey() {
    const time = Math.floor(Date.now() / (10 * 24 * 60 * 60 * 1000));
    const platform = os.platform();
    const arch = os.arch();
    const release = os.release();
    const hostname = os.hostname();
    const entropy = crypto.randomBytes(16).toString('hex');
    return `${time}${platform}${arch}${release}${hostname}${entropy}`;
  }

  generateRandomKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  encrypt(content, filePath = null) {
    const fileKey = this.createFileKey(content);

    if (filePath) {
      this.fileSecrets[filePath] = { secret: fileKey };
      this.saveSecrets();
    }

    const salt1 = this.generateSalt(fileKey);
    const derivedFileKey = this.deriveKey(fileKey, salt1);
    const iv1 = crypto.randomBytes(16);
    const cipher1 = crypto.createCipheriv('aes-256-cbc', derivedFileKey, iv1);
    let encryptedContent = cipher1.update(content, 'utf8', 'hex');
    encryptedContent += cipher1.final('hex');

    let encryptedFileKey = '';
    let salt2 = '';
    let iv2Str = '';
    if (this.systemSecret) {
      salt2 = this.generateSalt(this.systemSecret);
      const derivedSystemKey = this.deriveKey(this.systemSecret, salt2);
      const iv2 = crypto.randomBytes(16);
      const cipher2 = crypto.createCipheriv('aes-256-cbc', derivedSystemKey, iv2);
      encryptedFileKey = cipher2.update(fileKey, 'utf8', 'hex');
      encryptedFileKey += cipher2.final('hex');
      iv2Str = iv2.toString('hex');
    } else {
      encryptedFileKey = fileKey;
      salt2 = this.generateSalt(fileKey);
      iv2Str = '';
    }

    let encryptedSystemKey = '';
    let salt3 = '';
    let iv3Str = '';
    if (this.mainSecret && this.systemSecret) {
      salt3 = this.generateSalt(this.mainSecret);
      const derivedMainKey = this.deriveKey(this.mainSecret, salt3);
      const iv3 = crypto.randomBytes(16);
      const cipher3 = crypto.createCipheriv('aes-256-cbc', derivedMainKey, iv3);
      encryptedSystemKey = cipher3.update(this.systemSecret, 'utf8', 'hex');
      encryptedSystemKey += cipher3.final('hex');
      iv3Str = iv3.toString('hex');
    } else if (this.mainSecret) {
      salt3 = this.generateSalt(this.mainSecret);
      const derivedMainKey = this.deriveKey(this.mainSecret, salt3);
      const iv3 = crypto.randomBytes(16);
      const cipher3 = crypto.createCipheriv('aes-256-cbc', derivedMainKey, iv3);
      encryptedSystemKey = cipher3.update(fileKey, 'utf8', 'hex');
      encryptedSystemKey += cipher3.final('hex');
      iv3Str = iv3.toString('hex');
    } else {
      encryptedSystemKey = fileKey;
      salt3 = this.generateSalt(fileKey);
      iv3Str = '';
    }

    return {
      encryptedContent: encryptedContent,
      encryptedFileKey: encryptedFileKey,
      encryptedSystemKey: encryptedSystemKey,
      salt1: salt1,
      salt2: salt2,
      salt3: salt3,
      iv1: iv1.toString('hex'),
      iv2: iv2Str,
      iv3: iv3Str,
      algorithm: 'aes-256-cbc'
    };
  }

  decrypt(encryptedData, filePath = null) {
    try {
      let decryptedSystemKey;
      let actualFileKey;

      if (this.mainSecret && encryptedData.iv3 && encryptedData.iv3 !== '') {
        const salt3 = encryptedData.salt3;
        const derivedMainKey = this.deriveKey(this.mainSecret, salt3);
        const iv3 = Buffer.from(encryptedData.iv3, 'hex');
        const decipher3 = crypto.createDecipheriv(encryptedData.algorithm, derivedMainKey, iv3);
        let decryptedWithMain = decipher3.update(encryptedData.encryptedSystemKey, 'hex', 'utf8');
        decryptedWithMain += decipher3.final('utf8');

        if (this.systemSecret) {
          decryptedSystemKey = decryptedWithMain;
        } else {
          actualFileKey = decryptedWithMain;
        }
      } else {
        decryptedSystemKey = encryptedData.encryptedSystemKey;
      }

      let decryptedFileKey;

      if (actualFileKey !== undefined) {
        decryptedFileKey = actualFileKey;
      } else {
        if (this.systemSecret && encryptedData.iv2 && encryptedData.iv2 !== '') {
          const salt2 = encryptedData.salt2;
          const derivedSystemKey = this.deriveKey(this.systemSecret, salt2);
          const iv2 = Buffer.from(encryptedData.iv2, 'hex');
          const decipher2 = crypto.createDecipheriv(encryptedData.algorithm, derivedSystemKey, iv2);
          try {
            decryptedFileKey = decipher2.update(encryptedData.encryptedFileKey, 'hex', 'utf8');
            decryptedFileKey += decipher2.final('utf8');
          } catch (decryptError) {
            decryptedFileKey = encryptedData.encryptedFileKey;
          }
        } else {
          decryptedFileKey = encryptedData.encryptedFileKey;
        }
      }

      const salt1 = encryptedData.salt1;
      const derivedFileKey = this.deriveKey(decryptedFileKey, salt1);
      const iv1 = Buffer.from(encryptedData.iv1, 'hex');
      const decipher1 = crypto.createDecipheriv(encryptedData.algorithm, derivedFileKey, iv1);
      let decryptedContent = decipher1.update(encryptedData.encryptedContent, 'hex', 'utf8');
      decryptedContent += decipher1.final('utf8');

      return decryptedContent;
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Decryption failed: Invalid key or corrupted data');
    }
  }

  updateMainSecret(newSecret) {
    if (!/^[a-zA-Z0-9]+$/.test(newSecret)) {
      throw new Error('Main secret must contain only letters and numbers');
    }

    const oldMainSecret = this.mainSecret;
    this.mainSecret = newSecret;

    if (this.deputySecret) {
      const encryptedDeputyWithOldMain = JSON.parse(fs.readFileSync(this.secretFilePath, 'utf8')).deputy.secret;
      let decryptedDeputy;
      try {
        decryptedDeputy = this.decryptSimple(encryptedDeputyWithOldMain, oldMainSecret);
      } catch (e) {
        console.error('Could not decrypt old deputy key with old main key');
      }

      if (decryptedDeputy) {
        this.deputySecret = decryptedDeputy;
      }
    }

    this.saveSecrets();
  }

  updateDeputySecret(newSecret = null, reencryptCallback = null) {
    if (newSecret === null) {
      newSecret = this.generateRandomKey();
    } else if (newSecret.length !== 64) {
      throw new Error('Deputy secret must be a 256-bit hex string (64 characters)');
    }

    const backupDeputySecret = this.deputySecret;

    try {
      this.deputySecret = newSecret;
      this.saveSecrets();

      if (reencryptCallback) {
        reencryptCallback(this);
      }
    } catch (error) {
      this.deputySecret = backupDeputySecret;
      this.saveSecrets();
      throw error;
    }
  }

  updateSystemSecret(newSecret = null, reencryptCallback = null) {
    if (newSecret === null) {
      newSecret = this.generateRandomKey();
    } else if (newSecret.length !== 64) {
      throw new Error('System secret must be a 256-bit hex string (64 characters)');
    }

    const backupSystemSecret = this.systemSecret;

    try {
      this.systemSecret = newSecret;
      this.saveSecrets();

      if (reencryptCallback) {
        reencryptCallback(this);
      }
    } catch (error) {
      this.systemSecret = backupSystemSecret;
      this.saveSecrets();
      throw error;
    }
  }

  needsSystemKeyRotation() {
    if (!this.systemSecret) return true;
    return false;
  }

  rotateKeys(allEncryptedData) {
    const backupMainSecret = this.mainSecret;
    const backupDeputySecret = this.deputySecret;
    const backupSystemSecret = this.systemSecret;
    const backupFileSecrets = { ...this.fileSecrets };

    try {
      const newDeputySecret = this.generateRandomKey();
      const newSystemSecret = this.generateRandomKey();

      const oldDeputySecret = this.deputySecret;
      const oldSystemSecret = this.systemSecret;
      this.deputySecret = newDeputySecret;
      this.systemSecret = newSystemSecret;

      const reencryptedData = {};
      for (const [key, encryptedEntry] of Object.entries(allEncryptedData)) {
        try {
          const decryptedContent = this.decrypt(encryptedEntry);
          reencryptedData[key] = this.encrypt(decryptedContent);
        } catch (decryptError) {
          console.error(`Failed to decrypt and re-encrypt data for key ${key}:`, decryptError);
          reencryptedData[key] = encryptedEntry;
        }
      }

      this.saveSecrets();

      return reencryptedData;
    } catch (error) {
      this.mainSecret = backupMainSecret;
      this.deputySecret = backupDeputySecret;
      this.systemSecret = backupSystemSecret;
      this.fileSecrets = backupFileSecrets;
      this.saveSecrets();

      throw new Error(`Key rotation failed: ${error.message}`);
    }
  }

  getMainSecret() {
    return this.mainSecret;
  }

  getDeputySecret() {
    return this.deputySecret;
  }

  getSystemSecret() {
    return this.systemSecret;
  }

  getFileSecrets() {
    return this.fileSecrets;
  }
}

// ============================================
// 模块沙盒管理系统 (原 module-sandbox.js)
// ============================================
class ModuleSandbox {
  constructor(modulePath, moduleConfig, app) {
    this.modulePath = modulePath;
    this.config = moduleConfig;
    this.app = app;
    this.sandbox = null;
    this.context = null;
    this.initialized = false;

    this.initSandbox();
  }

  static migrateConfig(config, moduleDir) {
    const migratedConfig = { ...config };
    let needsMigration = false;
    let migrationNotes = [];

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

    if (config.main && /\.(ejs|hbs|pug|mustache)$/.test(config.main)) {
      const baseName = path.basename(config.main, path.extname(config.main));
      const jsEntryPoint = path.join(moduleDir, `${baseName}.js`);

      if (!fs.existsSync(path.join(moduleDir, config.main.replace(/^\//, '')))) {
        migratedConfig.main = `${baseName}.js`;
        needsMigration = true;
        migrationNotes.push(`更新了 main 字段为 ${migratedConfig.main}`);
      }
    }

    if (needsMigration) {
      bsio.info(`模块 ${config.name || moduleDir} 配置迁移：`, migrationNotes.join(', '));
    }

    return migratedConfig;
  }

  static saveMigratedConfig(modulePath, config) {
    const settingPath = path.join(modulePath, 'setting.json');
    try {
      fs.writeFileSync(settingPath, JSON.stringify(config, null, 2), 'utf8');
      bsio.info(`模块配置已自动更新：${modulePath}`);
    } catch (error) {
      console.error(`保存迁移配置失败 ${modulePath}:`, error);
    }
  }

  initSandbox() {
    const restrictedGlobals = {
      console: {
        log: (...args) => bsio.log(`[Module ${this.config.name}] ${args.join(' ')}`, LogLevel.DEBUG),
        error: (...args) => bsio.error(`[Module ${this.config.name}] ${args.join(' ')}`),
        warn: (...args) => bsio.warning(`[Module ${this.config.name}] ${args.join(' ')}`),
        info: (...args) => bsio.info(`[Module ${this.config.name}] ${args.join(' ')}`)
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
      clearImmediate: clearImmediate,
      // 提供模块路径相关的变量
      __dirname: this.modulePath,
      __filename: path.join(this.modulePath, this.config.main || '')
    };

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

  loadModuleCode() {
    const mainFile = path.join(this.modulePath, this.config.main);

    if (!fs.existsSync(mainFile)) {
      throw new Error(`Module main file not found: ${mainFile}`);
    }

    // 检查文件扩展名，如果不是 JS 文件，返回空对象
    const ext = path.extname(mainFile).toLowerCase();
    if (!['.js', '.mjs', '.cjs'].includes(ext)) {
      // 非 JavaScript 文件，返回空模块导出
      return {
        init: () => {},
        api: null
      };
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

  renderView(viewName, data) {
    // 验证视图引擎配置，确保使用支持的引擎
    const supportedEngines = ['ejs', 'handlebars', 'pug', 'mustache'];
    let viewEngine = this.config.viewEngine || 'ejs';
    
    // 如果配置的引擎不支持，回退到 EJS
    if (!supportedEngines.includes(viewEngine)) {
      console.warn(`模块 ${this.config.name} 配置了不支持的视图引擎 '${viewEngine}'，将使用 EJS 代替`);
      viewEngine = 'ejs';
    }
    
    const viewPath = path.join(this.modulePath, 'views', `${viewName}.${this.getViewExtension(viewEngine)}`);

    if (!fs.existsSync(viewPath)) {
      throw new Error(`View file not found: ${viewPath}`);
    }

    const viewContent = fs.readFileSync(viewPath, 'utf8');

    try {
      switch (viewEngine) {
        case 'ejs':
          return this.renderEJS(viewContent, data);
        case 'handlebars':
          return this.renderHandlebars(viewContent, data);
        case 'pug':
          return this.renderPug(viewPath, data);
        case 'mustache':
          return this.renderMustache(viewContent, data);
        default:
          return this.renderEJS(viewContent, data);
      }
    } catch (error) {
      console.error(`Error rendering view ${viewName}:`, error);
      throw error;
    }
  }

  getViewExtension(engine) {
    const extensions = {
      'ejs': 'ejs',
      'handlebars': 'hbs',
      'pug': 'pug',
      'mustache': 'mustache'
    };
    return extensions[engine] || 'ejs';
  }

  renderEJS(content, data) {
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

  renderHandlebars(content, data) {
    const template = handlebars.compile(content);
    return template(data);
  }

  renderPug(viewPath, data) {
    return pug.renderFile(viewPath, data);
  }

  renderMustache(content, data) {
    return mustache.render(content, data);
  }

  executeAPI(method, path, params) {
    const moduleExports = this.loadModuleCode();

    if (typeof moduleExports.api === 'function') {
      return Promise.resolve(moduleExports.api(method, path, params));
    }

    return Promise.reject(new Error('Module does not export an API function'));
  }

  destroy() {
    this.sandbox = null;
    this.context = null;
    this.initialized = false;
  }
}

// 配置视图引擎
app.set('view engine', 'ejs');

// 视图路径映射 - 保持原有访问路径不变
const viewPathMap = {
  'settings': path.join(__dirname, 'views', 'user', 'settings.ejs'),
  'intro': path.join(__dirname, 'views', 'user', 'intro.ejs'),
  'update-log': path.join(__dirname, 'views', 'system', 'update-log.ejs'),
  'layout': path.join(__dirname, 'views', 'system', 'layout.ejs')
};

// 设置多个 views 目录
app.set('views', [
  path.join(__dirname, 'views'),
  path.join(__dirname, 'views', 'user'),
  path.join(__dirname, 'views', 'system')
]);

// 自定义 EJS 引擎来支持路径映射
const originalRenderFile = ejs.renderFile;

ejs.renderFile = function(filePath, data, options, callback) {
  // 如果是映射的视图名称，使用映射后的路径
  const viewName = path.basename(filePath, '.ejs');
  if (viewPathMap[viewName] && fs.existsSync(viewPathMap[viewName])) {
    return originalRenderFile(viewPathMap[viewName], data, options, callback);
  }
  return originalRenderFile(filePath, data, options, callback);
};

app.engine('ejs', ejs.__express);

// 中间件
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());

// Session配置
app.use(session({
  secret: 'zero-core-server-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24小时
}));

// Multer配置（用于头像和背景图上传）
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // 确保session存在
    if (!req.session || !req.session.userId) {
      return cb(new Error('未登录用户'), false);
    }

    const userId = req.session.userId;
    const uploadDir = path.join(__dirname, 'data', 'user', userId);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    if (file.fieldname === 'avatar') {
      cb(null, 'avatar.jpg');
    } else if (file.fieldname === 'background') {
      // 为背景图创建intro子目录
      const userId = req.session.userId;
      const uploadDir = path.join(__dirname, 'data', 'user', userId, 'intro');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, 'background.jpg');
    } else {
      cb(null, file.originalname);
    }
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 2 * 1024 * 1000 // 限制2MB
  },
  fileFilter: (req, file, cb) => {
    // 只接受图片文件
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传图片文件'), false);
    }
  }
});

// 数据库路径
const DB_PATH = path.join(__dirname, 'data', 'server.json');

// 初始化数据库
function initializeDatabase() {
  if (!fs.existsSync(DB_PATH)) {
    // 创建初始数据结构，但不创建默认用户
    const initialData = {
      users: [],  // 初始为空，第一个注册的用户将成为系统管理员
      stats: {
        visitCount: 0,
        userCount: 0
      },
      'update-log': [], // 保留更新日志
      forum: {
        posts: [],
        categories: [
          {
            id: "general",
            name: "综合讨论",
            description: "一般性话题讨论区"
          },
          {
            id: "tech",
            name: "技术交流",
            description: "技术相关话题讨论区"
          },
          {
            id: "feedback",
            name: "意见反馈",
            description: "对零核服务器的意见和建议"
          }
        ]
      },
      modules: {
        favorites: {},  // 模块收藏数据：{ moduleId: [userId1, userId2, ...] }
        comments: {}    // 模块评论数据：{ moduleId: [comment1, comment2, ...] }
      }
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
  } else {
    // 如果数据库文件存在但缺少 forum 或 chat 字段，则添加它们
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    let updated = false;

    if (!db.forum) {
      db.forum = {
        posts: [],
        categories: [
          {
            id: "general",
            name: "综合讨论",
            description: "一般性话题讨论区"
          },
          {
            id: "tech",
            name: "技术交流",
            description: "技术相关话题讨论区"
          },
          {
            id: "feedback",
            name: "意见反馈",
            description: "对零核服务器的意见和建议"
          }
        ]
      };
      updated = true;
    }

    if (!db.chat) {
      db.chat = []; // 聊天记录将存储在这里
      updated = true;
    }

    // 添加模块收藏数据字段
    if (!db.modules) {
      db.modules = {
        favorites: {},
        comments: {}
      };
      updated = true;
    }

    // 添加模块评论数据字段
    if (!db.modules.comments) {
      db.modules.comments = {};
      updated = true;
    }

    // 确保 users 字段存在
    if (!db.users) {
      db.users = [];
      updated = true;
    }

    // 确保 zcnet 字段存在
    if (!db.zcnet) {
      db.zcnet = { nodes: {}, creditPool: null };
      updated = true;
    }

    // 确保 stats 字段存在
    if (!db.stats) {
      db.stats = {
        visitCount: 0,
        userCount: 0
      };
      updated = true;
    }

    // 确保 update-log 字段存在
    if (!db['update-log']) {
      db['update-log'] = [];
      updated = true;
    }

    // 检查是否已有系统管理员用户
    const systemUserExists = db.users.some(user => user.UUID === "0000-0000-0000-0000");
    if (!systemUserExists && db.users.length > 0) {
      // 如果没有系统管理员用户但有其他用户，发出警告
      bsio.warning("警告：数据库中没有系统管理员用户 (UUID: 0000-0000-0000-0000)");
      bsio.warning("请确保第一个用户注册以获得系统权限");
    }

    if (updated) {
      fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    }
  }
}

// 初始化 ZCnet 网络和积分池管理器
const creditPool = new CreditPoolManager();
const zcnetNetwork = new ZCnetNetwork(encryption);

// 初始化高级加密模块
const encryption = new AdvancedEncryption('./data/secret.json');

// 加密函数 (使用新的加密模块)
const encrypt = (text, filePath = null) => {
  try {
    return encryption.encrypt(text, filePath);
  } catch (error) {
    console.error('Encryption failed:', error);
    throw error;
  }
};

// 解密函数 (使用新的加密模块)
const decrypt = (encryptedData, filePath = null) => {
  try {
    return encryption.decrypt(encryptedData, filePath);
  } catch (error) {
    console.error('Decryption failed:', error);
    throw error;
  }
};

// 数据库缓存
let dbCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5000; // 5秒缓存

// 读取数据库（带缓存）
function readDatabase() {
  try {
    const currentTime = Date.now();

    // 如果缓存有效且未过期，返回缓存
    if (dbCache && (currentTime - cacheTimestamp) < CACHE_DURATION) {
      return dbCache;
    }

    // 否则读取文件并更新缓存
    const data = fs.readFileSync(DB_PATH, 'utf8');
    dbCache = JSON.parse(data);
    cacheTimestamp = currentTime;
    return dbCache;
  } catch (error) {
    bsio.error(`数据库访问错误：IO 失败 - ${error.message}`);
    throw error;
  }
}

// WebSocket连接处理

// 写入数据库（同时更新缓存）
function writeDatabase(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    // 更新缓存
    dbCache = data;
    cacheTimestamp = Date.now();
  } catch (error) {
    bsio.error(`数据库访问错误：IO 失败 - ${error.message}`);
    throw error;
  }
}


// 生成UUID
function generateUUID() {
  let uuid = uuidv4().replace(/-/g, '').toLowerCase();
  // 格式化为 xxxx-xxxx-xxxx-xxxx
  uuid = `${uuid.substring(0, 4)}-${uuid.substring(4, 8)}-${uuid.substring(8, 12)}-${uuid.substring(12, 16)}`;

  // 确保不与系统管理员UUID冲突
  if (uuid === "0000-0000-0000-0000") {
    // 如果偶然生成了系统管理员UUID，则重新生成
    return generateUUID();
  }

  return uuid;
}

// 获取用户信息
function getUserById(id) {
  const db = readDatabase();
  return db.users.find(user => user.UUID === id);
}

// 获取用户信息通过会话
function getUserBySession(req) {
  try {
    if (!req.session || !req.session.userId) return null;
    return getUserById(req.session.userId);
  } catch (error) {
    bsio.error(`会话错误：获取用户信息失败 - ${error.message}`);
    return null;
  }
}

// 检查权限
function checkPermission(req, targetUserId = null) {
  const user = getUserBySession(req);
  if (!user) return { allowed: false, message: '未登录' };
  
  // 如果是查询自己，则总是允许
  if (targetUserId && targetUserId !== user.UUID) {
    const targetUser = getUserById(targetUserId);
    if (!targetUser) return { allowed: false, message: '目标用户不存在' };
    
    // 检查权限等级
    const authorLevels = { 'user': 1, 'admin': 2, 'system': 3 };
    if (authorLevels[user.author] <= authorLevels[targetUser.author]) {
      return { allowed: false, message: '权限不足，无法操作同级或更高级别的用户' };
    }
  }
  
  return { allowed: true, user };
}

// 更新统计数据
function updateStats() {
  const db = readDatabase();
  db.stats.visitCount++;
  writeDatabase(db);
}

// 每日登录奖励
function dailyLoginReward(userId) {
  const db = readDatabase();
  const userIndex = db.users.findIndex(u => u.UUID === userId);
  if (userIndex !== -1) {
    const user = db.users[userIndex];
    const today = new Date().toDateString(); // 只获取日期部分

    // 检查今天是否已经登录过
    if (user.lastLoginDate === today) {
      // 今天已经登录过，不给予奖励
      return 0;
    }

    // 更新最后登录日期
    user.lastLoginDate = today;

    // 每日登录奖励 5-10 积分
    const reward = Math.floor(Math.random() * 6) + 5; // 5-10
    user.points = (user.points || 0) + reward;

    writeDatabase(db);
    return reward;
  }
  return 0;
}

// 初始化数据库
initializeDatabase();

// 中间件：检查登录状态
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    bsio.warning(`权限验证失败：未登录用户访问 ${req.path}`);
    return res.redirect('/login');
  }
  next();
}

// 中间件：检查管理员权限
function requireAdmin(req, res, next) {
  const user = getUserBySession(req);
  if (!user || (user.author !== 'admin' && user.author !== 'system')) {
    bsio.warning(`权限验证失败：用户 ${user ? user.name : '未知'} 尝试访问管理员页面 ${req.path}`);
    return res.status(403).send('权限不足');
  }
  next();
}

// 中间件：检查系统权限
function requireSystem(req, res, next) {
  const user = getUserBySession(req);
  if (!user || user.author !== 'system') {
    bsio.warning(`权限验证失败：用户 ${user ? user.name : '未知'} 尝试访问系统页面 ${req.path}`);
    return res.status(403).send('权限不足');
  }
  next();
}

// 路由

// 首页
app.get('/', requireAuth, (req, res) => {
  updateStats();
  const user = getUserBySession(req);
  res.render('index', { user, currentPath: '/' });
});

// 登录页面
app.get('/login', (req, res) => {
  res.render('auth/login');
});


// 注册页面
app.get('/register', (req, res) => {
  res.render('auth/register');
});

// 登录处理
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.render('auth/login', { error: '请输入用户名/UUID和密码' });
  }

  const db = readDatabase();

  // 首先尝试按用户名查找用户
  let user = db.users.find(u => u.name === username);

  // 如果没找到，再尝试按UUID查找用户
  if (!user) {
    user = db.users.find(u => u.UUID === username);
  }

  if (!user) {
    return res.render('auth/login', { error: '用户名/UUID不存在' });
  }

  try {
    // 检查密码是否是新格式（对象）还是旧格式（字符串）
    let decryptedPassword;
    if (typeof user.code === 'string') {
      // 旧格式密码，使用旧方法解密
      const oldSalt = '0712';
      const oldIV = Buffer.alloc(16, 0);
      const oldKey = crypto.scryptSync(oldSalt, 'salt', 32);
      const decipher = crypto.createDecipheriv('aes-256-cbc', oldKey, oldIV);
      decryptedPassword = decipher.update(user.code, 'hex', 'utf8');
      decryptedPassword += decipher.final('utf8');
    } else {
      // 新格式密码，使用新方法解密
      decryptedPassword = decrypt(user.code);
    }

    if (decryptedPassword === password) {
      req.session.userId = user.UUID;
      // 每日登录奖励
      dailyLoginReward(user.UUID);
      return res.redirect('/');
    } else {
      return res.render('auth/login', { error: '密码错误' });
    }
  } catch (e) {
    console.error('密码解密错误:', e);
    return res.render('auth/login', { error: '登录失败，请稍后再试' });
  }
});

// 注册处理
app.post('/register', (req, res) => {
  const { username, password, confirmPassword } = req.body;

  if (!username || !password) {
    return res.render('auth/register', { error: '请输入用户名和密码' });
  }

  if (password !== confirmPassword) {
    return res.render('auth/register', { error: '两次输入的密码不一致' });
  }

  if (password.length < 6) {
    return res.render('auth/register', { error: '密码长度至少为6位' });
  }

  const db = readDatabase();
  if (db.users.some(u => u.name === username)) {
    return res.render('auth/register', { error: '用户名已存在' });
  }

  // 检查是否是第一个用户（系统管理员）
  let newUUID, userRole;
  if (db.users.length === 0) {
    // 第一个用户，设置为固定UUID和system权限
    newUUID = "0000-0000-0000-0000";
    userRole = 'system';
  } else {
    // 检查是否已经有系统管理员用户
    const hasSystemUser = db.users.some(u => u.author === 'system');
    if (!hasSystemUser) {
      // 如果没有系统管理员用户，当前注册用户将成为系统管理员
      newUUID = "0000-0000-0000-0000";
      userRole = 'system';
    } else {
      // 普通用户，生成随机UUID
      newUUID = generateUUID();
      userRole = 'user';
    }
  }

  const newUser = {
    name: username,
    UUID: newUUID,
    code: encrypt(password, `user/${newUUID}/password`), // 使用用户特定的文件路径
    author: userRole,
    avatar: `/data/user/${newUUID}/avatar.jpg`,
    time: new Date().toISOString(),
    points: 0,
    friends: []
  };

  // 检查是否已经存在相同UUID的用户（以防万一）
  const existingUser = db.users.find(u => u.UUID === newUUID);
  if (existingUser) {
    return res.render('auth/register', { error: '用户UUID已存在，请联系管理员' });
  }

  db.users.push(newUser);
  db.stats.userCount = db.users.length;
  writeDatabase(db);

  // 创建用户目录
  const userDir = path.join(__dirname, 'data', 'user', newUUID);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  res.redirect('/login');
});

// 登出
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('登出错误:', err);
    }
    res.redirect('/login');
  });
});

// 设置页面
app.get('/settings', requireAuth, (req, res) => {
  const user = getUserBySession(req);

  // 获取当前简介内容
  const introPath = path.join(__dirname, 'data', 'user', user.UUID, 'intro', 'text.json');
  let introContent = '';
  if (fs.existsSync(introPath)) {
    try {
      const introData = JSON.parse(fs.readFileSync(introPath, 'utf8'));
      introContent = introData.content || '';
    } catch (e) {
      console.error('读取简介文件错误:', e);
    }
  }

  res.render('settings', { user, currentPath: '/settings', introContent });
});

// 更新用户信息
const uploadSettings = upload.fields([
  { name: 'avatar', maxCount: 1 },
  { name: 'background', maxCount: 1 }
]);
app.post('/settings', requireAuth, (req, res) => {
  // 使用Multer处理可能的文件上传
  uploadSettings(req, res, function(err) {
    if (err instanceof multer.MulterError) {
      // Multer错误处理
      return res.render('settings', { user: {...getUserBySession(req), error: err.message}, currentPath: '/settings' });
    } else if (err) {
      // 其他错误处理
      return res.render('settings', { user: {...getUserBySession(req), error: err.message}, currentPath: '/settings' });
    }

    // 没有错误，继续处理请求
    const user = getUserBySession(req);
    const { newName, newPassword, oldPassword, theme } = req.body;

    const db = readDatabase();
    const userIndex = db.users.findIndex(u => u.UUID === user.UUID);

    if (userIndex === -1) {
      return res.redirect('/login');
    }

    let updateUser = db.users[userIndex];

    // 修改用户名
    if (newName && newName !== user.name) {
      if (db.users.some(u => u.name === newName && u.UUID !== user.UUID)) {
        return res.render('settings', { user: {...user, error: '用户名已存在'}, currentPath: '/settings' });
      }
      updateUser.name = newName;
    }

    // 修改密码
    if (newPassword) {
      try {
        // 检查当前密码是否是新格式还是旧格式
        let decryptedCurrentPassword;
        if (updateUser.code && typeof updateUser.code === 'string') {
          // 旧格式密码，使用旧方法解密
          const oldSalt = '0712';
          const oldIV = Buffer.alloc(16, 0);
          const oldKey = crypto.scryptSync(oldSalt, 'salt', 32);
          const decipher = crypto.createDecipheriv('aes-256-cbc', oldKey, oldIV);
          decryptedCurrentPassword = decipher.update(updateUser.code, 'hex', 'utf8');
          decryptedCurrentPassword += decipher.final('utf8');
        } else if (updateUser.code) {
          // 新格式密码，使用新方法解密
          decryptedCurrentPassword = decrypt(updateUser.code);
        } else {
          // 如果没有密码，直接返回错误
          return res.render('settings', { user: {...user, error: '原密码错误'}, currentPath: '/settings' });
        }

        if (decryptedCurrentPassword !== oldPassword) {
          return res.render('settings', { user: {...user, error: '原密码错误'}, currentPath: '/settings' });
        }
        updateUser.code = encrypt(newPassword, `user/${user.UUID}/password`); // 使用用户特定的文件路径
      } catch (e) {
        console.error('密码解密错误:', e);
        return res.render('settings', { user: {...user, error: '密码修改失败'}, currentPath: '/settings' });
      }
    }

    // 更新主题
    if (theme) {
      updateUser.theme = theme;
    }

    // 如果上传了新头像
    if (req.files && req.files.avatar) {
      updateUser.avatar = `/data/user/${user.UUID}/avatar.jpg`;
    }

    // 如果上传了新背景图
    if (req.files && req.files.background) {
      // 背景图已保存到用户目录，无需额外处理
    }

    writeDatabase(db);

    // 重新获取用户信息以反映更改
    const updatedUser = getUserById(user.UUID);

    // 获取当前简介内容
    const introPath = path.join(__dirname, 'data', 'user', user.UUID, 'intro', 'text.json');
    let introContent = '';
    if (fs.existsSync(introPath)) {
      try {
        const introData = JSON.parse(fs.readFileSync(introPath, 'utf8'));
        introContent = introData.content || '';
      } catch (e) {
        console.error('读取简介文件错误:', e);
      }
    }

    res.render('settings', {
      user: {...updatedUser, success: '设置已保存'},
      currentPath: '/settings',
      introContent: introContent
    });
  });
});


// 更新个人简介
app.post('/settings/intro', requireAuth, (req, res) => {
  const user = getUserBySession(req);
  const { introContent } = req.body;

  // 创建用户简介目录
  const introDir = path.join(__dirname, 'data', 'user', user.UUID, 'intro');
  if (!fs.existsSync(introDir)) {
    fs.mkdirSync(introDir, { recursive: true });
  }

  // 保存简介内容
  const introPath = path.join(introDir, 'text.json');
  const introData = {
    content: introContent || '',
    updatedAt: new Date().toISOString()
  };

  fs.writeFileSync(introPath, JSON.stringify(introData, null, 2));

  // 重新获取用户信息以反映更改
  const updatedUser = getUserById(user.UUID);

  // 获取当前简介内容
  let currentIntroContent = '';
  if (fs.existsSync(introPath)) {
    try {
      const introData = JSON.parse(fs.readFileSync(introPath, 'utf8'));
      currentIntroContent = introData.content || '';
    } catch (e) {
      console.error('读取简介文件错误:', e);
    }
  }

  res.render('settings', {
    user: {...updatedUser, success: '简介已保存'},
    currentPath: '/settings',
    introContent: currentIntroContent
  });
});

// 管理面板 - 总览
app.get('/panel', requireAdmin, (req, res) => {
  const user = getUserBySession(req);
  const db = readDatabase();
  
  // 获取系统信息
  const os = require('os');
  const cpuInfo = os.cpus();
  const cpuUsage = process.cpuUsage();
  const memoryUsage = process.memoryUsage();
  
  const systemInfo = {
    visitCount: db.stats.visitCount,
    userCount: db.stats.userCount,
    cpuCount: cpuInfo.length,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    usedMemory: os.totalmem() - os.freemem(),
    loadAverage: os.loadavg()
  };
  
  res.render('admin/overview', { user, systemInfo, currentPath: '/panel' });
});

// 管理面板 - 用户管理
app.get('/panel/users', requireAdmin, (req, res) => {
  const user = getUserBySession(req);
  const db = readDatabase();
  
  res.render('admin/users', { user, users: db.users, currentPath: '/panel/users' });
});

// 更新用户信息（管理员）
app.post('/panel/users/:id', requireAdmin, (req, res) => {
  // 使用Multer处理可能的multipart数据
  const handleMultipart = (req, res, next) => {
    if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
      // 对于更新用户信息，我们不需要实际的文件上传，但需要解析multipart数据
      // 使用一个临时的multer配置来解析表单数据
      const tempUpload = multer().none(); // 不处理文件，只解析表单数据
      tempUpload(req, res, next);
    } else {
      next();
    }
  };

  handleMultipart(req, res, () => {
    const currentUser = getUserBySession(req);
    const targetUserId = req.params.id;

    // 检查权限
    const permissionCheck = checkPermission(req, targetUserId);
    if (!permissionCheck.allowed) {
      return res.status(403).json({ error: permissionCheck.message });
    }

    const { name, author, points, avatar } = req.body;

    const db = readDatabase();
    const userIndex = db.users.findIndex(u => u.UUID === targetUserId);

    if (userIndex === -1) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 只有system权限才能修改权限
    if (req.body.author && currentUser.author !== 'system') {
      return res.status(403).json({ error: '只有系统管理员可以修改用户权限' });
    }

    // 更新用户信息
    if (name) db.users[userIndex].name = name;
    if (author && currentUser.author === 'system') {
      const oldAuthor = db.users[userIndex].author;
      db.users[userIndex].author = author;
      bsio.warning(`修改用户权限：${targetUserId} ${oldAuthor}->${author}`);
    }
    if (points) db.users[userIndex].points = parseInt(points);
    if (avatar) db.users[userIndex].avatar = avatar;

    writeDatabase(db);

    res.json({ success: true, message: '用户信息已更新' });
  });
});

// 删除用户（管理员）
app.delete('/panel/users/:id', requireAdmin, (req, res) => {
  const currentUser = getUserBySession(req);
  const targetUserId = req.params.id;
  
  // 检查权限
  const permissionCheck = checkPermission(req, targetUserId);
  if (!permissionCheck.allowed) {
    return res.status(403).json({ error: permissionCheck.message });
  }
  
  const db = readDatabase();
  const userIndex = db.users.findIndex(u => u.UUID === targetUserId);
  
  if (userIndex === -1) {
    return res.status(404).json({ error: '用户不存在' });
  }
  
  // 删除用户数据目录
  const userDir = path.join(__dirname, 'data', 'user', targetUserId);
  if (fs.existsSync(userDir)) {
    fs.rmSync(userDir, { recursive: true, force: true });
  }
  
  // 从数据库中移除用户
  db.users.splice(userIndex, 1);
  db.stats.userCount = db.users.length;
  writeDatabase(db);

  bsio.warning(`删除用户：${targetUserId}`);

  res.json({ success: true });
});

// 创建用户（管理员）
app.post('/panel/users', requireAdmin, (req, res) => {
  const currentUser = getUserBySession(req);

  // 只有system权限才能创建具有特定权限的用户
  if (req.body.author && req.body.author !== 'user' && currentUser.author !== 'system') {
    return res.status(403).send('只有系统管理员可以创建高级权限用户');
  }

  const { name, password, author = 'user', points = 0 } = req.body;

  if (!name || !password) {
    return res.status(400).send('用户名和密码不能为空');
  }

  const db = readDatabase();
  if (db.users.some(u => u.name === name)) {
    return res.status(400).send('用户名已存在');
  }

  // 确保不创建与系统管理员UUID冲突的用户
  const newUUID = generateUUID();
  const newUser = {
    name,
    UUID: newUUID,
    code: encrypt(password, `user/${newUUID}/password`), // 使用用户特定的文件路径
    author,
    avatar: `/data/user/${newUUID}/avatar.jpg`,
    time: new Date().toISOString(),
    points: parseInt(points),
    friends: []
  };

  db.users.push(newUser);
  db.stats.userCount = db.users.length;
  writeDatabase(db);

  // 创建用户目录
  const userDir = path.join(__dirname, 'data', 'user', newUUID);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  bsio.debug(`创建用户：${name} (权限：${author})`);

  res.redirect('/panel/users');
});

// 系统控制页面（仅system权限）
app.get('/panel/system', requireSystem, (req, res) => {
  const user = getUserBySession(req);
  res.render('admin/system', { user, currentPath: '/panel/system' });
});

// 重启服务器（仅system权限）
app.post('/panel/system/restart', requireSystem, (req, res) => {
  bsio.warning('注意，服务器即将重启');
  res.send('服务器将在几秒后重启...');
  setTimeout(() => {
    process.exit(0);
  }, 3000);
});

// 关闭服务器（仅system权限）
app.post('/panel/system/shutdown', requireSystem, (req, res) => {
  bsio.warning('注意，服务器即将关闭');
  res.send('服务器正在关闭...');
  setTimeout(() => {
    process.exit(0);
  }, 3000);
});

// API: 更新主密钥（仅system权限）
app.post('/api/update-main-secret', requireSystem, (req, res) => {
  const { secret } = req.body;

  if (!secret) {
    return res.status(400).json({ success: false, message: '密钥不能为空' });
  }

  try {
    encryption.updateMainSecret(secret);
    res.json({ success: true, message: '主密钥更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// API: 更新副密钥（仅system权限）
app.post('/api/update-deputy-secret', requireSystem, async (req, res) => {
  const { secret } = req.body;

  try {
    // 定义重新加密回调函数
    const reencryptCallback = (encInstance) => {
      // 重新加密所有用户密码
      const dbPath = path.join(__dirname, 'data', 'server.json');
      const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

      // 遍历所有用户并重新加密密码
      for (const user of db.users) {
        if (user.code) {
          // 先解密当前密码
          let decryptedPassword;
          if (typeof user.code === 'string') {
            // 旧格式密码，使用旧方法解密
            const oldSalt = '0712';
            const oldIV = Buffer.alloc(16, 0);
            const oldKey = crypto.scryptSync(oldSalt, 'salt', 32);
            const decipher = crypto.createDecipheriv('aes-256-cbc', oldKey, oldIV);
            decryptedPassword = decipher.update(user.code, 'hex', 'utf8');
            decryptedPassword += decipher.final('utf8');
          } else {
            // 新格式密码，使用新方法解密
            decryptedPassword = encInstance.decrypt(user.code);
          }

          // 用新密钥重新加密
          user.code = encInstance.encrypt(decryptedPassword, `user/${user.UUID}/password`);
        }
      }

      // 保存更新后的数据库
      fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    };

    encryption.updateDeputySecret(secret || null, reencryptCallback);
    res.json({ success: true, message: '副密钥更新成功，用户数据已重新加密' });
  } catch (error) {
    console.error('更新副密钥失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// API: 更新系统密钥（仅system权限）
app.post('/api/update-system-secret', requireSystem, async (req, res) => {
  const { secret } = req.body;

  try {
    // 定义重新加密回调函数
    const reencryptCallback = (encInstance) => {
      // 重新加密所有用户密码
      const dbPath = path.join(__dirname, 'data', 'server.json');
      const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

      // 遍历所有用户并重新加密密码
      for (const user of db.users) {
        if (user.code) {
          // 先解密当前密码
          let decryptedPassword;
          if (typeof user.code === 'string') {
            // 旧格式密码，使用旧方法解密
            const oldSalt = '0712';
            const oldIV = Buffer.alloc(16, 0);
            const oldKey = crypto.scryptSync(oldSalt, 'salt', 32);
            const decipher = crypto.createDecipheriv('aes-256-cbc', oldKey, oldIV);
            decryptedPassword = decipher.update(user.code, 'hex', 'utf8');
            decryptedPassword += decipher.final('utf8');
          } else {
            // 新格式密码，使用新方法解密
            decryptedPassword = encInstance.decrypt(user.code);
          }

          // 用新密钥重新加密
          user.code = encInstance.encrypt(decryptedPassword, `user/${user.UUID}/password`);
        }
      }

      // 保存更新后的数据库
      fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    };

    encryption.updateSystemSecret(secret || null, reencryptCallback);
    res.json({ success: true, message: '系统密钥更新成功，用户数据已重新加密' });
  } catch (error) {
    console.error('更新系统密钥失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// API: 获取当前密钥信息（仅system权限）
app.get('/api/secrets-info', requireSystem, (req, res) => {
  res.json({
    success: true,
    mainSecret: encryption.getMainSecret() ? '已设置' : '未设置', // 不返回实际密钥值
    deputySecret: encryption.getDeputySecret() ? '已设置' : '未设置',
    systemSecret: encryption.getSystemSecret() ? '已设置' : '未设置',
    needsRotation: encryption.needsSystemKeyRotation()
  });
});

// 提供用户头像
app.get('/data/user/:userId/avatar.jpg', (req, res) => {
  const userId = req.params.userId;
  const avatarPath = path.join(__dirname, 'data', 'user', userId, 'avatar.jpg');

  if (fs.existsSync(avatarPath)) {
    res.sendFile(avatarPath);
  } else {
    // 返回默认头像
    res.sendFile(path.join(__dirname, 'public', 'images', 'default-avatar.png'));
  }
});

// 提供用户背景图
app.get('/data/user/:userId/intro/background.jpg', (req, res) => {
  const userId = req.params.userId;
  const bgPath = path.join(__dirname, 'data', 'user', userId, 'intro', 'background.jpg');

  if (fs.existsSync(bgPath)) {
    res.sendFile(bgPath);
  } else {
    // 返回默认背景图
    res.sendFile(path.join(__dirname, 'public', 'images', 'default-background.jpg'));
  }
});

// 读取模块信息的函数
function readModules() {
  const modulesDir = path.join(__dirname, 'module');
  if (!fs.existsSync(modulesDir)) {
    return [];
  }

  const modules = [];
  const moduleDirs = fs.readdirSync(modulesDir);

  for (const moduleDir of moduleDirs) {
    const modulePath = path.join(modulesDir, moduleDir);
    if (fs.statSync(modulePath).isDirectory()) {
      const settingPath = path.join(modulePath, 'setting.json');
      if (fs.existsSync(settingPath)) {
        try {
          const setting = JSON.parse(fs.readFileSync(settingPath, 'utf8'));
          
          // 自动迁移旧版配置
          const migratedSetting = ModuleSandbox.migrateConfig(setting, modulePath);
          
          // 如果配置有变化，保存迁移后的配置
          if (JSON.stringify(setting) !== JSON.stringify(migratedSetting)) {
            ModuleSandbox.saveMigratedConfig(modulePath, migratedSetting);
          }
          
          migratedSetting.dirName = moduleDir;
          migratedSetting.path = modulePath;
          modules.push(migratedSetting);
        } catch (e) {
          console.error(`读取模块设置失败 ${moduleDir}:`, e);
        }
      }
    }
  }

  return modules;
}

// 初始化模块沙盒
function initModuleSandboxes() {
  const modules = readModules();
  const loadedModules = [];

  for (const module of modules) {
    try {
      const sandbox = new ModuleSandbox(module.path, module, app);
      moduleSandboxes.set(module.dirName, sandbox);

      // 加载模块代码并初始化
      const moduleExports = sandbox.loadModuleCode();
      if (typeof moduleExports.init === 'function') {
        moduleExports.init(sandbox.sandbox, module);
      }

      bsio.info(`模块沙盒已初始化`);
      loadedModules.push(`${module.name} v${module.version}`);
    } catch (error) {
      bsio.error(`模块沙盒无法加载${module.name}模块,错误信息:`);
	  bsio.error(`${error.message}`);
    }
  }

  return loadedModules;
}

// 模块列表页面
app.get('/modules', (req, res) => {
  const user = getUserBySession(req);
  const modules = readModules();

  // 分离页面模块和API模块
  const pageModules = modules.filter(m => m.page === true);
  const apiModules = modules.filter(m => m.page === false || m.page === undefined);

  const marked = require('marked');
  res.render('modules/list', {
    user,
    currentPath: '/modules',
    pageModules,
    apiModules,
    marked
  });
});

// 动态加载模块页面
app.get('/module/:moduleName', (req, res) => {
  const { moduleName } = req.params;
  const user = getUserBySession(req);

  const modules = readModules();
  const module = modules.find(m => m.dirName === moduleName);

  if (!module) {
    return res.status(404).send('模块不存在');
  }

  if (!module.page) {
    return res.status(404).send('此模块为API模块，无页面');
  }

  // 验证视图引擎配置
  const supportedEngines = ['ejs', 'handlebars', 'pug', 'mustache'];
  const viewEngine = module.viewEngine || 'ejs';
  
  if (!supportedEngines.includes(viewEngine)) {
    bsio.warning(`模块 ${module.name} 配置了不支持的视图引擎 '${viewEngine}'，将使用 EJS 代替`);
  }
  
  // 构建视图路径（从模块的 views 目录加载）
  const viewName = path.basename(module.main, path.extname(module.main));
  const viewPath = `../module/${moduleName}/views/${viewName}`;

  // 为模块渲染页面，传递用户信息和模块信息
  res.render(viewPath, {
    user,
    currentPath: `/module/${moduleName}`,
    moduleInfo: module
  });
});

// API: 获取三方时间
app.get('/api/time', (req, res) => {
  // 记录请求开始被处理的时间（服务器时间）
  const requestStartTime = Date.now();
  
  // 零核服务器时间（ISO 格式）
  const ZCS_time = new Date(requestStartTime).toISOString();
  
  // Windows 时间服务器时间（通过 NTP 协议获取，这里使用近似值）
  // 注意：由于无法直接访问 Windows 时间服务器，这里返回服务器时间作为替代
  // 在实际生产环境中，可以使用 NTP 库来获取准确的时间
  const windows_time = new Date(requestStartTime).toISOString();
  
  // 用户本地时间由客户端提供
  // 这里返回服务器时间，客户端应该在请求时附带本地时间
  const local_time = req.query.local || ZCS_time;
  
  res.json({
    ZCS_time: ZCS_time,
    windows_time: windows_time,
    local_time: local_time,
    timestamp: requestStartTime
  });
});

// API: 获取模块收藏列表
app.get('/api/module/favorites', requireAuth, (req, res) => {
  const user = getUserBySession(req);
  const db = readDatabase();
  
  // 获取用户收藏的模块列表
  const userFavorites = [];
  if (db.modules && db.modules.favorites) {
    for (const [moduleId, userIds] of Object.entries(db.modules.favorites)) {
      if (userIds.includes(user.UUID)) {
        userFavorites.push(moduleId);
      }
    }
  }
  
  res.json({ success: true, favorites: userFavorites });
});

// API: 收藏/取消收藏模块
app.post('/api/module/favorite', requireAuth, (req, res) => {
  const user = getUserBySession(req);
  const { moduleId, action } = req.body;
  
  if (!moduleId) {
    return res.json({ success: false, message: '缺少模块 ID' });
  }
  
  const db = readDatabase();
  
  // 初始化模块收藏数据
  if (!db.modules) {
    db.modules = { favorites: {} };
  }
  if (!db.modules.favorites) {
    db.modules.favorites = {};
  }
  
  // 初始化模块收藏列表
  if (!db.modules.favorites[moduleId]) {
    db.modules.favorites[moduleId] = [];
  }
  
  const userFavorites = db.modules.favorites[moduleId];
  
  if (action === 'add') {
    // 添加收藏
    if (!userFavorites.includes(user.UUID)) {
      userFavorites.push(user.UUID);
      writeDatabase(db);
      res.json({ success: true, message: '收藏成功', count: userFavorites.length });
    } else {
      res.json({ success: false, message: '已经收藏过了' });
    }
  } else if (action === 'remove') {
    // 取消收藏
    const index = userFavorites.indexOf(user.UUID);
    if (index !== -1) {
      userFavorites.splice(index, 1);
      writeDatabase(db);
      res.json({ success: true, message: '取消收藏成功', count: userFavorites.length });
    } else {
      res.json({ success: false, message: '未收藏该模块' });
    }
  } else {
    res.json({ success: false, message: '无效的操作' });
  }
});

// API: 获取模块收藏数量
app.get('/api/module/favorite-count/:moduleId', (req, res) => {
  const { moduleId } = req.params;
  const db = readDatabase();
  
  let count = 0;
  if (db.modules && db.modules.favorites && db.modules.favorites[moduleId]) {
    count = db.modules.favorites[moduleId].length;
  }
  
  res.json({ success: true, count: count });
});

// 读取模块评论数据
function readModuleComments() {
  const commentsPath = path.join(__dirname, 'module', 'data', 'comments.json');
  if (!fs.existsSync(commentsPath)) {
    return { comments: {} };
  }
  return JSON.parse(fs.readFileSync(commentsPath, 'utf8'));
}

// 写入模块评论数据
function writeModuleComments(data) {
  const commentsPath = path.join(__dirname, 'module', 'data', 'comments.json');
  const commentsDir = path.join(__dirname, 'module', 'data');
  if (!fs.existsSync(commentsDir)) {
    fs.mkdirSync(commentsDir, { recursive: true });
  }
  fs.writeFileSync(commentsPath, JSON.stringify(data, null, 2));
}

// API: 获取模块评论列表
app.get('/api/module/comments/:moduleId', (req, res) => {
  const { moduleId } = req.params;
  const commentsData = readModuleComments();
  
  let comments = [];
  if (commentsData.comments && commentsData.comments[moduleId]) {
    comments = commentsData.comments[moduleId];
  }
  
  // 获取评论者的用户名
  const db = readDatabase();
  const enrichedComments = comments.map(comment => {
    const user = db.users.find(u => u.UUID === comment.userId);
    // 处理回复
    const processReplies = (replies) => {
      if (!replies) return [];
      return replies.map(reply => {
        const replyUser = db.users.find(u => u.UUID === reply.userId);
        return {
          ...reply,
          userName: replyUser ? replyUser.name : '未知用户',
          userAvatar: replyUser ? replyUser.avatar : '/images/default-avatar.png',
          replies: processReplies(reply.replies)
        };
      });
    };
    
    return {
      ...comment,
      userName: user ? user.name : '未知用户',
      userAvatar: user ? user.avatar : '/images/default-avatar.png',
      replies: processReplies(comment.replies)
    };
  });
  
  res.json({ success: true, comments: enrichedComments });
});

// API: 添加评论
app.post('/api/module/comments', requireAuth, (req, res) => {
  const user = getUserBySession(req);
  const { moduleId, content, parentId } = req.body;
  
  if (!moduleId || !content) {
    return res.json({ success: false, message: '缺少模块 ID 或评论内容' });
  }
  
  if (content.trim().length > 500) {
    return res.json({ success: false, message: '评论内容不能超过 500 字' });
  }
  
  const commentsData = readModuleComments();
  
  // 初始化模块评论数据
  if (!commentsData.comments) {
    commentsData.comments = {};
  }
  if (!commentsData.comments[moduleId]) {
    commentsData.comments[moduleId] = [];
  }
  
  const newComment = {
    id: Date.now().toString(),
    userId: user.UUID,
    userName: user.name,
    content: content.trim(),
    createdAt: new Date().toISOString(),
    parentId: parentId || null,
    replies: []
  };
  
  if (parentId) {
    // 添加回复
    const parentComment = commentsData.comments[moduleId].find(c => c.id === parentId);
    if (parentComment) {
      if (!parentComment.replies) {
        parentComment.replies = [];
      }
      parentComment.replies.push(newComment);
      writeModuleComments(commentsData);
      res.json({ success: true, message: '回复成功', comment: newComment });
    } else {
      res.json({ success: false, message: '父评论不存在' });
    }
  } else {
    // 添加主评论
    commentsData.comments[moduleId].push(newComment);
    writeModuleComments(commentsData);
    res.json({ success: true, message: '评论成功', comment: newComment });
  }
});

// API: 删除评论
app.delete('/api/module/comments/:moduleId/:commentId', requireAuth, (req, res) => {
  const user = getUserBySession(req);
  const { moduleId, commentId } = req.params;
  
  const commentsData = readModuleComments();
  
  if (!commentsData.comments || !commentsData.comments[moduleId]) {
    return res.json({ success: false, message: '评论不存在' });
  }
  
  // 查找评论
  const commentIndex = commentsData.comments[moduleId].findIndex(c => c.id === commentId);
  if (commentIndex === -1) {
    // 可能在回复中
    let found = false;
    let canDelete = false;
    commentsData.comments[moduleId].forEach(comment => {
      if (comment.replies) {
        const replyIndex = comment.replies.findIndex(r => r.id === commentId);
        if (replyIndex !== -1) {
          if (comment.replies[replyIndex].userId === user.UUID || user.author === 'system') {
            comment.replies.splice(replyIndex, 1);
            found = true;
            canDelete = true;
          }
        }
      }
    });
    
    if (found && canDelete) {
      writeModuleComments(commentsData);
      res.json({ success: true, message: '删除成功' });
    } else if (found && !canDelete) {
      res.json({ success: false, message: '无权限删除此评论' });
    } else {
      res.json({ success: false, message: '评论不存在' });
    }
  } else {
    // 删除主评论
    const comment = commentsData.comments[moduleId][commentIndex];
    if (comment.userId === user.UUID || user.author === 'system') {
      commentsData.comments[moduleId].splice(commentIndex, 1);
      writeModuleComments(commentsData);
      res.json({ success: true, message: '删除成功' });
    } else {
      res.json({ success: false, message: '无权限删除此评论' });
    }
  }
});

// ============================================
// ZCnet 网络 API - 聚合器主包处理 (v1.1.0)
// ============================================

// API: 接收来自主包的数据（聚合器端点）
app.post('/api/packet', (req, res) => {
  const { encrypted, signature } = req.body;

  if (!encrypted || !signature) {
    return res.status(400).json({ 
      success: false, 
      error: '缺少加密数据或签名',
      errorCode: 400
    });
  }

  // 验证签名（遍历所有已知节点的密钥）
  let verified = false;
  let decryptedData = null;
  let sourceNode = null;

  for (const [nodeId, node] of zcnetNetwork.knownNodes.entries()) {
    try {
      if (zcnetNetwork.verifySignature(encrypted, signature, node.sharedSecret)) {
        decryptedData = zcnetNetwork.decryptData(encrypted.data, encrypted.iv, node.sharedSecret);
        verified = true;
        sourceNode = nodeId;
        bsio.info('✅ 验证通过：来自节点 ' + nodeId);
        break;
      }
    } catch (e) {
      // 尝试下一个节点
    }
  }

  if (!verified) {
    return res.status(403).json({ 
      success: false, 
      error: '签名验证失败',
      errorCode: 403
    });
  }

  // 解析主包
  const { source, version, timestamp, sequence, packets } = decryptedData;

  // 检查时间戳（防止重放攻击）
  const now = Date.now();
  if (now - timestamp > 300000) {  // 5 分钟有效期
    return res.status(400).json({ 
      success: false, 
      error: '请求已过期',
      errorCode: 400
    });
  }

  // 检查序列号（防止重放）
  if (!zcnetNetwork.receivedSequences) {
    zcnetNetwork.receivedSequences = new Map();
  }
  const seqKey = source + '-' + sequence;
  if (zcnetNetwork.receivedSequences.has(seqKey)) {
    return res.status(409).json({ 
      success: false, 
      error: '重复的序列号（重放攻击）',
      errorCode: 409
    });
  }
  zcnetNetwork.receivedSequences.set(seqKey, now);
  // 清理旧序列号（保留最近 1000 个）
  if (zcnetNetwork.receivedSequences.size > 1000) {
    const entries = Array.from(zcnetNetwork.receivedSequences.entries());
    entries.sort((a, b) => b[1] - a[1]);
    entries.slice(1000).forEach(([key]) => zcnetNetwork.receivedSequences.delete(key));
  }

  // 处理 packets 数组中的每个子包
  const results = [];
  const failed = [];

  for (const packet of packets) {
    try {
      const result = executePacketRequest(packet, sourceNode);
      if (result && result.success) {
        results.push(result);
      } else if (result) {
        failed.push(result);
      }
    } catch (error) {
      bsio.error('执行子包失败 ' + (packet.name || 'unknown') + ': ' + error.message);
      failed.push({
        name: packet.name || 'unknown',
        success: false,
        statusCode: 500,
        error: error.message
      });
    }
  }

  res.json({ 
    success: results.length > 0 || failed.length === 0,
    results,
    failed,
    processedAt: Date.now()
  });
});

// 执行子包请求
function executePacketRequest(packet, sourceNode) {
  const { name, protocol, method, path, headers, query, body, port, host, timeout } = packet;

  bsio.debug('执行子包：' + name + ' [' + protocol + ' ' + method + ' ' + path + ']');

  // HTTP/HTTPS 协议处理
  if (protocol === 'HTTP' || protocol === 'HTTPS') {
    return executeHttpRequest({ name, method, path, headers, query, body, timeout });
  }

  // TCP 协议处理
  if (protocol === 'TCP') {
    return executeTcpRequest({ name, host, port, body, timeout });
  }

  // UDP 协议处理
  if (protocol === 'UDP') {
    return executeUdpRequest({ name, host, port, body, timeout });
  }

  // WebSocket 协议处理（简化）
  if (protocol === 'WebSocket') {
    return executeWebSocketRequest({ name, path, body, timeout });
  }

  return {
    name: name || 'unknown',
    success: false,
    statusCode: 400,
    error: '不支持的协议：' + protocol
  };
}

// 执行 HTTP 请求（内部路由）
function executeHttpRequest({ name, method, path, headers, query, body, timeout = 30000 }) {
  const db = readDatabase();

  // 模拟请求处理
  try {
    // GET /api/time
    if (method === 'GET' && path === '/api/time') {
      const requestStartTime = Date.now();
      return {
        name: name || path,
        success: true,
        statusCode: 200,
        data: {
          ZCS_time: new Date(requestStartTime).toISOString(),
          windows_time: new Date(requestStartTime).toISOString(),
          local_time: query ? query.local : null,
          timestamp: requestStartTime
        }
      };
    }

    // GET /api/announcement
    if (method === 'GET' && path === '/api/announcement') {
      const announcement = db.ann ? db.ann.text : '暂无系统公告';
      return {
        name: name || path,
        success: true,
        statusCode: 200,
        data: { announcement }
      };
    }

    // POST /api/zcnet/sync-user
    if (method === 'POST' && path === '/api/zcnet/sync-user') {
      const { user, action } = body || {};
      if (!user || !user.UUID) {
        return {
          name: name || path,
          success: false,
          statusCode: 400,
          error: '无效的用户数据'
        };
      }

      const userIndex = db.users.findIndex(u => u.UUID === user.UUID);

      if (action === 'create' || action === 'update') {
        if (userIndex === -1) {
          db.users.push(user);
          db.stats.userCount = db.users.length;
          bsio.info('ZCnet: 创建用户 ' + user.name + ' (' + user.UUID + ')');
        } else {
          db.users[userIndex] = user;
          bsio.info('ZCnet: 更新用户 ' + user.name + ' (' + user.UUID + ')');
        }
        writeDatabase(db);
        return {
          name: name || path,
          success: true,
          statusCode: 200,
          data: { message: '用户数据已同步' }
        };
      }

      if (action === 'delete') {
        if (userIndex !== -1) {
          db.users.splice(userIndex, 1);
          db.stats.userCount = db.users.length;
          writeDatabase(db);
          bsio.info('ZCnet: 删除用户 ' + user.name + ' (' + user.UUID + ')');
        }
        return {
          name: name || path,
          success: true,
          statusCode: 200,
          data: { message: '用户已删除' }
        };
      }

      return {
        name: name || path,
        success: false,
        statusCode: 400,
        error: '未知的操作类型'
      };
    }

    // POST /api/zcnet/credit-pool/allocate
    if (method === 'POST' && path === '/api/zcnet/credit-pool/allocate') {
      const { userId, amount } = body || {};
      const user = db.users.find(u => u.UUID === userId);
      
      if (!user) {
        return {
          name: name || path,
          success: false,
          statusCode: 404,
          error: '用户不存在'
        };
      }

      if (!amount || amount <= 0) {
        return {
          name: name || path,
          success: false,
          statusCode: 400,
          error: '无效的数量'
        };
      }

      const result = creditPool.allocateCredits(userId, amount, sourceNode || 'remote');
      if (result.success) {
        user.points = (user.points || 0) + amount;
        writeDatabase(db);
      }

      return {
        name: name || path,
        success: result.success,
        statusCode: result.success ? 200 : 400,
        data: result
      };
    }

    // POST /api/zcnet/sync-credit-pool
    if (method === 'POST' && path === '/api/zcnet/sync-credit-pool') {
      const { poolData, merge } = body || {};
      
      try {
        creditPool.importPoolData(poolData, merge !== false);
        bsio.info('ZCnet: 积分池同步完成，合并模式：' + (merge !== false));
        return {
          name: name || path,
          success: true,
          statusCode: 200,
          data: { message: '积分池已同步' }
        };
      } catch (error) {
        return {
          name: name || path,
          success: false,
          statusCode: 500,
          error: error.message
        };
      }
    }

    // POST /api/zcnet/credit-pool/generate
    if (method === 'POST' && path === '/api/zcnet/credit-pool/generate') {
      const { amount, source } = body || {};
      
      if (!amount || amount <= 0) {
        return {
          name: name || path,
          success: false,
          statusCode: 400,
          error: '无效的数量'
        };
      }

      const credits = creditPool.generateCredits(amount, source || sourceNode || 'remote');
      return {
        name: name || path,
        success: true,
        statusCode: 200,
        data: { count: credits.length }
      };
    }

    // 未知路由
    return {
      name: name || path,
      success: false,
      statusCode: 404,
      error: '路由不存在：' + method + ' ' + path
    };

  } catch (error) {
    return {
      name: name || path,
      success: false,
      statusCode: 500,
      error: error.message
    };
  }
}

// 执行 TCP 请求
function executeTcpRequest({ name, host, port, body, timeout = 10000 }) {
  const net = require('net');
  
  return new Promise((resolve) => {
    const client = net.createConnection({ host: host || '127.0.0.1', port: port || 8080 }, () => {
      client.write(body || '');
    });

    let responseData = '';
    const timer = setTimeout(() => {
      client.destroy();
      resolve({
        name: name || ('tcp-' + host + ':' + port),
        success: false,
        statusCode: 408,
        error: 'TCP 请求超时'
      });
    }, timeout);

    client.on('data', (data) => {
      responseData += data.toString();
    });

    client.on('end', () => {
      clearTimeout(timer);
      resolve({
        name: name || ('tcp-' + host + ':' + port),
        success: true,
        statusCode: 200,
        data: responseData
      });
    });

    client.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        name: name || ('tcp-' + host + ':' + port),
        success: false,
        statusCode: 500,
        error: err.message
      });
    });
  });
}

// 执行 UDP 请求
function executeUdpRequest({ name, host, port, body, timeout = 10000 }) {
  const dgram = require('dgram');
  const socket = dgram.createSocket('udp4');
  
  return new Promise((resolve) => {
    const message = Buffer.from(typeof body === 'object' ? JSON.stringify(body) : (body || ''));
    
    const timer = setTimeout(() => {
      socket.close();
      resolve({
        name: name || ('udp-' + host + ':' + port),
        success: false,
        statusCode: 408,
        error: 'UDP 请求超时'
      });
    }, timeout);

    socket.send(message, 0, message.length, port, host, (err) => {
      if (err) {
        clearTimeout(timer);
        socket.close();
        resolve({
          name: name || ('udp-' + host + ':' + port),
          success: false,
          statusCode: 500,
          error: err.message
        });
      } else {
        clearTimeout(timer);
        socket.close();
        resolve({
          name: name || ('udp-' + host + ':' + port),
          success: true,
          statusCode: 200,
          data: { sent: true, to: host + ':' + port }
        });
      }
    });
  });
}

// 执行 WebSocket 请求（简化处理）
function executeWebSocketRequest({ name, path, body, timeout = 60000 }) {
  // WebSocket 需要实际的 WS 连接，这里简化处理
  return {
    name: name || path,
    success: true,
    statusCode: 200,
    data: { message: 'WebSocket 请求已接收（需要实际 WS 连接）', path, body }
  };
}

// API: 获取系统公告// API: 获取系统公告
app.get('/api/announcement', (req, res) => {
  const db = readDatabase();
  const announcement = db.ann ? db.ann.text : '暂无系统公告';
  res.json({ announcement });
});

// API: 更新系统公告（仅system权限）
app.post('/api/announcement', requireSystem, (req, res) => {
  const { announcement } = req.body;

  if (typeof announcement !== 'string') {
    return res.status(400).json({ success: false, message: '公告内容必须是字符串' });
  }

  const db = readDatabase();
  db.ann = { text: announcement };
  writeDatabase(db);

  res.json({ success: true, message: '公告更新成功' });
});

// 更新日志页面
app.get('/updates', (req, res) => {
  const user = getUserBySession(req);
  const db = readDatabase();
  const updateLogs = db['update-log'] || [];

  res.render('update-log', {
    user,
    updateLogs,
    currentPath: '/updates'
  });
});

// 个人介绍页
app.get('/:userId/intro', (req, res) => {
  const userId = req.params.userId;
  const user = getUserBySession(req); // 当前登录用户

  // 获取目标用户信息
  const targetUser = getUserById(userId);
  if (!targetUser) {
    return res.status(404).send('用户不存在');
  }

  // 获取背景图URL
  const backgroundPath = path.join(__dirname, 'data', 'user', userId, 'intro', 'background.jpg');
  const backgroundExists = fs.existsSync(backgroundPath);
  const backgroundUrl = backgroundExists ? `/data/user/${userId}/intro/background.jpg` : '/images/default-background.jpg';

  // 获取简介内容
  const introPath = path.join(__dirname, 'data', 'user', userId, 'intro', 'text.json');
  let introContent = '<p>该用户暂未设置个人简介</p>';

  if (fs.existsSync(introPath)) {
    try {
      const introData = JSON.parse(fs.readFileSync(introPath, 'utf8'));
      introContent = introData.content || '<p>该用户暂未设置个人简介</p>';

      // 简单的Markdown渲染（仅支持基本格式）
      introContent = renderMarkdown(introContent);
    } catch (e) {
      console.error('读取简介文件错误:', e);
    }
  }

  res.render('intro', {
    user,
    targetUser,
    backgroundUrl,
    introContent,
    currentPath: `/${userId}/intro`
  });
});

// 简单的Markdown渲染函数
function renderMarkdown(mdText) {
  // 转义HTML标签以防止XSS
  let html = mdText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

  // 简单的Markdown解析
  // 标题
  html = html.replace(/^### (.*?)(<br>|$)/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*?)(<br>|$)/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*?)(<br>|$)/gm, '<h1>$1</h1>');

  // 粗体
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // 斜体
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // 链接
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');

  // 代码块
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');

  // 换行处理
  html = html.replace(/<br><br>/g, '</p><p>');
  html = html.replace(/^(.+?)(<br>|$)/gm, '<p>$1</p>');
  html = html.replace(/<p><\/p>/g, '');

  return html;
}

// 更完善的Markdown渲染函数（用于论坛）
function renderForumMarkdown(mdText) {
  // 转义HTML标签以防止XSS
  let html = mdText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

  // 标题
  html = html.replace(/^### (.*?)(<br>|$)/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*?)(<br>|$)/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*?)(<br>|$)/gm, '<h1>$1</h1>');

  // 粗体
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // 斜体
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // 链接
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');

  // 行内代码
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');

  // 代码块
  html = html.replace(/```([\s\S]*?)```/g, '<pre>$1</pre>');

  // 引用
  html = html.replace(/^> (.*?)(<br>|$)/gm, '<blockquote>$1</blockquote>');

  // 无序列表
  html = html.replace(/^- (.*?)(<br>|$)/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*?<\/li>)+/g, '<ul>$&</ul>');

  // 有序列表
  html = html.replace(/^\d+\. (.*?)(<br>|$)/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*?<\/li>)+/g, '<ol>$&</ol>');

  // 换行处理
  html = html.replace(/<br><br>/g, '</p><p>');
  html = html.replace(/^(.+?)(<br>|$)/gm, '<p>$1</p>');
  html = html.replace(/<p><\/p>/g, '');

  return html;
}

// 聊天页面
app.get('/chat', requireAuth, (req, res) => {
  const user = getUserBySession(req);
  res.render('chat', { user, currentPath: '/chat' });
});



// API: 发送消息
app.post('/api/chat/send', requireAuth, (req, res) => {
  const user = getUserBySession(req);
  const { recipient, content } = req.body;

  if (!recipient || !content) {
    return res.json({ success: false, message: '缺少接收者或消息内容' });
  }

  if (content.trim().length > 500) { // 限制消息长度
    return res.json({ success: false, message: '消息内容过长' });
  }

  // 检查接收者是否存在
  const db = readDatabase();
  const recipientUser = db.users.find(u => u.UUID === recipient);

  if (!recipientUser) {
    return res.json({ success: false, message: '接收者不存在' });
  }

  // 检查是否是好友
  const userFriends = user.friends || [];
  if (!userFriends.includes(recipient)) {
    return res.json({ success: false, message: '必须先添加对方为好友才能发送消息' });
  }

  // 确保聊天记录数组存在
  if (!db.chat) {
    db.chat = [];
  }

  // 确保聊天记录文件名按字母顺序排列，这样两个用户之间的聊天记录文件名一致
  const participants = [user.UUID, recipient].sort();
  const chatKey = `${participants[0]}_${participants[1]}`;

  // 查找现有的聊天记录
  let chatRecord = db.chat.find(chat => chat.key === chatKey);
  if (!chatRecord) {
    // 如果不存在，创建新的聊天记录
    chatRecord = {
      key: chatKey,
      participants: [user.UUID, recipient],
      messages: []
    };
    db.chat.push(chatRecord);
  }

  // 添加新消息
  const newMessage = {
    sender: user.UUID,
    recipient: recipient,
    content: content.trim(),
    timestamp: new Date().toISOString()
  };

  chatRecord.messages.push(newMessage);

  // 限制聊天记录数量（保留最近的100条消息）
  if (chatRecord.messages.length > 100) {
    chatRecord.messages = chatRecord.messages.slice(-100);
  }

  // 保存聊天记录
  writeDatabase(db);

  res.json({ success: true, message: '消息发送成功' });
});


// 零核论坛 - 论坛首页
app.get('/forum', requireAuth, (req, res) => {
  const user = getUserBySession(req);
  const db = readDatabase();
  const forumData = db.forum;

  // 获取分类信息
  const categories = forumData.categories;

  // 获取每个分类下的最新帖子
  const categoryPosts = {};
  categories.forEach(category => {
    const posts = forumData.posts.filter(post => post.category === category.id);
    // 按时间倒序排列，取最新的5个帖子
    const latestPosts = posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
    categoryPosts[category.id] = latestPosts;
  });

  res.render('forum/index', {
    user,
    currentPath: '/forum',
    categories,
    categoryPosts
  });
});

// 零核论坛 - 分类页面
app.get('/forum/category/:categoryId', requireAuth, (req, res) => {
  const user = getUserBySession(req);
  const categoryId = req.params.categoryId;
  const db = readDatabase();
  const forumData = db.forum;

  // 获取分类信息
  const category = forumData.categories.find(cat => cat.id === categoryId);
  if (!category) {
    return res.status(404).send('分类不存在');
  }

  // 获取该分类下的所有帖子
  let posts = forumData.posts.filter(post => post.category === categoryId);

  // 按时间倒序排列
  posts = posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.render('forum/category', {
    user,
    currentPath: `/forum/category/${categoryId}`,
    category,
    posts
  });
});

// 零核论坛 - 发帖页面
app.get('/forum/new', requireAuth, (req, res) => {
  const user = getUserBySession(req);
  const db = readDatabase();
  const forumData = db.forum;

  res.render('forum/new', {
    user,
    currentPath: '/forum/new',
    categories: forumData.categories
  });
});

// 零核论坛 - 创建帖子
app.post('/forum/new', requireAuth, (req, res) => {
  const user = getUserBySession(req);
  const { title, content, category } = req.body;

  if (!title || !content || !category) {
    const db = readDatabase();
    const forumData = db.forum;
    return res.render('forum/new', {
      user,
      currentPath: '/forum/new',
      categories: forumData.categories,
      error: '标题、内容和分类都是必填项'
    });
  }

  const db = readDatabase();
  const forumData = db.forum;

  // 检查分类是否存在
  const categoryExists = forumData.categories.some(cat => cat.id === category);
  if (!categoryExists) {
    return res.render('forum/new', {
      user,
      currentPath: '/forum/new',
      categories: forumData.categories,
      error: '选择的分类不存在'
    });
  }

  // 创建新帖子
  const newPost = {
    id: generateUUID().replace(/-/g, ''), // 生成唯一的帖子ID
    title,
    content,
    category,
    author: user.name,
    authorId: user.UUID,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    replies: []
  };

  // 添加到帖子列表
  forumData.posts.push(newPost);
  writeDatabase(db);

  // 重定向到新创建的帖子
  res.redirect(`/forum/post/${newPost.id}`);
});

// 零核论坛 - 帖子详情页面
app.get('/forum/post/:postId', requireAuth, (req, res) => {
  const user = getUserBySession(req);
  const postId = req.params.postId;
  const db = readDatabase();
  const forumData = db.forum;

  // 查找帖子
  const post = forumData.posts.find(p => p.id === postId);
  if (!post) {
    return res.status(404).send('帖子不存在');
  }

  // 获取帖子所属分类
  const category = forumData.categories.find(cat => cat.id === post.category);

  // 预渲染帖子内容和回复内容
  const renderedPost = {
    ...post,
    renderedContent: renderForumMarkdown(post.content)
  };

  // 预渲染回复内容
  const renderedReplies = post.replies.map(reply => ({
    ...reply,
    renderedContent: renderForumMarkdown(reply.content)
  }));

  res.render('forum/post', {
    user,
    currentPath: `/forum/post/${postId}`,
    post: renderedPost,
    replies: renderedReplies,
    category
  });
});

// 检查用户是否有权限编辑帖子
function canEditPost(user, post) {
  // 用户必须是帖子作者或管理员/系统管理员
  const authorLevels = { 'user': 1, 'admin': 2, 'system': 3 };
  return post.authorId === user.UUID || authorLevels[user.author] >= 2;
}

// 零核论坛 - 回复帖子
app.post('/forum/post/:postId/reply', requireAuth, (req, res) => {
  const user = getUserBySession(req);
  const postId = req.params.postId;
  const { content } = req.body;

  if (!content) {
    // 重定向回帖子页面并显示错误
    return res.redirect(`/forum/post/${postId}?error=回复内容不能为空`);
  }

  const db = readDatabase();
  const forumData = db.forum;

  // 查找帖子
  const postIndex = forumData.posts.findIndex(p => p.id === postId);
  if (postIndex === -1) {
    return res.status(404).send('帖子不存在');
  }

  // 创建回复
  const newReply = {
    id: generateUUID().replace(/-/g, ''), // 生成唯一的回复ID
    content,
    renderedContent: renderForumMarkdown(content), // 预渲染回复内容
    author: user.name,
    authorId: user.UUID,
    createdAt: new Date().toISOString()
  };

  // 添加到帖子的回复列表
  forumData.posts[postIndex].replies.push(newReply);
  forumData.posts[postIndex].updatedAt = new Date().toISOString();

  writeDatabase(db);

  // 重定向回帖子页面
  res.redirect(`/forum/post/${postId}`);
});

// 零核论坛 - 删除帖子（仅管理员及以上权限）
app.delete('/forum/post/:postId', requireAdmin, (req, res) => {
  const user = getUserBySession(req);
  const postId = req.params.postId;
  const db = readDatabase();
  const forumData = db.forum;

  // 查找帖子
  const postIndex = forumData.posts.findIndex(p => p.id === postId);
  if (postIndex === -1) {
    return res.status(404).json({ success: false, message: '帖子不存在' });
  }

  const post = forumData.posts[postIndex];

  // 检查权限：管理员可以删除任何帖子，普通用户只能删除自己的帖子
  const authorLevels = { 'user': 1, 'admin': 2, 'system': 3 };
  if (authorLevels[user.author] < 2 && post.authorId !== user.UUID) {
    return res.status(403).json({ success: false, message: '没有权限删除此帖子' });
  }

  // 从论坛数据中删除帖子
  forumData.posts.splice(postIndex, 1);
  writeDatabase(db);

  res.json({ success: true, message: '帖子已删除' });
});

// 零核论坛 - 编辑帖子页面
app.get('/forum/post/:postId/edit', requireAuth, (req, res) => {
  const user = getUserBySession(req);
  const postId = req.params.postId;
  const db = readDatabase();
  const forumData = db.forum;

  // 查找帖子
  const post = forumData.posts.find(p => p.id === postId);
  if (!post) {
    return res.status(404).send('帖子不存在');
  }

  // 检查权限
  if (!canEditPost(user, post)) {
    return res.status(403).send('没有权限编辑此帖子');
  }

  res.render('forum/edit', {
    user,
    currentPath: `/forum/post/${postId}/edit`,
    post,
    categories: forumData.categories
  });
});

// 零核论坛 - 更新帖子
app.post('/forum/post/:postId/edit', requireAuth, (req, res) => {
  const user = getUserBySession(req);
  const postId = req.params.postId;
  const { title, content, category } = req.body;
  const db = readDatabase();
  const forumData = db.forum;

  // 查找帖子
  const postIndex = forumData.posts.findIndex(p => p.id === postId);
  if (postIndex === -1) {
    return res.status(404).send('帖子不存在');
  }

  const post = forumData.posts[postIndex];

  // 检查权限
  if (!canEditPost(user, post)) {
    return res.status(403).send('没有权限编辑此帖子');
  }

  // 更新帖子信息
  forumData.posts[postIndex].title = title;
  forumData.posts[postIndex].content = content;
  forumData.posts[postIndex].category = category;
  forumData.posts[postIndex].updatedAt = new Date().toISOString();
  forumData.posts[postIndex].renderedContent = renderForumMarkdown(content);

  writeDatabase(db);

  // 重定向到更新后的帖子
  res.redirect(`/forum/post/${postId}`);
});

// 404 错误处理
app.use((req, res, next) => {
  bsio.error(`404 错误：${req.method} ${req.path} - 路由不存在`);
  res.status(404).send('页面不存在');
});

// 500 错误处理
app.use((err, req, res, next) => {
  bsio.error(`500 错误：${req.method} ${req.path} - ${err.message}`);
  console.error(err.stack);
  res.status(500).send('服务器内部错误');
});

// 启动前检查
function preStartCheck() {
  // 打印系统信息
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  bsio.printSystemInfo({
    nodeVersion: process.version,
    npmVersion: 'N/A',
    zcsVersion: packageJson.version || 'N/A'
  });

  // 初始化模块沙盒，获取已加载模块列表（在文件检查前显示）
  const loadedModules = initModuleSandboxes();
  if (loadedModules && loadedModules.length > 0) {
    bsio.printLoadedModules(loadedModules);
  }

  // 检查并补充关键文件
  const filesToCheck = [
    { path: path.join(__dirname, 'data', 'server.json'), default: { users: [], stats: { visitCount: 0, userCount: 0 }, 'update-log': [], forum: { posts: [], categories: [{ id: 'general', name: '综合讨论', description: '一般性话题讨论区' }, { id: 'tech', name: '技术交流', description: '技术相关话题讨论区' }, { id: 'feedback', name: '意见反馈', description: '对零核服务器的意见和建议' }] }, modules: { favorites: {}, comments: {} }, zcnet: { nodes: {}, creditPool: null } } },
    { path: path.join(__dirname, 'data', 'secret.json'), default: { main: { secret: '0000' }, deputy: { secret: '' }, system: { secret: '' }, file: {} } },
    { path: path.join(__dirname, 'module', 'data', 'comments.json'), default: { comments: {} } }
  ];

  const missingFiles = [];

  filesToCheck.forEach(file => {
    const relativePath = path.relative(__dirname, file.path);
    if (!fs.existsSync(file.path)) {
      missingFiles.push({ path: file.path, relative: relativePath, default: file.default });
      bsio.warning(`检查 [${relativePath}] - 缺失`);
    } else {
      bsio.info(`检查 [${relativePath}]`);
    }
  });
  bsio.info(`共检查${filesToCheck.length}个文件，缺失文件${missingFiles.length}个`);
  // 补充缺失文件
  if (missingFiles.length > 0) {
    bsio.info(`开始补充缺失文件......`);
    missingFiles.forEach(file => {
      const dir = path.dirname(file.path);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const content = typeof file.default === 'object' ? JSON.stringify(file.default, null, 2) : file.default;
      fs.writeFileSync(file.path, content);
      bsio.info(`补充 [${file.relative}]`);
    });
    bsio.info(`缺失文件补充完成`);
  }

  bsio.printSeparator('-', 50);

  // 打印其它日志
}

// 启动前检查
preStartCheck();

// 启动服务器
server.listen(PORT, () => {
  bsio.info(`零核服务器运行在 http://localhost:${PORT}`);
});