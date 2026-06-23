# FitMeet Agent Skills

This folder defines the product skills used by FitMeet Social Codex Runtime.
They are not generic chat prompts. They are contracts for planner behavior,
tool routing, approval gates, memory writes, frontend Tool UI, and evals.

## Runtime Skill Order

The first production social/meet-up chain uses these product skills:

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

These are workflow contracts, not one runtime subagent per file. The runtime is
kept to three execution agents:

- `Agent Brain`: ordinary chat, lightweight planning, and deterministic fitness
  calculations.
- `Life Graph Agent`: personal information completion and governed memory
  proposals.
- `Match Agent`: OpportunityCard publish, Discover sync, candidate
  recall/ranking, opener preview, invite/message/friend actions, and meet-loop
  state.

`FitMeet Main Agent` remains the orchestrator. It routes the turn, enforces
approval boundaries, and composes the user-visible answer. This keeps the
workflow testable without multiplying model calls for normal users.

Cost boundary:

- Ordinary chat uses `Agent Brain` only and should avoid profile hydration.
- `Agent Brain` gets at most 1 tool call and no retry.
- `Life Graph Agent` gets at most 2 tool calls and must stop at an update
  preview until the user confirms.
- `Match Agent` gets at most 3 tool calls and must reuse current task slots,
  cached results, and approved state before asking the model for more work.
- Workflow skills should reduce prompt size by providing deterministic routing
  and acceptance checks; they must not be treated as extra model agents.

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
- `PersonalProfileUpdateCard` (`life_graph.diff` schema)

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

When you need durable release evidence for the skill contracts, write a report
from the current eval runner:

```bash
node scripts/run-agent-skill-evals.mjs \
  --backend \
  --report artifacts/agent-release-evidence/agent-skill-eval.json
```

For deployed environments, use the production goal verifier with dedicated QA
credentials. It checks Discover supply, stale production copy, ordinary-chat
isolation, and the Agent browser QA path:

```bash
BASE_URL=https://www.ourfitmeet.cn \
API_BASE_URL=https://www.ourfitmeet.cn/api \
FITMEET_AGENT_BROWSER_QA_EMAIL='<qa-email>' \
FITMEET_AGENT_BROWSER_QA_PASSWORD='<qa-password>' \
bash scripts/verify-agent-goal-production.sh
```
