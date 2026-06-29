# FitMeet Agent Release Matrix

This matrix is the release gate for the current FitMeet Agent experience after
the page and API cleanup.

## Scope

- Primary surfaces: `/agent`, `/agent/chat`, `/agent/chat/:taskId`, and
  `/agent/profile`.
- Required user flows: ordinary chat, profile completion, OpportunityCard draft,
  publish confirmation, Discover visibility, candidate recommendation, invite,
  friend request, private message, `/public-intent/:id`, and `/user/:id`.
- Hidden support surfaces: `/messages`, `/privacy`, `/terms`,
  `/forgot-password`, `/admin/safety`, `/admin/waitlist`, and `/admin/agent-l5`.
- Life Graph remains an internal profile/memory capability. It is not a
  standalone product page.

## Required Gates

| Gate | Command | Evidence |
| --- | --- | --- |
| Frontend lint | `pnpm --dir frontend lint` | Route and UI code passes lint after deleted pages are removed. |
| Frontend build | `pnpm --dir frontend build` | Production bundle has no Agent mock chunk and no removed route chunks. |
| Backend lint | `pnpm --dir backend lint` | Core API modules compile under lint without removed controller imports. |
| Backend build | `pnpm --dir backend build` | Core Nest modules, Agent gateway, messages, friends, safety, uploads, waitlist, and admin compile. |
| Agent release verification | `bash scripts/verify-agent-release.sh` | Agent contract specs, critical backend Jest specs, frontend Agent tests, and browser QA run from one entrypoint. |
| Production verification | `BASE_URL=https://www.ourfitmeet.cn API_BASE_URL=https://www.ourfitmeet.cn/api scripts/verify-production.sh` | Health, readiness, public social intents, Discover data, auth guards, and core OpenAPI paths pass. |
| Production goal verification | `BASE_URL=https://www.ourfitmeet.cn API_BASE_URL=https://www.ourfitmeet.cn/api scripts/verify-agent-goal-production.sh` | Discover has real public intents, production copy is not fake, and optional Agent browser QA can run with dedicated QA credentials. |
| Release matrix | `scripts/agent-release-matrix.sh --build` | Runs worktree audit, Agent release verification, and frontend/backend builds. |
| Deploy package | `scripts/build-deploy-zip.sh` | Package contains current frontend dist, backend dist, core scripts, and no deleted runtime smoke files. |

## Core Product Proof

- Ordinary chat must stay ordinary and must not auto-expand old tasks.
- Natural language publish intent must route to OpportunityCard publish action.
- Find-partner requests must generate an OpportunityCard before candidate cards.
- Published cards must return `discoverHref` and `publicIntentId`.
- Discover cards must open `/public-intent/:id`, not legacy social request pages.
- Candidate cards must show conclusion, reason, safety hint, and next actions.
- Draft or pending cards must show publish, edit, and skip actions.
- High-risk actions must require inline confirmation before side effects.
- Personal information is accessed from the Agent left-bottom profile entry, not
  from separate legacy profile pages.

## Removed Release Artifacts

The previous standalone runtime seed, remote evidence, and mock smoke harnesses
are no longer part of the release path. Use Jest/Vitest/browser QA plus the
production verification scripts instead.
