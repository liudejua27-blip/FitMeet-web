# FitMeet Production Cutover Checklist

Last updated: 2026-06-07

Use this checklist on launch day after code-side readiness has passed. It is
ordered so Web, backend, database, DNS, and iOS TestFlight stay on the same API
contract.

Use `docs/production-secrets-checklist.md` while filling Railway, Vercel, iOS,
and smoke-test variables. Keep real values out of Git and documentation.

## 0. Current Known Blockers

These must be cleared before claiming production is live:

- Vercel project `fit-meetweb` currently reports `live: false`; latest recorded
  production deployment is `CANCELED`.
- Local Vercel CLI auth/linking is not complete in this shell:
  `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, and
  `./.vercel/project.json` are absent, so noninteractive Vercel deploy cannot
  run until browser login/link or CI secrets are provided.
- `www.ourfitmeet.cn` currently resolves to `34.216.117.25` and
  `54.149.79.189`, not the Vercel apex target `76.76.21.21`.
- `www.ourfitmeet.cn` has no DNS answer.
- Railway CLI is not installed/authenticated in the current shell; dashboard
  deploy or a logged-in CLI/token is required.
- Docker Hub access from the current shell times out while fetching
  `node:20-alpine`; retry on a stable network or pre-pull the image before
  using local Railway Docker proof.
- iOS Release API is correct for the Railway topology, but Apple
  `DEVELOPMENT_TEAM`, App Store Connect bundle registration for
  `com.fitmeet.alpha`, and staging E2E credentials are not configured.

## 1. Local Readiness Snapshot

Run the aggregated launch status first:

```bash
./scripts/launch-status.sh
```

Expected before production cutover:

- Shell syntax: pass.
- Backend production deploy readiness tests: pass.
- Vercel/Railway platform preflight: pass.
- Public DNS/TLS/API readiness: pass.
- iOS TestFlight readiness: pass.

If Railway deploy will use Docker, also run:

```bash
./scripts/launch-status.sh --include-railway-docker-build
```

## 2. Railway Backend

Create or update the Railway backend service:

- Root directory: `backend`.
- Railway config source: `/backend/railway.json`.
- Builder: Dockerfile.
- Dockerfile path: `Dockerfile.prod`.
- Start command: `node dist/main.js`.
- Health check path: `/api/health`.

Set Railway variables from:

```text
deploy/env.production.railway.example
```

Required production values:

- `BASE_URL=https://www.ourfitmeet.cn`
- `FRONTEND_BASE_URL=https://www.ourfitmeet.cn`
- `ALLOWED_ORIGINS=https://www.ourfitmeet.cn,https://ourfitmeet.cn`
- `DATABASE_URL`
- `MONGO_URI`
- `REDIS_URL`
- `JWT_SECRET`
- Aliyun OSS or S3/R2 object storage. If using custom `S3_ENDPOINT`, also set
  `S3_PUBLIC_BASE_URL`.
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_CHAT_MODEL=deepseek-v4-pro`
- `DEEPSEEK_FAST_MODEL=deepseek-v4-flash`
- `AGENT_OBSERVABILITY_ALERTS_ENABLED=false` for first launch; set to `true`
  later when an external alert receiver is ready.
- `AGENT_OBSERVABILITY_ALERT_WEBHOOK_URL` when alert delivery is enabled.
- `AGENT_OBSERVABILITY_ALERT_WEBHOOK_TOKEN` when alert delivery is enabled.
- `AGENT_OBSERVABILITY_ALERT_COOLDOWN_MS=300000`
- `DB_SYNCHRONIZE=false`
- `DB_MIGRATIONS_RUN=false`

After the first successful backend build, run from a Railway shell:

```bash
pnpm check:prod-env -- --from-process
pnpm migration:run:prod
pnpm migration:status
```

Then verify:

```bash
curl -fsS https://www.ourfitmeet.cn/api/health
curl -fsS https://www.ourfitmeet.cn/api/ready
curl -fsS https://www.ourfitmeet.cn/api/openapi/fitmeet-core.json
```

## 3. Vercel Frontend

Use the root `vercel.json` unless intentionally setting Vercel's root directory
to `frontend`.

Vercel production env:

```text
VITE_API_BASE_URL=/api
VITE_WS_BASE_URL=https://www.ourfitmeet.cn
```

Direct CLI deploy path after login:

```bash
pnpm dlx vercel login
pnpm dlx vercel link --yes --project fit-meetweb --scope liuchongjiang-s-projects
scripts/vercel-prebuilt-deploy.sh
```

CI/token deploy path:

```bash
export VERCEL_TOKEN='***'
export VERCEL_ORG_ID='team_8HcgVRVOUb1rTBt6sGtGryj5'
export VERCEL_PROJECT_ID='prj_nDiPcbZYxaqfegcC8qj02XNs7Rgh'
scripts/vercel-prebuilt-deploy.sh
```

Do not commit `.vercel/` or `.env.vercel.production.local`.

## 4. DNS And Domains

Attach domains first in each platform dashboard, then add DNS records at the DNS
provider.

Print the required DNS plan:

```bash
./scripts/domain-readiness-check.sh --print-required-records
```

Vercel Web:

- Add `www.ourfitmeet.cn` to the Vercel Web project.
- For apex DNS, set A record to `76.76.21.21` unless Vercel shows a different
  required target.
- Add or verify `ourfitmeet.cn` only if the product will serve the
  `www` origin.

Railway API:

- Add `www.ourfitmeet.cn` as a Railway custom domain on the backend service.
- Create the DNS record Railway shows in Settings -> Networking.

Namecheap purchase note:

- Do not buy Spacemail, Alf Website/Namecheap Website, EasyWP, Network Hosting,
  Starlight/hosting accelerators, or a separate SSL certificate for the current
  Vercel + Railway path.
- The only required Namecheap work is DNS: apex `A` to Vercel, optional `www`
  `CNAME` to Vercel, and `api` `CNAME` to Railway.
- Buy email hosting later only if FitMeet needs a real mailbox on
  `@ourfitmeet.cn`.

Validate:

```bash
WEB_ORIGIN=https://www.ourfitmeet.cn \
API_BASE_URL=https://www.ourfitmeet.cn/api \
./scripts/domain-readiness-check.sh
```

## 5. Production Smoke

Run non-mutating smoke:

```bash
BASE_URL=https://www.ourfitmeet.cn \
API_BASE_URL=https://www.ourfitmeet.cn/api \
./scripts/verify-production.sh
```

Prepare dedicated smoke users only after migrations and object storage are
ready:

```bash
APP_SMOKE_SEED_PASSWORD='use-a-long-random-password' \
APP_SMOKE_SEED_ALLOW_PRODUCTION=true \
pnpm -C backend run seed:app-smoke-users
```

Use the printed exports, then run authenticated mutation smoke:

```bash
BASE_URL=https://www.ourfitmeet.cn \
API_BASE_URL=https://www.ourfitmeet.cn/api \
APP_SMOKE_EMAIL=fitmeet-smoke-owner@ourfitmeet.cn \
APP_SMOKE_PASSWORD='***' \
APP_SMOKE_TARGET_USER_ID=123 \
APP_SMOKE_RUN_MUTATIONS=true \
./scripts/verify-production.sh --run-app-smoke
```

This covers login, refresh/profile restore, feed interactions, real messaging,
avatar upload/profile save, feed moment publish/read-back, and Social Agent
route-message.

## 6. iOS TestFlight Gate

Before archive/TestFlight:

```bash
cd "/Users/liuchongjiang/Documents/FitMeet app"
Scripts/testflight-readiness-check.sh --strict --require-staging
```

Expected requirements:

- `DEVELOPMENT_TEAM` is set.
- `PRODUCT_BUNDLE_IDENTIFIER=com.fitmeet.alpha` is registered in App Store
  Connect.
- Release `FITMEET_API_BASE_URL=https://www.ourfitmeet.cn/api`.
- Release `FITMEET_ALLOW_BASE_URL_OVERRIDE=NO`.
- `FITMEET_ALPHA_STAGING_BASE_URL=https://www.ourfitmeet.cn/api`.
- `FITMEET_ALPHA_STAGING_EMAIL`, `FITMEET_ALPHA_STAGING_PASSWORD`, and
  `FITMEET_ALPHA_STAGING_MESSAGE_TARGET_USER_ID` are set.

