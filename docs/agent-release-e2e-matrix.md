# FitMeet Agent Release E2E Matrix

This matrix is the release gate for the assistant-ui Agent experience. It maps
the product goal to executable evidence so a release does not rely on scattered
green checks.

## Scope

- Primary surface: `/agent/chat`.
- Frontend shell: assistant-ui Thread, Composer, ThreadList, Message Parts,
  ActionBar, BranchPicker, and Tool UI.
- Backend chain: unified AgentLoop, social intent gate, OpportunityCard,
  checkpoint resume, step retry/replay/fork, approval, Meet Loop, and Life Graph
  proposal actions.
- Safety: smoke users only for mutating remote checks; no real user account, no
  raw trace/planner/debug JSON in user-facing output.

## Required Gates

| Gate                         | Command                                                                                                                                                                      | Evidence                                                                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unified Agent release matrix | `scripts/agent-release-matrix.sh`                                                                                                                                            | Runs the static audit, backend checks, frontend checks, browser QA, and optional real smoke gates from one entrypoint.                                         |
| Static release audit         | `pnpm --dir frontend run check:agent-chat-release`                                                                                                                           | Assistant-ui files tracked, old Agent shell/pet absent, release scripts include Agent smoke gates, and production build checks enforce Agent chunk splitting. |
| Frontend typecheck           | `pnpm --dir frontend exec tsc -b`                                                                                                                                            | `/agent/chat` assistant-ui components and API adapters compile together.                                                                                       |
| Backend typecheck            | `pnpm --dir backend exec tsc --noEmit`                                                                                                                                       | AgentLoop, checkpoint, smoke, controller, and presenter surfaces compile together.                                                                             |
| Agent unit/acceptance suite  | `bash scripts/verify-agent-release.sh`                                                                                                                                       | Backend Agent specs, stranger candidate-pool safety, reminder safety, long-term memory history, frontend Agent specs, browser QA, and optional smoke commands are wired together. |
| Browser QA                   | `pnpm --dir frontend run qa:agent-chat`                                                                                                                                      | 390 / 768 / 1024 / 1440 screenshots and assertions for shell, composer, ThreadList, actions, Tool UI, stop, feedback, branch, checkpoint actions.              |
| Production browser QA        | `FITMEET_AGENT_BROWSER_QA_ALLOW_REMOTE=true FITMEET_AGENT_BROWSER_QA_EMAIL=<smoke-email> FITMEET_AGENT_BROWSER_QA_PASSWORD=<smoke-password> pnpm --dir frontend run qa:agent-chat:production` | Logs in with a dedicated smoke account, checks the deployed `/agent/chat` assistant-ui shell at 390 / 768 / 1024 / 1440, proves ordinary chat does not render social UI, and proves explicit social intent clarifies or renders opportunities. |
| Remote smoke safety preflight | `scripts/agent-remote-smoke-preflight.sh --readiness --api-base-url https://www.ourfitmeet.cn/api`                                                                           | Checks target API, auth, dedicated smoke-account shape, remote/mutation/JWT override flags, and prints no secrets.                                              |
| Remote smoke env template    | `deploy/agent-smoke.remote.env.example`                                                                                                                                      | Provides non-secret placeholders for the dedicated smoke account, mutation guards, readiness stop flag, and stable Opportunity journey knobs.                    |
| Remote smoke evidence capture | `scripts/agent-remote-smoke-evidence.sh --all --prepare-agent-smoke-seed`                                                                                                   | Runs readiness, full opportunity, and SSE abort smoke through the ECS wrapper and stores a redacted markdown evidence file.                                    |
| Opportunity readiness smoke  | `RUN_AGENT_OPPORTUNITY_SMOKE=readiness bash scripts/verify-agent-release.sh`                                                                                                 | Ordinary chat stays conversational, vague social request clarifies, clarified social request returns 3+ OpportunityCards, then stops before high-risk actions. |
| Full opportunity smoke       | `RUN_AGENT_OPPORTUNITY_SMOKE=true bash scripts/verify-agent-release.sh`                                                                                                      | Opener draft, reject, confirm send, activity confirmation, Meet Loop, review, and Life Graph proposal actions execute with dedicated smoke data.               |
| SSE abort smoke              | `RUN_AGENT_SSE_ABORT_SMOKE=true bash scripts/verify-agent-release.sh`                                                                                                        | First delta arrives, client abort stops the run, and no result continues after disconnect.                                                                     |
| ECS post-deploy readiness    | `scripts/ecs-post-deploy-smoke.sh --prepare-agent-smoke-seed --run-agent-opportunity-readiness-smoke --scan-compose-logs`                                                    | Production API health, readiness, Agent opportunity readiness, and backend/worker log scan pass.                                                               |
| ECS post-deploy full smoke   | `AGENT_SMOKE_ALLOW_MUTATIONS=true scripts/ecs-post-deploy-smoke.sh --prepare-agent-smoke-seed --run-agent-opportunity-smoke --run-agent-sse-abort-smoke --scan-compose-logs` | Dedicated smoke users prove full mutating chain and SSE abort against the deployed API.                                                                        |
| Final Agent cutover status   | `REQUIRE_AGENT_REMOTE_SMOKE_EVIDENCE=true AGENT_REMOTE_SMOKE_EVIDENCE_FILE=<evidence.md> scripts/launch-status.sh --topology ecs --skip-ios-testflight-check`                 | Launch status fails unless the redacted ECS evidence file proves readiness, full opportunity, SSE abort, and zero-exit post-deploy smoke.                       |

