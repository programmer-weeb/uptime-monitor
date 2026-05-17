import bcrypt from 'bcrypt';
import { prisma } from './helpers.js';

let counter = 0;
const nextEmail = (): string => `user-${++counter}-${Date.now()}@test.local`;

type CreateUserOpts = {
  email?: string;
  password?: string;
  isDemo?: boolean;
};

export async function createUser(opts: CreateUserOpts = {}) {
  return prisma.user.create({
    data: {
      email: (opts.email ?? nextEmail()).toLowerCase(),
      passwordHash: await bcrypt.hash(opts.password ?? 'testpass123', 4),
      isDemo: opts.isDemo ?? false,
    },
  });
}

type Interval = 1 | 5 | 15 | 30 | 60;

type CreateMonitorOpts = {
  userId: string;
  name?: string;
  url?: string;
  intervalMinutes?: Interval;
  isPaused?: boolean;
};

export async function createMonitor(opts: CreateMonitorOpts) {
  return prisma.monitor.create({
    data: {
      userId: opts.userId,
      name: opts.name ?? 'Test monitor',
      url: opts.url ?? 'https://example.com',
      intervalMinutes: opts.intervalMinutes ?? 5,
      isPaused: opts.isPaused ?? false,
    },
  });
}

type CreateCheckOpts = {
  monitorId: string;
  status?: 'up' | 'down';
  statusCode?: number | null;
  latencyMs?: number;
  error?: string | null;
  checkedAt?: Date;
};

export async function createCheck(opts: CreateCheckOpts) {
  return prisma.check.create({
    data: {
      monitorId: opts.monitorId,
      status: opts.status ?? 'up',
      statusCode: opts.statusCode ?? (opts.status === 'down' ? null : 200),
      latencyMs: opts.latencyMs ?? 100,
      error: opts.error ?? null,
      checkedAt: opts.checkedAt,
    },
  });
}
