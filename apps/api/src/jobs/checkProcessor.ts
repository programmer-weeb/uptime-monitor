import { Job, Worker } from 'bullmq';
import { prisma } from '../config/prisma.js';
import { redisConnection } from '../config/redis.js';
import { log } from '../config/log.js';
import { runCheck } from '../services/checkRunner.js';
import { CHECK_JOB_NAME, CHECKS_QUEUE_NAME, RETENTION_JOB_NAME, type CheckJobData, type ChecksQueueJobData, type ChecksQueueJobName } from './queue.js';
import { pruneOldChecks } from './retention.js';
import {
  emitCheckCompleted,
  emitMonitorStatusChanged,
  toRealtimeCheck,
  toRealtimeMonitor,
} from '../realtime/socket.js';

export async function processCheckJob(job: Job<CheckJobData, void, typeof CHECK_JOB_NAME>): Promise<void> {
  const monitor = await prisma.monitor.findUnique({
    where: { id: job.data.monitorId },
  });

  if (!monitor || monitor.isPaused) {
    return;
  }

  const result = await runCheck(monitor.url);
  const checkedAt = new Date();

  const check = await prisma.check.create({
    data: {
      monitorId: monitor.id,
      status: result.status,
      statusCode: result.statusCode,
      latencyMs: result.latencyMs,
      error: result.error,
      checkedAt,
    },
  });

  const updatedMonitor = await prisma.monitor.update({
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

  const realtimeMonitor = toRealtimeMonitor(updatedMonitor);
  emitCheckCompleted(monitor.userId, {
    monitor: realtimeMonitor,
    check: toRealtimeCheck(check),
  });

  if (monitor.currentStatus !== updatedMonitor.currentStatus) {
    emitMonitorStatusChanged(monitor.userId, {
      monitorId: monitor.id,
      previousStatus: monitor.currentStatus,
      currentStatus: updatedMonitor.currentStatus,
      monitor: realtimeMonitor,
    });
  }
}

export async function processChecksQueueJob(
  job: Job<ChecksQueueJobData, void, ChecksQueueJobName>,
): Promise<void> {
  if (job.name === RETENTION_JOB_NAME) {
    const deletedCount = await pruneOldChecks();
    log.info({ deletedCount }, 'old checks pruned');
    return;
  }

  await processCheckJob(job as Job<CheckJobData, void, typeof CHECK_JOB_NAME>);
}

export function createCheckWorker(): Worker<ChecksQueueJobData, void, ChecksQueueJobName> {
  const worker = new Worker<ChecksQueueJobData, void, ChecksQueueJobName>(
    CHECKS_QUEUE_NAME,
    processChecksQueueJob,
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
        jobName: job?.name,
        monitorId: job?.name === CHECK_JOB_NAME ? job.data.monitorId : undefined,
      },
      'check job failed',
    );
  });

  return worker;
}
