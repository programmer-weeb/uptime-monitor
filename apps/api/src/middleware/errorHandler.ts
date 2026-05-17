import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../lib/errors.js';
import { log } from '../config/log.js';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'NOT_FOUND', message: 'Route not found' });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: err.code,
      message: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'VALIDATION',
      message: 'Request failed validation',
      details: err.issues,
    });
    return;
  }

  log.error({ err, path: req.path }, 'unhandled error');
  res.status(500).json({ error: 'INTERNAL', message: 'Something went wrong' });
}
