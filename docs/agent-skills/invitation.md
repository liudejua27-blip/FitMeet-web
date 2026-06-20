# invitation_skill

## Purpose

Generate safe opener drafts and send invitations only after user confirmation.

## Trigger

- User selects a candidate and asks to invite or message.
- User asks the Agent to write an opener.

## Tools

- `generate_opener`
- `preview_invite`
- `send_invite`
- `send_candidate_message`

## Inputs

- Candidate public card.
- OpportunityCard or current task slots.
- User's invite tone.
- Safety boundary.

## Approval Rules

- Draft generation is dry-run and does not send anything.
- Sending requires `approval.required`.
- Exact location/contact in opener is blocked unless the explicit corresponding
  approval flow is used.

## Success Output

- Opener preview.
- ApprovalPanel before sending.
- Sent state and Meet Loop handoff after confirmation.

## Failure / Fallback

If the candidate cannot be contacted safely, explain why and offer save,
broaden, or publish options.

## Eval IDs

- `opener_preview_without_side_effect`
- `send_invite_requires_confirmation`
- `deepseek_quality_routing_not_downgraded`
