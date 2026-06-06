# FitMeet Launch Readiness Plan

Last updated: 2026-06-06

This document is the launch control plan for FitMeet Web and FitMeetAlpha iOS. It records the current architecture, API/data contract state, known gaps, and the exact commands that must pass before Web deployment or TestFlight release testing.

## Current Architecture Summary

- `backend/` is the primary API service. It owns auth, users, feed, uploads, messages, Social Agent, activities, matching, moderation, waitlist, realtime gateways, and database persistence.
- `frontend/` is the Vite + React Web app. It contains the public site shell, Agent workspace, real social feed, meet/club/coaching surfaces, and typed API clients.
- `fitmeet-landing/` is the standalone Next.js landing site.
- `/Users/liuchongjiang/Documents/FitMeet app/` is the native SwiftUI iOS app (`FitMeetAlpha`).
- Web and iOS are converging on the same core API contract exposed by `GET /api/openapi/fitmeet-core.json` and maintained in `backend/src/openapi/fitmeet-core.openapi.ts`.
- The backend is expected to be stateless at the HTTP layer. Session continuity is token-based through access and refresh tokens; realtime paths use Socket.IO auth.

## Backend Framework And Database Types

- Framework: NestJS 11 on Node.js, Express adapter.
- SQL database: PostgreSQL through TypeORM.
- Document database: MongoDB through Mongoose for message/realtime-style models.
- Cache/realtime support: Redis through `ioredis`.
- Optional/event infrastructure: Kafka is present and can run in no-op mode for local development.
- API safety layer: global `ValidationPipe`, global `HttpExceptionFilter`, global `LoggingInterceptor`, Helmet, compression, CORS allowlist, and `@nestjs/throttler`.
- Database strategy: migration-first. `DB_SYNCHRONIZE=false` is the default; schema changes must land as TypeORM migrations.

## Web API Call Flow

- `frontend/src/api/baseClient.ts` owns base URL resolution, bearer token attachment, JSON parsing, and typed request behavior.
- `frontend/src/api/fitmeetCoreContract.ts` lists the Web/App shared endpoint registry and template paths.
- Domain clients are already split for major launch flows:
  - `authClient.ts`: login/register/refresh/profile.
  - `feedClient.ts`: social feed and interactions.
  - `messagesClient.ts`: conversations and unread counts.
  - `socialAgentApi.ts`: Social Agent chat/task actions.
  - `uploadApi.ts`: image/video upload.
- `frontend/src/api/client.ts` remains as a compatibility facade for legacy meet/club/coach/friend surfaces.
- Required Web production env:
  - `VITE_API_BASE_URL=/api` or a full API origin.
  - `VITE_WS_BASE_URL` when Socket.IO is not same-origin.

## iOS API Call Flow

- `FitMeetAlpha/Networking/FitMeetAPIClient.swift` owns request encoding, bearer token attachment, multipart image upload, response decoding, and API error mapping.
- `FitMeetAlpha/Networking/FitMeetCoreEndpoint.swift` mirrors the backend core endpoint set used by the app.
- `FitMeetAlpha/App/FitMeetDefaults.swift` resolves base URL by configuration:
  - Debug default: `http://localhost:3000/api`.
  - Release default: `https://www.ourfitmeet.cn/api`.
  - Debug can use `FITMEET_ALPHA_API_BASE_URL` or in-app persisted override.
  - Release ignores local override unless explicitly enabled by build settings.
- `AppState.restoreSession()` restores auth by trying `/auth/profile`, then `/auth/refresh`, then `/auth/profile` again so the cached user reflects the latest backend profile.
- The iOS staging E2E path exists but requires staging credentials and a prepared second user.

## Standard Core API Contract

Authoritative contract:

- Source: `backend/src/openapi/fitmeet-core.openapi.ts`
- Runtime endpoint: `GET /api/openapi/fitmeet-core.json`
- Web registry: `frontend/src/api/fitmeetCoreContract.ts`
- iOS registry: `/Users/liuchongjiang/Documents/FitMeet app/FitMeetAlpha/Networking/FitMeetCoreEndpoint.swift`

Core launch endpoints currently covered:

- System: `GET /health`, `GET /ready`, `GET /openapi/fitmeet-core.json`
- Auth/profile: `/auth/register`, `/auth/login`, `/auth/sms/send`, `/auth/sms/verify`, `/auth/wechat/url`, `/auth/wechat/login`, `/auth/refresh`, `/auth/profile`, `/users/profile`
- Feed: `GET/POST /feed`, `/feed/interactions`, `/feed/{id}/like`, `/feed/{id}/save`, comments
- Messages: `/messages/start`, `/messages/public-intents/{id}/start`, `/messages/conversations`, `/messages/conversations/{conversationId}`, `/messages/conversations/{conversationId}/send`, `/messages/unread`
- Social Agent chat: `/social-agent/chat/messages`, `/route-message`, `/stream`, `/stream-user`, `/session`, task session/message/action/candidate endpoints
- Uploads: `/uploads/image`, `/uploads/video`

## Missing Or Broken Interfaces

