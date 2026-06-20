# FitMeet Agent Skills

This folder defines the product skills used by FitMeet Social Codex Runtime.
They are not generic chat prompts. They are contracts for planner behavior,
tool routing, approval gates, memory writes, frontend Tool UI, and evals.

## Runtime Skill Order

The first production social/meet-up chain uses these skills:

1. `profile_onboarding_skill`
2. `social_intent_clarifier_skill`
3. `opportunity_card_skill`
4. `discover_publish_skill`
5. `candidate_search_skill`
6. `candidate_rank_skill`
7. `safety_approval_skill`
8. `invitation_skill`
9. `meet_loop_skill`
10. `life_graph_memory_skill`

Ordinary chat must not enter this chain unless the user explicitly expresses a
social, meet-up, activity, friend-making, candidate, or invite goal.

The canonical release workflow is defined in
[social-meetup-workflow.md](./social-meetup-workflow.md). It is the product
contract for thread/task/run/session behavior, profile gate scope, approvals,
empty candidate fallback, and release acceptance.

## Non-Negotiable Invariants

- Do not block ordinary chat with onboarding.
- Do not publish to Discover without explicit or previously granted publish consent.
- Do not contact, invite, connect, reveal precise location, or exchange contact
  information without an approval checkpoint.
- Do not ask again for completed task slots unless the user modifies them.
- Do not use mock candidates in production.
- Do not expose raw chain-of-thought, raw tool JSON, hidden planner state, or
  private Life Graph evidence in the chat UI.
- Empty candidate results must offer safe next steps instead of pretending there
  are matches.

## Shared Tool UI Types

- `SlotMemoryCard`
- `OpportunityCard`
- `CandidateCards`
- `CandidateEmptyStateCard`
- `ApprovalPanel`
- `MeetLoopTimeline`
- `LifeGraphDiffCard`

All tool outputs should follow [tool-contract.md](./tool-contract.md).

## Tool Examples

The canonical tool-call examples live in
[tool-examples.jsonl](./tool-examples.jsonl). Each record maps a user input or
task context to the expected skill, tool sequence, user-visible events, Tool UI
parts, approval policy, and forbidden behavior. These examples are release
guards, not mock data.

## Eval Matrix

The canonical local skill eval cases live in
[eval-cases.jsonl](./eval-cases.jsonl). They are checked by
`node scripts/verify-agent-skills.mjs` and executed by
`node scripts/run-agent-skill-evals.mjs`.

Use backend assertion mode before a serious release:

```bash
node scripts/run-agent-skill-evals.mjs --backend
```

Write a report artifact for release evidence:

```bash
node scripts/run-agent-skill-evals.mjs --backend --report .agent-eval-report.json
```

Use API modes when a local/staging backend and dedicated smoke credentials are
available:

```bash
node scripts/run-agent-skill-evals.mjs --api-readiness
node scripts/run-agent-skill-evals.mjs --api-sse-abort
RUN_AGENT_SKILL_EVAL_API=readiness bash scripts/verify-agent-release.sh
```

`--api-readiness` runs the real Agent opportunity smoke in
`AGENT_SMOKE_STOP_AFTER_OPPORTUNITIES=true` mode. It checks ordinary-chat
isolation, clarification, OpportunityCard readiness, and the correction-memory
path where a user updates candidate preference without losing the already
answered time/place/activity slots.
