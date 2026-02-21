# 零核服务器 - 用户系统 API 文档

## 概述

零核服务器的用户系统提供了完整的用户管理功能，包括注册、登录、信息管理、头像上传等。本文档详细介绍了用户系统的所有 API 接口。

## 基础信息

### 认证方式
- 使用 Session 进行身份验证
- 登录后服务器会设置 `connect.sid` Cookie
- 需要登录的接口会返回 403 或重定向到登录页

### 基础 URL
```
http://localhost:5000
```

### 数据格式
- 请求格式：`application/json` 或 `application/x-www-form-urlencoded`
- 响应格式：`application/json` 或 HTML 页面

---

## 认证相关 API

### 1. 用户注册

#### 接口信息
- **路径**: `/register`
- **方法**: `POST`
- **认证**: 不需要
- **Content-Type**: `application/x-www-form-urlencoded`

#### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 是 | 用户名（至少 1 个字符） |
| password | string | 是 | 密码（至少 6 位） |
| confirmPassword | string | 是 | 确认密码 |

#### 请求示例
```bash
curl -X POST http://localhost:5000/register \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=testuser&password=123456&confirmPassword=123456"
```

#### 响应
- **成功**: 重定向到 `/login`
- **失败**: 返回注册页面，包含错误信息

#### 错误码
| 错误信息 | 说明 |
|----------|------|
| 请输入用户名和密码 | 用户名或密码为空 |
| 两次输入的密码不一致 | 密码和确认密码不匹配 |
| 密码长度至少为 6 位 | 密码长度不足 |
| 用户名已存在 | 用户名已被注册 |

---

### 2. 用户登录（用户名密码）

#### 接口信息
- **路径**: `/login`
- **方法**: `POST`
- **认证**: 不需要
- **Content-Type**: `application/x-www-form-urlencoded`

#### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 是 | 用户名或 UUID |
| password | string | 是 | 密码 |

#### 请求示例
```bash
curl -X POST http://localhost:5000/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=testuser&password=123456" \
  -c cookies.txt
```

#### 响应
- **成功**: 重定向到 `/`，并设置 Session Cookie
- **失败**: 返回登录页面，包含错误信息

#### 错误码
| 错误信息 | 说明 |
|----------|------|
| 请输入用户名/UUID 和密码 | 用户名或密码为空 |
| 用户名/UUID 不存在 | 用户不存在 |
| 密码错误 | 密码错误 |
| 登录失败，请稍后再试 | 系统错误 |

---

### 3. UUID 登录

#### 接口信息
- **路径**: `/uuid-login`
- **方法**: `POST`
- **认证**: 不需要
- **Content-Type**: `application/x-www-form-urlencoded`

#### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| uuid | string | 是 | 用户 UUID（格式：xxxx-xxxx-xxxx-xxxx） |

#### 请求示例
```bash
curl -X POST http://localhost:5000/uuid-login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "uuid=0000-0000-0000-0000" \
  -c cookies.txt
```

#### 响应
- **成功**: 重定向到 `/{UUID}/intro`
- **失败**: 返回 UUID 登录页面，包含错误信息

#### 错误码
| 错误信息 | 说明 |
|----------|------|
| 请输入 UUID | UUID 为空 |
| UUID 不存在 | UUID 对应的用户不存在 |

---

### 4. 用户登出

#### 接口信息
- **路径**: `/logout`
- **方法**: `POST`
- **认证**: 需要

#### 请求示例
```bash
curl -X POST http://localhost:5000/logout \
  -b cookies.txt
```

#### 响应
- **成功**: 重定向到 `/login`
- **失败**: 无

---

## 用户信息相关 API

### 5. 获取当前用户信息

#### 接口信息
- **路径**: `/` (主页)
- **方法**: `GET`
- **认证**: 需要

