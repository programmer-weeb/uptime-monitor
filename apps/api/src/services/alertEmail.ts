import { Resend } from 'resend';
import { env } from '../config/env.js';
import { log } from '../config/log.js';
import { redisClient } from '../config/redis.js';
import type { Alert } from './statusTransition.js';

let resend: Resend | null = null;

const RATE_LIMIT_SECS = 60;

export async function sendAlertEmail(alert: Alert): Promise<void> {
  const key = `alert:rate:email:${alert.monitorId}`;
  const acquired = await redisClient.set(key, '1', 'EX', RATE_LIMIT_SECS, 'NX');
  if (acquired === null) {
    log.warn(
      { monitorId: alert.monitorId, alertType: alert.type },
      'alert email rate-limited',
    );
    return;
  }

  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    log.warn(
      { alertType: alert.type, to: alert.to.email },
      'alert email skipped; email env missing',
    );
    return;
  }

  resend ??= new Resend(env.RESEND_API_KEY);
  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: alert.to.email,
    subject: subjectFor(alert),
    html: htmlFor(alert),
  });
}

export async function _resetAlertEmailRateLimitForTests(): Promise<void> {
  const keys = await redisClient.keys('alert:rate:email:*');
  if (keys.length > 0) await redisClient.del(...keys);
}

function subjectFor(alert: Alert): string {
  return alert.type === 'down'
    ? `Down alert: ${alert.monitorName}`
    : `Recovery alert: ${alert.monitorName}`;
}

function htmlFor(alert: Alert): string {
  const statusText =
    alert.type === 'down'
      ? 'Your monitor has failed two consecutive checks.'
      : 'Your monitor has recovered.';
  const error = alert.error ? `<p><strong>Last error:</strong> ${escapeHtml(alert.error)}</p>` : '';

  return `
    <h1>${escapeHtml(subjectFor(alert))}</h1>
    <p>${statusText}</p>
    <p><strong>Monitor:</strong> ${escapeHtml(alert.monitorName)}</p>
    <p><strong>URL:</strong> <a href="${escapeHtml(alert.monitorUrl)}">${escapeHtml(alert.monitorUrl)}</a></p>
    <p><strong>Checked at:</strong> ${alert.checkedAt.toISOString()}</p>
    ${error}
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
