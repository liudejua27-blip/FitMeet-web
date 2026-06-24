# discover_publish_skill

## Purpose

Publish an approved OpportunityCard to Discover as real public social intent or
meet-up data.

## Trigger

- User clicks publish or explicitly asks to publish.
- The OpportunityCard is complete.
- The user has first-time or current publish consent.

## Must Not Trigger

- Ordinary chat.
- Candidate search without publication request.
- Cards that contain exact address, contact information, private messages, or
  sensitive profile claims.

## Tools

- `publish_public_intent`
- `sync_discover_card`
- `read_discover_detail_link`

## Approval Rules

Publishing requires `approval.required` unless policy proves an existing
low-risk publish authorization and the card contains only public-safe fields.

## Success Output

- Discover detail link: `/meet/:id`, `/activity/:id`, `/social-request/:id`, or
  `/public-intent/:id`
- `OpportunityCard` published state

## Failure / Fallback

If publication is blocked or rejected, keep the draft in task memory and offer
safe edits.

## Eval IDs

- `publish_to_discover_requires_approval`
- `discover_card_has_real_detail_link`
