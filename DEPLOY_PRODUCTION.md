# FitMeet Production Deploy Guide

Domain: `https://www.ourfitmeet.cn`

This project is prepared for a single-server Docker Compose deployment:

- Nginx serves `frontend/dist`
- Nginx proxies `/api/` to the Nest backend container
- The backend connects to Postgres, Redis, MongoDB, and Kafka on the Compose network
- In production, TypeORM runs migrations automatically unless `DB_MIGRATIONS_RUN=false`

## 1. Server Prerequisites

Install these on the server:

```bash
docker --version
docker compose version
git --version
```

Open ports:

```text
80/tcp
443/tcp
```

The domain must point to the server IP. Current DNS check:

```text
ourfitmeet.cn      -> 8.145.46.234
www.ourfitmeet.cn  -> 8.145.46.234
```

## 2. Files That Must Exist On The Server

At the project root, for the zip upload flow use `/opt/fitmeet-new`:

```text
.env.production
docker-compose.prod.yml
nginx/nginx.conf
nginx/ssl/fullchain.pem
nginx/ssl/privkey.pem
backend/
```

Do not publish `.env.production` to GitHub. It contains real secrets.

## 3. Build Frontend

Recommended: build `frontend/dist` locally or in CI, then upload it with the
deployment bundle. The production frontend must use relative API routing so the
browser calls the same origin (`https://www.ourfitmeet.cn/api/...`) and never
crosses from `www.ourfitmeet.cn` to `ourfitmeet.cn`.

Run locally or in CI:

```bash
cd frontend
pnpm install --frozen-lockfile
VITE_API_BASE_URL=/api \
VITE_WS_BASE_URL= \
pnpm build
```

On PowerShell:

```powershell
$env:VITE_API_BASE_URL="/api"
$env:VITE_WS_BASE_URL=""
pnpm -C frontend build
```

`pnpm build` deletes `frontend/dist` first and then runs
`pnpm run check:prod-build`. The check fails if the built assets contain:

```text
https://ourfitmeet.cn/api
https://www.ourfitmeet.cn/api
localhost:3000/api
```

If you must build on the 1.8GB production server, use the low-memory command:

```bash
NODE_OPTIONS=--max-old-space-size=1024 pnpm -C frontend run build:lowmem
```

The server deploy script defaults to using an existing `frontend/dist`. Set
`BUILD_FRONTEND=true` only when you intentionally want to build on the server.

## 4. Deploy Or Update Code

Build and scan a zip locally before upload:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-deploy-zip.ps1 -Output fitmeet-deploy.zip
```

Zip upload flow:

```bash
mkdir -p /opt/fitmeet-new
cd /opt/fitmeet-new
unzip -o /path/to/fitmeet-deploy.zip
cp /opt/fitness-app/.env.production /opt/fitmeet-new/.env.production
# IMPORTANT: if .env.production was edited on Windows it may contain CRLF
# line endings, which `docker compose --env-file` silently treats as part of
# the value (you will see e.g. POSTGRES_PASSWORD ending in \r and auth fails).
# Strip them once after copy:
sed -i 's/\r$//' /opt/fitmeet-new/.env.production
mkdir -p /opt/fitmeet-new/nginx/ssl
cp /opt/fitness-app/nginx/ssl/fullchain.pem /opt/fitmeet-new/nginx/ssl/fullchain.pem
cp /opt/fitness-app/nginx/ssl/privkey.pem /opt/fitmeet-new/nginx/ssl/privkey.pem
bash scripts/deploy-production.sh
```

The deploy script uses uploaded `frontend/dist` when present, scans it for
forbidden API origins, and then rebuilds/restarts the Docker Compose stack.

On the server:

```bash
cd /path/to/fitness-app
git pull
```

Recommended one-command deploy after the repo exists on the server:

```bash
APP_DIR=/path/to/fitness-app bash scripts/deploy-production.sh
```

If you do not deploy with Git, upload the project files except:

```text
node_modules/
backend/dist/
frontend/node_modules/
frontend/dist/ only if you build on the server
.git/
```

## 5. Start Production Stack

From the project root on the server:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Watch logs:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f backend
```

