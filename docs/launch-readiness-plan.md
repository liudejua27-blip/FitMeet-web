# FitMeet Launch Readiness Plan

Last updated: 2026-06-07

This document is the launch control plan for FitMeet Web and FitMeetAlpha iOS. It records the current architecture, API/data contract state, known gaps, and the exact commands that must pass before Web deployment or TestFlight release testing.

## Current Architecture Summary

- `backend/` is the primary API service. It owns auth, users, feed, uploads, messages, Social Agent, activities, matching, moderation, waitlist, realtime gateways, and database persistence.
- `frontend/` is the Vite + React Web app. It contains the public site shell, Agent workspace, real social feed, meet/club/coaching surfaces, and typed API clients.
- `fitmeet-landing/` is the standalone Next.js landing site.
- `/Users/liuchongjiang/Documents/FitMeet app/` is the native SwiftUI iOS app (`FitMeetAlpha`).
- Web and iOS are converging on the same core API contract exposed by `GET /api/openapi/fitmeet-core.json` and maintained in `backend/src/openapi/fitmeet-core.openapi.ts`.
- Backend contract tests now read both `frontend/src/api/fitmeetCoreContract.ts` and the iOS `FitMeetCoreEndpoint.swift` registry to catch Web/App path drift before release.
- The backend is expected to be stateless at the HTTP layer. Session continuity is token-based through access and refresh tokens; realtime paths use Socket.IO auth.

## Backend Framework And Database Types

- Framework: NestJS 11 on Node.js, Express adapter.
- SQL database: PostgreSQL through TypeORM.
- Document database: MongoDB through Mongoose for message/realtime-style models.
- Cache/realtime support: Redis through `ioredis`.
- Optional/event infrastructure: Kafka is present and can run in no-op mode for local development.
- API safety layer: global `ValidationPipe`, global `HttpExceptionFilter`, global `LoggingInterceptor`, Helmet, compression, CORS allowlist, and `@nestjs/throttler`.
- HTTP and Socket.IO origin allowlists are resolved through the same `CORS_ORIGIN`/`ALLOWED_ORIGINS` helper; production Socket.IO gateways require explicit origins.
- Database strategy: migration-first. `DB_SYNCHRONIZE=false` is the default; schema changes must land as TypeORM migrations.
- Launch guard: backend tests now verify the Nest runtime TypeORM config and CLI `data-source.ts` use the same glob-based entity/migration discovery, keep `synchronize` off by default, and run migrations transactionally per file.

## Web API Call Flow

- `frontend/src/api/baseClient.ts` owns base URL resolution, bearer token attachment, JSON parsing, and typed request behavior.
- `baseClient.ts` maps the backend standard error envelope into `ApiError.status`, `ApiError.code`, `ApiError.retryable`, and a user-facing message.
- `frontend/src/api/fitmeetCoreContract.ts` lists the Web/App shared endpoint registry and template paths.
- Domain clients are already split for major launch flows:
  - `authClient.ts`: login/register/refresh/profile.
  - `feedClient.ts`: social feed, full `FeedPage` pagination metadata, and legacy array-compatible feed reads.
  - `messagesClient.ts`: conversations and unread counts.
  - `socialAgentApi.ts`: Social Agent chat/task actions.
  - `uploadApi.ts`: image/video multipart upload with bearer auth and standard error envelope mapping.
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
- Human-readable index: `docs/api-contract.md`
- Web registry: `frontend/src/api/fitmeetCoreContract.ts`
- iOS registry: `/Users/liuchongjiang/Documents/FitMeet app/FitMeetAlpha/Networking/FitMeetCoreEndpoint.swift`
- Contract guard: every non-health core OpenAPI operation must document at least one non-2xx response using the shared `#/components/responses/Error` shape.

Core launch endpoints currently covered:

