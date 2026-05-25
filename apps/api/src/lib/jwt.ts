import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

type Claims = { sub: string; email: string; isDemo: boolean };

export function signToken(userId: string, email: string, isDemo: boolean): string {
  return jwt.sign({ sub: userId, email, isDemo } satisfies Claims, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_TTL_SECONDS,
  });
}

export function verifyToken(token: string): Claims {
  const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    typeof decoded.sub !== 'string' ||
    typeof decoded.email !== 'string' ||
    typeof decoded.isDemo !== 'boolean'
  ) {
    throw new Error('malformed token payload');
  }
  return { sub: decoded.sub, email: decoded.email, isDemo: decoded.isDemo };
}
