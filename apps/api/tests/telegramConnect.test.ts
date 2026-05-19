import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/lib/jwt.js';
import { createUser } from './factories.js';
import './helpers.js';

const { redisMock } = vi.hoisted(() => ({
  redisMock: {
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock('../src/config/redis.js', () => ({
  redisConnection: { url: 'redis://localhost:6379', maxRetriesPerRequest: null },
  redisClient: redisMock,
}));

vi.mock('../src/services/telegramBot.js', () => ({
  getBotUsername: vi.fn().mockResolvedValue('TestUptimeBot'),
  sendTelegramMessage: vi.fn().mockResolvedValue(undefined),
  registerWebhook: vi.fn().mockResolvedValue(undefined),
  _resetBotUsernameCache: vi.fn(),
}));

const app = createApp();
const bearer = (token: string): [string, string] => ['Authorization', `Bearer ${token}`];

describe('POST /api/me/telegram-connect', () => {
  beforeEach(() => {
    redisMock.set.mockClear();
  });

  it('returns token and botUsername', async () => {
    const user = await createUser();
    const res = await request(app)
      .post('/api/me/telegram-connect')
      .set(...bearer(signToken(user.id)));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      token: expect.stringMatching(/^[a-f0-9]{48}$/),
      botUsername: 'TestUptimeBot',
    });
    expect(redisMock.set).toHaveBeenCalledWith(
      expect.stringMatching(/^telegram:link:[a-f0-9]{48}$/),
      user.id,
      'EX',
      600,
    );
  });

  it('each call generates a unique token', async () => {
    const user = await createUser();
    const token = signToken(user.id);
    const [res1, res2] = await Promise.all([
      request(app).post('/api/me/telegram-connect').set(...bearer(token)),
      request(app).post('/api/me/telegram-connect').set(...bearer(token)),
    ]);
    expect(res1.body.token).not.toBe(res2.body.token);
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/me/telegram-connect');
    expect(res.status).toBe(401);
  });

  it('rejects demo accounts', async () => {
    const user = await createUser({ isDemo: true });
    const res = await request(app)
      .post('/api/me/telegram-connect')
      .set(...bearer(signToken(user.id)));
    expect(res.status).toBe(403);
  });
});