- System: `GET /health`, `GET /ready`, `GET /openapi/fitmeet-core.json`
- Auth/profile: `/auth/register`, `/auth/login`, `/auth/sms/send`, `/auth/sms/verify`, `/auth/wechat/url`, `/auth/wechat/login`, `/auth/refresh`, `/auth/profile`, `/users/profile`
- Feed/public hall: `GET/POST /feed`, `GET /public/social-intents`, `/feed/interactions`, `/feed/{id}/like`, `/feed/{id}/save`, comments
- Messages: `/messages/start`, `/messages/public-intents/{id}/start`, `/messages/conversations`, `/messages/conversations/{conversationId}`, `/messages/conversations/{conversationId}/send`, `/messages/unread`
- Agent inbox: `/agents/inbox/conversations`, `/agents/inbox/conversations/{conversationId}/messages`, `/agents/inbox/events`, `/agents/inbox/events/ack`, `/agents/inbox/conversations/{conversationId}/reply`, `/agents/profile-matches`, and profile-match review action endpoints
- Social Agent chat: `/social-agent/chat/messages`, `/route-message`, `/stream`, `/stream-user`, `/session`, task session/message/action/candidate endpoints, publish social request, replan-run, and append-context endpoints
- Social Agent workspace reads/writes: `/social-agent/tasks/current`, `/social-agent/tasks/{taskId}/timeline`, `/social-agent/tasks/{taskId}/events`, `/social-agent/tasks/{taskId}/replan`
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
- `1774400000000-AddSocialRequestCandidateUniqueness.ts` adds the `(socialRequestId, candidateUserId)` unique index for `social_request_candidates`, with a non-destructive duplicate preflight so retrying Agent searches cannot create duplicate candidate rows.
- Static migration integrity now guards Postgres enum value additions: every migration containing `ALTER TYPE ... ADD VALUE` must opt out of TypeORM's per-file transaction wrapper with `transaction = false as const`.
- Remaining schema audit item: verify every currently registered entity has an equivalent migration in a disposable empty Postgres database, then compare `typeorm schema:log` output. Static tests now guard TypeORM discovery/config drift, but this live empty-database diff is still required before production migration approval.
- MongoDB collections are created by Mongoose models and are not migration-managed. Message, conversation, and Agent inbox event schemas now declare compound indexes for the Web/iOS conversation list, message history, unread count, Agent inbox, and recent Agent signal queries. Before launch, confirm those indexes exist on the deployed Mongo database because production `autoIndex` behavior may be disabled.
- Redis has no schema migration, but production must enforce password/TLS/network isolation outside app code.
- Local demo data is provided by `backend/scripts/seed-living-social-data.ts`. The dry-run command validates the 50-user seed baseline without connecting to Postgres; the normal seed command should only be used against local/dev databases.

## Required Or Candidate Migrations

No new destructive migration is required by this document batch. The latest migration adds a unique index for Social Agent candidate rows and intentionally fails before index creation if duplicate rows already exist.

Before production cutover, run these checks:

1. Empty database bootstrap:

