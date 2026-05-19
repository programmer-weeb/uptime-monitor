import { Redis } from 'ioredis';
import type { ConnectionOptions } from 'bullmq';
import { env } from './env.js';

export const redisConnection: ConnectionOptions = {
  url: env.REDIS_URL,
  maxRetriesPerRequest: null,
};

export const redisClient = new Redis(env.REDIS_URL);
