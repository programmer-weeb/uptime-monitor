import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { corsOrigins } from './config/env.js';
import { log } from './config/log.js';

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Route not found' });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    log.error({ err, path: req.path }, 'unhandled error');
    res.status(500).json({ error: 'INTERNAL', message: 'Something went wrong' });
  });

  return app;
}
