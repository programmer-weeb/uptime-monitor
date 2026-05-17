import { Job, Worker } from 'bullmq';
import { prisma } from '../config/prisma.js';
import { redisConnection } from '../config/redis.js';
import { log } from '../config/log.js';
import { runCheck } from '../services/checkRunner.js';
import type { CheckJobData } from './queue.js';

const CHECKS_QUEUE_NAME = 'checks';

export async function processCheckJob(job: Job<CheckJobData, void, 'check'>): Promise<void> {
  const monitor = await prisma.monitor.findUnique({
    where: { id: job.data.monitorId },
  });

  if (!monitor || monitor.isPaused) {
    return;
  }

  const result = await runCheck(monitor.url);
  const checkedAt = new Date();

  await prisma.check.create({
    data: {
      monitorId: monitor.id,
      status: result.status,
      statusCode: result.statusCode,
      latencyMs: result.latencyMs,
      error: result.error,
      checkedAt,
    },
  });

  await prisma.monitor.update({
    where: { id: monitor.id },
    data: {
      currentStatus: result.status,
      lastCheckedAt: checkedAt,
      consecutiveFailures:
        result.status === 'down'
          ? {
              increment: 1,
            }
          : 0,
    },
  });
}

export function createCheckWorker(): Worker<CheckJobData, void, 'check'> {
  const worker = new Worker<CheckJobData, void, 'check'>(
    CHECKS_QUEUE_NAME,
    processCheckJob,
    {
      connection: redisConnection,
      concurrency: 5,
    },
  );

  worker.on('failed', (job, error) => {
    log.error(
      {
        err: error,
        jobId: job?.id,
        monitorId: job?.data.monitorId,
      },
      'check job failed',
    );
  });

  return worker;
}
