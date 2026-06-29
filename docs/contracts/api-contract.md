# FitMeet Core API Contract

Last updated: 2026-06-25

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
- `GET /users/me/onboarding-status`
- `POST /users/me/onboarding/complete`
- `GET /users/me/profile-photos`
- `PUT /users/me/profile-photos`
- `DELETE /users/me/profile-photos/{photoId}`
- `GET /users/me/social-profile`
- `PUT /users/me/social-profile`
- `GET /users/me/social-profile/questions`
- `POST /users/me/social-profile/answers`
- `POST /users/me/social-profile/ai-draft`
- `POST /users/me/social-profile/ai-save`
- `GET /users/me/social-profile/completion`
- `GET /users/me/social-profile/privacy`
- `PATCH /users/me/social-profile/privacy`
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
- `POST /public/social-intents/{id}/applications`
  - Requires `Idempotency-Key`.
  - Creates a pending application only; pending applications do not open normal
    chat.
- `GET /public/social-intents/{id}/applications`
- `GET /users/me/public-intent-applications?role=owner|applicant`
- `POST /public-intent-applications/{id}/accept`
  - Requires `Idempotency-Key`.
  - Atomically accepts the application in PostgreSQL, updates intent capacity,
    creates or reuses the linked meet, upserts active participants, grants open
    contact permission, and writes `domain_outbox_events`.
  - Returns `conversation.status = provisioning|ready`; Mongo conversation
    creation happens only through outbox processing.
- `POST /public-intent-applications/{id}/reject`
  - Requires `Idempotency-Key`.
- `POST /public-intent-applications/{id}/cancel`
  - Requires `Idempotency-Key`.

Messages:

- `POST /messages/start`
  - Requires `Idempotency-Key`.
  - Requires `targetUserId`, `contextType`, and `contextId`.
  - Returns `CONTACT_NOT_ALLOWED` unless an accepted friendship, accepted public
    intent application, meet, or approved opener context grants permission.
- `GET /messages/conversations`
- `GET /messages/conversations/{conversationId}`
- `POST /messages/conversations/{conversationId}/send`
  - Rechecks conversation membership, onboarding readiness, contact permission,
    opener state, and bidirectional block status on every send.
- `POST /messages/public-intents/{id}/start`
  - Compatibility path only; it may start a chat only when contact permission is
    already open.
- `GET /messages/unread`

Friends:

- `GET /friends`
  - Returns active `friendships` only. `follow` is not a friendship and must not
    be used as a fallback.
- `DELETE /friends/{userId}`
- `POST /connections/requests`
  - Requires `Idempotency-Key`.
- `GET /connections/requests?box=inbox|outbox&status=pending`
- `POST /connections/requests/{id}/accept`
  - Requires `Idempotency-Key`; accepted requests create friendship and grant
    open contact permission.
- `POST /connections/requests/{id}/reject`
  - Requires `Idempotency-Key`.
- `POST /connections/requests/{id}/cancel`
  - Requires `Idempotency-Key`.
- `GET /relationships/users/{userId}`
- `POST /users/{id}/follow`
- `GET /users/{id}/following`
- `GET /following/ids`

Meets:

- `GET /meets`
- `POST /meets`
- `GET /meets/{id}`
- `POST /meets/{id}/join`
- `GET /meets/records/me`

Onboarding and profile gate:

- `GET /users/me/onboarding-status`
- `POST /users/me/onboarding/complete`
  - Requires `Idempotency-Key`.
  - Returns stable `ONBOARDING_REQUIREMENTS_NOT_MET` errors when the user has
    not accepted current terms/privacy, is under age, has fewer than 3
    interests, has fewer than 2 approved photos, has pending review photos, or
    has no approved cover photo.
- `GET /users/me/profile-photos`
- `PUT /users/me/profile-photos`
  - Accepts uploaded `assetId` values only; clients must not hard-code remote
    photo URLs into profile state.
  - Supports 2-6 final onboarding photos, with one approved cover photo.
- `DELETE /users/me/profile-photos/{photoId}`

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

- `POST /safety/reports`
- `POST /safety/blocks/{id}`
  - Immediately closes contact permission in both directions. Unblock does not
    restore friendship, application, opener, or chat permissions automatically.
- `DELETE /safety/blocks/{id}`
- `GET /safety/blocks/ids`

Uploads:

- `POST /uploads/image`
  - Returns `assetId`, `url`, dimensions, and `moderationStatus`; onboarding
    binds profile photos by `assetId`.
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
pnpm --dir backend run test:e2e:contract
```

This test imports `backend/src/openapi/fitmeet-core.openapi.ts` and compares the
OpenAPI path/method table with `frontend/src/api/fitmeetCoreContract.ts`.
Frontend-only experimental Agent routes may remain in the registry, but every
path in `fitMeetCoreEndpointMethods` must exist in OpenAPI with the exact same
HTTP methods.

Social Contact Loop V1 has a separate real-infrastructure integration check.
It uses the local Docker Compose PostgreSQL, MongoDB, and Redis services; it
calls HTTP controllers and only touches the database for fixture setup and final
state assertions:

```bash
docker compose up -d postgres mongo redis
pnpm --dir backend run test:e2e:integration
```

Deployment smoke should include:

```bash
API_BASE_URL=https://api.socialworld.world/api scripts/verify-production.sh --base-url https://socialworld.world
```

Public-intent write/read-back smoke is explicit because it mutates production:

```bash
API_BASE_URL=https://api.socialworld.world/api scripts/verify-production.sh --base-url https://socialworld.world --run-public-intent-write
```
