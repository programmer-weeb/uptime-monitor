# Contributing

Thanks for working on Uptime Monitor. Keep changes small, focused, and well-described.

## Local setup

```bash
# Prereqs: Node 20+ (see .nvmrc), Docker, npm
cd apps/api
cp .env.example .env
# Edit .env if needed (defaults work with docker-compose)

# From repo root:
docker compose up -d      # or `docker-compose up -d` on legacy installs

# Back in apps/api:
npm install
npx prisma migrate dev    # once models land
npm run dev               # starts api on :4000
npm test                  # runs vitest against the *_test database
```

## Branching

| Prefix       | Purpose                          | Example                          |
| ------------ | -------------------------------- | -------------------------------- |
| `main`       | Production-ready only            | —                                |
| `feature/*`  | New features                     | `feature/auth-jwt`               |
| `fix/*`      | Bug fixes                        | `fix/redirect-ssrf-bypass`       |
| `hotfix/*`   | Urgent prod fixes                | `hotfix/render-health-flap`      |
| `refactor/*` | Refactor without behavior change | `refactor/check-runner-split`    |
| `chore/*`    | Maintenance, tooling, deps       | `chore/bump-prisma-5.22`         |
| `docs/*`     | Docs-only                        | `docs/contributing-pr-template`  |
| `ci/*`       | CI/build config                  | `ci/add-typecheck-job`           |

Never commit directly to `main`. Open a PR.

## Commit messages — Conventional Commits

Format: `type(scope): short imperative description`

Allowed types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`, `perf`.

Good:
- `feat(auth): add JWT signup endpoint`
- `fix(check-runner): re-run urlGuard on every redirect hop`
- `chore(deps): bump bullmq to 5.13`
- `ci(api): add typecheck job`

Bad:
- `update`
- `fix stuff`
- `wip`
- `final final v2`

Rules:
- One concern per commit. Separate formatting from logic.
- Keep the subject ≤ 72 chars, imperative mood ("add", not "added").
- Body (optional) explains *why*, wrapped at 100 chars.

## Pull requests

PRs must:
- Address one concern only.
- Pass CI (lint, typecheck, build, test).
- Use the PR template (auto-applied — see `.github/pull_request_template.md`).
- Include manual test notes for anything that can't be verified by automated tests.
- Call out breaking changes explicitly.

Workflow:
1. Branch off latest `main`: `git checkout main && git pull --rebase && git checkout -b feature/xyz`.
2. Commit early and often using the format above.
3. Keep up to date by rebasing, not merging: `git fetch && git rebase origin/main`.
4. Push and open a PR. Mark as Draft until ready for review.
5. Squash-merge when approved. The squash message becomes the commit on `main` — make it conform to Conventional Commits.

If you must force-push a feature branch (after a rebase), use `git push --force-with-lease`. Never force-push `main`.

## Code review

We optimize for: readability, maintainability, consistency, security, simplicity. We avoid: unnecessary abstraction, premature optimization, drive-by refactors mixed with features.

Reviewer expectations:
- Approve only when the diff matches the description.
- Block on security issues (SSRF, auth bypass, leaked secrets).
- Suggest, don't demand, on style — let the formatter decide.

## CI expectations

Every PR runs (via `.github/workflows/ci.yml`):
- `npm ci` clean install
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm test` against Postgres + Redis service containers

Local pre-flight before pushing:
```bash
npm run lint && npm run typecheck && npm run build && npm test
```

## What not to commit

- `.env` (use `.env.example` for shared defaults)
- `node_modules/`, `dist/`, `coverage/`
- Real secrets, API keys, tokens — even temporarily
- Generated Prisma client output (it's in `node_modules/`)

The root `.gitignore` covers these; if you add a build artifact, add it there too.
