# FitMeet Aliyun ECS Deployment Runbook

Last updated: 2026-06-10

Use this path when Railway/Vercel deployment is blocked by account authorization, billing, or GitHub import. It packages the current Web/backend stack for a Docker Compose deployment on an Aliyun ECS host.

## Topology

- Public Web origin: `https://www.ourfitmeet.cn`
- Nginx serves `frontend/dist`
- Nginx proxies `/api/*` and `/socket.io/*` to the NestJS backend container
- PostgreSQL, MongoDB, Redis, Kafka, backend, and Nginx run through `docker-compose.prod.yml`
- SSL certificate files must be placed on the server at `nginx/ssl/fullchain.pem` and `nginx/ssl/privkey.pem`

## Build The Upload Package

On macOS/Linux:

```bash
export PATH="/Users/liuchongjiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/liuchongjiang/Library/pnpm:$PATH"
./scripts/build-deploy-zip.sh
```

The script builds the frontend with same-origin API settings:

```bash
VITE_API_BASE_URL=/api
VITE_WS_BASE_URL=
```

It then builds the backend, runs a production `backend/Dockerfile.prod` build
with `pnpm --frozen-lockfile`, and creates:

```text
fitmeet-ecs-deploy.zip
fitmeet-ecs-deploy.zip.sha256
fitmeet-ecs-install-release.sh
```

The zip scan fails if it contains `.env` files, `node_modules`, `.git`, SSL private material, QA screenshots, logs, or nested zip files.
Upload all three files to the server and verify the checksum before unpacking.

## Server Upload And Start

Upload `fitmeet-ecs-deploy.zip`, `fitmeet-ecs-deploy.zip.sha256`, and
`fitmeet-ecs-install-release.sh` to the ECS server. Verify the archive, then
unpack:

```bash
mkdir -p /opt
cd /opt
sha256sum -c /path/to/fitmeet-ecs-deploy.zip.sha256
unzip /path/to/fitmeet-ecs-deploy.zip
cd /opt/FitMeet-web
```

From the local machine, `scripts/ecs-upload-release.sh` can prepare the exact
upload commands or perform the upload when SSH is configured:

```bash
./scripts/ecs-upload-release.sh --ssh root@YOUR_ECS_PUBLIC_IP
./scripts/ecs-upload-release.sh --ssh root@YOUR_ECS_PUBLIC_IP --check-ssh
./scripts/ecs-upload-release.sh --ssh root@YOUR_ECS_PUBLIC_IP --upload
```

The upload helper validates the local checksum first. `--check-ssh` verifies
noninteractive public-key SSH access before any upload. If SSH fails with
`Permission denied (publickey...)`, configure an SSH key for this machine, run
the printed commands from a terminal that can authenticate, or use Aliyun
Workbench's file-upload channel to place the same three files in
`~/fitmeet-release`. `--upload` creates the remote release directory, uploads
the zip, checksum, and installer, then prints the remote dry-run/install command.

For the Workbench path, generate the paste-ready terminal command block locally:

```bash
./scripts/ecs-workbench-install-plan.sh
```

The exported `fitmeet-ecs-install-release.sh` verifies the checksum and zip
shape, backs up an existing `/opt/FitMeet-web`, preserves `.env.production` and
`nginx/ssl/`, then syncs the new release. Run it first without `--install` to
preview the plan:

```bash
chmod +x /path/to/fitmeet-ecs-install-release.sh
/path/to/fitmeet-ecs-install-release.sh \
  --archive /path/to/fitmeet-ecs-deploy.zip \
  --checksum /path/to/fitmeet-ecs-deploy.zip.sha256 \
  --target /opt/FitMeet-web
```

Apply the release:

```bash
/path/to/fitmeet-ecs-install-release.sh \
  --archive /path/to/fitmeet-ecs-deploy.zip \
  --checksum /path/to/fitmeet-ecs-deploy.zip.sha256 \
  --target /opt/FitMeet-web \
  --install
```

Create production env from the packaged ECS template and fill real values:

```bash
cp deploy/env.production.ecs.example .env.production
```

Required values include:

