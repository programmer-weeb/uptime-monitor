import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import dns from 'node:dns';
import { createApp } from '../src/app.js';
import { prisma } from './helpers.js';
import { createUser, createMonitor, createCheck } from './factories.js';
import { signToken } from '../src/lib/jwt.js';
import { removeMonitorSchedule, scheduleMonitorCheck } from '../src/jobs/queue.js';
import './helpers.js';

vi.mock('../src/jobs/queue.js', () => ({
  scheduleMonitorCheck: vi.fn().mockResolvedValue(undefined),
  removeMonitorSchedule: vi.fn().mockResolvedValue(undefined),
}));

const app = createApp();
const scheduleMonitorCheckMock = vi.mocked(scheduleMonitorCheck);
const removeMonitorScheduleMock = vi.mocked(removeMonitorSchedule);

const bearer = (token: string): [string, string] => ['Authorization', `Bearer ${token}`];

async function authedUser() {
  const user = await createUser();
  return { user, token: signToken(user.id) };
}

beforeEach(() => {
  scheduleMonitorCheckMock.mockClear();
  removeMonitorScheduleMock.mockClear();
});

describe('GET /api/monitors', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/monitors');
    expect(res.status).toBe(401);
  });

  it('returns only the caller\'s monitors, newest first', async () => {
    const { user: a, token } = await authedUser();
    const { user: b } = await authedUser();

    const older = await createMonitor({ userId: a.id, name: 'older' });
    // Force a clear createdAt gap so ordering is deterministic regardless of clock resolution.
    await prisma.monitor.update({ where: { id: older.id }, data: { createdAt: new Date(Date.now() - 60_000) } });
    const newer = await createMonitor({ userId: a.id, name: 'newer' });
    await createMonitor({ userId: b.id, name: 'other-user' });

    const res = await request(app).get('/api/monitors').set(...bearer(token));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].id).toBe(newer.id);
    expect(res.body[1].id).toBe(older.id);
    // Internal fields must not leak.
    expect(res.body[0]).not.toHaveProperty('consecutiveFailures');
    expect(res.body[0]).not.toHaveProperty('userId');
  });
});