## Product Scenarios

| Scenario                                      | Required proof                                                                                                                                                                      |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ordinary chat does not trigger social UI      | `qa-agent-chat-shell.mjs` checks no OpportunityCard in ordinary chat; `smoke-agent-opportunity-journey.ts` calls `assertNoOpportunityCards` and `assertNoSocialExecutionArtifacts`. |
| Vague social request asks clarification       | Smoke requires city, time, intensity, social boundary, stranger policy, and public-activity policy before search.                                                                   |
| Explicit social request returns opportunities | Smoke requires at least 3 candidate/activity OpportunityCards and stable `fitmeet.tool-ui.v1` schema.                                                                               |
| Stranger candidate pool is safe               | Backend `social-agent-candidate-pool.service.spec.ts` verifies candidates require `profileDiscoverable` and `agentCanRecommendMe`, filters missing opt-in, respects stranger rejection, blocks complaint/moderation risk, and returns explainable top candidates only. |
| Candidate opener requires confirmation        | Full smoke creates `candidate.generate_opener`, then `opener.confirm_send` is required before any send side effect.                                                                 |
| Rejection stays natural and safe              | Full smoke runs `opener.reject` and checks that no contact is made.                                                                                                                 |
| Activity creation requires confirmation       | Full smoke runs `activity.confirm_create` and checks pending approval before side effects.                                                                                          |
| Meet Loop can continue after confirmation     | Full smoke validates message sent timeline, activity confirmation, check-in, completion, review, and Life Graph follow-up.                                                          |
| Life Graph remains proposal-based             | Full smoke validates reversible Life Graph update proposal actions: `life_graph.accept_update` and `life_graph.reject_update`.                                                      |
| Proactive reminders stay opt-in               | Backend release specs verify reminders are disabled by default, expose an explicit opt-out action, respect quiet hours/mute/dismiss backoff, and remain suggestion-only.             |
| Long-term memory keeps history                | Backend release specs verify newer preferences can update the current profile without erasing older confirmed preference history.                                                   |
| Stop/cancel works                             | Browser QA checks stopped runs do not keep rendering social cards; SSE abort smoke checks backend disconnect.                                                                       |
| Checkpoint retry/replay/fork works            | Browser QA verifies UI calls checkpoint retry/replay/fork streams; backend controller specs verify saved run cursor routing.                                                        |
| Tool UI is user-safe                          | Release audit checks canonical schema renderers and public safety checks that block `traceId`, `planner`, raw JSON, and debug fields.                                               |

## Remote Smoke Rules

- Remote readiness and full smoke both require dedicated smoke credentials.
- Copy `deploy/agent-smoke.remote.env.example` to
  `deploy/agent-smoke.remote.env` and fill only a dedicated smoke/test account.
  The filled file is gitignored and must never be packaged or shared.
