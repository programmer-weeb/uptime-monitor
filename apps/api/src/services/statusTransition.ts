import type { AlertType, Monitor, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import type { CheckResult } from './checkRunner.js';

type DbClient = Prisma.TransactionClient;

export type AlertEmail = {
  type: AlertType;
  monitorId: string;
  to: string;
  monitorName: string;
  monitorUrl: string;
  checkedAt: Date;
  error: string | null;
};

export type CheckTransitionResult = {
  check: {
    id: string;
    monitorId: string;
    status: 'up' | 'down';
    statusCode: number | null;
    latencyMs: number;
    error: string | null;
    checkedAt: Date;
  };
  monitor: Monitor;
  alert: AlertEmail | null;
};

type MonitorWithUser = Monitor & {
  user: {
    email: string;
  };
};

export async function recordCheckTransition(params: {
  monitor: MonitorWithUser;
  result: CheckResult;
  checkedAt: Date;
}): Promise<CheckTransitionResult> {
  return prisma.$transaction((tx) => writeCheckTransition(tx, params));
}

export async function writeCheckTransition(
  tx: DbClient,
  {
    monitor,
    result,
    checkedAt,
  }: {
    monitor: MonitorWithUser;
    result: CheckResult;
    checkedAt: Date;
  },
): Promise<CheckTransitionResult> {
  const check = await tx.check.create({
    data: {
      monitorId: monitor.id,
      status: result.status,
      statusCode: result.statusCode,
      latencyMs: result.latencyMs,
      error: result.error,
      checkedAt,
    },
  });

  const nextFailures = result.status === 'down' ? monitor.consecutiveFailures + 1 : 0;
  const shouldSendDownAlert =
    result.status === 'down' && nextFailures === 2 && monitor.currentStatus !== 'down';
  const shouldSendRecoveryAlert = result.status === 'up' && monitor.currentStatus === 'down';
  const nextStatus =
    result.status === 'up' ? 'up' : shouldSendDownAlert ? 'down' : monitor.currentStatus;

  const updatedMonitor = await tx.monitor.update({
    where: { id: monitor.id },
    data: {
      currentStatus: nextStatus,
      lastCheckedAt: checkedAt,
      consecutiveFailures: nextFailures,
    },
  });

  const alertType = shouldSendDownAlert ? 'down' : shouldSendRecoveryAlert ? 'recovery' : null;
  if (!alertType) {
    return { check, monitor: updatedMonitor, alert: null };
  }

  await tx.alertEvent.create({
    data: {
      monitorId: monitor.id,
      type: alertType,
      sentAt: checkedAt,
    },
  });

  return {
    check,
    monitor: updatedMonitor,
    alert: {
      type: alertType,
      monitorId: monitor.id,
      to: monitor.user.email,
      monitorName: monitor.name,
      monitorUrl: monitor.url,
      checkedAt,
      error: result.error,
    },
  };
}
