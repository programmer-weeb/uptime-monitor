import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createUser } from './factories.js';
import { prisma } from './helpers.js';
import './helpers.js';

const { redisMock, sendTelegramMessageMock, emitTelegramConnectedMock } = vi.hoisted(() => ({
  redisMock: {
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn<() => Promise<string | null>>(),
    del: vi.fn().mockResolvedValue(1),
  },
  sendTelegramMessageMock: vi.fn().mockResolvedValue(undefined),
  emitTelegramConnectedMock: vi.fn(),
}));

vi.mock('../src/config/redis.js', () => ({
  redisConnection: { url: 'redis://localhost:6379', maxRetriesPerRequest: null },
  redisClient: redisMock,
}));

vi.mock('../src/config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    LOG_LEVEL: 'warn',
    TELEGRAM_WEBHOOK_SECRET: 'test-webhook-secret',
  },
  corsOrigins: ['http://localhost:5173'],
}));

vi.mock('../src/services/telegramBot.js', () => ({
  getBotUsername: vi.fn().mockResolvedValue('TestUptimeBot'),
  sendTelegramMessage: sendTelegramMessageMock,
  registerWebhook: vi.fn().mockResolvedValue(undefined),
  _resetBotUsernameCache: vi.fn(),
}));

vi.mock('../src/realtime/socket.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/realtime/socket.js')>();
  return { ...original, emitTelegramConnected: emitTelegramConnectedMock };
});

const app = createApp();

function post(body: unknown) {
  return request(app)
    .post('/api/telegram/webhook')
    .set('x-telegram-bot-api-secret-token', 'test-webhook-secret')
    .send(body);
}

describe('POST /api/telegram/webhook', () => {
  beforeEach(() => {
    sendTelegramMessageMock.mockClear();
    emitTelegramConnectedMock.mockClear();
    redisMock.get.mockReset();
    redisMock.del.mockClear();
  });

  it('links account when /start token is valid', async () => {
    const user = await createUser();
    redisMock.get.mockResolvedValue(user.id);

    const res = await post({
      message: { text: '/start abc123token', chat: { id: 987654321 } },
    });

    expect(res.status).toBe(200);

    // Wait briefly for async handler to finish (fire-and-forget pattern)
    await new Promise((r) => setTimeout(r, 100));

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.telegramChatId).toBe('987654321');

    expect(redisMock.get).toHaveBeenCalledWith('telegram:link:abc123token');
    expect(redisMock.del).toHaveBeenCalledWith('telegram:link:abc123token');
    expect(sendTelegramMessageMock).toHaveBeenCalledWith('987654321', expect.stringContaining('connected'));
    expect(emitTelegramConnectedMock).toHaveBeenCalledWith(user.id, '987654321');
  });

  it('sends expired message when token not in Redis', async () => {
    redisMock.get.mockResolvedValue(null);

    const res = await post({
      message: { text: '/start expiredtoken', chat: { id: 111222333 } },
    });

    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 100));

    expect(sendTelegramMessageMock).toHaveBeenCalledWith(
      '111222333',
      expect.stringContaining('expired'),
    );
    expect(emitTelegramConnectedMock).not.toHaveBeenCalled();
  });

  it('ignores non-/start messages', async () => {
    const res = await post({ message: { text: 'hello', chat: { id: 111222333 } } });

    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 50));

    expect(redisMock.get).not.toHaveBeenCalled();
    expect(sendTelegramMessageMock).not.toHaveBeenCalled();
  });

  it('ignores /start with no token', async () => {
    const res = await post({ message: { text: '/start ', chat: { id: 111222333 } } });

    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 50));

    expect(redisMock.get).not.toHaveBeenCalled();
  });

  it('ignores updates without a message field', async () => {
    const res = await post({ poll: { id: '123' } });

    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 50));

    expect(redisMock.get).not.toHaveBeenCalled();
  });
});
