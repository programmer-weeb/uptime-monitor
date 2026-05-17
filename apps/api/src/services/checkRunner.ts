import { performance } from 'node:perf_hooks';
import { ApiError } from '../lib/errors.js';
import { urlGuard } from '../lib/urlGuard.js';

export type CheckErrorClass =
  | 'TIMEOUT'
  | 'DNS'
  | 'CONNECTION'
  | 'TLS'
  | 'HTTP_4XX'
  | 'HTTP_5XX'
  | 'REDIRECT_LOOP'
  | 'BLOCKED'
  | 'BODY_TOO_LARGE';

export type CheckResult = {
  status: 'up' | 'down';
  statusCode: number | null;
  latencyMs: number;
  error: CheckErrorClass | null;
};

const BODY_LIMIT_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;
const USER_AGENT = 'UptimeMonitor/1.0 (+https://your-site)';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function elapsedMs(start: number): number {
  return Math.max(0, Math.round(performance.now() - start));
}

function result(
  status: CheckResult['status'],
  statusCode: number | null,
  latencyMs: number,
  error: CheckErrorClass | null,
): CheckResult {
  return { status, statusCode, latencyMs, error };
}

async function readBodyWithinLimit(response: Response): Promise<boolean> {
  if (!response.body) {
    return true;
  }

  const reader = response.body.getReader();
  let bytesRead = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return true;
      }

      bytesRead += value.byteLength;
      if (bytesRead > BODY_LIMIT_BYTES) {
        await reader.cancel('response body exceeded 1 MB');
        return false;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
  if (code) {
    return code;
  }

  return 'cause' in error ? errorCode(error.cause) : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

function classifyFetchError(error: unknown, timeoutSignal: AbortSignal): CheckErrorClass {
  if (timeoutSignal.aborted || (error instanceof Error && error.name === 'TimeoutError')) {
    return 'TIMEOUT';
  }

  const code = errorCode(error);
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ENODATA') {
    return 'DNS';
  }

  const message = errorMessage(error).toUpperCase();
  if (
    code?.includes('CERT') ||
    code?.includes('TLS') ||
    code?.includes('SSL') ||
    message.includes('CERT') ||
    message.includes('TLS') ||
    message.includes('SSL')
  ) {
    return 'TLS';
  }

  return 'CONNECTION';
}

export async function runCheck(url: string): Promise<CheckResult> {
  const start = performance.now();
  const timeoutSignal = AbortSignal.timeout(TIMEOUT_MS);

  let currentUrl = url;
  let redirects = 0;

  try {
    while (true) {
      try {
        await urlGuard(currentUrl);
      } catch (error) {
        if (error instanceof ApiError && error.code === 'URL_BLOCKED') {
          return result('down', null, elapsedMs(start), 'BLOCKED');
        }
        throw error;
      }

      const response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: timeoutSignal,
        headers: {
          'User-Agent': USER_AGENT,
        },
      });

      if (REDIRECT_STATUSES.has(response.status)) {
        await response.body?.cancel();

        const location = response.headers.get('location');
        if (!location) {
          return result('down', response.status, elapsedMs(start), 'CONNECTION');
        }

        if (redirects >= MAX_REDIRECTS) {
          return result('down', response.status, elapsedMs(start), 'REDIRECT_LOOP');
        }

        currentUrl = new URL(location, currentUrl).toString();
        redirects += 1;
        continue;
      }

      const bodyWithinLimit = await readBodyWithinLimit(response);
      if (!bodyWithinLimit) {
        return result('down', response.status, elapsedMs(start), 'BODY_TOO_LARGE');
      }

      if (response.status >= 500) {
        return result('down', response.status, elapsedMs(start), 'HTTP_5XX');
      }

      if (response.status >= 400) {
        return result('down', response.status, elapsedMs(start), 'HTTP_4XX');
      }

      return result('up', response.status, elapsedMs(start), null);
    }
  } catch (error) {
    return result('down', null, elapsedMs(start), classifyFetchError(error, timeoutSignal));
  }
}
