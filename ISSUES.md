# Uptime Monitor — Known Issues

Findings from a full LSP audit on 2026-05-21. All file:line references are in `apps/api/` unless prefixed with `apps/web/`.

---

## High Priority

### 1. Telegram webhook has no auth when secret is unset

**File:** `src/routes/telegramWebhook.ts:26`

```ts
if (env.TELEGRAM_WEBHOOK_SECRET && secretHeader !== env.TELEGRAM_WEBHOOK_SECRET) {
```

`TELEGRAM_WEBHOOK_SECRET` is an optional env var (`src/config/env.ts:17`). If unset, the guard never executes — anyone can POST arbitrary Telegram updates to `/telegram/webhook`. An attacker still needs a valid Redis token to actually link an account, but the endpoint has zero authentication.

**Fix:** Require the secret whenever Telegram is configured. If `TELEGRAM_BOT_TOKEN` is set, `TELEGRAM_WEBHOOK_SECRET` must also be set (enforce in env schema or add a startup check). Alternatively, make the env var non-optional.

---

### 2. Google OAuth race condition on new-user creation

**File:** `src/routes/auth.ts:115-130`

```ts
const existing = await prisma.user.findUnique({ where: { email } });
if (existing) {
  user = await prisma.user.update(...)   // link googleId
} else {
  user = await prisma.user.create(...)   // new user — no password
}
```

Two concurrent Google sign-ins with the same new email both see `existing = null`, then both call `prisma.user.create` → second one throws P2002 unique constraint, user gets an error response.

**Fix:** Replace the findUnique + create/update pattern with a single `prisma.user.upsert` (or wrap in a serializable transaction):

```ts
user = await prisma.user.upsert({
  where: { email },
  create: { email, googleId },
  update: { googleId },
  select: { id: true, email: true, isDemo: true },
});
```

---

### 3. `requireAuth` hits the database on every request

**File:** `src/middleware/auth.ts:40`

```ts
const user = await prisma.user.findUnique({
  where: { id: claims.sub },
  select: { id: true, email: true, isDemo: true },
});
```

Every authenticated API call (monitors CRUD, account reads, etc.) runs a Postgres query to validate the user still exists. The JWT already proves identity.

**Fix (option A — lightweight):** Put `email` and `isDemo` in the JWT claims at sign-time. `requireAuth` then trusts the verified JWT without a DB round-trip. Accept the tradeoff: isDemo changes won't take effect until token expires.

**Fix (option B — safe):** Keep the DB lookup but add a short Redis cache (`user:{id}`, TTL ~60s). `requireAuth` checks cache first, falls back to DB on miss.

---

## Medium Priority

### 4. `USER_AGENT` contains placeholder string

**File:** `src/services/checkRunner.ts:26`

```ts
const USER_AGENT = 'UptimeMonitor/1.0 (+https://your-site)';
```

`your-site` was never replaced. Some target servers log or block based on User-Agent.

**Fix:** Replace with the real domain, e.g. use `env.API_PUBLIC_URL`:
```ts
const USER_AGENT = `UptimeMonitor/1.0 (+${env.API_PUBLIC_URL ?? 'https://example.com'})`;
```

---

### 5. `Promise.allSettled` wrapping already-caught promises is dead code

**File:** `src/jobs/checkProcessor.ts:57-71`

```ts
await Promise.allSettled([
  sendAlertEmail(transition.alert).catch((err) => { log.error(...) }),
  sendAlertTelegram(transition.alert).catch((err) => { log.error(...) }),
]);
```

Each `.catch()` converts rejections to resolutions, so `allSettled` always sees two fulfilled promises and never does anything extra.

**Fix:** Remove `allSettled` and use `Promise.all`, since the inner `.catch()` calls already prevent propagation:
```ts
await Promise.all([
  sendAlertEmail(transition.alert).catch((err) => log.error(...)),
  sendAlertTelegram(transition.alert).catch((err) => log.error(...)),
]);
```

---

### 6. In-memory alert rate limiter resets on worker restart

**Files:** `src/services/alertEmail.ts:13`, `src/services/alertTelegram.ts:6`

```ts
const lastSentAtByMonitor = new Map<string, number>();
```

The Maps are process-local. If the worker crashes and restarts during an active incident, alerts can re-fire immediately (bypassing the 60s debounce). The existing comment acknowledges this as acceptable for a single-instance worker.

**Fix (if scaling or reliability matters):** Move the rate-limit state to Redis using `SET NX EX`. Key: `alert:rate:{monitorId}`, TTL: 60s. Survives restarts and works across multiple worker instances.

---

## Low Priority

### 7. `GET /auth/me` is redundant

**File:** `src/routes/auth.ts:82`

Returns only `{ id, email, isDemo }` from `req.user`. The account route at `src/routes/account.ts:25` already has `GET /me` returning the full user including `telegramChatId` and `createdAt`. The frontend only calls `/api/me` (account route). The auth `/me` appears unused and adds API surface confusion.

**Fix:** Remove `GET /auth/me` or keep it only as a lightweight token-validity ping (document the distinction clearly).

---

### 8. `GoogleLogin` width hardcoded in Login page

**File:** `apps/web/src/pages/Login.tsx:128`

```tsx
<GoogleLogin width="368" ... />
```

Fixed pixel width overflows on narrow mobile viewports.

**Fix:** Remove the `width` prop (defaults to container width) or use a responsive value.

---

### 9. Internal plan section references in production comments

**Files:** `src/jobs/checkProcessor.ts:44`, `src/lib/urlGuard.ts:5,24`

```ts
// One structured log line per check completion — plan §15.4.
// IPv4 CIDR blocklist per plan §15.3.
```

References to a planning document that won't exist in production context. They rot as code evolves and mean nothing to new contributors.

**Fix:** Rewrite comments to describe the *why* inline, without referencing the external plan document.
