import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from './helpers.js';
import { createMonitor, createUser } from './factories.js';
import { runCheck } from '../src/services/checkRunner.js';
import { processCheckJob } from '../src/jobs/checkProcessor.js';
import type { CheckJobData } from '../src/jobs/queue.js';

vi.mock('../src/services/checkRunner.js', () => ({
  runCheck: vi.fn(),
}));

const CHECK_JOB_NAME = 'check';
const runCheckMock = vi.mocked(runCheck);

beforeEach(() => {
  runCheckMock.mockReset();
});

function checkJob(monitorId: string): Job<CheckJobData, void, typeof CHECK_JOB_NAME> {
  return {
    name: CHECK_JOB_NAME,
    data: { monitorId },
  } as Job<CheckJobData, void, typeof CHECK_JOB_NAME>;
}

describe('processCheckJob', () => {
  it('writes an up check and marks the monitor up', async () => {
    const user = await createUser();
    const monitor = await createMonitor({ userId: user.id });
    await prisma.monitor.update({
      where: { id: monitor.id },
      data: { currentStatus: 'down', consecutiveFailures: 3 },
    });
    runCheckMock.mockResolvedValueOnce({
      status: 'up',
      statusCode: 200,
      latencyMs: 42,
      error: null,
    });

    await processCheckJob(checkJob(monitor.id));

    const check = await prisma.check.findFirstOrThrow({
      where: { monitorId: monitor.id },
    });
    expect(check).toMatchObject({
      monitorId: monitor.id,
      status: 'up',
      statusCode: 200,
      latencyMs: 42,
      error: null,
    });

    const updated = await prisma.monitor.findUniqueOrThrow({ where: { id: monitor.id } });
    expect(updated.currentStatus).toBe('up');
    expect(updated.consecutiveFailures).toBe(0);
    expect(updated.lastCheckedAt).toBeInstanceOf(Date);
  });

  it('writes a down check and increments consecutive failures', async () => {
    const user = await createUser();
    const monitor = await createMonitor({ userId: user.id });
    await prisma.monitor.update({
      where: { id: monitor.id },
      data: { consecutiveFailures: 1 },
    });
    runCheckMock.mockResolvedValueOnce({
      status: 'down',
      statusCode: 503,
      latencyMs: 80,
      error: 'HTTP_5XX',
    });

    await processCheckJob(checkJob(monitor.id));

    const check = await prisma.check.findFirstOrThrow({
      where: { monitorId: monitor.id },
    });
    expect(check).toMatchObject({
      monitorId: monitor.id,
      status: 'down',
      statusCode: 503,
      latencyMs: 80,
      error: 'HTTP_5XX',
    });

    const updated = await prisma.monitor.findUniqueOrThrow({ where: { id: monitor.id } });
    expect(updated.currentStatus).toBe('down');
    expect(updated.consecutiveFailures).toBe(2);
    expect(updated.lastCheckedAt).toBeInstanceOf(Date);
  });

  it('skips paused monitors', async () => {
    const user = await createUser();
    const monitor = await createMonitor({ userId: user.id, isPaused: true });

    await processCheckJob(checkJob(monitor.id));

    expect(runCheckMock).not.toHaveBeenCalled();
    expect(await prisma.check.count({ where: { monitorId: monitor.id } })).toBe(0);
  });

  it('skips missing monitors', async () => {
    await processCheckJob(checkJob('missing-monitor-id'));

    expect(runCheckMock).not.toHaveBeenCalled();
    expect(await prisma.check.count()).toBe(0);
  });
});
