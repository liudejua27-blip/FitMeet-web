# Deployment routing notes

## Local development

Run the whole local stack with:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1
```

This starts Docker Desktop when needed, waits for the Docker daemon, starts the
local compose services, then launches the Nest backend and Vite frontend.

Expected local URLs:

- Backend health: `http://localhost:3000/api/health`
- Feed API: `http://localhost:3000/api/feed`
- Frontend: `http://localhost:5173`

## Why `/api/feed` can return `no_matching_function_for_path`

The Nest backend registers `/api/feed`. If the response body says
`no_matching_function_for_path /api/feed`, the request is reaching a static
hosting or cloud-function router instead of the Nest backend.

There are two valid production layouts:

1. Point `ourfitmeet.cn` to the VPS running `nginx/nginx.conf`. In this layout,
   Nginx serves `frontend/dist` and proxies `/api/` to the `backend` container.
2. Keep the frontend on EdgeOne Pages and proxy `/api/*` to a separate backend
   origin. In this layout, configure an EdgeOne Pages environment variable:

```text
BACKEND_ORIGIN=https://your-backend-origin.example
```

The file `edge-functions/api/[[default]].js` exists for layout 2. It forwards
all `/api/*` requests from EdgeOne Pages to the configured backend origin.

Do not set `BACKEND_ORIGIN` to the same EdgeOne Pages hostname, or requests will
loop back into the Pages function layer.

## Docker Hub timeout workaround

If Docker Desktop is running but production image builds fail while fetching
`https://auth.docker.io/token`, use a reachable Node base image mirror:

```powershell
$env:NODE_IMAGE = "docker.m.daocloud.io/library/node:20-alpine"
docker compose --env-file .env.production -f docker-compose.prod.yml build backend
```

The default remains `node:20-alpine`; `NODE_IMAGE` only changes the build-time
base image for the backend Dockerfile.
