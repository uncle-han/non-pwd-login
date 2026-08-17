import { Router } from 'express';
import { isInitialized } from '../database/index.js';
import { HEALTH_PATH } from '../data/constant.js';

const router = Router();

router.get(HEALTH_PATH, (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    db: isInitialized() ? 'connected' : 'disconnected',
  });
});

export default router;
