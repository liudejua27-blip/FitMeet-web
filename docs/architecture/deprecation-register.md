# Deprecation Register

Last updated: 2026-06-29

Legacy code may remain temporarily when it protects compatibility. Every legacy
entry must identify why it exists, who calls it, what must happen before
removal, and the target cleanup PR.

## Registration Template

```text
File or module:
Why it exists:
Current callers:
Removal prerequisites:
Target cleanup PR:
Owner:
```

## Registered Legacy Surfaces

### Agent legacy action log mapper

File or module:

- `backend/src/agent-gateway/agent-gateway-legacy-log.mapper.ts`
- `backend/src/agent-gateway/agent-gateway-legacy-log.mapper.spec.ts`

Why it exists: maps legacy action log shape into canonical Agent action log
shape during the audit-log transition.

Current callers: `AgentGatewayService` logging paths.

Removal prerequisites:

- `agent_action_logs` is the only write target for one production release.
- `agent_activity_logs` becomes read-only migration history or is removed.
- Admin/L5 diagnostics read canonical action logs.

Target cleanup PR: Agent action log canonicalization.

Owner: Backend / Agent Runtime.

### AgentGatewayService legacy social request compatibility methods

File or module: `AgentGatewayService` methods that return or accept legacy
frontend social-request shape while writing canonical `user_social_requests`.

Why it exists: keeps older frontend/API clients working during the public loop
contract migration.

Current callers: compatibility endpoints under Agent social request APIs.

Removal prerequisites:

- Frontend and Agent runtime consume canonical `user_social_requests` response.
- Deprecated endpoints are marked and no production traffic remains.
- Contract tests cover canonical response only.

Target cleanup PR: Social request API v1 canonicalization.

Owner: Backend / Frontend.

### AgentGatewayService random searchMatches placeholder

File or module: `AgentGatewayService.searchMatches()`.

Why it exists: compatibility fallback while candidate recall and scoring move to
the deterministic candidate index.

Current callers: legacy match/search compatibility paths.

Removal prerequisites:

- Candidate recall uses `CandidateSearchIndexService`.
- Candidate ranking uses deterministic scoring.
- No release path calls random placeholder matching.

Target cleanup PR: Candidate search compatibility removal.

Owner: Backend / Agent Runtime.

### `match_candidates` compatibility usage

File or module: database table family and code paths using `match_candidates`.

Why it exists: internal scratch compatibility table for legacy matching data.

Current callers: Agent/matching internals that have not fully migrated to
`social_request_candidates` and `candidate_search_index`.

Removal prerequisites:

- All production candidate reads use canonical candidate search/index tables.
- Migration path for existing scratch data is documented or intentionally
  discarded.
- Admin diagnostics no longer depend on `match_candidates`.

Target cleanup PR: Match candidate scratch-table retirement.

Owner: Backend / Data.
