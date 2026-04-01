# ZCnet 聚合器通信规范（修订版）

**版本**: 1.1.0
**基于**: 等离子工作室路径与请求格式规范 v2.1
**团队**: 等离子工作室（DLZstudio）

---

## 一、概述

本规范定义了 ZCnet 网络中聚合器（Aggregator）如何标识、处理和转发网络请求。**子包由发送方定义，包含完整的 TCP/UDP/HTTP(S) 请求信息**。

---

## 二、主包结构

### 1. 完整主包格式

```json
{
  "source": "ZCSMSS-worknet",
  "version": "1.0.0",
  "timestamp": 1674806400000,
  "sequence": 1001,
  "signature": "HMAC-SHA256 签名",
  "packets": [
    {
      "name": "zcs-core-user-sync",
      "protocol": "HTTP",
      "method": "POST",
      "path": "/api/zcnet/sync-user",
      "headers": {
        "Content-Type": "application/json"
      },
      "body": {
        "user": { "UUID": "0000-0000-0000-0000", "name": "admin" },
        "action": "update"
      }
    },
    {
      "name": "zcs-credit-add",
      "protocol": "HTTP",
      "method": "POST",
      "path": "/api/zcnet/credit-pool/allocate",
      "headers": {
        "Content-Type": "application/json"
      },
      "body": {
        "userId": "0000-0000-0000-0000",
        "amount": 100
      }
    },
    {
      "name": "time-sync",
      "protocol": "HTTP",
      "method": "GET",
      "path": "/api/time",
      "query": {
        "local": "2026-03-17T12:00:00.000Z"
      }
    }
  ]
}
```

### 2. 字段详解

#### 主包字段

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `source` | string | ✓ | 聚合器标识，格式：`[name]-[suffix]` |
| `version` | string | ✓ | 聚合器版本（语义化版本） |
| `timestamp` | number | ✓ | Unix 时间戳（毫秒），用于防重放攻击 |
| `sequence` | number | ✓ | 序列号，递增，用于包顺序验证 |
| `signature` | string | ✓ | HMAC-SHA256 签名，验证包完整性 |
| `packets` | array | ✓ | **子包数组**，包含多个网络请求 |

#### 子包字段

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `name` | string | ✓ | **子包名称**（由发送者自定义，用于标识请求用途） |
| `protocol` | string | ✓ | 协议类型：`HTTP`、`HTTPS`、`TCP`、`UDP`、`WebSocket` |
| `method` | string | ✓ | HTTP 方法：`GET`、`POST`、`PUT`、`DELETE`、`PATCH` 等 |
| `path` | string | ✓ | 请求路径（如 `/api/time`） |
| `headers` | object | ✗ | HTTP 请求头 |
| `query` | object | ✗ | URL 查询参数（GET 请求） |
| `body` | object | ✗ | 请求体（POST/PUT 请求） |
| `port` | number | ✗ | TCP/UDP 端口（非 HTTP 协议必需） |
| `host` | string | ✗ | 目标主机（默认当前节点） |
| `timeout` | number | ✗ | 超时时间（毫秒），默认 30000 |

---

## 三、子包定义规范

### 1. 子包命名建议

**格式**: `[模块]-[功能]-[操作]`

**示例**:
- `zcs-core-user-sync` - 核心模块用户同步
- `zcs-credit-pool-generate` - 积分池生成
- `zcs-module-deploy` - 模块部署
- `time-sync` - 时间同步
- `forum-post-create` - 论坛发帖

### 2. HTTP 请求子包

#### GET 请求示例

```json
{
  "name": "get-server-time",
  "protocol": "HTTP",
  "method": "GET",
  "path": "/api/time",
  "query": {
    "local": "2026-03-17T12:00:00.000Z"
  }
}
```

#### POST 请求示例

