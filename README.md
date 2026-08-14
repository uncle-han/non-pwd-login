# NonPwdLogin

密码无钥匙登录系统。基于 **TOTP** (RFC 6238) 的身份认证方案。

- 注册：只需邮箱 → 生成 TOTP 密钥 → 二维码展示 → 用户用验证器 App 扫码
- 登录：用户填邮箱 + 6 位动态码 → 后端验证 → 签发 JWT
- 第三方应用可通过 OAuth2-like 流程接入

## 项目结构

```
.
├── server/          # Node.js + Express 后端
│   ├── API.md       # API 接口文档（人类阅读）
│   ├── openapi.yaml # OpenAPI 3.0 规范（AI / 工具链消费）
│   └── src/
├── client/          # React 前端（待实现）
├── miniapp/         # 微信小程序 TOTP 客户端（可选）
├── AGENTS.md        # AI 代理项目指引
├── noted.md         # 原始需求
└── README.md        # 本文件
```

## 技术栈

| 层 | 选型 |
|----|------|
| 前端 | React (SPA) |
| 后端 | Node.js + Express |
| TOTP | `otplib` (v12) |
| 数据库 | MySQL 8.0 (`mysql2` v3) |
| 认证 | JWT (`jsonwebtoken`) |
| 测试 | Jest + Supertest |

## 快速开始

### 本地运行

```bash
cd server
npm install
npm start          # 启动服务 → http://localhost:3000
```

### Docker 运行

```bash
# 构建镜像
cd server
docker build --build-arg NODE_VERSION=20-alpine --build-arg PORT=3000 -t non-pwd-login .

# 启动容器
docker run -d -p 3000:3000 \
  --name non-pwd-login \
  -e JWT_SECRET=your-secret-key \
  -e NODE_ENV=production \
  -e DB_PATH=/app/data/auth.db \
  non-pwd-login

# 或通过 docker compose
docker compose up -d
```

支持的自定义参数：

| 参数类型 | 参数名 | 默认值 | 说明 |
|---------|--------|--------|------|
| `--build-arg` | `NODE_VERSION` | `20-alpine` | Node.js 基础镜像版本 |
| `--build-arg` | `PORT` | `3000` | 容器内监听端口 |
| `-e` | `PORT` | `3000` | 运行时监听端口 |
| `-e` | `NODE_ENV` | `production` | 运行环境 |
| `-e` | `JWT_SECRET` | `dev-secret-key` | JWT 签名密钥（生产环境必改） |
| `-e` | `JWT_EXPIRES_IN` | `7d` | JWT 过期时间 |
| `-e` | `DB_PATH` | `/app/data/auth.db` | 数据库文件路径 |
| `-e` | `CORS_ORIGIN` | `*` | CORS 允许的跨域来源 |

## 开发

```bash
cd server
npm test           # 监听模式运行测试
npm run test:ci    # 单次运行测试
npm run dev        # nodemon 热重载
```

## API

两个核心端点：

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/auth/register` | 注册（邮箱 → TOTP 二维码 URL + 确认 URL） |
| GET | `/api/auth/confirm/:token` | 确认注册（返回 TOTP 密钥） |
| POST | `/api/auth/login` | 登录（邮箱 + 6 位动态码 → JWT） |

详见 `server/API.md` 或 `server/openapi.yaml`。

## 流程

1. 用户注册 → 获得 TOTP 二维码和确认 URL
2. 用户扫码 TOTP 二维码（身份验证器 App）→ 绑定密钥
3. 用户扫码确认二维码（相机）或打开确认 URL → 确认注册 → 返回 TOTP 密钥
4. 客户端本地保存密钥，用于生成动态登录码
5. 用户输入邮箱 + 6 位动态码 → 登录

## TOTP 配置

| 参数 | 值 |
|------|-----|
| 算法 | SHA-1 |
| 验证码长度 | 6 位 |
| 时间窗口 | 30 秒 |
| 允许漂移 | ±1 窗口 (±30 秒) |
| 密钥长度 | 20 字节 (160 bit) |
| 密钥编码 | Base32 |

## 开发阶段

| 阶段 | 状态 |
|------|------|
| 1 — TOTP 单元测试 | ✅ |
| 2 — 注册/登录 API | ✅ |
| 3 — 数据库集成 | ✅ |
| 4 — JWT 中间件 + 受保护路由 | ⏳ |
| 5 — 第三方 OAuth 接入 | ⏳ |
| 6 — React 前端 | ⏳ |
