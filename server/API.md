# NonPwdLogin API

密码无钥匙登录系统 — 基于 TOTP (RFC 6238) 的身份认证 API。

- **Base URL**: `http://localhost:3000`
- **Auth**: JWT Bearer token（登录后获取，后续受保护路由使用）
- **Content-Type**: `application/json`
- **API 版本**: `/api/v1/`

---

## POST /api/v1/auth/register

注册新用户，获取 TOTP 密钥和二维码 URL。

### Request

```json
{
  "email": "user@example.com"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 用户邮箱，自动小写化 + trim |

### Response — 201 Created

```json
{
  "qrUrl": "otpauth://totp/NonPwdLogin:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=NonPwdLogin",
  "secret": "JBSWY3DPEHPK3PXP",
  "email": "user@example.com"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| qrUrl | string | `otpauth://` 标准 TOTP URL，验证器扫码用 |
| secret | string | Base32 密钥，客户端本地存储用 |
| email | string | 注册邮箱 |

### Errors

| HTTP | error | 说明 |
|------|-------|------|
| 400 | `Invalid email format` | 邮箱格式不合法 |
| 409 | `Email already registered` | 邮箱已被注册 |

---

## POST /api/v1/auth/login

用邮箱 + TOTP 动态码登录，获取 JWT token。

### Request

```json
{
  "email": "user@example.com",
  "code": "482916"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 已注册邮箱 |
| code | string | 是 | 客户端 TOTP 验证器生成的 6 位数字码 |

### Response — 200 OK

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "email": "user@example.com"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| token | string | JWT Bearer token，有效期 7 天 |

JWT payload:
```
{
  "sub":  "uuid-of-user",
  "email": "user@example.com",
  "iat":  1717000000,
  "exp":  1717604800
}
```

### Errors

| HTTP | error | 说明 |
|------|-------|------|
| 400 | `Invalid email format` | 邮箱格式不合法 |
| 400 | `Code must be a 6-digit number` | 验证码不是 6 位数字 |
| 404 | `User not found` | 邮箱未注册 |
| 401 | `Invalid TOTP code` | TOTP 验证失败（码错误或过期） |

---

## 完整错误码对照

| HTTP | 场景 | 客户端建议行为 |
|------|------|--------------|
| 400 | 请求参数格式错误 | 检查 email/code 格式后重试 |
| 401 | TOTP 验证失败 | 提示用户刷新验证码后重试 |
| 404 | 邮箱未注册 | 引导用户先注册 |
| 409 | 邮箱已被注册 | 提示用户直接登录 |

## TOTP 配置

| 参数 | 值 |
|------|----|
| 算法 | SHA-1 |
| 验证码长度 | 6 位 |
| 时间窗口 | 30 秒 |
| 允许漂移 | ±1 个窗口（±30 秒） |
| 密钥长度 | 20 字节（160 bit） |
| 密钥编码 | Base32 |
| 二维码格式 | `otpauth://totp/{issuer}:{email}?secret={secret}&issuer={issuer}` |
