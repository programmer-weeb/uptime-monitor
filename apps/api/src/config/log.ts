import pino from 'pino';
import { env } from './env.js';

const isDev = env.NODE_ENV !== 'production';

export const log = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'password',
      'passwordHash',
      'token',
      'jwt',
      '*.password',
    ],
    censor: '[REDACTED]',
  },
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' },
        },
      }
    : {}),
});
