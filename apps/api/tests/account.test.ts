import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from './helpers.js';
import { createUser } from './factories.js';
import { signToken } from '../src/lib/jwt.js';
import './helpers.js';

const app = createApp();

const bearer = (token: string): [string, string] => ['Authorization', `Bearer ${token}`];

describe('GET /api/me', () => {
  it('returns the authenticated user profile including telegramChatId', async () => {
    const user = await createUser({ telegramChatId: '123456789' });
    const res = await request(app).get('/api/me').set(...bearer(signToken(user.id)));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: user.id,
      email: user.email,
      telegramChatId: '123456789',
      isDemo: false,
    });
    expect(res.body.createdAt).toEqual(expect.any(String));
  });
});

describe('PATCH /api/me', () => {
  it('updates the telegram chat ID', async () => {
    const user = await createUser();
    const token = signToken(user.id);

    const res = await request(app)
      .patch('/api/me')
      .set(...bearer(token))
      .send({ telegramChatId: '987654321' });

    expect(res.status).toBe(200);
    expect(res.body.telegramChatId).toBe('987654321');

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.telegramChatId).toBe('987654321');
  });

  it('clears the telegram chat ID when set to null', async () => {
    const user = await createUser({ telegramChatId: '123456789' });
    const token = signToken(user.id);

    const res = await request(app)
      .patch('/api/me')
      .set(...bearer(token))
      .send({ telegramChatId: null });

    expect(res.status).toBe(200);
    expect(res.body.telegramChatId).toBeNull();
  });

  it('rejects invalid telegram chat IDs with validation', async () => {
    const user = await createUser();
    const token = signToken(user.id);

    const res = await request(app)
      .patch('/api/me')
      .set(...bearer(token))
      .send({ telegramChatId: 'not-a-number' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION');
  });
});
