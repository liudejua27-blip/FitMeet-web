# Data Model — Canonical Tables & Naming Authority

> **Status:** authoritative. Last verified against `backend/src/**/*.entity.ts`
> on 2026-05-13.
>
> **Rule of thumb:** if a table name appears in this file as **CANONICAL**, all
> new code MUST read/write it. If a name is listed as **LEGACY** or **ALIAS
> (does not exist)**, do **NOT** add new business logic against it. The
> service-layer adapters listed under each concept are the only allowed
> bridges.

## 0. Quick reference (the names people confuse)

| Concept you have in your head | The ONE table you should touch | Other names you might see | What to do with them |
|---|---|---|---|
| 活动 / activity | **`social_activities`** | `activities` | `activities` is **not a table** — only an HTTP route prefix (`/activities`). Do not reference it from SQL. |
| 老的"约练" | `meets` (LEGACY) | — | Only `MeetsModule` and pre-AI code uses it. No new writes; read-compat only. |
| 匹配候选人 | **`social_request_candidates`** | `match_candidates`, `social_match_candidates` | `match_candidates` is LEGACY scratch table for AgentGateway. `social_match_candidates` does not exist. |
| 用户社交意图 / 任务卡 | **`user_social_requests`** | `social_requests`, `public_social_intents` | `social_requests` is LEGACY read-compat. `public_social_intents` is a **public-hall projection**, not a duplicate. |
| Agent 身份 | **`agent_profiles`** + **`agent_connections`** | `agent_identities` | `agent_identities` does not exist. Profile = who/what the agent is; Connection = one auth grant from a user. |
| 待审批动作 | **`agent_approval_requests`** | `pending_actions` | `pending_actions` does not exist. Approval requests are the only queue. |

---

## 1. Activity domain

### 1.1 `social_activities` — CANONICAL
Entity: [backend/src/activities/entities/activity.entity.ts](backend/src/activities/entities/activity.entity.ts)
Purpose: every line-up — AI-matched coffee/run/dog-walk dates **and** any
new social meet-up created after round-2 of the AI social loop.
Lifecycle: `draft → pending_confirm → confirmed → in_progress → completed`
(or `cancelled`).
- Linked back to the originating social-request card via
  `socialRequestId` (FK to `user_social_requests`).
- Optionally back-linked to a legacy `meets` row via `meetId` when a
  classic 约练 was upgraded.
- Proof rows live in `activity_proofs` and are required when
  `proofPolicy != 'mutual_confirm'`.

### 1.2 `activity_templates` — CANONICAL config
Read-only template catalogue (running / fitness / dog_walking / coffee_chat
/ city_walk / custom). Activities clone defaults from the template at
creation time; **the template is not a hot-path table** — do not write to it
from request handlers.

### 1.3 `activity_proofs` — CANONICAL
Per-user completion evidence (`checkin`, `mutual_confirm`, `scene_photo`,
`selfie_optional`, `qr_code`, `merchant_confirm`). One row per
`(activityId, userId, proofType)`.

### 1.4 `meets` — LEGACY (do not extend)
Old "约练" entity. Read paths still exist for backward compatibility with
clubs and the pre-AI mobile flow. **No new feature should write to `meets`
directly.** If a feature spans both flows, create the row in
`social_activities` and set `meetId` to back-reference the legacy row.

### 1.5 `activities` — ALIAS (does NOT exist)
There is no `activities` SQL table. The string only appears as the REST
route `/activities` (HTTP prefix), which is served by
`AgentActivitiesController` → `SocialActivity` repository.

---

## 2. Match candidate domain

### 2.1 `social_request_candidates` — CANONICAL
Entity: [backend/src/match/social-request-candidate.entity.ts](backend/src/match/social-request-candidate.entity.ts)
Persisted, scored candidate list for **one** `UserSocialRequest`. Used by
the "匹配审查 / 换一批" UI so the scoring algorithm is not re-run on every
refresh.
- Status: `suggested → approved → messaged` (or `rejected` / `expired`).
- Owner = the user behind `socialRequest.userId`.

### 2.2 `match_candidates` — LEGACY (do not extend)
Entity: [backend/src/agent-gateway/entities/match-candidate.entity.ts](backend/src/agent-gateway/entities/match-candidate.entity.ts)
AgentGateway's internal scratch table from round-1. Still read by
`AgentGatewayService.listCandidates*` for back-compat. **New matching
features must write to `social_request_candidates`**; if both must move in
lockstep, mirror through `AgentSocialRequestAdapter`, not directly.

### 2.3 `social_match_candidates` — ALIAS (does NOT exist)
Common verbal slip. There is no such table. Map to
`social_request_candidates`.

---

## 3. Social request / intent domain

