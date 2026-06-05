# FitMeet Frontend

Vite + React frontend for the FitMeet public website and web app shell. It includes the public platform site, Agent workspace, real social feed, matching surfaces, messages, profile, admin pages, and geo/sports landing pages.

## Prerequisites

- Node.js 22+
- pnpm 10+
- FitMeet backend running at `http://localhost:3000/api`

## Setup

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Important environment variables:

```env
VITE_API_BASE_URL=http://localhost:3000/api
VITE_WS_BASE_URL=http://localhost:3000
VITE_MAP_API_KEY=
VITE_AMAP_SECURITY_JS_CODE=
VITE_SENTRY_DSN=
```

Only expose public browser-safe variables with the `VITE_` prefix. Do not place backend secrets, database URLs, JWT secrets, object-storage secrets, or AI provider keys in frontend env files.

## Run

```bash
pnpm dev
```

The local dev server usually runs at `http://localhost:5173`.

Preview the production build:

```bash
pnpm build
pnpm preview --host 127.0.0.1 --port 5175
```

## Verification

```bash
pnpm lint
pnpm build
pnpm test
```

Useful focused tests:

```bash
pnpm test -- src/test/routeBoundaries.test.ts
pnpm test -- src/test/Layout.test.tsx
pnpm test -- src/test/AgentWorkspacePage.test.tsx
```

## Structure

- `src/App.tsx` owns the app shell: browser router, session restore, realtime provider, layout, motion, and login modal.
- `src/routes/AppRoutes.tsx` owns lazy route registration.
- `src/routes/routeBoundaries.ts` classifies public website, Agent workspace, Agent onboarding, and social feed route families.
- `src/api/baseClient.ts` owns request plumbing, auth token handling, and `ApiError`.
- `src/api/authClient.ts` owns auth/profile calls.
- `src/api/feedClient.ts` owns real social feed calls.
- `src/api/socialAgentApi.ts` owns Social Agent chat/task calls.
- `src/api/uploadApi.ts` owns image/video uploads.
- `src/api/client.ts` is now a compatibility layer for older meet, club, message, and safety APIs.

## API Contract

Endpoint constants for core Web/App surfaces live in `src/api/fitmeetCoreContract.ts`. They should stay aligned with backend OpenAPI at:

```text
GET /api/openapi/fitmeet-core.json
```

When adding a new App-facing endpoint, update the backend OpenAPI contract first, then the typed frontend API layer, then tests.

## Styling Boundaries

Keep public marketing pages, Agent workspace, and web-app feed styles separated. Avoid adding new cross-page selectors to `src/global.css`; prefer domain CSS files or component-scoped class names that stay inside one route family.

This project does not currently use shadcn/ui components. If shadcn is introduced later, run the CLI with pnpm and follow the project alias/component registry instead of hand-copying component code.
