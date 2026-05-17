import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodSchema } from 'zod';
import { ApiError } from '../lib/errors.js';

type Source = 'body' | 'query' | 'params';

export function validate<T>(schema: ZodSchema<T>, source: Source = 'body'): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(new ApiError('VALIDATION', 'Request failed validation', result.error.issues));
      return;
    }
    if (source === 'body') {
      req.body = result.data;
    } else if (source === 'query') {
      (req as unknown as { validatedQuery: T }).validatedQuery = result.data;
    } else {
      (req as unknown as { validatedParams: T }).validatedParams = result.data;
    }
    next();
  };
}