- Run `scripts/agent-remote-smoke-preflight.sh --readiness` before readiness
  smoke and `scripts/agent-remote-smoke-preflight.sh --full` before full smoke.
- `scripts/ecs-post-deploy-smoke.sh` automatically invokes the same preflight
  before opportunity readiness, full opportunity, and SSE abort smoke.
- `scripts/verify-agent-release.sh` also invokes the preflight before optional
  real API opportunity or SSE abort smoke.
- `scripts/agent-remote-smoke-evidence.sh --all --prepare-agent-smoke-seed`
  captures the ECS smoke output as redacted markdown release evidence.
- `pnpm --dir frontend run qa:agent-chat:production` captures browser evidence
  under `artifacts/agent-browser-qa/`; run it only with a dedicated smoke
  account and `FITMEET_AGENT_BROWSER_QA_ALLOW_REMOTE=true`.
- Full remote smoke requires `AGENT_SMOKE_ALLOW_MUTATIONS=true`.
- Readiness smoke sets `AGENT_SMOKE_STOP_AFTER_OPPORTUNITIES=true` and stops
  before opener send, activity creation, review, and Life Graph proposal actions.
- Do not run mutating smoke with a real user account.
- Do not package `.env.production`, SSL private keys, `frontend/qa`, `docs/qa`,
  `qa-gsap-round2`, `deploy/agent-smoke.remote.env`, or screenshot artifacts.

## Release Decision

A release candidate can proceed only when:

1. Static audit, frontend typecheck, backend typecheck, browser QA, and backend
   Agent specs pass.
2. At least readiness smoke has passed against the target API.
3. Production browser QA has passed against the deployed `/agent/chat` using a
   dedicated smoke account.
4. Full smoke has passed in staging or production with dedicated smoke users
   before enabling complex Agent social execution for real traffic.
5. `launch-status.sh` passes with
   `REQUIRE_AGENT_REMOTE_SMOKE_EVIDENCE=true` and the generated redacted
   evidence markdown.
6. Recent backend and subagent-worker logs contain no sustained production
   failure patterns.

## Latest Local Proof

2026-06-15 unified local release-matrix run:

- Command: `scripts/agent-release-matrix.sh`.
- Passed: static Agent release audit.
- Passed: backend Agent release typecheck.
- Passed: Agent smoke seed dry-run.
- Passed: backend Agent route/stream/acceptance suite, including stranger
  candidate-pool safety and high-risk tool policy gates: 10 suites, 192 tests.
- Passed: frontend assistant-ui Agent typecheck.
- Passed: frontend assistant-ui Agent unit suite: 5 files, 112 tests.
- Passed: browser QA for `/agent/chat` at 390 / 768 / 1024 / 1440, including
  mobile sidebar, normal conversation, composer keyboard flow, new chat reset,
  ActionBar, attachment retry, feedback, stop generation, branch regeneration,
  checkpoint retry/replay/fork actions, social clarification, explicit social
  intent, Tool UI action, social action chain, social action rewrite,
  e2e Opportunity journey, and real ThreadList restore.
- Skipped intentionally by default: real API opportunity smoke and real SSE
  abort smoke. Run readiness/full remote smoke with dedicated smoke users before
  enabling complex Agent social execution for real traffic.

2026-06-15 local release-matrix build run:

- Command:
  `RUN_AGENT_BROWSER_QA=false scripts/agent-release-matrix.sh --skip-browser-qa --build`.
- Passed: static Agent release audit.
- Passed: backend Agent release typecheck.
- Passed: Agent smoke seed dry-run.
- Passed: backend Agent route/stream/acceptance suite, including stranger
  candidate-pool safety and high-risk tool policy gates: 10 suites, 192 tests.
- Passed: frontend assistant-ui Agent typecheck.
- Passed: frontend assistant-ui Agent unit suite: 5 files, 112 tests.
- Passed: frontend production build and `check:prod-build`, including the
  Agent workspace chunk budget and split Tool UI chunk gate.
- Passed: backend production build.
- Passed: Agent Tool UI code splitting. The heavy Tool UI renderer now loads as
  a separate `tool-fallback` chunk, and `AgentWorkspacePage` builds below the
  500 kB Vite warning threshold.

2026-06-15 ECS deploy zip build after Agent chunk gate:

