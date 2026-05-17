# Uptime Monitor

A TypeScript uptime monitoring service. Users register URLs they want monitored; a worker pings each one on its configured schedule, records the result in PostgreSQL via Prisma, pushes live updates over Socket.IO, and emails alerts on `up → down` (debounced) and recovery.

Build notes, sequencing, and architectural decisions live in [`plan.md`](./plan.md).

## Stack

- API: Node 20+, Express 5, TypeScript, Prisma, PostgreSQL, Redis, BullMQ, zod, pino.
- Web: Vite, React, React Router, TanStack Query, Tailwind CSS.
- Local infra: Docker Compose for PostgreSQL, test PostgreSQL, and Redis.
- CI: GitHub Actions for API lint, typecheck, test, and build.

## Repo Layout

```text
apps/
  api/   Express API, Prisma schema/migrations, workers, and tests
  web/   Vite React app with auth screens and dashboard scaffold
docker-compose.yml
CONTRIBUTING.md
plan.md
```

## Local Setup

Prerequisites:

- Node.js 20+
- npm
- Docker with Docker Compose

Start local services:

```bash
docker compose up -d
```

Run the API:

```bash
cd apps/api
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

The API defaults to `http://localhost:4000`. Health check:

```bash
curl http://localhost:4000/health
```

Run the web app in another terminal:

```bash
cd apps/web
cp .env.example .env
npm install
npm run dev
```

The web app defaults to `http://localhost:5173` and calls the API configured by `VITE_API_URL`.

## Environment

API env file: `apps/api/.env`

```text
DATABASE_URL=postgresql://uptime:uptime@localhost:5432/uptime
DATABASE_URL_TEST=postgresql://uptime:uptime@localhost:5433/uptime_test
REDIS_URL=redis://localhost:6379
JWT_SECRET=replace-me-with-at-least-32-characters
JWT_TTL_SECONDS=86400
RESEND_API_KEY=
EMAIL_FROM=
CORS_ORIGIN=http://localhost:5173
PORT=4000
NODE_ENV=development
LOG_LEVEL=debug
APP_MODE=all
```

Web env file: `apps/web/.env`

```text
VITE_API_URL=http://localhost:4000
```

## API

HTTP routes:

- `GET /health` - service health check (no DB ping; deep checks live elsewhere).
- `POST /api/auth/signup` - create a user and return a JWT. Rate-limited 3/hr per IP.
- `POST /api/auth/login` - authenticate and return a JWT. Rate-limited 10/min per IP.
- `GET /api/auth/me` - return the current authenticated user.
- `GET /api/monitors` - list monitors for the current user.
- `POST /api/monitors` - create a monitor and schedule checks. Rate-limited 5/min per user.
- `GET /api/monitors/:id` - fetch one owned monitor.
- `PATCH /api/monitors/:id` - update name, interval, or pause state.
- `DELETE /api/monitors/:id` - delete a monitor and remove its schedule.
- `GET /api/monitors/:id/checks?limit=N` - last N checks (default 100, max 500).
- `GET /api/monitors/:id/stats` - 24h uptime %, average latency, last-down timestamp.

Authenticated routes expect `Authorization: Bearer <token>`. All write paths run through `urlGuard` (rejects non-HTTPS and private/loopback/cloud-metadata IPs — re-checked on every redirect hop). Users are capped at 10 monitors.

Demo accounts (`isDemo=true` on the user record) are gated to read-only — POST/PATCH/DELETE return `403 FORBIDDEN`. Used by the seeded `demo@example.com` so anyone can browse without turning the deployed instance into a free pinger.

WebSocket namespace `/dashboard` (Socket.IO). Authenticated via the JWT in the handshake auth payload. Server-to-client events:

- `check:completed` - fires after every check.
- `monitor:status_changed` - fires on status transitions only (debounced for `down`).

## Web App

- Login and signup screens with client-side validation.
- Token-backed auth context, JWT persisted to `localStorage`, protected route wrapper.
- Dashboard monitor table with status, interval, last latency, and last-checked time.
- Add-monitor modal with optimistic TanStack Query mutations.
- Monitor detail page (`/monitors/:id`) with the 24h latency chart (Recharts), uptime %, last 100 checks, and pause/resume.
- Live updates over Socket.IO — dashboard and detail page reflect `check:completed` and `monitor:status_changed` events without polling.

A demo banner appears when the logged-in user has `isDemo=true`.

## Useful Scripts

API (`apps/api`):

