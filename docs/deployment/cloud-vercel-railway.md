# FitMeet Vercel + Railway Deployment Runbook

Last updated: 2026-06-07

Use this path when Railway hosts the NestJS backend and Vercel hosts the
`frontend/` Vite build. This is the preferred cloud topology before falling back
to the Aliyun ECS package.

## Topology

- Web: `https://socialworld.world` on Vercel.
- Backend API: `https://api.socialworld.world/api` on Railway.
- Vercel proxies Web `/api/*` to `https://api.socialworld.world/api/*` through
  the root `vercel.json`, so the Web build can use `VITE_API_BASE_URL=/api`.
- Realtime and Socket.IO should use the direct backend origin through
  `VITE_WS_BASE_URL=https://api.socialworld.world`; do not rely on Vercel for
  long-lived websocket proxying.
- iOS Release default remains `https://api.socialworld.world/api`.

## Railway Backend

Create the Railway service with root directory:

```text
backend
```

For monorepo imports, also set the Railway config source to:

```text
/backend/railway.json
```

The service then uses:

- `backend/railway.json` as the canonical Railway config.
- `backend/railway.toml` kept equivalent for tools or imports that prefer TOML.
- `backend/Dockerfile.prod`
- `backend/.dockerignore`
- `backend/package.json`

Before deploying, verify the Railway production image can build locally:

```bash
./scripts/railway-docker-build-check.sh
```

If Docker Hub is blocked or slow, the script may fail while fetching
`node:20-alpine` metadata. That is a local network/base-image blocker, not proof
that the Dockerfile is broken. Retry on a stable network, pre-pull
`node:20-alpine`, or set `NODE_IMAGE` to an approved reachable mirror before the
Railway deploy.

Configure Railway variables from:

```text
deploy/env.production.railway.example
```

Required managed services or equivalents:

- PostgreSQL: set `DATABASE_URL`.
- MongoDB: set `MONGO_URI`.
- Redis: set `REDIS_URL`.
- Object storage: configure Aliyun OSS or S3 before testing avatar/profile media
  flows. If S3/R2 uses a custom endpoint, also set `S3_PUBLIC_BASE_URL` to the
  HTTPS public media domain.
- DeepSeek: set `DEEPSEEK_API_KEY`, `DEEPSEEK_CHAT_MODEL=deepseek-v4-pro`, and
  `DEEPSEEK_FAST_MODEL=deepseek-v4-flash`.

Keep:

```text
DB_SYNCHRONIZE=false
DB_MIGRATIONS_RUN=false
ENABLE_KAFKA=false
```

Run migrations explicitly from a Railway shell after the first successful
backend build:

```bash
pnpm check:prod-env -- --from-process
pnpm migration:run:prod
pnpm migration:status
```

Then verify:

```bash
curl -fsS https://api.socialworld.world/api/health
curl -fsS https://api.socialworld.world/api/ready
curl -fsS https://api.socialworld.world/api/openapi/fitmeet-core.json
```

Create dedicated staging QA users through the normal signup/admin process only
after the database is ready. Keep the `FITMEET_AGENT_BROWSER_QA_*` and
`FITMEET_ALPHA_STAGING_*` exports in a secret note or shell session, not in the
repository.

Without GitHub auto-deploy, use the Railway dashboard or CLI to deploy the
`backend/` service after logging in. The code-side requirement is that the
service uses `backend/` as its root and `/backend/railway.json` as its config
source. If Railway detects `backend/railway.toml` instead, confirm it still
points to the same Dockerfile, start command, health check, and restart policy.

Local CLI availability check:

```bash
railway --version
railway whoami
```

If the Railway CLI is not installed, use the dashboard first; do not add tokens
to the repository. Do not commit `.railway/` if the CLI creates local project
metadata.

## Vercel Frontend

If importing the repository root into Vercel, the root `vercel.json` builds the
main Web app from `frontend/` and outputs `frontend/dist`.

The root `.vercelignore` intentionally excludes backend, landing, docs, ECS zip,
QA screenshots, local env files, and platform metadata so direct CLI deploys do
not upload the whole multi-project workspace.

Set Vercel environment variables from:

```text
deploy/env.production.vercel.example
```

Minimum production values:

```text
VITE_API_BASE_URL=/api
VITE_WS_BASE_URL=https://api.socialworld.world
```

If the Vercel project root is manually set to `frontend/`, mirror the same
settings in the dashboard:

