import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../lib/errors.js';
import { verifyToken } from '../lib/jwt.js';

export type AuthedUser = {
  id: string;
  email: string;
  isDemo: boolean;
};

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthedUser;
  }
}

export const requireAuth: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new ApiError('UNAUTHORIZED', 'Authentication required');
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      throw new ApiError('UNAUTHORIZED', 'Authentication required');
    }

    let claims;
    try {
      claims = verifyToken(token);
    } catch {
      throw new ApiError('UNAUTHORIZED', 'Authentication required');
    }

    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, email: true, isDemo: true },
    });
    if (!user) {
      throw new ApiError('UNAUTHORIZED', 'Authentication required');
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};
