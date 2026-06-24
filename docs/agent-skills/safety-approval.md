# safety_approval_skill

## Purpose

Stop high-risk social actions at a clear approval checkpoint before any external
side effect happens.

## Trigger

Any of these actions:

- publish social request;
- send invite or message;
- connect candidate;
- exchange contact;
- reveal precise location;
- update sensitive profile;
- payment-related action.

## Tools

- `request_approval`
- `resume_checkpoint`
- `reject_checkpoint`
- `write_audit_log`

## Approval Panel Must Show

- action summary;
- who can see the result;
- risk level;
- dry-run preview;
- idempotency key;
- confirm, modify, cancel.

## Runtime Rules

- Approval is a first-class lifecycle node.
- User confirmation resumes the same checkpoint.
- Rejection must not execute the side effect.
- Retry and replay must not double-send or double-publish.
- Admin/debug tools are not approval-upgradable from user-facing surfaces; they
  stay behind RBAC debug controllers and must not appear in normal tool
  registries.

## Eval IDs

- `invite_requires_approval_checkpoint`
- `approval_reject_prevents_side_effect`
- `approval_resume_is_idempotent`
- `fallback_not_streamed_as_llm_answer`
- `admin_debug_tools_hidden_from_user_runtime`
