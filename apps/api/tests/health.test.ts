import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET ??= 'test-secret-at-least-32-characters-long-yes';
  process.env.DATABASE_URL ??= 'postgresql://uptime:uptime@localhost:5433/uptime_test';
  process.env.REDIS_URL ??= 'redis://localhost:6379';
});

describe('GET /health', () => {
  it('returns { ok: true }', async () => {
    const { createApp } = await import('../src/app.js');
    const app: Express = createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
