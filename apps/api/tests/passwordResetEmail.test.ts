import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

vi.mock('../src/config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    LOG_LEVEL: 'warn',
    RESEND_API_KEY: 'test-key',
    EMAIL_FROM: 'noreply@example.test',
  },
}));

const { sendPasswordResetEmail } = await import('../src/services/passwordResetEmail.js');

describe('sendPasswordResetEmail', () => {
  beforeEach(() => {
    sendMock.mockReset().mockResolvedValue({ data: { id: 'mock-id' }, error: null });
  });

  it('sends an email with the reset URL', async () => {
    await sendPasswordResetEmail('user@example.test', 'https://app.test/reset-password?token=abc');

    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0][0];
    expect(call.to).toBe('user@example.test');
    expect(call.subject).toMatch(/password/i);
    expect(call.html).toContain('https://app.test/reset-password?token=abc');
    expect(call.html).toContain('15 minutes');
  });

  // The guard branch (missing RESEND_API_KEY → log.warn + return) cannot be tested
  // in this file: Vitest's module cache prevents re-importing the service with a
  // different env mock after the first dynamic import above.
});
