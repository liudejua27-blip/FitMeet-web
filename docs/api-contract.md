# FitMeet Core API Contract

Last updated: 2026-06-07

This document is a human-readable index for the shared Web/iOS launch API. The
authoritative machine contract remains:

- Source: `backend/src/openapi/fitmeet-core.openapi.ts`
- Runtime JSON: `GET /api/openapi/fitmeet-core.json`
- Web endpoint registry: `frontend/src/api/fitmeetCoreContract.ts`
- iOS endpoint registry:
  `/Users/liuchongjiang/Documents/FitMeet app/FitMeetAlpha/Networking/FitMeetCoreEndpoint.swift`

Do not add a Web or iOS launch endpoint without updating the OpenAPI source,
the relevant client registry, and contract tests.

## Base URL

- Local backend: `http://localhost:3000/api`
- Production default: `https://www.ourfitmeet.cn/api`
- Web reads `VITE_API_BASE_URL`.
- iOS reads `FITMEET_API_BASE_URL` from build settings/Info.plist and allows
  debug-only overrides.

## Auth

Protected endpoints use:

```http
Authorization: Bearer <access_token>
```

Core auth/profile endpoints:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/sms/send`
- `POST /auth/sms/verify`
- `GET /auth/wechat/url`
- `POST /auth/wechat/login`
- `POST /auth/refresh`
- `GET /auth/profile`
- `PUT /users/profile`

## Response Shape

Successful responses return stable JSON objects or arrays documented in
OpenAPI. Paginated list endpoints should prefer:

```json
{
  "data": [],
  "metadata": {
    "total": 0,
    "page": 1,
    "lastPage": 1
  }
}
```

Errors use the shared error envelope:

```json
{
  "statusCode": 400,
  "timestamp": "2026-06-07T00:00:00.000Z",
  "path": "/api/feed",
  "code": "VALIDATION_ERROR",
  "message": "Invalid input",
  "details": {},
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "retryable": false
  }
}
```

Clients must not parse stack traces or raw database/provider errors.

## Core Launch Endpoint Groups

System:

- `GET /health`
- `GET /ready`
- `GET /openapi/fitmeet-core.json`

Feed:

- `GET /feed`
- `POST /feed`
- `GET /feed/interactions`
- `POST /feed/{id}/like`
- `POST /feed/{id}/save`
- `GET /feed/{postId}/comments`
- `POST /feed/{postId}/comments`
- `POST /feed/comments/{commentId}/like`

Messages:

- `POST /messages/start`
- `GET /messages/conversations`
- `GET /messages/conversations/{conversationId}`
- `POST /messages/conversations/{conversationId}/send`
- `POST /messages/public-intents/{id}/start`
- `GET /messages/unread`

Agent inbox:

- `GET /agents/inbox/conversations`
- `GET /agents/inbox/conversations/{conversationId}/messages`
- `POST /agents/inbox/conversations/{conversationId}/reply`

Social Agent chat and workspace:

- `POST /social-agent/chat/run`
- `POST /social-agent/chat/run-async`
- `POST /social-agent/chat/messages`
- `POST /social-agent/chat/route-message`
- `POST /social-agent/chat/stream`
- `POST /social-agent/chat/stream-user`
- `GET /social-agent/chat/session`
- `GET /social-agent/chat/tasks/{taskId}/session`
- `GET /social-agent/chat/tasks/{taskId}/runs/{runId}`
- `POST /social-agent/chat/tasks/{taskId}/messages`
- `POST /social-agent/chat/tasks/{taskId}/publish-social-request`
- `POST /social-agent/chat/tasks/{taskId}/replan-run`
- `POST /social-agent/chat/tasks/{taskId}/append-context`
- `POST /social-agent/chat/tasks/{taskId}/actions`
- `POST /social-agent/chat/tasks/{taskId}/save-candidate`
- `POST /social-agent/chat/tasks/{taskId}/send-message`
- `POST /social-agent/chat/tasks/{taskId}/connect-candidate`
- `GET /social-agent/tasks/current`
- `GET /social-agent/tasks/{taskId}/timeline`
- `GET /social-agent/tasks/{taskId}/events`
- `POST /social-agent/tasks/{taskId}/replan`

Uploads:

- `POST /uploads/image`
- `POST /uploads/video`

## Verification

Core contract drift is guarded by:

```bash
pnpm --dir backend test -- app.controller.spec.ts
pnpm --dir frontend test -- fitmeetCoreContract.test.ts
```

Deployment smoke should include:

```bash
scripts/verify-production.sh --base-url https://www.ourfitmeet.cn
```

Real account write/read-back smoke requires explicit credentials:

```bash
scripts/verify-production.sh --base-url https://www.ourfitmeet.cn --run-app-smoke
```