```bash
cd backend
pnpm migration:run
pnpm seed:living-social-data:dry-run
pnpm seed:living-social-data
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

Duplicate candidate preflight, useful before applying the latest migration to staging/production:

```sql
SELECT "socialRequestId", "candidateUserId", COUNT(*) AS duplicate_count
FROM "social_request_candidates"
GROUP BY "socialRequestId", "candidateUserId"
HAVING COUNT(*) > 1;
```

Rollback note: TypeORM `down()` methods exist for most migrations, but production rollback should prefer restoring from backup or applying a forward repair migration after impact review. Do not run destructive rollback commands against production without a database snapshot and a written rollback owner.

## Risk List

- Highest backend risk: large Social Agent services remain complex, especially `social-agent-tool-executor.service.ts` and `social-agent-candidate-pool.service.ts`; the tool executor now has enum-to-dispatch coverage, TypeScript exhaustiveness guards, and split tool-step event payload builders so newly added tools cannot silently miss a real execution branch or drift timeline event shapes.
- Candidate pool authorization risk has been reduced: Social Agent candidate searches now require `socialRequestId` to belong to the authenticated owner before using its query context or persisting candidate rows; candidate dedupe/merge semantics are now split into a focused helper so Web/iOS candidate ordering and multi-source metadata are easier to contract-test.
- Candidate persistence idempotency risk has been reduced with a database-level unique index for `(socialRequestId, candidateUserId)`; the service also reuses the existing candidate row on Postgres unique-conflict races, and production must inspect duplicates before applying the migration if historical data exists.
- Enum migration rollout risk has been reduced: all migrations that add Postgres enum values now explicitly run outside the TypeORM transaction wrapper, and `migration-integrity.spec.ts` prevents new `ADD VALUE` migrations from missing this setting.
- Social Agent chat entrypoint risk has been reduced to thin facade services; profile extraction prompt/normalization and Final Response input assembly have been split out of the LLM service; public social candidate card scoring has been split out of the large Agent Gateway service; timeline message restoration still needs continued focused tests because it is shared by Web and iOS session restore.
- DB risk: production schema drift may exist if older deployments used `synchronize`; verify migration status against staging before production.
- Mongo index risk has been reduced in code for message/realtime reads, but production must still verify deployed Mongo indexes for `conversations`, `messages`, and `agentinboxevents` before load testing.
- Contract risk: Web legacy APIs outside `fitmeet-core.openapi.ts` can drift because only the core launch subset is contract-tested; Web public hall social-intent reads, Web Agent inbox conversation read/reply, event poll/ack, and profile-match review endpoints are now inside the shared core contract, Web typed endpoint registry, and controller mapping guard.
- Error contract risk has been reduced for the shared launch subset: OpenAPI now documents the stable error envelope for auth, feed, messages, Social Agent chat, SSE, and uploads instead of only happy paths.
- Web error handling risk has been reduced: the shared Web base client now preserves backend `code` and `error.retryable` fields from the standard error envelope so UI flows can distinguish validation, auth, dependency, and retryable failures without parsing raw payloads.
- Web upload risk has been reduced: multipart uploads now preserve bearer auth headers even when callers pass an empty header object for browser-managed boundaries, and upload failures map the backend standard error envelope into `ApiError.code` and `retryable`.
- Social Agent workspace restore risk has been reduced: Web/iOS Social Agent run, async run, current-task, task-timeline, and async run-status polling endpoints are now part of the shared core OpenAPI contract and typed endpoint registries instead of living as untracked debug API strings.
- Social Agent workspace continuation risk has been reduced: Web publish social request, task replan, replan-run, append-context, and task-events endpoints are now documented in OpenAPI and called through the typed Web endpoint registry instead of hardcoded debug API strings.
- Feed write-path risk has been reduced: like/save/comment operations now confirm the target post or comment exists before writing counters or interaction rows, so Web/iOS get stable 404 errors instead of orphan rows or database constraint leakage.
- Feed publish validation risk has been reduced: post creation now rejects blank `type`, `sport`, or `text` before moderation/database writes, and the shared OpenAPI create-post schema documents the non-empty required strings used by iOS moment publishing.
- Web feed pagination contract risk has been reduced: the Web API client now exposes `getFeedPage()` for the shared `/feed` `{ data, metadata }` response while preserving legacy `getFeed()` array behavior for existing pages.
- Messages read/write risk has been reduced: shared Web/iOS conversation history reads now require a participant-scoped conversation match before querying messages, and invalid/blank user-message, Agent inbox, and Agent reply conversation inputs fail with stable 400 responses before Mongo reads or writes. Core OpenAPI now documents the message conversation 400 responses used by Web and iOS clients.
- Web/iOS message path risk has been reduced: the Web typed core endpoint registry, Web Agent inbox client, and `FitMeetCoreEndpoint.Messages` now percent-encode dynamic `conversationId` path segments for conversation history and send-message calls, matching the existing run-status `runId` encoding behavior.
- Auth contract drift risk has been reduced: register, login, SMS send/verify, WeChat URL/login, refresh, and current-profile launch auth endpoints now have a controller-to-OpenAPI mapping guard in `app.controller.spec.ts`.
- Auth risk: production SMS/WeChat provider configuration must be present; mock WeChat login is dev-only, failed production SMS dispatch must not persist usable verification codes, WeChat OAuth redirects must be explicit HTTPS URLs, and refresh token rotation must keep stale tokens from being reused.
- iOS release risk: staging E2E requires real credentials, a second message target user, object storage, and a deployed backend; it cannot pass in a credential-free local run.
- Performance risk: 1000-concurrency smoke scripts exist, but no current local/staging result is recorded yet.
- Deployment risk: GitHub push/deploy automation is blocked in the current local environment by missing HTTPS credentials; deployment must run from an authenticated machine or CI.
- AI risk: `DEEPSEEK_API_KEY` is required for release-quality Social Agent behavior. Fallback responses are useful for local tests but are not release-ready for the final AI experience.
- Upload risk: production uploads require object storage; local filesystem upload fallback is tested as development-only, upload endpoints now reject unsupported image/video mime types while removing multer temporary files, object storage failure paths remove temporary files for both Aliyun OSS and S3, and object storage public URLs/endpoints must stay HTTPS for release traffic.

## Exact Validation Commands

Use the project Node runtime first in Codex Desktop:

```bash
export PATH="/Users/liuchongjiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/liuchongjiang/.local/bin:$PATH"
```

Full Web/backend/landing baseline:

```bash
./scripts/release-preflight.sh --web-only
```

The Web preflight runs the focused backend database contract tests (`migration-integrity.spec.ts` and `typeorm-launch-config.contract.spec.ts`) before the full backend test suite, so enum migration transaction regressions and TypeORM launch config drift fail early.

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

## Verification Log

2026-06-06 local Codex environment:

- Passed: `pnpm --dir backend test -- app.controller.spec.ts`
- Passed: `pnpm --dir backend lint`
- Passed: `pnpm --dir backend build`
- Passed: `APP_SMOKE_DRY_RUN=true pnpm --dir backend smoke:app-core`
- Passed: `pnpm --dir frontend test -- fitmeetCoreContract.test.ts`
- Blocked: `docker compose ps` and `docker --version` because `docker` is not installed in this environment.
- Blocked: `pnpm --dir backend migration:status` because Postgres refused `localhost:5432` for database `fitness_app` (`ECONNREFUSED`).
- Blocked: local backend `/api/health` and `/api/ready` runtime curl because database dependencies could not be started or reached.

2026-06-07 local Codex environment:

- Passed: iOS `xcodebuild test -project FitMeetAlpha.xcodeproj -scheme FitMeetAlpha -destination 'platform=iOS Simulator,id=68F37251-71BE-4F42-9849-62D61BFFE7C3' -only-testing:FitMeetAlphaTests/AuthRestoreContractTests`
- Passed: iOS Debug simulator build for `FitMeetAlpha`.
- Passed: iOS Release simulator build for `FitMeetAlpha`.
- Blocked: iOS full `-only-testing:FitMeetAlphaTests` after three attempts because the Simulator refused to launch `com.fitmeet.alpha` with `FBSOpenApplicationServiceErrorDomain` / `Application failed preflight checks` / `Busy`. This is a local Simulator launch-state blocker; the targeted networking/auth contract tests and Debug/Release builds passed.
- Passed: iOS staging backend E2E script safe skip mode: `swift Scripts/staging-backend-e2e.swift`
- Blocked by credentials/env: iOS required staging backend E2E `FITMEET_ALPHA_STAGING_E2E_REQUIRED=1 swift Scripts/staging-backend-e2e.swift` failed fast because `FITMEET_ALPHA_STAGING_E2E=1` and staging credentials were not provided.
- Passed: iOS test build after adding feed validation error mapping coverage: `xcodebuild build-for-testing -project FitMeetAlpha.xcodeproj -scheme FitMeetAlpha -destination 'platform=iOS Simulator,id=68F37251-71BE-4F42-9849-62D61BFFE7C3'`
- Passed: iOS test build after encoding dynamic message conversation paths: `xcodebuild build-for-testing -project FitMeetAlpha.xcodeproj -scheme FitMeetAlpha -destination 'platform=iOS Simulator,id=68F37251-71BE-4F42-9849-62D61BFFE7C3'`
- Blocked: iOS targeted `xcodebuild test -project FitMeetAlpha.xcodeproj -scheme FitMeetAlpha -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.5' -only-testing:FitMeetAlphaTests/AuthRestoreContractTests` failed because the Simulator refused to launch `com.fitmeet.alpha` with `FBSOpenApplicationServiceErrorDomain` / `Application failed preflight checks` / `Busy`.
- Blocked: iOS targeted retry on `iPhone 17 Pro` simulator id `68F37251-71BE-4F42-9849-62D61BFFE7C3` failed with the same Simulator `Busy` preflight launch blocker.
- Blocked: iOS targeted conversation endpoint regression test `xcodebuild test -project FitMeetAlpha.xcodeproj -scheme FitMeetAlpha -destination 'platform=iOS Simulator,id=68F37251-71BE-4F42-9849-62D61BFFE7C3' -only-testing:FitMeetAlphaTests/AuthRestoreContractTests/testSwiftEndpointRegistryOwnsReleaseCriticalBackendPaths -only-testing:FitMeetAlphaTests/AuthRestoreContractTests/testAPIClientSendsReleaseCriticalRequestsToBackendContract` failed at app launch with the same Simulator `Busy` preflight blocker.
- Passed: backend `pnpm --dir backend test -- logging.interceptor.spec.ts`
- Passed: backend `pnpm --dir backend test -- http-exception.filter.spec.ts logging.interceptor.spec.ts`
- Passed: backend `pnpm --dir backend test -- migration-integrity.spec.ts`
- Passed: backend `pnpm --dir backend test -- migration-integrity.spec.ts typeorm-launch-config.contract.spec.ts` after adding the enum `ADD VALUE` transaction opt-out guard.
- Passed: backend `pnpm --dir backend test -- production-deploy-readiness.spec.ts` after adding the focused database contract test step to release preflight.
- Passed: backend `pnpm --dir backend seed:living-social-data:dry-run` after adding the no-database demo seed baseline check for 50 local Web/iOS test users, profiles, and public requests.
- Passed: backend `pnpm --dir backend test -- migration-integrity.spec.ts typeorm-launch-config.contract.spec.ts`
- Passed: `bash -n scripts/release-preflight.sh`
- Passed: backend `pnpm --dir backend test -- production-deploy-readiness.spec.ts migration-integrity.spec.ts typeorm-launch-config.contract.spec.ts` after adding the demo seed dry-run to release preflight.
- Passed: backend `pnpm --dir backend test -- origin-allowlist.spec.ts`
- Passed: backend `pnpm --dir backend test -- production-env-readiness.spec.ts origin-allowlist.spec.ts`
- Passed: backend `pnpm --dir backend test -- production-env-readiness.spec.ts`
- Passed: backend `pnpm --dir backend test -- social-agent-chat-timeline-activity.presenter.spec.ts social-agent-chat-timeline.presenter.spec.ts social-agent-chat-facade-boundary.spec.ts`
- Passed: backend `pnpm --dir backend test -- social-agent-profile-extraction.presenter.spec.ts social-agent-chat-llm.service.spec.ts`
- Passed: backend `pnpm --dir backend test -- social-agent-chat-final-response.presenter.spec.ts social-agent-chat-llm.service.spec.ts social-agent-chat-facade-boundary.spec.ts` after splitting Final Response input assembly out of Social Agent chat LLM orchestration.
- Passed: backend `pnpm --dir backend test -- social-agent-chat.acceptance.spec.ts` after splitting Final Response input assembly out of Social Agent chat LLM orchestration.
- Passed: backend `pnpm --dir backend test -- public-social-candidate.presenter.spec.ts public-social-intent.helpers.spec.ts agent-gateway.service.spec.ts social-agent-chat-facade-boundary.spec.ts` after splitting public social candidate scoring out of `agent-gateway.service.ts`.
- Passed: backend `pnpm --dir backend test -- social-agent-tool-step-events.presenter.spec.ts social-agent-tool-executor.service.spec.ts social-agent-tool-dispatch.contract.spec.ts social-agent-chat-facade-boundary.spec.ts` after splitting tool-step event payload assembly out of `social-agent-tool-executor.service.ts`.
- Passed: backend `pnpm --dir backend test -- social-agent-candidate-pool-merge.spec.ts social-agent-candidate-pool.service.spec.ts social-agent-candidate-pool-query.spec.ts social-agent-candidate-pool-debug.spec.ts social-agent-chat-facade-boundary.spec.ts` after splitting candidate pool dedupe/merge semantics out of `social-agent-candidate-pool.service.ts`.
- Passed: backend `pnpm --dir backend lint`
- Passed: backend `pnpm --dir backend build`
- Passed: backend `pnpm --dir backend test -- social-agent-tool-dispatch.contract.spec.ts social-agent-tool-executor.service.spec.ts`
- Passed: backend `pnpm --dir backend test -- social-agent-candidate-pool.service.spec.ts social-agent-candidate-pool-query.spec.ts social-agent-candidate-pool-debug.spec.ts`
- Passed: backend `pnpm --dir backend test -- migration-integrity.spec.ts`
- Passed: backend `pnpm --dir backend test -- app.controller.spec.ts`
- Passed: backend `pnpm --dir backend test -- app.controller.spec.ts` after adding Web Agent inbox conversation read/reply endpoints to the shared OpenAPI contract.
- Passed: backend `pnpm --dir backend test -- app.controller.spec.ts` after adding Web Agent inbox event poll/ack endpoints to the shared OpenAPI contract.
- Passed: backend `pnpm --dir backend test -- app.controller.spec.ts` after adding Web Agent profile-match recommendation endpoints to the shared OpenAPI contract.
- Passed: backend `pnpm --dir backend test -- app.controller.spec.ts` after adding Web public hall social-intent reads to the shared OpenAPI contract.
- Passed: backend `pnpm --dir backend test -- app.controller.spec.ts` after adding the launch auth controller-to-OpenAPI mapping guard.
- Passed: frontend `pnpm --dir frontend test -- fitmeetCoreContract.test.ts` after encoding Web dynamic message conversation paths.
- Passed: frontend `pnpm --dir frontend test -- agentInboxApi.test.ts` after encoding Web Agent inbox dynamic conversation paths.
- Passed: frontend `pnpm --dir frontend test -- fitmeetCoreContract.test.ts agentInboxApi.test.ts` after moving Web Agent inbox conversation endpoints into the shared typed endpoint registry.
- Passed: frontend `pnpm --dir frontend test -- fitmeetCoreContract.test.ts agentInboxApi.test.ts` after moving Web Agent inbox event poll/ack endpoints into the shared typed endpoint registry.
- Passed: frontend `pnpm --dir frontend test -- fitmeetCoreContract.test.ts agentInboxApi.test.ts` after moving Web Agent profile-match review endpoints into the shared typed endpoint registry.
- Passed: frontend `pnpm --dir frontend test -- fitmeetCoreContract.test.ts feedClient.test.ts` after moving Web public hall social-intent reads into the shared typed endpoint registry.
- Passed: backend `pnpm --dir backend test -- auth.service.spec.ts`
- Passed: backend `pnpm --dir backend test -- auth.service.spec.ts production-env-readiness.spec.ts`
- Passed: backend `pnpm --dir backend test -- uploads.service.spec.ts` after adding Aliyun OSS/S3 failure cleanup coverage.
- Passed: backend `pnpm --dir backend test -- uploads.controller.spec.ts`
- Passed: backend `pnpm --dir backend test -- typeorm-launch-config.contract.spec.ts`
- Passed: backend `pnpm --dir backend test -- messages.realtime.spec.ts`
- Passed: backend `pnpm --dir backend test -- posts.service.spec.ts app.controller.spec.ts`
- Passed: backend `pnpm --dir backend test -- uploads.service.spec.ts app.controller.spec.ts` after documenting upload mime limits and adding unsupported image/video cleanup coverage.
- Passed: backend `pnpm --dir backend test -- app.controller.spec.ts` after adding the shared Social Agent async run-status OpenAPI path.
- Passed: backend `pnpm --dir backend test -- app.controller.spec.ts` after adding the shared Social Agent run and run-async OpenAPI paths and correcting `SocialAgentRunInput.permissionMode` to optional.
- Passed: backend `pnpm --dir backend test -- app.controller.spec.ts` after adding Social Agent workspace publish, task replan, replan-run, append-context, and task-events OpenAPI coverage.
- Passed: backend `pnpm --dir backend test -- production-deploy-readiness.spec.ts` after adding `/api/ready` to the production verifier and expanding the runtime OpenAPI path guard for Social Agent run/workspace actions.
- Passed: `bash -n scripts/verify-production.sh`
- Passed: `APP_SMOKE_DRY_RUN=true pnpm --dir backend smoke:app-core` after expanding the dry-run contract guard to cover readiness, feed/comment interactions, Social Agent run/run-status/workspace actions, and upload image/video paths.
- Passed: backend `pnpm --dir backend lint`
- Passed: backend `pnpm --dir backend build`
- Passed: frontend `pnpm --dir frontend test -- feedClient.test.ts`
- Passed: frontend `pnpm --dir frontend exec eslint src/api/feedClient.ts src/services/dataService.ts src/test/feedClient.test.ts`
- Passed: frontend `pnpm --dir frontend build`
- Passed: frontend `pnpm --dir frontend test -- baseClient.test.ts`
- Passed: frontend `pnpm --dir frontend exec eslint src/api/baseClient.ts src/test/baseClient.test.ts`
- Passed: frontend `pnpm --dir frontend build`
- Passed: frontend `pnpm --dir frontend test -- uploadApi.test.ts`
- Passed: frontend `pnpm --dir frontend exec eslint src/api/uploadApi.ts src/test/uploadApi.test.ts`
- Passed: frontend `pnpm --dir frontend build`
- Passed: frontend `pnpm --dir frontend test -- fitmeetCoreContract.test.ts` after adding typed async run-status endpoint coverage.
- Passed: frontend `pnpm --dir frontend test -- fitmeetCoreContract.test.ts` after adding typed Social Agent run and run-async endpoint coverage.
- Passed: frontend `pnpm --dir frontend test -- fitmeetCoreContract.test.ts` after moving Social Agent workspace publish, replan, append-context, and task-events paths into the typed endpoint registry.
- Passed: frontend `pnpm --dir frontend exec eslint src/api/fitmeetCoreContract.ts src/api/socialAgentDebugApi.ts src/test/fitmeetCoreContract.test.ts`
- Passed: frontend `pnpm --dir frontend build`
- Passed: iOS `xcodebuild build-for-testing -project FitMeetAlpha.xcodeproj -scheme FitMeetAlpha -destination 'platform=iOS Simulator,id=68F37251-71BE-4F42-9849-62D61BFFE7C3'` after adding the Swift async run-status endpoint registry.
- Passed: iOS `xcodebuild build-for-testing -project FitMeetAlpha.xcodeproj -scheme FitMeetAlpha -destination 'platform=iOS Simulator,id=68F37251-71BE-4F42-9849-62D61BFFE7C3'` after adding the Swift Social Agent run and run-async endpoint registry.
- Blocked: iOS targeted `xcodebuild test -project FitMeetAlpha.xcodeproj -scheme FitMeetAlpha -destination 'platform=iOS Simulator,id=68F37251-71BE-4F42-9849-62D61BFFE7C3' -only-testing:FitMeetAlphaTests/AuthRestoreContractTests` failed because the Simulator refused to launch `com.fitmeet.alpha` with `FBSOpenApplicationServiceErrorDomain` / `Application failed preflight checks` / `Busy`.
- Passed: landing `pnpm --dir fitmeet-landing test:source`
- Passed: landing `pnpm --dir fitmeet-landing lint`
- Passed: landing `pnpm --dir fitmeet-landing test`
- Passed: landing `pnpm --dir fitmeet-landing test` after adding rendered manifest checks that the public landing build does not depend on Next image optimization, runtime headers, rewrites, or data routes.
