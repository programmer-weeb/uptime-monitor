import twilio, { type Twilio } from 'twilio';
import { env } from '../config/env.js';
import { log } from '../config/log.js';
import type { Alert } from './statusTransition.js';

let client: Twilio | null = null;

const RATE_LIMIT_MS = 60_000;
const lastSentAtByMonitor = new Map<string, number>();

export async function sendAlertWhatsApp(alert: Alert): Promise<void> {
  if (!alert.to.phone) {
    return;
  }

  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_WHATSAPP_FROM) {
    log.warn(
      { alertType: alert.type, monitorId: alert.monitorId },
      'alert whatsapp skipped; twilio env missing',
    );
    return;
  }

  const now = Date.now();
  const last = lastSentAtByMonitor.get(alert.monitorId);
  if (last !== undefined && now - last < RATE_LIMIT_MS) {
    log.warn(
      { monitorId: alert.monitorId, alertType: alert.type, msSinceLast: now - last },
      'alert whatsapp rate-limited',
    );
    return;
  }

  client ??= twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  await client.messages.create({
    from: env.TWILIO_WHATSAPP_FROM,
    to: `whatsapp:${alert.to.phone}`,
    body: bodyFor(alert),
  });
  lastSentAtByMonitor.set(alert.monitorId, now);
}

export function _resetAlertWhatsAppRateLimitForTests(): void {
  lastSentAtByMonitor.clear();
}

function bodyFor(alert: Alert): string {
  const header =
    alert.type === 'down' ? `🔴 DOWN: ${alert.monitorName}` : `✅ RECOVERED: ${alert.monitorName}`;
  const status =
    alert.type === 'down' ? 'Two consecutive checks failed.' : 'The monitor is back up.';
  const errorLine = alert.error ? `\nLast error: ${alert.error}` : '';

  return `${header}\n${status}\nURL: ${alert.monitorUrl}\nChecked at: ${alert.checkedAt.toISOString()}${errorLine}`;
}
