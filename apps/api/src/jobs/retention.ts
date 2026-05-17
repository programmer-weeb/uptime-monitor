import { prisma } from '../config/prisma.js';

const CHECK_RETENTION_DAYS = 30;

export async function pruneOldChecks(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - CHECK_RETENTION_DAYS * 24 * 60 * 60_000);
  const result = await prisma.check.deleteMany({
    where: {
      checkedAt: {
        lt: cutoff,
      },
    },
  });

  return result.count;
}