#### 响应示例
```json
{
  "name": "testuser",
  "UUID": "abcd-1234-5678-9012",
  "author": "user",
  "avatar": "/data/user/abcd-1234-5678-9012/avatar.jpg",
  "time": "2026-02-18T10:00:00.000Z",
  "points": 100,
  "theme": "dark",
  "lastLoginDate": "Wed Feb 18 2026"
}
```

#### 字段说明
| 字段 | 类型 | 说明 |
|------|------|------|
| name | string | 用户名 |
| UUID | string | 用户唯一标识 |
| author | string | 权限等级 (user/admin/system) |
| avatar | string | 头像路径 |
| time | string | 注册时间 |
| points | number | 积分 |
| theme | string | 主题设置 (dark/light) |
| lastLoginDate | string | 最后登录日期 |

---

### 6. 更新用户信息

#### 接口信息
- **路径**: `/settings`
- **方法**: `POST`
- **认证**: 需要
- **Content-Type**: `multipart/form-data`

#### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| newName | string | 否 | 新用户名 |
| oldPassword | string | 否 | 原密码（修改密码时需要） |
| newPassword | string | 否 | 新密码 |
| theme | string | 否 | 主题设置 (dark/light) |
| avatar | file | 否 | 头像文件 |
| background | file | 否 | 背景图文件 |

#### 请求示例
```bash
curl -X POST http://localhost:5000/settings \
  -b cookies.txt \
  -F "newName=newusername" \
  -F "theme=light" \
  -F "avatar=@avatar.jpg"
```

#### 响应
- **成功**: 返回设置页面，包含成功消息
- **失败**: 返回设置页面，包含错误信息

#### 错误码
| 错误信息 | 说明 |
|----------|------|
| 用户名已存在 | 新用户名已被使用 |
| 原密码错误 | 原密码验证失败 |
| 密码修改失败 | 密码修改出错 |
| 只允许上传图片文件 | 头像/背景图格式不正确 |

---

### 7. 更新个人简介

#### 接口信息
- **路径**: `/settings/intro`
- **方法**: `POST`
- **认证**: 需要
- **Content-Type**: `application/x-www-form-urlencoded`

#### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| introContent | string | 是 | 简介内容（支持 Markdown） |

#### 请求示例
```bash
curl -X POST http://localhost:5000/settings/intro \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -b cookies.txt \
  -d "introContent=# 个人简介%0A%0A这是我的个人简介内容。"
```

#### 响应
- **成功**: 返回设置页面，包含成功消息
- **失败**: 返回设置页面，包含错误信息

---

### 8. 获取用户个人页面

#### 接口信息
- **路径**: `/{userId}/intro`
- **方法**: `GET`
- **认证**: 需要登录

#### 路径参数
| 参数 | 类型 | 说明 |
|------|------|------|
| userId | string | 用户 UUID |

#### 请求示例
```bash
curl http://localhost:5000/abcd-1234-5678-9012/intro \
  -b cookies.txt
```

#### 响应
返回用户个人页面 HTML

---

## 头像和背景图相关 API

### 9. 获取用户头像

#### 接口信息
- **路径**: `/data/user/:userId/avatar.jpg`
- **方法**: `GET`
- **认证**: 不需要

#### 路径参数
| 参数 | 类型 | 说明 |
|------|------|------|
| userId | string | 用户 UUID |

#### 请求示例
```bash
curl http://localhost:5000/data/user/abcd-1234-5678-9012/avatar.jpg
```

#### 响应
- **成功**: 返回 JPEG 格式的头像图片
- **失败**: 返回默认头像图片

#### 头像规格建议
- **格式**: JPG, PNG
- **大小**: 不超过 2MB
- **推荐尺寸**: 200x200 像素
- **比例**: 1:1（正方形）

---

### 10. 获取用户背景图

#### 接口信息
- **路径**: `/data/user/:userId/intro/background.jpg`
- **方法**: `GET`
- **认证**: 不需要

#### 路径参数
| 参数 | 类型 | 说明 |
|------|------|------|
| userId | string | 用户 UUID |