```text
Install Command: corepack enable && corepack prepare pnpm@10.30.3 --activate && pnpm install --frozen-lockfile
Build Command: pnpm build
Output Directory: dist
```

In that mode, add a Vercel rewrite in the dashboard or point
`VITE_API_BASE_URL` directly to `https://api.socialworld.world/api`.

Direct Vercel CLI deploy without GitHub:

```bash
pnpm dlx vercel login
pnpm dlx vercel link --yes --project fit-meetweb --scope liuchongjiang-s-projects
scripts/vercel-prebuilt-deploy.sh
```

This login flow creates local Vercel credentials and `./.vercel/project.json`.
Both are workstation state, not source files. If the shell does not have local
Vercel credentials, `pnpm dlx vercel whoami` starts a device-login flow and
waits for browser authorization.

If using a CI token instead of browser login, set `VERCEL_TOKEN`,
`VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` as machine secrets and pass
`--token="$VERCEL_TOKEN"` to Vercel commands:

```bash
VERCEL_ORG_ID=team_8HcgVRVOUb1rTBt6sGtGryj5
VERCEL_PROJECT_ID=prj_nDiPcbZYxaqfegcC8qj02XNs7Rgh
scripts/vercel-prebuilt-deploy.sh
```

Do not commit `.vercel/`, `.env.vercel.production.local`, or token values. The
repository `.gitignore` and ECS package builder explicitly exclude `.vercel/`,
`.railway/`, env files, and token-bearing local files.

Before using real credentials, the same script can prove the local Vite build
path without deploying:

```bash
VERCEL_TOKEN=dry-run \
VERCEL_ORG_ID=team_8HcgVRVOUb1rTBt6sGtGryj5 \
VERCEL_PROJECT_ID=prj_nDiPcbZYxaqfegcC8qj02XNs7Rgh \
scripts/vercel-prebuilt-deploy.sh --dry-run
```

The dry-run token value is intentionally fake; `--dry-run` stops before Vercel
`pull`, `build`, or `deploy`.

Before attempting a cloud deploy or immediately after configuring dashboard
settings, run the read-only platform preflight:

```bash
./scripts/cloud-platform-preflight.sh
```

The preflight uses `FITMEET_PREFLIGHT_TIMEOUT_SECONDS=20` by default for CLI
probes so Vercel device login waits or Railway CLI download stalls become
warnings instead of hanging the launch check. Increase it only when the network
is slow but known healthy.

After custom domains are attached and DNS is expected to be live, run:

```bash
./scripts/cloud-platform-preflight.sh --check-domain --strict
```

Current local validation on 2026-06-07:

- Vercel connector can see team `liuchongjiang-s-projects` and project
  `fit-meetweb` (`prj_nDiPcbZYxaqfegcC8qj02XNs7Rgh`), but the project reports
  `live: false`.
- Latest recorded Vercel production deployment is `CANCELED`
  (`dpl_CoM4xTDx2sfoAqM9bf4dnNCqnCkw`).
- The project domain list contains only generated Vercel domains:
  `fit-meetweb-liuchongjiang-s-projects.vercel.app` and
  `fit-meetweb-git-main-liuchongjiang-s-projects.vercel.app`; it does not yet
  contain `socialworld.world`.
- The canceled deployment metadata points to GitHub repo `LiuChong27/FitMeetweb`,
  while the intended Web repo name is `LiuChong27/FitMeet-Web`. If using Git
  integration, reconnect or reimport the Vercel project to the intended repo and
  branch before relying on auto-deploy. If skipping GitHub submit, deploy the
  current local worktree with the direct Vercel CLI flow above after login.
- Vercel build logs for that canceled deployment returned 401 through the
  connector.
- Local Vercel CLI auth is not yet completed. Chrome has a Vercel device
  authorization tab open from `pnpm dlx vercel whoami`, but clicking authorize
  grants persistent CLI access to the Vercel account. Complete that human
  authorization step only when ready to deploy from this workstation, or use a
  `VERCEL_TOKEN` secret instead.
- Local Vercel project linking is not yet present in this working tree:
  `./.vercel/project.json` is absent. Direct local deploy therefore requires
  either `pnpm dlx vercel login` followed by `pnpm dlx vercel link --yes
  --project fit-meetweb --scope liuchongjiang-s-projects`, or CI/machine
  secrets for `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`.
