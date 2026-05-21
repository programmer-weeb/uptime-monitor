import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from './helpers.js';
import { createUser } from './factories.js';

// ── Redis mock ──────────────────────────────────────────────────────────────
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

// ── Email mock ───────────────────────────────────────────────────────────────
const { sendPasswordResetEmailMock } = vi.hoisted(() => ({
  sendPasswordResetEmailMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/services/passwordResetEmail.js', () => ({
  sendPasswordResetEmail: sendPasswordResetEmailMock,
}));

const app = createApp();

const ALWAYS_OK_MSG = 'If that email is registered, a reset link has been sent.';

describe('POST /api/auth/forgot-password', () => {
  beforeEach(() => {
    redisMock.set.mockClear();
    redisMock.get.mockClear();
    redisMock.del.mockClear();
    sendPasswordResetEmailMock.mockClear();
  });

  it('returns 200 with the generic message for a known password user', async () => {
    await createUser({ email: 'reset@example.com' });

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'reset@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe(ALWAYS_OK_MSG);
  });

  it('sets two Redis keys with EX 900 for a known password user', async () => {
    const user = await createUser({ email: 'redis@example.com' });

    await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'redis@example.com' });

    // Extract the generated token from the set calls
    const tokenCall = redisMock.set.mock.calls.find(
      ([key]: string[]) => key.startsWith('reset:token:'),
    );
    expect(tokenCall).toBeDefined();
    const token = (tokenCall![0] as string).replace('reset:token:', '');
    expect(token).toMatch(/^[a-f0-9]{48}$/);

    expect(redisMock.set).toHaveBeenCalledWith(`reset:token:${token}`, user.id, 'EX', 900);
    expect(redisMock.set).toHaveBeenCalledWith(`reset:user:${user.id}`, token, 'EX', 900);
  });

  it('calls sendPasswordResetEmail with the user email and correct URL pattern', async () => {
    await createUser({ email: 'email@example.com' });

    await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'email@example.com' });

    expect(sendPasswordResetEmailMock).toHaveBeenCalledTimes(1);
    const [toArg, urlArg] = sendPasswordResetEmailMock.mock.calls[0] as [string, string];
    expect(toArg).toBe('email@example.com');
    expect(urlArg).toMatch(
      /^http:\/\/localhost:5173\/reset-password\?token=[a-f0-9]{48}$/,
    );
  });

  it('returns 200 with the same message for an unknown email — no enumeration', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'ghost@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe(ALWAYS_OK_MSG);
    expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('returns 200 with the same message for a Google-only account — no enumeration', async () => {
    // Google-only users have no passwordHash
    await prisma.user.create({
      data: { email: 'google@example.com', googleId: 'google-id-123' },
    });

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'google@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe(ALWAYS_OK_MSG);
    expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('invalidates a previous token when a new one is requested', async () => {
    await createUser({ email: 'repeat@example.com' });
    const prevToken = 'a'.repeat(48);

    // Simulate a previous token existing
    redisMock.get.mockResolvedValueOnce(prevToken);

    await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'repeat@example.com' });

    // Should DEL the old token key
    expect(redisMock.del).toHaveBeenCalledWith(`reset:token:${prevToken}`);
  });

  it('returns 400 VALIDATION for an invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION');
  });
});

describe('POST /api/auth/reset-password', () => {
  beforeEach(() => {
    redisMock.get.mockClear();
    redisMock.set.mockClear();
    redisMock.del.mockClear();
  });

  it('returns 200 and updates the password for a valid token', async () => {
    const user = await createUser({ email: 'newpass@example.com', password: 'oldpassword1' });
    redisMock.get.mockResolvedValueOnce(user.id);

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'a'.repeat(48), password: 'newpassword99' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Password updated.');
  });

  it('new password is persisted — user can log in with it', async () => {
    const user = await createUser({ email: 'verify@example.com', password: 'oldpassword1' });
    redisMock.get.mockResolvedValueOnce(user.id);

    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'b'.repeat(48), password: 'brandnewpass1' });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'verify@example.com', password: 'brandnewpass1' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toEqual(expect.any(String));
  });

  it('old password no longer works after reset', async () => {
    const user = await createUser({ email: 'oldpass@example.com', password: 'oldpassword1' });
    redisMock.get.mockResolvedValueOnce(user.id);

    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'c'.repeat(48), password: 'completelynew1' });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'oldpass@example.com', password: 'oldpassword1' });

    expect(loginRes.status).toBe(401);
  });

  it('DELs both Redis keys after a successful reset (single-use)', async () => {
    const user = await createUser({ email: 'singleuse@example.com' });
    const token = 'd'.repeat(48);
    redisMock.get.mockResolvedValueOnce(user.id);

    await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'freshpassword1' });

    expect(redisMock.del).toHaveBeenCalledWith(
      `reset:token:${token}`,
      `reset:user:${user.id}`,
    );
  });

  it('returns 400 INVALID_RESET_TOKEN for an unknown or expired token', async () => {
    // redisMock.get returns null by default (token not found)
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'e'.repeat(48), password: 'somepassword1' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'VALIDATION', message: 'INVALID_RESET_TOKEN' });
    expect(redisMock.del).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION for a password shorter than 8 characters', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'f'.repeat(48), password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION');
  });

  it('returns 400 VALIDATION when token is missing', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ password: 'somepassword1' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION');
  });
});
