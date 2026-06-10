# FitMeet Railway + Vercel Deployment Runbook

Last updated: 2026-06-07

This is the current preferred deployment path for FitMeet:

- Web frontend: Vercel at `https://socialworld.world`
- Backend API: Railway at `https://api.socialworld.world`
- iOS Release API: `https://api.socialworld.world/api`
- Database: PostgreSQL + Redis + MongoDB
- Upload storage: Aliyun OSS or S3/R2-compatible object storage

Do not paste real secrets into this file. Store production values only in Railway, Vercel, provider dashboards, or CI secret managers.

## Railway Backend

This file is kept as a compatibility note. The canonical Railway + Vercel
runbook is now:

```text
docs/deployment-vercel-railway.md
```

Create one Railway service for the backend:

- Repository root: this repository.
- Service root directory: `backend`.
- Config source in monorepo imports: `/backend/railway.json`.
- Build: Dockerfile, using `backend/Dockerfile.prod`.
- Health check path: `/api/health`.
- Public domain: `api.socialworld.world`.

Required backend variables:

```bash
NODE_ENV=production
PORT=3000
BASE_URL=https://api.socialworld.world
FRONTEND_BASE_URL=https://socialworld.world
ALLOWED_ORIGINS=https://socialworld.world,https://www.socialworld.world

DATABASE_URL=postgresql://...
DB_SSL=true
DB_SYNCHRONIZE=false
DB_MIGRATIONS_RUN=false

MONGO_URI=mongodb+srv://...

REDIS_URL=redis://...

JWT_SECRET=<32+ char random secret>
JWT_EXPIRES_IN=7d
AGENT_WEBHOOK_SIGNING_SECRET=<separate random secret>

DEEPSEEK_API_KEY=<secret>
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_CHAT_MODEL=deepseek-v4-pro
DEEPSEEK_FAST_MODEL=deepseek-v4-flash
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_TIMEOUT_MS=12000
SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS=12000
AGENT_OBSERVABILITY_ALERT_WEBHOOK_URL=<alert webhook>
AGENT_OBSERVABILITY_ALERT_WEBHOOK_TOKEN=<alert bearer token>
AGENT_OBSERVABILITY_ALERT_COOLDOWN_MS=300000

ENABLE_KAFKA=false

ALIYUN_ACCESS_KEY_ID=
ALIYUN_ACCESS_KEY_SECRET=
ALIYUN_OSS_REGION=oss-cn-qingdao
ALIYUN_OSS_BUCKET=
ALIYUN_OSS_ENDPOINT=https://oss-cn-qingdao.aliyuncs.com
ALIYUN_OSS_PUBLIC_BASE_URL=

AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_BUCKET_NAME=
S3_ENDPOINT=
S3_PUBLIC_BASE_URL=
```

Use one object storage provider. For production, `/uploads/image` and `/uploads/video` must not rely on local filesystem fallback. If S3/R2 uses a custom `S3_ENDPOINT`, set `S3_PUBLIC_BASE_URL` to the HTTPS media domain that browsers and iOS can read.

Before the first deploy, validate production env locally from a redacted `.env.production` copy:

```bash
pnpm --dir backend check:prod-env -- ../.env.production
```

On Railway or any platform shell where variables are injected into
`process.env`, validate without writing secrets to a file:

```bash
pnpm --dir backend check:prod-env -- --from-process
```

Run migrations explicitly after Railway has database connectivity and before exposing user traffic:

```bash
cd backend
NODE_ENV=production pnpm build
NODE_ENV=production pnpm migration:run:prod
NODE_ENV=production pnpm migration:status
```

On Railway, run the same commands from an authenticated deploy shell or one-off job with the service variables loaded. Keep `DB_MIGRATIONS_RUN=false` for normal app boot.

## Vercel Frontend

Create one Vercel project. The preferred path is importing the repository root
and letting root `vercel.json` build `frontend/`:

- Output Directory: `frontend/dist`
- API rewrite: `/api/*` -> `https://api.socialworld.world/api/*`
- Production domain: `socialworld.world`
- Optional alias: `www.socialworld.world`

If you instead set Vercel root directory to `frontend/`, use:

- Root Directory: `frontend`
- Install Command: `pnpm install --frozen-lockfile`
- Build Command: `pnpm build`
- Output Directory: `dist`
- Production domain: `socialworld.world`
- Optional alias: `www.socialworld.world`

