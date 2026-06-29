# Deployment Routing Notes

当前部署只需要保护两个边界：

1. 前端静态站点负责保留页面路由。
2. 后端 Nest 服务负责 `/api/*`。

旧产品入口已经不属于当前产品面，部署只需要覆盖当前保留路由。

## Local Development

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1
```

或者手动启动：

```bash
docker compose up -d postgres mongo redis
pnpm --dir backend start:dev
pnpm --dir frontend dev
```

Expected local URLs:

- Backend health: `http://localhost:3000/api/health`
- Backend readiness: `http://localhost:3000/api/ready`
- Core OpenAPI: `http://localhost:3000/api/openapi/fitmeet-core.json`
- Frontend: `http://localhost:5173`
- Discover: `http://localhost:5173/discover`
- Agent: `http://localhost:5173/agent`

## Production Layout

There are two valid layouts:

1. One VPS/container host serves `frontend/dist` and proxies `/api/` to the
   backend container.
2. A static frontend platform serves `frontend/dist`, and `/api/*` is proxied to
   a separate backend origin.

For layout 2, configure:

```text
BACKEND_ORIGIN=https://your-backend-origin.example
```

The file `edge-functions/api/[[default]].js` forwards `/api/*` requests to that
backend origin. Do not point `BACKEND_ORIGIN` back to the same static frontend
host, or requests will loop.

## Route Smoke

After deploy, verify:

```bash
curl -fsS https://your-site.example/api/health
curl -fsS https://your-site.example/api/ready
curl -fsS https://your-site.example/api/openapi/fitmeet-core.json
```

Then check these browser routes:

- `/`
- `/discover`
- `/agent`
- `/messages`
- `/public-intent/public_agent_api_smoke_qingdao_walk`

Publishing a card from Agent must return `discoverHref` and `publicIntentId`;
that card must be visible on `/discover` and openable at `/public-intent/:id`.

## Docker Hub Timeout Workaround

If Docker Desktop is running but production image builds fail while fetching
`https://auth.docker.io/token`, use a reachable Node base image mirror:

```powershell
$env:NODE_IMAGE = "docker.m.daocloud.io/library/node:20-alpine"
docker compose --env-file .env.production -f docker-compose.prod.yml build backend
```

The default remains `node:20-alpine`; `NODE_IMAGE` only changes the build-time
base image for the backend Dockerfile.
