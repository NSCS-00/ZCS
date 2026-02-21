const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const multer = require('multer');
const sharp = require('sharp');
const AdvancedEncryption = require('./encryption');
const bodyParser = require('body-parser');
const http = require('http');
const ModuleSandbox = require('./module-sandbox');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// 模块沙盒管理器
const moduleSandboxes = new Map();

// 配置视图引擎
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

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

    // 检查是否已有系统管理员用户
    const systemUserExists = db.users.some(user => user.UUID === "0000-0000-0000-0000");
    if (!systemUserExists && db.users.length > 0) {
      // 如果没有系统管理员用户但有其他用户，发出警告
      console.warn("警告：数据库中没有系统管理员用户 (UUID: 0000-0000-0000-0000)");
      console.warn("请确保第一个用户注册以获得系统权限");
    }

    if (updated) {
      fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    }
  }
}

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
}

// WebSocket连接处理

// 写入数据库（同时更新缓存）
function writeDatabase(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  // 更新缓存
  dbCache = data;
  cacheTimestamp = Date.now();
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
  if (!req.session.userId) return null;
  return getUserById(req.session.userId);
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
    return res.redirect('/login');
  }
  next();
}

// 中间件：检查管理员权限
function requireAdmin(req, res, next) {
  const user = getUserBySession(req);
  if (!user || (user.author !== 'admin' && user.author !== 'system')) {
    return res.status(403).send('权限不足');
  }
  next();
}

// 中间件：检查系统权限
function requireSystem(req, res, next) {
  const user = getUserBySession(req);
  if (!user || user.author !== 'system') {
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
    if (author && currentUser.author === 'system') db.users[userIndex].author = author;
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

  res.redirect('/panel/users');
});

// 系统控制页面（仅system权限）
app.get('/panel/system', requireSystem, (req, res) => {
  const user = getUserBySession(req);
  res.render('admin/system', { user, currentPath: '/panel/system' });
});

// 重启服务器（仅system权限）
app.post('/panel/system/restart', requireSystem, (req, res) => {
  res.send('服务器将在几秒后重启...');
  setTimeout(() => {
    process.exit(0);
  }, 3000);
});

// 关闭服务器（仅system权限）
app.post('/panel/system/shutdown', requireSystem, (req, res) => {
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
  
  for (const module of modules) {
    try {
      const sandbox = new ModuleSandbox(module.path, module, app);
      moduleSandboxes.set(module.dirName, sandbox);
      
      // 加载模块代码并初始化
      const moduleExports = sandbox.loadModuleCode();
      if (typeof moduleExports.init === 'function') {
        moduleExports.init(sandbox.sandbox, module);
      }
      
      console.log(`模块沙盒已初始化：${module.name} v${module.version}`);
    } catch (error) {
      console.error(`初始化模块沙盒失败 ${module.name}:`, error);
    }
  }
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

  const modulePath = path.join(__dirname, 'module', moduleName, module.main);

  if (!fs.existsSync(modulePath)) {
    return res.status(404).send('模块入口文件不存在');
  }

  // 为模块渲染页面，传递用户信息和模块信息
  res.render(`../module/${moduleName}/${module.main.replace('.ejs', '')}`, {
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

// API: 获取系统公告
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

// 启动服务器
server.listen(PORT, () => {
  console.log(`零核服务器运行在 http://localhost:${PORT}`);
  
  // 初始化模块沙盒
  initModuleSandboxes();
});