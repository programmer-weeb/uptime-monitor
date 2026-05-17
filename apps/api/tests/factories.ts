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
