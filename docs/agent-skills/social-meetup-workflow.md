# FitMeet Social Meetup Workflow

This is the canonical first-release workflow for FitMeet Social Codex Runtime.
It is intentionally narrower than a generic assistant: ordinary chat stays chat,
and social execution begins only after the user expresses a clear meet-up,
friend-making, candidate, activity, or invitation goal.

## Runtime Relationship

- `thread`: the user-visible conversation. It is created only when the user
  clicks New chat or when no active thread exists.
- `task`: the current social or meet-up objective. A task is bound to one
  thread and owns slots, cards, candidates, approvals, and meet-loop state.
- `run`: one execution attempt inside a thread/task. A run emits
  `SocialAgentEventV2` and can pause at approval checkpoints.
- `session`: the restorable client view: active thread, active task, latest run,
  pending approvals, recent messages, and latest visible process status.

## Canonical Chain

```text
ordinary_chat
-> detect_social_intent
-> check_profile_gate
-> clarify_social_intent
-> create_opportunity_card
-> request_publish_approval
-> publish_public_intent
-> search_public_candidates
-> rank_candidates
-> generate_opener
-> request_invite_approval
-> send_invite
-> meet_loop
-> life_graph_writeback
```

## User-Visible Behavior

- Ordinary chat must answer naturally and must not trigger candidate search,
  Discover publication, invite sending, or profile gate blocking.
- Social intent must first reuse hydrated context: recent messages, task slots,
  Life Graph summary, pending approvals, and candidate actions.
- Missing required slots should produce one concise clarification question.
- Completed slots must not be asked again unless the user changes them.
- User corrections should update only the changed slot or public candidate
  preference. The Agent should acknowledge the correction, restate the known
  context, and continue from the same task instead of asking for time, activity,
  or location again.
- During execution, the UI should show one covering status such as
  `正在整理你的约练需求...`; detailed steps stay expandable.
- No raw chain-of-thought, raw JSON, planner internals, trace ids, private
  evidence, exact location, or contact data may be displayed in chat.

## Gate Rules

Profile gate blocks only social execution actions:

- candidate matching;
- Discover publication;
- sending messages or invites;
- connecting a candidate;
- exchanging contact details.

It must not block normal conversation, product questions, emotional support, or
general advice.

## Approval Rules

These actions must pause the run with `approval.required` before side effects:

- publish social request or OpportunityCard;
- send invite or candidate message;
- connect candidate;
- exchange contact information;
- reveal precise location;
- update sensitive profile facts;
- payment-related action.

Approval confirmation resumes the same checkpoint with an idempotency key.
Approval rejection must not execute the side effect and must produce a natural
assistant response.

## Empty Candidate Fallback

If candidate search returns no real public candidates, FitMeet must not invent people.
It should offer safe next steps:

- publish or keep the OpportunityCard in Discover;
- broaden city or distance;
- change time window;
- broaden activity or public candidate preference.

## Release Acceptance

A release is not considered ready unless these are true:

- a 20-turn social conversation preserves completed slots;
- three ordinary chat turns do not create three new threads;
- high-risk side effects emit approval checkpoints;
- empty candidates return safe fallback, not mock data;
- Discover cards use real detail links;
- meet-loop state can reach review and Life Graph writeback;
- `node scripts/run-agent-skill-evals.mjs --backend` passes.
