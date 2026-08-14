import request from 'supertest';
import { app } from '../app.js';
import { initDb, closeDb } from '../database/index.js';
import { createMockDriver } from './helpers/mock-driver.js';
import { HEALTH_PATH, DEBUG_ERROR_PATH, HTTP } from '../data/constant.js';

const GW_PREFIX = '__test__';
const gw = (path) => `/${GW_PREFIX}/v1/auth${path}`;

beforeAll(async () => {
  await initDb(null, createMockDriver());
});

afterAll(async () => {
  await closeDb();
});

describe('CORS', () => {

  it('returns CORS headers on OPTIONS preflight', async () => {
    const res = await request(app).options(gw('/register'));
    expect(res.headers['access-control-allow-origin']).toBeDefined();
    expect(res.headers['access-control-allow-methods']).toMatch(/POST|GET|OPTIONS/);
  });

  it('allows cross-origin POST requests', async () => {
    const res = await request(app)
      .post(gw('/register'))
      .set('Origin', 'http://example.com')
      .send({ email: 'test@example.com' });
    expect(res.status).toBe(HTTP.CREATED);
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

});

describe('GET ' + HEALTH_PATH, () => {

  it('returns 200 with status and uptime', async () => {
    const res = await request(app).get(HEALTH_PATH);
    expect(res.status).toBe(HTTP.OK);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('uptime');
    expect(typeof res.body.uptime).toBe('number');
  });

  it('reports database connection status', async () => {
    const res = await request(app).get(HEALTH_PATH);
    expect(res.body).toHaveProperty('db');
  });

});

describe('Error handling', () => {

  it('returns 404 JSON for unknown routes', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(HTTP.NOT_FOUND);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 500 JSON for unhandled errors', async () => {
    const res = await request(app).get(DEBUG_ERROR_PATH);
    expect(res.status).toBe(HTTP.INTERNAL_SERVER_ERROR);
    expect(res.body).toHaveProperty('error');
  });

});
