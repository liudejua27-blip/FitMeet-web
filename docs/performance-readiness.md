# FitMeet Performance Readiness

Last updated: 2026-06-06

This document records the current performance posture for a launch target designed toward 10,000 concurrent users. It is not a claim that 10,000 concurrent users has been proven. It lists what is in place, what must be measured, and the exact blockers for a trustworthy result.

## Current Capacity Design

- Backend HTTP handlers are intended to stay stateless; auth state is carried by JWT access/refresh tokens.
- PostgreSQL uses TypeORM with an explicit pool in `AppModule`:
  - `max: 100`
  - `min: 10`
  - `idleTimeoutMillis: 30000`
  - `connectionTimeoutMillis: 5000`
- MongoDB uses Mongoose with:
  - `maxPoolSize: 50`
  - `minPoolSize: 10`
  - `socketTimeoutMS: 45000`
  - `serverSelectionTimeoutMS: 5000`
- Redis is available for cache/realtime coordination paths.
- Rate limiting is enabled globally with short/medium/long throttler buckets, with tighter throttles on login/register/SMS.
- Feed pagination is present with `page` and `limit`; the OpenAPI contract caps core feed limit at 50.
- Mongo message schemas declare compound indexes for high-frequency conversation list, message history, unread count, Agent inbox, and recent Agent signal reads. These are code-level declarations; staging/production index existence must still be verified against the live Mongo deployment.
- Static asset compression and Helmet are enabled in the API process.
- Health and readiness are separated:
  - `GET /api/health` for process liveness.
  - `GET /api/ready` for Postgres/Mongo/Redis dependency readiness.

## Existing Performance Scripts

Read-only 1000-concurrency smoke:

```bash
node scripts/load-1000-readonly.mjs
```

Default target and endpoints:

- Target: `http://localhost:3000`
- Concurrency: `1000`
- Endpoints:
  - `/api/health`
  - `/api/ready`
  - `/api/feed?page=1&limit=5`
  - `/api/openapi/fitmeet-core.json`

Realtime 1000-online Socket.IO smoke:

```bash
node scripts/realtime-1000-online-smoke.mjs
```

Default namespaces:

- `realtime`
- `messages`

Remote safety gates:

- `LOAD_TEST_ALLOW_REMOTE=true` is required for remote HTTP load smoke.
- `REALTIME_SMOKE_ALLOW_REMOTE=true` is required for remote realtime smoke.

## Current Results

No fresh 2026-06-06 load result is recorded in this environment yet.

Precise blocker from the 2026-06-06 local Codex run:

- `docker` is not installed, so `docker compose up -d postgres mongo redis` cannot start local dependencies.
- MongoDB is not listening on `localhost:27017`.
- `pnpm --dir backend migration:status` fails with Postgres `ECONNREFUSED` for `localhost:5432/fitness_app`.
- Without reachable Postgres, MongoDB, and Redis, the backend cannot be honestly started and load-tested through `/api/ready` in this environment.
- Staging/production runs require intentional remote opt-in plus credentials or tokens for realtime auth.
- The current Codex session does not have production/staging credentials and should not invent or commit them.

The first accepted result should be pasted here with:

- git commit SHA
- target URL
- backend build/version
- database target class
- command and env used
- JSON output from the smoke script
- whether thresholds passed

## Required Local Smoke

Start dependencies and backend:

```bash
docker compose up -d postgres mongo redis
pnpm --dir backend migration:run
pnpm --dir backend start:dev
```

Verify readiness:

```bash
curl -fsS http://localhost:3000/api/health
curl -fsS http://localhost:3000/api/ready
```

Run read-only smoke:

```bash
LOAD_TEST_BASE_URL=http://localhost:3000 \
LOAD_TEST_CONCURRENCY=1000 \
LOAD_TEST_TIMEOUT_MS=10000 \
LOAD_TEST_P95_MS=1000 \
LOAD_TEST_P99_MS=2000 \
LOAD_TEST_MAX_ERROR_RATE=1 \
node scripts/load-1000-readonly.mjs
```

Run realtime smoke with a prepared local test account:

```bash
REALTIME_SMOKE_BASE_URL=http://localhost:3000 \
REALTIME_SMOKE_CONNECTIONS=1000 \
REALTIME_SMOKE_EMAIL=test@example.com \
REALTIME_SMOKE_PASSWORD='***' \
REALTIME_SMOKE_P95_MS=3000 \
REALTIME_SMOKE_MAX_ERROR_RATE=1 \
node scripts/realtime-1000-online-smoke.mjs
```

## Required Staging Smoke

Read-only staging:

```bash
LOAD_TEST_BASE_URL=https://www.ourfitmeet.cn \
LOAD_TEST_ALLOW_REMOTE=true \
LOAD_TEST_CONCURRENCY=1000 \
node scripts/load-1000-readonly.mjs
```

Realtime staging:

```bash
REALTIME_SMOKE_BASE_URL=https://www.ourfitmeet.cn \
REALTIME_SMOKE_ALLOW_REMOTE=true \
REALTIME_SMOKE_EMAIL=test@example.com \
REALTIME_SMOKE_PASSWORD='***' \
node scripts/realtime-1000-online-smoke.mjs
```

## Production Readiness Thresholds

Minimum before TestFlight/public beta:

- `/api/health`, `/api/ready`, `/api/openapi/fitmeet-core.json`, and `/api/feed?page=1&limit=5` return 2xx during the smoke.
- Read-only 1000-concurrency smoke:
  - error rate <= 1%
  - p95 <= 1000 ms
  - p99 <= 2000 ms
- Realtime 1000-online smoke:
  - error rate <= 1%
  - p95 connect <= 3000 ms
  - all successful sockets remain online for the hold window
- Backend logs do not expose JWTs, passwords, or object storage keys.
- Database CPU, connection count, lock waits, and slow queries are watched during the run.

Target before claiming 10,000 concurrent support:

- Repeat smoke at 2,500, 5,000, and 10,000 logical users in staging with production-like DB sizing.
- Add a write-path test with low rate limits for:
  - login/profile restore
  - avatar upload/profile update
  - feed publish/read-back
  - message send/read-back
- Capture database query plans for high-volume feed, message, and Social Agent task/session queries.
- Confirm Mongo and Postgres indexes on the deployed databases, not only in entity/schema definitions. For Mongo, specifically verify `conversations`, `messages`, and `agentinboxevents`.
- Confirm horizontal scaling behavior for Socket.IO and Redis coordination.

## Remaining Performance Risks

- The Social Agent path can be CPU/IO heavy because it may call AI providers and perform multi-step database reads. It should not be part of unauthenticated high-concurrency smoke until provider quotas and timeouts are fixed.
- Large Social Agent services still carry maintainability risk and need continued extraction and focused tests.
- Feed and message queries need production `EXPLAIN ANALYZE` against realistic data volumes.
- Upload performance depends on object storage and image processing; the current read-only load smoke does not cover multipart upload.
- Realtime 1000-online smoke needs real tokens or a prepared test account; a single reused token proves socket capacity but not per-user fanout correctness.