- Command:
  `RUN_BACKEND_DOCKER_BUILD_CHECK=false RUN_AGENT_BROWSER_QA=false bash scripts/build-deploy-zip.sh /tmp/fitmeet-ecs-deploy-agent-assistant-ui-gate.zip`.
- Passed: Agent release audit.
- Passed: frontend ECS same-origin build and `check:prod-build`, including the
  Agent workspace chunk budget and split Tool UI chunk gate.
- Passed: backend Agent route/stream/acceptance suite, including stranger
  candidate-pool safety and high-risk tool policy gates: 10 suites, 192 tests.
- Passed: frontend assistant-ui Agent unit suite: 5 files, 112 tests.
- Passed: backend production build.
- Passed: production Agent smoke seed dry-run from compiled JS.
- Passed: sanitized deploy tree staging, zip creation, zip scan, checksum, and
  installer helper generation.
- Output: `/tmp/fitmeet-ecs-deploy-agent-assistant-ui-gate.zip`.
- SHA256:
  `01829ef37909d403252062be165d302e5adfe480a0831ebe309fa0c12bd59ef3`.
- Independent zip audit: required `check-prod-build.mjs`, lazy assistant-ui
  `message.tsx`, Tool UI source, built `AgentWorkspacePage` chunk, and split
  `tool-fallback` chunk are present; legacy Agent pet/CSS, QA screenshots,
  `.env.production`, SSL private keys, `fullchain`, and `privkey` entries are
  absent from the audit scan.
- Passed follow-up Docker production image build for the same worktree:
  `docker build -f backend/Dockerfile.prod backend -t fitmeet-backend-release-check:agent-assistant-ui-gate`.
  This verifies builder `pnpm install --frozen-lockfile`, backend Nest
  production build, runner `pnpm install --prod --frozen-lockfile`, and
  non-root upload directory preparation for `/tmp/fitmeet/uploads/temp` and
  `/app/public/uploads/temp`.

2026-06-15 focused browser QA:

- Command: `pnpm --dir frontend run qa:agent-chat`.
- Passed: base assistant-ui shell screenshots and DOM assertions at
  390 / 768 / 1024 / 1440.
- Passed: mobile sidebar drawer, composer keyboard flow, new chat reset,
  ActionBar microinteractions, attachment failure retry, feedback submission,
  stop generation, branch regeneration, checkpoint retry/replay/fork actions,
  social clarification, social clarification follow-up, explicit social intent,
  Tool UI action, social action chain, social action rewrite, e2e Opportunity
  journey, and real ThreadList restore.
- Evidence screenshots were written under `frontend/qa/agent-chat-shell/`.
  This directory remains release-excluded and must not be packaged.

2026-06-14 local release-matrix run:

- Command: `scripts/agent-release-matrix.sh`.
- Passed: static Agent release audit.
- Passed: backend Agent release typecheck.
- Passed: Agent smoke seed dry-run.
- Passed: backend Agent route/stream/acceptance suite, including stranger
  candidate-pool safety and high-risk tool policy gates: 10 suites, 192 tests.
- Passed: frontend assistant-ui Agent unit suite: 5 files, 89 tests.
- Passed: browser QA for `/agent/chat` at 390 / 768 / 1024 / 1440.
- Passed: mobile and desktop checks for sidebar, keyboard, new chat, ActionBar,
  attachment retry, feedback, stop generation, branch regeneration, checkpoint
  actions, social clarification, social intent, tool action, social action
  chain, social action rewrite, e2e opportunity journey, and real ThreadList.
- Skipped intentionally: real API opportunity smoke and real SSE abort smoke.
  Run readiness/full remote smoke with dedicated smoke users before enabling
  complex Agent social execution for real traffic.

2026-06-14 local release-matrix build run:

- Command: `RUN_AGENT_BROWSER_QA=false scripts/agent-release-matrix.sh --skip-browser-qa --build`.
- Passed: static Agent release audit.
- Passed: backend Agent release typecheck.
- Passed: Agent smoke seed dry-run.
- Passed: backend Agent route/stream/acceptance suite, including stranger
  candidate-pool safety and high-risk tool policy gates: 10 suites, 192 tests.
