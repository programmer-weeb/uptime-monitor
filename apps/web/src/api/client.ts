/**
 * Single fetch wrapper for the API.
 *
 * - Reads `VITE_API_URL` from env (set in apps/web/.env).
 * - Pulls the bearer token from the auth context's `getToken()` getter,
 *   set via `setAuthTokenGetter()` during AuthProvider mount. We pass a
 *   getter (not a value) so cached fetches always see the latest token
 *   after login/logout without re-creating closures.
 * - Parses JSON. On non-2xx, throws an `ApiError` matching the §6
 *   `ErrorResponse` shape: `{ status, error, message, details? }`.
 */
export type ErrorCode =
  | 'VALIDATION'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'MONITOR_LIMIT_REACHED'
  | 'URL_BLOCKED'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export type ErrorResponse = {
  error: ErrorCode;
  message: string;
  details?: unknown;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(status: number, body: ErrorResponse) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.error;
    this.details = body.details;
  }
}

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
if (!API_URL) {
  // Loud in dev, silent in prod build (Vite tree-shakes on NODE_ENV).
  // We don't throw — the API client will simply produce relative-URL fetches,
  // which the dev server's logs will make obvious.
  console.warn('[api] VITE_API_URL is not set; requests will use a relative URL.');
}

type TokenGetter = () => string | null;
let getToken: TokenGetter = () => null;

export function setAuthTokenGetter(fn: TokenGetter): void {
  getToken = fn;
}

type RequestOptions = {
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
};

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(opts.headers ?? {}),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const init: RequestInit = { method, headers, signal: opts.signal };
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  }

  const res = await fetch(`${API_URL}${path}`, init);

  // 204 No Content has no body. Treat as undefined.
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data: unknown = text ? safeJsonParse(text) : undefined;

  if (!res.ok) {
    const body = isErrorResponse(data)
      ? data
      : ({
          error: 'INTERNAL',
          message: res.statusText || 'Request failed',
        } satisfies ErrorResponse);
    throw new ApiError(res.status, body);
  }

  return data as T;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isErrorResponse(x: unknown): x is ErrorResponse {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as { error?: unknown }).error === 'string' &&
    typeof (x as { message?: unknown }).message === 'string'
  );
}

export const apiGet = <T>(path: string, opts?: RequestOptions): Promise<T> =>
  request<T>('GET', path, opts);
export const apiPost = <T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> =>
  request<T>('POST', path, { ...opts, body });
export const apiPatch = <T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> =>
  request<T>('PATCH', path, { ...opts, body });
export const apiDel = <T>(path: string, opts?: RequestOptions): Promise<T> =>
  request<T>('DELETE', path, opts);
