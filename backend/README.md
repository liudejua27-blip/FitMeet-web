# FitMeet Backend

NestJS API service for FitMeet. It owns authentication, users, personal profiles, Social Agent orchestration, Discover public intents, messages, friends, meets, activities, safety, uploads, waitlist/admin, Life Graph internal memory, and database migrations.

## Prerequisites

- Node.js 22+
- pnpm 10+
- PostgreSQL
- MongoDB
- Redis

## Setup

```bash
pnpm install --frozen-lockfile
cp .env.example .env
```

Fill `.env` before running the service. Required local values include PostgreSQL, MongoDB, Redis, `JWT_SECRET`, and any external provider keys needed by the feature you are testing.

## Database Policy

This project is now migration-first. `DB_SYNCHRONIZE=false` is the default for every environment, including local development. Do not rely on TypeORM synchronize to mutate schemas.

Use the migration commands instead:

```bash
pnpm migration:status
pnpm migration:run
pnpm migration:generate
pnpm migration:create
```

Only set `DB_SYNCHRONIZE=true` for short-lived scratch databases when you are deliberately inspecting entity shape. Do not commit that setting.

## Run

```bash
pnpm start:dev
```

The API defaults to `http://localhost:3000/api`.

## Verification

```bash
pnpm lint
pnpm build
pnpm test
```

Production env readiness:

```bash
pnpm check:prod-env -- ../.env.production
```

The readiness command validates required production keys, HTTPS origins, migration/synchronize policy, object storage for uploads, and Agent model keys without printing secret values.

Focused checks:

```bash
pnpm test:agent-beta
pnpm test:e2e
```

## API Contract

Core Web/App endpoints are documented in `src/openapi/fitmeet-core.openapi.ts` and served as JSON at:

```text
GET /api/openapi/fitmeet-core.json
```

Update this contract before adding or changing Web/App-facing routes under `/auth`, `/users`, `/public/social-intents`, `/social-agent/chat`, `/messages`, `/friends`, `/safety`, or `/uploads`.

Production verification uses the root scripts:

```bash
../scripts/verify-production.sh
../scripts/verify-production.sh --run-public-intent-write
../scripts/verify-agent-goal-production.sh
```

The first command is non-mutating. `--run-public-intent-write` is the explicit write/read-back check for the Discover public-intent path. Agent publish, invite, friend, and message flows should be validated with real QA credentials through the Social Agent endpoints rather than old seed/mock smoke scripts.

## Social Agent Notes

`src/agent-gateway/social-agent-chat.service.ts` is still a large orchestration surface. New work should prefer extracting stable responsibilities into smaller files or services:

- chat reply policy and prompts
- stream presenters
- controller DTOs
- tool runtime adapters
- card action handlers
- memory/session assemblers

Avoid adding new unrelated behavior directly to the service unless it is part of an active extraction.

## Security

Keep real `.env`, `.env.local`, and production key files out of git. Frontend builds must receive only public `VITE_*` values; backend secrets belong only in backend runtime environments.