- `scripts/vercel-prebuilt-deploy.sh` now wraps the no-GitHub Vercel path. It
  builds `frontend/` locally with `VITE_API_BASE_URL=/api` and
  `VITE_WS_BASE_URL=https://api.socialworld.world`, fails fast when deploy
  identity is absent, and uses `vercel deploy --prebuilt --prod` only after
  credentials are available.
- `scripts/lib/toolchain.sh` now bootstraps the stable local Node/pnpm paths for
  launch scripts. Override with `FITMEET_NODE_RUNTIME_DIR` or
  `FITMEET_PNPM_BIN_DIR` only when running on a different host.

Railway CLI status:

- `railway` is not installed in the current shell.
- `pnpm dlx @railway/cli --version` reached the `@railway/cli` postinstall step
  on 2026-06-07, then stalled while downloading the macOS aarch64 release from
  GitHub. Use Railway dashboard deployment first, or retry CLI install/login on
  a network that can fetch Railway's GitHub release asset.

## Production Smoke

After Railway and Vercel are both deployed:

```bash
./scripts/domain-readiness-check.sh --print-required-records

WEB_ORIGIN=https://socialworld.world \
API_BASE_URL=https://api.socialworld.world/api \
./scripts/domain-readiness-check.sh
```

This domain readiness check must pass before the full smoke below. If it fails,
fix DNS/custom-domain/TLS first:

- `socialworld.world` should be attached to the Vercel Web project. For an apex
  domain, Vercel's documented A record is `76.76.21.21`; remove stale A records
  that still point at an old OpenResty/S3/ECS host unless that host is the
  intentional production path. The readiness script checks this by default; set
  `CHECK_VERCEL_WEB_DNS=false` only when intentionally validating the Aliyun ECS
  same-origin fallback instead of the Vercel topology.
- `api.socialworld.world` should be attached to the Railway backend service.
  Create the custom domain in Railway, then add the CNAME target Railway gives
  you at the DNS provider.
- Do not run authenticated production smoke until both HTTPS Web and
  `/api/health` pass.

At Namecheap, use the platform records instead of buying add-ons:

| Host / Name | Type | Value |
| --- | --- | --- |
| `socialworld.world` / `@` | `A` | `76.76.21.21` after the domain is added to Vercel |
| `www` | `CNAME` | `cname.vercel-dns.com`, or the target Vercel shows |
| `api` | `CNAME` | the exact Railway custom-domain target shown in Settings -> Networking |

Do not buy Spacemail, Namecheap Website/Alf Website, EasyWP, Network Hosting,
Starlight/hosting accelerators, or a separate SSL certificate for this topology.
Vercel and Railway provision HTTPS after DNS is correct. Add email hosting later
only if the product needs real mailbox sending/receiving from the domain.

```bash
BASE_URL=https://socialworld.world \
API_BASE_URL=https://api.socialworld.world/api \
./scripts/verify-production.sh
```

When production writes are allowed:

```bash
BASE_URL=https://socialworld.world \
API_BASE_URL=https://api.socialworld.world/api \
./scripts/verify-production.sh --run-public-intent-write
```

Run Agent QA with real dedicated credentials:

```bash
BASE_URL=https://socialworld.world \
API_BASE_URL=https://api.socialworld.world/api \
FITMEET_AGENT_BROWSER_QA_EMAIL='qa@example.com' \
FITMEET_AGENT_BROWSER_QA_PASSWORD='***' \
./scripts/verify-agent-goal-production.sh
```

iOS staging E2E:

```bash
cd "/Users/liuchongjiang/Documents/FitMeet app"
FITMEET_ALPHA_RELEASE_API_BASE_URL=https://api.socialworld.world/api \
FITMEET_ALPHA_EXPECTED_API_BASE_URL=https://api.socialworld.world/api \
FITMEET_ALPHA_STAGING_BASE_URL=https://api.socialworld.world/api \
FITMEET_ALPHA_STAGING_EMAIL=fitmeet-smoke-owner@socialworld.world \
FITMEET_ALPHA_STAGING_PASSWORD='***' \
FITMEET_ALPHA_STAGING_MESSAGE_TARGET_USER_ID=123 \
Scripts/release-preflight-ios.sh --require-staging
```

## Fallback

If Railway or Vercel deployment is blocked by auth, billing, build image,
GitHub import, or domain verification, use the ECS package instead:

```bash
./scripts/build-deploy-zip.sh
```

Then follow:

```text
docs/deployment/ecs-fallback.md
```
