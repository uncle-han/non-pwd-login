import request from 'supertest';
import { app } from '../app.js';
import { clear } from '../db.js';
import { generateCode } from '../services/totp.js';
import { initDb, closeDb } from '../database/index.js';
import { createMockDriver } from './helpers/mock-driver.js';
import { ERR, HTTP, BASE32_REGEX, JWT_REGEX, OTPAUTH_URL_REGEX, CONFIRM_URL_REGEX, SUPPORTED_VERSIONS } from '../data/constant.js';

const EMAIL = 'test@example.com';
const GW_PREFIX = '__test__';
const gw = (path) => `/${GW_PREFIX}/v1/auth${path}`;

beforeAll(async () => {
  await initDb(null, createMockDriver());
});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await clear();
});

describe('Gateway routing: /<prefix>/<version>/auth/*', () => {

  it('rejects unsupported API version', async () => {
    const res = await request(app)
      .post('/any-prefix/v99/auth/register')
      .send({ email: EMAIL });
    expect(res.status).toBe(HTTP.BAD_REQUEST);
    expect(res.body.error).toMatch(/unsupported.*version/i);
  });

  it.each([
    { prefix: 'ABC-non-pwd-login-uat', desc: 'long prefix' },
    { prefix: 'dev-env', desc: 'medium prefix' },
    { prefix: 'a', desc: 'short prefix' },
  ])('handles registration with $desc', async ({ prefix }) => {
    const res = await request(app)
      .post(`/${prefix}/v1/auth/register`)
      .send({ email: EMAIL });
    expect(res.status).toBe(HTTP.CREATED);
    expect(res.body).toHaveProperty('qrUrl');
    expect(res.body).toHaveProperty('confirmUrl');
    expect(res.body.confirmUrl).toContain(`/${prefix}/v1/auth/confirm/`);
  });

  it('completes full auth flow via gateway URL', async () => {
    const prefix = 'my-gateway';

    const reg = await request(app)
      .post(`/${prefix}/v1/auth/register`)
      .send({ email: 'gw-full@test.com' });
    expect(reg.status).toBe(HTTP.CREATED);

    const token = reg.body.confirmUrl.split('/').pop();
    const confirmRes = await request(app)
      .get(`/${prefix}/v1/auth/confirm/${token}`);
    expect(confirmRes.status).toBe(HTTP.OK);
    expect(confirmRes.body).toHaveProperty('secret');

    const code = generateCode(confirmRes.body.secret);
    const loginRes = await request(app)
      .post(`/${prefix}/v1/auth/login`)
      .send({ email: 'gw-full@test.com', code });
    expect(loginRes.status).toBe(HTTP.OK);
    expect(loginRes.body).toHaveProperty('token');
  });

});

describe('POST ' + gw('/register'), () => {

  it('registers a new user and returns qrUrl, confirmUrl, email (no secret)', async () => {
    const res = await request(app)
      .post(gw('/register'))
      .send({ email: EMAIL });

    expect(res.status).toBe(HTTP.CREATED);
    expect(res.body).toHaveProperty('qrUrl');
    expect(res.body).toHaveProperty('confirmUrl');
    expect(res.body.email).toBe(EMAIL);
    expect(res.body.qrUrl).toMatch(OTPAUTH_URL_REGEX);
    expect(res.body.confirmUrl).toMatch(CONFIRM_URL_REGEX);
    expect(res.body).not.toHaveProperty('secret');
  });

  it('rejects invalid email format', async () => {
    const res = await request(app)
      .post(gw('/register'))
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(HTTP.BAD_REQUEST);
    expect(res.body.error).toMatch(/email/i);
  });

  it('rejects duplicate email registration', async () => {
    await request(app)
      .post(gw('/register'))
      .send({ email: EMAIL });

    const res = await request(app)
      .post(gw('/register'))
      .send({ email: EMAIL });

    expect(res.status).toBe(HTTP.CONFLICT);
    expect(res.body.error).toMatch(/already registered/i);
  });

});

describe('GET ' + gw('/confirm') + '/:token', () => {

  it('confirms registration with a valid token', async () => {
    const reg = await request(app)
      .post(gw('/register'))
      .send({ email: EMAIL });

    const token = reg.body.confirmUrl.split('/').pop();

    const res = await request(app)
      .get(`${gw('/confirm')}/${token}`);

    expect(res.status).toBe(HTTP.OK);
    expect(res.body).toHaveProperty('secret');
    expect(res.body.email).toBe(EMAIL);
  });

  it('returns 404 with an invalid token', async () => {
    const res = await request(app)
      .get(`${gw('/confirm')}/nonexistent-token`);

    expect(res.status).toBe(HTTP.NOT_FOUND);
    expect(res.body.error).toMatch(/invalid confirm token/i);
  });

  it('returns 404 when no registration was made', async () => {
    const res = await request(app)
      .get(`${gw('/confirm')}/some-random-token`);

    expect(res.status).toBe(HTTP.NOT_FOUND);
    expect(res.body.error).toMatch(/invalid confirm token/i);
  });

  it('is idempotent - confirming twice returns same secret', async () => {
    const reg = await request(app)
      .post(gw('/register'))
      .send({ email: EMAIL });

    const token = reg.body.confirmUrl.split('/').pop();

    const res1 = await request(app).get(`${gw('/confirm')}/${token}`);
    const res2 = await request(app).get(`${gw('/confirm')}/${token}`);

    expect(res1.status).toBe(HTTP.OK);
    expect(res2.status).toBe(HTTP.OK);
    expect(res2.body.secret).toBe(res1.body.secret);
    expect(res2.body.email).toBe(res1.body.email);
  });

  it('returns the correct TOTP secret matching qrUrl', async () => {
    const reg = await request(app)
      .post(gw('/register'))
      .send({ email: EMAIL });

    const token = reg.body.confirmUrl.split('/').pop();

    const confirmRes = await request(app)
      .get(`${gw('/confirm')}/${token}`);

    const secretFromQr = reg.body.qrUrl.match(/secret=([^&]+)/)[1];
    expect(confirmRes.body.secret).toBe(secretFromQr);
  });

});

