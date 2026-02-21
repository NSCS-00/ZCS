/**
 * ZCS Advanced Encryption Module
 * 零核服务器高级加密模块
 * Implements the new multi-layer encryption system
 * 实现新的多层加密系统
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

class AdvancedEncryption {
  constructor(secretFilePath = './data/secret.json') {
    this.secretFilePath = secretFilePath;
    this.ensureSecretFileExists();
    this.loadSecrets();
  }

  /**
   * Ensures the secret file exists with proper structure
   * 确保密钥文件存在并具有正确的结构
   */
  ensureSecretFileExists() {
    if (!fs.existsSync(path.dirname(this.secretFilePath))) {
      fs.mkdirSync(path.dirname(this.secretFilePath), { recursive: true });
    }

    if (!fs.existsSync(this.secretFilePath)) {
      const defaultStructure = {
        main: { secret: "0000" },  // Default main key / 默认主密钥
        deputy: { secret: "" },    // Deputy key (encrypted with main key) / 副密钥（用主密钥加密）
        system: { secret: "" },    // System key (encrypted with deputy key) / 系统密钥（用副密钥加密）
        file: {}                   // File keys (encrypted with system key) / 文件密钥（用系统密钥加密）
      };
      fs.writeFileSync(this.secretFilePath, JSON.stringify(defaultStructure, null, 2));
    }
  }

  /**
   * Loads secrets from the secret file
   * 从密钥文件加载密钥
   */
  loadSecrets() {
    const secretsData = JSON.parse(fs.readFileSync(this.secretFilePath, 'utf8'));
    this.mainSecret = secretsData.main.secret;

    // Load deputy key (which is encrypted with main key)
    // 加载副密钥（用主密钥加密）
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

    // Load system key (which is encrypted with deputy key)
    // 加载系统密钥（用副密钥加密）
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

    // Auto-generate missing keys on startup
    // 启动时自动生成缺失的密钥
    this.autoGenerateMissingKeys();
  }

  /**
   * Auto-generates missing keys on startup
   * 启动时自动生成缺失的密钥
   */
  autoGenerateMissingKeys() {
    let updated = false;

    // Generate deputy key if missing
    // 如果副密钥缺失，自动生成
    if (!this.deputySecret) {
      this.deputySecret = this.generateRandomKey();
      console.log('Generated new deputy key');
      updated = true;
    }

    // Generate system key if missing
    // 如果系统密钥缺失，自动生成
    if (!this.systemSecret) {
      this.systemSecret = this.generateRandomKey();
      console.log('Generated new system key');
      updated = true;
    }

    if (updated) {
      this.saveSecrets();
    }
  }

  /**
   * Saves secrets to the secret file
   * 将密钥保存到密钥文件
   */
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

    // Set restrictive file permissions (read/write for owner only)
    // 设置限制性文件权限（仅所有者可读/写）
    try {
      fs.chmodSync(this.secretFilePath, 0o600);
    } catch (err) {
      console.warn('Could not set file permissions on secret file:', err.message);
      console.warn('无法设置密钥文件的文件权限:', err.message);
    }
  }

  /**
   * Simple encryption function for encrypting keys
   * 简单加密函数，用于加密密钥
   */
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

    // Return salt + iv + encrypted data
    // 返回盐值 + IV + 加密数据
    return `${salt}:${iv.toString('hex')}:${encrypted}`;
  }

  /**
   * Simple decryption function for decrypting keys
   * 简单解密函数，用于解密密钥
   */
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

  /**
   * Generates salt based on system parameters, time, and most importantly, strong entropy from crypto.randomBytes
   * 基于系统参数、时间，最重要的是来自crypto.randomBytes的强大熵生成盐值
   */
  generateSalt(seed = null) {
    const seedValue = seed || this.mainSecret;

    // Get system parameters / 获取系统参数
    const platform = os.platform();
    const arch = os.arch();
    const release = os.release();
    const hostname = os.hostname();

    // Get current time / 获取当前时间
    const time = Date.now().toString();

    // CRITICAL: Use crypto.randomBytes as the primary entropy source
    // 关键：使用crypto.randomBytes作为主要熵源
    const primaryEntropy = crypto.randomBytes(32).toString('hex'); // 256 bits of entropy / 256位熵

    // Additional system parameters for uniqueness / 附加系统参数以确保唯一性
    const cpus = os.cpus();
    const totalCpuTime = cpus.reduce((acc, cpu) => {
      const times = cpu.times;
      return acc + times.user + times.nice + times.sys + times.idle;
    }, 0);
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // Combine all factors, with primary entropy being the dominant factor
    // 组合所有因素，主要熵源作为主导因素
    const saltBase = `${primaryEntropy}${seedValue}${platform}${arch}${release}${hostname}${time}${totalCpuTime}${usedMem}`;

    // Hash the combined string to create a consistent salt
    // 哈希组合字符串以创建一致的盐值
    return crypto.createHash('sha256').update(saltBase).digest('hex');
  }

  /**
   * Derives a key using PBKDF2 with the generated salt
   * 使用PBKDF2和生成的盐值派生密钥
   */
  deriveKey(password, salt, keyLen = 32) {
    if (!password || !salt) {
      throw new Error('Password and salt are required for key derivation');
    }
    return crypto.pbkdf2Sync(password, salt, 100000, keyLen, 'sha256');
  }

  /**
   * Creates a new file key (MD5 hash of file content)
   * 创建新文件密钥（文件内容的MD5哈希）
   */
  createFileKey(content) {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Generates a system key (time + system parameters + entropy)
   * 生成系统密钥（时间 + 系统参数 + 熵）
   */
  generateSystemKey() {
    const time = Math.floor(Date.now() / (10 * 24 * 60 * 60 * 1000)); // Time chunk of 10 days / 10天时间段
    const platform = os.platform();
    const arch = os.arch();
    const release = os.release();
    const hostname = os.hostname();

    // Add entropy from crypto.randomBytes
    // 添加来自crypto.randomBytes的熵
    const entropy = crypto.randomBytes(16).toString('hex');

    return `${time}${platform}${arch}${release}${hostname}${entropy}`;
  }

  /**
   * Generates a random 256-bit string for副密钥 using crypto.randomBytes as entropy source
   * 使用crypto.randomBytes作为熵源生成256位随机字符串作为副密钥
   */
  generateRandomKey() {
    return crypto.randomBytes(32).toString('hex'); // 64 characters = 256 bits / 64个字符 = 256位
  }

  /**
   * Encrypts data using the layered approach
   * Main Key -> (with Salt) -> System Key -> (with Salt) -> File Key -> (with Salt) -> Content
   * 使用分层方法加密数据
   * 主密钥 -> (与盐值) -> 系统密钥 -> (与盐值) -> 文件密钥 -> (与盐值) -> 内容
   */
  encrypt(content, filePath = null) {
    // Step 1: Create file key from content MD5
    // 步骤1：从内容MD5创建文件密钥
    const fileKey = this.createFileKey(content);

    // Step 2: If filePath is provided, store the file key
    // 步骤2：如果提供了文件路径，则存储文件密钥
    if (filePath) {
      this.fileSecrets[filePath] = { secret: fileKey };
      this.saveSecrets();
    }

    // Step 3: Encrypt content with file key
    // 步骤3：使用文件密钥加密内容
    const salt1 = this.generateSalt(fileKey);
    const derivedFileKey = this.deriveKey(fileKey, salt1);
    const iv1 = crypto.randomBytes(16); // Using crypto.randomBytes for IV / 使用crypto.randomBytes生成IV
    const cipher1 = crypto.createCipheriv('aes-256-cbc', derivedFileKey, iv1);
    let encryptedContent = cipher1.update(content, 'utf8', 'hex');
    encryptedContent += cipher1.final('hex');

    // Step 4: Encrypt file key with system key
    // 步骤4：使用系统密钥加密文件密钥
    let encryptedFileKey = '';
    let salt2 = '';
    let iv2Str = '';
    if (this.systemSecret) {
      salt2 = this.generateSalt(this.systemSecret);
      const derivedSystemKey = this.deriveKey(this.systemSecret, salt2);
      const iv2 = crypto.randomBytes(16); // Using crypto.randomBytes for IV / 使用crypto.randomBytes生成IV
      const cipher2 = crypto.createCipheriv('aes-256-cbc', derivedSystemKey, iv2);
      encryptedFileKey = cipher2.update(fileKey, 'utf8', 'hex');
      encryptedFileKey += cipher2.final('hex');
      iv2Str = iv2.toString('hex'); // Store the actual IV used
    } else {
      // 如果系统密钥不存在，直接使用文件密钥作为加密结果
      encryptedFileKey = fileKey;
      salt2 = this.generateSalt(fileKey);
      iv2Str = ''; // No IV used
    }

    // Step 5: Encrypt system key with main key
    // 步骤5：使用主密钥加密系统密钥
    let encryptedSystemKey = '';
    let salt3 = '';
    let iv3Str = '';
    if (this.mainSecret && this.systemSecret) {
      salt3 = this.generateSalt(this.mainSecret);
      const derivedMainKey = this.deriveKey(this.mainSecret, salt3);
      const iv3 = crypto.randomBytes(16); // Using crypto.randomBytes for IV / 使用crypto.randomBytes生成IV
      const cipher3 = crypto.createCipheriv('aes-256-cbc', derivedMainKey, iv3);
      encryptedSystemKey = cipher3.update(this.systemSecret, 'utf8', 'hex');
      encryptedSystemKey += cipher3.final('hex');
      iv3Str = iv3.toString('hex'); // Store the actual IV used
    } else if (this.mainSecret) {
      // 如果系统密钥不存在，使用主密钥加密文件密钥
      salt3 = this.generateSalt(this.mainSecret);
      const derivedMainKey = this.deriveKey(this.mainSecret, salt3);
      const iv3 = crypto.randomBytes(16); // Using crypto.randomBytes for IV / 使用crypto.randomBytes生成IV
      const cipher3 = crypto.createCipheriv('aes-256-cbc', derivedMainKey, iv3);
      encryptedSystemKey = cipher3.update(fileKey, 'utf8', 'hex');
      encryptedSystemKey += cipher3.final('hex');
      iv3Str = iv3.toString('hex'); // Store the actual IV used
    } else {
      // 如果主密钥也不存在，直接使用文件密钥
      encryptedSystemKey = fileKey;
      salt3 = this.generateSalt(fileKey);
      iv3Str = ''; // No IV used
    }

    // Return all encrypted components with metadata
    // 返回所有加密组件及元数据
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

  /**
   * Decrypts data using the layered approach
   * 使用分层方法解密数据
   */
  decrypt(encryptedData, filePath = null) {
    try {
      // Step 1: Determine what was encrypted and decrypt it appropriately
      // 步骤1：确定加密了什么并适当解密
      let decryptedSystemKey;
      let actualFileKey;

      // If main secret exists and IV3 exists, something was encrypted with main secret
      // 如果主密钥存在且IV3存在，说明有东西是用主密钥加密的
      if (this.mainSecret && encryptedData.iv3 && encryptedData.iv3 !== '') {
        // Something was encrypted with main secret - could be system secret or file key
        // 有东西是用主密钥加密的 - 可能是系统密钥或文件密钥
        const salt3 = encryptedData.salt3;
        const derivedMainKey = this.deriveKey(this.mainSecret, salt3);
        const iv3 = Buffer.from(encryptedData.iv3, 'hex'); // IV is properly handled / IV被正确处理
        const decipher3 = crypto.createDecipheriv(encryptedData.algorithm, derivedMainKey, iv3);
        let decryptedWithMain = decipher3.update(encryptedData.encryptedSystemKey, 'hex', 'utf8');
        decryptedWithMain += decipher3.final('utf8');

        // If system secret exists at encryption time, then the encrypted data was system secret
        // If system secret didn't exist at encryption time, then the encrypted data was file key
        // 如果加密时系统密钥存在，那么加密的数据是系统密钥
        // 如果加密时系统密钥不存在，那么加密的数据是文件密钥
        // We determine this based on whether systemSecret exists now (assuming it hasn't changed)
        if (this.systemSecret) {
          // System secret exists, so encrypted data was system secret
          // 系统密钥存在，所以加密的数据是系统密钥
          decryptedSystemKey = decryptedWithMain;
          // File key will be decrypted in step 2
        } else {
          // System secret doesn't exist, so encrypted data was actually the file key
          // 系统密钥不存在，所以加密的数据实际上是文件密钥
          actualFileKey = decryptedWithMain;
          // Skip step 2 since we already have the file key
        }
      } else {
        // Either main secret doesn't exist, or nothing was encrypted with main secret
        // 主密钥不存在，或没有用主密钥加密任何东西
        decryptedSystemKey = encryptedData.encryptedSystemKey;
        // File key will be processed in step 2
      }

      // Step 2: Determine if file key was encrypted and decrypt it
      // 步骤2：确定文件密钥是否被加密并解密它
      let decryptedFileKey;

      // If we already have the file key from step 1, use it
      if (actualFileKey !== undefined) {
        decryptedFileKey = actualFileKey;
      } else {
        // Otherwise, check if file key was encrypted with system key
        // 否则，检查文件密钥是否用系统密钥加密
        // We need to determine if the file key was encrypted based on the encryption conditions
        // The key insight is that if systemSecret exists during encryption, file key was encrypted
        // If systemSecret didn't exist during encryption, file key was not encrypted

        // Since we can't know the state during encryption, we'll use a heuristic:
        // If encryptedData.iv2 exists and systemSecret exists now, assume file key was encrypted
        if (this.systemSecret && encryptedData.iv2 && encryptedData.iv2 !== '') {
          // System secret exists now and IV2 exists, assume file key was encrypted with system key
          // 系统密钥现在存在且IV2存在，假设文件密钥是用系统密钥加密的
          const salt2 = encryptedData.salt2;
          const derivedSystemKey = this.deriveKey(this.systemSecret, salt2);
          const iv2 = Buffer.from(encryptedData.iv2, 'hex'); // IV is properly handled / IV被正确处理
          const decipher2 = crypto.createDecipheriv(encryptedData.algorithm, derivedSystemKey, iv2);
          try {
            decryptedFileKey = decipher2.update(encryptedData.encryptedFileKey, 'hex', 'utf8');
            decryptedFileKey += decipher2.final('utf8');
          } catch (decryptError) {
            // If decryption fails, the file key might not have been encrypted, use as-is
            // 如果解密失败，文件密钥可能未加密，直接使用
            decryptedFileKey = encryptedData.encryptedFileKey;
          }
        } else {
          // System secret doesn't exist or IV2 doesn't exist, file key wasn't encrypted, use as-is
          // 系统密钥不存在或IV2不存在，文件密钥未加密，直接使用
          decryptedFileKey = encryptedData.encryptedFileKey;
        }
      }

      // Step 3: Decrypt content with file key
      // 步骤3：使用文件密钥解密内容
      const salt1 = encryptedData.salt1;
      const derivedFileKey = this.deriveKey(decryptedFileKey, salt1);
      const iv1 = Buffer.from(encryptedData.iv1, 'hex'); // IV is properly handled / IV被正确处理
      const decipher1 = crypto.createDecipheriv(encryptedData.algorithm, derivedFileKey, iv1);
      let decryptedContent = decipher1.update(encryptedData.encryptedContent, 'hex', 'utf8');
      decryptedContent += decipher1.final('utf8');

      return decryptedContent;
    } catch (error) {
      console.error('Decryption failed:', error);
      console.error('解密失败:', error);
      throw new Error('Decryption failed: Invalid key or corrupted data');
    }
  }

  /**
   * Updates the main secret key
   * 更新主密钥
   */
  updateMainSecret(newSecret) {
    if (!/^[a-zA-Z0-9]+$/.test(newSecret)) {
      throw new Error('Main secret must contain only letters and numbers');
    }

    // If we're changing the main secret, we need to re-encrypt the deputy key
    // 如果我们更改主密钥，需要重新加密副密钥
    const oldMainSecret = this.mainSecret;
    this.mainSecret = newSecret;

    // If deputy key existed, re-encrypt it with the new main key
    // 如果副密钥存在，用新主密钥重新加密
    if (this.deputySecret) {
      // First decrypt with old main key, then encrypt with new main key
      // 首先用旧主密钥解密，然后用新主密钥加密
      const encryptedDeputyWithOldMain = JSON.parse(fs.readFileSync(this.secretFilePath, 'utf8')).deputy.secret;
      let decryptedDeputy;
      try {
        decryptedDeputy = this.decryptSimple(encryptedDeputyWithOldMain, oldMainSecret);
      } catch (e) {
        // If we can't decrypt the old deputy key, we'll lose it
        // 如果无法解密旧副密钥，我们将丢失它
        console.error('Could not decrypt old deputy key with old main key');
      }

      if (decryptedDeputy) {
        // Re-encrypt deputy key with new main key
        // 用新主密钥重新加密副密钥
        this.deputySecret = decryptedDeputy;
      }
    }

    this.saveSecrets();
  }

  /**
   * Updates the deputy secret key (副密钥)
   * 更新副密钥（副密钥）
   */
  updateDeputySecret(newSecret = null, reencryptCallback = null) {
    if (newSecret === null) {
      newSecret = this.generateRandomKey();
    } else if (newSecret.length !== 64) { // 256 bits = 64 hex chars / 256位 = 64个十六进制字符
      throw new Error('Deputy secret must be a 256-bit hex string (64 characters)');
    }

    // Store backup for rollback
    const backupDeputySecret = this.deputySecret;

    try {
      this.deputySecret = newSecret;
      this.saveSecrets();

      // If a re-encryption callback is provided, use it to re-encrypt data
      if (reencryptCallback) {
        reencryptCallback(this);
      }
    } catch (error) {
      // Rollback on error
      this.deputySecret = backupDeputySecret;
      this.saveSecrets();
      throw error;
    }
  }

  /**
   * Updates the system secret key (系统密钥)
   * 更新系统密钥（系统密钥）
   */
  updateSystemSecret(newSecret = null, reencryptCallback = null) {
    if (newSecret === null) {
      newSecret = this.generateRandomKey();
    } else if (newSecret.length !== 64) { // 256 bits = 64 hex chars / 256位 = 64个十六进制字符
      throw new Error('System secret must be a 256-bit hex string (64 characters)');
    }

    // Store backup for rollback
    const backupSystemSecret = this.systemSecret;

    try {
      this.systemSecret = newSecret;
      this.saveSecrets();

      // If a re-encryption callback is provided, use it to re-encrypt data
      if (reencryptCallback) {
        reencryptCallback(this);
      }
    } catch (error) {
      // Rollback on error
      this.systemSecret = backupSystemSecret;
      this.saveSecrets();
      throw error;
    }
  }

  /**
   * Checks if system key needs rotation (every 10 days)
   * 检查系统密钥是否需要轮换（每10天）
   */
  needsSystemKeyRotation() {
    // Check if 10 days have passed since the system key was created
    // For simplicity, we'll use a basic check - in production, store timestamps
    // 检查自系统密钥创建以来是否已过去10天
    // 为简单起见，我们将使用基本检查 - 在生产环境中，存储时间戳
    if (!this.systemSecret) return true;

    // In a real implementation, we'd check the creation time
    // For now, we'll just return false since we don't store timestamps
    // 在实际实现中，我们会检查创建时间
    // 目前，我们只返回false，因为我们不存储时间戳
    return false;
  }

  /**
   * Performs key rotation for all encrypted data
   * 为所有加密数据执行密钥轮换
   */
  rotateKeys(allEncryptedData) {
    // Store current secrets for rollback
    // 存储当前密钥以供回滚
    const backupMainSecret = this.mainSecret;
    const backupDeputySecret = this.deputySecret;
    const backupSystemSecret = this.systemSecret;
    const backupFileSecrets = { ...this.fileSecrets };

    try {
      // Generate new keys
      // 生成新密钥
      const newDeputySecret = this.generateRandomKey();
      const newSystemSecret = this.generateRandomKey();

      // Update keys temporarily
      // 临时更新密钥
      const oldDeputySecret = this.deputySecret;
      const oldSystemSecret = this.systemSecret;
      this.deputySecret = newDeputySecret;
      this.systemSecret = newSystemSecret;

      // Re-encrypt all data with new keys
      // 使用新密钥重新加密所有数据
      const reencryptedData = {};
      for (const [key, encryptedEntry] of Object.entries(allEncryptedData)) {
        try {
          const decryptedContent = this.decrypt(encryptedEntry);
          reencryptedData[key] = this.encrypt(decryptedContent);
        } catch (decryptError) {
          console.error(`Failed to decrypt and re-encrypt data for key ${key}:`, decryptError);
          // Keep the original encrypted data if re-encryption fails
          reencryptedData[key] = encryptedEntry;
        }
      }

      // Save new secrets
      // 保存新密钥
      this.saveSecrets();

      return reencryptedData;
    } catch (error) {
      // Rollback on error
      // 出错时回滚
      this.mainSecret = backupMainSecret;
      this.deputySecret = backupDeputySecret;
      this.systemSecret = backupSystemSecret;
      this.fileSecrets = backupFileSecrets;
      this.saveSecrets();

      throw new Error(`Key rotation failed: ${error.message}`);
    }
  }

  /**
   * Gets the current main secret
   * 获取当前主密钥
   */
  getMainSecret() {
    return this.mainSecret;
  }

  /**
   * Gets the current deputy secret
   * 获取当前副密钥
   */
  getDeputySecret() {
    return this.deputySecret;
  }

  /**
   * Gets the current system secret
   * 获取当前系统密钥
   */
  getSystemSecret() {
    return this.systemSecret;
  }

  /**
   * Gets file secrets
   * 获取文件密钥
   */
  getFileSecrets() {
    return this.fileSecrets;
  }
}

// Export the AdvancedEncryption class
// 导出AdvancedEncryption类
module.exports = AdvancedEncryption;