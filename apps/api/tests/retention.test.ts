import { describe, expect, it } from 'vitest';
import { prisma } from './helpers.js';
import { createMonitor, createUser } from './factories.js';
import { pruneOldChecks } from '../src/jobs/retention.js';

describe('pruneOldChecks', () => {
  it('deletes checks older than 30 days and keeps recent checks', async () => {
    const now = new Date('2026-05-17T12:00:00.000Z');
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60_000);
    const user = await createUser();
    const monitor = await createMonitor({ userId: user.id });
    const oldCheck = await prisma.check.create({
      data: {
        monitorId: monitor.id,
        status: 'up',
        statusCode: 200,
        latencyMs: 20,
        checkedAt: new Date(cutoff.getTime() - 1),
      },
    });
    const boundaryCheck = await prisma.check.create({
      data: {
        monitorId: monitor.id,
        status: 'down',
        statusCode: 500,
        latencyMs: 200,
        error: 'HTTP_5XX',
        checkedAt: cutoff,
      },
    });
    const recentCheck = await prisma.check.create({
      data: {
        monitorId: monitor.id,
        status: 'up',
        statusCode: 200,
        latencyMs: 30,
        checkedAt: new Date(cutoff.getTime() + 1),
      },
    });

    await expect(pruneOldChecks(now)).resolves.toBe(1);

    await expect(prisma.check.findUnique({ where: { id: oldCheck.id } })).resolves.toBeNull();
    await expect(prisma.check.findUnique({ where: { id: boundaryCheck.id } })).resolves.toBeTruthy();
    await expect(prisma.check.findUnique({ where: { id: recentCheck.id } })).resolves.toBeTruthy();
  });
});
