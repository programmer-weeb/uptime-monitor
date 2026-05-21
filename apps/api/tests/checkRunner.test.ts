import dns from 'node:dns';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCheck } from '../src/services/checkRunner.js';

describe('runCheck', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.spyOn(dns.promises, 'lookup').mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
    ] as unknown as dns.LookupAddress[]);
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns up for a successful GET', async () => {
    fetchSpy.mockResolvedValue(new Response('ok', { status: 200 }));

    const result = await runCheck('https://example.com/status');

    expect(result).toMatchObject({
      status: 'up',
      statusCode: 200,
      error: null,
    });
    expect(result.latencyMs).toEqual(expect.any(Number));
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com/status',
      expect.objectContaining({
        method: 'GET',
        redirect: 'manual',
      }),
    );
  });

  it('rejects a redirect hop that urlGuard blocks', async () => {
    fetchSpy.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'https://169.254.169.254/latest/meta-data' },
      }),
    );

    const result = await runCheck('https://example.com/redirect');

    expect(result).toMatchObject({
      status: 'down',
      statusCode: null,
      error: 'BLOCKED',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('caps response bodies at 1 MB and classifies oversized bodies', async () => {
    let chunksSent = 0;
    let canceled = false;
    const chunk = new Uint8Array(256 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunksSent += 1;
        controller.enqueue(chunk);
      },
      cancel() {
        canceled = true;
      },
    });
    fetchSpy.mockResolvedValue(new Response(stream, { status: 200 }));

    const result = await runCheck('https://example.com/download');

    expect(result).toMatchObject({
      status: 'down',
      statusCode: 200,
      error: 'BODY_TOO_LARGE',
    });
    expect(chunksSent).toBeGreaterThanOrEqual(5);
    expect(chunksSent).toBeLessThanOrEqual(6);
    expect(canceled).toBe(true);
  });

  it('sends the explicit uptime monitor User-Agent header', async () => {
    fetchSpy.mockResolvedValue(new Response('ok', { status: 200 }));

    await runCheck('https://example.com/status');

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: {
          'User-Agent': 'UptimeMonitor/1.0 (+https://example.com)',
        },
      }),
    );
  });

  it('classifies a timeout as TIMEOUT down', async () => {
    const timeoutError = new Error('The operation timed out');
    timeoutError.name = 'TimeoutError';
    fetchSpy.mockRejectedValue(timeoutError);

    const result = await runCheck('https://example.com/slow');

    expect(result).toMatchObject({
      status: 'down',
      statusCode: null,
      error: 'TIMEOUT',
    });
  });

  it('classifies a DNS resolution failure (ENOTFOUND) as DNS down', async () => {
    // Real Node fetch wraps DNS errors as TypeError('fetch failed') with the
    // underlying system error on `.cause` — mirror that so classifyFetchError
    // unwraps it the same way it would in production.
    const dnsError = new TypeError('fetch failed');
    (dnsError as Error & { cause?: { code?: string } }).cause = { code: 'ENOTFOUND' };
    fetchSpy.mockRejectedValue(dnsError);

    const result = await runCheck('https://example.com/lookup');

    expect(result).toMatchObject({
      status: 'down',
      statusCode: null,
      error: 'DNS',
    });
  });

  it('classifies a 4xx response as HTTP_4XX down', async () => {
    fetchSpy.mockResolvedValue(new Response('not found', { status: 404 }));

    const result = await runCheck('https://example.com/missing');

    expect(result).toMatchObject({
      status: 'down',
      statusCode: 404,
      error: 'HTTP_4XX',
    });
  });

  it('classifies a 5xx response as HTTP_5XX down', async () => {
    fetchSpy.mockResolvedValue(new Response('boom', { status: 503 }));

    const result = await runCheck('https://example.com/unavailable');

    expect(result).toMatchObject({
      status: 'down',
      statusCode: 503,
      error: 'HTTP_5XX',
    });
  });
});
