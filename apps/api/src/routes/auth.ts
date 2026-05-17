import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { ApiError } from '../lib/errors.js';
import { signToken } from '../lib/jwt.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { loginLimiter, signupLimiter } from '../middleware/rateLimit.js';
import { signupSchema, loginSchema, type SignupInput, type LoginInput } from '../schemas/auth.js';

const BCRYPT_COST = env.NODE_ENV === 'test' ? 4 : 12;
const GENERIC_LOGIN_ERROR = 'Invalid email or password';

export const authRouter = Router();

authRouter.post(
  '/signup',
  signupLimiter,
  validate(signupSchema),
  async (req: Request, res: Response) => {
    const { email, password } = req.body as SignupInput;
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    try {
      const user = await prisma.user.create({
        data: { email, passwordHash },
        select: { id: true, email: true, isDemo: true },
      });
      const token = signToken(user.id);
      res.status(201).json({ token, user });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ApiError('CONFLICT', 'EMAIL_TAKEN');
      }
      throw err;
    }
  },
);

authRouter.post(
  '/login',
  loginLimiter,
  validate(loginSchema),
  async (req: Request, res: Response) => {
    const { email, password } = req.body as LoginInput;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, isDemo: true, passwordHash: true },
    });
    if (!user) {
      // Equalize timing against the password compare branch.
      await bcrypt.compare(password, '$2b$04$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali');
      throw new ApiError('UNAUTHORIZED', GENERIC_LOGIN_ERROR);
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new ApiError('UNAUTHORIZED', GENERIC_LOGIN_ERROR);
    }

    const token = signToken(user.id);
    res.json({
      token,
      user: { id: user.id, email: user.email, isDemo: user.isDemo },
    });
  },
);

authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json(req.user);
});
