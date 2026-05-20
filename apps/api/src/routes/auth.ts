import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { ApiError } from '../lib/errors.js';
import { signToken } from '../lib/jwt.js';
import { validate } from '../middleware/validate.js';
import { googleAuthLimiter, loginLimiter, signupLimiter } from '../middleware/rateLimit.js';
import {
  googleAuthSchema,
  signupSchema,
  loginSchema,
  type GoogleAuthInput,
  type SignupInput,
  type LoginInput,
} from '../schemas/auth.js';

const googleClient = new OAuth2Client();

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
      const token = signToken(user.id, user.email, user.isDemo);
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
    if (!user || !user.passwordHash) {
      // Equalize timing whether the user doesn't exist or is Google-only.
      await bcrypt.compare(password, '$2b$04$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali');
      throw new ApiError('UNAUTHORIZED', GENERIC_LOGIN_ERROR);
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new ApiError('UNAUTHORIZED', GENERIC_LOGIN_ERROR);
    }

    const token = signToken(user.id, user.email, user.isDemo);
    res.json({
      token,
      user: { id: user.id, email: user.email, isDemo: user.isDemo },
    });
  },
);

authRouter.post(
  '/google',
  googleAuthLimiter,
  validate(googleAuthSchema),
  async (req: Request, res: Response) => {
    if (!env.GOOGLE_CLIENT_ID) {
      throw new ApiError('INTERNAL', 'Google auth not configured');
    }

    const { credential } = req.body as GoogleAuthInput;

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.sub) {
      throw new ApiError('UNAUTHORIZED', 'Invalid Google credential');
    }

    const email = payload.email.toLowerCase();
    const googleId = payload.sub;

    // 1. Existing Google user — fast path
    let user = await prisma.user.findUnique({
      where: { googleId },
      select: { id: true, email: true, isDemo: true },
    });

    if (!user) {
      // 2. Existing password user with same email → auto-link; new user → create.
      // upsert avoids a race condition where two concurrent sign-ins with the
      // same new email both see no existing row and both attempt create.
      user = await prisma.user.upsert({
        where: { email },
        create: { email, googleId },
        update: { googleId },
        select: { id: true, email: true, isDemo: true },
      });
    }

    const token = signToken(user.id, user.email, user.isDemo);
    res.json({ token, user });
  },
);
