import { randomBytes } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { redisClient } from '../config/redis.js';
import { ApiError } from '../lib/errors.js';
import { requireAuth, requireNonDemo } from '../middleware/auth.js';
import { telegramConnectLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { getBotUsername } from '../services/telegramBot.js';

const TELEGRAM_CHAT_ID_RE = /^-?\d+$/;

const patchMeSchema = z
  .object({
    telegramChatId: z
      .string()
      .regex(TELEGRAM_CHAT_ID_RE, 'telegramChatId must be a number, e.g. 123456789')
      .nullable(),
  })
  .strict();

export const accountRouter = Router();

accountRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, telegramChatId: true, isDemo: true, createdAt: true },
  });

  if (!user) {
    throw new ApiError('UNAUTHORIZED', 'Authentication required');
  }

  res.json(user);
});

accountRouter.patch('/me', requireAuth, requireNonDemo, validate(patchMeSchema), async (req: Request, res: Response) => {
  const { telegramChatId } = req.body as z.infer<typeof patchMeSchema>;
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { telegramChatId },
    select: { id: true, email: true, telegramChatId: true, isDemo: true, createdAt: true },
  });

  res.json(user);
});

accountRouter.post('/me/telegram-connect', requireAuth, requireNonDemo, telegramConnectLimiter, async (req: Request, res: Response) => {
  const token = randomBytes(24).toString('hex');

  const prevToken = await redisClient.get(`telegram:link:user:${req.user!.id}`);
  if (prevToken) {
    await redisClient.del(`telegram:link:${prevToken}`);
  }

  await redisClient.set(`telegram:link:${token}`, req.user!.id, 'EX', 600);
  await redisClient.set(`telegram:link:user:${req.user!.id}`, token, 'EX', 600);

  const botUsername = await getBotUsername();
  res.json({ token, botUsername });
});
