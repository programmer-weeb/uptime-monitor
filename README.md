# Uptime Monitor

Live at https://uptime.ahmedmelouk.com

A TypeScript uptime monitor. You register URLs, a worker pings each one on its configured schedule, and results land in PostgreSQL via Prisma. The dashboard updates live over Socket.IO. Email alerts go out on `up → down` (debounced past a single blip) and on recovery.

Build notes, sequencing, and architectural decisions live in [`plan.md`](./plan.md).

## Stack

- API: Node 20+, Express 5, TypeScript, Prisma, PostgreSQL, Redis, BullMQ, zod, pino.
- Web: Vite, React, React Router, TanStack Query, Tailwind CSS.
- Local infra: Docker Compose for PostgreSQL, test PostgreSQL, and Redis.
- CI: GitHub Actions runs API lint, typecheck, build, and tests on pushes and PRs to `main`.

## Repo layout

```text
apps/
  api/   Express API, Prisma schema/migrations, workers, and tests
  web/   Vite React app with auth screens and dashboard scaffold
docker-compose.yml
CONTRIBUTING.md
plan.md
```

## Local setup

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

The web app defaults to `http://localhost:5173` and calls whichever API is set in `VITE_API_URL`.

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
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=
CORS_ORIGIN=http://localhost:5173
PORT=4000
NODE_ENV=development
LOG_LEVEL=debug
APP_MODE=all
```

When a user sets a phone number in Settings, alerts are sent by both email and WhatsApp. In development, WhatsApp uses the Twilio sandbox; production needs approved templates.

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
- `GET /api/me` - return the current authenticated user's profile, including phone.
- `PATCH /api/me` - update the current authenticated user's phone number.
- `GET /api/monitors` - list monitors for the current user.
- `POST /api/monitors` - create a monitor and schedule checks. Rate-limited 5/min per user.
- `GET /api/monitors/:id` - fetch one owned monitor.
- `PATCH /api/monitors/:id` - update name, interval, or pause state.
- `DELETE /api/monitors/:id` - delete a monitor and remove its schedule.
- `GET /api/monitors/:id/checks?limit=N` - last N checks (default 100, max 500).
- `GET /api/monitors/:id/stats` - 24h uptime %, average latency, last-down timestamp.

Authenticated routes expect `Authorization: Bearer <token>`. All write paths run through `urlGuard`, which rejects non-HTTPS targets and private/loopback/cloud-metadata IPs and re-checks every redirect hop. Users are capped at 10 monitors.

Demo accounts (`isDemo=true` on the user record) are read-only. POST/PATCH/DELETE return `403 FORBIDDEN`. The seeded `demo@example.com` uses this so anyone can browse without turning the deployed instance into a free pinger.

WebSocket namespace `/dashboard` (Socket.IO). Authenticated via the JWT in the handshake auth payload. Server-to-client events:

- `check:completed` - fires after every check.
- `monitor:status_changed` - fires on status transitions only (debounced for `down`).

## Web app

- Login and signup screens with client-side validation.
- Token-backed auth context, JWT persisted to `localStorage`, protected route wrapper.
- Dashboard monitor table with status, interval, last latency, and last-checked time.
- Add-monitor modal with optimistic TanStack Query mutations.
- Monitor detail page (`/monitors/:id`) with a 24h latency chart (Recharts), uptime %, the last 100 checks, and pause/resume.
- Live updates over Socket.IO so the dashboard and detail page reflect `check:completed` and `monitor:status_changed` without polling.

A demo banner appears when the logged-in user has `isDemo=true`.

## Useful scripts

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

## Testing and CI

API tests use Vitest, Supertest, PostgreSQL, Redis, Prisma, and MSW where needed. Local tests expect Docker Compose services to be running:

```bash
docker compose up -d
cd apps/api
npm test
```

GitHub Actions currently runs API `lint`, `typecheck`, `build`, and `test` on pushes and pull requests against `main`. Web CI is not wired yet.

## Demo account

A seeded read-only account is available for browsing:

- Email: `demo@example.com`
- Password: `demouser123`

The account ships with three sample monitors (example.com, github.com, google.com) at a 10-min interval. Demo users can browse everything but POST/PATCH/DELETE on `/api/monitors` returns `403`. Re-run `npx prisma db seed` any time. It's idempotent: upserts the user, skips monitor creation if any already exist.

## Current status

Implemented (Days 1–12 + Day 14 polish per [`plan.md`](./plan.md)):

- Auth: signup, login, `/me`. JWT is HS256 with a `{ sub }`-only payload and a 24h TTL. bcrypt cost is 12 in prod and 4 in tests. Login returns a generic 401 on any failure and uses a timing-equalized compare so a missing email doesn't reveal itself.
- Monitor CRUD with owner scoping, a 10-monitor cap, per-user rate limit on create, and the demo write-gate above.
- `urlGuard.ts` SSRF protection: RFC1918, loopback, link-local (including AWS/GCP/Azure metadata at `169.254.169.254`), CGNAT, multicast, and IPv4-mapped IPv6. Re-runs on every redirect hop in the check runner.
- Check runner with manual 3-hop redirect handling, a 10s `AbortSignal.timeout`, a 1 MB body cap, and an explicit `UptimeMonitor/1.0` UA. Errors classify into `TIMEOUT | DNS | CONNECTION | TLS | HTTP_4XX | HTTP_5XX | REDIRECT_LOOP | BLOCKED | BODY_TOO_LARGE`.
- BullMQ scheduling. `upsertJobScheduler` on create/edit, `removeJobScheduler` on pause/delete, and a daily retention job that prunes checks older than 30 days.
- Stats endpoint: 24h uptime %, average latency, last-down timestamp.
- Live updates over the Socket.IO `/dashboard` namespace, scoped to per-user rooms.
- Email alerts via the Resend SDK. Status transitions live inside a `prisma.$transaction`; the actual send fires after commit. Alerts are debounced (fire on the 2nd consecutive failure) and rate-limited to 1/min/monitor as a backstop. `AlertEvent` rows are persisted so "no duplicate alerts" is a SQL query.
- Web: auth flow with protected routes, dashboard table with add-monitor modal, monitor detail page with the Recharts latency chart, and live socket updates throughout.
- API tests: 72 across 8 files. Cover auth, monitor CRUD, urlGuard rejections, check runner edge cases, the BullMQ processor (including the structured per-check log line), status transitions, retention, the demo write-gate, and per-monitor email rate limiting.

Remaining for v1.0:

- Deploy (Day 13): Neon Postgres, Upstash or Render Redis, Resend with a verified sending domain, Render Web Service at instance count 1 (the in-process scheduler assumes a single writer), Vercel for the frontend. Run the seed against the prod DB.
- README screenshots once a live URL exists.
- `v1.0.0` git tag once the production smoke test passes.

## At scale

What I'd change if this were a real product, not a 2-week build:

- Split the worker out. The API and the BullMQ worker share one process for the MVP, with `APP_MODE` already in place to switch modes. Splitting them into a Render Web Service plus a Render Background Worker is a one-line change once you actually need horizontal API scale; the worker stays pinned at one instance.
- Replace bcrypt with argon2id. It's OWASP's modern recommendation. bcrypt is here because it's universally familiar and saves a yak-shave on an MVP.
- Use a connection-pooled HTTP client and check from multiple regions. A single-region runner can't tell a real outage from a routing problem you happen to be on the wrong side of.
- Move alerts to an outbox table. Right now the email send happens after the `$transaction` commits, and on send failure we just log and move on. An outbox row plus a separate sender worker would give at-least-once delivery without coupling alert intent to send success.
- Cap demo monitor count at the API layer too. Currently it's only enforced via seeding.
