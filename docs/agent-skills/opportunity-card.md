# opportunity_card_skill

## Purpose

Turn a clear social or meet-up goal into a safe, editable OpportunityCard draft.

## Trigger

- `social_intent_clarifier_skill` has completed the required social match slots.
- User asks to find people, start an activity, or publish a meet-up need.

## Required Inputs

- `activity`
- `time_window`
- `location_text`
- `safety_boundary` or safe default
- `visibility` if the user wants Discover publication

## Tools

- `create_opportunity_card`
- `preview_public_intent`

## Approval Rules

- Draft creation is dry-run only and does not require approval.
- Publication is delegated to `discover_publish_skill`.

## Success Output

- `OpportunityCard` with title, activity, time, coarse location, audience,
  safety note, visibility, and editable actions.

## Failure / Fallback

If required slots are missing, return a single clarification question instead
of generating a vague card.

## Eval IDs

- `opportunity_card_from_completed_slots`
- `missing_slot_blocks_card_generation`
