# Uptime Monitor — Web

React + Vite + Tailwind + TanStack Query frontend for the Uptime Monitor API.

Live at https://uptime.ahmedmelouk.com (API: https://api.ahmedmelouk.com).

## Local setup

```bash
npm install
cp .env.example .env       # then point VITE_API_URL at your local API
npm run dev                # serves on :5173
npm run build              # tsc -b && vite build (also the CI gate)
```

The dev server expects the API at `VITE_API_URL` (defaults to
`http://localhost:4000`). Start the API from `apps/api` with `npm run dev`.