- Passed: frontend assistant-ui Agent unit suite: 5 files, 89 tests.
- Passed: frontend production build and `check:prod-build`.
- Passed: backend production build.
- Noted: Vite reported a large chunk warning for the Agent workspace bundle.
  This is not a build failure, but should remain a performance follow-up after
  the release-critical Agent behavior gates are closed.

2026-06-14 ECS deploy zip build:

- Command:
  `RUN_BACKEND_DOCKER_BUILD_CHECK=false RUN_AGENT_BROWSER_QA=false bash scripts/build-deploy-zip.sh /tmp/fitmeet-ecs-deploy-agent-matrix.zip`.
- Passed: frontend ECS same-origin build and `check:prod-build`.
- Passed: Agent release verification inside the zip build.
- Passed: backend production build.
- Passed: production Agent smoke seed dry-run from compiled JS.
- Passed: sanitized deploy tree staging, zip creation, zip scan, checksum, and
  installer helper generation.
- Output: `/tmp/fitmeet-ecs-deploy-agent-matrix.zip`.
- SHA256:
  `e1a4c18864f83bd835e45d32e68d78136e059d34890a889f86418e4dfb52313d`.
- Independent zip audit: 3848 entries; required Agent matrix, assistant-ui,
  smoke, and backend dist files present; `.env.production`, SSL private keys,
  QA screenshots, legacy Agent pet, and legacy Agent shell CSS absent.
- Noted: Docker image build was intentionally skipped in this local run with
  `RUN_BACKEND_DOCKER_BUILD_CHECK=false`; run the Docker build gate in CI/ECS
  or on a machine with Docker before final production cutover.

2026-06-14 backend Docker production image build:

- Command:
  `docker build -f backend/Dockerfile.prod backend -t fitmeet-backend-release-check:agent-matrix`.
- Passed: builder install with `pnpm install --frozen-lockfile`.
- Passed: backend Nest production build inside Docker.
- Passed: runner install with `pnpm install --prod --frozen-lockfile`.
- Passed: non-root runtime upload directory preparation for
  `/tmp/fitmeet/uploads/temp` and `/app/public/uploads/temp`.

2026-06-14 ECS non-mutating production readiness:

- Command:
  `FITMEET_LAUNCH_TOPOLOGY=ecs WEB_ORIGIN=https://www.ourfitmeet.cn API_BASE_URL=https://www.ourfitmeet.cn/api RUN_IOS_TESTFLIGHT_CHECK=false scripts/launch-status.sh --topology ecs --skip-ios-testflight-check`.
- Passed: production shell syntax gate.
- Passed: backend `production-deploy-readiness.spec.ts`: 8 tests.
- Passed: public DNS/TLS/API readiness for `https://www.ourfitmeet.cn` and
  `https://www.ourfitmeet.cn/api`.
- Warnings: Vercel/Railway preflight skipped for ECS topology, iOS TestFlight
  readiness skipped, Railway Docker build skipped for ECS topology.

2026-06-14 ECS production verification:

- Command:
  `BASE_URL=https://www.ourfitmeet.cn API_BASE_URL=https://www.ourfitmeet.cn/api FITMEET_LAUNCH_TOPOLOGY=ecs CHECK_LOCAL_COMPOSE_HEALTH=false CHECK_LOCAL_COMPOSE_LOGS=false scripts/verify-production.sh`.
- Passed: frontend, backend health, backend readiness, FitMeet core OpenAPI,
  public feed, release-critical OpenAPI paths, and payload shape checks.
- Passed: unauthenticated profile, Social Agent session, messages, and Agent
  manifest protection checks return 401.
- Skipped intentionally: token-protected Agent manifest, public social intent
  write/read-back, and remote App smoke.

2026-06-14 ECS deploy zip build with remote smoke evidence gate:

- Command:
  `RUN_BACKEND_DOCKER_BUILD_CHECK=false RUN_AGENT_BROWSER_QA=false bash scripts/build-deploy-zip.sh /tmp/fitmeet-ecs-deploy-agent-evidence.zip`.
- Passed: frontend ECS same-origin build and `check:prod-build`.
- Passed: Agent release verification inside the zip build.
- Passed: backend Agent route/stream/acceptance suite, including stranger
  candidate-pool safety and high-risk tool policy gates: 10 suites, 192 tests.
