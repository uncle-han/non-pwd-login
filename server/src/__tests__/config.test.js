import { readFileSync } from 'fs';
import { loadConfig } from '../config.js';

function withEnv(env, fn) {
  const origEnv = { ...process.env };
  delete process.env.NODE_ENV;
  delete process.env.APP_ENV;
  if (env) process.env.NODE_ENV = env;
  try {
    return fn();
  } finally {
    process.env = origEnv;
  }
}

describe('Config structure', () => {

  it('returns an object with server, db, jwt, cors, and env sections', () => {
    const cfg = withEnv('development', () => loadConfig());
    expect(cfg).toHaveProperty('env');
    expect(cfg).toHaveProperty('server');
    expect(cfg).toHaveProperty('db');
    expect(cfg).toHaveProperty('jwt');
    expect(cfg).toHaveProperty('cors');
  });

  it('server section has port as a number', () => {
    const cfg = withEnv('development', () => loadConfig());
    expect(cfg.server).toHaveProperty('port');
    expect(typeof cfg.server.port).toBe('number');
  });

  it('db section has client, host, port, user, password, database', () => {
    const cfg = withEnv('development', () => loadConfig());
    expect(cfg.db).toHaveProperty('client');
    expect(cfg.db).toHaveProperty('host');
    expect(cfg.db).toHaveProperty('port');
    expect(cfg.db).toHaveProperty('user');
    expect(cfg.db).toHaveProperty('password');
    expect(cfg.db).toHaveProperty('database');
    expect(typeof cfg.db.port).toBe('number');
  });

  it('jwt section has secret and expiresIn', () => {
    const cfg = withEnv('development', () => loadConfig());
    expect(cfg.jwt).toHaveProperty('secret');
    expect(cfg.jwt).toHaveProperty('expiresIn');
    expect(typeof cfg.jwt.secret).toBe('string');
    expect(typeof cfg.jwt.expiresIn).toBe('string');
  });

  it('cors section has origin', () => {
    const cfg = withEnv('development', () => loadConfig());
    expect(cfg.cors).toHaveProperty('origin');
    expect(typeof cfg.cors.origin).toBe('string');
  });

});

describe('Config — DEV (development)', () => {

  it('uses MySQL client for development', () => {
    const cfg = withEnv('development', () => loadConfig());
    expect(cfg.db.client).toBe('mysql');
  });

  it('connects to localhost in development', () => {
    const cfg = withEnv('development', () => loadConfig());
    expect(cfg.db.host).toBe('localhost');
  });

  it('connects on MySQL port 3306 in development', () => {
    const cfg = withEnv('development', () => loadConfig());
    expect(cfg.db.port).toBe(3306);
  });

  it('listens on port 3000 by default', () => {
    const cfg = withEnv('development', () => loadConfig());
    expect(cfg.server.port).toBe(3000);
  });

  it('has development JWT secret', () => {
    const cfg = withEnv('development', () => loadConfig());
    expect(cfg.jwt.secret).toBe('dev-secret-key');
  });

  it('env is set to development', () => {
    const cfg = withEnv('development', () => loadConfig());
    expect(cfg.env).toBe('development');
  });

  it('cors allows all origins in development', () => {
    const cfg = withEnv('development', () => loadConfig());
    expect(cfg.cors.origin).toBe('*');
  });

});

describe('Config — UAT', () => {

  it('uses MySQL client for UAT', () => {
    const cfg = withEnv('uat', () => loadConfig());
    expect(cfg.db.client).toBe('mysql');
  });

  it('connects to the provided UAT host', () => {
    const cfg = withEnv('uat', () => loadConfig());
    expect(cfg.db.host).toBe('192.168.31.123');
  });

  it('connects on MySQL port 3306', () => {
    const cfg = withEnv('uat', () => loadConfig());
    expect(cfg.db.port).toBe(3306);
  });

  it('uses the provided UAT account', () => {
    const cfg = withEnv('uat', () => loadConfig());
    expect(cfg.db.user).toBe('root');
  });

  it('uses the provided UAT password', () => {
    const cfg = withEnv('uat', () => loadConfig());
    expect(cfg.db.password).toBe('root');
  });

  it('has a database name configured', () => {
    const cfg = withEnv('uat', () => loadConfig());
    expect(cfg.db.database).toBeDefined();
    expect(cfg.db.database.length).toBeGreaterThan(0);
  });

  it('env is set to uat', () => {
    const cfg = withEnv('uat', () => loadConfig());
    expect(cfg.env).toBe('uat');
  });

});

