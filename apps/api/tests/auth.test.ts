import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from './helpers.js';
import { createUser } from './factories.js';
import { signToken } from '../src/lib/jwt.js';
import './helpers.js';

const app = createApp();

describe('POST /api/auth/signup', () => {
  it('creates a user, returns a JWT, and persists the lowercased email', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'Newbie@Example.COM', password: 'hunter2hunter2' });

    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: 'newbie@example.com', isDemo: false });
    expect(res.body.user.id).toEqual(expect.any(String));

    const stored = await prisma.user.findUnique({ where: { email: 'newbie@example.com' } });
    expect(stored).not.toBeNull();
    expect(stored?.passwordHash).not.toContain('hunter2');
  });

  it('rejects duplicate email with 409 EMAIL_TAKEN', async () => {
    await createUser({ email: 'dup@example.com' });
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'dup@example.com', password: 'password1234' });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'CONFLICT', message: 'EMAIL_TAKEN' });
  });

  it('rejects short passwords with 400 VALIDATION', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'short@example.com', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION');
  });

  it('rejects unknown fields (strict schema)', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'x@example.com', password: 'password1234', admin: true });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION');
  });
});

describe('POST /api/auth/login', () => {
  it('returns a token for the right password', async () => {
    await createUser({ email: 'login@example.com', password: 'rightpass1234' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'rightpass1234' });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.email).toBe('login@example.com');
  });

  it('returns 401 with a generic message for the wrong password', async () => {
    await createUser({ email: 'login2@example.com', password: 'rightpass1234' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login2@example.com', password: 'WRONGpass1234' });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'UNAUTHORIZED' });
    expect(res.body.message).toBe('Invalid email or password');
  });

  it('returns 401 (not 404) for an unknown email — no enumeration', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'doesnotmatter1' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });

  it('returns 401 with a malformed token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not-a-real-jwt');
    expect(res.status).toBe(401);
  });

  it('returns 401 if the user behind a valid token no longer exists', async () => {
    const orphan = signToken('clx0000000000000000000000');
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${orphan}`);
    expect(res.status).toBe(401);
  });

  it('returns the user when given a valid token', async () => {
    const user = await createUser({ email: 'me@example.com' });
    const token = signToken(user.id);
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: user.id, email: 'me@example.com', isDemo: false });
  });
});