### 3.1 `user_social_requests` — CANONICAL
Entity: [backend/src/social-requests/social-request.entity.ts](backend/src/social-requests/social-request.entity.ts)
The user-facing "task card": *what kind of partner I want, where, when,
with which preferences*. Every new social-loop write **must** go through
`SocialRequestsService` (which writes here).
- Lifecycle: `draft → matching → matched → invitation_pending → chatting →
  activity_created → completed` (or `cancelled` / `expired`).
- Owns the candidate list in `social_request_candidates`.

### 3.2 `social_requests` — LEGACY read-compat
Entity (marked `@deprecated`):
[backend/src/agent-gateway/entities/social-request.entity.ts](backend/src/agent-gateway/entities/social-request.entity.ts)
Original AgentGateway-internal table. **Read-only** at this point. The only
writer is `AgentSocialRequestAdapter`, which dual-writes for legacy
consumers; nothing else may insert here.

### 3.3 `public_social_intents` — CANONICAL (different concept!)
Entity: [backend/src/agent-gateway/entities/public-social-intent.entity.ts](backend/src/agent-gateway/entities/public-social-intent.entity.ts)
**Not** a duplicate of `user_social_requests`. This is the projection that
appears in the **public hall** ("公共社交大厅"). It can be either:
- linked to a `UserSocialRequest` via `linkedSocialRequestId`, **or**
- a standalone publicly-authored intent (no owner; `userId` nullable).
A request only becomes hall-visible after `sync_to_hall` agent action
inserts/updates a row here.

### 3.4 Write-fanout rules (intent surface)

When a `UserSocialRequest` changes state, the service layer is responsible
for synchronising:

| Change on `user_social_requests` | Must also update | Notes |
|---|---|---|
| INSERT (status=`draft` or `matching`) | `agent_action_logs` (`create_social_request`) | Approval may be required for `matching`. |
| `matching` → `matched` | `social_request_candidates.status` of the chosen row → `approved`; `agent_action_logs` (`run_match`) | Other candidate rows stay `suggested`. |
| `matched` → `invitation_pending` | `agent_approval_requests` (type=`first_message` or `contact_request`), `agent_action_logs` (`generate_invite`) | Only after approval is granted does the message send. |
| `invitation_pending` → `chatting` | `social_request_candidates.status` → `messaged` | |
| `chatting` → `activity_created` | INSERT `social_activities` with `socialRequestId` set; `agent_action_logs` (`create_activity`) | |
| any → `completed` / `cancelled` | `social_activities.status` accordingly; `social_request_candidates` left-overs → `expired`; if a `public_social_intents` row exists, its `status` → `completed` / `inactive` | |
| `sync_to_hall` agent action | UPSERT `public_social_intents` keyed on `linkedSocialRequestId` | This is the **only** way a row appears in the public hall. |
| Legacy mirror | `social_requests` (dual-write via `AgentSocialRequestAdapter`) | Required while the deprecated read paths still ship. |

---

## 4. Agent identity domain

### 4.1 `agent_profiles` — CANONICAL "who is the agent"
Entity: [backend/src/agent-gateway/entities/agent-profile.entity.ts](backend/src/agent-gateway/entities/agent-profile.entity.ts)
One row per **agent persona**: name, provider (`deepseek`, `openclaw`,
`codex`, …), type (`user_agent` / `platform_agent` / `external_agent`),
autonomy level, profile status. Long-lived; survives token rotation.

### 4.2 `agent_connections` — CANONICAL "how the agent is wired in"
Entity: [backend/src/agent-gateway/entities/agent-connection.entity.ts](backend/src/agent-gateway/entities/agent-connection.entity.ts)
One row per **(user, agent token)** grant: permission level, daily budget,
hashed token, webhook URL. A user can have several connections (one per
agent / device). When a user "pauses" or "revokes" an agent, this is the
row whose `status` flips to `suspended` / `revoked`.

### 4.3 `agent_settings` — CANONICAL per-connection policy
Per-`(userId, agentConnectionId)` flags (allow-send-message,
require-approval-for-first-message, max-daily-messages, …). Always read
together with `agent_connections.status` — both must be `active`/`true` for
a write action to be permitted.

### 4.4 `agent_identities` — ALIAS (does NOT exist)
Common verbal shortcut for "the agent". In code, "agent identity" =
`agent_profiles` JOIN `agent_connections` on `agentConnectionId`. There is
no single `agent_identities` table.

---

## 5. Agent approval / audit domain

### 5.1 `agent_approval_requests` — CANONICAL queue
Entity: [backend/src/agent-gateway/entities/agent-approval-request.entity.ts](backend/src/agent-gateway/entities/agent-approval-request.entity.ts)
Every action the agent wants to take that the user must confirm lives
here. Lifecycle: `pending → approved | rejected | expired`.
Cross-links:
- `relatedSocialRequestId` → `user_social_requests.id`
- `relatedCandidateId` → `social_request_candidates.id`
- `relatedActivityId` → `social_activities.id`

