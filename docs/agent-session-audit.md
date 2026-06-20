# Agent Session And Mock Audit

Last updated: 2026-06-09

## Scope

This audit covers the FitMeet Agent web page, the `AgentAdapter` layer, and backend Social Agent session storage after moving `/agent` to real API usage in production.

## Current Status

- `/agent` uses `AgentAdapter` so mock and real implementations are isolated.
- Development defaults to `mock`; production now defaults to `real`.
- Production builds resolve to the real adapter when `import.meta.env.PROD` or `import.meta.env.MODE === 'production'`; `VITE_AGENT_ADAPTER=real` remains an explicit override, not a required safety rail.
- `/agent` restores the latest backend Agent session in real mode when the user is logged in.
- Restored sessions use the backend `activeTaskId` as the canonical task id for follow-up messages.
- New conversation clears the current frontend task state and skips one automatic restore so it does not immediately reopen the last task.

## DB-Backed Session Paths

These are backed by PostgreSQL entities and are suitable for real API integration:

- `agent_tasks`: canonical Social Agent task state, plan, memory, result, idempotency key, permission mode, risk level.
- `agent_task_events`: append-only timeline for replay, audit, restore, and debug UI.
- `agent_runs`, `agent_run_steps`, `agent_tool_calls`, `agent_messages`: compatibility/runtime records used by the user-facing Agent chat flow.
- `agent_approval_requests`: pending confirmations and safety approvals.
- `social_agent_long_term_memory`: long-term user memory for Social Agent.
- `ai_match_sessions`: Match Agent recommendation sessions.
- Life Graph tables: profile, fields, proposals, audit logs, behavior events, signal scores.

## Frontend Session Rules

- Do not persist Agent conversation state in `localStorage` or `sessionStorage`.
- Keep frontend state limited to UI rendering: input text, current cards, progress rows, active task id.
- On reload or route entry, recover real Agent state through:
  - `GET /api/social-agent/chat/session`
  - `GET /api/social-agent/chat/tasks/:taskId/session`
- Continue a restored conversation by sending `taskId` in:
  - `POST /api/social-agent/chat/stream-user`
  - `POST /api/social-agent/chat/tasks/:taskId/messages`
  - `POST /api/social-agent/chat/tasks/:taskId/actions`

## Mock Policy

Allowed mock usage:

- `mockAgentAdapter` for local development or unit tests without a backend.
- Unit tests that explicitly call `createMockAgentAdapter`.

Not allowed for staging/production:

- `/agent` defaulting to mock.
- Card actions bypassing `performAction`.
- Session restore relying on frontend-only memory.

## Audit Findings

1. Fixed: production adapter fallback now resolves to `real` when `import.meta.env.PROD` is true or `import.meta.env.MODE === 'production'`.
2. Fixed: `/agent` now calls `restoreSession()` in real mode for logged-in users.
3. Fixed: restored session `activeTaskId` is preserved and reused on follow-up `run()` calls.
4. Fixed: clicking "新对话" clears the active task and prevents immediate latest-session restore.
5. Verified: backend Social Agent session restore reads `agent_tasks`, `agent_task_events`, pending approvals, latest stored run, and task memory.
6. Verified: Match Agent sessions use `AiMatchSession` repository, not process memory.
7. Non-blocking: backend metrics and public local rate buckets still use in-memory `Map`. They are telemetry/rate fallback, not conversation session state. For multi-instance production, move these to Redis.
8. Non-blocking: algorithmic `Map` usage in matching/candidate pool is request-local and not session storage.

## Remaining Risks Before Staging

- Redis-backed rate limit and metrics are still needed for multi-instance production.
- Real `/agent` restore depends on valid auth; anonymous production users should be routed to login rather than mock.
- Full browser QA should cover refresh after `waiting_confirmation`, then confirm action after reload.
- Staging seed data must include enough discoverable users, social profiles, and safe candidate records.
- Existing backend full typecheck may still have unrelated spec/mock type issues; targeted Agent tests pass.

## Verification Commands

```bash
cd frontend
PATH=/Users/liuchongjiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH ./node_modules/.bin/vitest run src/test/agentAdapter.test.ts src/test/AgentWorkspacePage.test.tsx
PATH=/Users/liuchongjiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH ./node_modules/.bin/tsc -b
PATH=/Users/liuchongjiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH ./node_modules/vite/bin/vite.js build

cd backend
PATH=/Users/liuchongjiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH ./node_modules/.bin/jest src/agent-gateway/social-agent-tool-executor.service.spec.ts src/agent-gateway/social-agent-chat.controller.spec.ts src/agent-gateway/social-agent-chat-turn-facade.service.spec.ts --runInBand
PATH=/Users/liuchongjiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH ./node_modules/.bin/nest build
```
