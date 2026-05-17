process.env.NODE_ENV = 'test';
process.env.APP_MODE ??= 'all';
process.env.LOG_LEVEL ??= 'warn';
process.env.JWT_SECRET ??= 'test-secret-at-least-32-characters-long-yes';
process.env.JWT_TTL_SECONDS ??= '3600';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.CORS_ORIGIN ??= 'http://localhost:5173';

const testUrl =
  process.env.DATABASE_URL_TEST ?? 'postgresql://uptime:uptime@localhost:5432/uptime_test';

if (!testUrl.includes('test')) {
  throw new Error('Refusing to run tests without a *_test database URL');
}
process.env.DATABASE_URL = testUrl;
