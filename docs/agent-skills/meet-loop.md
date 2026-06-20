# meet_loop_skill

## Purpose

Track the social/meet-up lifecycle after a candidate or activity is selected.

## Trigger

Use this skill after a user confirms interest in a candidate, sends an invite,
receives a reply, proposes a reschedule, confirms a meetup, or submits feedback.

## States

1. `invite_drafted`
2. `invite_pending_approval`
3. `invite_sent`
4. `waiting_reply`
5. `reply_received`
6. `reschedule_proposed`
7. `activity_confirmed`
8. `activity_checked_in`
9. `activity_completed`
10. `review_submitted`
11. `life_graph_writeback`

## Tools

- `read_inbox`
- `resume_meet_loop`
- `reschedule_meet_loop`
- `confirm_activity`
- `submit_review`
- `write_life_graph_outcome`

## Approval Rules

- New invite/message/contact/location side effects always require approval.
- Check-in/review writes are user-owned actions and should be explicit.

## Success Output

- `MeetLoopTimeline`
- next safe action
- optional Life Graph writeback proposal

## Failure / Fallback

If reply or candidate state is stale, mark the step as skipped/non-retryable and
offer to retry later or broaden the search.

## Eval IDs

- `meet_loop_full_state_machine`
- `waiting_reply_missing_connection_no_error_loop`
