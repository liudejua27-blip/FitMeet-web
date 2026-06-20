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
- `/agent` production builds default to the real adapter through `PROD` /
  `MODE=production`; `VITE_AGENT_ADAPTER=real` remains an optional explicit
  override, and `VITE_AGENT_ADAPTER=mock` is only for intentional local QA or
  unit tests.

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
DEEPSEEK_MODEL=deepseek-v4-pro
DEEPSEEK_TIMEOUT_MS=30000
SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS=30000
SOCIAL_AGENT_DEEPSEEK_FIRST_CHUNK_TIMEOUT_MS=20000
SOCIAL_AGENT_CHAT_LLM_TIMEOUT_MS=30000
SOCIAL_AGENT_CHAT_FIRST_CHUNK_TIMEOUT_MS=20000
SOCIAL_AGENT_FINAL_RESPONSE_TIMEOUT_MS=30000
SOCIAL_AGENT_FINAL_RESPONSE_FIRST_CHUNK_TIMEOUT_MS=20000
SOCIAL_AGENT_DEEPSEEK_THINKING=disabled
AGENT_OBSERVABILITY_ALERT_WEBHOOK_URL=<staging-alert-webhook>
AGENT_OBSERVABILITY_ALERT_WEBHOOK_TOKEN=<staging-alert-token>
AGENT_OBSERVABILITY_ALERT_COOLDOWN_MS=300000

FITMEET_SUBAGENT_WORKER_MODE=db_queue
FITMEET_SUBAGENT_WORKER_CONCURRENCY=2
FITMEET_SUBAGENT_WORKER_POLL_MS=1000
FITMEET_SUBAGENT_WORKER_TIMEOUT_MS=30000
FITMEET_SUBAGENT_WORKER_QUEUE=fitmeet.subagent.life-graph-agent,fitmeet.subagent.social-match-agent,fitmeet.subagent.meet-loop-agent,fitmeet.subagent.math-agent
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
VITE_API_BASE_URL=https://staging-api.socialworld.world/api
```

If Web and API are same-origin on ECS:

```bash
VITE_API_BASE_URL=/api
```

Optional explicit adapter override:

```bash
VITE_AGENT_ADAPTER=real
```

Do not set `VITE_AGENT_ADAPTER=mock` for staging or production. Mock mode is
only for local QA/test runs where the backend Social Agent API is intentionally
absent.

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

7. Verify the independent subagent worker process is running. Docker Compose now
   includes a dedicated `subagent-worker` service:

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production ps subagent-worker
   docker compose -f docker-compose.prod.yml --env-file .env.production logs -f subagent-worker
   ```

   The worker must keep writing heartbeat rows for all four queues:

   ```text
   fitmeet.subagent.life-graph-agent
   fitmeet.subagent.social-match-agent
   fitmeet.subagent.meet-loop-agent
   fitmeet.subagent.math-agent
   ```

   If staging is deployed on Railway, create a second service from the same
   backend image and set its start command to:

   ```bash
   node dist/agent-gateway/subagent-worker.cli.js
   ```

   If staging uses PM2 on ECS:

   ```bash
   pm2 start dist/main.js --name fitmeet-api
   FITMEET_SUBAGENT_WORKER_MODE=db_queue \
   FITMEET_SUBAGENT_WORKER_CONCURRENCY=2 \
   pm2 start dist/agent-gateway/subagent-worker.cli.js --name fitmeet-subagent-worker -i 1
   pm2 save
   ```

   If staging uses systemd, create a separate unit for the worker process rather
   than running it inside the API service:

   ```ini
   [Unit]
   Description=FitMeet Subagent Worker
   After=network.target

   [Service]
   WorkingDirectory=/opt/fitmeet/backend
   EnvironmentFile=/opt/fitmeet/.env.production
   Environment=FITMEET_SUBAGENT_WORKER_MODE=db_queue
   ExecStart=/usr/bin/node dist/agent-gateway/subagent-worker.cli.js
   Restart=always
   RestartSec=5

   [Install]
   WantedBy=multi-user.target
   ```

8. Prepare dedicated staging smoke users and candidate data:

   ```bash
   APP_SMOKE_SEED_PASSWORD='<long-random-password>' \
   APP_SMOKE_SEED_ALLOW_PRODUCTION=true \
   pnpm -C backend run seed:app-smoke-users
   ```

