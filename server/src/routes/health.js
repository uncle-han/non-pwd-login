import { Router } from 'express';
import { isInitialized } from '../database/index.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    db: isInitialized() ? 'connected' : 'disconnected',
  });
});

export default router;
