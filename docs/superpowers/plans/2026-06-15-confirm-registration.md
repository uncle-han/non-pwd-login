# Confirm Registration API 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增确认注册 API，注册时不返回 TOTP secret，确认后才返回。

**Architecture:** 
- 注册创建用户时生成 `confirm_token`（UUID），用户默认 `confirmed=0`
- 新端点 `GET /api/auth/confirm/:token` 确认注册，返回 TOTP secret
- 登录时检查 `confirmed=1`，未确认禁止登录
- confirm URL 可由前端生成二维码，扫描后浏览器打开自动确认

**Tech Stack:** Express 4, mysql2, uuid, otplib, jsonwebtoken, Jest + Supertest

---

### Task 1: 数据库变更

**Files:**
- Modify: `server/src/database/schema.mysql.sql`
- Create: `server/src/database/migrations/002_add_confirm_fields.sql`

- [ ] **Step 1: 修改 schema.mysql.sql**

在 `users` 表 `totp_secret` 后新增两列：

```sql
  confirm_token VARCHAR(64),
  confirmed     TINYINT NOT NULL DEFAULT 0,
```

编辑后完整 users 表：

```sql
CREATE TABLE IF NOT EXISTS users (
  id          CHAR(36) PRIMARY KEY,
  email       VARCHAR(255) NOT NULL UNIQUE,
  totp_secret TEXT NOT NULL,
  confirm_token VARCHAR(64),
  confirmed   TINYINT NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

- [ ] **Step 2: 创建迁移文件**

新建 `server/src/database/migrations/002_add_confirm_fields.sql`：

```sql
ALTER TABLE users ADD COLUMN confirm_token VARCHAR(64) AFTER totp_secret;
ALTER TABLE users ADD COLUMN confirmed TINYINT NOT NULL DEFAULT 0 AFTER confirm_token;
```

---

### Task 2: db.js 新增函数

**Files:**
- Modify: `server/src/db.js`

- [ ] **Step 1: 重写 db.js**

新增 `findUserByConfirmToken`、`confirmUser`函数，修改 `createUser` 接受 `confirmToken` 参数，提取公共 `mapUserRow` 函数：

```js
import { v4 as uuid } from 'uuid';
import { getDriver } from './database/index.js';

