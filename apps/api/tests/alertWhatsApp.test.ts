import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Alert } from '../src/services/statusTransition.js';

const { createMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
}));

const baseEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'warn',
  TWILIO_ACCOUNT_SID: 'ACtest',
  TWILIO_AUTH_TOKEN: 'authtoken',
  TWILIO_WHATSAPP_FROM: 'whatsapp:+14155238886',
};

async function loadService(envOverrides: Partial<typeof baseEnv> = {}) {
  vi.resetModules();
  vi.doMock('twilio', () => ({
    default: vi.fn().mockImplementation(() => ({
      messages: { create: createMock },
    })),
  }));
  vi.doMock('../src/config/env.js', () => ({
    env: {
      ...baseEnv,
      ...envOverrides,
    },
  }));

  const service = await import('../src/services/alertWhatsApp.js');
  const log = (await import('../src/config/log.js')).log;
  return { ...service, log };
}

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    type: 'down',
    monitorId: 'monitor-rate-limit',
    to: { email: 'user@example.test', phone: '+14155551212' },
    monitorName: 'Example',
    monitorUrl: 'https://example.com',
    checkedAt: new Date('2026-05-17T00:00:00.000Z'),
    error: 'HTTP_5XX',
    ...overrides,
  };
}

describe('sendAlertWhatsApp rate limit', () => {
  beforeEach(() => {
    createMock.mockReset().mockResolvedValue({ sid: 'mock-sid' });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sends the first alert and rate-limits a second one within 60 seconds', async () => {
    const { sendAlertWhatsApp, _resetAlertWhatsAppRateLimitForTests, log } = await loadService();
    _resetAlertWhatsAppRateLimitForTests();
    const warnSpy = vi.spyOn(log, 'warn');

    await sendAlertWhatsApp(makeAlert({ type: 'down' }));
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'whatsapp:+14155238886',
        to: 'whatsapp:+14155551212',
        body: expect.stringContaining('DOWN: Example'),
      }),
    );

    await sendAlertWhatsApp(makeAlert({ type: 'recovery' }));
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        monitorId: 'monitor-rate-limit',
        alertType: 'recovery',
        msSinceLast: expect.any(Number),
      }),
      'alert whatsapp rate-limited',
    );
  });

  it('sends again once the 60-second window has elapsed', async () => {
    const { sendAlertWhatsApp, _resetAlertWhatsAppRateLimitForTests } = await loadService();
    _resetAlertWhatsAppRateLimitForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-17T00:00:00.000Z'));

    await sendAlertWhatsApp(makeAlert());
    expect(createMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-05-17T00:01:01.000Z'));
    await sendAlertWhatsApp(makeAlert({ type: 'recovery' }));
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it('skips when no phone is set', async () => {
    const { sendAlertWhatsApp, _resetAlertWhatsAppRateLimitForTests, log } = await loadService();
    _resetAlertWhatsAppRateLimitForTests();
    const warnSpy = vi.spyOn(log, 'warn');

    await sendAlertWhatsApp(makeAlert({ to: { email: 'user@example.test', phone: null } }));
    expect(createMock).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('skips when Twilio env is missing', async () => {
    const { sendAlertWhatsApp, _resetAlertWhatsAppRateLimitForTests, log } = await loadService({
      TWILIO_ACCOUNT_SID: undefined,
      TWILIO_AUTH_TOKEN: undefined,
      TWILIO_WHATSAPP_FROM: undefined,
    });
    _resetAlertWhatsAppRateLimitForTests();
    const warnSpy = vi.spyOn(log, 'warn');

    await sendAlertWhatsApp(makeAlert());
    expect(createMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        alertType: 'down',
        monitorId: 'monitor-rate-limit',
      }),
      'alert whatsapp skipped; twilio env missing',
    );
  });
});
