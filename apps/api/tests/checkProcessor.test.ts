import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from './helpers.js';
import { createMonitor, createUser } from './factories.js';
import { runCheck } from '../src/services/checkRunner.js';
import { processCheckJob, processChecksQueueJob } from '../src/jobs/checkProcessor.js';
import { pruneOldChecks } from '../src/jobs/retention.js';
import type { CheckJobData, ChecksQueueJobData, ChecksQueueJobName } from '../src/jobs/queue.js';
import { emitCheckCompleted, emitMonitorStatusChanged } from '../src/realtime/socket.js';
import { sendAlertEmail } from '../src/services/alertEmail.js';

vi.mock('../src/services/checkRunner.js', () => ({
  runCheck: vi.fn(),
}));

vi.mock('../src/jobs/retention.js', () => ({
  pruneOldChecks: vi.fn(),
}));

vi.mock('../src/realtime/socket.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/realtime/socket.js')>();
  return {
    ...actual,
    emitCheckCompleted: vi.fn(),
    emitMonitorStatusChanged: vi.fn(),
  };
});

vi.mock('../src/services/alertEmail.js', () => ({
  sendAlertEmail: vi.fn().mockResolvedValue(undefined),
}));

const CHECK_JOB_NAME = 'check';
const runCheckMock = vi.mocked(runCheck);
const pruneOldChecksMock = vi.mocked(pruneOldChecks);
const emitCheckCompletedMock = vi.mocked(emitCheckCompleted);
const emitMonitorStatusChangedMock = vi.mocked(emitMonitorStatusChanged);
const sendAlertEmailMock = vi.mocked(sendAlertEmail);

beforeEach(() => {
  runCheckMock.mockReset();
  pruneOldChecksMock.mockReset();
  emitCheckCompletedMock.mockReset();
  emitMonitorStatusChangedMock.mockReset();
  sendAlertEmailMock.mockReset();
});

function checkJob(monitorId: string): Job<CheckJobData, void, typeof CHECK_JOB_NAME> {
  return {
    name: CHECK_JOB_NAME,
    data: { monitorId },
  } as Job<CheckJobData, void, typeof CHECK_JOB_NAME>;
}

function queueJob(name: ChecksQueueJobName): Job<ChecksQueueJobData, void, ChecksQueueJobName> {
  return {
    name,
    data: name === CHECK_JOB_NAME ? { monitorId: 'unused' } : {},
  } as Job<ChecksQueueJobData, void, ChecksQueueJobName>;
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
    expect(emitCheckCompletedMock).toHaveBeenCalledTimes(1);
    expect(emitCheckCompletedMock).toHaveBeenCalledWith(user.id, {
      monitor: expect.objectContaining({
        id: monitor.id,
        currentStatus: 'up',
        lastCheckedAt: expect.any(String),
      }),
      check: expect.objectContaining({
        monitorId: monitor.id,
        status: 'up',
        checkedAt: expect.any(String),
      }),
    });
    expect(emitMonitorStatusChangedMock).toHaveBeenCalledTimes(1);
    expect(emitMonitorStatusChangedMock).toHaveBeenCalledWith(user.id, {
      monitorId: monitor.id,
      previousStatus: 'down',
      currentStatus: 'up',
      monitor: expect.objectContaining({
        id: monitor.id,
        currentStatus: 'up',
      }),
    });
    expect(sendAlertEmailMock).toHaveBeenCalledTimes(1);
    expect(sendAlertEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'recovery',
      to: user.email,
      monitorName: monitor.name,
      monitorUrl: monitor.url,
    }));
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
    expect(emitCheckCompletedMock).toHaveBeenCalledTimes(1);
    expect(emitMonitorStatusChangedMock).toHaveBeenCalledTimes(1);
    expect(sendAlertEmailMock).toHaveBeenCalledTimes(1);
    expect(sendAlertEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'down',
      to: user.email,
      error: 'HTTP_5XX',
    }));
  });

  it('skips paused monitors', async () => {
    const user = await createUser();
    const monitor = await createMonitor({ userId: user.id, isPaused: true });

    await processCheckJob(checkJob(monitor.id));

    expect(runCheckMock).not.toHaveBeenCalled();
    expect(await prisma.check.count({ where: { monitorId: monitor.id } })).toBe(0);
    expect(emitCheckCompletedMock).not.toHaveBeenCalled();
    expect(emitMonitorStatusChangedMock).not.toHaveBeenCalled();
    expect(sendAlertEmailMock).not.toHaveBeenCalled();
  });

  it('skips missing monitors', async () => {
    await processCheckJob(checkJob('missing-monitor-id'));

    expect(runCheckMock).not.toHaveBeenCalled();
    expect(await prisma.check.count()).toBe(0);
    expect(emitCheckCompletedMock).not.toHaveBeenCalled();
    expect(emitMonitorStatusChangedMock).not.toHaveBeenCalled();
    expect(sendAlertEmailMock).not.toHaveBeenCalled();
  });
});

describe('processChecksQueueJob', () => {
  it('runs the retention processor for prune-checks jobs', async () => {
    pruneOldChecksMock.mockResolvedValueOnce(2);

    await processChecksQueueJob(queueJob('prune-checks'));

    expect(pruneOldChecksMock).toHaveBeenCalledTimes(1);
    expect(runCheckMock).not.toHaveBeenCalled();
  });
});