The backend should log Nest startup and TypeORM migrations. Production config uses:

```text
NODE_ENV=production
synchronize=false
migrationsRun=true
```

Keep `DB_MIGRATIONS_RUN` unset or set to `true` for this release.

Manual migration commands are available if you need to run them explicitly:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec backend pnpm run migration:run:prod
```

The canonical production services are:

```text
backend
nginx
postgres
mongo
redis
```

## 6. Confirm Agent Tables Exist

After deployment, run:

```bash
docker exec -it fitness-postgres psql -U fitness_user -d fitness_app -c "\dt agent_*"
docker exec -it fitness-postgres psql -U fitness_user -d fitness_app -c "\dt social_requests"
docker exec -it fitness-postgres psql -U fitness_user -d fitness_app -c "\dt contact_requests"
```

Expected tables include:

```text
agent_connections
agent_permissions
agent_activity_logs
agent_approval_requests
social_requests
contact_requests
safety_events
user_preferences
match_candidates
```

## 7. Verify Public And Agent APIs

From any machine:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-production.ps1
```

Quick health check:

```bash
curl https://www.ourfitmeet.cn/api/health
```

Expected after the new backend is deployed:

```text
Frontend -> 200
Backend health -> 200
Agent manifest without token -> 401
Public social intent -> 200
```

If `Agent manifest without token` returns `404`, the new backend has not been deployed or Nginx is not proxying to it.

For authorized mode:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-production.ps1 -AgentToken "YOUR_AGENT_TOKEN"
```

## 8. Publish OpenClaw Skill Package

Publish this folder:

```text
integrations/openclaw/fitmeet-social-skills/
```

It is already configured to default to:

```text
https://www.ourfitmeet.cn/api
```

Users can run public mode without a token. Advanced users can log in, complete real-name verification, open `/agent-token`, and bind `FITMEET_AGENT_TOKEN`.


## 9. Pre-Deploy: Host Volume for Uploads

The backend container runs as UID/GID **1001:1001** (see ackend/Dockerfile.prod).
The host directory mounted to /app/public/uploads MUST exist and be writable
by that UID, otherwise avatar/proof uploads silently fail with EACCES.

Run once on the server before the first docker compose up:

```bash
sudo mkdir -p /opt/fitmeet-app/backend/public/uploads/temp
sudo chown -R 1001:1001 /opt/fitmeet-app/backend/public/uploads
sudo chmod -R 775 /opt/fitmeet-app/backend/public/uploads
```

If your repo lives at a different path (e.g. /opt/fitmeet-new), adjust the path
to match the bind mount in `docker-compose.prod.yml`
(`./backend/public/uploads:/app/public/uploads`).

## 10. One-Off: Schema Patch For Pre-Existing Databases

If the production Postgres was created against an older version of the entities
(symptoms: `column u.lat does not exist`, `column Meet.activityId does not exist`,
`relation \"activity_templates\" does not exist`), apply the idempotent patch
**before** restarting the backend:

```bash
cd /opt/fitmeet-app          # or wherever your repo lives
chmod +x backend/scripts/apply-production-schema-patch.sh
bash backend/scripts/apply-production-schema-patch.sh
```

What the script does:

1. Reads `DB_USERNAME` / `DB_DATABASE` from `.env.production`.
2. Runs `pg_dump` inside `fitness-postgres` and writes a gzipped backup to
   `/opt/fitmeet-db-backup/<db>-pre-patch-<timestamp>.sql.gz`.
3. Pipes `backend/scripts/production-schema-patch-20260511.sql` into `psql`
   with `ON_ERROR_STOP=1`, then applies the idempotent follow-up patches:
   `agent-social-runtime-schema-patch-20260511.sql`,
   `agent-schema-drift-fix-20260513.sql`, and
   `fix-agent-log-fields-20260514.sql`. The SQL uses only
   `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` /
   `CREATE INDEX IF NOT EXISTS` and is safe to re-run.
4. Verifies that all required tables and columns now exist; exits non-zero and
   leaves the backup behind if anything is missing.