describe('Full flow: register → confirm → login (parameterized)', () => {

  it.each([
    { email: 'test@example.com', desc: 'standard email' },
    { email: 'user.name+tag@example.co.uk', desc: 'email with dots and plus' },
    { email: 'a@b.io', desc: 'short email' },
  ])('completes full auth flow - $desc', async ({ email }) => {
    const reg = await request(app)
      .post(gw('/register'))
      .send({ email });
    expect(reg.status).toBe(HTTP.CREATED);
    expect(reg.body).toMatchSnapshot({
      qrUrl: expect.stringMatching(OTPAUTH_URL_REGEX),
      confirmUrl: expect.stringMatching(CONFIRM_URL_REGEX),
      email: expect.any(String),
    });

    const token = reg.body.confirmUrl.split('/').pop();
    const confirmRes = await request(app).get(`${gw('/confirm')}/${token}`);
    expect(confirmRes.status).toBe(HTTP.OK);
    expect(confirmRes.body).toMatchSnapshot({
      secret: expect.stringMatching(BASE32_REGEX),
      email: expect.any(String),
    });

    const code = generateCode(confirmRes.body.secret);
    const loginRes = await request(app)
      .post(gw('/login'))
      .send({ email, code });
    expect(loginRes.status).toBe(HTTP.OK);
    expect(loginRes.body).toMatchSnapshot({
      token: expect.stringMatching(JWT_REGEX),
      email: expect.any(String),
    });
  });

  it('supports multiple users each completing the full flow independently', async () => {
    const users = ['alice@example.com', 'bob@example.com'];
    const secrets = {};

    for (const email of users) {
      const reg = await request(app)
        .post(gw('/register'))
        .send({ email });
      expect(reg.status).toBe(HTTP.CREATED);
      expect(reg.body).toMatchSnapshot({
        qrUrl: expect.stringMatching(OTPAUTH_URL_REGEX),
        confirmUrl: expect.stringMatching(CONFIRM_URL_REGEX),
        email: expect.any(String),
      });

      const token = reg.body.confirmUrl.split('/').pop();
      const confirmRes = await request(app).get(`${gw('/confirm')}/${token}`);
      expect(confirmRes.status).toBe(HTTP.OK);
      expect(confirmRes.body).toMatchSnapshot({
        secret: expect.stringMatching(BASE32_REGEX),
        email: expect.any(String),
      });
      secrets[email] = confirmRes.body.secret;
    }

    for (const email of users) {
      const code = generateCode(secrets[email]);
      const loginRes = await request(app)
        .post(gw('/login'))
        .send({ email, code });
      expect(loginRes.status).toBe(HTTP.OK);
      expect(loginRes.body).toMatchSnapshot({
        token: expect.stringMatching(JWT_REGEX),
        email: expect.any(String),
      });
    }
  });

});

describe('POST ' + gw('/login'), () => {

  it('rejects login for unconfirmed account', async () => {
    await request(app)
      .post(gw('/register'))
      .send({ email: EMAIL });

    const res = await request(app)
      .post(gw('/login'))
      .send({ email: EMAIL, code: '123456' });

    expect(res.status).toBe(HTTP.FORBIDDEN);
    expect(res.body.error).toMatch(/not confirmed/i);
  });

  it('logs in successfully after confirming registration', async () => {
    const reg = await request(app)
      .post(gw('/register'))
      .send({ email: EMAIL });

    const token = reg.body.confirmUrl.split('/').pop();
    const confirmRes = await request(app).get(`${gw('/confirm')}/${token}`);
    const code = generateCode(confirmRes.body.secret);

    const res = await request(app)
      .post(gw('/login'))
      .send({ email: EMAIL, code });

    expect(res.status).toBe(HTTP.OK);
    expect(res.body).toHaveProperty('token');
    expect(res.body.email).toBe(EMAIL);
  });

  it('rejects login with an invalid TOTP code', async () => {
    const reg = await request(app)
      .post(gw('/register'))
      .send({ email: EMAIL });

    const token = reg.body.confirmUrl.split('/').pop();
    await request(app).get(`${gw('/confirm')}/${token}`);

    const res = await request(app)
      .post(gw('/login'))
      .send({ email: EMAIL, code: '000000' });

    expect(res.status).toBe(HTTP.UNAUTHORIZED);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('rejects login for an unregistered email', async () => {
    const res = await request(app)
      .post(gw('/login'))
      .send({ email: 'unknown@example.com', code: '123456' });

    expect(res.status).toBe(HTTP.NOT_FOUND);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('rejects login with missing fields', async () => {
    const res = await request(app)
      .post(gw('/login'))
      .send({});

    expect(res.status).toBe(HTTP.BAD_REQUEST);
  });

});
