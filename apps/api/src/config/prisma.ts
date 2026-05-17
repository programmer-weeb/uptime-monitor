import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

const logLevels: Array<'warn' | 'error'> =
  env.NODE_ENV === 'development' ? ['warn', 'error'] : env.NODE_ENV === 'test' ? [] : ['error'];

export const prisma = new PrismaClient({ log: logLevels });
