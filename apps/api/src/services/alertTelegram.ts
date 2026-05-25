import { env } from '../config/env.js';
import { log } from '../config/log.js';
import { redisClient } from '../config/redis.js';
import type { Alert } from './statusTransition.js';

const RATE_LIMIT_SECS = 60;

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

  const key = `alert:rate:telegram:${alert.monitorId}`;
  const acquired = await redisClient.set(key, '1', 'EX', RATE_LIMIT_SECS, 'NX');
  if (acquired === null) {
    log.warn(
      { monitorId: alert.monitorId, alertType: alert.type },
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
}

export async function _resetAlertTelegramRateLimitForTests(): Promise<void> {
  const keys = await redisClient.keys('alert:rate:telegram:*');
  if (keys.length > 0) await redisClient.del(...keys);
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
