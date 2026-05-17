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
