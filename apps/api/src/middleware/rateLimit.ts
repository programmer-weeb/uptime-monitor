import rateLimit, { type Options } from 'express-rate-limit';
import { env } from '../config/env.js';

const isTest = env.NODE_ENV === 'test';

const baseOpts: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: 'RATE_LIMITED', message: 'Too many requests' });
  },
};

export const signupLimiter = rateLimit({
  ...baseOpts,
  windowMs: 60 * 60 * 1000,
  limit: isTest ? 1000 : 3,
});

export const loginLimiter = rateLimit({
  ...baseOpts,
  windowMs: 60 * 1000,
  limit: isTest ? 1000 : 10,
});

// 5 monitor creations per minute per authenticated user (1000/min in tests).
// Mounted only on POST /api/monitors; requireAuth runs first so req.user is set.
export const createMonitorLimiter = rateLimit({
  ...baseOpts,
  windowMs: 60 * 1000,
  limit: isTest ? 1000 : 5,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'anonymous',
});
