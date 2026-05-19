import { env } from '../config/env.js';
import { log } from '../config/log.js';
import type { Alert } from './statusTransition.js';

const RATE_LIMIT_MS = 60_000;
const lastSentAtByMonitor = new Map<string, number>();

export async function sendAlertTelegram(alert: Alert): Promise<void> {
  if (!alert.to.telegramChatId) {
    return;
  }

  if (!env.TELEGRAM_BOT_TOKEN) {
    log.warn(
      { alertType: alert.type, monitorId: alert.monitorId },
      'alert telegram skipped; TELEGRAM_BOT_TOKEN env missing',
    );
    return;
  }

  const now = Date.now();
  const last = lastSentAtByMonitor.get(alert.monitorId);
  if (last !== undefined && now - last < RATE_LIMIT_MS) {
    log.warn(
      { monitorId: alert.monitorId, alertType: alert.type, msSinceLast: now - last },
      'alert telegram rate-limited',
    );
    return;
  }

  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: alert.to.telegramChatId,
      text: bodyFor(alert),
      parse_mode: 'HTML',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Telegram sendMessage failed: ${response.status} ${text}`);
  }

  lastSentAtByMonitor.set(alert.monitorId, now);
}

export function _resetAlertTelegramRateLimitForTests(): void {
  lastSentAtByMonitor.clear();
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function bodyFor(alert: Alert): string {
  const header =
    alert.type === 'down'
      ? `🔴 <b>DOWN: ${escapeHtml(alert.monitorName)}</b>`
      : `✅ <b>RECOVERED: ${escapeHtml(alert.monitorName)}</b>`;
  const status =
    alert.type === 'down' ? 'Two consecutive checks failed.' : 'The monitor is back up.';
  const errorLine = alert.error ? `\nLast error: ${escapeHtml(alert.error)}` : '';
  return `${header}\n${status}\nURL: ${escapeHtml(alert.monitorUrl)}\nChecked at: ${alert.checkedAt.toISOString()}${errorLine}`;
}
