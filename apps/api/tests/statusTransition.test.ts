import { describe, expect, it } from 'vitest';
import { prisma } from './helpers.js';
import { createMonitor, createUser } from './factories.js';
import {
  recordCheckTransition,
  writeCheckTransition,
} from '../src/services/statusTransition.js';

describe('recordCheckTransition', () => {
  it('fires exactly one down alert after the second consecutive failure', async () => {
    const user = await createUser();
    const monitor = await createMonitor({ userId: user.id });
    const monitorWithUser = { ...monitor, user: { email: user.email, phone: null } };

    const first = await recordCheckTransition({
      monitor: monitorWithUser,
      result: {
        status: 'down',
        statusCode: 503,
        latencyMs: 100,
        error: 'HTTP_5XX',
      },
      checkedAt: new Date('2026-05-17T00:00:00.000Z'),
    });
    expect(first.alert).toBeNull();
    expect(first.monitor.currentStatus).toBe('unknown');
    expect(first.monitor.consecutiveFailures).toBe(1);

    const secondMonitor = await prisma.monitor.findUniqueOrThrow({ where: { id: monitor.id } });
    const second = await recordCheckTransition({
      monitor: { ...secondMonitor, user: { email: user.email, phone: null } },
      result: {
        status: 'down',
        statusCode: 503,
        latencyMs: 110,
        error: 'HTTP_5XX',
      },
      checkedAt: new Date('2026-05-17T00:01:00.000Z'),
    });
    expect(second.alert).toMatchObject({
      type: 'down',
      to: { email: user.email, phone: null },
      monitorName: monitor.name,
      monitorUrl: monitor.url,
      error: 'HTTP_5XX',
    });
    expect(second.monitor.currentStatus).toBe('down');
    expect(second.monitor.consecutiveFailures).toBe(2);

    const thirdMonitor = await prisma.monitor.findUniqueOrThrow({ where: { id: monitor.id } });
    const third = await recordCheckTransition({
      monitor: { ...thirdMonitor, user: { email: user.email, phone: null } },
      result: {
        status: 'down',
        statusCode: 503,
        latencyMs: 120,
        error: 'HTTP_5XX',
      },
      checkedAt: new Date('2026-05-17T00:02:00.000Z'),
    });
    expect(third.alert).toBeNull();
    expect(third.monitor.currentStatus).toBe('down');
    expect(third.monitor.consecutiveFailures).toBe(3);

    expect(await prisma.alertEvent.count({ where: { monitorId: monitor.id, type: 'down' } })).toBe(
      1,
    );
  });

  it('fires one recovery alert when a down monitor returns up', async () => {
    const user = await createUser();
    const monitor = await createMonitor({ userId: user.id });
    const downMonitor = await prisma.monitor.update({
      where: { id: monitor.id },
      data: { currentStatus: 'down', consecutiveFailures: 3 },
    });

    const transition = await recordCheckTransition({
      monitor: { ...downMonitor, user: { email: user.email, phone: null } },
      result: {
        status: 'up',
        statusCode: 200,
        latencyMs: 42,
        error: null,
      },
      checkedAt: new Date('2026-05-17T00:03:00.000Z'),
    });

    expect(transition.alert).toMatchObject({
      type: 'recovery',
      to: { email: user.email, phone: null },
    });
    expect(transition.monitor.currentStatus).toBe('up');
    expect(transition.monitor.consecutiveFailures).toBe(0);
    expect(
      await prisma.alertEvent.count({ where: { monitorId: monitor.id, type: 'recovery' } }),
    ).toBe(1);
  });

  it('rolls back check and alert writes when the transaction fails', async () => {
    const user = await createUser();
    const monitor = await createMonitor({ userId: user.id });
    const failingMonitor = await prisma.monitor.update({
      where: { id: monitor.id },
      data: { consecutiveFailures: 1 },
    });

    await expect(
      prisma.$transaction(async (tx) => {
        await writeCheckTransition(tx, {
          monitor: { ...failingMonitor, user: { email: user.email, phone: null } },
          result: {
            status: 'down',
            statusCode: 503,
            latencyMs: 100,
            error: 'HTTP_5XX',
          },
          checkedAt: new Date('2026-05-17T00:04:00.000Z'),
        });
        throw new Error('forced rollback');
      }),
    ).rejects.toThrow('forced rollback');

    expect(await prisma.check.count({ where: { monitorId: monitor.id } })).toBe(0);
    expect(await prisma.alertEvent.count({ where: { monitorId: monitor.id } })).toBe(0);
    const reloaded = await prisma.monitor.findUniqueOrThrow({ where: { id: monitor.id } });
    expect(reloaded.currentStatus).toBe('unknown');
    expect(reloaded.consecutiveFailures).toBe(1);
    expect(reloaded.lastCheckedAt).toBeNull();
  });
});
