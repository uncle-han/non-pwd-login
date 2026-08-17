# NonPwdLogin API Reference

Base URL: `http://localhost:3000`

**API 版本**: `/api/v1/`

**TOTP** — **T**ime-**o**ne-**T**ime-**P**assword（基于时间的一次性密码），是一种基于时间同步的动态验证码算法（RFC 6238）。用户通过身份验证器 App（如 Google Authenticator）扫描二维码后，App 会每 30 秒生成一个 6 位数字验证码，用于登录时的身份验证。

---

## POST /api/v1/auth/register

注册新用户，生成 TOTP 密钥并返回扫码二维码和确认链接。

### Headers

```
Content-Type: application/json
Accept: application/json
```

**重要**：请求体必须是 JSON 格式，且 `Content-Type` 必须设置为 `application/json`。

### Request Body

```json
{
  "email": "user@example.com"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 用户邮箱地址，用于接收确认信息和作为 TOTP 标识符 |

**邮箱格式要求**：
- 必须包含 `@` 符号
- `@` 后必须有域名和 `.`（如 `@gmail.com`）
- 不能包含空格
- 示例：`user@example.com`、`test.name@domain.co.jp`
- 错误示例：`user`、`user@`、`user@example`、`user.example.com`

### cURL 示例

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'
```

```json
{
  "qrUrl": "otpauth://totp/NonPwdLogin:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=NonPwdLogin",
  "confirmUrl": "http://localhost:3000/api/v1/auth/confirm/uuid-token",
  "secret": "JBSWY3DPEHPK3PXP",
  "email": "user@example.com"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| qrUrl | string | TOTP 协议的 URI，用于身份验证器 App（如 Google Authenticator）扫描添加账户 |
| confirmUrl | string | 完整 URL，用户在浏览器中打开即可完成注册确认 |
| secret | string | Base32 编码的 TOTP 密钥，客户端需保存用于本地生成动态验证码 |
| email | string | 注册时使用的邮箱（已转换为小写） |

### Errors

| HTTP | error | 触发条件 |
|------|-------|---------|
| 400 | `Invalid email format` | email 字段缺失、非字符串类型、或不符合邮箱格式（如缺少 @、域名等） |
| 409 | `Email already registered` | 该邮箱已在系统中注册过，不能重复注册 |

---

## GET /api/v1/auth/confirm/:token

确认用户注册，激活账号并返回 TOTP 密钥。

### Headers

```
Accept: application/json
```

### Path Parameters

| 参数 | 类型 | 说明 |
|------|------|------|
| token | string | 注册时返回的 confirmUrl 中包含的 UUID 令牌，用于验证用户身份 |

### cURL 示例

```bash
curl http://localhost:3000/api/v1/auth/confirm/550e8400-e29b-41d4-a716-446655440000
```

| 字段 | 类型 | 说明 |
|------|------|------|
| secret | string | TOTP 密钥，客户端需保存此密钥用于生成 6 位动态验证码 |
| email | string | 确认的用户邮箱 |

### Errors

| HTTP | error | 触发条件 |
|------|-------|---------|
| 404 | `Invalid confirm token` | token 参数无效、已过期或对应的用户不存在 |

---

## POST /api/v1/auth/login

使用邮箱和 TOTP 动态码进行身份验证，获取 JWT 访问令牌。

### Headers

```
Content-Type: application/json
Accept: application/json
```

**重要**：请求体必须是 JSON 格式，且 `Content-Type` 必须设置为 `application/json`。

### Request Body

```json
{
  "email": "user@example.com",
  "code": "482916"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 已注册且已确认的邮箱地址 |
| code | string | 是 | 由身份验证器 App 生成的 6 位数字验证码，每 30 秒更新一次 |

### cURL 示例

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "code": "482916"}'
```

| 字段 | 类型 | 说明 |
|------|------|------|
| token | string | JWT 访问令牌，用于后续请求的身份验证，有效期 7 天 |
| email | string | 登录成功的用户邮箱 |

### JWT Payload

```json
{
  "sub": "uuid-of-user",
  "email": "user@example.com",
  "iat": 1717000000,
  "exp": 1717604800
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| sub | string | 用户唯一标识符（UUID） |
| email | string | 用户邮箱 |
| iat | number | 签发时间戳（Unix 时间） |
| exp | number | 过期时间戳（Unix 时间），签发后 7 天 |

### Errors

| HTTP | error | 触发条件 |
|------|-------|---------|
| 400 | `Invalid email format` | email 字段缺失、非字符串类型、或不符合邮箱格式 |
| 400 | `Code must be a 6-digit number` | code 字段缺失、非字符串类型、或不是恰好 6 位纯数字 |
| 403 | `Registration not confirmed` | 用户已注册但未完成确认流程，账号处于未激活状态 |
| 404 | `User not found` | 该邮箱未在系统中注册 |
| 401 | `Invalid TOTP code` | TOTP 验证失败：验证码错误、已过期（超出 ±30 秒窗口）、或密钥不匹配 |

---

## GET /healthcheck

检查服务运行状态和数据库连接状态。

### Headers

```
Accept: application/json
```

### cURL 示例

```bash
curl http://localhost:3000/healthcheck
```

| 字段 | 类型 | 说明 |
|------|------|------|
| status | string | 服务运行状态，固定为 `ok` |
| uptime | number | 服务自启动以来的运行时间，单位为秒 |
| db | string | 数据库连接状态：`connected` 表示已连接，`disconnected` 表示未连接 |

### Errors

该接口始终返回 200，无错误情况。

---

## 错误码对照表

| HTTP | 常量名 | 错误信息 | 触发场景 | 客户端建议行为 |
|------|--------|---------|---------|--------------|
| 400 | INVALID_EMAIL | Invalid email format | 邮箱格式不合法 | 检查邮箱格式是否正确 |
| 400 | INVALID_CODE | Code must be a 6-digit number | 验证码格式错误 | 确保输入 6 位纯数字验证码 |
| 401 | INVALID_TOTP | Invalid TOTP code | TOTP 验证失败 | 刷新验证码后重试 |
| 403 | NOT_CONFIRMED | Registration not confirmed | 账号未确认 | 引导用户完成注册确认流程 |
| 404 | USER_NOT_FOUND | User not found | 邮箱未注册 | 引导用户先注册账号 |
| 404 | INVALID_CONFIRM_TOKEN | Invalid confirm token | 确认链接无效或已过期 | 重新发起注册获取新确认链接 |
| 409 | EMAIL_EXISTS | Email already registered | 邮箱重复注册 | 提示用户直接登录 |
| 500 | INTERNAL | Internal server error | 服务器内部错误 | 记录日志并稍后重试 |

---

## TOTP 配置

| 参数 | 值 | 说明 |
|------|----|----|
| 算法 | SHA-1 | 哈希算法 |
| 验证码长度 | 6 位 | 数字验证码位数 |
| 时间窗口 | 30 秒 | 每个验证码的有效期 |
| 允许漂移 | ±1 个窗口 | 可接受前后 30 秒内的验证码 |
| 密钥长度 | 20 字节（160 bit） | Base32 编码后的密钥长度 |
| 密钥编码 | Base32 | 可安全存储和传输的编码格式 |
