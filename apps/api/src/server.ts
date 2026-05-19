import { createApp } from './app.js';
import { env } from './config/env.js';
import { log } from './config/log.js';
import { prisma } from './config/prisma.js';
import { closeChecksQueue, scheduleMonitorCheck, scheduleRetentionJob } from './jobs/queue.js';
import { createCheckWorker } from './jobs/checkProcessor.js';
import { createRealtimeServer } from './realtime/socket.js';
import { getBotUsername, registerWebhook } from './services/telegramBot.js';

async function scheduleExistingMonitors(): Promise<void> {
  // Per plan §15.6: on worker startup, upsert a scheduler for every
  // un-paused monitor so fresh deploys and Redis flushes don't leave
  // monitors stuck without a schedule. Idempotent — upsert replaces.
  const monitors = await prisma.monitor.findMany({
    where: { isPaused: false },
    select: { id: true, intervalMinutes: true, isPaused: true },
  });
  await Promise.all(monitors.map(scheduleMonitorCheck));
  log.info({ count: monitors.length }, 'existing monitors scheduled');
}

async function main() {
  const shouldRunApi = env.APP_MODE === 'all' || env.APP_MODE === 'api';
  const shouldRunWorker = env.APP_MODE === 'all' || env.APP_MODE === 'worker';

  const app = shouldRunApi ? createApp() : null;
  const server = app?.listen(env.PORT, () => {
    log.info({ port: env.PORT, mode: env.APP_MODE, nodeEnv: env.NODE_ENV }, 'api listening');
  });
  if (server) {
    createRealtimeServer(server);
  }
  if (shouldRunApi && env.TELEGRAM_BOT_TOKEN && env.API_PUBLIC_URL) {
    if (!env.TELEGRAM_WEBHOOK_SECRET) {
      log.warn('TELEGRAM_WEBHOOK_SECRET not set — webhook endpoint has no secret validation');
    }
    await getBotUsername();
    await registerWebhook(`${env.API_PUBLIC_URL}/api/telegram/webhook`);
  }

  const worker = shouldRunWorker ? createCheckWorker() : null;

  if (worker) {
    await scheduleRetentionJob();
    await scheduleExistingMonitors();
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