#### 请求示例
```bash
curl http://localhost:5000/data/user/abcd-1234-5678-9012/intro/background.jpg
```

#### 响应
- **成功**: 返回 JPEG 格式的背景图图片
- **失败**: 返回默认背景图图片

#### 背景图规格建议
- **格式**: JPG, PNG
- **大小**: 不超过 2MB
- **推荐尺寸**: 1920x400 像素
- **比例**: 宽度：高度 = 4.8:1 到 3:1

---

## 管理员相关 API

### 11. 创建用户（管理员）

#### 接口信息
- **路径**: `/panel/users`
- **方法**: `POST`
- **认证**: 需要 admin 或 system 权限
- **Content-Type**: `application/x-www-form-urlencoded`

#### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 用户名 |
| password | string | 是 | 密码 |
| author | string | 否 | 权限等级 (user/admin/system)，默认 user |
| points | number | 否 | 初始积分，默认 0 |

#### 请求示例
```bash
curl -X POST http://localhost:5000/panel/users \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -b cookies.txt \
  -d "username=newuser&password=123456&author=user&points=0"
```

#### 响应
- **成功**: 重定向到 `/panel/users`
- **失败**: 返回错误页面

#### 错误码
| 错误信息 | 说明 |
|----------|------|
| 用户名和密码不能为空 | 用户名或密码为空 |
| 用户名已存在 | 用户名已被注册 |
| 只有系统管理员可以创建高级权限用户 | 权限不足 |

---

### 12. 更新用户信息（管理员）

#### 接口信息
- **路径**: `/panel/users/:id`
- **方法**: `POST`
- **认证**: 需要 admin 或 system 权限
- **Content-Type**: `application/json` 或 `application/x-www-form-urlencoded`

#### 路径参数
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 用户 UUID |

#### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 否 | 新用户名 |
| author | string | 否 | 新权限等级（仅 system 可修改） |
| points | number | 否 | 新积分 |
| avatar | string | 否 | 新头像路径 |

#### 请求示例
```bash
curl -X POST http://localhost:5000/panel/users/abcd-1234-5678-9012 \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name":"newname","points":200}'
```

#### 响应
```json
{
  "success": true,
  "message": "用户信息已更新"
}
```

#### 错误码
| 错误信息 | 说明 |
|----------|------|
| 用户不存在 | 目标用户不存在 |
| 权限不足，无法操作同级或更高级别的用户 | 权限不足 |
| 只有系统管理员可以修改用户权限 | 权限不足 |

---

### 13. 删除用户（管理员）

#### 接口信息
- **路径**: `/panel/users/:id`
- **方法**: `DELETE`
- **认证**: 需要 admin 或 system 权限

#### 路径参数
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 用户 UUID |

#### 请求示例
```bash
curl -X DELETE http://localhost:5000/panel/users/abcd-1234-5678-9012 \
  -b cookies.txt
```

#### 响应
```json
{
  "success": true
}
```

#### 错误码
| 错误信息 | 说明 |
|----------|------|
| 用户不存在 | 目标用户不存在 |
| 权限不足，无法操作同级或更高级别的用户 | 权限不足 |

---

## 系统公告相关 API

### 14. 获取系统公告

#### 接口信息
- **路径**: `/api/announcement`
- **方法**: `GET`
- **认证**: 不需要

#### 请求示例
```bash
curl http://localhost:5000/api/announcement
```

#### 响应示例
```json
{
  "announcement": "这是系统公告内容，支持**Markdown**格式。"
}
```

---

### 15. 更新系统公告

#### 接口信息
- **路径**: `/api/announcement`
- **方法**: `POST`
- **认证**: 需要 system 权限
- **Content-Type**: `application/json`

#### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| announcement | string | 是 | 公告内容（支持 Markdown） |

#### 请求示例
```bash
curl -X POST http://localhost:5000/api/announcement \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"announcement":"这是新的系统公告内容。"}'
```

#### 响应示例
```json
{
  "success": true,
  "message": "公告更新成功"
}
```

---

