# Uptime Monitor

Node + Express + TypeScript + PostgreSQL (Prisma) + BullMQ + Socket.IO. Users register URLs; a worker pings each on a schedule; the dashboard updates live and email alerts fire on down/recovery.

Build plan lives in [`plan.md`](./plan.md). Read it before changing anything material.

## Stack

- **Backend:** Node 20+, Express 5, TypeScript (strict), Prisma 5, PostgreSQL 16, BullMQ 5, Socket.IO 4, zod, pino, Resend.
- **Frontend:** Vite + React + TanStack Query + Tailwind + Recharts (`apps/web`, not built yet).
- **Infra:** Render (Web Service, Starter), Neon (Postgres), Upstash or Render KV (Redis), Vercel (frontend), Resend (email).

## Repo layout

```
apps/
  api/   # Express + worker + WS
  web/   # Vite + React (scaffolded later)
docker-compose.yml
plan.md
CONTRIBUTING.md
```

## Quickstart

```bash
# Prereqs: Node 20+, Docker, npm
nvm use                                # picks up .nvmrc

# Bring up Postgres + Redis
docker compose up -d                   # or `docker-compose up -d`

# API
cd apps/api
cp .env.example .env
npm install
npm run dev                            # http://localhost:4000/health
npm test
```

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for branching, commit conventions, and PR process.

## Status

Day 1 of 14 from `plan.md` is complete (project skeleton, health endpoint, Vitest, docker-compose, prisma init). See `plan.md` §9 for what's next.
