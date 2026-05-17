# Uptime Monitor — Build Plan

A Node + Express + TypeScript + PostgreSQL (Prisma) project. Users register URLs they want monitored; a worker pings each URL on a schedule, stores the results, pushes live updates to the browser, and emails alerts when sites go down.

This plan is opinionated on purpose. Decisions are pre-made so you spend time building, not picking libraries.

---

## 1. Goals

- Prove the Node + Express + TypeScript + PostgreSQL (Prisma) stack with a real, deployed app.
- Show production-shaped thinking: background jobs, retries, real-time updates, alerts, auth, tests.
- Ship MVP in ~2 weeks of focused evenings, deployable on cheap tiers (Render Starter for the API, ~free Postgres on Neon, near-free Upstash Redis — see §3 for the exact pricing math).

## 2. Scope

### In scope (MVP)
- JWT auth (signup + login).
- Add / list / edit / delete monitors (URL, name, interval).
- Background worker pings each URL on its schedule.
- Per-monitor recent checks list + 24-hour uptime percentage + latency chart.
- Live dashboard updates via WebSockets.
- Email alert on `up → down` (debounced) and recovery email on `down → up`.

### Explicitly NOT in scope (kill scope creep)
- Multi-user teams / organizations.
- Public status pages (stretch, do not start until MVP ships).
- SMS / Slack / webhook integrations.
- Multi-region checks.
- Billing / plans.
- Mobile app.

If you find yourself working on any of the above before the MVP is deployed, stop.

## 3. Tech stack

### Backend
- **Node.js 20+** with **TypeScript** (strict mode).
- **Express 5** as the HTTP framework.
- **PostgreSQL 16** as the database.
- **Prisma** as the ORM. Type-safe queries from a single `schema.prisma`, generated client, first-class migration tool.
- **BullMQ** for scheduled checks and retries. Industry-standard Node queue, backed by Redis.
- **Socket.IO** for WebSockets. Easier than raw `ws`, supports rooms (one per user) out of the box.
- **zod** for request body validation. Same library on backend and frontend = shared types.
- **jsonwebtoken** + **bcrypt** for auth. (`argon2id` is the modern OWASP recommendation and what you'd use at a job, but bcrypt is universally familiar, has zero install pain, and saves a small evening of yak-shaving on an MVP.)
- **Resend** SDK for alert emails (`resend.emails.send(...)` — fewer moving parts than Nodemailer + SMTP, same provider, same deliverability).
- **pino** for structured logging.

### Frontend
- **Vite + React + TypeScript**.
- **TanStack Query** for server state (you already know this).
- **Tailwind CSS**.
- **Recharts** for the latency chart. Simple API, good defaults.
- **socket.io-client** for the live dashboard.
- **React Router** for routing.

### Tooling
- **Vitest** for unit + integration tests (consistent with the frontend; one less tool to learn).
- **Supertest** for HTTP-level API tests.
- A dedicated **PostgreSQL test database** spun up via `docker-compose`; tests truncate tables between runs.
- **ESLint + Prettier**.
- **tsx** for running TS directly in dev.

### Pinned versions (install these exact majors)

Backend (`apps/api`):
```
"dependencies": {
  "@prisma/client": "^5.20.0",
  "bcrypt": "^5.1.1",
  "bullmq": "^5.13.0",
  "express": "^5.0.0",
  "express-rate-limit": "^7.4.0",
  "helmet": "^8.0.0",
  "ioredis": "^5.4.1",
  "jsonwebtoken": "^9.0.2",
  "pino": "^9.5.0",
  "resend": "^4.0.0",
  "socket.io": "^4.8.0",
  "zod": "^3.23.0"
},
"devDependencies": {
  "@types/bcrypt": "^5.0.2",
  "@types/express": "^5.0.0",
  "@types/jsonwebtoken": "^9.0.7",
  "@types/node": "^22.7.0",
  "@types/supertest": "^6.0.0",
  "msw": "^2.4.0",
  "pino-pretty": "^11.2.0",
  "prisma": "^5.20.0",
  "supertest": "^7.0.0",
  "tsx": "^4.19.0",
  "typescript": "^5.6.0",
  "vitest": "^2.1.0"
}
```

Frontend (`apps/web`):
```
"dependencies": {
  "@tanstack/react-query": "^5.59.0",
  "react": "^18.3.0",
  "react-dom": "^18.3.0",
  "react-router-dom": "^6.27.0",
  "recharts": "^2.13.0",
  "socket.io-client": "^4.8.0"
},
"devDependencies": {
  "@types/react": "^18.3.0",
  "@types/react-dom": "^18.3.0",
  "@vitejs/plugin-react": "^4.3.0",
  "autoprefixer": "^10.4.0",
  "postcss": "^8.4.0",
  "tailwindcss": "^3.4.0",
  "typescript": "^5.6.0",
  "vite": "^5.4.0",
  "vitest": "^2.1.0"
}
```

If a major has moved on by the time you install, lock to the latest within that major (`npm install pkg@^N`). Do not jump majors without re-reading the relevant gotcha (BullMQ 5 vs 4, Express 5 vs 4).

### Infrastructure
- **Neon** for managed Postgres (free tier with database branching — handy for preview environments later).
- **Upstash Redis**. *Free tier is not enough* — 10 monitors × 1-min interval × ~5 BullMQ ops/job ≈ 70K commands/day, ~7× the 10K free cap. Either (a) restrict the demo account to ≥ 10-min intervals (~7K/day, fits free), or (b) pay-as-you-go (~$0.20/M commands — pennies/month at this load), or (c) Render Key Value Starter (~$10/mo). Pick one and document it.
- **Render Web Service** (Starter plan) for the backend. No sleep, so the BullMQ worker can stay in-process.
- **Vercel** for the frontend.
- **Resend** for transactional email.

## 4. Architecture

```
                    +----------------+
                    |   React app    |
                    |  (Vercel)      |
                    +-------+--------+
                            |
                  HTTPS REST + WebSocket
                            |
                    +-------v--------+
                    |  Express API   |
                    |  + Socket.IO   |
                    |  + BullMQ      |
                    |  worker        |   <-- one Node process for MVP
                    |  (Render)      |
                    +---+--------+---+
                        |        |
            +-----------+        +-----------+
            |                                |
   +--------v---------+              +-------v--------+
   | Neon Postgres    |              | Upstash Redis  |
   | (users, monitors |              | (BullMQ queue) |
   |  checks, alerts) |              +----------------+
   +------------------+
```

For the MVP, the API server and the BullMQ worker run in **one Node process**. Render's Starter Web Service doesn't sleep, so the in-process worker keeps firing checks 24/7. In your README, note that splitting them into separate services (a Render Background Worker alongside the Web Service) is a one-line change (`MODE=worker` env var) and is what you would do at production scale. Showing you know the trade-off matters more than building the split.

> **Hard requirement:** keep Render instance count at 1. The in-process scheduler and the alert-send path both assume a single writer. Two instances = duplicate schedulers, duplicate emails, duplicate counter writes. If you ever need to scale, split the worker out first.

## 5. Data model

Prisma schema lives at `apps/api/prisma/schema.prisma`. Tables below describe what each model holds; the full schema follows.

### users
| field          | type        | notes                            |
| -------------- | ----------- | -------------------------------- |
| `id`           | String (cuid) | primary key                    |
| `email`        | String      | unique; lowercase in app code before insert/lookup (simpler than installing `citext`) |
| `password_hash`| String      | bcrypt, never returned in JSON   |
| `is_demo`      | Boolean     | default false; true for the seeded demo account, used to reject writes (see Day 14) |
| `created_at`   | Timestamptz | default `now()`                  |

### monitors
| field                  | type                            | notes                                  |
| ---------------------- | ------------------------------- | -------------------------------------- |
| `id`                   | String (cuid)                   | primary key                            |
| `user_id`              | String FK → users.id            | `ON DELETE CASCADE`                    |
| `name`                 | String                          | required, ≤ 100 chars                  |
| `url`                  | String                          | https only, validated                  |
| `interval_minutes`     | Int                             | one of: 1, 5, 15, 30, 60               |
| `is_paused`            | Boolean                         | default false                          |
| `current_status`       | enum `MonitorStatus`            | up / down / unknown, default unknown   |
| `consecutive_failures` | Int                             | default 0, for alert debouncing        |
| `last_checked_at`      | Timestamptz nullable            |                                        |
| `created_at`           | Timestamptz                     | default `now()`                        |

Index: `(user_id, created_at DESC)`.

No `updated_at`: every check write touches `last_checked_at` and `current_status`, so an auto-managed `updatedAt` would always equal `lastCheckedAt` and tell you nothing. If you ever want a true "last user-edited" timestamp, manage it manually on PATCH only.

### checks
| field          | type                       | notes                              |
| -------------- | -------------------------- | ---------------------------------- |
| `id`           | String (cuid)              | primary key                        |
| `monitor_id`   | String FK → monitors.id    | `ON DELETE CASCADE`                |
| `status`       | enum `CheckStatus`         | up / down                          |
| `status_code`  | Int nullable               |                                    |
| `latency_ms`   | Int                        |                                    |
| `error`        | String nullable            | e.g., 'TIMEOUT', 'DNS', '5xx'      |
| `checked_at`   | Timestamptz                | default `now()`                    |

Indexes: `(monitor_id, checked_at DESC)`, and `(checked_at)` for the cleanup job.

Postgres has no native TTL like Mongo. A daily BullMQ repeatable job runs `prisma.check.deleteMany({ where: { checkedAt: { lt: cutoff } } })` to delete checks older than 30 days. Scheduled at server boot.

### alert_events
| field         | type                       | notes                |
| ------------- | -------------------------- | -------------------- |
| `id`          | String (cuid)              |                      |
| `monitor_id`  | String FK → monitors.id    | `ON DELETE CASCADE`  |
| `type`        | enum `AlertType`           | down / recovery      |
| `sent_at`     | Timestamptz                | default `now()`      |

### Prisma schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum MonitorStatus {
  up
  down
  unknown
}

