# FitMeet Agent Aliyun Staging Integration Checklist

Last updated: 2026-06-09

This checklist starts after local `/agent` real-adapter smoke has passed. It is
for validating the real Social Agent API on an Aliyun staging environment before
production cutover.

## Target Topology

- Staging Web origin: `https://staging.socialworld.world`
- Staging API origin: `https://staging-api.socialworld.world/api`
- Backend runs the NestJS API behind Nginx or an Aliyun reverse proxy.
- PostgreSQL, MongoDB, Redis, and object storage must be staging resources, not
  local development services.
- `/agent` must run with `VITE_AGENT_ADAPTER=real`.

If staging uses the ECS same-origin topology instead, use:

```text
VITE_API_BASE_URL=https://staging.socialworld.world/api
```

and keep the same smoke steps.

## Backend Staging Environment

Set these values on the staging backend host. Do not commit real values.

```bash
NODE_ENV=production
PORT=3000
BASE_URL=https://staging-api.socialworld.world
FRONTEND_BASE_URL=https://staging.socialworld.world
ALLOWED_ORIGINS=https://staging.socialworld.world
CORS_ORIGIN=https://staging.socialworld.world

DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<db>?sslmode=require
MONGO_URI=mongodb://<user>:<password>@<host>:27017/fitness_app?authSource=admin
REDIS_URL=redis://:<password>@<host>:6379

JWT_SECRET=<long-random-staging-secret>
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

DEEPSEEK_API_KEY=<staging-key>
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_CHAT_MODEL=deepseek-v4-pro
DEEPSEEK_FAST_MODEL=deepseek-v4-flash
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_TIMEOUT_MS=12000
SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS=12000
AGENT_OBSERVABILITY_ALERT_WEBHOOK_URL=<staging-alert-webhook>
AGENT_OBSERVABILITY_ALERT_WEBHOOK_TOKEN=<staging-alert-token>
AGENT_OBSERVABILITY_ALERT_COOLDOWN_MS=300000
```

Required optional services for broader release smoke:

```bash
OSS_REGION=<aliyun-region>
OSS_BUCKET=<staging-bucket>
OSS_ACCESS_KEY_ID=<staging-access-key>
OSS_ACCESS_KEY_SECRET=<staging-secret>
OSS_PUBLIC_BASE_URL=https://<staging-media-domain>
```

## Frontend Staging Environment

Build the staging frontend with:

```bash
VITE_AGENT_ADAPTER=real
VITE_API_BASE_URL=https://staging-api.socialworld.world/api
```

If Web and API are same-origin on ECS:

```bash
VITE_AGENT_ADAPTER=real
VITE_API_BASE_URL=/api
```

## Backend Deploy Checklist

1. Upload the release bundle or deploy image to the Aliyun staging ECS host.
2. Create or update `.env.production` with the staging-only values above.
3. Run production env validation:

   ```bash
   pnpm -C backend run check:prod-env -- ../.env.production
   ```

4. Start or restart services:

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
   docker compose -f docker-compose.prod.yml --env-file .env.production ps
   ```

5. Run migrations:

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production exec backend pnpm migration:run:prod
   docker compose -f docker-compose.prod.yml --env-file .env.production exec backend pnpm migration:status
   ```

6. Verify health and readiness:

   ```bash
   curl -fsS https://staging-api.socialworld.world/api/health
   curl -fsS https://staging-api.socialworld.world/api/ready
   curl -fsS https://staging-api.socialworld.world/api/openapi/fitmeet-core.json
   ```

7. Prepare dedicated staging smoke users and candidate data:

   ```bash
   APP_SMOKE_SEED_PASSWORD='<long-random-password>' \
   APP_SMOKE_SEED_ALLOW_PRODUCTION=true \
   pnpm -C backend run seed:app-smoke-users
   ```

8. Store the printed smoke credentials only in a local secure note or shell
   session. Do not commit them.

## Nginx / Reverse Proxy SSE Requirements

The staging proxy must not buffer Social Agent SSE responses. The repository
Nginx config now includes a dedicated location for:

```text
/api/social-agent/chat/stream
/api/social-agent/chat/stream-user
```

Required proxy behavior:

```nginx
proxy_http_version 1.1;
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 300s;
proxy_set_header Connection "";
add_header X-Accel-Buffering no;
```

Smoke the stream with curl. You should see events arrive incrementally, not as
one response at the end:

```bash
TOKEN='<staging-jwt>'
curl -N \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -X POST https://staging-api.socialworld.world/api/social-agent/chat/stream-user \
  --data '{"message":"今晚想找人一起喝咖啡，不想太尴尬","idempotencyKey":"staging-smoke-agent-run-001"}'
```

Expected lifecycle sequence should include most of:

```text
received
analyzing_intent
searching_candidates or ranking_matches
checking_safety or waiting_confirmation
completed
```

## `/agent` Browser Smoke

Run this in the staging Web build:

1. Open `https://staging.socialworld.world/agent`.
2. Login with the dedicated smoke user.
3. Confirm Network tab uses:
   `POST /api/social-agent/chat/stream-user`.
4. Submit:

   ```text
   今晚想找人一起喝咖啡，不想太尴尬
   ```

5. Confirm AntGuide lifecycle:
   - `analyzing_intent` -> thinking
   - `searching_candidates` / `ranking_matches` -> discovering
   - candidate card result -> recommending
   - `checking_safety` -> reminding, when safety applies
   - `waiting_confirmation` -> confirming
   - action success -> success
6. Confirm candidate cards render and do not expose `traceId`, stack traces, raw
   tool calls, or model internals.
7. Click "生成开场白".
8. Click "发送邀请" or a confirmation action.
9. Confirm request uses:
   `POST /api/social-agent/chat/tasks/:taskId/actions`.
10. Confirm request body contains a non-empty `idempotencyKey`.
11. Confirm repeat-clicking the same action does not create duplicated side
    effects.
12. Refresh the page.
13. Confirm session restore calls:
    `GET /api/social-agent/chat/session`.
14. Confirm restored task id is reused on the next message.

## API-Level Smoke Commands

Login:

```bash
API=https://staging-api.socialworld.world/api
EMAIL='<smoke-email>'
PASSWORD='<smoke-password>'

TOKEN="$(
  curl -fsS "${API}/auth/login" \
    -H 'Content-Type: application/json' \
    --data "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}" \
    | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s);console.log(j.accessToken||j.data?.accessToken||j.token||'')})"
)"
test -n "${TOKEN}"
```

Run stream:

```bash
curl -N \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -X POST "${API}/social-agent/chat/stream-user" \
  --data '{"message":"今晚想找人一起喝咖啡，不想太尴尬","idempotencyKey":"staging-smoke-agent-run-001"}'
```

Restore session:

```bash
curl -fsS \
  -H "Authorization: Bearer ${TOKEN}" \
  "${API}/social-agent/chat/session"
```

Perform action after collecting `taskId` and an actionable card/action id from
the stream or restored session:

```bash
TASK_ID='<task-id>'
curl -fsS \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json' \
  -X POST "${API}/social-agent/chat/tasks/${TASK_ID}/actions" \
  --data '{"action":"generate_opener","cardId":"<card-id>","idempotencyKey":"staging-smoke-action-001"}'
```

Repeat the same command with the same `idempotencyKey`; it must be safe and must
not duplicate writes.

## Logs And TraceId Checks

During smoke, tail backend logs:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f backend
```

Check:

- each run has a server-side trace id or structured run/task id in logs;
- user-facing responses do not include `traceId`, stack traces, raw planner JSON,
  or raw tool call payloads;
- failed upstream/model calls are logged with sanitized messages;
- request logs do not print JWTs, passwords, or private profile fields;
- action retries with the same `idempotencyKey` are visible as deduped or safe.

## Staging Result Template

Fill this after running against the real staging domain.

| Check | Result | Evidence |
| --- | --- | --- |
| Backend deployed | Not run in this environment | Need Aliyun host access |
| `DATABASE_URL` configured | Not verified | Check `.env.production` on ECS |
| `DEEPSEEK_API_KEY` configured | Not verified | Check backend env, no logging secret |
| JWT/Auth configured | Not verified | Login smoke required |
| CORS allows only staging Web | Not verified | Browser + rejected-origin curl |
| `/api/health` | Not verified | `curl -fsS .../api/health` |
| `/api/ready` | Not verified | `curl -fsS .../api/ready` |
| Frontend real adapter | Not verified | Built with `VITE_AGENT_ADAPTER=real` |
| `/agent` full path | Not verified | Browser smoke |
| SSE through proxy | Config prepared | Needs staging `curl -N` evidence |
| Session restore | Not verified | Refresh `/agent`; inspect `GET /session` |
| Action idempotency | Not verified | Repeat same action key |
| Logs and traceId | Not verified | Tail backend logs |

## Current Local Repository Status

- Backend `/api/health` and `/api/ready` endpoints exist.
- Frontend real adapter expects `VITE_AGENT_ADAPTER=real`.
- Social Agent endpoints required for run, action, and restore exist in the
  OpenAPI contract and runtime routes.
- Nginx has a dedicated no-buffering proxy location for Social Agent SSE.
- This document does not claim the Aliyun staging smoke has passed; it must be
  executed after the staging host, domain, TLS, env, migrations, and smoke users
  are ready.
