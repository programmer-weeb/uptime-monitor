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
  it('returns the authenticated user profile including phone', async () => {
    const user = await createUser({ phone: '+14155551212' });
    const res = await request(app).get('/api/me').set(...bearer(signToken(user.id)));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: user.id,
      email: user.email,
      phone: '+14155551212',
      isDemo: false,
    });
    expect(res.body.createdAt).toEqual(expect.any(String));
  });
});

describe('PATCH /api/me', () => {
  it('updates the phone number', async () => {
    const user = await createUser();
    const token = signToken(user.id);

    const res = await request(app)
      .patch('/api/me')
      .set(...bearer(token))
      .send({ phone: '+14155559999' });

    expect(res.status).toBe(200);
    expect(res.body.phone).toBe('+14155559999');

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.phone).toBe('+14155559999');
  });

  it('clears the phone number when set to null', async () => {
    const user = await createUser({ phone: '+14155551212' });
    const token = signToken(user.id);

    const res = await request(app)
      .patch('/api/me')
      .set(...bearer(token))
      .send({ phone: null });

    expect(res.status).toBe(200);
    expect(res.body.phone).toBeNull();
  });

  it('rejects invalid phone numbers with validation', async () => {
    const user = await createUser();
    const token = signToken(user.id);

    const res = await request(app)
      .patch('/api/me')
      .set(...bearer(token))
      .send({ phone: '12345' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION');
  });
});
