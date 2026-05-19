import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Alert } from '../src/services/statusTransition.js';

const fetchMock = vi.fn();

const baseEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'warn',
  TELEGRAM_BOT_TOKEN: 'test-bot-token',
};

async function loadService(envOverrides: Partial<typeof baseEnv> = {}) {
  vi.resetModules();
  vi.stubGlobal('fetch', fetchMock);
  vi.doMock('../src/config/env.js', () => ({
    env: { ...baseEnv, ...envOverrides },
  }));
  const service = await import('../src/services/alertTelegram.js');
  const log = (await import('../src/config/log.js')).log;
  return { ...service, log };
}

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    type: 'down',
    monitorId: 'monitor-1',
    to: { email: 'user@example.test', telegramChatId: '123456789' },
    monitorName: 'Example',
    monitorUrl: 'https://example.com',
    checkedAt: new Date('2026-05-17T00:00:00.000Z'),
    error: 'HTTP_5XX',
    ...overrides,
  };
}

describe('sendAlertTelegram rate limit', () => {
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('sends the first alert and rate-limits a second within 60 seconds', async () => {
    const { sendAlertTelegram, _resetAlertTelegramRateLimitForTests, log } = await loadService();
    _resetAlertTelegramRateLimitForTests();
    const warnSpy = vi.spyOn(log, 'warn');

    await sendAlertTelegram(makeAlert({ type: 'down' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/bottest-bot-token/sendMessage');
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body.chat_id).toBe('123456789');
    expect(body.text).toContain('DOWN: Example');

    await sendAlertTelegram(makeAlert({ type: 'recovery' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ monitorId: 'monitor-1', alertType: 'recovery' }),
      'alert telegram rate-limited',
    );
  });

  it('sends again after 60-second window', async () => {
    const { sendAlertTelegram, _resetAlertTelegramRateLimitForTests } = await loadService();
    _resetAlertTelegramRateLimitForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-17T00:00:00.000Z'));

    await sendAlertTelegram(makeAlert());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-05-17T00:01:01.000Z'));
    await sendAlertTelegram(makeAlert({ type: 'recovery' }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('skips when no telegramChatId', async () => {
    const { sendAlertTelegram, _resetAlertTelegramRateLimitForTests, log } = await loadService();
    _resetAlertTelegramRateLimitForTests();
    const warnSpy = vi.spyOn(log, 'warn');

    await sendAlertTelegram(makeAlert({ to: { email: 'user@example.test', telegramChatId: null } }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('skips when TELEGRAM_BOT_TOKEN missing', async () => {
    const { sendAlertTelegram, _resetAlertTelegramRateLimitForTests, log } = await loadService({
      TELEGRAM_BOT_TOKEN: undefined,
    });
    _resetAlertTelegramRateLimitForTests();
    const warnSpy = vi.spyOn(log, 'warn');

    await sendAlertTelegram(makeAlert());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ alertType: 'down', monitorId: 'monitor-1' }),
      'alert telegram skipped; TELEGRAM_BOT_TOKEN env missing',
    );
  });

  it('throws on non-ok Telegram API response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"description":"Bad Request"}',
    });
    const { sendAlertTelegram, _resetAlertTelegramRateLimitForTests } = await loadService();
    _resetAlertTelegramRateLimitForTests();

    await expect(sendAlertTelegram(makeAlert())).rejects.toThrow('Telegram sendMessage failed: 400');
  });
});
