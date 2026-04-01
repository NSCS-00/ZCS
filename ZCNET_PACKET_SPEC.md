# ZCnet 聚合器通信规范

**版本**: 1.0.0
**基于**: 等离子工作室路径与请求格式规范 v2.1
**团队**: 等离子工作室（DLZstudio）

---

## 一、概述

本规范定义了 ZCnet 网络中聚合器（Aggregator）如何标识、处理和分发网络包，确保多节点间的数据通信有序、可追溯、易扩展。

---

## 二、聚合器标识

### 1. 聚合器命名格式

```
[聚合器名]-[后缀]
```

**聚合器名**: 核心标识，由项目决定
- `ZCSMSS` - ZCS 主服务聚合器
- `ZCSMOD` - ZCS 模块聚合器
- `ZCSCRED` - ZCS 积分系统聚合器

**后缀**: 描述用途或目标网络（可选）
- `worknet` - 工作网络
- `client` - 客户端
- `backend` - 后端服务
- `sync` - 数据同步

**示例**:
```json
{
  "source": "ZCSMSS-worknet",
  "version": "1.0.0"
}
```

---

## 三、主包结构

### 1. 完整主包格式

```json
{
  "source": "ZCSMSS-worknet",
  "version": "1.0.0",
  "timestamp": 1674806400000,
  "sequence": 1001,
  "signature": "HMAC-SHA256 签名",
  "payload": {
    "zcs-core": {
      "module": "user",
      "action": "sync",
      "priority": 1,
      "data": {
        "user": { "UUID": "0000-0000-0000-0000", "name": "admin" }
      }
    },
    "zcs-credit": {
      "module": "credit-pool",
      "action": "allocate",
      "priority": 2,
      "data": {
        "userId": "0000-0000-0000-0000",
        "amount": 100
      }
    }
  }
}
```

### 2. 字段详解

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `source` | string | ✓ | 聚合器标识，格式：`[name]-[suffix]` |
| `version` | string | ✓ | 聚合器版本（语义化版本） |
| `timestamp` | number | ✓ | Unix 时间戳（毫秒），用于防重放攻击 |
| `sequence` | number | ✓ | 序列号，递增，用于包顺序验证 |
| `signature` | string | ✓ | HMAC-SHA256 签名，验证包完整性 |
| `payload` | object | ✓ | 有效载荷，包含各模块数据 |

### 3. Payload 结构

每个 payload 条目包含：

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `module` | string | ✓ | 模块标识 |
| `action` | string | ✓ | 操作类型 |
| `priority` | number | ✗ | 优先级（1-最高，5-最低），默认 3 |
| `data` | object | ✓ | 模块具体数据 |

---

## 四、模块与动作定义

### 1. 核心模块（zcs-core）

| 模块 | 动作 | 说明 | 数据格式 |
|------|------|------|----------|
| `user` | `sync` | 同步用户数据 | `{ user: UserObject, action: 'create'\\|'update'\\|'delete' }` |
| `user` | `transfer` | 用户转移 | `{ user: UserObject, sourceNode: string }` |
| `auth` | `verify` | 验证用户身份 | `{ UUID: string, token: string }` |
| `auth` | `revoke` | 撤销用户令牌 | `{ UUID: string, reason: string }` |

### 2. 积分模块（zcs-credit）

| 模块 | 动作 | 说明 | 数据格式 |
|------|------|------|----------|
| `credit-pool` | `generate` | 生成积分 | `{ amount: number, source: string }` |
| `credit-pool` | `allocate` | 分配积分 | `{ userId: string, amount: number }` |
| `credit-pool` | `recycle` | 回收积分 | `{ userId: string, creditIds: string[] }` |
| `credit-pool` | `sync` | 同步积分池 | `{ poolData: object, merge: boolean }` |
| `credit` | `add` | 添加用户积分 | `{ userId: string, amount: number, reason: string }` |
| `credit` | `subtract` | 减少用户积分 | `{ userId: string, amount: number, reason: string }` |

### 3. 模块模块（zcs-module）

| 模块 | 动作 | 说明 | 数据格式 |
|------|------|------|----------|
| `module` | `deploy` | 部署模块 | `{ moduleId: string, version: string, package: string }` |
| `module` | `remove` | 移除模块 | `{ moduleId: string }` |
| `module` | `update` | 更新模块配置 | `{ moduleId: string, config: object }` |

### 4. 论坛模块（zcs-forum）

| 模块 | 动作 | 说明 | 数据格式 |
|------|------|------|----------|
| `post` | `sync` | 同步帖子 | `{ post: PostObject, action: 'create'\\|'update'\\|'delete' }` |
| `category` | `sync` | 同步分类 | `{ category: CategoryObject }` |

---

## 五、包处理流程

### 1. 接收主包

```
┌─────────────────────────────────────────────────────────┐
│                    接收主包                              │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│ 1. 验证签名 (HMAC-SHA256)                                │
│    - 遍历已知节点密钥                                    │
│    - 验证失败 → 返回 403                                │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│ 2. 验证时间戳                                            │
│    - 检查是否在 5 分钟有效期内                             │
│    - 过期 → 返回 400                                    │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│ 3. 验证序列号                                            │
│    - 检查是否重复接收                                    │
│    - 重复 → 返回 400（重放攻击）                         │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│ 4. 解析 payload                                          │
│    - 按优先级排序（1 最高，5 最低）                        │
│    - 依次处理每个模块请求                                │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│ 5. 分发到对应处理器                                      │
│    - handleUserDataSync()                              │
│    - handleCreditOperation()                           │
│    - handleModuleDeploy()                              │
│    - ...                                               │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│ 6. 返回响应                                              │
│    - 成功：{ success: true, results: {...} }           │
│    - 失败：{ success: false, error: "..." }            │
└─────────────────────────────────────────────────────────┘
```

