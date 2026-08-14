import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VALID_ENVS = ['development', 'uat', 'production', 'test'];

const DEFAULTS = {
  development: {
    env: 'development',
    server: { port: 3000 },
    db: {
      client: 'mysql',
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: '',
      database: 'non_pwd_login',
    },
    jwt: {
      secret: 'dev-secret-key',
      expiresIn: '7d',
    },
    cors: {
      origin: '*',
    },
  },
  test: {
    env: 'test',
    server: { port: 0 },
    db: {
      client: 'mysql',
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: '',
      database: 'non_pwd_login_test',
    },
    jwt: {
      secret: 'test-secret-key',
      expiresIn: '1h',
    },
    cors: {
      origin: '*',
    },
  },
  uat: {
    env: 'uat',
    server: { port: 3000 },
    db: {
      client: 'mysql',
      host: '192.168.31.123',
      port: 3306,
      user: 'root',
      password: 'root',
      database: 'non_pwd_login',
    },
    jwt: {
      secret: '',
      expiresIn: '7d',
    },
    cors: {
      origin: '*',
    },
  },
  production: {
    env: 'production',
    server: { port: 3000 },
    db: {
      client: 'mysql',
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: '',
      database: 'non_pwd_login',
    },
    jwt: {
      secret: '',
      expiresIn: '7d',
    },
    cors: {
      origin: '*',
    },
  },
};

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const content = readFileSync(filePath, 'utf-8');
  const vars = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

function pick(obj, key) {
  return key in obj ? obj[key] : undefined;
}

function applyOverrides(base, fileVars, systemVars, explicitOverrides) {
  const allOverrides = { ...fileVars, ...systemVars };

  function orEnv(key, fallback) {
    return pick(allOverrides, key) !== undefined ? allOverrides[key] : fallback;
  }

  const cfg = {
    env: base.env,
    server: {
      port: parseInt(orEnv('PORT', String(base.server.port)), 10),
    },
    db: {
      ...base.db,
      host: orEnv('DB_HOST', base.db.host),
      port: parseInt(orEnv('DB_PORT', String(base.db.port)), 10),
      user: orEnv('DB_USER', base.db.user),
      password: orEnv('DB_PASSWORD', base.db.password),
      database: orEnv('DB_DATABASE', base.db.database),
    },
    jwt: {
      ...base.jwt,
      secret: orEnv('JWT_SECRET', base.jwt.secret),
      expiresIn: orEnv('JWT_EXPIRES_IN', base.jwt.expiresIn),
    },
    cors: {
      ...base.cors,
      origin: orEnv('CORS_ORIGIN', base.cors.origin),
    },
  };

  if ('JWT_SECRET' in explicitOverrides) {
    cfg.jwt.secret = explicitOverrides.JWT_SECRET;
  }
  if ('DB_PASSWORD' in explicitOverrides) {
    cfg.db.password = explicitOverrides.DB_PASSWORD;
  }

  return cfg;
}

function validate(cfg) {
  if (cfg.env === 'production') {
    if (!cfg.jwt.secret) {
      throw new Error('JWT_SECRET is required in production environment');
    }
    if (!cfg.db.password) {
      throw new Error('DB_PASSWORD is required in production environment');
    }
  }
}

function deepFreeze(obj) {
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return Object.freeze(obj);
}

export function loadConfig(env, overrides = {}) {
  const resolved = env || process.env.APP_ENV || process.env.NODE_ENV || 'development';

  if (!VALID_ENVS.includes(resolved)) {
    throw new Error(
      `Invalid environment "${resolved}". Must be one of: ${VALID_ENVS.join(', ')}`
    );
  }

  const envFilePath = path.resolve(__dirname, `../.env.${resolved}`);
  const fileVars = parseEnvFile(envFilePath);

  const systemVars = {};
  for (const key of Object.keys(process.env)) {
    systemVars[key] = process.env[key];
  }

  let config = DEFAULTS[resolved];
  config = applyOverrides(config, fileVars, systemVars, overrides);

  validate(config);

  return deepFreeze(config);
}
