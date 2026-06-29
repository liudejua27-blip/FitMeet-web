# FitMeet Core Data Model

Status: current core baseline for the cleaned Web + Agent product.

This file describes the tables that should remain in the rewritten baseline migration. Old page-only feature tables are removed from the core schema.

## Core Rule

New code should serve one of these product loops:

- Auth and user identity.
- Personal information and internal Life Graph memory.
- Agent chat, OpportunityCard publishing, candidate matching, approvals, reminders, and audit.
- Discover public intents and public-intent detail.
- Messages, friends, invitations, meets, activities, safety, uploads, waitlist, and necessary admin.

If a table does not support one of those loops, do not add it to the baseline.

## User And Profile

- `users`: account identity, auth-facing profile basics, and public profile fields.
- `user_social_profiles`: lightweight social profile used by `/agent/profile`, candidate matching, and `/user/:id`.
- `life_graph_*`: internal governed memory, proposals, audit, security requests, and signal scores. Life Graph is not a public page or brand surface.

## Agent Runtime

- `agent_profiles`, `agent_connections`, `agent_settings`, `agent_permissions`: Agent identity, grants, and policy.
- `agent_tasks`, `fitmeet_agent_runtimes`, `agent_run_checkpoints`: active chat/task runtime and checkpoint recovery.
- `agent_approval_requests`: inline confirmation queue for publish, invite, add friend, precise location, contact exchange, and sensitive profile updates.
- `agent_action_logs`: append-only audit for planned, pending, executed, rejected, and failed Agent actions.
- `social_agent_message_feedback`, `social_agent_reminders`, `social_agent_user_interest_events`, `social_agent_long_term_memory`: Agent quality and memory support.

## Discover And Matching

- `user_social_requests`: internal request/card created by the Agent when a user wants to find a partner or activity.
- `public_social_intents`: Discover-visible projection. Successful Agent publish must return `publicIntentId` and `discoverHref`.
- `candidate_search_index`: canonical searchable projection for discoverable profiles and public intents. Matching workers should recall candidates from this index before deterministic scoring.
- `social_request_candidates`: scored candidate result rows for one user request, including score version, explanation metadata, and downstream feedback state.
- `match_candidates`: legacy internal scratch table only when still referenced by Agent internals; do not expose it as a product surface. Production candidate ranking must not depend on this table.

## Communication And Meet Loop

- `conversations`, `messages`, `agent_message_events`: private message stream and Agent-originated message events.
- `friends`, `follows`, `contact_requests`: friend and connection flow.
- `meets`, `meet_participants`: agreed meetups and participation.
- `social_activities`, `activity_templates`, `activity_proofs`: activity lifecycle and completion evidence.

## Safety, Uploads, Waitlist, Admin

- `safety_*`, `user_blocks`, `verification_requests`, `emergency_contacts`: safety and privacy workflows.
- Uploads are filesystem/object-storage backed and should not require old content tables.
- `waitlist_*`, `invite_codes`: `/demo` and admin waitlist.
- `admin_rbac_*`: necessary admin permissions for `/admin/safety`, `/admin/waitlist`, and `/admin/agent-l5`.

## Removed Table Families

Do not recreate these unless the product page is explicitly restored:

- old content feed tables and supporting taxonomy tables.
- old standalone service-provider review tables.
- old group membership tables.
- standalone notifications REST/page tables. Internal message/reminder notification delivery can remain service-backed.
- developer capability demos and old external integration tables.
- runtime mock, seed-only, demo-only, or smoke-only tables.

## Migration Policy

`backend/src/database/migrations/1780000000000-CoreBaseline.ts` is a rewritten baseline for new databases. It is not meant to be run directly against the old production schema. Existing production data requires backup and a controlled migration/import into the new core schema.
