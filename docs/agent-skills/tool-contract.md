# FitMeet Agent Tool Contract

Every Social Codex tool should satisfy this contract before it is exposed to
the planner, subagents, frontend Tool UI, or self-improve evals.

## Tool Metadata

```ts
type FitMeetAgentToolContract = {
  name: string;
  skillId: string;
  risk: "read" | "draft" | "approval_required" | "blocked";
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  sideEffect: "none" | "internal_write" | "external_write";
  idempotencyKeyRequired: boolean;
  auditRequired: boolean;
  approvalRequired: boolean;
  dryRunRequired: boolean;
  timeoutMs: number;
  retryPolicy: "none" | "safe_retry" | "checkpoint_resume_only";
  toolUiType:
    | "SlotMemoryCard"
    | "OpportunityCard"
    | "CandidateCards"
    | "CandidateEmptyStateCard"
    | "ApprovalPanel"
    | "MeetLoopTimeline"
    | "LifeGraphDiffCard"
    | "StatusOnly";
};
```

## Execution Order

```text
hydrate_context
-> detect_social_intent
-> profile_gate
-> slot_filling
-> tool dry-run
-> permission / sandbox check
-> approval checkpoint when needed
-> execute
-> observe
-> persist task memory and events
-> answer naturally
```

## Public-Safe Output Rules

- Never render raw JSON in chat.
- Never expose hidden reasoning, planner internals, provider names, internal
  trace ids, private evidence, contact data, exact location, or coordinates.
- Frontend message parts should receive schema-stable display payloads only.
- Debug payloads stay in backend logs/admin surfaces with redaction.

## Empty Result Rule

Tools that return zero useful real results must include:

- `emptyReason`;
- concise user-facing message;
- safe next actions;
- `CandidateEmptyStateCard` with publish / broaden / time-change recovery paths;
- no fake candidate/activity data.

## Approval Rule

High-risk tools must return an `ApprovalPanel` dry-run preview before execution.
Approval rejection must leave the task memory intact and must not execute the
side effect.