- Passed: frontend assistant-ui Agent unit suite: 5 files, 89 tests.
- Passed: backend production build.
- Passed: production Agent smoke seed dry-run from compiled JS.
- Passed: sanitized deploy tree staging, zip creation, zip scan, checksum, and
  installer helper generation.
- Output: `/tmp/fitmeet-ecs-deploy-agent-evidence.zip`.
- SHA256:
  `5acecf3aad4faa20634ac9698992b145c4a1caac2cf06a769a55714673d04672`.
- Independent zip audit: 3850 entries; required Agent release matrix,
  assistant-ui shell, backend smoke scripts, remote smoke preflight, and remote
  smoke evidence wrapper present; `.env.production`, SSL private keys, QA
  screenshots, legacy Agent pet, and legacy Agent shell CSS absent.
- Follow-up Docker gate command:
  `docker build -f backend/Dockerfile.prod backend -t fitmeet-backend-release-check:agent-evidence`.
- Passed: backend production Docker image build for the same worktree, including
  builder `pnpm install --frozen-lockfile`, Nest production build, runner
  `pnpm install --prod --frozen-lockfile`, and non-root upload directory
  preparation for `/tmp/fitmeet/uploads/temp` and `/app/public/uploads/temp`.

2026-06-14 ECS deploy zip rebuild after evidence-wrapper seed reuse fix:

- Command:
  `RUN_BACKEND_DOCKER_BUILD_CHECK=false RUN_AGENT_BROWSER_QA=false bash scripts/build-deploy-zip.sh /tmp/fitmeet-ecs-deploy-agent-evidence-fixed.zip`.
- Passed: frontend ECS same-origin build and `check:prod-build`.
- Passed: Agent release verification inside the zip build.
- Passed: backend Agent route/stream/acceptance suite, including stranger
  candidate-pool safety and high-risk tool policy gates: 10 suites, 192 tests.
- Passed: frontend assistant-ui Agent unit suite: 5 files, 89 tests.
- Passed: backend production build.
- Passed: production Agent smoke seed dry-run from compiled JS.
- Passed: sanitized deploy tree staging, zip creation, zip scan, checksum, and
  installer helper generation.
- Output: `/tmp/fitmeet-ecs-deploy-agent-evidence-fixed.zip`.
- SHA256:
  `599c4933eb6b07abdcb0bbeb58872be52f7c1a9862118d1d905ad0639ee452d4`.
- Independent zip audit: 3850 entries; required Agent release matrix,
  assistant-ui shell, backend smoke scripts, remote smoke preflight, and remote
  smoke evidence wrapper present; `.env.production`, SSL private keys, QA
  screenshots, legacy Agent pet, and legacy Agent shell CSS absent.
- Independent evidence-wrapper audit: package copy of
  `scripts/agent-remote-smoke-evidence.sh` contains
  `prepare_agent_smoke_seed_once`, parses `AGENT_SMOKE_EMAIL/PASSWORD/CITY`,
  exports `AGENT_SMOKE_ALLOW_MUTATIONS=true`, then reuses the same smoke account
  for readiness, full opportunity, and SSE abort smoke.
- Current recommended ECS deploy archive:
  `/tmp/fitmeet-ecs-deploy-agent-evidence-fixed.zip`.

2026-06-14 launch-status remote smoke evidence gate:

- Passed: `launch-status.sh` accepts a redacted evidence markdown containing
  readiness, full opportunity, and SSE abort sections with three successful
  `Exit code: 0` markers.
- Passed: `launch-status.sh` fails when
  `REQUIRE_AGENT_REMOTE_SMOKE_EVIDENCE=true` and
  `AGENT_REMOTE_SMOKE_EVIDENCE_FILE` points to a missing file.
- Passed: release audit covers the evidence gate variables and
  `validate_agent_remote_smoke_evidence` implementation.

2026-06-14 ECS deploy zip rebuild after launch-status evidence gate:

- Command:
  `RUN_BACKEND_DOCKER_BUILD_CHECK=false RUN_AGENT_BROWSER_QA=false bash scripts/build-deploy-zip.sh /tmp/fitmeet-ecs-deploy-agent-final-gate.zip`.
