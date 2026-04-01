// ============================================
// ZCnet 网络与积分池管理系统
// ============================================

const crypto = require('crypto');

// ZCnet 网络配置
const ZCNET_CONFIG = {
  // 节点间通信密钥（应通过环境变量或配置文件设置）
  networkSecret: process.env.ZCNET_SECRET || 'zcnet-default-secret-change-in-production',
  // 积分池 ID 长度
  creditIdLength: 16,
  // 积分池文件路径
  creditPoolPath: './data/credit-pool.json'
};

// 积分池管理器
class CreditPoolManager {
  constructor(poolPath = ZCNET_CONFIG.creditPoolPath) {
    this.poolPath = path.join(__dirname, poolPath);
    this.ensurePoolFileExists();
    this.loadPool();
  }

  // 确保积分池文件存在
  ensurePoolFileExists() {
    const dir = path.dirname(this.poolPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.poolPath)) {
      const initialPool = {
        credits: [],  // 积分池中的积分（未被分配）
        totalGenerated: 0,  // 累计生成的积分总数
        totalAllocated: 0,  // 已分配的积分总数
        totalRecycled: 0,   // 已回收的积分总数
        history: []         // 操作历史
      };
      fs.writeFileSync(this.poolPath, JSON.stringify(initialPool, null, 2));
    }
  }

  // 加载积分池
  loadPool() {
    try {
      this.pool = JSON.parse(fs.readFileSync(this.poolPath, 'utf8'));
    } catch (error) {
      bsio.error(`加载积分池失败：${error.message}`);
      this.pool = {
        credits: [],
        totalGenerated: 0,
        totalAllocated: 0,
        totalRecycled: 0,
        history: []
      };
    }
  }

  // 保存积分池
  savePool() {
    try {
      fs.writeFileSync(this.poolPath, JSON.stringify(this.pool, null, 2));
    } catch (error) {
      bsio.error(`保存积分池失败：${error.message}`);
      throw error;
    }
  }

  // 生成积分 ID（固定长度）
  generateCreditId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = '';
    for (let i = 0; i < ZCNET_CONFIG.creditIdLength; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // 检查是否已存在
    if (this.pool.credits.some(c => c.id === id)) {
      return this.generateCreditId();
    }
    return id;
  }

  // 生成积分（投入积分池）
  generateCredits(amount, source = 'system') {
    const credits = [];
    for (let i = 0; i < amount; i++) {
      const credit = {
        id: this.generateCreditId(),
        value: 1,  // 每个积分价值为 1
        generatedAt: new Date().toISOString(),
        source: source,
        status: 'available'  // available, allocated, recycled
      };
      credits.push(credit);
      this.pool.credits.push(credit);
    }
    this.pool.totalGenerated += amount;
    this.addHistory('generate', amount, source);
    this.savePool();
    bsio.info(`生成 ${amount} 个积分，来源：${source}`);
    return credits;
  }

  // 从积分池分配积分给用户
  allocateCredits(userId, amount, operator) {
    if (this.pool.credits.length < amount) {
      return { success: false, error: '积分池余额不足', available: this.pool.credits.length };
    }

    const allocatedCredits = this.pool.credits.splice(0, amount);
    allocatedCredits.forEach(credit => {
      credit.status = 'allocated';
      credit.allocatedAt = new Date().toISOString();
      credit.allocatedTo = userId;
      credit.allocatedBy = operator;
    });

    this.pool.totalAllocated += amount;
    this.addHistory('allocate', amount, operator, userId);
    this.savePool();

    bsio.info(`分配 ${amount} 个积分给用户 ${userId}，操作者：${operator}`);
    return { success: true, credits: allocatedCredits, count: allocatedCredits.length };
  }

  // 回收用户积分（重新投入积分池）
  recycleCredits(userId, creditIds, operator) {
    const recycled = [];
    const notFound = [];

    // 这里简化处理，直接从积分池中查找并标记为可回收
    // 实际应该从用户数据中查找
    creditIds.forEach(id => {
      const credit = this.pool.credits.find(c => c.id === id);
      if (credit && credit.status === 'allocated' && credit.allocatedTo === userId) {
        credit.status = 'available';
        credit.recycledAt = new Date().toISOString();
        credit.recycledBy = operator;
        delete credit.allocatedTo;
        delete credit.allocatedAt;
        recycled.push(credit);
      } else {
        notFound.push(id);
      }
    });

    this.pool.totalRecycled += recycled.length;
    if (recycled.length > 0) {
      this.addHistory('recycle', recycled.length, operator, userId);
      this.savePool();
      bsio.info(`回收 ${recycled.length} 个积分，用户：${userId}，操作者：${operator}`);
    }

    return { success: notFound.length === 0, recycled, notFound };
  }

  // 添加历史记录
  addHistory(action, amount, operator, targetUser = null) {
    this.pool.history.push({
      action,
      amount,
      operator,
      targetUser,
      timestamp: new Date().toISOString()
    });
    // 保留最近 1000 条记录
    if (this.pool.history.length > 1000) {
      this.pool.history = this.pool.history.slice(-1000);
    }
  }

  // 获取积分池统计
  getStats() {
    return {
      available: this.pool.credits.filter(c => c.status === 'available').length,
      allocated: this.pool.credits.filter(c => c.status === 'allocated').length,
      totalGenerated: this.pool.totalGenerated,
      totalAllocated: this.pool.totalAllocated,
      totalRecycled: this.pool.totalRecycled,
      historyCount: this.pool.history.length
    };
  }

  // 获取积分池数据（用于同步）
  getPoolData() {
    return this.pool;
  }

  // 导入积分池数据（从其他节点同步）
  importPoolData(data, merge = false) {
    if (merge) {
      // 合并模式：只添加本地没有的积分
      const existingIds = new Set(this.pool.credits.map(c => c.id));
      data.credits.forEach(credit => {
        if (!existingIds.has(credit.id)) {
          this.pool.credits.push(credit);
        }
      });
      this.pool.totalGenerated = Math.max(this.pool.totalGenerated, data.totalGenerated);
      this.pool.totalAllocated = Math.max(this.pool.totalAllocated, data.totalAllocated);
      this.pool.totalRecycled = Math.max(this.pool.totalRecycled, data.totalRecycled);
    } else {
      // 覆盖模式
      this.pool = data;
    }
    this.savePool();
  }
}

