import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Alert } from '../src/services/statusTransition.js';

// Hoisted so vi.mock can reach it and the test body can assert on it.
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
    RESEND_API_KEY: 'test-key-do-not-use',
    EMAIL_FROM: 'noreply@example.test',
  },
}));

// Import after the mocks so the in-memory rate-limit map is fresh per file.
const { sendAlertEmail, _resetAlertEmailRateLimitForTests } = await import(
  '../src/services/alertEmail.js'
);
const { log } = await import('../src/config/log.js');

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    type: 'down',
    monitorId: 'monitor-rate-limit',
    to: { email: 'user@example.test', telegramChatId: null },
    monitorName: 'Example',
    monitorUrl: 'https://example.com',
    checkedAt: new Date('2026-05-17T00:00:00.000Z'),
    error: 'HTTP_5XX',
    ...overrides,
  };
}

describe('sendAlertEmail rate limit (plan §16.11)', () => {
  beforeEach(() => {
    sendMock.mockReset().mockResolvedValue({ data: { id: 'mock-id' }, error: null });
    _resetAlertEmailRateLimitForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the first alert and rate-limits a second one within 60 seconds', async () => {
    const warnSpy = vi.spyOn(log, 'warn');

    await sendAlertEmail(makeAlert({ type: 'down' }));
    expect(sendMock).toHaveBeenCalledTimes(1);

    await sendAlertEmail(makeAlert({ type: 'recovery' }));
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        monitorId: 'monitor-rate-limit',
        alertType: 'recovery',
        msSinceLast: expect.any(Number),
      }),
      'alert email rate-limited',
    );

    warnSpy.mockRestore();
  });

  it('sends again once the 60-second window has elapsed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-17T00:00:00.000Z'));

    await sendAlertEmail(makeAlert());
    expect(sendMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-05-17T00:01:01.000Z'));
    await sendAlertEmail(makeAlert({ type: 'recovery' }));
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it('rate-limits per monitor, not globally', async () => {
    await sendAlertEmail(makeAlert({ monitorId: 'monitor-a' }));
    await sendAlertEmail(makeAlert({ monitorId: 'monitor-b' }));
    expect(sendMock).toHaveBeenCalledTimes(2);
  });
});