9. Store the printed smoke credentials only in a local secure note or shell
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

5. Confirm assistant-ui visible process behavior:
   - The first response appears as a lightweight status such as `正在理解你的需求…`, not an empty waiting placeholder.
   - `SocialAgentEventV2` / replay summary renders as one cover-style status by default.
   - Detailed process evidence is collapsed until opened.
   - No old AntGuide, Codex pet, workspace shell, or page-level task panel appears in `/agent`.
6. Confirm candidate cards render as assistant-ui message parts and do not expose `traceId`, stack traces, raw
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

## Agent Launch Gate Smoke

After migrations, smoke users, RBAC bootstrap, and the independent worker are
ready, run the release gate script from a trusted terminal:

```bash
FITMEET_API_BASE_URL=https://staging-api.socialworld.world/api \
ADMIN_JWT='<staging-admin-jwt>' \
USER_JWT='<staging-user-jwt>' \
RUN_SELF_IMPROVE_SANDBOX=true \
pnpm -C backend run smoke:agent-launch-gates
```

This script verifies:

- L5 dashboard and worker job APIs are reachable through RBAC.
- Independent subagent worker heartbeat is fresh.
- production alert sink is either explicitly disabled for first launch or configured with a real webhook.
- high-risk tool endpoints return approval signals instead of executing.
- self-improve runner and canary effect APIs are reachable when
  `RUN_SELF_IMPROVE_SANDBOX=true`.

Use these environment overrides only for controlled partial checks:

```bash
REQUIRE_SUBAGENT_WORKER=false
ALLOW_LOG_ONLY_ALERTS=true
RUN_SELF_IMPROVE_SANDBOX=false
```

Do not use these overrides for production go/no-go, except
`ALLOW_LOG_ONLY_ALERTS=true` is unnecessary when
`AGENT_OBSERVABILITY_ALERTS_ENABLED=false` is the intentional first-launch
configuration.

## DeepSeek Latency Gate

普通聊天、最终回答、planner 和 subagent worker 默认必须走 release-quality
`deepseek-v4-pro` 路径；`deepseek-v4-flash` 只保留给明确标记的 fast /
非推理通道。只有确实需要复杂推理时，才通过这些 env 对单个 use case
打开 thinking：

```bash
SOCIAL_AGENT_FINAL_RESPONSE_THINKING=enabled
SOCIAL_AGENT_PLANNER_THINKING=enabled
```

上线前至少跑下面几个延迟桶，并把结果贴到发布记录：

| Bucket                                | Required evidence                                     |
| ------------------------------------- | ----------------------------------------------------- |
| short prompt / non-thinking / no tool | P50, P95, `first_sse_chunk`, `first_content_delta`    |
| long prompt / cache miss              | `prompt_cache_hit_tokens`, `prompt_cache_miss_tokens` |
| long prompt / cache hit               | cache hit ratio and P95 delta from miss bucket        |
| thinking enabled sample               | `first_reasoning_delta` vs `first_content_delta`      |
| agent one-tool                        | tool latency + final response `first_content_delta`   |

后端 now records:

- `httpHeadersLatencyMs`
- `firstSseChunkLatencyMs`
- `firstReasoningDeltaLatencyMs`
- `firstContentDeltaLatencyMs`
- `promptTokens`
- `promptCacheHitTokens`
- `promptCacheMissTokens`
- `completionTokens`
- `reasoningTokens`
- `systemFingerprint`

如果 P95 慢样本的 cache hit ratio 很低，先调整固定 prompt / tool schema / RAG 前缀顺序，再考虑升级模型或增加超时。

## High-Risk Action Acceptance

Before enabling complex Agent functions, manually verify each action with a real
staging user:

| Action                          | Required result                                                         |
| ------------------------------- | ----------------------------------------------------------------------- |
| Send message                    | Creates approval request; no message sent before approval               |
| Connect candidate / add friend  | Creates approval request; no relationship write before approval         |
| Create activity / invite / join | Creates approval request; repeated idempotency key is safe              |
| Publish social request          | Creates approval request; draft can be saved without public publish     |
| Share precise location          | Creates approval request and logs sensitive-field access                |
| Privacy profile update          | Creates approval request and writes audit log                           |
| Payment                         | Creates approval request; no payment intent is executed before approval |

For each row, capture evidence for approval log, user rejection, natural
assistant reply after rejection, retry behavior, and rollback/compensation path.