function mapUserRow(row) {
  return {
    id: row.id,
    email: row.email,
    totpSecret: row.totp_secret,
    confirmToken: row.confirm_token,
    confirmed: !!row.confirmed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createUser(email, totpSecret, confirmToken) {
  const id = uuid();
  const driver = getDriver();
  await driver.run(
    'INSERT INTO users (id, email, totp_secret, confirm_token, confirmed) VALUES (?, ?, ?, ?, 0)',
    [id, email, totpSecret, confirmToken]
  );
  return { id, email, totpSecret, confirmToken };
}

export async function findUserByEmail(email) {
  const driver = getDriver();
  const row = await driver.get('SELECT * FROM users WHERE email = ?', [email]);
  if (!row) return undefined;
  return mapUserRow(row);
}

export async function findUserByConfirmToken(token) {
  const driver = getDriver();
  const row = await driver.get('SELECT * FROM users WHERE confirm_token = ?', [token]);
  if (!row) return undefined;
  return mapUserRow(row);
}

export async function confirmUser(id) {
  const driver = getDriver();
  await driver.run(
    'UPDATE users SET confirmed = 1, confirm_token = NULL WHERE id = ?',
    [id]
  );
}

export async function clear() {
  const driver = getDriver();
  await driver.exec('DELETE FROM users');
}
```

---

### Task 3: Mock Driver 支持 UPDATE

**Files:**
- Modify: `server/src/__tests__/helpers/mock-driver.js`

- [ ] **Step 1: 在 `run` 方法中增加 UPDATE 解析**

在 `run` 方法的 `parseValues` 判断后、`return {}` 之前，增加 UPDATE 处理：

```js
    const updateMatch = sql.match(
      /UPDATE\s+`?(\w+)`?\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/i
    );
    if (updateMatch) {
      const [, table, setClause, whereClause] = updateMatch;
      const t = tables[table];
      if (!t) return {};
      const setParts = setClause.split(',').map(s => s.trim());
      let paramIdx = 0;
      const updates = {};
      for (const part of setParts) {
        const setMatch = part.match(/`?(\w+)`?\s*=\s*(\?|NULL|'[^']*')/);
        if (!setMatch) continue;
        const [, col, val] = setMatch;
        updates[col] = val === '?' ? params[paramIdx++] : (val === 'NULL' ? null : val.replace(/^['"]|['"]$/g, ''));
      }
      for (let i = 0; i < t.rows.length; i++) {
        if (matchRow(t.rows[i], whereClause, params)) {
          Object.assign(t.rows[i], updates);
        }
      }
      return {};
    }
```

---

### Task 4: auth.js 路由修改

**Files:**
- Modify: `server/src/routes/auth.js`

- [ ] **Step 1: 重写路由文件**

修改 register（不再返回 secret，新增 confirmUrl）、新增 confirm 路由、修改 login（检查 confirmed）：

```js
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { loadConfig } from '../config.js';
import { generateSecret } from '../services/totp.js';
import { verifyCode } from '../services/totp.js';
import { createUser, findUserByEmail, findUserByConfirmToken, confirmUser } from '../db.js';
import { validateRegisterFields, validateLoginFields } from '../middleware/validate.js';

const router = Router();
const config = loadConfig();
const APP_NAME = 'NonPwdLogin';

router.post('/register', validateRegisterFields, async (req, res) => {
  const { email } = req.body;

  const exists = await findUserByEmail(email);
  if (exists) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const secret = generateSecret();
  const confirmToken = uuid();
  await createUser(email, secret, confirmToken);

  const qrUrl = `otpauth://totp/${APP_NAME}:${email}?secret=${secret}&issuer=${APP_NAME}`;
  const confirmUrl = `${req.protocol}://${req.get('host')}/api/auth/confirm/${confirmToken}`;

  res.status(201).json({ qrUrl, confirmUrl, email });
});

router.get('/confirm/:token', async (req, res) => {
  const { token } = req.params;

  const user = await findUserByConfirmToken(token);
  if (!user) {
    return res.status(404).json({ error: 'Invalid confirm token' });
  }

  if (!user.confirmed) {
    await confirmUser(user.id);
  }

  res.json({ secret: user.totpSecret, email: user.email });
});

router.post('/login', validateLoginFields, async (req, res) => {
  const { email, code } = req.body;

  const user = await findUserByEmail(email);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (!user.confirmed) {
    return res.status(403).json({ error: 'Registration not confirmed' });
  }

  if (!verifyCode(user.totpSecret, code)) {
    return res.status(401).json({ error: 'Invalid TOTP code' });
  }

  const token = jwt.sign(
    { sub: user.id, email: user.email },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

  res.json({ token, email: user.email });
});

export default router;
```

---

### Task 5: 更新测试用例

**Files:**
- Modify: `server/src/__tests__/auth.integration.test.js`

- [ ] **Step 1: 重写测试文件**

```js
import request from 'supertest';
import { app } from '../app.js';
import { clear } from '../db.js';
import { generateCode } from '../services/totp.js';
import { initDb, closeDb } from '../database/index.js';
import { createMockDriver } from './helpers/mock-driver.js';

const EMAIL = 'test@example.com';
const EMAIL2 = 'test2@example.com';

beforeAll(async () => {
  await initDb(null, createMockDriver());
});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await clear();
});

describe('POST /api/auth/register', () => {

  it('registers a new user and returns qrUrl, confirmUrl, email (no secret)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: EMAIL });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('qrUrl');
    expect(res.body).toHaveProperty('confirmUrl');
    expect(res.body.email).toBe(EMAIL);
    expect(res.body.qrUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(res.body.confirmUrl).toMatch(/\/api\/auth\/confirm\//);
    expect(res.body).not.toHaveProperty('secret');
  });

  it('rejects invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it('rejects duplicate email registration', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: EMAIL });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: EMAIL });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/i);
  });

});

describe('GET /api/auth/confirm/:token', () => {

  it('confirms registration with a valid token', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: EMAIL });

    const token = reg.body.confirmUrl.split('/').pop();

    const res = await request(app)
      .get(`/api/auth/confirm/${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('secret');
    expect(res.body.email).toBe(EMAIL);
  });

  it('returns 404 with an invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/confirm/nonexistent-token');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/invalid confirm token/i);
  });

  it('returns 404 when no registration was made', async () => {
    const res = await request(app)
      .get('/api/auth/confirm/some-random-token');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/invalid confirm token/i);
  });

  it('is idempotent - confirming twice returns same secret', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: EMAIL });

    const token = reg.body.confirmUrl.split('/').pop();

    const res1 = await request(app).get(`/api/auth/confirm/${token}`);
    const res2 = await request(app).get(`/api/auth/confirm/${token}`);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res2.body.secret).toBe(res1.body.secret);
    expect(res2.body.email).toBe(res1.body.email);
  });

  it('returns the correct TOTP secret matching qrUrl', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: EMAIL });

    const token = reg.body.confirmUrl.split('/').pop();

    const confirmRes = await request(app)
      .get(`/api/auth/confirm/${token}`);

    const secretFromQr = reg.body.qrUrl.match(/secret=([^&]+)/)[1];
    expect(confirmRes.body.secret).toBe(secretFromQr);
  });

});

describe('POST /api/auth/login', () => {

  it('rejects login for unconfirmed account', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: EMAIL });

    const code = generateCode('dummy-secret');

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: EMAIL, code });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not confirmed/i);
  });

  it('logs in successfully after confirming registration', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: EMAIL });

    const token = reg.body.confirmUrl.split('/').pop();
    const confirmRes = await request(app).get(`/api/auth/confirm/${token}`);
    const code = generateCode(confirmRes.body.secret);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: EMAIL, code });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.email).toBe(EMAIL);
  });

  it('rejects login with an invalid TOTP code', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: EMAIL });

    const token = reg.body.confirmUrl.split('/').pop();
    await request(app).get(`/api/auth/confirm/${token}`);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: EMAIL, code: '000000' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('rejects login for an unregistered email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'unknown@example.com', code: '123456' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('rejects login with missing fields', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({});

    expect(res.status).toBe(400);
  });

});
```

---

### Task 6: 运行测试验证

**Files:**
- Run: 测试

- [ ] **Step 1: 运行测试**

```bash
cd server
npm test
```

预期：所有测试通过（约 14 个测试用例）。

- [ ] **Step 2: 运行 CI 模式验证**

```bash
cd server
npm run test:ci
```
