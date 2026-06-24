# FitMeet Core API Contract

Last updated: 2026-06-23

This document is a human-readable index for the cleaned FitMeet Web/Agent API.
The authoritative machine contract remains:

- Source: `backend/src/openapi/fitmeet-core.openapi.ts`
- Runtime JSON: `GET /api/openapi/fitmeet-core.json`
- Web endpoint registry: `frontend/src/api/fitmeetCoreContract.ts`

Do not add a Web launch endpoint without updating the OpenAPI source, the
relevant client registry, and contract tests.

## Base URL

- Local backend: `http://localhost:3000/api`
- Production default: `https://api.socialworld.world/api`
- Web reads `VITE_API_BASE_URL`.

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
- `GET /users/{id}`
- `PUT /users/profile`
- `PUT /users/me/location`
- `GET /users/me/social-profile`
- `GET /users/me/social-profile/questions`
- `POST /users/me/social-profile/ai-draft`
- `POST /users/me/social-profile/ai-save`
- `GET /users/me/social-profile/completion`
- `GET /users/me/social-profile/privacy`
- `GET /users/me/social-profile/sensitive-tags/pending`
- `POST /users/me/social-profile/sensitive-tags/confirm`
- `POST /users/me/social-profile/sensitive-tags/reject`

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
  "path": "/api/social-agent/chat/run",
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

## Core Endpoint Groups

System:

- `GET /health`
- `GET /ready`
- `GET /openapi/fitmeet-core.json`

Discover:

- `GET /public/social-intents`
- `GET /public/social-intents/{id}`
- `GET /public/social-intents/{id}/matches`

Messages:

- `POST /messages/start`
- `GET /messages/conversations`
- `GET /messages/conversations/{conversationId}`
- `POST /messages/conversations/{conversationId}/send`
- `POST /messages/public-intents/{id}/start`
- `GET /messages/unread`

Friends:

- `GET /friends`
- `POST /friends/users/{id}/follow`
- `GET /friends/following-ids`

Meets:

- `GET /meets`
- `POST /meets`
- `GET /meets/{id}`
- `POST /meets/{id}/join`
- `GET /meets/records/me`

Social Agent chat and workspace:

- `POST /social-agent/chat/run`
- `POST /social-agent/chat/run-async`
- `POST /social-agent/chat/messages/stream`
- `POST /social-agent/chat/route-message/stream`
- `GET /social-agent/chat/session`
- `GET /social-agent/chat/tasks/{taskId}/session`
- `POST /social-agent/chat/tasks/{taskId}/messages/stream`
- `POST /social-agent/chat/tasks/{taskId}/publish-social-request`
- `POST /social-agent/chat/tasks/{taskId}/save-candidate`
- `POST /social-agent/chat/tasks/{taskId}/send-message`
- `POST /social-agent/chat/tasks/{taskId}/connect-candidate`
- `POST /social-agent/chat/checkpoints/{checkpointId}/retry/stream`
- `POST /social-agent/chat/checkpoints/{checkpointId}/replay/stream`
- `POST /social-agent/chat/checkpoints/{checkpointId}/fork/stream`
- `GET /social-agent/tasks/current`
- `GET /social-agent/tasks/{taskId}/timeline`
- `GET /social-agent/tasks/{taskId}/events`
- `POST /social-agent/tasks/{taskId}/replan`
- `GET /social-agent/reminders`
- `GET /social-agent/reminders/preferences`

Agent control and admin:

- `GET /agent/checkpoints/tasks/{taskId}/latest`
- `POST /agent/checkpoints/{checkpointId}/retry`
- `POST /agent/checkpoints/{checkpointId}/replay`
- `POST /agent/checkpoints/{checkpointId}/fork`
- `GET /social-agent/l5/dashboard`
- `GET /social-agent/l5/replay-samples`
- `GET /social-agent/l5/subagent-memory`
- `GET /social-agent/l5/meet-loop-states`

Safety:

- `GET /safety/settings`
- `POST /safety/settings`
- `GET /safety/reports`
- `POST /safety/reports`
- `GET /safety/blocks`
- `POST /safety/blocks`

Uploads:

- `POST /uploads/image`
- `POST /uploads/video`

Waitlist:

- `POST /waitlist`
- `GET /waitlist/admin/entries`

Internal profile memory endpoints under `/life-graph/*` exist for the personal
information page and Agent writeback. They are not standalone product routes and
must not be reintroduced in navigation as a Life Graph page.

## Verification

Core contract drift is guarded by:

```bash
pnpm --dir frontend test -- fitmeetCoreContract.test.ts
```

Deployment smoke should include:

```bash
API_BASE_URL=https://api.socialworld.world/api scripts/verify-production.sh --base-url https://socialworld.world
```

Public-intent write/read-back smoke is explicit because it mutates production:

```bash
API_BASE_URL=https://api.socialworld.world/api scripts/verify-production.sh --base-url https://socialworld.world --run-public-intent-write
```
