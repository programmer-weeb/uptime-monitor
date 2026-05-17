import { afterAll, beforeEach } from 'vitest';
import { prisma } from '../src/config/prisma.js';

export { prisma };

export async function truncateAll(): Promise<void> {
  // Order doesn't matter with CASCADE, but list every table explicitly so
  // adding a model becomes a compile-time grep target.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "alert_events", "checks", "monitors", "users" RESTART IDENTITY CASCADE',
  );
}

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await prisma.$disconnect();
});