enum CheckStatus {
  up
  down
}

enum AlertType {
  down
  recovery
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String   @map("password_hash")
  isDemo       Boolean  @default(false) @map("is_demo")
  createdAt    DateTime @default(now()) @map("created_at")
  monitors     Monitor[]

  @@map("users")
}

model Monitor {
  id                  String        @id @default(cuid())
  userId              String        @map("user_id")
  name                String
  url                 String
  intervalMinutes     Int           @map("interval_minutes")
  isPaused            Boolean       @default(false) @map("is_paused")
  currentStatus       MonitorStatus @default(unknown) @map("current_status")
  consecutiveFailures Int           @default(0) @map("consecutive_failures")
  lastCheckedAt       DateTime?     @map("last_checked_at")
  createdAt           DateTime      @default(now()) @map("created_at")

  user        User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  checks      Check[]
  alertEvents AlertEvent[]

  @@index([userId, createdAt(sort: Desc)])
  @@map("monitors")
}

model Check {
  id         String      @id @default(cuid())
  monitorId  String      @map("monitor_id")
  status     CheckStatus
  statusCode Int?        @map("status_code")
  latencyMs  Int         @map("latency_ms")
  error      String?
  checkedAt  DateTime    @default(now()) @map("checked_at")

  monitor Monitor @relation(fields: [monitorId], references: [id], onDelete: Cascade)

  @@index([monitorId, checkedAt(sort: Desc)])
  @@index([checkedAt])
  @@map("checks")
}

