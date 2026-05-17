import { Resend } from 'resend';
import { env } from '../config/env.js';
import { log } from '../config/log.js';
import type { AlertEmail } from './statusTransition.js';

let resend: Resend | null = null;

export async function sendAlertEmail(alert: AlertEmail): Promise<void> {
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
