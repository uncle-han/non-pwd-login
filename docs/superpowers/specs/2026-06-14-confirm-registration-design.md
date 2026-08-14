# 确认注册 API 设计

## 概述

在基于 TOTP 的无密码认证系统中增加"确认注册"步骤。TOTP 密钥仅在用户确认注册后才返回，确保用户已设置好身份验证器应用，避免密钥过早暴露给浏览器客户端。

## 流程

```
注册 → { qrUrl, confirmUrl, email }     （不含 secret）
    ↓
用户扫码 TOTP 二维码（身份验证器）或扫码确认二维码（浏览器）
    ↓
GET /api/auth/confirm/:token  →  { secret, email }
    ↓
客户端本地保存 secret，在浏览器中生成 TOTP 验证码
    ↓
POST /api/auth/login  →  JWT
```

## 数据库变更

### users 表（schema.mysql.sql）

新增两列：

| 列名 | 类型 | 说明 |
|------|------|------|
| `confirm_token` | `VARCHAR(64)` | UUID 确认令牌（可空，确认后保留用于幂等性） |
| `confirmed` | `TINYINT NOT NULL DEFAULT 0` | 是否已确认（0=未确认，1=已确认） |

### 迁移脚本

`server/src/database/migrations/002_add_confirm_fields.sql`：

```sql
ALTER TABLE users ADD COLUMN confirm_token VARCHAR(64) AFTER totp_secret;
ALTER TABLE users ADD COLUMN confirmed TINYINT NOT NULL DEFAULT 0 AFTER confirm_token;
```

## API 端点

### POST /api/auth/register（修改）

**请求：** `{ "email": "user@example.com" }`

**变更点：**
- 创建用户时生成 `confirm_token`（UUID v4）
- 响应中**不再返回** `secret`
- 新增返回 `confirmUrl` 供确认使用

**响应（201）：**
```json
{
  "qrUrl": "otpauth://totp/NonPwdLogin:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=NonPwdLogin",
  "confirmUrl": "http://localhost:3000/api/auth/confirm/550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com"
}
```

**错误响应：** 不变（400 邮箱格式错误，409 重复注册）

### GET /api/auth/confirm/:token（新增）

**行为：**
1. 根据 `confirm_token` 查找用户
2. 未找到 → `404 { "error": "Invalid confirm token" }`
3. 已确认（`confirmed=1`）→ 跳过更新，仍然返回 `{ secret, email }`（幂等）
4. 标记用户为已确认（`confirmed=1`）
5. 返回 TOTP 密钥

**响应（200）：**
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "email": "user@example.com"
}
```

### POST /api/auth/login（修改）

增加确认检查：
- 用户存在但 `confirmed = 0` → `403 { "error": "Registration not confirmed" }`

## 二维码

`confirmUrl` 是一个普通 HTTP URL。前端将此 URL 渲染为二维码。用户用手机相机扫描二维码后，浏览器打开该 URL，调用确认接口并返回 `secret`。

## 错误处理

| 场景 | 状态码 | 错误消息 |
|------|--------|----------|
| 无效的确认令牌 | 404 | Invalid confirm token |
| 未确认账号登录 | 403 | Registration not confirmed |

## 测试

### GET /api/auth/confirm/:token

| # | 场景 | 预期 |
|---|------|------|
| 1 | 有效 token 确认成功 | 200，返回 `{ secret, email }` |
| 2 | 无效 token（随机 UUID） | 404 `{ error: "Invalid confirm token" }` |
| 3 | 未注册直接调用 confirm | 404（无用户，token 不匹配） |
| 4 | 重复确认（幂等性） | 第一次 200，第二次仍 200 返回相同 secret |
| 5 | 确认后返回正确的 TOTP secret | secret 与注册时生成的 qrUrl 中的 secret 一致 |
| 6 | 已确认用户再次调用相同 token | token 已被清空，返回 404（幂等但不重复使用 token） |
| 7 | token 为纯数字/特殊字符 | 按字符串处理，不匹配则 404 |

### POST /api/auth/register

| # | 场景 | 预期 |
|---|------|------|
| 8 | 注册响应不含 secret | body 不应包含 `secret` 字段 |
| 9 | 注册响应含 confirmUrl | body.confirmUrl 格式正确，包含 `/api/auth/confirm/` |
| 10 | 注册后 DB 中用户 confirmed = 0 | 验证数据库状态 |

### POST /api/auth/login

| # | 场景 | 预期 |
|---|------|------|
| 11 | 未确认账号登录 | 403 `{ error: "Registration not confirmed" }` |
| 12 | 确认后正常登录 | 200，返回 JWT token |
