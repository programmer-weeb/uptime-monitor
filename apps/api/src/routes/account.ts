import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../lib/errors.js';
import { requireAuth, requireNonDemo } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const E164 = /^\+[1-9]\d{6,14}$/;

const patchMeSchema = z
  .object({
    phone: z.string().regex(E164, 'phone must be E.164, e.g. +14155551212').nullable(),
  })
  .strict();

export const accountRouter = Router();

accountRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, phone: true, isDemo: true, createdAt: true },
  });

  if (!user) {
    throw new ApiError('UNAUTHORIZED', 'Authentication required');
  }

  res.json(user);
});

accountRouter.patch('/me', requireAuth, requireNonDemo, validate(patchMeSchema), async (req: Request, res: Response) => {
  const { phone } = req.body as z.infer<typeof patchMeSchema>;
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { phone },
    select: { id: true, email: true, phone: true, isDemo: true, createdAt: true },
  });

  res.json(user);
});
