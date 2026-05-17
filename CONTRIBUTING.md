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

Use lowercase, kebab-case branch names with one of the approved prefixes:
`feature/`, `fix/`, `hotfix/`, `refactor/`, or `chore/`.

| Prefix       | Purpose                          | Example                          |
| ------------ | -------------------------------- | -------------------------------- |
| `main`       | Production-ready only            | -                                |
| `feature/*`  | New features                     | `feature/auth-jwt`               |
| `fix/*`      | Bug fixes                        | `fix/redirect-ssrf-bypass`       |
| `hotfix/*`   | Urgent prod fixes                | `hotfix/render-health-flap`      |
| `refactor/*` | Refactor without behavior change | `refactor/check-runner-split`    |
| `chore/*`    | Maintenance, tooling, deps       | `chore/bump-prisma-5.22`         |

Never commit directly to `main`. Open a PR.

## Commit messages - Conventional Commits

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
- Keep the subject <= 72 chars, imperative mood ("add", not "added").
- Body (optional) explains *why*, wrapped at 100 chars.

## Pull requests

PRs must:
- Address one concern only.
- Pass CI (API lint, typecheck, build, test).
- Use the PR template (auto-applied - see `.github/pull_request_template.md`).
- Include manual test notes for anything that can't be verified by automated tests.
- Call out breaking changes explicitly.

Workflow:
1. Branch off latest `main`: `git checkout main && git pull --rebase && git checkout -b feature/xyz`.
2. Commit early and often using the format above.
3. Keep up to date by rebasing onto `origin/main`; do not merge `main` into a feature branch.
4. Push and open a PR. Mark it as Draft until ready for review.
5. Squash-merge when approved. The squash message becomes the commit on `main`, so make it conform to Conventional Commits.

After rebasing a PR branch, update the remote with `git push --force-with-lease`. Never force-push `main`.

## Code review

We optimize for: readability, maintainability, consistency, security, simplicity. We avoid: unnecessary abstraction, premature optimization, drive-by refactors mixed with features.

Reviewer expectations:
- Approve only when the diff matches the description.
- Block on security issues (SSRF, auth bypass, leaked secrets).
- Suggest, don't demand, on style - let the formatter decide.

## CI expectations

Every PR runs the API job from `apps/api` (via `.github/workflows/ci.yml`):
- `npm ci` clean install
- `npx prisma generate`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm test` against Postgres + Redis service containers

Local API pre-flight before pushing:
```bash
cd apps/api
npm run lint && npm run typecheck && npm run build && npm test
```

## What not to commit

- `.env` (use `.env.example` for shared defaults)
- `node_modules/`, `dist/`, `coverage/`
- Real secrets, API keys, tokens - even temporarily
- Generated Prisma client output (it's in `node_modules/`)

The root `.gitignore` covers these; if you add a build artifact, add it there too.
