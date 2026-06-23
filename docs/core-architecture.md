# FitMeet Core Architecture

Last updated: 2026-06-23

This is the current cleanup boundary for the FitMeet Web + Agent release.
Anything outside this document should not be added back without a product
decision and matching route/API tests.

## Kept Web Routes

Primary pages:

- `/`
- `/discover`
- `/features`
- `/agent`
- `/safety`
- `/download`
- `/about`
- `/demo`
- `/login`
- `/user/:id`
- `/public-intent/:id`

Agent internal routes:

- `/agent/chat`
- `/agent/chat/:taskId`
- `/agent/profile`

Hidden foundation pages:

- `/messages`
- `/privacy`
- `/terms`
- `/forgot-password`
- `/admin/safety`
- `/admin/waitlist`
- `/admin/agent-l5`

Deleted standalone product surfaces include Coach, Search, Notifications page,
AI Profile page, Life Graph page, old pending/approval pages, Social Request
publish pages, city/sports/guides/press static pages, and runtime mock adapter
routes.

## Backend Module Boundary

The root backend keeps only modules required by the retained product:

- Auth and Users for login, public user detail, and personal information.
- AgentGateway for chat, task runtime, OpportunityCard publication, candidates,
  approvals, reminders, 3-agent worker runtime, and L5 admin support.
- LifeGraph as an internal profile/memory capability for Agent and the personal
  information page; it is not a standalone product surface.
- Messages and Friends for invites, friend actions, private messages, and
  candidate conversations.
- SocialRequests and Match as internal dependencies for public intent creation,
  candidate pool recall, and compatibility scoring.
- Meets and Activities for confirmed meet-up state and post-meet writeback.
- Safety, Uploads, Waitlist, Admin RBAC, Realtime, Redis, Moderation, and AI as
  shared infrastructure.

Notifications remains service-only. It has no public REST controller and is used
for Agent reminders, invitations, and message alerts.

## Agent Runtime

The runtime uses one orchestrator and three execution agents. Product workflow
names such as `meet_loop_skill` or schema names such as `social_match.activity`
are contracts, not additional runtime agents.

- `FitMeet Main Agent`: routes intent, enforces approvals, and returns concise
  user-facing output.
- `Agent Brain`: ordinary chat, lightweight reasoning, and deterministic fitness
  calculations. It does not read or write private profile memory.
- `Life Graph Agent`: personal information completion and governed profile
  memory proposals. It must preview changes and wait for user confirmation.
- `Match Agent`: OpportunityCard drafting/publishing, Discover sync, candidate
  recall/ranking, opener preview, invite/message/friend actions, and meet-loop
  state.

The 10 files under `docs/agent-skills/` are workflow contracts, not 10 runtime
subagents. They keep behavior testable while the execution topology stays small
enough for normal users to afford.

`backend/src/agent-gateway/fitmeet-alpha-agent-topology.ts` is the single
source of truth for runtime boundaries. `FITMEET_ALPHA_AGENT_RUNTIME_BOUNDARIES`
defines each agent role, tool budget, retry budget, memory scope, and evaluation
hints. Runtime services should read these values from topology instead of
duplicating local maps.

Cost and token boundaries:

- Ordinary chat and deterministic calculations stay on `Agent Brain`; they do
  not hydrate private profile memory or search candidates.
- `Agent Brain` has a one-tool budget and zero retry budget.
- `Life Graph Agent` has a two-tool budget and only proposes personal
  information changes; it must not search candidates or execute social actions.
- `Match Agent` has a three-tool budget for OpportunityCard, candidate search,
  invite/message/friend, and meet-loop state transitions.
- `FitMeet Main Agent` composes the answer from observed state. It should not
  run extra tools just to explain work already done.
- Old `nextAgent` values such as `social_match`, `meet_loop`, `math`, and
  `life_graph` are accepted only as compatibility aliases. New structured
  output uses `match_agent`, `agent_brain`, `life_graph_agent`, or `main_agent`.

## User Flow Closures

OpportunityCard closure:

1. User expresses a meet-up or friend-making goal in `/agent`.
2. Agent extracts task slots from the current task context.
3. Draft card shows `发布卡片 / 修改信息 / 暂不发布`.
4. Publish requires confirmation.
5. Successful publish returns `discoverHref` and `publicIntentId`.
6. `/discover` lists the real public card, and `/public-intent/:id` opens it.

Matching and social closure:

1. User profile and public intent fields enter the candidate pool.
2. Matching uses public profile, public intent, activity, time, location, and
   safety boundaries.
3. Candidate cards show conclusion, reason, safety tip, and next action.
4. Save/view/opening-preview are low-risk actions.
5. Invite, message send, friend connection, precise location, contact exchange,
   and sensitive profile writes require inline confirmation.
6. Replies and ongoing conversations land in `/messages`.

## Database Boundary

The migration baseline is
`backend/src/database/migrations/1780000000000-CoreBaseline.ts`.

It keeps table families for users/auth, social profiles, internal profile memory,
Agent task/runtime/checkpoint/approval/message feedback/reminder/interest/public
intent/candidate data, messages, friends, meets, activities, safety, uploads,
waitlist, and required admin/L5 runtime records.

It intentionally drops historical migration churn, page-only feature tables,
standalone notification pages, developer capability demos, and mock/seed-only
runtime flows.

Removed residual code that must not be reintroduced:

- `backend/src/events`: unused WebSocket gateway replaced by `RealtimeModule`.
- `frontend/src/components/three`: old universe/3D visual system outside the
  retained website and Agent experience.
- `frontend/src/components/portal`: empty legacy portal directory.

Do not run the new baseline directly against an old production database. Back up
first, then rebuild from the baseline or run a controlled one-time data
migration.

## Verification

Targeted Agent and route checks:

```bash
pnpm --dir backend exec jest \
  src/agent-gateway/social-agent-chat.acceptance.spec.ts \
  src/agent-gateway/social-agent-draft-publication.service.spec.ts \
  src/agent-gateway/social-agent-candidate-pool.service.spec.ts \
  src/agent-gateway/public-social-intent-list-query.spec.ts \
  src/agent-gateway/public-social-intent.presenter.spec.ts \
  src/users/social-profile.service.spec.ts --runInBand

pnpm --dir frontend exec vitest run \
  src/test/AgentRouteIsolation.test.ts \
  src/test/AgentWorkspacePage.test.tsx \
  src/test/DiscoverClosure.test.ts \
  src/test/DiscoverPage.test.tsx \
  src/test/routeBoundaries.test.ts \
  src/test/agentAdapter.test.ts \
  src/test/agentWorkspaceRuntime.test.ts \
  src/test/toolCardActions.test.ts
```

Release checks:

```bash
pnpm --dir backend lint
pnpm --dir backend build
pnpm --dir frontend lint
pnpm --dir frontend build
node scripts/verify-agent-skills.mjs
node scripts/run-agent-skill-evals.mjs
```
