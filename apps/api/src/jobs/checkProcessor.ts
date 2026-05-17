import { Job, Worker } from 'bullmq';
import { prisma } from '../config/prisma.js';
import { redisConnection } from '../config/redis.js';
import { log } from '../config/log.js';
import { runCheck } from '../services/checkRunner.js';
import { sendAlertEmail } from '../services/alertEmail.js';
import { recordCheckTransition } from '../services/statusTransition.js';
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
    include: {
      user: {
        select: {
          email: true,
        },
      },
    },
  });

  if (!monitor || monitor.isPaused) {
    return;
  }

  const result = await runCheck(monitor.url);
  const checkedAt = new Date();

  const transition = await recordCheckTransition({
    monitor,
    result,
    checkedAt,
  });

  // One structured log line per check completion — plan §15.4.
  // Use the four fields the plan specifies; downstream tooling greps on these.
  log.info(
    {
      monitorId: monitor.id,
      status: result.status,
      latencyMs: result.latencyMs,
      error: result.error,
    },
    'check completed',
  );

  if (transition.alert) {
    try {
      await sendAlertEmail(transition.alert);
    } catch (err) {
      log.error({ err, monitorId: monitor.id, alertType: transition.alert.type }, 'alert email failed');
    }
  }

  const realtimeMonitor = toRealtimeMonitor(transition.monitor);
  emitCheckCompleted(monitor.userId, {
    monitor: realtimeMonitor,
    check: toRealtimeCheck(transition.check),
  });

  if (monitor.currentStatus !== transition.monitor.currentStatus) {
    emitMonitorStatusChanged(monitor.userId, {
      monitorId: monitor.id,
      previousStatus: monitor.currentStatus,
      currentStatus: transition.monitor.currentStatus,
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