describe('Config — PROD (production)', () => {

  function prodCfg() {
    return loadConfig('production', { JWT_SECRET: 'prod-secret', DB_PASSWORD: 'prod-pwd' });
  }

  it('uses MySQL client for production', () => {
    const cfg = prodCfg();
    expect(cfg.db.client).toBe('mysql');
  });

  it('env is set to production', () => {
    const cfg = prodCfg();
    expect(cfg.env).toBe('production');
  });

  it('throws if required JWT_SECRET is missing in production', () => {
    expect(() => loadConfig('production', { JWT_SECRET: '' }))
      .toThrow(/JWT_SECRET|jwt.*secret/i);
  });

  it('throws if required DB password is missing in production', () => {
    expect(() => loadConfig('production', { JWT_SECRET: 'prod-secret', DB_PASSWORD: '' }))
      .toThrow(/DB_PASSWORD|db.*password/i);
  });

});

describe('Config — environment validity', () => {

  it('throws for an invalid environment name', () => {
    expect(() => loadConfig('staging'))
      .toThrow(/invalid.*environment|staging/i);
  });

  it('accepts development, test, uat, and production', () => {
    expect(() => loadConfig('development')).not.toThrow();
    expect(() => loadConfig('test')).not.toThrow();
    expect(() => loadConfig('uat')).not.toThrow();
    expect(() => loadConfig('production', { JWT_SECRET: 's', DB_PASSWORD: 'p' })).not.toThrow();
  });

});

describe('Config — immutability', () => {

  it('returns a frozen config object', () => {
    const cfg = withEnv('development', () => loadConfig());
    expect(Object.isFrozen(cfg)).toBe(true);
  });

  it('nested server object is frozen', () => {
    const cfg = withEnv('development', () => loadConfig());
    expect(Object.isFrozen(cfg.server)).toBe(true);
  });

  it('nested db object is frozen', () => {
    const cfg = withEnv('development', () => loadConfig());
    expect(Object.isFrozen(cfg.db)).toBe(true);
  });

  it('nested jwt object is frozen', () => {
    const cfg = withEnv('development', () => loadConfig());
    expect(Object.isFrozen(cfg.jwt)).toBe(true);
  });

});

describe('Config — env file loading', () => {

  it('loadConfig merges env-specific .env file values', () => {
    const cfg = withEnv('uat', () => loadConfig());
    expect(cfg.db.host).toBe('192.168.31.123');
  });

  it('does not leak UAT config into development', () => {
    const devCfg = withEnv('development', () => loadConfig());
    const uatCfg = withEnv('uat', () => loadConfig());
    expect(devCfg.db.host).not.toBe(uatCfg.db.host);
  });

  it('does not leak DEV config into production', () => {
    const devCfg = withEnv('development', () => loadConfig());
    const prodCfg = loadConfig('production', {
      JWT_SECRET: 'prod-secret',
      DB_PASSWORD: 'prod-pwd',
    });
    expect(prodCfg.jwt.secret).not.toBe(devCfg.jwt.secret);
  });

});

describe('npm scripts — environment targeting', () => {

  it('start:UAT sets NODE_ENV=uat', () => {
    const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
    expect(pkg.scripts['start:UAT']).toBeDefined();
    expect(pkg.scripts['start:UAT']).toMatch(/NODE_ENV=uat/i);
  });

  it('start:PROD sets NODE_ENV=production', () => {
    const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
    expect(pkg.scripts['start:PROD']).toBeDefined();
    expect(pkg.scripts['start:PROD']).toMatch(/NODE_ENV=production/i);
  });

  it('start:DEV sets NODE_ENV=development', () => {
    const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
    expect(pkg.scripts['start:DEV']).toBeDefined();
    expect(pkg.scripts['start:DEV']).toMatch(/NODE_ENV=development/i);
  });

});
