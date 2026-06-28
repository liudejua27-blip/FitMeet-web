# Agent Worker Process Roles

FitMeet keeps API traffic and background work separated through
`FITMEET_PROCESS_ROLE`.

## Roles

- `api`: HTTP/API process. Schedulers are disabled by default.
- `worker`: legacy compatibility worker. Runs every enabled background worker.
- `all`: local/dev compatibility mode. Runs API-compatible background jobs and all
  role-specific workers.
- `worker-matching`: matching jobs and publish/Discover reconciliation.
- `worker-outbox`: domain outbox events, including conversation provisioning.
- `worker-reminder`: FitMeet Agent reminder and inbox suggestions.
- `worker-agent-eval`: reserved for offline Agent eval/replay jobs.

## Scheduler Contract

`ENABLE_SCHEDULER=false` disables all background cron execution, even for worker
roles.

New worker-specific cron code must use `shouldRunWorkerRole(role)` instead of
`shouldRunBackgroundJobs()`. The older helper is only for legacy broad worker
jobs that intentionally run under `worker` or `all`.

## Deployment Notes

The current ECS production stack still uses the legacy `subagent-worker` service
with `FITMEET_PROCESS_ROLE=worker`. That remains supported.

When splitting workers, run separate containers from the backend image with one
of these role values:

```bash
FITMEET_PROCESS_ROLE=worker-matching ENABLE_SCHEDULER=true node dist/main.js
FITMEET_PROCESS_ROLE=worker-outbox ENABLE_SCHEDULER=true node dist/main.js
FITMEET_PROCESS_ROLE=worker-reminder ENABLE_SCHEDULER=true node dist/main.js
```

Keep `backend` on:

```bash
FITMEET_PROCESS_ROLE=api ENABLE_SCHEDULER=false
```

Do not run multiple broad `worker` containers in production unless duplicate
worker categories are intentional and the underlying job uses database leases or
`SKIP LOCKED`.
