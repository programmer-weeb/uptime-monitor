import { afterAll, beforeEach } from 'vitest';
import { prisma } from '../src/config/prisma.js';

export { prisma };

export async function truncateAll(): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "users" RESTART IDENTITY CASCADE');
}

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await prisma.$disconnect();
});
