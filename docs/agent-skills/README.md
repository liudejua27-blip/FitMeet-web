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
- `ApprovalPanel`
- `MeetLoopTimeline`
- `LifeGraphDiffCard`

All tool outputs should follow [tool-contract.md](./tool-contract.md).

## Eval Matrix

The canonical local skill eval cases live in
[eval-cases.jsonl](./eval-cases.jsonl). They are checked by
`node scripts/verify-agent-skills.mjs`.