- `BASE_URL=https://www.ourfitmeet.cn`
- `FRONTEND_BASE_URL=https://www.ourfitmeet.cn`
- `ALLOWED_ORIGINS=https://www.ourfitmeet.cn,https://ourfitmeet.cn`
- PostgreSQL split vars: `DB_HOST=postgres`, `DB_PORT=5432`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`
- Mongo split vars and `MONGO_URI=mongodb://<user>:<password>@mongo:27017/fitness_app?authSource=admin`
- `REDIS_PASSWORD`
- `JWT_SECRET`
- object storage credentials for uploads; avatar upload and feed image E2E require a real OSS/S3 bucket. If S3/R2 uses a custom endpoint, set `S3_PUBLIC_BASE_URL` to the HTTPS public media domain.
- `DEEPSEEK_API_KEY`, `DEEPSEEK_CHAT_MODEL=deepseek-v4-pro`, `DEEPSEEK_FAST_MODEL=deepseek-v4-flash`
- First launch can keep `AGENT_OBSERVABILITY_ALERTS_ENABLED=false`. When traffic grows, set it to `true` and configure `AGENT_OBSERVABILITY_ALERT_WEBHOOK_URL`, `AGENT_OBSERVABILITY_ALERT_WEBHOOK_TOKEN`, and `AGENT_OBSERVABILITY_ALERT_COOLDOWN_MS=300000`.

Copy SSL files:

```bash
mkdir -p nginx/ssl
cp /secure/fullchain.pem nginx/ssl/fullchain.pem
cp /secure/privkey.pem nginx/ssl/privkey.pem
chmod 600 nginx/ssl/privkey.pem
```

Run the host preflight before starting containers. It checks Docker, Compose,
required files, `.env.production`, domain/origin settings, SSL material and SAN,
upload temp directory config, subagent worker healthcheck config, disk/memory,
port 80/443 availability, Docker Compose interpolation, and production env
readiness when `pnpm` is already available:

```bash
APP_DIR=/opt/FitMeet-web ./scripts/ecs-host-preflight.sh
```

For a pure host/file/SSL check before installing pnpm, use
`RUN_PROD_ENV_CHECK=false`. The deploy script still runs `check:prod-env` later
as a hard gate.

Validate env and deploy manually:

```bash
corepack enable
corepack prepare pnpm@10.30.3 --activate
pnpm -C backend install --frozen-lockfile
pnpm -C backend run check:prod-env -- ../.env.production
docker compose -f docker-compose.prod.yml --env-file .env.production up -d postgres redis mongo zookeeper kafka
docker compose -f docker-compose.prod.yml --env-file .env.production build backend subagent-worker
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm --no-deps backend pnpm uploads:check:prod
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm --no-deps backend pnpm migration:run:prod
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm --no-deps backend pnpm db:check-critical-tables:prod
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --no-build backend subagent-worker nginx
docker compose -f docker-compose.prod.yml --env-file .env.production ps
```

Or use the packaged deploy script:

```bash
APP_DIR=/opt/FitMeet-web \
RUN_RELEASE_PREFLIGHT=false \
BUILD_FRONTEND=false \
PUBLIC_BASE_URL=https://www.ourfitmeet.cn \
PUBLIC_API_BASE_URL=https://www.ourfitmeet.cn/api \
./scripts/deploy-production.sh
```

The deploy script runs the same host preflight by default, starts only data
services first, builds the backend/worker images, runs upload-dir preflight,
runs TypeORM migrations, verifies critical tables, and only then starts
backend, subagent-worker, and nginx. Set `RUN_ECS_HOST_PREFLIGHT=false` only
after you have already run the preflight manually. `RUN_DB_MIGRATIONS=true` is
the production default; if you deliberately set it false, the script still
checks that critical tables already exist before starting the app.

Prepare two release smoke users for Web production smoke and iOS staging E2E:

```bash
APP_SMOKE_SEED_PASSWORD='use-a-long-random-password' \
APP_SMOKE_SEED_ALLOW_PRODUCTION=true \
pnpm -C backend run seed:app-smoke-users
```

The command prints the exact `APP_SMOKE_*` and `FITMEET_ALPHA_STAGING_*` exports
needed by `verify-production.sh --run-app-smoke` and the iOS staging backend
E2E. Use dedicated smoke accounts, not a real user's account.

You can also let the post-deploy smoke script create/update those dedicated
accounts and immediately reuse the printed credentials inside the same shell
process:

