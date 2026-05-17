import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis.js';

export type CheckJobData = { monitorId: string };
export type RetentionJobData = Record<string, never>;
export type ChecksQueueJobData = CheckJobData | RetentionJobData;
export type ChecksQueueJobName = typeof CHECK_JOB_NAME | typeof RETENTION_JOB_NAME;

export const CHECKS_QUEUE_NAME = 'checks';
export const CHECK_JOB_NAME = 'check';
export const RETENTION_JOB_NAME = 'prune-checks';
const RETENTION_SCHEDULER_ID = 'checks-retention';

let checksQueue: Queue<ChecksQueueJobData, void, ChecksQueueJobName> | null = null;

export function getChecksQueue(): Queue<ChecksQueueJobData, void, ChecksQueueJobName> {
  checksQueue ??= new Queue<ChecksQueueJobData, void, ChecksQueueJobName>(CHECKS_QUEUE_NAME, {
    connection: redisConnection,
  });

  return checksQueue;
}

export async function scheduleMonitorCheck(input: {
  id: string;
  intervalMinutes: number;
  isPaused: boolean;
}): Promise<void> {
  if (input.isPaused) {
    await removeMonitorSchedule(input.id);
    return;
  }

  const schedulerQueue = getChecksQueue() as Queue<ChecksQueueJobData, void, string>;
  await schedulerQueue.upsertJobScheduler(
    input.id,
    { every: input.intervalMinutes * 60_000 },
    {
      name: CHECK_JOB_NAME,
      data: { monitorId: input.id },
      opts: {
        removeOnComplete: 100,
        removeOnFail: 1000,
      },
    },
  );
}

export async function scheduleRetentionJob(): Promise<void> {
  const schedulerQueue = getChecksQueue() as Queue<ChecksQueueJobData, void, string>;
  await schedulerQueue.upsertJobScheduler(
    RETENTION_SCHEDULER_ID,
    { every: 24 * 60 * 60_000 },
    {
      name: RETENTION_JOB_NAME,
      data: {},
      opts: {
        removeOnComplete: 10,
        removeOnFail: 10,
      },
    },
  );
}

export async function removeMonitorSchedule(monitorId: string): Promise<void> {
  await getChecksQueue().removeJobScheduler(monitorId);
}

export async function closeChecksQueue(): Promise<void> {
  if (!checksQueue) {
    return;
  }

  await checksQueue.close();
  checksQueue = null;
}
