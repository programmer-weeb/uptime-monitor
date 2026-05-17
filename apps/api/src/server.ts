import { createApp } from './app.js';
import { env } from './config/env.js';
import { log } from './config/log.js';
import { prisma } from './config/prisma.js';
import { closeChecksQueue } from './jobs/queue.js';
import { createCheckWorker } from './jobs/checkProcessor.js';

async function main() {
  const shouldRunApi = env.APP_MODE === 'all' || env.APP_MODE === 'api';
  const shouldRunWorker = env.APP_MODE === 'all' || env.APP_MODE === 'worker';

  const app = shouldRunApi ? createApp() : null;
  const server = app?.listen(env.PORT, () => {
    log.info({ port: env.PORT, mode: env.APP_MODE, nodeEnv: env.NODE_ENV }, 'api listening');
  });
  const worker = shouldRunWorker ? createCheckWorker() : null;

  if (worker) {
    log.info({ mode: env.APP_MODE }, 'check worker started');
  }

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'shutting down');
    const timeout = setTimeout(() => process.exit(1), 10_000);
    timeout.unref();

    await worker?.close();
    await closeChecksQueue();
    await prisma.$disconnect();

    if (!server) {
      clearTimeout(timeout);
      process.exit(0);
    }

    server.close(() => {
      clearTimeout(timeout);
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => {
    log.fatal({ err }, 'unhandledRejection');
    process.exit(1);
  });
}

main().catch((err) => {
  log.fatal({ err }, 'failed to start');
  process.exit(1);
});