Required Vercel variables:

```bash
VITE_API_BASE_URL=/api
VITE_WS_BASE_URL=https://api.socialworld.world
VITE_MAP_API_KEY=
VITE_AMAP_SECURITY_JS_CODE=
VITE_SENTRY_DSN=
VITE_ICP_TEXT=
VITE_ICP_URL=http://beian.miit.gov.cn/
```

Only `VITE_*` variables belong in Vercel. Do not put database URLs, JWT secrets, object-storage keys, DeepSeek keys, SMS keys, or WeChat secrets in frontend env.

## DNS

Configure DNS after Railway and Vercel show their target records:

- `socialworld.world` -> Vercel production domain target.
- `www.socialworld.world` -> Vercel production domain target, optional.
- `api.socialworld.world` -> Railway backend custom domain target.

Both Vercel and Railway should provision HTTPS automatically after DNS is valid. Do not buy a separate SSL certificate unless a provider specifically requires it.

## Deployment Smoke

After backend deploy:

```bash
curl -fsS https://api.socialworld.world/api/health
curl -fsS https://api.socialworld.world/api/ready
curl -fsS https://api.socialworld.world/api/openapi/fitmeet-core.json
```

After frontend deploy:

```bash
curl -fsS https://socialworld.world
```

Full non-destructive production smoke:

```bash
BASE_URL=https://socialworld.world \
API_BASE_URL=https://api.socialworld.world/api \
./scripts/verify-production.sh
```

App/Web real account smoke after staging test users exist:

```bash
BASE_URL=https://socialworld.world \
API_BASE_URL=https://api.socialworld.world/api \
APP_SMOKE_EMAIL=test@example.com \
APP_SMOKE_PASSWORD='***' \
APP_SMOKE_TARGET_USER_ID=123 \
APP_SMOKE_RUN_MUTATIONS=true \
./scripts/verify-production.sh --run-app-smoke
```

## iOS Staging Gate

The iOS Release build now defaults to `https://api.socialworld.world/api`. Before TestFlight, run:

```bash
cd "/Users/liuchongjiang/Documents/FitMeet app"
FITMEET_ALPHA_STAGING_E2E_REQUIRED=1 \
FITMEET_ALPHA_STAGING_E2E=1 \
FITMEET_ALPHA_STAGING_BASE_URL=https://api.socialworld.world/api \
FITMEET_ALPHA_STAGING_EMAIL=test@example.com \
FITMEET_ALPHA_STAGING_PASSWORD='***' \
FITMEET_ALPHA_STAGING_MESSAGE_TARGET_USER_ID=123 \
Scripts/release-preflight-ios.sh --require-staging
```

This covers login, refresh/profile restore, avatar upload/profile update, real messaging, feed moment publish/read-back, and optional Social Agent chat when `FITMEET_ALPHA_STAGING_AGENT_CHAT=1`.

## Performance Smoke

Run only after rate-limit policy for staging is understood:

```bash
LOAD_TEST_BASE_URL=https://api.socialworld.world \
LOAD_TEST_ALLOW_REMOTE=true \
LOAD_TEST_CONCURRENCY=1000 \
node scripts/load-1000-readonly.mjs
```

Realtime:

```bash
REALTIME_SMOKE_BASE_URL=https://api.socialworld.world \
REALTIME_SMOKE_ALLOW_REMOTE=true \
REALTIME_SMOKE_EMAIL=test@example.com \
REALTIME_SMOKE_PASSWORD='***' \
node scripts/realtime-1000-online-smoke.mjs
```

The local 1000-concurrency read-only run currently fails with HTTP 429 because the global throttler blocks a single local IP. That result proves rate limiting works, not backend capacity. Do not claim 10,000-concurrent readiness until staging has production-like sizing and accepted load results recorded in `docs/performance-readiness.md`.

## Current Human Checklist

1. Add Railway PostgreSQL, Redis, and MongoDB/Atlas connection values.
2. Add a real object-storage provider and HTTPS public base URL.
3. Rotate any provider secrets that appeared in local `backend/.env`.
4. Point `api.socialworld.world` to Railway and wait for HTTPS.
5. Point `socialworld.world` and optional `www.socialworld.world` to Vercel.
6. Run migrations explicitly.
7. Run production smoke.
8. Create two staging users and run iOS required staging E2E.
9. Run load and realtime smoke against staging with documented rate-limit policy.