After it succeeds, restart only the backend so the new entities can read/write
the upgraded schema:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build backend
```

### 10.1 Round-3 Delta Patch (Agent Gateway runtime + AI social loop)

The base patch above brings a pre-existing DB up to round 2. Round 3 adds a
handful of columns / enum values on top of that (see file header for the
exact list). Apply it **after** §10 and **after** taking a fresh pg_dump:

```bash
# 1) Backup (idempotent — re-running creates a new dump)
mkdir -p /opt/fitmeet-db-backup
docker compose --env-file .env.production -f docker-compose.prod.yml \
  exec -T postgres \
  pg_dump -U "$DB_USERNAME" -d "$DB_DATABASE" \
  | gzip > /opt/fitmeet-db-backup/$(date +%Y%m%d-%H%M%S)-pre-round3.sql.gz

# 2) Apply round-3 delta (safe to re-run; uses IF NOT EXISTS / pg_enum guards)
docker compose --env-file .env.production -f docker-compose.prod.yml \
  exec -T postgres \
  psql -U "$DB_USERNAME" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 \
  < backend/scripts/agent-social-runtime-schema-patch-20260511.sql

# 3) Restart backend
docker compose --env-file .env.production -f docker-compose.prod.yml \
  up -d --build backend
```

The patch only touches:
- `agent_settings_mode_enum` (+`assisted`, +`normal`)
- `social_requests_status_enum` (+`active`, +`inactive`, +`completed`)
- `public_social_intents` (new nullable columns + 2 indexes)
- `agent_approval_requests` (new columns with safe defaults)

### 10.2 Schema Drift Fix (Agent Action Logs + Pending Activity Link)

If production shows `relation "agent_action_logs" does not exist` or
`column "relatedActivityId" does not exist`, apply the drift fix after the
base and round-3 patches:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml \
  exec -T postgres \
  psql -U "$DB_USERNAME" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 \
  < backend/scripts/agent-schema-drift-fix-20260513.sql
```

The SQL is idempotent and verifies both `agent_action_logs` and
`agent_approval_requests.relatedActivityId` before committing.

It contains no `DROP` / `DELETE` / `TRUNCATE` and runs inside a single
transaction, so a failure rolls back cleanly. Round-3 task 6 (Agent Gateway
pause / resume) does **not** introduce any new schema — it reuses the
existing `agent_connections.status` enum.

### 10.3 Agent Log Field Fix (OpenClaw Inbox / Webhook Logs)

If production shows either of these errors:

- `column "eventType" of relation "agent_action_logs" does not exist`
- `column "ownerUserId" of relation "agent_activity_logs" does not exist`

apply the agent log field fix after the base, round-3, and drift-fix patches.
The recommended path is the unified script:

```bash
cd /opt/fitmeet-app          # or wherever your repo lives
bash backend/scripts/apply-production-schema-patch.sh
```

The unified script includes:

1. `production-schema-patch-20260511.sql`
2. `agent-social-runtime-schema-patch-20260511.sql`
3. `agent-schema-drift-fix-20260513.sql`
4. `fix-agent-log-fields-20260514.sql`

For an emergency one-off fix, run only this SQL after taking a database backup:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml \
  exec -T postgres \
  psql -U "$DB_USERNAME" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 \
  < backend/scripts/fix-agent-log-fields-20260514.sql
```

This patch only adds missing log columns and indexes on
`agent_action_logs` / `agent_activity_logs`. It does not reference
`agent_profiles`, and it contains no `DROP` / `DELETE` / `TRUNCATE`.
After it succeeds, restart the backend:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml \
  up -d --build backend
```

## 11. Post-Deploy Smoke Test

```bash
# 1. Login
curl -X POST https://www.ourfitmeet.cn/api/auth/login \
     -H 'Content-Type: application/json' \
     -d '{"phone":"<test>","password":"<test>"}'

# 2. AI social request endpoint
curl -H "Authorization: Bearer <token>" \
     https://www.ourfitmeet.cn/api/social-request/ai

# 3. Create a social request, run match, send invite, create activity
curl -X POST https://www.ourfitmeet.cn/api/social-request \
     -H "Authorization: Bearer <token>" -H 'Content-Type: application/json' \
     -d '{"type":"running_partner","city":"Shanghai","title":"\u6668\u8dd1"}'
```
