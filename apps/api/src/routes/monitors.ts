import { Router, type Request, type Response } from 'express';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../lib/errors.js';
import { urlGuard } from '../lib/urlGuard.js';
import { requireAuth } from '../middleware/auth.js';
import { createMonitorLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import {
  createMonitorSchema,
  patchMonitorSchema,
  monitorIdParamsSchema,
  type CreateMonitorInput,
  type PatchMonitorInput,
} from '../schemas/monitors.js';

// `validate(schema, 'params')` parks the parsed value on `req.validatedParams`
// (see middleware/validate.ts). Express 5 widens `req.params[k]` to
// `string | string[]`, so reading from the validated bag keeps the route
// strongly typed and skips redundant guards.
function paramId(req: Request): string {
  const params = (req as unknown as { validatedParams?: { id: string } }).validatedParams;
  if (!params) {
    throw new ApiError('VALIDATION', 'Missing :id param');
  }
  return params.id;
}

const MAX_MONITORS_PER_USER = 10;

// `select` shape returned to clients — never include `consecutiveFailures`,
// `passwordHash`, or other internal fields (plan §6 Monitor shape).
const MONITOR_SELECT = {
  id: true,
  name: true,
  url: true,
  intervalMinutes: true,
  isPaused: true,
  currentStatus: true,
  lastCheckedAt: true,
  createdAt: true,
} as const;

export const monitorsRouter = Router();

monitorsRouter.use(requireAuth);

monitorsRouter.get('/', async (req: Request, res: Response) => {
  const monitors = await prisma.monitor.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    select: MONITOR_SELECT,
  });
  res.json(monitors);
});

monitorsRouter.post(
  '/',
  createMonitorLimiter,
  validate(createMonitorSchema),
  async (req: Request, res: Response) => {
    const { name, url, intervalMinutes } = req.body as CreateMonitorInput;
    const userId = req.user!.id;

    // Count first so we never hit the DB to validate an external URL just to
    // bounce on the cap. 409 per §6.
    const existing = await prisma.monitor.count({ where: { userId } });
    if (existing >= MAX_MONITORS_PER_USER) {
      throw new ApiError(
        'MONITOR_LIMIT_REACHED',
        `Monitor limit reached (max ${MAX_MONITORS_PER_USER} per user)`,
      );
    }

    // urlGuard throws ApiError('URL_BLOCKED', …) on any §15.3 violation.
    // Runs before insert so we never persist a forbidden URL.
    await urlGuard(url);

    const monitor = await prisma.monitor.create({
      data: { userId, name, url, intervalMinutes },
      select: MONITOR_SELECT,
    });
    res.status(201).json(monitor);
  },
);

monitorsRouter.get(
  '/:id',
  validate(monitorIdParamsSchema, 'params'),
  async (req: Request, res: Response) => {
    const monitor = await prisma.monitor.findFirst({
      where: { id: paramId(req), userId: req.user!.id },
      select: MONITOR_SELECT,
    });
    if (!monitor) {
      throw new ApiError('NOT_FOUND', 'Monitor not found');
    }
    res.json(monitor);
  },
);

monitorsRouter.patch(
  '/:id',
  validate(monitorIdParamsSchema, 'params'),
  validate(patchMonitorSchema),
  async (req: Request, res: Response) => {
    const id = paramId(req);
    const userId = req.user!.id;
    const patch = req.body as PatchMonitorInput;

    // Owner-scoped updateMany lets us distinguish "not found" from
    // "exists but belongs to another user" — both collapse to 404 by
    // design (plan: prevent existence enumeration).
    const result = await prisma.monitor.updateMany({
      where: { id, userId },
      data: patch,
    });
    if (result.count === 0) {
      throw new ApiError('NOT_FOUND', 'Monitor not found');
    }

    const monitor = await prisma.monitor.findUnique({
      where: { id },
      select: MONITOR_SELECT,
    });
    if (!monitor) {
      // Should be unreachable: we just updated the row inside the same request.
      throw new ApiError('NOT_FOUND', 'Monitor not found');
    }
    res.json(monitor);
  },
);

monitorsRouter.delete(
  '/:id',
  validate(monitorIdParamsSchema, 'params'),
  async (req: Request, res: Response) => {
    const result = await prisma.monitor.deleteMany({
      where: { id: paramId(req), userId: req.user!.id },
    });
    if (result.count === 0) {
      throw new ApiError('NOT_FOUND', 'Monitor not found');
    }
    res.status(204).end();
  },
);