### 2. 发送主包

```javascript
// 1. 收集各模块数据
const payload = {
  'zcs-core': {
    module: 'user',
    action: 'sync',
    priority: 1,
    data: { user: userData, action: 'update' }
  },
  'zcs-credit': {
    module: 'credit-pool',
    action: 'sync',
    priority: 2,
    data: { poolData: poolData, merge: true }
  }
};

// 2. 构建主包
const packet = {
  source: 'ZCSMSS-worknet',
  version: '1.0.0',
  timestamp: Date.now(),
  sequence: getNextSequence(),
  payload: payload
};

// 3. 生成签名
packet.signature = generateSignature(packet, sharedSecret);

// 4. 加密
const encrypted = encryptData(packet, sharedSecret);

// 5. 发送
fetch('http://target-node:5000/api/packet', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ encrypted, signature: packet.signature })
});
```

---

## 六、错误处理

### 1. 错误码定义

| 错误码 | 说明 | 处理方式 |
|--------|------|----------|
| 400 | 请求格式错误/数据过期 | 检查包结构和时间戳 |
| 401 | 未授权（无共享密钥） | 联系管理员注册节点 |
| 403 | 签名验证失败 | 检查密钥是否一致 |
| 404 | 模块/动作不存在 | 检查模块标识和动作 |
| 409 | 序列号冲突 | 调整序列号或检查重放 |
| 500 | 服务器内部错误 | 查看服务器日志 |

### 2. 错误响应格式

```json
{
  "success": false,
  "error": "签名验证失败",
  "errorCode": 403,
  "details": {
    "module": "zcs-core",
    "action": "user-sync",
    "timestamp": 1674806400000
  }
}
```

---

## 七、安全要求

### 1. 加密要求

- **算法**: AES-256-CBC
- **密钥派生**: PBKDF2 (100000 次迭代，SHA256)
- **IV**: 每次通信随机生成 16 字节

### 2. 签名要求

- **算法**: HMAC-SHA256
- **签名内容**: 加密后的数据包
- **验证**: 接收方遍历所有已知节点密钥验证

### 3. 防重放攻击

- **时间戳验证**: 5 分钟有效期
- **序列号记录**: 记录最近 1000 个序列号
- **重复检测**: 相同来源 + 相同序列号 = 重放

---

## 八、API 端点

### 1. 主包接收端点

```
POST /api/packet
Content-Type: application/json

请求体:
{
  "encrypted": {
    "iv": "hex-encoded-iv",
    "data": "hex-encoded-encrypted-data"
  },
  "signature": "hmac-sha256-signature"
}

响应:
{
  "success": true,
  "results": {
    "zcs-core": { "success": true, "message": "用户数据已同步" },
    "zcs-credit": { "success": true, "count": 100 }
  }
}
```

### 2. 节点注册端点

```
POST /api/zcnet/register-node
Content-Type: application/json

请求体:
{
  "nodeId": "server-beijing",
  "nodeUrl": "http://192.168.1.100:5000",
  "sharedSecret": "your-shared-secret"
}
```

---

## 九、示例场景

### 场景 1: 用户数据同步

```json
{
  "source": "ZCSMSS-worknet",
  "version": "1.0.0",
  "timestamp": 1674806400000,
  "sequence": 1001,
  "payload": {
    "zcs-core": {
      "module": "user",
      "action": "sync",
      "priority": 1,
      "data": {
        "user": {
          "UUID": "0000-0000-0000-0000",
          "name": "admin",
          "points": 5000
        },
        "action": "update"
      }
    }
  }
}
```

### 场景 2: 跨节点积分分配

```json
{
  "source": "ZCSCRED-sync",
  "version": "1.0.0",
  "timestamp": 1674806400000,
  "sequence": 2001,
  "payload": {
    "zcs-credit": {
      "module": "credit",
      "action": "add",
      "priority": 2,
      "data": {
        "userId": "0000-0000-0000-0000",
        "amount": 100,
        "reason": "活动奖励",
        "sourceNode": "server-shanghai"
      }
    }
  }
}
```

### 场景 3: 批量操作

```json
{
  "source": "ZCSMSS-worknet",
  "version": "1.0.0",
  "timestamp": 1674806400000,
  "sequence": 3001,
  "payload": {
    "zcs-core": {
      "module": "user",
      "action": "sync",
      "priority": 1,
      "data": {
        "user": { "UUID": "1111-1111-1111-1111", "name": "user1" },
        "action": "create"
      }
    },
    "zcs-credit": {
      "module": "credit-pool",
      "action": "allocate",
      "priority": 2,
      "data": {
        "userId": "1111-1111-1111-1111",
        "amount": 1000
      }
    },
    "zcs-module": {
      "module": "module",
      "action": "deploy",
      "priority": 3,
      "data": {
        "moduleId": "chat-module",
        "version": "1.0.0",
        "package": "base64-encoded-package"
      }
    }
  }
}
```

---

## 十、最佳实践

1. **聚合器命名**: 使用有意义的名称，如 `ZCSMSS`（ZCS 主服务）、`ZCSCRED`（ZCS 积分）
2. **后缀使用**: 用后缀区分环境，如 `worknet`（工作网）、`testnet`（测试网）
3. **优先级设置**: 关键数据（用户、认证）设为 1-2，普通数据设为 3-5
4. **序列号管理**: 每个节点维护独立的序列号计数器
5. **密钥轮换**: 定期更换共享密钥，确保通信安全
6. **日志记录**: 记录所有主包收发，便于审计和故障排查

---

**等离子工作室 - ZCnet 开发团队**

*规范源于实践，服务于协作。*