// ZCnet 网络通信
class ZCnetNetwork {
  constructor(encryption) {
    this.encryption = encryption;
    this.knownNodes = new Map();  // 已知节点列表
  }

  // 注册节点
  registerNode(nodeId, nodeUrl, sharedSecret) {
    this.knownNodes.set(nodeId, {
      url: nodeUrl,
      sharedSecret: sharedSecret,
      registeredAt: new Date().toISOString()
    });
    bsio.info(`注册 ZCnet 节点：${nodeId} (${nodeUrl})`);
  }

  // 生成节点间通信签名
  generateSignature(data, secret) {
    return crypto.createHmac('sha256', secret).update(JSON.stringify(data)).digest('hex');
  }

  // 验证请求签名
  verifySignature(data, signature, secret) {
    const expectedSignature = this.generateSignature(data, secret);
    return signature === expectedSignature;
  }

  // 加密数据（节点间通信）
  encryptData(data, secret) {
    const iv = crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync(secret, 'zcnet-key-derivation', 100000, 32, 'sha256');
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return {
      iv: iv.toString('hex'),
      data: encrypted
    };
  }

  // 解密数据（节点间通信）
  decryptData(encryptedData, iv, secret) {
    const key = crypto.pbkdf2Sync(secret, 'zcnet-key-derivation', 100000, 32, 'sha256');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(iv, 'hex'));
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  }

  // 发送数据到远程节点
  async sendToNode(nodeId, dataType, data, action = 'sync') {
    const node = this.knownNodes.get(nodeId);
    if (!node) {
      return { success: false, error: '未知节点' };
    }

    const payload = {
      type: dataType,
      action: action,
      data: data,
      timestamp: Date.now()
    };

    const encrypted = this.encryptData(payload, node.sharedSecret);
    const signature = this.generateSignature(encrypted, node.sharedSecret);

    try {
      const response = await fetch(`${node.url}/api/zcnet/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          encrypted: encrypted,
          signature: signature
        })
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 广播数据到所有节点
  async broadcast(dataType, data, action = 'sync') {
    const promises = [];
    for (const nodeId of this.knownNodes.keys()) {
      promises.push(this.sendToNode(nodeId, dataType, data, action));
    }
    return Promise.all(promises);
  }
}

// 导出
module.exports = {
  ZCNET_CONFIG,
  CreditPoolManager,
  ZCnetNetwork
};