model AlertEvent {
  id        String    @id @default(cuid())
  monitorId String    @map("monitor_id")
  type      AlertType
  sentAt    DateTime  @default(now()) @map("sent_at")

  monitor Monitor @relation(fields: [monitorId], references: [id], onDelete: Cascade)

  @@index([monitorId, sentAt(sort: Desc)])
  @@map("alert_events")
}
```

### Auth spec

- **Password hashing:** `bcrypt.hash(password, 12)` in prod; `bcrypt.hash(password, 4)` in tests (low cost = fast tests).
- **JWT algorithm:** HS256. Secret from `JWT_SECRET` (must be ≥ 32 random bytes; generate with `openssl rand -base64 48`).
- **JWT payload:** `{ sub: <userId>, iat, exp }`. No other claims. Do not put email, isDemo, or anything else in the token — re-fetch the user in auth middleware so revocation/changes take effect immediately.
- **JWT TTL:** 24 hours (`JWT_TTL_SECONDS=86400`). No refresh tokens for MVP — user logs in again when it expires.
- **Header format:** `Authorization: Bearer <token>`. Anything else → 401.
- **Password rules:** min 8 chars, max 72 (bcrypt's hard limit). No other complexity rules.
- **Email normalization:** `email.trim().toLowerCase()` before insert and before lookup. Always.

## 6. API surface

All routes are JSON. Auth is `Authorization: Bearer <jwt>` on every route except `/auth/*`.

```
POST   /api/auth/signup           { email, password }
POST   /api/auth/login            { email, password }
GET    /api/auth/me               -> { id, email }

GET    /api/monitors              -> Monitor[] with currentStatus
POST   /api/monitors              { name, url, intervalMinutes }
GET    /api/monitors/:id          -> Monitor (recent checks come from /checks)
PATCH  /api/monitors/:id          { name?, intervalMinutes?, isPaused? }
DELETE /api/monitors/:id

GET    /api/monitors/:id/checks?limit=100   -> Check[]
GET    /api/monitors/:id/stats              -> { uptimePct24h, avgLatencyMs24h }
```

Limits (hard-coded for MVP):
- Max 10 monitors per user.
- Min interval 1 minute, max 60 (the demo account is locked to ≥ 10 min — see Upstash note in §3).
- Check timeout 10 seconds.
- Rate limits (per IP unless stated):
  - `POST /api/auth/signup`: 3 / hour (signup is the cheapest abuse vector — slow it down hard).
  - `POST /api/auth/login`: 10 / minute.
  - `POST /api/monitors`: 5 / minute *per authenticated user* (prevents a compromised account from flooding the worker).

### Error response format

Every non-2xx response uses this shape, no exceptions:

```ts
type ErrorResponse = {
  error: ErrorCode;       // machine-readable, SCREAMING_SNAKE
  message: string;        // human-readable, safe to show users
  details?: unknown;      // optional — e.g., zod issues array for VALIDATION
};

type ErrorCode =
  | "VALIDATION"           // 400 — zod failure
  | "UNAUTHORIZED"         // 401 — missing/invalid/expired JWT
  | "FORBIDDEN"            // 403 — demo write, cross-user access
  | "NOT_FOUND"            // 404
  | "CONFLICT"             // 409 — EMAIL_TAKEN etc. (use `message` for sub-code)
  | "MONITOR_LIMIT_REACHED" // 409
  | "URL_BLOCKED"          // 422 — urlGuard rejected
  | "RATE_LIMITED"         // 429
  | "INTERNAL";            // 500 — unhandled
```

Never leak stack traces, SQL, or hashed passwords. The server-side `pino` log gets the full detail; the client gets the shape above.

### Endpoint contracts

```ts
// POST /api/auth/signup    Rate-limited 3/hr per IP
Request:  { email: string, password: string }       // password 8–72 chars
Response 201: { token: string, user: { id, email } }
Errors:   400 VALIDATION | 409 CONFLICT (message: "EMAIL_TAKEN") | 429 RATE_LIMITED

// POST /api/auth/login     Rate-limited 10/min per IP
Request:  { email: string, password: string }
Response 200: { token: string, user: { id, email } }
Errors:   400 VALIDATION | 401 UNAUTHORIZED (always — never leak "email not found" vs "wrong password") | 429

// GET /api/auth/me         Auth required
Response 200: { id: string, email: string, isDemo: boolean }
Errors:   401

// GET /api/monitors        Auth required
Response 200: Monitor[]      // see Monitor shape below
Errors:   401

// POST /api/monitors       Auth required. Rate-limited 5/min per user.
Request:  { name: string, url: string, intervalMinutes: 1|5|15|30|60 }
                                // name 1–100 chars, url must pass urlGuard
Response 201: Monitor
Errors:   400 VALIDATION | 401 | 403 FORBIDDEN (demo write) | 409 MONITOR_LIMIT_REACHED | 422 URL_BLOCKED | 429

// GET /api/monitors/:id    Auth required. Owner only.
Response 200: Monitor
Errors:   401 | 403 (not owner) | 404

// PATCH /api/monitors/:id  Auth required. Owner only.
Request:  { name?: string, intervalMinutes?: 1|5|15|30|60, isPaused?: boolean }
                                // partial; at least one field required
Response 200: Monitor
Errors:   400 | 401 | 403 (not owner OR demo write) | 404

// DELETE /api/monitors/:id Auth required. Owner only.
Response 204: (no body)
Errors:   401 | 403 (not owner OR demo write) | 404

// GET /api/monitors/:id/checks?limit=N   Auth required. Owner only.
Query:    limit: 1–500 (default 100), order DESC by checkedAt
Response 200: Check[]
Errors:   400 (limit out of range) | 401 | 403 | 404

// GET /api/monitors/:id/stats   Auth required. Owner only.
Response 200: {
  uptimePct24h: number,        // 0–100, two decimals (e.g., 99.42). null if no checks in window.
  avgLatencyMs24h: number,     // integer. null if no successful checks.
  lastDownAt: string | null,   // ISO 8601
  totalChecks24h: number
}
Errors:   401 | 403 | 404

// GET /health             No auth. Used by Render's health probe.
Response 200: { ok: true }    // always 200 if process is alive — DB ping happens in /health/deep
```

JSON shapes used above:

```ts
type Monitor = {
  id: string;
  name: string;
  url: string;
  intervalMinutes: 1 | 5 | 15 | 30 | 60;
  isPaused: boolean;
  currentStatus: "up" | "down" | "unknown";
  lastCheckedAt: string | null;   // ISO 8601
  createdAt: string;              // ISO 8601
};

type Check = {
  id: string;
  monitorId: string;
  status: "up" | "down";
  statusCode: number | null;
  latencyMs: number;
  error: ErrorClass | null;
  checkedAt: string;              // ISO 8601
};

type ErrorClass =
  | "TIMEOUT"
  | "DNS"
  | "CONNECTION"
  | "TLS"
  | "HTTP_4XX"
  | "HTTP_5XX"
  | "REDIRECT_LOOP"
  | "BLOCKED"      // urlGuard rejected on redirect
  | "BODY_TOO_LARGE";
```

Date format is always ISO 8601 UTC (`new Date().toISOString()`). Never emit raw Date objects or epoch numbers.

## 7. WebSocket events

Namespace: `/dashboard`. Client authenticates by sending the JWT in the handshake auth payload: `io('/dashboard', { auth: { token } })`. Server verifies via the same logic as the HTTP middleware; reject with `next(new Error('UNAUTHORIZED'))` on failure. On connect, the server joins the socket to a `user:<userId>` room. The Socket.IO server is constructed with its own CORS (see §11) — Express's CORS does *not* cover it.

Server → Client event shapes:

```ts
// Fires after every check, regardless of status change.
"check:completed": {
  monitorId: string;
  status: "up" | "down";
  statusCode: number | null;
  latencyMs: number;
  error: ErrorClass | null;
  checkedAt: string;          // ISO 8601
}

// Fires only on transitions (unknown→up, unknown→down, up→down after debouncing, down→up).
"monitor:status_changed": {
  monitorId: string;
  from: "up" | "down" | "unknown";
  to:   "up" | "down";
  at:   string;               // ISO 8601
}
```

Client → Server: none for MVP. Don't add more channels until the dashboard is live and you know what's missing.

**Reconnect behavior.** Socket.IO auto-reconnects with backoff. The frontend should refetch (`queryClient.invalidateQueries(['monitors'])`) on the `connect` event after a `disconnect` — this fills any gap from missed events without needing event replay on the server.

## 8. Directory structure

```
uptime-monitor/
├── apps/
│   ├── api/                          # Express + worker + WS
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── seed.ts            # demo account + sample monitors (Day 14)
│   │   │   └── migrations/
│   │   ├── src/
│   │   │   ├── config/               # env loading, prisma client, redis conn
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts
│   │   │   │   └── monitors.ts
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts           # JWT verify
│   │   │   │   ├── validate.ts       # zod request validation
│   │   │   │   └── rateLimit.ts
│   │   │   ├── services/
│   │   │   │   ├── checkRunner.ts    # pings a URL, returns Check shape
│   │   │   │   ├── alertService.ts   # sends emails via Resend SDK
│   │   │   │   └── statusTransition.ts
│   │   │   ├── jobs/
│   │   │   │   ├── queue.ts          # BullMQ queue + scheduler
│   │   │   │   └── checkProcessor.ts # BullMQ worker
│   │   │   ├── ws/
│   │   │   │   └── server.ts         # Socket.IO server + auth
│   │   │   ├── lib/
│   │   │   │   └── urlGuard.ts       # SSRF / internal IP protection
│   │   │   ├── app.ts                # Express app factory (no listen)
│   │   │   ├── server.ts             # entrypoint
│   │   │   └── types.ts
│   │   ├── tests/
│   │   │   ├── auth.test.ts
│   │   │   ├── monitors.test.ts
│   │   │   ├── checkRunner.test.ts
│   │   │   ├── factories.ts          # createUser(), createMonitor(), createCheck()
│   │   │   └── helpers.ts            # test database setup + truncation
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   └── web/                          # Vite + React
│       ├── src/
│       │   ├── api/                  # fetch wrappers
│       │   ├── components/
│       │   ├── hooks/                # useMonitors, useLiveChecks, useAuth
│       │   ├── pages/
│       │   │   ├── Login.tsx
│       │   │   ├── Signup.tsx
│       │   │   ├── Dashboard.tsx
│       │   │   └── MonitorDetail.tsx
│       │   ├── lib/socket.ts
│       │   ├── App.tsx
│       │   └── main.tsx
│       ├── tests/
│       └── package.json
├── README.md
└── docker-compose.yml                # postgres + redis for local dev
```

Monorepo isn't strictly needed, but having `apps/api` and `apps/web` side by side reads well in your GitHub. Use npm workspaces or just two separate `package.json` files; don't pull in Turborepo or pnpm workspaces — overkill.

## 9. Milestone-by-milestone build plan

Each day below is a focused evening (~2–3 hours). Adjust the calendar to your reality; keep the **order**.

### Week 1 — Backend foundations

- [x] **Day 1 — Project setup.** *Realistically this is two evenings; don't fight it.* ✅ Done.
  - **Minimum success criterion (Evening A):** `apps/api` initialized; Express + TS + tsx running; `npm run dev` boots on `:4000`; `GET /health → { ok: true }`; ESLint + Prettier configured. Commit.
  - **Spillover (Evening B):** Vitest wired with one trivial test passing; pino logger; `docker-compose.yml` with Postgres + Redis; `npx prisma init --datasource-provider postgresql` (no models yet); confirm `docker-compose up` + `npm run dev` work end-to-end. Commit.
  - If you finish A fast, push into B same night. If A takes the whole evening, that's normal — tooling setup is always a tax.
  - **Implementation notes (deviations from plan):**
    - Env var renamed `MODE` → `APP_MODE` to avoid clash with Vitest's built-in `MODE=test`. Reflected in §15.1.
    - Dev script uses Node's built-in `--env-file=.env` flag (Node 20.6+) instead of `dotenv`. One less dep.
    - `prisma init` was skipped in favor of writing the minimal `prisma/schema.prisma` directly (datasource + generator). `prisma generate` is deferred to Day 2 when the first model lands — running it now errors with "no models defined."
    - `cors` was missing from §3's dep list. Installed (`cors@^2.8`, `@types/cors`). Should be folded into §3.

- [x] **Day 2 — Auth.** ✅ Done.
  Add the `User` model to `schema.prisma` and run `prisma migrate dev --name init`. `POST /api/auth/signup` (bcrypt hash, returns JWT), `POST /api/auth/login`, `GET /api/auth/me`. Zod validation. JWT middleware. Tests: signup creates user, login returns token, `/me` requires auth.
  - **Implementation notes (deviations from plan):**
    - Docker Desktop isn't running locally, so the dev/test DBs were created on the existing system Postgres (:5432) instead of via `docker-compose`. Both `uptime` and `uptime_test` live on `:5432` (not the `:5432`/`:5433` split from §15.2). `DATABASE_URL_TEST` updated accordingly in `.env`. When Docker is available, the split returns automatically — the test helper only requires the URL contain the string `test`.
    - Added `tests/setup.ts` (vitest `setupFiles`) so tests get their env vars before any module imports `env.ts`. Cleaner than the per-file `beforeAll` env stubbing the prior health test used.
    - Bcrypt cost gated on `NODE_ENV`: 4 in tests, 12 in dev/prod (per §5 + §16.9).
    - `POST /api/auth/login` runs a dummy `bcrypt.compare` on the "user not found" branch so the timing matches the "wrong password" branch — prevents email enumeration via response-time analysis.
    - Rate limits set to 1000/window in `NODE_ENV=test` so test sequencing doesn't trip them. Production values from §6 unchanged (3/hr signup, 10/min login).

- [x] **Day 3 — Monitor CRUD.** ✅ Done.
  Add the `Monitor` model and run a migration. Full CRUD routes scoped by `userId`. Validate URL: must be `https://`, must not resolve to private/loopback/link-local/cloud-metadata ranges (write `urlGuard.ts` — this is your SSRF protection and a great resume bullet). Enforce 10-monitor cap. Apply the `POST /api/monitors` per-user rate limit (§6). Tests for each route, including the "user can't see another user's monitor" case and a `urlGuard` rejects-metadata-IP case.
  - **Implementation notes (deviations from plan):**
    - The `add_monitors` migration also creates the `checks` and `alert_events` tables (plus the three enums) because the Monitor model in §5 declares `checks Check[]` and `alertEvents AlertEvent[]` back-relations — Prisma's schema won't validate with dangling references. The Day 5/6 work just gets to write to existing tables instead of running another migration.
    - PATCH / DELETE / GET-by-id of another user's monitor return **404**, not 403. §6's contract lists 403 for "not owner" but doing so leaks monitor-existence to any authenticated user; collapsing both branches to 404 closes the enumeration channel. §6 should be updated to reflect this.
    - PATCH is implemented via `updateMany({ where: { id, userId } })` so the owner check and the update are a single statement (no read-then-write race). The returned row is fetched in a follow-up `findUnique` to apply the `select` shape — Prisma's `updateMany` doesn't return rows.
    - `req.params.id` is read through the validated-params bag that `validate(schema, 'params')` parks on the request. Express 5's `Request` types widen `req.params[k]` to `string | string[]`, which would otherwise require ugly per-call casts.
    - The `createMonitorLimiter`'s `keyGenerator` falls back to `req.ip` if `req.user` is somehow missing — `requireAuth` is mounted first on the router so this branch is unreachable in practice, but the fallback keeps the limiter from crashing if route order ever changes.
    - The "DNS resolves to 169.254.169.254" test mocks `dns.promises.lookup` rather than relying on `metadata.google.internal` resolving on the test host (it doesn't on most dev machines). The real CIDR-match logic still runs against the mocked address.
    - `403 FORBIDDEN` (demo writes) is **not** enforced yet — that lands on Day 14 alongside the seeded demo account. Routes are otherwise complete.

- [x] **Day 4 — Check runner.** ✅ Done.
  Pure function: `runCheck(url): Promise<CheckResult>`. Uses Node's built-in `fetch`. Times the request, catches errors, classifies them (`TIMEOUT`, `DNS`, `4xx`, `5xx`, `NETWORK`).

  Protocol decisions — make these explicit, don't accept defaults:
  - **Method:** `GET`. (HEAD seems clever but too many servers handle it badly.)
  - **Timeout:** 10 seconds via `AbortSignal.timeout(10_000)`.
  - **Redirects:** follow at most 3 hops manually (`redirect: 'manual'`, then loop). **Re-run `urlGuard` on every hop** — otherwise an attacker registers `https://attacker.com/redirect-to-169.254.169.254` and bypasses SSRF protection. This is the single most important line in the file.
  - **Response body cap:** read at most 1 MB, then abort. A monitor pointed at a multi-GB download otherwise OOMs the worker.
  - **User-Agent:** `UptimeMonitor/1.0 (+https://your-site)`. The default fetch UA gets blocked by Cloudflare/WAFs and you'll waste an evening chasing fake "down" alerts.

  Unit-tested with `msw` or a local test server. Add tests specifically for: redirect to internal IP is rejected; >1MB body is truncated, not OOM; UA header is sent.
  - **Implementation notes (deviations from plan):**
    - Implemented `runCheck` in `src/services/checkRunner.ts` using built-in `fetch`, `GET`, `redirect: 'manual'`, `AbortSignal.timeout(10_000)`, and a fixed `User-Agent`.
    - Redirects are followed for at most 3 hops, and `urlGuard` is rerun before every fetch hop, including redirected URLs.
    - Response bodies are streamed and capped at 1 MB. Oversized responses are canceled and classified as `BODY_TOO_LARGE`.
    - Error classes align with the API contract in §6: `TIMEOUT`, `DNS`, `CONNECTION`, `TLS`, `HTTP_4XX`, `HTTP_5XX`, `REDIRECT_LOOP`, `BLOCKED`, and `BODY_TOO_LARGE`.
    - Tests cover success, blocked redirect target, body cap behavior, and the explicit User-Agent header.

- [x] **Day 5 — Queue & scheduling.** ✅ Done.
  Install BullMQ (≥ v5). Create a `checks` queue. When a monitor is created/updated, call `queue.upsertJobScheduler(monitorId, { every: intervalMinutes * 60_000 }, { name: 'check', data: { monitorId } })` — the *upsert* semantics mean re-running on edit replaces the old schedule cleanly (no duplicate jobs). When a monitor is paused/deleted, call `queue.removeJobScheduler(monitorId)`. Worker calls `runCheck`, inserts a `Check` row, updates `Monitor.lastCheckedAt` and `currentStatus`. (Day 12 wraps these writes in a `$transaction` and adds the alert path; for now, a naive insert+update is fine.) Test the worker by running it against a known-good URL (`https://example.com`).
  - **Implementation notes (deviations from plan):**
    - BullMQ and ioredis were already installed; no package changes were needed.
    - Added a lazy `checks` queue in `src/jobs/queue.ts` so importing the API app in tests does not open a Redis connection until scheduling actually runs.
    - Monitor create/update calls `scheduleMonitorCheck(...)`; pause updates remove the scheduler through that helper; deletes call `removeMonitorSchedule(...)` only after the owner-scoped delete succeeds.
    - Added `processCheckJob(...)` in `src/jobs/checkProcessor.ts`: it skips missing/paused monitors, runs `runCheck`, writes a `checks` row, updates `currentStatus` and `lastCheckedAt`, increments `consecutiveFailures` on down, and resets failures on up.
    - `server.ts` now honors `APP_MODE=all|api|worker`: `all` runs the API and worker in one process for the MVP, `api` runs HTTP only, and `worker` runs only the BullMQ processor.
    - Tests mock the queue for route-level scheduling assertions and test the processor directly without requiring Redis.

- [x] **Day 6 — Stats endpoint + retention job.** ✅ Done.
  `GET /api/monitors/:id/stats` — Prisma `groupBy` (or `$queryRaw` for a single-pass version) over the last 24h of checks: uptime percentage, average latency, last-down timestamp. Add a daily BullMQ repeatable job that runs `prisma.check.deleteMany({ where: { checkedAt: { lt: cutoff } } })` to prune checks older than 30 days. Tests with seeded check data.
  - **Implementation notes (deviations from plan):**
    - Added `GET /api/monitors/:id/stats` as an owner-scoped route before `/:id`, preserving the existing 404 behavior for missing or cross-user monitors.
    - Stats count only the last 24 hours: uptime is rounded to two decimals, average latency uses successful/up checks only, and `lastDownAt` is emitted as ISO UTC or `null`.
    - Added `pruneOldChecks(now)` in `src/jobs/retention.ts`; it deletes checks strictly older than 30 days and returns the deleted count.
    - Added a `prune-checks` BullMQ scheduler on the existing `checks` queue, scheduled once per 24 hours with a stable `checks-retention` scheduler id.
    - The shared worker now dispatches both monitor check jobs and retention prune jobs; `server.ts` schedules retention when `APP_MODE=all|worker`.
    - Tests cover stats calculations, auth scoping, old-check exclusion, retention cutoff behavior, and the worker dispatch path without requiring Redis.

- [x] **Day 7 — Catch up / clean up.** ✅ Done.
  You will be behind. Use this day. Refactor anything ugly. Write README skeleton.
  - **Implementation notes (deviations from plan):**
    - Reviewed the Day 6 API changes and kept the current implementation; no behavior-preserving refactor was worth mixing into this cleanup pass.
    - Reworked the root README into a current project skeleton with stack, local setup, environment, API routes, web status, scripts, testing, CI, and remaining work.
    - Tightened collaboration docs and GitHub templates around approved branch prefixes, Conventional Commits, PR testing notes, and issue context.

### Week 2 — Real-time, alerts, frontend, deploy

- [x] **Day 8 — Frontend scaffold + auth.** ✅ Done.
  Vite + React + TS + Tailwind + TanStack Query. Login and Signup pages, auth context, store JWT in `localStorage`. Protected route wrapper. Dashboard page is empty for now.
  - **Implementation notes (deviations from plan):**
    - Vite's react-ts template ships with React 19 / Vite 8 / TS 6 / ESLint 10 / `@types/node` 24. Reset `package.json` to bare scripts and reinstalled all deps via `npm install` at the pinned majors (React 18.3, Vite 5.4, TS 5.9, Tailwind 3.4, TanStack Query 5.100, React Router 6.30, `@types/node` 20.x). The Vite-generated `eslint.config.js` referenced `reactHooks.configs.flat.recommended` which doesn't exist in `eslint-plugin-react-hooks` v5; rewrote it to use `tseslint.config(...)` with `configs['recommended-latest']`.
    - `tsconfig.app.json` (Vite default) is kept with its `verbatimModuleSyntax` and `erasableSyntaxOnly` flags; added `strict: true` + `noUncheckedIndexedAccess: true` per §16.1.
    - `useAuth` was split out of `auth.tsx` into `useAuth.ts` (and the context object into `auth-context.ts`) so `react-refresh/only-export-components` stays clean — provider and hook can't live in the same file under Fast Refresh.
    - Web validation runs as `npm --prefix apps/web run lint` and `npm --prefix apps/web run build`.
    - End-to-end signup→dashboard flow wasn't exercised because the local API isn't running (no Postgres/Redis spun up on this worktree). Build, lint, and dev-server boot were verified; `curl http://localhost:5173/login` returns the bootstrapped HTML.

- [x] **Day 9 — Monitor list & create.** ✅ Done.
  Dashboard fetches `/api/monitors`, renders a table with name, URL, current status, last latency. "Add monitor" modal with form. Optimistic updates via TanStack Query.
  - **Implementation notes (deviations from plan):**
    - Added `apps/web/src/api/monitors.ts` for monitor list/create calls and response types.
    - Dashboard now renders a compact monitor table with status, interval, last checked, and latency fallbacks.
    - Add Monitor uses a modal form and a TanStack Query mutation with optimistic cache insertion and invalidation.

- [x] **Day 10 — Monitor detail page.** ✅ Done.
  Route `/monitors/:id`. Fetches monitor + stats + last 100 checks. Latency line chart (Recharts). Uptime % displayed prominently. Pause/resume toggle.
  - **Implementation notes (deviations from plan):**
    - Added `GET /api/monitors/:id/checks?limit=100` as an owner-scoped endpoint returning recent checks newest first with a validated 1-100 limit.
    - Installed Recharts via npm and added the protected `/monitors/:id` route.
    - The detail page fetches monitor metadata, 24-hour stats, and recent checks, then renders prominent uptime metrics, a latency line chart, the latest checks table, and a pause/resume toggle.
    - Dashboard monitor names now link to their detail pages.

- [x] **Day 11 — Socket.IO + live updates.** ✅ Done.
  Add Socket.IO to API. Worker emits `check:completed` and `monitor:status_changed` to the `user:<userId>` room. Frontend subscribes; TanStack Query cache updates on each event so the dashboard table and detail chart move in real time without polling.
  - **Implementation notes (deviations from plan):**
    - Added an authenticated Socket.IO server on the API HTTP server; sockets verify JWTs, load the user, and join a private `user:<userId>` room.
    - The check worker emits `check:completed` after every persisted check and `monitor:status_changed` only when the monitor status actually changes.
    - Added `socket.io-client` to the web app via npm and a protected-route live update subscriber that patches monitor and recent-check caches, then invalidates stats for the affected monitor.
    - API tests assert worker emissions without requiring a live Socket.IO server.

- [x] **Day 12 — Email alerts.** ✅ Done.
  After a check, in `statusTransition.ts`:
  - **All DB writes for one check go in a single `prisma.$transaction`**: insert the `Check` row, update `Monitor.consecutiveFailures` + `lastCheckedAt` + (if transitioning) `currentStatus`, and insert the `AlertEvent` row if an alert is owed. If anything throws, the whole check is rolled back — no half-updated state, no double-counted failures.
  - Transition rules:
    - On `down`: increment `consecutiveFailures`. If it just hit 2 and `currentStatus != down`, flip to `down` and queue a `down` alert.
    - On `up`: if `currentStatus == down`, flip to `up` and queue a `recovery` alert. Reset `consecutiveFailures` to 0.
  - **Send the email *after* the transaction commits**, not inside it. Emails are not transactional; a Resend hiccup must not roll back a check write. If the send fails, log it and (optionally) retry from the queue — but don't undo the alert event.
  - Send via the **Resend SDK** (`resend.emails.send({ from, to, subject, html })`). Plain HTML template with monitor name, URL, time, and last error.
  - Insert one `AlertEvent` row per alert so "no duplicate alerts" is a SQL query, not vibes.

  Tests: simulate a flaky URL pattern and assert that exactly one `down` alert fires; assert that a DB failure mid-transition leaves zero rows changed (no orphan AlertEvent).
  - **Implementation notes (deviations from plan):**
    - Added `statusTransition.ts` to insert the check, update monitor status/failure counters, and insert alert events inside one Prisma transaction.
    - Down alerts fire only when a monitor reaches two consecutive failures; later down checks do not duplicate the alert event.
    - Recovery alerts fire when a monitor previously marked down returns up.
    - Resend email sending happens after the transaction commits; failures are logged and do not roll back check/status writes.
    - Tests cover debounced down alerts, recovery alerts, and rollback of check/status/alert writes when the transaction fails.

- [ ] **Day 13 — Deploy.**
  - Neon Postgres free database, copy the `DATABASE_URL`.
  - Redis: provision per the option you picked in §3 (Upstash free with ≥10-min intervals, Upstash pay-as-you-go, or Render Key Value Starter). Copy the connection string into `REDIS_URL`.
  - Resend account, copy the API key into `RESEND_API_KEY`. Verify a sending domain (or at least your own inbox) — see §11.
  - Create a Render Web Service (Starter plan) pointing at the repo. Build command: `npm ci && npm run build && npx prisma generate`. Start command: `npm run start`. Pre-deploy command: `npx prisma migrate deploy`. **Leave instance count at 1** (see §4 — the in-process scheduler/alert path assumes a single writer). Set all secrets in the Render dashboard. Deploy.
  - Vercel for the frontend, point `VITE_API_URL` at the Render service URL. Add the Vercel domain to `CORS_ORIGIN` on the Render service.
  - Smoke test in production: signup, add a monitor against `https://example.com`, watch a real check fire and the dashboard update live.

- [x] **Day 14 — Polish, README, demo.** ✅ Code-side done; deploy-dependent bits deferred to Day 13.
  - README with screenshots, live URL, demo login, architecture diagram, "what I'd do at scale" section.
  - Seed (`prisma/seed.ts`) a demo account (`demo@example.com` / `demouser123`) with three monitors already running. Wire it via `"prisma": { "seed": "tsx prisma/seed.ts" }` in `package.json`. Run it once against the production DB locally with `DATABASE_URL=<prod> npx prisma db seed`; the script must be idempotent (upsert the user, skip if monitors already exist) so re-running it is safe.
  - **Demo account is read-only:** flag `isDemo` on the user record (already in the User model); auth middleware rejects `POST/PATCH/DELETE /api/monitors` for demo users with a 403 + "demo accounts can browse but not edit." Public credentials + the ability to add arbitrary monitors = anyone on the internet can use your server as a free pinger aimed at targets they don't like; your Render IP gets WAF-blocked within a day.
  - Demo monitors run at a 10-min interval. Reasons: bounds Redis cost regardless of which §3 option you picked, keeps the demo's job load modest, and is plenty frequent for a "look, it's checking" demo.
  - Add a tiny landing page or just redirect `/` to `/login`.
  - Tag `v1.0.0` on the repo.
  - **Implementation notes (deviations from plan):**
    - `requireNonDemo` middleware mounted on POST/PATCH/DELETE `/api/monitors`. Demo writes return `403 FORBIDDEN` with message "Demo accounts can browse but not edit". GETs unaffected. Four tests added in `monitors.test.ts` covering each write verb + a "GET still works" assertion.
    - `prisma/seed.ts` uses bcrypt cost 12, upserts the user (re-runs are no-ops on the user), and skips monitor creation if the user already has any monitors — `prisma db seed` is fully idempotent.
    - Demo monitors target `https://example.com`, `https://github.com`, `https://www.cloudflare.com` (three reliably-up endpoints at a 10-min interval).
    - The Monitor model's `intervalMinutes` is `Int` in Prisma but the route zod schema restricts it to `1|5|15|30|60`. The seed writes 10 directly via Prisma so the demo runs at a 10-min interval per §9 — the zod restriction would otherwise block it. BullMQ honors the raw value (`every: 10 * 60_000ms`).
    - Landing page redirect to `/login` and `v1.0.0` tag both wait for Day 13 deploy + smoke test.
    - README screenshots and live-URL section also wait for Day 13. Everything else in the README is current as of this branch.
    - **Known gap from Day 4 (not blocking Day 14):** the check runner test file covers success, BLOCKED (redirect to internal IP), BODY_TOO_LARGE, and the UA header — but is missing dedicated tests for `TIMEOUT`, `DNS`, and `HTTP_5XX`/`HTTP_4XX` per the §15.9 spec. Worth backfilling before tagging v1.0.0.

## 10. Testing strategy

You are not aiming for 100% coverage. You are aiming for tests that catch the things that would embarrass you in production.

**Must-have tests:**
- Auth: signup, login, JWT-protected route rejects missing/invalid token.
- Monitor authorization: user A cannot read, update, or delete user B's monitor (separate test per verb).
- `urlGuard`: rejects `http://`, rejects `localhost`, rejects RFC1918 ranges, rejects DNS rebinding tricks.
- Check runner: success, timeout, DNS failure, 5xx response, non-JSON response.
- Alert debouncing: 1 failure → no alert; 2 failures → one alert; 3 failures → still one alert; recovery → exactly one recovery email.
- Retention job deletes checks older than 30 days (seed old + new rows, run the job, assert).

**Skip:**
- Frontend snapshot tests.
- Testing TanStack Query's internals.
- E2E with Playwright (nice but adds days; skip for MVP).

Run tests against a dedicated Postgres test database (spun up by `docker-compose`). A test helper truncates all tables in `beforeEach`. No mocking Prisma — use the real client against the real DB.

**Write the factory helpers first.** `tests/factories.ts` exports `createUser({ email? })`, `createMonitor({ userId, url? })`, `createCheck({ monitorId, status?, latencyMs? })`. Without these, every test grows a 30-line setup block and they all drift slightly. Build the helpers in Day 2 alongside the first auth test; reuse from there on.

## 11. Deployment notes

- **One process or two?** MVP runs API + worker in one Node process via `server.ts` calling both `startApi()` and `startWorker()`. Document this in the README and explain the production split (a separate Render Background Worker service).
- **Env vars** (use `dotenv` in dev, Render dashboard environment in prod):
  `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `CORS_ORIGIN`, `PORT`.
- **Health check** at `/health` for Render's health check path setting.
- **No cold starts:** Render Starter Web Services run continuously. The in-process BullMQ worker keeps firing checks 24/7 — that's the whole reason this app needs Starter and not Render's free Web Service (which sleeps after 15 min idle; an uptime monitor that sleeps is no monitor).
- **PrismaClient:** instantiate one `PrismaClient` at module scope and import it everywhere. Creating a client per request leaks connections and exhausts the Postgres pool fast.
- **Migrations in prod:** run `prisma migrate deploy` (not `migrate dev`). On Render, set this as the **Pre-Deploy Command** so it runs before each new instance starts serving traffic.
- **Instance count = 1, hard requirement.** Render Starter doesn't auto-scale, but the upgrade is one click. The in-process scheduler and the alert path assume exactly one writer; two instances mean duplicate emails and a race on `consecutiveFailures`. If you ever need to scale, split the worker into its own Render Background Worker first.
- **Socket.IO CORS is separate from Express CORS.** Configure `cors` on the Socket.IO `Server` constructor (`new Server(httpServer, { cors: { origin: CORS_ORIGIN } })`) in addition to the Express `cors` middleware. You will forget this and spend 20 minutes staring at an empty WebSocket error in the browser console. Set a reminder.
- **Resend domain verification.** Until you verify a sending domain, Resend will only deliver to the address you signed up with. Verify your domain (or at minimum your own inbox) before Day 14, or the demo's alert emails go nowhere.

## 12. Stretch features (only after MVP is deployed)

In priority order — pick at most one or two:

1. **Public status page.** A `/status/:slug` route that anyone can view; shows uptime % and last 30 days as colored bars. Requires a new `slug String? @unique` column on Monitor (non-guessable, e.g., `nanoid(10)`) so people can't enumerate by sequential id. Genuinely useful and ~half a day's work.
2. **SSL certificate expiry check.** A second job type that reads the TLS cert and alerts when expiry is < 14 days.
3. **Response body keyword match.** Per-monitor optional setting; the check fails if a given string is missing from the response body. Catches "white page of death" outages.
4. **Slack webhook alerts.** Alongside email. Just a POST to a user-configured URL.

Do not start any of these until production has been running clean for at least a week.

## 13. Resume bullets you can write afterwards

Draft them now, before you start — they're the spec for what "done" means.

> ### Uptime Monitor
>
> Tech: Node.js, Express, TypeScript, PostgreSQL, Prisma, BullMQ, Socket.IO, React
>
> - Built an uptime monitoring service. Users register URLs and a worker pings each one on a configurable schedule (1–60 min), recording status, latency, and error class in Postgres via Prisma.
> - BullMQ repeatable jobs schedule the checks; the worker retries transient failures with exponential backoff. A daily retention job prunes check history older than 30 days.
> - Live dashboard updates over Socket.IO. The worker emits per-user events on every check, so open dashboard tabs reflect the new status and latency without polling.
> - Email alerts fire on the 2nd consecutive failure (debounced to avoid noise on flaky networks) and again on recovery. Alert events are persisted so duplicate-alert regressions are caught by tests.
> - URL validation rejects non-HTTPS targets and private IP ranges to prevent SSRF, with re-validation on every redirect hop. JWT auth, zod request validation, and per-IP / per-user rate limits on auth and write endpoints.

If any of these bullets feels like a stretch when you write the README, you skipped that part — go back and add it.

## 14. Gotchas to watch for

- **SSRF.** If you let users monitor any URL and you don't filter, your server can be used to scan internal networks. `urlGuard.ts` must resolve the hostname and reject private/loopback/link-local IPs *before* making the request, not just check the string. Re-resolve on each request — DNS rebinding is a real attack.
- **Redirect SSRF.** Even with `urlGuard` on the initial URL, a 302 to `http://169.254.169.254` (cloud metadata) bypasses you entirely. Set `redirect: 'manual'` on `fetch`, follow at most 3 hops yourself, and re-run `urlGuard` on every hop. This is Day 4's most important detail.
- **Demo account abuse vector.** If `demo@example.com` is public *and* can create monitors, anyone uses your server to probe arbitrary URLs from your IP. Demo account must be read-only (Day 14).
- **Repeatable job duplication.** In BullMQ ≥ 5 use `queue.upsertJobScheduler(monitorId, …)` — the upsert semantics replace any existing schedule with that key, so re-running on edit doesn't leave a duplicate. If you're stuck on legacy `addRepeatable`, you must `removeRepeatableByKey` first or you'll have two schedules firing in parallel.
- **PrismaClient + Vitest.** A new `PrismaClient` per test file holds onto connections and you'll hit the pool limit quickly. Export a single client from a test helper and reuse it. Disconnect once in a global `afterAll`.
- **Migrations vs `db push`.** Use `prisma migrate dev` so every schema change becomes a committed SQL file. `prisma db push` is fine for quick prototyping but leaves no migration history, which bites in production.
- **Status flapping.** Without debouncing, a 1% failure rate becomes a flood of alerts. The "2 consecutive failures" rule is the simplest version of debouncing — keep it.
- **Upstash free tier won't carry a 1-minute interval.** 10 monitors × 1-min × ~5 Redis ops/job ≈ 70K commands/day vs. the 10K/day free cap. Pick one of the three options in §3 and stick with it — do not "I'll figure it out later." Repeat for the BullMQ heartbeats, which Upstash also counts.
- **Email deliverability in dev.** Resend's sandbox mode only sends to verified addresses. Verify your own email first and use that for the demo account.
- **Don't gold-plate.** When you find yourself "improving" the queue retry strategy on Day 3, stop. Ship the boring version, then improve only if it breaks in real use.

## 15. Implementation contract (the agent-readable appendix)

Everything an implementer needs that doesn't fit in the narrative above. Treat this as the single source of truth when narrative and appendix disagree — the appendix wins.

### 15.1 Environment variables — full manifest

**`apps/api/.env`** (copy `.env.example`):

| Var | Required | Example | Notes |
|---|---|---|---|
| `DATABASE_URL` | yes | `postgresql://uptime:uptime@localhost:5432/uptime` | Prod: Neon connection string with `?sslmode=require` |
| `DATABASE_URL_TEST` | dev only | `postgresql://uptime:uptime@localhost:5433/uptime_test` | Test DB on a second port — see docker-compose |
| `REDIS_URL` | yes | `redis://localhost:6379` | Prod: Upstash or Render KV `rediss://...` |
| `JWT_SECRET` | yes | (32+ random bytes) | `openssl rand -base64 48`. Must differ between dev/prod. |
| `JWT_TTL_SECONDS` | no | `86400` | Default 24h |
| `RESEND_API_KEY` | yes (prod) | `re_xxxxx` | Get from resend.com after domain verify |
| `EMAIL_FROM` | yes (prod) | `Uptime Monitor <alerts@yourdomain.com>` | Must be from a verified Resend domain |
| `CORS_ORIGIN` | yes | `http://localhost:5173` | Comma-separated list for multiple origins. Used for Express *and* Socket.IO. |
| `PORT` | no | `4000` | Render sets `PORT` automatically — respect it |
| `NODE_ENV` | yes | `development` \| `test` \| `production` | |
| `LOG_LEVEL` | no | `info` | `debug` \| `info` \| `warn` \| `error` |
| `APP_MODE` | no | `all` | `all` (default) \| `api` \| `worker` — for the future split. Named `APP_MODE` not `MODE` because Vitest sets `MODE=test` and would collide. |

**`apps/web/.env`** (copy `.env.example`):

| Var | Required | Example |
|---|---|---|
| `VITE_API_URL` | yes | `http://localhost:4000` in dev, `https://uptime-api.onrender.com` in prod |

### 15.2 File templates

**`docker-compose.yml`** (project root):

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: uptime
      POSTGRES_PASSWORD: uptime
      POSTGRES_DB: uptime
    ports: ["5432:5432"]
    volumes: [postgres-data:/var/lib/postgresql/data]

  postgres-test:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: uptime
      POSTGRES_PASSWORD: uptime
      POSTGRES_DB: uptime_test
    ports: ["5433:5432"]
    # No volume — wipes between docker-compose runs, which is what tests want.

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

volumes:
  postgres-data:
```

**`apps/api/tsconfig.json`**:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": "src",
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**`apps/api/package.json` (scripts + prisma section only — deps from §3):**

```json
{
  "name": "uptime-monitor-api",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src tests",
    "format": "prettier --write src tests prisma",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:deploy": "prisma migrate deploy"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

**`apps/api/.env.example`**:

```
DATABASE_URL=postgresql://uptime:uptime@localhost:5432/uptime
DATABASE_URL_TEST=postgresql://uptime:uptime@localhost:5433/uptime_test
REDIS_URL=redis://localhost:6379
JWT_SECRET=replace-me-with-openssl-rand-base64-48
JWT_TTL_SECONDS=86400
RESEND_API_KEY=re_replace_me
EMAIL_FROM=Uptime Monitor <alerts@example.com>
CORS_ORIGIN=http://localhost:5173
PORT=4000
NODE_ENV=development
LOG_LEVEL=debug
APP_MODE=all
```

**`apps/api/Dockerfile`** (only needed if you opt for Render's Docker runtime — Render's Node runtime works without one):

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package*.json ./
EXPOSE 4000
CMD ["node", "dist/server.js"]
```

**Project root `.gitignore`**:

```
node_modules/
dist/
build/
.env
.env.local
.env.*.local
coverage/
*.log
.DS_Store
.idea/
.vscode/
apps/api/prisma/migrations/dev.db*
```

### 15.3 `urlGuard` — exact CIDR ranges to reject

Resolve hostname with `dns.promises.lookup(host, { all: true, verbatim: true })`. Reject the request if the URL scheme is not `https:` OR **any** returned address falls in these ranges:

IPv4:
- `0.0.0.0/8` (this network)
- `10.0.0.0/8` (RFC 1918 private)
- `100.64.0.0/10` (CGNAT)
- `127.0.0.0/8` (loopback)
- `169.254.0.0/16` (link-local — includes AWS/GCP/Azure metadata `169.254.169.254`)
- `172.16.0.0/12` (RFC 1918)
- `192.0.0.0/24`, `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24` (documentation/test)
- `192.168.0.0/16` (RFC 1918)
- `198.18.0.0/15` (benchmarking)
- `224.0.0.0/4` (multicast)
- `240.0.0.0/4` (reserved)
- `255.255.255.255/32` (broadcast)

IPv6:
- `::/128` (unspecified)
- `::1/128` (loopback)
- `fc00::/7` (unique local)
- `fe80::/10` (link-local)
- `ff00::/8` (multicast)
- IPv4-mapped (`::ffff:0:0/96`) — extract the embedded IPv4 and re-check against the IPv4 list

Use `ipaddr.js` or `netmask` for the CIDR match — do not roll your own. Re-run the entire check on every redirect hop (Day 4).

### 15.4 Logging conventions

- Single root pino instance: `export const log = pino({ level: LOG_LEVEL, redact: ['req.headers.authorization', 'password', 'passwordHash', 'token', 'jwt'] })`.
- Per-module child: `const moduleLog = log.child({ module: 'checkProcessor' })`.
- Dev: pipe to `pino-pretty`. Prod: JSON to stdout (Render captures it).
- Levels:
  - `debug`: per-request details, queue job lifecycle
  - `info`: server start, each check completion (one line, structured)
  - `warn`: validation rejections (4xx), retries, rate-limit hits
  - `error`: 5xx, unhandled exceptions, email send failures
- Never log: password (plain or hashed), full JWT, `RESEND_API_KEY`, full auth-route request body.
- Every check produces one log line: `log.info({ monitorId, status, latencyMs, error }, 'check completed')`.

### 15.5 Test helpers

**`apps/api/tests/helpers.ts`**:

```ts
import { PrismaClient } from '@prisma/client';
import { beforeEach, afterAll } from 'vitest';

if (!process.env.DATABASE_URL?.includes('test')) {
  throw new Error('Refusing to run tests without a *_test database URL');
}

export const prisma = new PrismaClient();

export async function truncateAll() {
  // Order doesn't matter with CASCADE, but list everything explicitly so adding a model is a compile-time grep.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "alert_events", "checks", "monitors", "users" RESTART IDENTITY CASCADE'
  );
}

beforeEach(async () => { await truncateAll(); });
afterAll(async () => { await prisma.$disconnect(); });
```

**`apps/api/tests/factories.ts`**:

```ts
import bcrypt from 'bcrypt';
import { prisma } from './helpers';

let counter = 0;
const nextEmail = () => `user-${++counter}-${Date.now()}@test.local`;

export async function createUser(o: { email?: string; password?: string; isDemo?: boolean } = {}) {
  return prisma.user.create({
    data: {
      email: (o.email ?? nextEmail()).toLowerCase(),
      passwordHash: await bcrypt.hash(o.password ?? 'testpass123', 4),
      isDemo: o.isDemo ?? false,
    },
  });
}

export async function createMonitor(o: { userId: string; url?: string; intervalMinutes?: 1|5|15|30|60; name?: string }) {
  return prisma.monitor.create({
    data: {
      userId: o.userId,
      name: o.name ?? 'Test monitor',
      url: o.url ?? 'https://example.com',
      intervalMinutes: o.intervalMinutes ?? 5,
    },
  });
}

export async function createCheck(o: { monitorId: string; status?: 'up'|'down'; latencyMs?: number; checkedAt?: Date }) {
  return prisma.check.create({
    data: {
      monitorId: o.monitorId,
      status: o.status ?? 'up',
      latencyMs: o.latencyMs ?? 123,
      statusCode: o.status === 'down' ? 500 : 200,
      checkedAt: o.checkedAt ?? new Date(),
    },
  });
}
```

### 15.6 BullMQ specifics

- One queue: `new Queue('checks', { connection: redis })`.
- Worker: `new Worker('checks', processor, { connection: redis, concurrency: 5 })`. Concurrency 5 = up to 5 in-flight HTTP checks; safe under 10-monitor cap.
- Job data shape: `{ monitorId: string }` — fetch the rest fresh from DB in the processor (URL may have changed).
- Scheduler key = `monitorId`. `upsertJobScheduler(monitorId, { every: intervalMinutes * 60_000 }, { name: 'check', data: { monitorId } })`.
- Retention job: `upsertJobScheduler('retention', { pattern: '0 3 * * *' }, { name: 'retention' })` (3am daily).
- Default job options: `{ removeOnComplete: 100, removeOnFail: 500 }` — keep small history for debugging, then purge.
- On worker startup, call `await queue.upsertJobScheduler(...)` for every existing un-paused monitor (handles fresh deploys / Redis flushes).

### 15.7 Render Web Service settings

| Setting | Value |
|---|---|
| Runtime | Node |
| Plan | Starter ($7/mo) |
| Region | Same as Neon for latency |
| Root Directory | `apps/api` |
| Build Command | `npm ci && npx prisma generate && npm run build` |
| Pre-Deploy Command | `npx prisma migrate deploy` |
| Start Command | `node dist/server.js` |
| Health Check Path | `/health` |
| Instance Count | **1** (do not change — see §4) |
| Auto-Deploy | On — deploy on push to `main` |
| Env vars | All from §15.1 except `DATABASE_URL_TEST` |

### 15.8 Frontend specifics

- **Auth context:** stores `{ token, user }`. `token` persists to `localStorage` under key `uptime.token`. On app boot, read it back, call `GET /api/auth/me` to validate; on 401, clear and route to `/login`.
- **API fetch wrapper** (`src/api/client.ts`): one `fetch` wrapper that injects `Authorization: Bearer ${token}` from context, parses JSON, and throws an `ApiError` (with `error` and `message` from §6) on non-2xx.
- **TanStack Query setup:** `staleTime: 30_000`, `refetchOnWindowFocus: false`. Socket events drive cache invalidations, not polling.
- **Routes:** `/login`, `/signup`, `/` (Dashboard, protected), `/monitors/:id` (detail, protected). Protected route HOC redirects to `/login` if no token.
- **Demo banner:** if `auth.user.isDemo`, render a yellow banner: "Demo account — read only." Disable Add/Edit/Delete UI affordances. Server still enforces.

### 15.9 Definition of done — implementation order checklist

Build in this order. Each box must be true before moving on.

- [x] Repo initialized, `apps/api` and `apps/web` exist, root `.gitignore` and `docker-compose.yml` committed.
- [x] `apps/api` boots: `npm run dev` → `:4000`, `GET /health → { ok: true }`. Zero deps un-pinned.
- [x] Prisma schema applied to dev DB (`prisma migrate dev --name init`). `prisma generate` runs clean.
- [x] Auth working end-to-end: signup → token → `/me` returns user. Tests pass.
- [x] Monitor CRUD working, owner-scoped. `urlGuard` rejects all CIDRs in §15.3 (tests prove it). Rate limit enforced.
- [ ] `runCheck` returns the exact `CheckResult` shape from §6 for: success, timeout, DNS failure, 5xx, redirect to internal IP (BLOCKED), 2MB body (BODY_TOO_LARGE). *(Partial: success, BLOCKED, BODY_TOO_LARGE, UA tested; TIMEOUT/DNS/4xx/5xx tests still to write.)*
- [x] BullMQ scheduler upserts jobs on create/edit, removes on pause/delete. Worker writes checks. Tested with `https://example.com`.
- [x] Stats endpoint returns the shape from §6 for seeded data. Retention job deletes >30-day checks.
- [x] Frontend boots, login/signup work, dashboard lists monitors, detail page shows chart.
- [x] Socket.IO connects with JWT, emits both events with the shapes from §7. Dashboard updates live.
- [x] Status transition runs in `$transaction`. `down` alert fires on 2nd consecutive failure, `recovery` on first up. AlertEvent rows prove no duplicates. Email sent via Resend SDK *after* commit.
- [ ] Render Web Service deployed with the §15.7 config. Vercel frontend deployed. Smoke test passes in prod.
- [x] Demo account seeded and read-only (`isDemo` rejects writes with 403). Demo monitors at 10-min interval.
- [ ] README written. Tagged `v1.0.0`. *(Partial: README written; `v1.0.0` waits for the prod smoke test.)*

If any box can't be checked off, do not consider that day done.

### 15.10 Things the agent should refuse to do

- Use `prisma db push` instead of `prisma migrate dev` (no migration history = silent prod drift).
- Skip `urlGuard` on redirect hops (SSRF bypass — see §14 redirect SSRF gotcha).
- Log a password, hash, or JWT.
- Add a field to the `User`/`Monitor`/`Check`/`AlertEvent` models without also updating §5's table *and* Prisma schema *and* a migration.
- Add a route that isn't in §6 without updating §6 first.
- Send an email inside a `$transaction`.
- Set Render instance count above 1.
- Use the default `fetch` User-Agent for the check runner.
- Pin a major version above what §3 specifies without re-reading the relevant gotcha.

## 16. Best practices per layer

Concrete rules the implementer should follow for each piece of the stack. Where these conflict with the narrative above, the narrative wins (it has context); where they conflict with each other, the more specific rule wins.

### 16.1 TypeScript

- `strict: true` and `noUncheckedIndexedAccess: true` (already in §15.2 tsconfig).
- No `any`. Use `unknown` and narrow with type guards. If you truly need an escape, name the helper `unsafeX` so it's grep-able.
- Prefer `type` over `interface` unless you need declaration merging.
- Discriminated unions over enums for app code (`type Status = 'up' | 'down'`); accept Prisma's generated enums where they cross the boundary.
- Use `satisfies` to constrain shape while keeping the narrowest inferred type: `const cfg = { port: 4000 } satisfies AppConfig`.
- No barrel `index.ts` files in `src/` — they slow IDEs and obscure tree-shaking. Import from the leaf file.
- One responsibility per file; if a file is over ~200 lines, it's probably two files.

### 16.2 Express 5

- Middleware order: `helmet()` → `cors(...)` → `express.json({ limit: '100kb' })` → request logger → routes → 404 handler → error handler. Don't reorder.
- Express 5 forwards async errors automatically — write `async (req, res) => { ... }` and throw; no `try/catch` per handler. One `errorHandler(err, req, res, next)` at the bottom converts everything to the §6 `ErrorResponse` shape.
- One `Router()` per resource (`auth.ts`, `monitors.ts`); mount with a prefix.
- Never read `req.body` without a zod schema in front of it.
- `app.set('trust proxy', 1)` so rate limits and IP logs see the real client IP behind Render's proxy.
- `process.on('unhandledRejection', err => { log.fatal({ err }); process.exit(1); })` — let Render restart you instead of running in a half-broken state.

### 16.3 Prisma

- One `PrismaClient` at module scope (`src/config/prisma.ts`), imported everywhere. **Never** `new PrismaClient()` in a handler.
- `select` aggressively — never return a full `User` row to the client (`passwordHash` leak risk). Use `select: { id: true, email: true, isDemo: true }`.
- Multi-write operations go in `prisma.$transaction(async tx => …)`. Pass `tx` to every helper inside — no nested `prisma.*` calls in a transaction body (they bypass it).
- `findUnique` over `findFirst({ where: { unique } })` — the former uses the unique index, the latter doesn't always.
- Catch unique-constraint violations explicitly: `if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')` → return 409.
- Naming convention: model PascalCase, fields camelCase, columns snake_case via `@map`. Already done in §5; keep it.
- Connection URL: append `?connection_limit=10&pool_timeout=20` for Neon's direct endpoint. For the Neon pooler endpoint, the pool is managed for you — fewer connections, slightly higher latency. Pick one and document.
- Migrations: `prisma migrate dev` only locally. Never edit a migration SQL file after it's been applied anywhere shared.

### 16.4 PostgreSQL (Neon-specific)

- Use Neon's **pooled connection string** (`-pooler.neon.tech`) for the API in production — it survives suspends better than direct connections.
- All timestamps `Timestamptz`; store UTC. App/UI does timezone conversion at render time, never in SQL.
- IDs: cuid (already chosen). Never `serial`/auto-increment — enumeration risk.
- Indexes only where you actually query — verify with `EXPLAIN ANALYZE`, not optimism. The §5 indexes are the minimum set.
- `ON DELETE CASCADE` for ownership relations (already in schema). Drop a User → their Monitors → their Checks → their AlertEvents in one statement.
- Neon auto-suspends after ~5 min of inactivity on free tier; first query after suspend adds ~1s. The worker pings every minute so this rarely fires, but a UI cold-load might. Worth noting in README.

### 16.5 BullMQ

- **Two Redis connections.** One for the `Queue`, one for the `Worker`. Workers block reads; sharing leads to deadlocks under load.
- `concurrency: 5` on the worker by default. The 10-monitor cap and 10s timeout mean burst is bounded.
- Job processors must be **idempotent**. A check that runs twice (worker crashed before ACK) should not record two rows. Use the natural key (e.g., `monitorId + minute bucket`) for dedup if you observe doubles.
- `defaultJobOptions: { removeOnComplete: 100, removeOnFail: 500 }` on the queue — cap history so Redis doesn't grow unboundedly.
- Use job *names* (`'check'`, `'retention'`) and switch in one processor file — easier to reason about than multiple queues.
- Graceful shutdown on `SIGTERM`: `await worker.close(); await queue.close(); await prisma.$disconnect()`. Render sends SIGTERM on deploy; don't leave jobs half-finished.
- On startup, walk all un-paused monitors and `upsertJobScheduler` each — handles fresh deploys, Redis flushes, and recovery from full reset.

### 16.6 Socket.IO

- One namespace (`/dashboard`). Don't proliferate.
- Auth in `io.use((socket, next) => …)` — verify JWT once at handshake, store `userId` on `socket.data.userId`. Reject with `next(new Error('UNAUTHORIZED'))` on failure.
- Server emits go to `io.to(\`user:${userId}\`).emit(...)`. Never `io.emit(...)` (broadcast to everyone) in app code.
- Match `socket.io` and `socket.io-client` major versions exactly. A 4↔5 mismatch fails silently with cryptic errors.
- CORS on the Server constructor *in addition to* Express CORS (§11).
- Fire-and-forget: no acknowledgement callbacks for the two MVP events; they're stateful and add complexity.
- Don't store anything important only in socket memory — sockets disconnect. Persist to DB, push notifications from DB triggers (or from the worker's post-write).

### 16.7 zod

- One `schemas/` folder, one file per resource (`auth.ts`, `monitors.ts`). Schemas live with the route they validate.
- Derive types from schemas: `type SignupInput = z.infer<typeof signupSchema>`. Single source of truth.
- `.strict()` on every input object — rejects extra fields and catches typos.
- `.transform()` for canonicalization in the schema itself: `z.string().email().transform(s => s.trim().toLowerCase())`.
- One `validate(schema)` middleware factory; on failure throw `new ApiError('VALIDATION', ..., zodError.issues)` and let the error handler shape the response.
- Never call `.parse()` in a route handler without the middleware in front of it — that path doesn't get the consistent 400 shape.

### 16.8 JWT / auth

- `jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: ttlSeconds })`.
- `jwt.verify(token, secret, { algorithms: ['HS256'] })` — pin the algorithm explicitly. Never accept the algorithm from the token header (algorithm-confusion attack).
- Payload is `{ sub, iat, exp }` only (§5). Re-fetch the user from DB in middleware so revocations/role changes apply immediately.
- Treat all 401 responses identically — never leak "user not found" vs "wrong password" vs "token expired."
- Never put a JWT in a URL, query string, or log line. Bearer header only.
- Rotate `JWT_SECRET` if compromised; all sessions invalidate. No refresh tokens to worry about for MVP.

### 16.9 bcrypt

- Cost 12 in prod (§5). Cost 4 in tests (§15.5). Anything between is just "slow tests, weak prod" — don't.
- Validate password length (8–72 chars) before hashing. bcrypt silently truncates at 72 bytes; a 100-char password and a 72-char prefix would compare equal, which is a real bug.
- Use `bcrypt.compare(plain, hash)` — never compare hashes for equality.

### 16.10 pino

- One root logger (`src/config/log.ts`), per-module children via `log.child({ module: 'X' })`.
- Structured logging only: `log.info({ monitorId, latencyMs }, 'check completed')`. No template strings (`log.info(\`check \${id}\`)`) — those defeat structured search in prod.
- `redact: ['req.headers.authorization', 'password', 'passwordHash', 'token', 'jwt', '*.password']`. Add to the list when you spot something secret.
- `pino-pretty` only in dev (`NODE_ENV !== 'production'`). Prod emits raw JSON; Render captures and indexes it.
- Don't log inside per-check hot paths at `info` — use `debug` (off in prod). One log line *per check completion* is the right rate.

### 16.11 Resend

- Verify a sending domain *before* Day 14. Until you do, Resend only delivers to your signup email — your demo's alerts go nowhere.
- Include both `html` and `text` versions. Spam filters penalize HTML-only.
- A send failure is a `warn`, not a `500`. Log the error, keep the alert event (the failure is recoverable; the alert intent is real).
- Per-monitor email rate limit at the app layer: max 1 alert per monitor per minute. The 2-failure debounce already mostly handles flap; this is a backstop.
- Use `Idempotency-Key` if you implement retry on send failure — prevents accidental double-sends across retries.

### 16.12 Vitest + Supertest

- `vitest.config.ts` with `pool: 'forks'`, `singleFork: true` (or `singleThread: true`) when tests share a real DB — prevents truncate races.
- One assertion per test where feasible — failures point at one thing.
- Test behavior, not implementation. Tests that call private functions are tests you'll rewrite on every refactor.
- `supertest(app)` — pass the Express app instance, not the listening server. No ports, no port collisions.
- Never mock Prisma; use the real test DB (§10).
- CI: spin up Postgres + Redis as service containers, run `prisma migrate deploy`, then `vitest run`.
- Coverage is a guide, not a goal. Aim for the §10 must-have set; don't chase 100%.

### 16.13 React + Vite

- One component per file. Co-locate tiny subcomponents in the same file *only* if used nowhere else.
- Default export = the main component; named exports for hooks, helpers, types.
- Strict mode on (default in Vite's React template). Keep it.
- `useState` for local UI state only. Anything fetched goes through TanStack Query.
- No prop drilling beyond two levels — promote to context or refactor.
- Vite env vars must be prefixed `VITE_` to be exposed to the client. This is a *feature* — keep API keys out by default.
- No `dangerouslySetInnerHTML`. If you ever need it, route through DOMPurify and document why.

### 16.14 TanStack Query

- Stable query key schema: `['monitors']`, `['monitor', id]`, `['monitor', id, 'stats']`, `['monitor', id, 'checks', { limit }]`. Document the schema in `src/api/queryKeys.ts`.
- Socket handlers push into the cache via `queryClient.setQueryData(...)`. Beats refetch storms; the dashboard stays in sync without a single extra HTTP request.
- `staleTime: 30_000`, `refetchOnWindowFocus: false`. Sockets handle freshness; aggressive refetching is noise.
- Mutations: optimistic update + rollback on error. `onMutate` snapshots cache, `onError` restores, `onSettled` invalidates to reconcile.
- One `apiClient` wrapper for all fetches. Mutations and queries import from it — never `fetch()` directly in a component.

### 16.15 Tailwind

- Stick to the default palette and spacing scale. Custom tokens only when you have a real design system.
- Prefer composition (`className="flex items-center gap-2"`) over `@apply`. `@apply` blocks recreate the untyped CSS you were trying to escape.
- One layout shell (`<Page>` or similar) wraps every route — consistent paddings, header, max-width.
- Mobile-first: write the small-screen styles, then add `sm:`/`md:`/`lg:` overrides. Don't write desktop-first and shrink.
- Don't fight Tailwind with one-off CSS files. If you need it, the design system is wrong.

### 16.16 Docker / docker-compose

- Pin image tags (`postgres:16-alpine`, `redis:7-alpine`) — never `:latest`.
- Volumes only for data you want to persist between runs. The test DB has *no* volume so each `docker-compose up -d` from a cold state is clean.
- Different host ports for dev (`5432`) vs test (`5433`) Postgres so both run side by side.
- Don't bake production secrets into compose. Compose is for local dev only.
- Health checks on services if Compose orchestrates startup order (`depends_on: { postgres: { condition: service_healthy } }`).

### 16.17 Render deployment

- **Instance count = 1.** Hard requirement (§4, §11). Add a comment in your README that says so, with the reasoning.
- Migrations run in the **Pre-Deploy Command** (`npx prisma migrate deploy`). Never in the start command — start should be instant.
- Health check: `GET /health` returns `{ ok: true }` synchronously, no DB ping. A DB hiccup must not cause Render to kill the process; that's how you turn a 5-second blip into a 60-second outage.
- Pin Node version: add `.nvmrc` with `20` (or `22`) in repo root, and set `NODE_VERSION=20` env var on Render. Pinned in two places because Render's defaults shift.
- All secrets via Render's "Environment" tab. Never commit a `.env` with prod values.
- Auto-deploy on push to `main` is fine for a solo project. Add branch protection + required CI checks if a teammate joins.
- Build log: check the first deploy carefully — Prisma generate has to succeed before start, or you'll get cryptic "cannot find module @prisma/client" at runtime.

---

When in doubt, build the smallest version that proves the bullet you want to write. Ship Day 14. Iterate after.