- `GET /ready` has now been added to separate process liveness from dependency readiness. Deployment health checks should use `/api/health`; rollout/readiness probes should use `/api/ready`.
- `docs/` did not previously exist, so launch readiness and performance readiness were not tracked as first-class artifacts.
- The OpenAPI error schema lagged the runtime error filter. It now documents `code`, `message`, optional `details`, and nested `error.retryable`.
- The core contract covers App/Web launch flows, but legacy Web meet/club/coach/friend APIs still live outside the shared OpenAPI contract. They are not the current App launch gate, but should be documented before those surfaces become release-critical.
- iOS staging E2E is implemented but not yet proven against a live staging backend in this environment because credentials and target staging state are not present.

## Database And Schema Gaps

- TypeORM migrations exist and can bootstrap from an empty Postgres database, starting with `1700000000000-InitialSchemaBaseline.ts`.
- Recent launch-critical schema areas already have migrations: user social profile, profile privacy, Social Agent runtime/tasks/events/timeline, long-term memory, Life Graph, waitlist, and FitMeet Agent runtime.
- Remaining schema audit item: verify every currently registered entity has an equivalent migration in a disposable empty Postgres database, then compare `typeorm schema:log` output. This should be done before production migration approval.
- MongoDB collections are created by Mongoose models and are not migration-managed. Before launch, indexes for high-volume message/realtime reads should be confirmed against the deployed Mongo database.
- Redis has no schema migration, but production must enforce password/TLS/network isolation outside app code.

## Required Or Candidate Migrations

No new destructive migration is required by this document batch.

Before production cutover, run these checks:

1. Empty database bootstrap:

```bash
cd backend
pnpm migration:run
```

2. Migration status:

```bash
cd backend
pnpm migration:status
```

3. Production migration command, only after backup and env validation:

```bash
cd backend
NODE_ENV=production pnpm check:prod-env -- ../.env.production
NODE_ENV=production pnpm migration:run:prod
```

Rollback note: TypeORM `down()` methods exist for most migrations, but production rollback should prefer restoring from backup or applying a forward repair migration after impact review. Do not run destructive rollback commands against production without a database snapshot and a written rollback owner.

## Risk List

- Highest backend risk: large Social Agent services remain complex, especially `social-agent-tool-executor.service.ts` and `social-agent-candidate-pool.service.ts`.
- DB risk: production schema drift may exist if older deployments used `synchronize`; verify migration status against staging before production.
- Contract risk: Web legacy APIs outside `fitmeet-core.openapi.ts` can drift because only the core launch subset is contract-tested.
- iOS release risk: staging E2E requires real credentials, a second message target user, object storage, and a deployed backend; it cannot pass in a credential-free local run.
- Performance risk: 1000-concurrency smoke scripts exist, but no current local/staging result is recorded yet.
- Deployment risk: GitHub push/deploy automation is blocked in the current local environment by missing HTTPS credentials; deployment must run from an authenticated machine or CI.
- AI risk: `DEEPSEEK_API_KEY` is required for release-quality Social Agent behavior. Fallback responses are useful for local tests but are not release-ready for the final AI experience.

## Exact Validation Commands

Use the project Node runtime first in Codex Desktop:

```bash
export PATH="/Users/liuchongjiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/liuchongjiang/.local/bin:$PATH"
```

Full Web/backend/landing baseline:

```bash
./scripts/release-preflight.sh --web-only
```

Full baseline including iOS unit tests:

```bash
./scripts/release-preflight.sh
```

Backend focused contract and readiness tests:

```bash
pnpm --dir backend lint
pnpm --dir backend build
pnpm --dir backend test -- app.controller.spec.ts production-env-readiness.spec.ts production-deploy-readiness.spec.ts
APP_SMOKE_DRY_RUN=true pnpm --dir backend smoke:app-core
```

Local backend launch smoke, requires local Postgres/Mongo/Redis:

```bash
docker compose up -d postgres mongo redis
pnpm --dir backend migration:run
pnpm --dir backend start:dev
curl -fsS http://localhost:3000/api/health
curl -fsS http://localhost:3000/api/ready
curl -fsS http://localhost:3000/api/openapi/fitmeet-core.json
```

Frontend:

```bash
pnpm --dir frontend lint
pnpm --dir frontend build
pnpm --dir frontend test
```

Landing:

```bash
pnpm --dir fitmeet-landing lint
pnpm --dir fitmeet-landing build
pnpm --dir fitmeet-landing test
```

iOS local release gate:

```bash
cd "/Users/liuchongjiang/Documents/FitMeet app"
Scripts/release-preflight-ios.sh
```

iOS staging backend E2E, requires real staging credentials:

```bash
cd "/Users/liuchongjiang/Documents/FitMeet app"
FITMEET_ALPHA_STAGING_E2E_REQUIRED=1 \
FITMEET_ALPHA_STAGING_E2E=1 \
FITMEET_ALPHA_STAGING_BASE_URL=https://www.ourfitmeet.cn/api \
FITMEET_ALPHA_STAGING_EMAIL=test@example.com \
FITMEET_ALPHA_STAGING_PASSWORD='***' \
FITMEET_ALPHA_STAGING_MESSAGE_TARGET_USER_ID=123 \
swift Scripts/staging-backend-e2e.swift
```

Read-only performance smoke:

```bash
LOAD_TEST_BASE_URL=http://localhost:3000 \
node scripts/load-1000-readonly.mjs
```

Realtime online smoke:

```bash
REALTIME_SMOKE_BASE_URL=http://localhost:3000 \
REALTIME_SMOKE_EMAIL=test@example.com \
REALTIME_SMOKE_PASSWORD='***' \
node scripts/realtime-1000-online-smoke.mjs
```