Then run the real staging gate:

```bash
FITMEET_ALPHA_RELEASE_API_BASE_URL=https://www.ourfitmeet.cn/api \
FITMEET_ALPHA_EXPECTED_API_BASE_URL=https://www.ourfitmeet.cn/api \
FITMEET_ALPHA_STAGING_BASE_URL=https://www.ourfitmeet.cn/api \
FITMEET_ALPHA_STAGING_EMAIL=fitmeet-smoke-owner@ourfitmeet.cn \
FITMEET_ALPHA_STAGING_PASSWORD='***' \
FITMEET_ALPHA_STAGING_MESSAGE_TARGET_USER_ID=123 \
Scripts/release-preflight-ios.sh --require-staging
```

After the strict gate passes, create the local TestFlight archive without
uploading to App Store Connect:

```bash
FITMEET_ALPHA_STAGING_BASE_URL=https://www.ourfitmeet.cn/api \
FITMEET_ALPHA_STAGING_EMAIL=fitmeet-smoke-owner@ourfitmeet.cn \
FITMEET_ALPHA_STAGING_PASSWORD='***' \
FITMEET_ALPHA_STAGING_MESSAGE_TARGET_USER_ID=123 \
Scripts/testflight-archive.sh --export
```

Upload the exported IPA manually with Xcode Organizer, Transporter, or CI after
confirming the bundle id and Apple Developer Team in App Store Connect.

