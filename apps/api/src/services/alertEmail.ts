import { Resend } from 'resend';
import { env } from '../config/env.js';
import { log } from '../config/log.js';
import type { AlertEmail } from './statusTransition.js';

let resend: Resend | null = null;

// Per plan §16.11: backstop on top of the 2-failure debounce. A flapping
// monitor that bounces up/down inside a minute could otherwise spam alerts.
// In-memory by design — Resend has no per-monitor rate-limit primitive and
// this is a single-instance worker (§4); resets on restart, which is fine.
const RATE_LIMIT_MS = 60_000;
const lastSentAtByMonitor = new Map<string, number>();

export async function sendAlertEmail(alert: AlertEmail): Promise<void> {
  const now = Date.now();
  const last = lastSentAtByMonitor.get(alert.monitorId);
  if (last !== undefined && now - last < RATE_LIMIT_MS) {
    log.warn(
      { monitorId: alert.monitorId, alertType: alert.type, msSinceLast: now - last },
      'alert email rate-limited',
    );
    return;
  }

  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    log.warn({ alertType: alert.type, to: alert.to }, 'alert email skipped; email env missing');
    return;
  }

  resend ??= new Resend(env.RESEND_API_KEY);
  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: alert.to,
    subject: subjectFor(alert),
    html: htmlFor(alert),
  });
  lastSentAtByMonitor.set(alert.monitorId, now);
}

export function _resetAlertEmailRateLimitForTests(): void {
  lastSentAtByMonitor.clear();
}

function subjectFor(alert: AlertEmail): string {
  return alert.type === 'down'
    ? `Down alert: ${alert.monitorName}`
    : `Recovery alert: ${alert.monitorName}`;
}

function htmlFor(alert: AlertEmail): string {
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