```json
{
  "name": "create-user",
  "protocol": "HTTP",
  "method": "POST",
  "path": "/api/zcnet/sync-user",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer token123"
  },
  "body": {
    "user": {
      "UUID": "1111-1111-1111-1111",
      "name": "newuser",
      "author": "user"
    },
    "action": "create"
  }
}
```

#### PUT 请求示例

```json
{
  "name": "update-user-permission",
  "protocol": "HTTP",
  "method": "PUT",
  "path": "/api/zcnet/user/1111-1111-1111-1111",
  "headers": {
    "Content-Type": "application/json"
  },
  "body": {
    "author": "admin"
  }
}
```

### 3. TCP/UDP 子包

#### TCP 请求示例

```json
{
  "name": "tcp-data-transfer",
  "protocol": "TCP",
  "host": "192.168.1.100",
  "port": 8080,
  "body": "HELO server\n",
  "timeout": 10000
}
```

#### UDP 广播示例

```json
{
  "name": "udp-broadcast-discovery",
  "protocol": "UDP",
  "host": "255.255.255.255",
  "port": 5000,
  "body": "{\"type\":\"discovery\",\"from\":\"node-1\"}",
  "timeout": 5000
}
```

### 4. WebSocket 子包

```json
{
  "name": "websocket-chat-message",
  "protocol": "WebSocket",
  "path": "/ws/chat",
  "body": {
    "type": "message",
    "data": {
      "sender": "user1",
      "content": "Hello!"
    }
  }
}
```

---

## 四、包处理流程

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
│    - 重复 → 返回 409（重放攻击）                         │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│ 4. 遍历 packets 数组                                     │
│    - 按顺序处理每个子包                                  │
│    - 根据 protocol 和 method 执行对应操作                │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│ 5. 执行子包请求                                          │
│    - HTTP/HTTPS: 内部路由或外部请求                      │
│    - TCP/UDP: 套接字通信                                 │
│    - WebSocket: WebSocket 连接                           │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│ 6. 收集所有子包响应                                      │
│    - 成功：{ name: "xxx", success: true, data: {...} } │
│    - 失败：{ name: "xxx", success: false, error: "..." }│
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│ 7. 返回聚合响应                                          │
│    {                                                    │
│      "success": true,                                   │
│      "results": [                                       │
│        { "name": "zcs-core-user-sync", ... },           │
│        { "name": "zcs-credit-add", ... }                │
│      ]                                                  │
│    }                                                    │
└─────────────────────────────────────────────────────────┘
```

---

## 五、错误处理

### 1. 错误码定义

| 错误码 | 说明 | 处理方式 |
|--------|------|----------|
| 400 | 请求格式错误/数据过期 | 检查包结构和时间戳 |
| 401 | 未授权（无共享密钥） | 联系管理员注册节点 |
| 403 | 签名验证失败 | 检查密钥是否一致 |
| 404 | 子包路径不存在 | 检查路径是否正确 |
| 408 | 子包请求超时 | 检查 timeout 设置 |
| 409 | 序列号冲突 | 调整序列号或检查重放 |
| 500 | 服务器内部错误 | 查看服务器日志 |

### 2. 子包响应格式

```json
{
  "name": "子包名称",
  "success": true,
  "statusCode": 200,
  "data": { ... },
  "headers": { ... }
}
```

**失败响应**:
```json
{
  "name": "子包名称",
  "success": false,
  "statusCode": 404,
  "error": "路径不存在",
  "message": "详细错误信息"
}
```

---

## 六、API 端点

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
  "results": [
    {
      "name": "zcs-core-user-sync",
      "success": true,
      "statusCode": 200,
      "data": { "message": "用户已同步" }
    },
    {
      "name": "get-server-time",
      "success": true,
      "statusCode": 200,
      "data": { "ZCS_time": "2026-03-17T12:00:00.000Z" }
    }
  ],
  "failed": [
    {
      "name": "invalid-request",
      "success": false,
      "statusCode": 404,
      "error": "路径不存在"
    }
  ]
}
```

---

## 七、示例场景

