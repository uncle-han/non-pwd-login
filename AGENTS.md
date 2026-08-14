# NonPwdLogin — 项目认知文档

> 每次新 session 先读这个文件。它描述了项目的全貌、目录结构、技术栈和关键约定。

## 一句话

基于 **TOTP (RFC 6238)** 的无密码登录系统。用户注册后通过身份验证器 App 生成 6 位动态码来登录，无需密码。

## 完整流程

```
注册 → 生成 TOTP Secret + confirm_token(UUID) → 用户 confirmed=0
  → 返回 qrUrl(TOTP 二维码 URL) + confirmUrl(确认链接)
  → 用户扫码 TOTP 二维码（身份验证器） 或 打开 confirmUrl
  → GET /api/auth/confirm/:token → 返回 secret（标记 confirmed=1）
  → 客户端保存 secret，本地生成 TOTP 动态码
  → POST /api/auth/login { email, code } → JWT
```

## 目录结构

```
non-pwd-login/
├── AGENTS.md              ← 本文件。项目认知文档，新 session 先读
├── README.md              ← 人类阅读的 README（可能过时）
├── noted.md               ← 原始需求（DO NOT READ，AGENTS.md 已禁止）
├── docs/
│   └── superpowers/
│       ├── specs/         ← 功能设计文档
│       └── plans/         ← 实施计划
└── server/                ← Node.js 后端（唯一活跃代码目录）
    ├── package.json       ← ES Module ("type": "module")
    ├── API.md             ← API 文档（人类阅读）
    ├── openapi.yaml       ← OpenAPI 3.0 规范
    ├── docker-compose.yml
    ├── src/
    │   ├── app.js         ← Express 入口。挂载路由、404/500 处理、DB 初始化
    │   ├── config.js      ← 多环境配置加载器（dev/test/uat/prod）
    │   ├── db.js          ← 数据访问层（createUser, findUserByEmail, findUserByConfirmToken, confirmUser, clear）
    │   ├── routes/
    │   │   ├── auth.js    ← POST /register, GET /confirm/:token, POST /login
    │   │   └── health.js  ← GET /api/health
    │   ├── middleware/
    │   │   └── validate.js ← 请求字段校验（邮箱格式、6 位验证码）
    │   ├── services/
    │   │   └── totp.js    ← TOTP 工具（generateSecret, generateCode, verifyCode）
    │   ├── database/
    │   │   ├── index.js   ← DB 初始化/驱动管理（initDb, getDriver, closeDb）
    │   │   ├── migrator.js ← 文件式 SQL 迁移运行器
    │   │   ├── syncer.js  ← 表结构同步（增删列）
    │   │   ├── schema.mysql.sql ← 完整建表 DDL
    │   │   ├── drivers/
    │   │   │   └── mysql.js ← MySQL 驱动实现
    │   │   └── migrations/
    │   │       ├── 001_initial.sql
    │   │       └── 002_add_confirm_fields.sql
    │   └── __tests__/
    │       ├── helpers/
    │       │   └── mock-driver.js ← 内存 mock DB（支持 CREATE/INSERT/SELECT/UPDATE/DELETE）
    │       ├── auth.integration.test.js ← 认证集成测试（13 个用例）
    │       ├── config.test.js
    │       ├── setup.test.js
    │       ├── totp.test.js
    │       └── database/
    │           ├── schema.test.js
    │           └── migration.test.js
    ├── .env.dev
    ├── .env.uat
    └── .env.prod
```

## 技术栈

| 层 | 选型 |
|----|------|
| 运行时 | Node.js 20+ (ES Modules) |
| 框架 | Express 4 |
| TOTP | otplib v12 |
| JWT | jsonwebtoken v9 |
| 数据库 | MySQL 8.0（mysql2 v3） |
| 测试 | Jest 29 + Supertest 6 |
| 开发 | Nodemon 3 |

## 关键架构模式

### 1. 数据库抽象层
- `db.js` 不直接依赖 MySQL，通过 `getDriver()` 获取驱动
- 驱动接口：`connect`/`close`/`exec`/`get`/`all`/`run`/`getTableNames`/`getColumns`/`addColumn`/`dropColumn`
- 测试使用 `mock-driver.js`（内存实现），不依赖真实 MySQL
- `mapUserRow` 将 DB 的 snake_case 列名映射为 camelCase 属性名
- 注意：`confirmed` 列在 mock driver 中以字符串 `'0'` / `'1'` 存储，`mapUserRow` 用 `Number(row.confirmed) === 1` 处理

### 2. 测试策略
- 所有集成测试使用 `createMockDriver()` 替代真实 MySQL
- `initDb(null, createMockDriver())` 跳过 `connect`/`runSchema`/`runMigrations`
- 测试在 `beforeAll` 初始化 mock DB，`beforeEach` 清空数据
- 验证真实 TOTP 行为：`generateCode(secret)` 生成当前窗口的合法验证码

### 3. 多环境配置
- 配置优先级：硬编码默认值 < `.env.{env}` 文件 < 系统环境变量
- 环境名称：`development` / `test` / `uat` / `production`
- `loadConfig()` 返回不可变（deepFreeze）配置对象

### 4. 确认注册（最新功能）
- 注册时用户 `confirmed=0`，返回 `confirmUrl`（不含 TOTP secret）
- `confirmUrl` 由前端渲染为二维码，扫码后浏览器打开自动确认
- 确认后返回 TOTP secret，客户端本地保存用于生成动态码
- 未确认账号登录返回 403
- confirm_token 确认后保留（不 NULL），实现幂等性

## 数据库表

### users
| 列 | 类型 | 说明 |
|----|------|------|
| id | CHAR(36) PK | UUID v4 |
| email | VARCHAR(255) UNIQUE NOT NULL | 小写邮箱 |
| totp_secret | TEXT NOT NULL | TOTP 密钥 |
| confirm_token | VARCHAR(64) | UUID 确认令牌（可空） |
| confirmed | TINYINT NOT NULL DEFAULT 0 | 是否已确认 |

另有 `login_attempts`（审计）和 `totp_resets`（TOTP 重置历史）表。

## 运行命令

```bash
cd server
npm install
npm run dev          # nodemon 开发
npm test             # Jest 监听模式
npm run test:ci      # Jest 单次运行
npm start            # 生产启动
```

## 不要读取的文件
- noted.md（原始需求，无关）