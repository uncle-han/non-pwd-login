import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { loadConfig } from './config.js';
import authRoutes from './routes/auth.js';
import healthRoutes from './routes/health.js';
import { initDb } from './database/index.js';
import { DEBUG_ERROR_PATH, ERR, HTTP, APP_NAME, SUPPORTED_VERSIONS } from './data/constant.js';

const config = loadConfig();
const app = express();

app.use(cors({ origin: config.cors.origin }));
app.use(express.json());

app.use('/:prefix/:version/auth', (req, res, next) => {
  req.prefix = req.params.prefix;
  req.version = req.params.version;
  if (!SUPPORTED_VERSIONS.includes(req.version)) {
    return res.status(HTTP.BAD_REQUEST).json({
      error: `Unsupported API version: ${req.version}. Supported: ${SUPPORTED_VERSIONS.join(', ')}`,
    });
  }
  next();
}, authRoutes);

app.use('/', healthRoutes);

if (config.env !== 'production') {
  app.get(DEBUG_ERROR_PATH, (_req, _res, next) => {
    next(new Error('Test error from debug route'));
  });
}

app.use((_req, res) => {
  res.status(HTTP.NOT_FOUND).json({ error: ERR.NOT_FOUND });
});

app.use((err, _req, res, _next) => {
  const message = config.env === 'development'
    ? err.message
    : ERR.INTERNAL;
  res.status(err.status || HTTP.INTERNAL_SERVER_ERROR).json({ error: message });
});

export { app, config };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  initDb(config).then(() => {
    app.listen(config.server.port, () => {
      console.log(`${APP_NAME} server running on :${config.server.port} [${config.env}]`);
    });
  });
}
