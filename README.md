# Uptime Monitor

A TypeScript uptime monitoring app in progress. The backend exposes auth and monitor APIs, runs scheduled checks through Redis/BullMQ, stores data in PostgreSQL through Prisma, and serves status data to a Vite/React dashboard scaffold.

Build notes and sequencing live in [`plan.md`](./plan.md).

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

Current routes:

- `GET /health` - service health check.
- `POST /api/auth/signup` - create a user and return a JWT.
- `POST /api/auth/login` - authenticate and return a JWT.
- `GET /api/auth/me` - return the current authenticated user.
- `GET /api/monitors` - list monitors for the current user.
- `POST /api/monitors` - create a monitor and schedule checks.
- `GET /api/monitors/:id` - fetch one owned monitor.
- `PATCH /api/monitors/:id` - update name, interval, or pause state.
- `DELETE /api/monitors/:id` - delete a monitor and remove its schedule.
- `GET /api/monitors/:id/stats` - return 24-hour uptime, latency, and outage stats.

Authenticated routes expect `Authorization: Bearer <token>`. Monitor URLs are validated server-side before insert, and users are currently capped at 10 monitors.

## Web App

The web app currently includes:

- Login and signup screens.
- Token-backed auth context and protected dashboard route.
- Dashboard monitor table.
- Add-monitor modal wired to the API with optimistic TanStack Query updates.

Live socket updates, richer monitor management, charts, and alert UI are still future work.

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

## Current Status

Implemented:

- API health endpoint.
- User signup, login, JWT auth, and `/me`.
- Monitor CRUD, ownership checks, URL guard, rate limits, and basic stats.
- Prisma schema and migrations for users, monitors, checks, and alert events.
- BullMQ scheduling/check processing foundation.
- Vite/React auth flow and dashboard scaffold.
- API test coverage for health, auth, monitors, check processing, check runner, and retention.

Not complete yet:

- Production deployment configuration.
- Email alert delivery flow and user-facing alert settings.
- Socket.IO live dashboard updates.
- Full monitor edit/delete controls in the web dashboard.
- Web app automated tests and CI.