## 三方时间 API

### 16. 获取三方时间

#### 接口信息
- **路径**: `/api/time`
- **方法**: `GET`
- **认证**: 不需要

#### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| local | string | 否 | 用户本地时间（ISO 格式） |

#### 请求示例
```bash
# 基本请求
curl http://localhost:5000/api/time

# 附带本地时间
curl "http://localhost:5000/api/time?local=2026-02-19T08:00:00.000Z"
```

#### 响应示例
```json
{
  "ZCS_time": "2026-02-19T08:00:00.000Z",
  "windows_time": "2026-02-19T08:00:00.000Z",
  "local_time": "2026-02-19T08:00:00.000Z",
  "timestamp": 1708329600000
}
```

#### 字段说明
| 字段 | 类型 | 说明 |
|------|------|------|
| ZCS_time | string | 零核服务器时间（ISO 8601 格式） |
| windows_time | string | Windows 时间服务器时间（当前使用服务器时间替代） |
| local_time | string | 用户本地时间（由客户端提供） |
| timestamp | number | 请求开始被处理的时间戳（毫秒） |

---

## 模块系统 API

### 17. 获取模块收藏列表

#### 接口信息
- **路径**: `/api/module/favorites`
- **方法**: `GET`
- **认证**: 需要

#### 响应示例
```json
{
  "success": true,
  "favorites": ["example-module", "another-module"]
}
```

---

### 18. 收藏/取消收藏模块

#### 接口信息
- **路径**: `/api/module/favorite`
- **方法**: `POST`
- **认证**: 需要
- **Content-Type**: `application/json`

#### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| moduleId | string | 是 | 模块 ID |
| action | string | 是 | 操作类型（'add'或'remove'） |

#### 请求示例
```bash
curl -X POST http://localhost:5000/api/module/favorite \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"moduleId":"example-module","action":"add"}'
```

#### 响应示例
```json
{
  "success": true,
  "message": "收藏成功",
  "count": 5
}
```

---

### 19. 获取模块收藏数量

#### 接口信息
- **路径**: `/api/module/favorite-count/:moduleId`
- **方法**: `GET`
- **认证**: 不需要

#### 响应示例
```json
{
  "success": true,
  "count": 5
}
```

---

### 20. 获取模块评论列表

#### 接口信息
- **路径**: `/api/module/comments/:moduleId`
- **方法**: `GET`
- **认证**: 不需要

#### 响应示例
```json
{
  "success": true,
  "comments": [
    {
      "id": "1234567890",
      "userId": "user-uuid",
      "userName": "用户名",
      "content": "评论内容",
      "createdAt": "2026-02-19T10:00:00.000Z",
      "parentId": null,
      "replies": []
    }
  ]
}
```

---

### 21. 添加评论

#### 接口信息
- **路径**: `/api/module/comments`
- **方法**: `POST`
- **认证**: 需要
- **Content-Type**: `application/json`

#### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| moduleId | string | 是 | 模块 ID |
| content | string | 是 | 评论内容（最多 500 字） |
| parentId | string | 否 | 父评论 ID（回复时提供） |

#### 请求示例
```bash
# 发表评论
curl -X POST http://localhost:5000/api/module/comments \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"moduleId":"example-module","content":"这是评论内容"}'

# 回复评论
curl -X POST http://localhost:5000/api/module/comments \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"moduleId":"example-module","content":"这是回复内容","parentId":"1234567890"}'
```

#### 响应示例
```json
{
  "success": true,
  "message": "评论成功",
  "comment": {
    "id": "1234567890",
    "userId": "user-uuid",
    "userName": "用户名",
    "content": "评论内容",
    "createdAt": "2026-02-19T10:00:00.000Z",
    "parentId": null,
    "replies": []
  }
}
```

---

### 22. 删除评论

#### 接口信息
- **路径**: `/api/module/comments/:moduleId/:commentId`
- **方法**: `DELETE`
- **认证**: 需要