## Self-Improve Sandbox Cycle

Run one complete sandbox cycle before production:

1. Capture at least 20 online replay samples from staging tasks.
2. Trigger failure clustering and patch draft generation through:
   `POST /social-agent/self-improve/runner/run-once`.
3. Confirm low/medium-risk patches bind eval cases automatically.
4. Confirm high-risk patches stop at human review.
5. Run eval runner and canary reconciliation.
6. Confirm canary metrics either promote or rollback by threshold.
7. Store the dashboard screenshot and patch audit trail as release evidence.

## Security And Privacy Gate

Life Graph launch requires:

- Sensitive-field masking tests for phone, location, private messages, and
  contact identifiers.
- Export/delete security request flow with second confirmation and cooldown.
- RBAC roles for owner admin, agent admin, and support readonly.
- Admin audit logs for denied access and sensitive-field reads.
- Data retention policy configured and visible in the privacy policy page.
- Backend logs sampled to confirm no JWTs, phone numbers, precise locations, or
  private messages are printed.

## Alerting Gate

The L5 dashboard is not enough for production. Configure webhook or incident
delivery for:

- LLM failure rate.
- tool failure rate.
- SSE interruption rate.
- DB slow query / migration failure.
- worker queue backlog and stale heartbeat.
- high-risk approval anomaly.

The production env readiness checker only requires
`AGENT_OBSERVABILITY_ALERT_WEBHOOK_URL` and
`AGENT_OBSERVABILITY_ALERT_WEBHOOK_TOKEN` when
`AGENT_OBSERVABILITY_ALERTS_ENABLED=true`. First launch may keep external alert
delivery disabled and rely on the L5 admin dashboard plus logs.

## Logs And TraceId Checks

During smoke, tail backend logs:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f backend
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f subagent-worker
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

| Check                         | Result                      | Evidence                                   |
| ----------------------------- | --------------------------- | ------------------------------------------ |
| Backend deployed              | Not run in this environment | Need Aliyun host access                    |
| `DATABASE_URL` configured     | Not verified                | Check `.env.production` on ECS             |
| `DEEPSEEK_API_KEY` configured | Not verified                | Check backend env, no logging secret       |
| JWT/Auth configured           | Not verified                | Login smoke required                       |
| CORS allows only staging Web  | Not verified                | Browser + rejected-origin curl             |
| `/api/health`                 | Not verified                | `curl -fsS .../api/health`                 |
| `/api/ready`                  | Not verified                | `curl -fsS .../api/ready`                  |
| Frontend real adapter         | Not verified                | Production build defaults to real; explicit `VITE_AGENT_ADAPTER=real` is still acceptable |
| `/agent` full path            | Not verified                | Browser smoke                              |
| SSE through proxy             | Config prepared             | Needs staging `curl -N` evidence           |
| Session restore               | Not verified                | Refresh `/agent`; inspect `GET /session`   |
| Action idempotency            | Not verified                | Repeat same action key                     |
| Independent subagent worker   | Not verified                | Worker heartbeat in L5 dashboard           |
| High-risk approval smoke      | Not verified                | `smoke:agent-launch-gates` with `USER_JWT` |
| Self-improve sandbox cycle    | Not verified                | Runner + eval + canary evidence            |
| Alert delivery                | Not verified                | Real alert webhook receives test alert     |
| Life Graph privacy gate       | Not verified                | Export/delete + log masking evidence       |
| Logs and traceId              | Not verified                | Tail backend logs                          |

## Current Local Repository Status

- Backend `/api/health` and `/api/ready` endpoints exist.
- Frontend production builds default to the real adapter via `PROD` / `MODE=production`; use `VITE_AGENT_ADAPTER=mock` only for intentional local QA.
- Social Agent endpoints required for run, action, and restore exist in the
  OpenAPI contract and runtime routes.
- Nginx has a dedicated no-buffering proxy location for Social Agent SSE.
- Production env readiness now requires a DB queue subagent worker and real
  observability alert sink.
- `docker-compose.prod.yml` includes a separate `subagent-worker` service.
- `pnpm -C backend run smoke:agent-launch-gates` is the staging go/no-go script
  for worker heartbeat, alert sink, high-risk approvals, and self-improve
  sandbox reachability.
- This document does not claim the Aliyun staging smoke has passed; it must be
  executed after the staging host, domain, TLS, env, migrations, and smoke users
  are ready.
