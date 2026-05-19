import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { corsOrigins } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { accountRouter } from './routes/account.js';
import { authRouter } from './routes/auth.js';
import { monitorsRouter } from './routes/monitors.js';
import { telegramWebhookRouter } from './routes/telegramWebhook.js';

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', authRouter);
  app.use('/api', accountRouter);
  app.use('/api', telegramWebhookRouter);
  app.use('/api/monitors', monitorsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
