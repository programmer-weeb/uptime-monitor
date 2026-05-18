import { Router, type Request, type Response } from 'express';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../lib/errors.js';
import { urlGuard } from '../lib/urlGuard.js';
import { requireAuth, requireNonDemo } from '../middleware/auth.js';
import { createMonitorLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { removeMonitorSchedule, scheduleMonitorCheck } from '../jobs/queue.js';
import {
  createMonitorSchema,
  patchMonitorSchema,
  monitorIdParamsSchema,
  monitorChecksQuerySchema,
  type CreateMonitorInput,
  type MonitorChecksQuery,
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

function checksQuery(req: Request): MonitorChecksQuery {
  const query = (req as unknown as { validatedQuery?: MonitorChecksQuery }).validatedQuery;
  if (!query) {
    throw new ApiError('VALIDATION', 'Missing checks query');
  }
  return query;
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
  requireNonDemo,
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
    await scheduleMonitorCheck(monitor);
    res.status(201).json(monitor);
  },
);

monitorsRouter.get(
  '/:id/stats',
  validate(monitorIdParamsSchema, 'params'),
  async (req: Request, res: Response) => {
    const id = paramId(req);
    const monitor = await prisma.monitor.findFirst({
      where: { id, userId: req.user!.id },
      select: { id: true },
    });
    if (!monitor) {
      throw new ApiError('NOT_FOUND', 'Monitor not found');
    }

    const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const checks = await prisma.check.findMany({
      where: {
        monitorId: id,
        checkedAt: { gte: windowStart },
      },
      select: {
        status: true,
        latencyMs: true,
        checkedAt: true,
      },
    });

    const totalChecks24h = checks.length;
    const upChecks = checks.filter((check) => check.status === 'up');
    const downChecks = checks.filter((check) => check.status === 'down');
    const lastDownAt = downChecks.reduce<Date | null>(
      (newest, check) => (!newest || check.checkedAt > newest ? check.checkedAt : newest),
      null,
    );

    res.json({
      uptimePct24h:
        totalChecks24h === 0 ? null : Math.round((upChecks.length / totalChecks24h) * 10_000) / 100,
      avgLatencyMs24h:
        upChecks.length === 0
          ? null
          : Math.round(
              upChecks.reduce((sum, check) => sum + check.latencyMs, 0) / upChecks.length,
            ),
      lastDownAt: lastDownAt?.toISOString() ?? null,
      totalChecks24h,
    });
  },
);

monitorsRouter.get(
  '/:id/checks',
  validate(monitorIdParamsSchema, 'params'),
  validate(monitorChecksQuerySchema, 'query'),
  async (req: Request, res: Response) => {
    const id = paramId(req);
    const { limit } = checksQuery(req);
    const monitor = await prisma.monitor.findFirst({
      where: { id, userId: req.user!.id },
      select: { id: true },
    });
    if (!monitor) {
      throw new ApiError('NOT_FOUND', 'Monitor not found');
    }

    const checks = await prisma.check.findMany({
      where: { monitorId: id },
      orderBy: { checkedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        status: true,
        statusCode: true,
        latencyMs: true,
        error: true,
        checkedAt: true,
      },
    });

    res.json(
      checks.map((check) => ({
        ...check,
        checkedAt: check.checkedAt.toISOString(),
      })),
    );
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
  requireNonDemo,
  validate(monitorIdParamsSchema, 'params'),
  validate(patchMonitorSchema),
  async (req: Request, res: Response) => {
    const id = paramId(req);
    const userId = req.user!.id;
    const patch = req.body as PatchMonitorInput;

    const data: Record<string, unknown> = { ...patch };

    // URL change: validate against urlGuard (re-runs the §15.3 blocklist)
    // and reset status fields so a healthy monitor doesn't appear "up"
    // against a brand-new target until the next check lands.
    if (patch.url !== undefined) {
      const existing = await prisma.monitor.findFirst({
        where: { id, userId },
        select: { url: true },
      });
      if (!existing) {
        throw new ApiError('NOT_FOUND', 'Monitor not found');
      }
      if (existing.url !== patch.url) {
        await urlGuard(patch.url);
        data.currentStatus = 'unknown';
        data.consecutiveFailures = 0;
      }
    }

    // Owner-scoped updateMany lets us distinguish "not found" from
    // "exists but belongs to another user" — both collapse to 404 by
    // design (plan: prevent existence enumeration).
    const result = await prisma.monitor.updateMany({
      where: { id, userId },
      data,
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
    await scheduleMonitorCheck(monitor);
    res.json(monitor);
  },
);

monitorsRouter.delete(
  '/:id',
  requireNonDemo,
  validate(monitorIdParamsSchema, 'params'),
  async (req: Request, res: Response) => {
    const id = paramId(req);
    const result = await prisma.monitor.deleteMany({
      where: { id, userId: req.user!.id },
    });
    if (result.count === 0) {
      throw new ApiError('NOT_FOUND', 'Monitor not found');
    }
    await removeMonitorSchedule(id);
    res.status(204).end();
  },
);