## 7. ECS Fallback

If Railway/Vercel remains blocked by authorization, billing, Docker Hub, GitHub
import, or domain verification, use the ECS package path.

Build package:

```bash
./scripts/build-deploy-zip.sh
ls -lh fitmeet-ecs-deploy.zip fitmeet-ecs-deploy.zip.sha256 fitmeet-ecs-install-release.sh
./scripts/ecs-upload-release.sh --ssh root@YOUR_ECS_PUBLIC_IP
./scripts/ecs-upload-release.sh --ssh root@YOUR_ECS_PUBLIC_IP --check-ssh
./scripts/ecs-workbench-install-plan.sh
./scripts/domain-readiness-check.sh --topology ecs --print-required-records
TIMEOUT_SECONDS=8 ./scripts/launch-status.sh --topology ecs --skip-ios-testflight-check
```

Upload when the dry-run command is correct:

```bash
./scripts/ecs-upload-release.sh --ssh root@YOUR_ECS_PUBLIC_IP --upload
```

Upload and follow:

```text
docs/deployment-aliyun-ecs.md
```

On the server, verify and install the package with:

```bash
chmod +x /path/to/fitmeet-ecs-install-release.sh
/path/to/fitmeet-ecs-install-release.sh \
  --archive /path/to/fitmeet-ecs-deploy.zip \
  --checksum /path/to/fitmeet-ecs-deploy.zip.sha256 \
  --target /opt/FitMeet-web

/path/to/fitmeet-ecs-install-release.sh \
  --archive /path/to/fitmeet-ecs-deploy.zip \
  --checksum /path/to/fitmeet-ecs-deploy.zip.sha256 \
  --target /opt/FitMeet-web \
  --install
```

For ECS, iOS Release API must be overridden to:

```text
https://www.ourfitmeet.cn/api
```

Run:

```bash
cd "/Users/liuchongjiang/Documents/FitMeet app"
FITMEET_ALPHA_STAGING_BASE_URL=https://www.ourfitmeet.cn/api \
FITMEET_ALPHA_STAGING_EMAIL=fitmeet-smoke-owner@ourfitmeet.cn \
FITMEET_ALPHA_STAGING_PASSWORD='***' \
FITMEET_ALPHA_STAGING_MESSAGE_TARGET_USER_ID=123 \
Scripts/ecs-release-preflight-ios.sh --require-staging
```