#### 响应示例
```json
{
  "success": true,
  "message": "删除成功"
}
```

---

## 加密密钥管理 API（仅 system）

### 23. 获取密钥信息

#### 接口信息
- **路径**: `/api/secrets-info`
- **方法**: `GET`
- **认证**: 需要 system 权限

#### 请求示例
```bash
curl http://localhost:5000/api/secrets-info \
  -b cookies.txt
```

#### 响应示例
```json
{
  "success": true,
  "mainSecret": "已设置",
  "deputySecret": "已设置",
  "systemSecret": "已设置",
  "needsRotation": false
}
```

---

### 24. 更新主密钥

#### 接口信息
- **路径**: `/api/update-main-secret`
- **方法**: `POST`
- **认证**: 需要 system 权限
- **Content-Type**: `application/json`

#### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| secret | string | 是 | 新主密钥（仅限字母和数字） |

#### 请求示例
```bash
curl -X POST http://localhost:5000/api/update-main-secret \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"secret":"newmainkey123"}'
```

#### 响应示例
```json
{
  "success": true,
  "message": "主密钥更新成功"
}
```

---

### 25. 更新副密钥

#### 接口信息
- **路径**: `/api/update-deputy-secret`
- **方法**: `POST`
- **认证**: 需要 system 权限
- **Content-Type**: `application/json`

#### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| secret | string | 否 | 新副密钥（256 位十六进制字符串，不填则自动生成） |

#### 请求示例
```bash
curl -X POST http://localhost:5000/api/update-deputy-secret \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{}'
```

#### 响应示例
```json
{
  "success": true,
  "message": "副密钥更新成功，用户数据已重新加密"
}
```

---

### 26. 更新系统密钥

#### 接口信息
- **路径**: `/api/update-system-secret`
- **方法**: `POST`
- **认证**: 需要 system 权限
- **Content-Type**: `application/json`

#### 请求参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| secret | string | 否 | 新系统密钥（256 位十六进制字符串，不填则自动生成） |

#### 请求示例
```bash
curl -X POST http://localhost:5000/api/update-system-secret \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{}'
```

#### 响应示例
```json
{
  "success": true,
  "message": "系统密钥更新成功，用户数据已重新加密"
}
```

---

## 错误处理

### 通用错误响应格式

```json
{
  "success": false,
  "message": "错误描述信息"
}
```

### HTTP 状态码说明

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 302 | 重定向 |
| 400 | 请求参数错误 |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

---

## 使用示例

### 完整的用户注册登录流程

```bash
# 1. 注册新用户
curl -X POST http://localhost:5000/register \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=testuser&password=123456&confirmPassword=123456"

# 2. 登录
curl -X POST http://localhost:5000/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=testuser&password=123456" \
  -c cookies.txt

# 3. 访问主页（需要登录）
curl http://localhost:5000 \
  -b cookies.txt

# 4. 上传头像
curl -X POST http://localhost:5000/settings \
  -b cookies.txt \
  -F "avatar=@avatar.jpg"

# 5. 获取头像
curl http://localhost:5000/data/user/$(USER_UUID)/avatar.jpg

# 6. 登出
curl -X POST http://localhost:5000/logout \
  -b cookies.txt
```

---

## 注意事项

1. **会话管理**: 登录后请妥善保存 Cookie，后续请求需要携带
2. **密码安全**: 密码使用 AES-256-CBC 多层加密存储
3. **文件上传**: 头像和背景图限制 2MB，仅支持图片格式
4. **权限控制**: 管理员不能操作同级或更高级别用户
5. **UUID 格式**: xxxx-xxxx-xxxx-xxxx（16 位十六进制，4 位一组）

---

## 更新日志

- **v1.1.0.2**: 新增模块系统 API（收藏、评论）
- **v1.1.0.1**: 新增三方时间 API
- **v1.1.0.0**: 新增加密密钥管理 API
- **v1.0.1.0**: 新增个人简介 API
- **v1.0.0.0**: 初始版本
