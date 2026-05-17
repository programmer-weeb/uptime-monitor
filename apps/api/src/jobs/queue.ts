import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis.js';

export type CheckJobData = { monitorId: string };

export const CHECKS_QUEUE_NAME = 'checks';
export const CHECK_JOB_NAME = 'check';

let checksQueue: Queue<CheckJobData, void, typeof CHECK_JOB_NAME> | null = null;

export function getChecksQueue(): Queue<CheckJobData, void, typeof CHECK_JOB_NAME> {
  checksQueue ??= new Queue<CheckJobData, void, typeof CHECK_JOB_NAME>(CHECKS_QUEUE_NAME, {
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

  const schedulerQueue = getChecksQueue() as Queue<CheckJobData, void, string>;
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