```bash
APP_SMOKE_SEED_PASSWORD='use-a-long-random-password' \
APP_SMOKE_SEED_ALLOW_PRODUCTION=true \
BASE_URL=https://www.ourfitmeet.cn \
API_BASE_URL=https://www.ourfitmeet.cn/api \
FITMEET_LAUNCH_TOPOLOGY=ecs \
./scripts/ecs-post-deploy-smoke.sh --prepare-app-smoke-users --run-app-smoke
```

The script does not write smoke credentials to the repository. It keeps them in
the current process only, then runs `verify-production.sh`.

Prepare Agent smoke data inside the production Docker network without
`ts-node`:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm --no-deps backend pnpm seed:agent-smoke:prod:dry-run

AGENT_SMOKE_SEED_ALLOW_PRODUCTION=true \
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm --no-deps backend pnpm seed:agent-smoke:prod -- --allow-production
```

The Agent smoke seed refuses to write in `NODE_ENV=production` unless
`AGENT_SMOKE_SEED_ALLOW_PRODUCTION=true` or `--allow-production` is present.

Run migrations explicitly before app startup if you are not using the deploy
script:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm --no-deps backend pnpm migration:run:prod
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm --no-deps backend pnpm db:check-critical-tables:prod
```

## Verification

From your local machine:

```bash
./scripts/domain-readiness-check.sh --topology ecs --print-required-records
TIMEOUT_SECONDS=8 ./scripts/domain-readiness-check.sh --topology ecs
TIMEOUT_SECONDS=8 ./scripts/launch-status.sh --topology ecs --skip-ios-testflight-check
```

```bash
BASE_URL=https://www.ourfitmeet.cn \
API_BASE_URL=https://www.ourfitmeet.cn/api \
FITMEET_LAUNCH_TOPOLOGY=ecs \
./scripts/verify-production.sh
```

With prepared staging users:

```bash
BASE_URL=https://www.ourfitmeet.cn \
API_BASE_URL=https://www.ourfitmeet.cn/api \
FITMEET_LAUNCH_TOPOLOGY=ecs \
APP_SMOKE_EMAIL=test@example.com \
APP_SMOKE_PASSWORD='***' \
APP_SMOKE_TARGET_USER_ID=123 \
APP_SMOKE_RUN_MUTATIONS=true \
./scripts/verify-production.sh --run-app-smoke
```

Or run the combined ECS smoke entrypoint:

```bash
BASE_URL=https://www.ourfitmeet.cn \
API_BASE_URL=https://www.ourfitmeet.cn/api \
FITMEET_LAUNCH_TOPOLOGY=ecs \
APP_SMOKE_EMAIL=test@example.com \
APP_SMOKE_PASSWORD='***' \
APP_SMOKE_TARGET_USER_ID=123 \
./scripts/ecs-post-deploy-smoke.sh --run-app-smoke
```

iOS needs a matching Release API base if ECS is the final backend:

```text
https://www.ourfitmeet.cn/api
```

The current iOS Release default is `https://www.ourfitmeet.cn/api` for the Railway/Vercel topology. If ECS becomes the production backend, keep the app pointed at the same deployed API by using the ECS wrapper:

```bash
cd "/Users/liuchongjiang/Documents/FitMeet app"
FITMEET_ALPHA_STAGING_BASE_URL=https://www.ourfitmeet.cn/api \
FITMEET_ALPHA_STAGING_EMAIL=test@example.com \
FITMEET_ALPHA_STAGING_PASSWORD='***' \
FITMEET_ALPHA_STAGING_MESSAGE_TARGET_USER_ID=123 \
Scripts/ecs-release-preflight-ios.sh --require-staging
```

`Scripts/ecs-release-preflight-ios.sh` sets both `FITMEET_ALPHA_RELEASE_API_BASE_URL`
and `FITMEET_ALPHA_EXPECTED_API_BASE_URL` to `https://www.ourfitmeet.cn/api`.
If the ECS API host changes, set `FITMEET_ALPHA_ECS_API_BASE_URL` and make
`FITMEET_ALPHA_STAGING_BASE_URL` match it.

For the TestFlight archive, pass the same Xcode build setting:

```bash
xcodebuild archive \
  -project FitMeetAlpha.xcodeproj \
  -scheme FitMeetAlpha \
  -configuration Release \
  FITMEET_API_BASE_URL=https://www.ourfitmeet.cn/api
```
