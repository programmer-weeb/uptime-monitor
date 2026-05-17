import { createApp } from './app.js';
import { env } from './config/env.js';
import { log } from './config/log.js';

async function main() {
  const app = createApp();

  const server = app.listen(env.PORT, () => {
    log.info({ port: env.PORT, mode: env.APP_MODE, nodeEnv: env.NODE_ENV }, 'api listening');
  });

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'shutting down');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
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
