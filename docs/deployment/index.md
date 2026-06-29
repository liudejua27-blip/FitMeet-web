# Deployment Index

Last updated: 2026-06-29

Use this page to choose the correct deployment runbook. Do not maintain parallel
deployment instructions outside `docs/deployment/`.

## Canonical Topologies

- Cloud path: [cloud-vercel-railway.md](cloud-vercel-railway.md)
  - Vercel serves `frontend/dist`.
  - Railway hosts the NestJS backend.
  - `/api/*` is proxied from the frontend domain to the backend origin.
- ECS fallback: [ecs-fallback.md](ecs-fallback.md)
  - Nginx serves `frontend/dist`.
  - Nginx proxies `/api/*` and realtime traffic to backend containers.
  - PostgreSQL, MongoDB, Redis, backend, worker, and Nginx run through Docker
    Compose on Aliyun ECS.

## Shared Release Rules

- `DB_SYNCHRONIZE=false` in production.
- Run migrations explicitly before starting new backend/worker code.
- Do not put database, JWT, DeepSeek, object-storage, SMS, or WeChat secrets in
  frontend/Vercel `VITE_*` variables.
- Verify `/api/health`, `/api/ready`, and `/api/openapi/fitmeet-core.json` after
  deploy.
- Publishing from Agent must return `publicIntentId` and `discoverHref`; the
  same card must be visible in Discover and at `/public-intent/:id`.

## Related Docs

- [routing.md](routing.md)
- [cutover-checklist.md](cutover-checklist.md)
- [secrets-checklist.md](secrets-checklist.md)
- [staging-validation-runbook.md](staging-validation-runbook.md)
