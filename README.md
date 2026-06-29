# FitMeet

FitMeet is a Web + Agent product for demand-flow social networking: a user says
what they want, FitMeet Agent turns it into a confirmable card, publishes it to
Discover after approval, matches candidates, and carries the next step into
messages, friends, and meet-loop workflows.

## Current Product Boundary

Canonical scope is defined in [docs/architecture/core.md](docs/architecture/core.md).

Retained user-facing surfaces:

- Main website: `/`, `/discover`, `/features`, `/safety`, `/download`, `/about`
- Agent: `/agent`, `/agent/chat`, `/agent/chat/:taskId`, `/agent/profile`
- Social loop: `/messages`, `/user/:id`, `/public-intent/:id`
- Foundation: `/login`, `/privacy`, `/terms`, `/forgot-password`
- Required admin: `/admin/safety`, `/admin/waitlist`, `/admin/agent-l5`

Old Coach, Feed, Search, standalone Notifications, standalone Life Graph, AI
Profile, Social Request publish pages, mock runtime adapters, and legacy smoke
surfaces are out of scope unless a new product decision and route/API tests add
them back.

## Repository Layout

- `backend/` - NestJS API, Agent runtime, Discover, messages, friends, meets,
  safety, uploads, waitlist, and admin services.
- `frontend/` - Vite + React website and Agent Web App.
- `docs/` - canonical architecture, contracts, runbooks, operations, and Agent
  release gates. Start at [docs/INDEX.md](docs/INDEX.md).
- `scripts/` - repeatable local, CI, release, ECS, and audit scripts.

Root Markdown is intentionally limited to `README.md` and `AGENTS.md`.

## Local Start

Prerequisites:

- Node.js 22+
- pnpm 10.30.3
- Docker Desktop

```bash
docker compose up -d postgres mongo redis

cd backend
pnpm install --frozen-lockfile
pnpm migration:run
pnpm start:dev

cd ../frontend
pnpm install --frozen-lockfile
pnpm dev
```

Default local URLs:

- Backend: `http://localhost:3000/api`
- Frontend: `http://localhost:5173`

Detailed local runbook: [docs/development/local-runbook.md](docs/development/local-runbook.md).

## Quality Gates

Baseline checks:

```bash
node scripts/check-docs-governance.mjs
pnpm --dir backend lint
pnpm --dir backend build
pnpm --dir backend exec jest --runInBand --detectOpenHandles
pnpm --dir frontend lint
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir frontend check:prod-build
```

Release-critical gates:

```bash
pnpm --dir backend run test:e2e:contract
pnpm --dir backend run test:e2e:integration
pnpm --dir frontend check:discover-entrypoints
pnpm --dir frontend exec vitest run src/test/routeBoundaries.test.ts
node scripts/verify-agent-skills.mjs
node scripts/run-agent-skill-evals.mjs --backend
```

## Canonical Docs

- Documentation index: [docs/INDEX.md](docs/INDEX.md)
- Core architecture: [docs/architecture/core.md](docs/architecture/core.md)
- Data model: [docs/architecture/data-model.md](docs/architecture/data-model.md)
- API contracts: [docs/contracts/api-contract.md](docs/contracts/api-contract.md)
- Agent release gates: [docs/agent/release-gates.md](docs/agent/release-gates.md)
- Deployment index: [docs/deployment/index.md](docs/deployment/index.md)
- Performance readiness: [docs/operations/performance-readiness.md](docs/operations/performance-readiness.md)

## Production Position

Do not claim 10,000+ users are supported until staging evidence exists for 1000,
2500, 5000, and 10000 logical users with recorded DB sizing, commands, results,
thresholds, logs, and slow queries. Current architecture is designed to evolve
toward that goal; evidence is tracked in
[docs/operations/performance-readiness.md](docs/operations/performance-readiness.md).