- Passed: frontend ECS same-origin build and `check:prod-build`.
- Passed: Agent release verification inside the zip build.
- Passed: backend Agent route/stream/acceptance suite, including stranger
  candidate-pool safety and high-risk tool policy gates: 10 suites, 192 tests.
- Passed: frontend assistant-ui Agent unit suite: 5 files, 89 tests.
- Passed: backend production build.
- Passed: production Agent smoke seed dry-run from compiled JS.
- Passed: sanitized deploy tree staging, zip creation, zip scan, checksum, and
  installer helper generation.
- Output: `/tmp/fitmeet-ecs-deploy-agent-final-gate.zip`.
- SHA256:
  `1232ee2bec662faf5cc584d67a6c6f4f9cc43da7a93fc89c98afd8cf29b89695`.
- Independent zip audit: 3850 entries; required Agent release matrix,
  assistant-ui shell, backend smoke scripts, remote smoke preflight, remote
  smoke evidence wrapper, and launch-status hard evidence gate present.
- Independent zip audit exclusions: `.env.production`, SSL private keys, QA
  screenshots, `artifacts/`, legacy Agent pet, and legacy Agent shell CSS
  absent.
- Independent launch-status audit: packaged `scripts/launch-status.sh` contains
  `REQUIRE_AGENT_REMOTE_SMOKE_EVIDENCE`,
  `AGENT_REMOTE_SMOKE_EVIDENCE_FILE`,
  `validate_agent_remote_smoke_evidence`, and `zero_exit_count`.
- Independent evidence-wrapper audit: packaged
  `scripts/agent-remote-smoke-evidence.sh` contains
  `prepare_agent_smoke_seed_once`, parses `AGENT_SMOKE_EMAIL/PASSWORD/CITY`,
  exports `AGENT_SMOKE_ALLOW_MUTATIONS=true`, and reuses the same prepared
  smoke account for readiness, full opportunity, and SSE abort smoke.
- Current recommended ECS deploy archive:
  `/tmp/fitmeet-ecs-deploy-agent-final-gate.zip`.

2026-06-15 remote smoke env template and preflight guard:

- Added `deploy/agent-smoke.remote.env.example` as the non-secret template for
  dedicated Agent smoke credentials, remote/mutation guards, readiness stop
  mode, and stable Opportunity journey knobs.
- The filled `deploy/agent-smoke.remote.env` remains gitignored and must not be
  packaged, shared, or used with a real user account.
- Deploy zip builders exclude the filled `deploy/agent-smoke.remote.env` during
  staging and still scan the final archive for it as a defense-in-depth check.
- Passed static release audit:
  `pnpm --dir frontend run check:agent-chat-release`.
- Passed shell syntax check:
  `bash -n scripts/agent-remote-smoke-preflight.sh scripts/agent-remote-smoke-evidence.sh scripts/ecs-post-deploy-smoke.sh scripts/build-deploy-zip.sh scripts/agent-release-matrix.sh scripts/verify-agent-release.sh`.
- Negative preflight without env confirms the remote gate blocks unsafe runs:
  missing `AGENT_SMOKE_ALLOW_REMOTE=true`, `AGENT_SMOKE_EMAIL` /
  `AGENT_SMOKE_PASSWORD`, and `AGENT_SMOKE_ALLOW_MUTATIONS=true`.
- Template-loaded preflight now fails without calling the API because
  `replace-with-dedicated-smoke-password` is an explicit placeholder.
- Template-loaded preflight passes only after overriding
  `AGENT_SMOKE_PASSWORD` with a non-placeholder dedicated smoke password.
- Positive guard check passed without calling the API:
  `AGENT_SMOKE_PASSWORD='smoke-preflight-only-2026-06-15' scripts/agent-remote-smoke-preflight.sh --readiness --api-base-url "$API_BASE_URL"`.
- Launch evidence validator can now be run directly with
  `scripts/launch-status.sh --validate-agent-remote-smoke-evidence-only`.
- Focused validator proof: a fake evidence file containing
  `AGENT_SMOKE_PASSWORD='[redacted]'`, `Authorization=[redacted]`, and
  `Bearer [redacted]` passes, while a fake evidence file containing
  `AGENT_SMOKE_PASSWORD='real-secret-value'` fails.