### 场景 1: 批量用户操作

```json
{
  "source": "ZCSMSS-worknet",
  "version": "1.0.0",
  "timestamp": 1674806400000,
  "sequence": 1001,
  "packets": [
    {
      "name": "create-user-1",
      "protocol": "HTTP",
      "method": "POST",
      "path": "/api/zcnet/sync-user",
      "body": {
        "user": { "UUID": "1111-1111-1111-1111", "name": "user1" },
        "action": "create"
      }
    },
    {
      "name": "create-user-2",
      "protocol": "HTTP",
      "method": "POST",
      "path": "/api/zcnet/sync-user",
      "body": {
        "user": { "UUID": "2222-2222-2222-2222", "name": "user2" },
        "action": "create"
      }
    },
    {
      "name": "give-bonus-user-1",
      "protocol": "HTTP",
      "method": "POST",
      "path": "/api/zcnet/credit-pool/allocate",
      "body": {
        "userId": "1111-1111-1111-1111",
        "amount": 1000
      }
    }
  ]
}
```

### 场景 2: 跨节点数据同步 + 时间校准

```json
{
  "source": "ZCSMSS-sync",
  "version": "1.0.0",
  "timestamp": 1674806400000,
  "sequence": 2001,
  "packets": [
    {
      "name": "sync-time",
      "protocol": "HTTP",
      "method": "GET",
      "path": "/api/time",
      "query": {
        "local": "2026-03-17T12:00:00.000Z"
      }
    },
    {
      "name": "sync-credit-pool",
      "protocol": "HTTP",
      "method": "POST",
      "path": "/api/zcnet/sync-credit-pool",
      "body": {
        "poolData": { "...": "..." },
        "merge": true
      }
    },
    {
      "name": "get-announcement",
      "protocol": "HTTP",
      "method": "GET",
      "path": "/api/announcement"
    }
  ]
}
```

### 场景 3: 混合协议请求

```json
{
  "source": "ZCSMSS-multi",
  "version": "1.0.0",
  "timestamp": 1674806400000,
  "sequence": 3001,
  "packets": [
    {
      "name": "http-api-call",
      "protocol": "HTTP",
      "method": "POST",
      "path": "/api/chat/send",
      "body": {
        "recipient": "0000-0000-0000-0000",
        "content": "Hello!"
      }
    },
    {
      "name": "tcp-internal-call",
      "protocol": "TCP",
      "host": "127.0.0.1",
      "port": 8080,
      "body": "GET /status HTTP/1.1\r\nHost: localhost\r\n\r\n"
    },
    {
      "name": "udp-broadcast",
      "protocol": "UDP",
      "host": "255.255.255.255",
      "port": 5000,
      "body": "{\"type\":\"presence\",\"node\":\"node-1\"}"
    }
  ]
}
```

---

## 八、最佳实践

1. **子包命名**: 使用有意义的名称，便于日志追踪和错误排查
2. **协议选择**: 
   - 内部 API 调用使用 `HTTP`
   - 外部服务使用 `HTTPS`
   - 实时通信用 `WebSocket`
   - 大数据传输考虑 `TCP`
3. **超时设置**: 根据请求类型合理设置 timeout
   - HTTP API: 30 秒
   - TCP/UDP: 10 秒
   - WebSocket: 60 秒
4. **错误处理**: 检查每个子包的响应，处理部分失败情况
5. **日志记录**: 记录所有子包的名称、路径和结果

---

## 九、与旧版本的区别

| 特性 | v1.0.0 | v1.1.0 |
|------|--------|--------|
| 子包定义 | 固定模块/动作 | **完整网络请求** |
| 协议支持 | 仅 HTTP | **HTTP/TCP/UDP/WebSocket** |
| 请求参数 | 固定 data 格式 | **query/body/headers** |
| 灵活性 | 低 | **高** |

---

**等离子工作室 - ZCnet 开发团队**

*规范源于实践，服务于协作。*
