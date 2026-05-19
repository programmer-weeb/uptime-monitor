import { Router, type Request, type Response } from 'express';
import { prisma } from '../config/prisma.js';
import { redisClient } from '../config/redis.js';
import { env } from '../config/env.js';
import { log } from '../config/log.js';
import { emitTelegramConnected } from '../realtime/socket.js';
import { sendTelegramMessage } from '../services/telegramBot.js';

export const telegramWebhookRouter = Router();

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id: number };
  };
};

telegramWebhookRouter.post('/telegram/webhook', (req: Request, res: Response) => {
  res.sendStatus(200);
  handleUpdate(req.body as TelegramUpdate, req.headers['x-telegram-bot-api-secret-token'] as string | undefined).catch(
    (err) => log.error({ err }, 'telegram webhook handler failed'),
  );
});

async function handleUpdate(update: TelegramUpdate, secretHeader: string | undefined): Promise<void> {
  if (env.TELEGRAM_WEBHOOK_SECRET && secretHeader !== env.TELEGRAM_WEBHOOK_SECRET) {
    log.warn('telegram webhook: invalid secret token, ignoring update');
    return;
  }

  const text = update?.message?.text;
  const chatId = update?.message?.chat?.id;

  if (!text || chatId === undefined) return;
  if (!text.startsWith('/start ')) return;

  const token = text.slice('/start '.length).trim();
  if (!token) return;

  const userId = await redisClient.get(`telegram:link:${token}`);
  if (!userId) {
    await sendTelegramMessage(
      String(chatId),
      '❌ This link has expired. Please generate a new one in the app settings.',
    );
    return;
  }

  await redisClient.del(`telegram:link:${token}`);
  await redisClient.del(`telegram:link:user:${userId}`);

  const chatIdStr = String(chatId);

  await prisma.user.update({
    where: { id: userId },
    data: { telegramChatId: chatIdStr },
  });

  await sendTelegramMessage(chatIdStr, '✅ Telegram alerts connected for your Uptime Monitor account.');

  emitTelegramConnected(userId, chatIdStr);

  log.info({ userId, chatId }, 'telegram account linked');
}