### 5.2 `agent_action_logs` — CANONICAL append-only audit
Entity: [backend/src/agent-gateway/entities/agent-action-log.entity.ts](backend/src/agent-gateway/entities/agent-action-log.entity.ts)
One row per **agent behaviour**, regardless of `planned` /
`pending_approval` / `executed` / `rejected` / `failed`. Drives the
"agent did what" UI and trust-score signals. Append-only. Never UPDATE,
never DELETE — emit a new row instead.

### 5.3 `agent_activity_logs` — LEGACY
Round-1 / round-2 audit table kept for analytics back-compat. Some
reporting queries still read it. **No new code should write here**; emit
to `agent_action_logs` instead. The two tables intentionally exist in
parallel for one release window — to be retired in a follow-up.

### 5.4 `pending_actions` — ALIAS (does NOT exist)
No such table. The "pending action queue" is
`agent_approval_requests WHERE status = 'pending'`. The action's payload
sits in `agent_approval_requests.payload`; the audit trail sits in
`agent_action_logs` (`actionStatus = 'pending_approval'`).

### 5.5 State-sync rule for every agent action

The dispatcher must touch all three of these in order, in a single
transaction, **or none of them**:

1. INSERT `agent_action_logs` with `actionStatus = 'planned'` (or directly
   `executed` for read-only no-risk actions).
2. If `riskLevel ≥ medium` or `agent_settings.requireApproval*` matches:
   - INSERT `agent_approval_requests` (status=`pending`).
   - UPDATE the matching `agent_action_logs.actionStatus` to
     `pending_approval`.
3. On user approve:
   - UPDATE `agent_approval_requests.status = 'approved'`.
   - Execute the side-effect (write to `user_social_requests` /
     `social_request_candidates` / `social_activities` / …).
   - INSERT a fresh `agent_action_logs` row with
     `actionStatus = 'executed'` referencing the same business ids.
4. On user reject / expire:
   - UPDATE `agent_approval_requests.status` accordingly.
   - INSERT a fresh `agent_action_logs` row with
     `actionStatus = 'rejected'` (or `failed` on timeout).

---

## 6. Other related tables (canonical, no aliases)

| Table | Entity | Role |
|---|---|---|
| `agent_permissions` | [agent-permission.entity.ts](backend/src/agent-gateway/entities/agent-permission.entity.ts) | Per-connection action allow-list. |
| `contact_requests` | [contact-request.entity.ts](backend/src/agent-gateway/entities/contact-request.entity.ts) | Agent → other user "add me" requests. |
| `safety_events` | [safety-event.entity.ts](backend/src/agent-gateway/entities/safety-event.entity.ts) | Rate-limit / harassment / impersonation hits. |
| `user_social_profiles` | [user-social-profile.entity.ts](backend/src/users/user-social-profile.entity.ts) | AI-derived social profile per user. |
| `user_preferences` | [user-preference.entity.ts](backend/src/agent-gateway/entities/user-preference.entity.ts) | Per-user agent preferences (ideal-partner, chat-style…). |
| `ai_delegate_profiles` / `ai_match_sessions` | [ai-match/](backend/src/ai-match/) | AI-match orchestration only — not a substitute for `agent_profiles`. |

---

## 7. Hard rules (linter checklist)

A PR that violates any of these should be sent back:

1. **No raw `INSERT INTO meets`** in new code. New activity-like rows go to
   `social_activities`.
2. **No `INSERT INTO social_requests`** outside `AgentSocialRequestAdapter`.
   New social-intent writes go to `user_social_requests`.
3. **No `INSERT INTO match_candidates`** in new code. New candidate writes
   go to `social_request_candidates`.
4. **No `INSERT INTO agent_activity_logs`** in new code. Use
   `agent_action_logs`.
5. **No SQL referencing `activities`, `social_match_candidates`,
   `agent_identities`, or `pending_actions`** — those tables do not exist
   and never will under those names.
6. Every agent side-effect that changes a business entity (request /
   candidate / activity) **must** emit a row to `agent_action_logs` in the
   same transaction.
7. Every `agent_approval_requests` row whose action targets an activity
   **must** set `relatedActivityId`; whose action targets a candidate
   **must** set `relatedCandidateId`; whose action targets a social request
   **must** set `relatedSocialRequestId`.

---

## 8. When in doubt

- "Where do I write?" → §1–§5 row labelled **CANONICAL**.
- "Why does this old table still exist?" → §1.4 / §2.2 / §3.2 / §5.3 (LEGACY).
- "I see a name I don't recognise." → §0 alias table; if it's not in this
  file at all, grep `backend/src/**/*.entity.ts` for `@Entity(` before
  adding any code.
