import { env } from '../config/env.js';
import { log } from '../config/log.js';

let cachedUsername: string | null = null;

export async function getBotUsername(): Promise<string> {
  if (cachedUsername) return cachedUsername;
  if (env.TELEGRAM_BOT_USERNAME) {
    cachedUsername = env.TELEGRAM_BOT_USERNAME;
    return cachedUsername;
  }
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN not configured');
  }
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`);
  if (!res.ok) {
    throw new Error(`Telegram getMe failed: ${res.status}`);
  }
  const data = (await res.json()) as { result: { username: string } };
  cachedUsername = data.result.username;
  log.info({ username: cachedUsername }, 'telegram bot username fetched');
  return cachedUsername;
}

export function _resetBotUsernameCache(): void {
  cachedUsername = null;
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) {
    log.warn({ status: res.status }, 'telegram sendMessage failed during account linking');
  }
}

export async function registerWebhook(webhookUrl: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  const body: Record<string, string> = { url: webhookUrl };
  if (env.TELEGRAM_WEBHOOK_SECRET) {
    body.secret_token = env.TELEGRAM_WEBHOOK_SECRET;
  }
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Telegram setWebhook failed: ${res.status}`);
  }
  log.info({ webhookUrl }, 'telegram webhook registered');
}