- `npm run dev` - run the API/worker in watch mode using `.env`.
- `npm run build` - compile TypeScript.
- `npm start` - run the compiled server.
- `npm test` / `npm run test:watch` - run Vitest tests.
- `npm run lint` - lint API source and tests.
- `npm run typecheck` - typecheck without emitting files.
- `npm run prisma:generate` - generate Prisma client.
- `npm run prisma:migrate` - run local development migrations.
- `npm run prisma:deploy` - apply migrations in deployed environments.
- `npx prisma db seed` - upsert the demo account (`demo@example.com` / `demouser123`) and three sample monitors at a 10-min interval. Idempotent.

Web (`apps/web`):

- `npm run dev` - run the Vite dev server.
- `npm run build` - typecheck and build the web app.
- `npm run lint` - lint the web app.
- `npm run preview` - preview the production build.

## Testing And CI

API tests use Vitest, Supertest, PostgreSQL, Redis, Prisma, and MSW where needed. Local tests expect the Docker Compose services to be running:

```bash
docker compose up -d
cd apps/api
npm test
```

GitHub Actions currently runs API `lint`, `typecheck`, `build`, and `test` on pushes and pull requests targeting `main`. Web CI is not wired yet.

## Demo Account

A seeded read-only account is available for browsing:

- Email: `demo@example.com`
- Password: `demouser123`

The account ships with three sample monitors (example.com, github.com, cloudflare.com) at a 10-min interval. Demo users can browse everything but POST/PATCH/DELETE on `/api/monitors` returns `403`. Re-run `npx prisma db seed` any time — it's idempotent (upserts the user, skips monitor creation if any already exist).

## Current Status

Implemented (Days 1–12 + Day 14 polish per [`plan.md`](./plan.md)):

- Auth: signup, login, `/me`, JWT (HS256, payload `{ sub }` only, 24h TTL), bcrypt cost 12 in prod / 4 in tests, generic 401 on any login failure with timing-equalized compare to defeat email enumeration.
- Monitor CRUD with owner scoping, 10-monitor cap, per-user rate limit on create, and demo-account write-gate.
- `urlGuard.ts` SSRF protection covering all RFC1918, loopback, link-local (incl. AWS/GCP/Azure metadata `169.254.169.254`), CGNAT, multicast, and IPv4-mapped IPv6 ranges. Re-runs on every redirect hop in the check runner.
- Check runner with manual 3-hop redirect handling, 10s timeout via `AbortSignal.timeout`, 1 MB body cap, explicit `UptimeMonitor/1.0` UA. Errors classified into `TIMEOUT | DNS | CONNECTION | TLS | HTTP_4XX | HTTP_5XX | REDIRECT_LOOP | BLOCKED | BODY_TOO_LARGE`.
- BullMQ scheduling: `upsertJobScheduler` on create/edit, `removeJobScheduler` on pause/delete, daily retention job pruning checks older than 30 days.
- Stats endpoint: 24h uptime %, average latency, last-down timestamp.
- Live updates over Socket.IO `/dashboard` namespace, scoped to per-user rooms.
- Email alerts via the Resend SDK, status transitions inside a `prisma.$transaction`, send-after-commit, debounced to fire on the 2nd consecutive failure and once on recovery. `AlertEvent` rows persisted so "no duplicate alerts" is a SQL query.
- Web: auth flow + protected routes, dashboard table with add-monitor modal, monitor detail page with Recharts latency chart, live socket updates.
- API tests: 64 covering auth, monitors CRUD, urlGuard rejections, check runner edge cases, BullMQ processor, status transitions, retention, and the demo write-gate.

Remaining for v1.0:

- Deploy (Day 13): provision Neon Postgres, Upstash/Render Redis, Resend (verify domain), Render Web Service (instance count = **1** — the in-process scheduler assumes a single writer), Vercel for the frontend. Run the seed against the prod DB.
- README screenshots once a live URL exists.
- `v1.0.0` git tag once the production smoke test passes.

## At Scale

What I'd change if this were a real product, not a 2-week build:

- **Split the worker out.** The API and BullMQ worker share one process for the MVP — the `APP_MODE` env var already exists to switch modes. Splitting them into a Render Web Service + Render Background Worker is a one-line change once you need horizontal API scale; the worker stays at instance count 1.
- **Replace bcrypt with argon2id.** OWASP's modern recommendation; bcrypt is here only because it's universally familiar and saves yak-shaving on an MVP.
- **Replace fetch-based runner with a connection-pooled HTTP client and a separate region.** Multi-region checks would catch routing-level outages a single-region runner reports as flaky.
- **Move alerts to an outbox table.** Right now alert email send happens after the `$transaction` commits; on send failure we log and move on. An outbox row + a separate sender worker would give at-least-once delivery without coupling alert intent to send success.
- **Cap demo monitor count at the API layer too.** Currently only enforced via seeding.
