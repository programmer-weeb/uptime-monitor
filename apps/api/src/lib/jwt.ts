import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

type Claims = { sub: string };

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies Claims, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_TTL_SECONDS,
  });
}

export function verifyToken(token: string): Claims {
  const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
  if (typeof decoded !== 'object' || decoded === null || typeof decoded.sub !== 'string') {
    throw new Error('malformed token payload');
  }
  return { sub: decoded.sub };
}
