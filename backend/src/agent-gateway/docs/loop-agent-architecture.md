# FitMeet Loop Agent Architecture

This gateway is moving from a legacy comprehensive Social Agent toward
controlled, loop-specific agents. The current production target is not a fully
autonomous agent. It is a controlled tool agent: the loop brain decides the next
safe step, backend tools execute side effects, and cards plus approvals keep the
user in control.

## Entry Ownership

User messages enter through `SocialAgentRouteEntranceService`, which creates or
restores the task and records the user message. `AgentEntryOrchestratorService`
then owns the split between new loop agents and the legacy fallback.

The intended order is:

```text
active workout task
  -> WorkoutLoopService continuation
new workout intent or accepted arbitration
  -> WorkoutLoopService entrance
profile intent
  -> ProfileLoop/Profile Nudge, non-blocking for workout
friend/travel intent
  -> FriendLoopService / TravelLoopService entrance
unknown/casual/old tasks
  -> LegacyAgentAdapterService
```

Profile completion is a nudge, not a gate. It can improve candidate quality but
must not block workout intake, draft creation, publication, or matching.

## Shared Loop Contract

The three product loops share a small contract in
`loop-agent/loop-agent.types.ts`:

- `LoopKind`: `workout`, `friend`, or `travel`
- `LoopStage`: intake, draft, matching, candidate, opener, send-confirmation,
  handoff, and terminal stages
- `LoopSlots`: shared side fields such as safety boundaries and visibility
- `LoopSlotMeta`: source/confidence metadata for slots that come from the user,
  rules, LLM understanding, geo resolution, memory, or defaults
- `LoopAgentDecisionBase`: the common shape for loop-brain decisions

Each loop owns its domain-specific required slots and card copy, but publication,
private matching jobs, realtime candidate return, opener generation, and approval
boundaries should continue to reuse shared gateway services.

## Workout Loop

The Workout loop is the first real loop-agent implementation. It uses:

- `WorkoutAgentBrainService` for entrance, continuation, location confirmation,
  and intake-submit decisions.
- `WorkoutUnderstandingService` for DeepSeek JSON understanding. It extracts
  workout slots and `locationMention`; it does not publish, match, or send.
- `GeoResolverService` and `AmapChinaGeoProviderService` for nationwide China
  POI/geocode resolution. AMap results can return multiple candidates.
- `WorkoutLoopService` to turn brain decisions into cards and deterministic
  route results.
- `SocialAgentDraftPublicationService`, `MatchingJobService`, and
  `SocialAgentMatchingJobProcessorService` for public and private matching.
- `SocialAgentCandidateActionService` and `WorkoutOpenerDraftService` for
  candidate actions, opener drafts, and approval-gated sends.

The minimal workout state path is:

```text
intake
  -> draft_ready
  -> matching_queued
  -> candidates_ready | no_candidates
  -> opener_ready
  -> message_confirming
  -> messages_handoff / waiting_reply
```

Public publish and private match both enter the durable matching-job path. A
private job does not create a public discover intent, but it is still recoverable
and auditable through the matching job, task memory, and realtime candidate
payload.

## Tool And Safety Boundaries

DeepSeek may understand intent, fill slots, and draft opener text. It must not
execute side effects. AMap may resolve location candidates, but the user must
confirm ambiguous locations before the system treats them as user-confirmed.

The backend remains the authority for:

- staging workout drafts
- publishing to Discover
- queueing public or private matching jobs
- generating candidate cards
- creating opener approvals
- sending messages after approval

High-risk actions such as sending an invite, private message, or connection
request must remain approval-gated.

## Legacy Boundary

The legacy comprehensive agent remains only for casual chat, explanations,
unknown fallback, and old task compatibility. New Workout, Friend, or Travel
main-flow logic must not be added to:

- `legacy-agent/legacy-agent-adapter.service.ts`
- `social-agent-main-agent-turn.service.ts`
- `fitmeet-alpha-agent-sdk.service.ts`
- `social-agent-route-search-turn.service.ts`
- `social-agent-route-action-turn.service.ts`
- old opportunity draft helpers

Those files are allowed to support legacy fallback until Friend and Travel loops
are implemented, but loop-specific behavior should be added under a loop module
or shared loop tool.

## Friend And Travel Loops

Friend and Travel now follow the card-driven loop template instead of returning
coming-soon placeholders. They have lightweight loop brains, dedicated loop
services, intake cards, draft cards, private matching jobs, and route/action
wiring. They are lighter than Workout because they do not yet have dedicated
LLM understanding or nationwide geo-confirmation, but they should keep using the
shared loop contract and the same durable matching, realtime, opener, and
approval boundaries.

## Next Loop Template

Friend and Travel should copy the loop contract, not the legacy agent:

```text
LoopRouter candidate
  -> loop brain
  -> intake card
  -> draft card
  -> public publish or private matching job
  -> candidate cards via realtime
  -> opener draft
  -> approval before send
```

Shared foundations should be reused: `GeoResolverService`, `MatchingJobService`,
candidate pool/index, realtime, approval, side-effect ledger, user-facing
sanitizer, and card action router.
