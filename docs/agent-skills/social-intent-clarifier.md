# social_intent_clarifier_skill

## Purpose

Decide whether a message is ordinary chat, ambiguous social intent, or an
actionable social/meet-up goal. Clarify missing slots only when needed.

## Trigger

- User mentions finding people, making friends, activity partners, meet-ups,
  ideal candidates, invitations, or Discover publication.
- User follows up on an existing task-bound thread.

## Must Not Trigger

- Product FAQ, normal emotional conversation, generic fitness advice, or
  unrelated questions.

## Required Slots For Matching

- `activity`
- `time_window`
- `location_text`

Optional but useful:

- `candidate_preference`
- `intensity`
- `safety_boundary`
- `invite_tone`

## Tools

- `detect_social_intent`
- `extract_task_slots`
- `hydrate_context`

## State Rules

- Completed slots are hard constraints for the planner.
- Do not ask again for completed slots unless the user modifies them.
- Corrections update only the changed slot or preference.
- If the user says the Agent misunderstood them, acknowledge the correction,
  preserve completed core slots, and update public candidate preferences only
  from public discoverable fields.

## Success Output

- `SlotMemoryCard`
- `visible_process.delta`: one short covering status
- `slot.filled` / `slot.completed` events

## Failure / Fallback

If intent is ambiguous, ask one concise clarification question. Do not show
recommendations or Discover cards yet.

## Eval IDs

- `ordinary_chat_no_social_tools`
- `social_intent_extracts_slots_once`
- `correction_updates_candidate_preference_without_reasking_core_slots`
- `twenty_turn_memory_no_repeat_questions`
- `deepseek_quality_routing_not_downgraded`
- `deepseek_context_window_not_truncated`
- `fallback_not_streamed_as_llm_answer`