describe('POST /api/monitors', () => {
  it('creates a monitor and returns the public shape', async () => {
    const { token } = await authedUser();
    const res = await request(app)
      .post('/api/monitors')
      .set(...bearer(token))
      .send({ name: 'Example', url: 'https://example.com', intervalMinutes: 5 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Example',
      url: 'https://example.com',
      intervalMinutes: 5,
      isPaused: false,
      currentStatus: 'unknown',
      lastCheckedAt: null,
    });
    expect(res.body.id).toEqual(expect.any(String));
    expect(res.body.createdAt).toEqual(expect.any(String));
    expect(res.body).not.toHaveProperty('consecutiveFailures');
    expect(res.body).not.toHaveProperty('userId');
    expect(scheduleMonitorCheckMock).toHaveBeenCalledTimes(1);
    expect(scheduleMonitorCheckMock).toHaveBeenCalledWith(expect.objectContaining({
      id: res.body.id,
      intervalMinutes: 5,
      isPaused: false,
    }));
    expect(removeMonitorScheduleMock).not.toHaveBeenCalled();
  });

  it('rejects unknown fields (strict schema)', async () => {
    const { token } = await authedUser();
    const res = await request(app)
      .post('/api/monitors')
      .set(...bearer(token))
      .send({ name: 'X', url: 'https://example.com', intervalMinutes: 5, admin: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION');
  });

  it('rejects an unsupported interval', async () => {
    const { token } = await authedUser();
    const res = await request(app)
      .post('/api/monitors')
      .set(...bearer(token))
      .send({ name: 'X', url: 'https://example.com', intervalMinutes: 2 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION');
  });

  it('rejects http:// URLs with 422 URL_BLOCKED', async () => {
    const { token } = await authedUser();
    const res = await request(app)
      .post('/api/monitors')
      .set(...bearer(token))
      .send({ name: 'X', url: 'http://example.com', intervalMinutes: 5 });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('URL_BLOCKED');
  });

  it('rejects http://localhost with 422 URL_BLOCKED', async () => {
    const { token } = await authedUser();
    const res = await request(app)
      .post('/api/monitors')
      .set(...bearer(token))
      .send({ name: 'X', url: 'http://localhost', intervalMinutes: 5 });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('URL_BLOCKED');
  });

  it('rejects https://localhost (loopback resolution) with 422 URL_BLOCKED', async () => {
    const { token } = await authedUser();
    const res = await request(app)
      .post('/api/monitors')
      .set(...bearer(token))
      .send({ name: 'X', url: 'https://localhost', intervalMinutes: 5 });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('URL_BLOCKED');
  });

  it('rejects literal RFC1918 IPv4 hosts', async () => {
    const { token } = await authedUser();
    const res = await request(app)
      .post('/api/monitors')
      .set(...bearer(token))
      .send({ name: 'X', url: 'https://10.0.0.5', intervalMinutes: 5 });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('URL_BLOCKED');
  });

  it('rejects literal IPv6 loopback', async () => {
    const { token } = await authedUser();
    const res = await request(app)
      .post('/api/monitors')
      .set(...bearer(token))
      .send({ name: 'X', url: 'https://[::1]', intervalMinutes: 5 });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('URL_BLOCKED');
  });

  describe('with a mocked DNS resolver', () => {
    let lookupSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      lookupSpy = vi.spyOn(dns.promises, 'lookup');
    });
    afterEach(() => {
      lookupSpy.mockRestore();
    });

    it('rejects a hostname that resolves to the cloud metadata IP (169.254.169.254)', async () => {
      // Simulate a domain like metadata.google.internal resolving to a link-local
      // address — this is the canonical SSRF / cloud-metadata attack.
      lookupSpy.mockResolvedValue([{ address: '169.254.169.254', family: 4 }] as unknown as dns.LookupAddress[]);

      const { token } = await authedUser();
      const res = await request(app)
        .post('/api/monitors')
        .set(...bearer(token))
        .send({ name: 'X', url: 'https://metadata.google.internal', intervalMinutes: 5 });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('URL_BLOCKED');
    });

    it('rejects a hostname that resolves to an IPv4-mapped IPv6 loopback (::ffff:127.0.0.1)', async () => {
      lookupSpy.mockResolvedValue([
        { address: '::ffff:127.0.0.1', family: 6 },
      ] as unknown as dns.LookupAddress[]);

      const { token } = await authedUser();
      const res = await request(app)
        .post('/api/monitors')
        .set(...bearer(token))
        .send({ name: 'X', url: 'https://sneaky.example.com', intervalMinutes: 5 });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('URL_BLOCKED');
    });

    it('accepts a public-IP hostname', async () => {
      lookupSpy.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as unknown as dns.LookupAddress[]);

      const { token } = await authedUser();
      const res = await request(app)
        .post('/api/monitors')
        .set(...bearer(token))
        .send({ name: 'OK', url: 'https://example.com', intervalMinutes: 1 });
      expect(res.status).toBe(201);
    });
  });

  it('enforces the 10-monitor cap with 409 MONITOR_LIMIT_REACHED', async () => {
    const { user, token } = await authedUser();
    for (let i = 0; i < 10; i++) {
      await createMonitor({ userId: user.id, name: `m-${i}` });
    }
    const res = await request(app)
      .post('/api/monitors')
      .set(...bearer(token))
      .send({ name: 'eleventh', url: 'https://example.com', intervalMinutes: 5 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('MONITOR_LIMIT_REACHED');
    expect(scheduleMonitorCheckMock).not.toHaveBeenCalled();

    // Confirms the cap is per-user — a second user can still create.
    const { token: otherToken } = await authedUser();
    const okRes = await request(app)
      .post('/api/monitors')
      .set(...bearer(otherToken))
      .send({ name: 'fresh', url: 'https://example.com', intervalMinutes: 5 });
    expect(okRes.status).toBe(201);
    expect(scheduleMonitorCheckMock).toHaveBeenCalledTimes(1);
    expect(scheduleMonitorCheckMock).toHaveBeenCalledWith(expect.objectContaining({
      id: okRes.body.id,
      intervalMinutes: 5,
      isPaused: false,
    }));
  });

  it('mounts the per-user rate limiter (drops draft-7 RateLimit headers)', async () => {
    const { token } = await authedUser();
    const res = await request(app)
      .post('/api/monitors')
      .set(...bearer(token))
      .send({ name: 'M', url: 'https://example.com', intervalMinutes: 5 });
    expect(res.status).toBe(201);
    // express-rate-limit with standardHeaders: 'draft-7' emits a combined
    // `RateLimit` header plus `RateLimit-Policy`. Presence proves the limiter
    // ran in front of the handler. In test env the *limit* is bumped to 1000
    // so the test never trips RATE_LIMITED itself (see middleware/rateLimit.ts).
    expect(res.headers['ratelimit-policy']).toBeDefined();
    expect(res.headers['ratelimit']).toBeDefined();
  });
});

describe('GET /api/monitors/:id', () => {
  it('returns the monitor for the owner', async () => {
    const { user, token } = await authedUser();
    const m = await createMonitor({ userId: user.id });
    const res = await request(app).get(`/api/monitors/${m.id}`).set(...bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(m.id);
    expect(res.body).not.toHaveProperty('consecutiveFailures');
  });

  it('returns 404 for a non-existent id', async () => {
    const { token } = await authedUser();
    const res = await request(app).get('/api/monitors/does-not-exist').set(...bearer(token));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it("returns 404 (not 403) for another user's monitor — no enumeration", async () => {
    const { user: a } = await authedUser();
    const { token: bToken } = await authedUser();
    const m = await createMonitor({ userId: a.id });
    const res = await request(app).get(`/api/monitors/${m.id}`).set(...bearer(bToken));
    expect(res.status).toBe(404);
  });
});

describe('GET /api/monitors/:id/stats', () => {
  it('returns 24h stats for mixed up and down checks', async () => {
    const { user, token } = await authedUser();
    const m = await createMonitor({ userId: user.id });
    const now = Date.now();
    const newestDownAt = new Date(now - 2_000);

    await createCheck({
      monitorId: m.id,
      status: 'up',
      latencyMs: 100,
      checkedAt: new Date(now - 10_000),
    });
    await createCheck({
      monitorId: m.id,
      status: 'up',
      latencyMs: 101,
      checkedAt: new Date(now - 8_000),
    });
    await createCheck({
      monitorId: m.id,
      status: 'down',
      latencyMs: 1_000,
      checkedAt: newestDownAt,
    });

    const res = await request(app).get(`/api/monitors/${m.id}/stats`).set(...bearer(token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      uptimePct24h: 66.67,
      avgLatencyMs24h: 101,
      lastDownAt: newestDownAt.toISOString(),
      totalChecks24h: 3,
    });
  });

  it('returns null stats and zero count when there are no checks', async () => {
    const { user, token } = await authedUser();
    const m = await createMonitor({ userId: user.id });

    const res = await request(app).get(`/api/monitors/${m.id}/stats`).set(...bearer(token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      uptimePct24h: null,
      avgLatencyMs24h: null,
      lastDownAt: null,
      totalChecks24h: 0,
    });
  });

  it('ignores checks older than 24 hours', async () => {
    const { user, token } = await authedUser();
    const m = await createMonitor({ userId: user.id });
    const now = Date.now();

    await createCheck({
      monitorId: m.id,
      status: 'down',
      latencyMs: 500,
      checkedAt: new Date(now - 25 * 60 * 60 * 1000),
    });
    await createCheck({
      monitorId: m.id,
      status: 'up',
      latencyMs: 80,
      checkedAt: new Date(now - 60_000),
    });

    const res = await request(app).get(`/api/monitors/${m.id}/stats`).set(...bearer(token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      uptimePct24h: 100,
      avgLatencyMs24h: 80,
      lastDownAt: null,
      totalChecks24h: 1,
    });
  });

  it("returns 404 for another user's monitor", async () => {
    const { user: a } = await authedUser();
    const { token: bToken } = await authedUser();
    const m = await createMonitor({ userId: a.id });
    await createCheck({ monitorId: m.id, status: 'up' });

    const res = await request(app).get(`/api/monitors/${m.id}/stats`).set(...bearer(bToken));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 404 for a missing monitor', async () => {
    const { token } = await authedUser();

    const res = await request(app).get('/api/monitors/does-not-exist/stats').set(...bearer(token));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });
});

describe('GET /api/monitors/:id/checks', () => {
  it('returns the owner-scoped recent checks newest first', async () => {
    const { user, token } = await authedUser();
    const m = await createMonitor({ userId: user.id });
    const older = await createCheck({
      monitorId: m.id,
      status: 'down',
      statusCode: 503,
      latencyMs: 900,
      error: '5xx',
      checkedAt: new Date(Date.now() - 30_000),
    });
    const newer = await createCheck({
      monitorId: m.id,
      status: 'up',
      statusCode: 200,
      latencyMs: 120,
      checkedAt: new Date(Date.now() - 10_000),
    });

    const res = await request(app).get(`/api/monitors/${m.id}/checks`).set(...bearer(token));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({
      id: newer.id,
      status: 'up',
      statusCode: 200,
      latencyMs: 120,
      error: null,
      checkedAt: newer.checkedAt.toISOString(),
    });
    expect(res.body[1]).toMatchObject({
      id: older.id,
      status: 'down',
      statusCode: 503,
      latencyMs: 900,
      error: '5xx',
      checkedAt: older.checkedAt.toISOString(),
    });
  });

  it('honors the limit query up to 100 checks', async () => {
    const { user, token } = await authedUser();
    const m = await createMonitor({ userId: user.id });
    for (let i = 0; i < 3; i++) {
      await createCheck({
        monitorId: m.id,
        latencyMs: 100 + i,
        checkedAt: new Date(Date.now() - i * 1_000),
      });
    }

    const res = await request(app)
      .get(`/api/monitors/${m.id}/checks?limit=2`)
      .set(...bearer(token));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].latencyMs).toBe(100);
    expect(res.body[1].latencyMs).toBe(101);
  });

  it('rejects invalid limits', async () => {
    const { user, token } = await authedUser();
    const m = await createMonitor({ userId: user.id });

    const res = await request(app)
      .get(`/api/monitors/${m.id}/checks?limit=101`)
      .set(...bearer(token));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION');
  });

  it("returns 404 for another user's monitor", async () => {
    const { user: a } = await authedUser();
    const { token: bToken } = await authedUser();
    const m = await createMonitor({ userId: a.id });
    await createCheck({ monitorId: m.id, status: 'up' });

    const res = await request(app).get(`/api/monitors/${m.id}/checks`).set(...bearer(bToken));

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });
});

describe('PATCH /api/monitors/:id', () => {
  it('updates name, intervalMinutes, and isPaused', async () => {
    const { user, token } = await authedUser();
    const m = await createMonitor({ userId: user.id });
    const res = await request(app)
      .patch(`/api/monitors/${m.id}`)
      .set(...bearer(token))
      .send({ name: 'Renamed', intervalMinutes: 30, isPaused: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: m.id,
      name: 'Renamed',
      intervalMinutes: 30,
      isPaused: true,
    });
    expect(scheduleMonitorCheckMock).toHaveBeenCalledTimes(1);
    expect(scheduleMonitorCheckMock).toHaveBeenCalledWith(expect.objectContaining({
      id: m.id,
      intervalMinutes: 30,
      isPaused: true,
    }));
    expect(removeMonitorScheduleMock).not.toHaveBeenCalled();
  });

  it('rejects an empty body (at least one field required)', async () => {
    const { user, token } = await authedUser();
    const m = await createMonitor({ userId: user.id });
    const res = await request(app).patch(`/api/monitors/${m.id}`).set(...bearer(token)).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION');
  });

  it('rejects unknown fields (strict)', async () => {
    const { user, token } = await authedUser();
    const m = await createMonitor({ userId: user.id });
    const res = await request(app)
      .patch(`/api/monitors/${m.id}`)
      .set(...bearer(token))
      .send({ admin: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION');
  });

  describe('url edit', () => {
    it('updates the url and resets currentStatus + consecutiveFailures', async () => {
      const { user, token } = await authedUser();
      // Both example.com and example.org are IANA-reserved domains that
      // resolve in real DNS, so urlGuard passes without needing a mock.
      const m = await createMonitor({ userId: user.id, url: 'https://example.com' });
      // Pre-seed a "down-trending" state so we can assert the reset.
      await prisma.monitor.update({
        where: { id: m.id },
        data: { currentStatus: 'down', consecutiveFailures: 3 },
      });

      const res = await request(app)
        .patch(`/api/monitors/${m.id}`)
        .set(...bearer(token))
        .send({ url: 'https://example.org' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: m.id,
        url: 'https://example.org',
        currentStatus: 'unknown',
      });

      const reloaded = await prisma.monitor.findUnique({ where: { id: m.id } });
      expect(reloaded?.url).toBe('https://example.org');
      expect(reloaded?.currentStatus).toBe('unknown');
      expect(reloaded?.consecutiveFailures).toBe(0);
      expect(scheduleMonitorCheckMock).toHaveBeenCalledTimes(1);
    });

    it('does not reset status when the url is unchanged', async () => {
      const { user, token } = await authedUser();
      const m = await createMonitor({ userId: user.id, url: 'https://example.com' });
      await prisma.monitor.update({
        where: { id: m.id },
        data: { currentStatus: 'up', consecutiveFailures: 0 },
      });

      const res = await request(app)
        .patch(`/api/monitors/${m.id}`)
        .set(...bearer(token))
        .send({ url: 'https://example.com', name: 'Renamed' });
      expect(res.status).toBe(200);

      const reloaded = await prisma.monitor.findUnique({ where: { id: m.id } });
      expect(reloaded?.currentStatus).toBe('up');
      expect(reloaded?.name).toBe('Renamed');
    });

    it('rejects a blocked URL with 422 URL_BLOCKED', async () => {
      const { user, token } = await authedUser();
      const m = await createMonitor({ userId: user.id });
      const res = await request(app)
        .patch(`/api/monitors/${m.id}`)
        .set(...bearer(token))
        .send({ url: 'http://localhost' });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('URL_BLOCKED');

      const reloaded = await prisma.monitor.findUnique({ where: { id: m.id } });
      expect(reloaded?.url).toBe(m.url);
      expect(scheduleMonitorCheckMock).not.toHaveBeenCalled();
    });
  });

  it("returns 404 for another user's monitor", async () => {
    const { user: a } = await authedUser();
    const { token: bToken } = await authedUser();
    const m = await createMonitor({ userId: a.id });
    const res = await request(app)
      .patch(`/api/monitors/${m.id}`)
      .set(...bearer(bToken))
      .send({ isPaused: true });
    expect(res.status).toBe(404);

    // And the original row must be unchanged.
    const reloaded = await prisma.monitor.findUnique({ where: { id: m.id } });
    expect(reloaded?.isPaused).toBe(false);
    expect(scheduleMonitorCheckMock).not.toHaveBeenCalled();
    expect(removeMonitorScheduleMock).not.toHaveBeenCalled();
  });

  it('does not schedule when the monitor is not found', async () => {
    const { token } = await authedUser();
    const res = await request(app)
      .patch('/api/monitors/does-not-exist')
      .set(...bearer(token))
      .send({ isPaused: true });
    expect(res.status).toBe(404);
    expect(scheduleMonitorCheckMock).not.toHaveBeenCalled();
    expect(removeMonitorScheduleMock).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/monitors/:id', () => {
  it('returns 204, then GET returns 404', async () => {
    const { user, token } = await authedUser();
    const m = await createMonitor({ userId: user.id });

    const delRes = await request(app).delete(`/api/monitors/${m.id}`).set(...bearer(token));
    expect(delRes.status).toBe(204);
    expect(delRes.body).toEqual({});
    expect(removeMonitorScheduleMock).toHaveBeenCalledTimes(1);
    expect(removeMonitorScheduleMock).toHaveBeenCalledWith(m.id);
    expect(scheduleMonitorCheckMock).not.toHaveBeenCalled();

    const getRes = await request(app).get(`/api/monitors/${m.id}`).set(...bearer(token));
    expect(getRes.status).toBe(404);
  });

  it("returns 404 for another user's monitor and leaves the row intact", async () => {
    const { user: a } = await authedUser();
    const { token: bToken } = await authedUser();
    const m = await createMonitor({ userId: a.id });
    const res = await request(app).delete(`/api/monitors/${m.id}`).set(...bearer(bToken));
    expect(res.status).toBe(404);

    const still = await prisma.monitor.findUnique({ where: { id: m.id } });
    expect(still).not.toBeNull();
    expect(scheduleMonitorCheckMock).not.toHaveBeenCalled();
    expect(removeMonitorScheduleMock).not.toHaveBeenCalled();
  });

  it('does not remove the schedule when the monitor is not found', async () => {
    const { token } = await authedUser();
    const res = await request(app).delete('/api/monitors/does-not-exist').set(...bearer(token));
    expect(res.status).toBe(404);
    expect(scheduleMonitorCheckMock).not.toHaveBeenCalled();
    expect(removeMonitorScheduleMock).not.toHaveBeenCalled();
  });
});

describe('demo account write-gate', () => {
  async function demoUser() {
    const user = await createUser({ isDemo: true });
    return { user, token: signToken(user.id) };
  }

  it('rejects POST /api/monitors with 403 FORBIDDEN', async () => {
    const { token } = await demoUser();
    const res = await request(app)
      .post('/api/monitors')
      .set(...bearer(token))
      .send({ name: 'demo write', url: 'https://example.com', intervalMinutes: 5 });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
    expect(res.body.message).toMatch(/demo/i);
    expect(scheduleMonitorCheckMock).not.toHaveBeenCalled();
  });

  it('rejects PATCH /api/monitors/:id with 403', async () => {
    const { user, token } = await demoUser();
    const m = await createMonitor({ userId: user.id });
    const res = await request(app)
      .patch(`/api/monitors/${m.id}`)
      .set(...bearer(token))
      .send({ name: 'renamed' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');

    const unchanged = await prisma.monitor.findUnique({ where: { id: m.id } });
    expect(unchanged?.name).toBe(m.name);
  });

  it('rejects DELETE /api/monitors/:id with 403', async () => {
    const { user, token } = await demoUser();
    const m = await createMonitor({ userId: user.id });
    const res = await request(app).delete(`/api/monitors/${m.id}`).set(...bearer(token));

    expect(res.status).toBe(403);
    const still = await prisma.monitor.findUnique({ where: { id: m.id } });
    expect(still).not.toBeNull();
    expect(removeMonitorScheduleMock).not.toHaveBeenCalled();
  });

  it('still allows GET /api/monitors and GET /:id for demo users', async () => {
    const { user, token } = await demoUser();
    await createMonitor({ userId: user.id, name: 'demo-monitor' });

    const list = await request(app).get('/api/monitors').set(...bearer(token));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const single = await request(app).get(`/api/monitors/${list.body[0].id}`).set(...bearer(token));
    expect(single.status).toBe(200);
    expect(single.body.name).toBe('demo-monitor');
  });
});
