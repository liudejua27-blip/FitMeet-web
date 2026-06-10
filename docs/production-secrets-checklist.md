# FitMeet Production Secrets Checklist

Last updated: 2026-06-07

This checklist lists the production secrets and environment variables that must
be entered into Railway, Vercel, iOS/TestFlight, and smoke-test shells. Do not
write real values in this file, commit real `.env` files, or paste secrets into
issues, docs, or chat.

## Railway Backend

Configure these on the Railway backend service from
`deploy/env.production.railway.example`.

Required release values:

- `NODE_ENV=production`
- `PORT=3000`
- `BASE_URL=https://www.ourfitmeet.cn`
- `FRONTEND_BASE_URL=https://www.ourfitmeet.cn`
- `ALLOWED_ORIGINS=https://www.ourfitmeet.cn,https://ourfitmeet.cn`
- `DATABASE_URL`
- `DB_SSL=true` when the managed Postgres provider requires TLS.
- `DB_MIGRATIONS_RUN=false`
- `DB_SYNCHRONIZE=false`
- `MONGO_URI`
- `REDIS_URL`
- `JWT_SECRET`, at least 32 characters and not reused elsewhere.
- `AGENT_WEBHOOK_SIGNING_SECRET`, separate from `JWT_SECRET`.
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL=https://api.deepseek.com`
- `DEEPSEEK_CHAT_MODEL=deepseek-v4-pro`
- `DEEPSEEK_FAST_MODEL=deepseek-v4-flash`
- `DEEPSEEK_MODEL=deepseek-v4-flash`
- `AGENT_OBSERVABILITY_ALERTS_ENABLED=false` for first launch; set to `true`
  later when an external alert receiver is ready.
- `AGENT_OBSERVABILITY_ALERT_WEBHOOK_URL` when alert delivery is enabled.
- `AGENT_OBSERVABILITY_ALERT_WEBHOOK_TOKEN` when alert delivery is enabled.
- `AGENT_OBSERVABILITY_ALERT_COOLDOWN_MS=300000`
- One production object storage provider:
  - Aliyun OSS: `ALIYUN_ACCESS_KEY_ID`,
    `ALIYUN_ACCESS_KEY_SECRET`, `ALIYUN_OSS_REGION`,
    `ALIYUN_OSS_BUCKET`, `ALIYUN_OSS_ENDPOINT`,
    `ALIYUN_OSS_PUBLIC_BASE_URL`.
  - S3/R2-compatible: `AWS_REGION`, `AWS_ACCESS_KEY_ID`,
    `AWS_SECRET_ACCESS_KEY`, `AWS_BUCKET_NAME`; if `S3_ENDPOINT` is set, also
    set HTTPS `S3_PUBLIC_BASE_URL`.

Launch-critical but provider-dependent values:

- `SMS_ACCESS_KEY`
- `SMS_SECRET_KEY`
- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`
- `WECHAT_REDIRECT_URI=https://www.ourfitmeet.cn/api/auth/wechat/callback`
- `WECHAT_MINI_APP_ID`
- `WECHAT_MINI_APP_SECRET`
- `AMAP_WEB_SERVICE_KEY`

Validate inside a Railway shell after variables are set:

```bash
pnpm check:prod-env -- --from-process
```

## Vercel Frontend

Only `VITE_*` values belong in Vercel because they can be exposed to the browser
bundle.

Required:

- `VITE_API_BASE_URL=/api`
- `VITE_WS_BASE_URL=https://www.ourfitmeet.cn`

Optional public frontend values:

- `VITE_MAP_API_KEY`
- `VITE_AMAP_SECURITY_JS_CODE`
- `VITE_SENTRY_DSN`
- `VITE_ICP_TEXT`
- `VITE_ICP_URL`

Never put these in Vercel frontend env:

- `DATABASE_URL`, `MONGO_URI`, `REDIS_URL`
- `JWT_SECRET`, `AGENT_WEBHOOK_SIGNING_SECRET`
- Object storage access keys
- `DEEPSEEK_API_KEY`
- `AGENT_OBSERVABILITY_ALERT_WEBHOOK_TOKEN`
- SMS or WeChat secrets

## iOS And TestFlight

Release build settings must resolve to:

- `FITMEET_API_BASE_URL=https://www.ourfitmeet.cn/api`
- `FITMEET_ALLOW_BASE_URL_OVERRIDE=NO`
- `PRODUCT_BUNDLE_IDENTIFIER=com.fitmeet.alpha`
- non-empty `DEVELOPMENT_TEAM`

The bundle id must be registered in App Store Connect before TestFlight.

Check without archiving:

```bash
cd "/Users/liuchongjiang/Documents/FitMeet app"
Scripts/testflight-readiness-check.sh --strict --require-staging
```

## Staging And Smoke Credentials

Prepare dedicated smoke users after the deployed database, migrations, and
object storage are ready:

```bash
APP_SMOKE_SEED_PASSWORD='use-a-long-random-password' \
APP_SMOKE_SEED_ALLOW_PRODUCTION=true \
pnpm -C backend run seed:app-smoke-users
```

Keep the printed exports in a local secret note or platform secret manager:

- `APP_SMOKE_EMAIL`
- `APP_SMOKE_PASSWORD`
- `APP_SMOKE_TARGET_USER_ID`
- `FITMEET_ALPHA_STAGING_BASE_URL`
- `FITMEET_ALPHA_STAGING_EMAIL`
- `FITMEET_ALPHA_STAGING_PASSWORD`
- `FITMEET_ALPHA_STAGING_MESSAGE_TARGET_USER_ID`

Use them for:

```bash
BASE_URL=https://www.ourfitmeet.cn \
API_BASE_URL=https://www.ourfitmeet.cn/api \
./scripts/verify-production.sh --run-app-smoke
```

and:

```bash
cd "/Users/liuchongjiang/Documents/FitMeet app"
FITMEET_ALPHA_STAGING_E2E_REQUIRED=1 \
FITMEET_ALPHA_STAGING_E2E=1 \
swift Scripts/staging-backend-e2e.swift
```

## ECS Fallback

If using the ECS same-origin fallback instead of Railway/Vercel:

- Copy `deploy/env.production.ecs.example` to `.env.production` on the server.
- Replace every `CHANGE_ME` value.
- Keep real `.env.production` only on the server or in a secret manager.
- Set iOS release/staging API base to `https://www.ourfitmeet.cn/api`.

Validate on the server before deploy:

```bash
pnpm -C backend run check:prod-env -- ../.env.production
```
