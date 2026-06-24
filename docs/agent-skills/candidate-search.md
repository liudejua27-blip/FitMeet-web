# candidate_search_skill

## Purpose

Search only public, discoverable, safe candidate supply for the user's current
social/meet-up goal.

## Trigger

- Required match slots are completed.
- User asks to find people, candidates, partners, or friends.

## Candidate Sources

- Public profiles with discoverability enabled.
- Public social intents.
- Public activities and signups.
- Existing safe relationships or conversations.

## Forbidden Sources

- Private profiles.
- Hidden or closed users.
- Raw contact information.
- Unconsented precise location.
- Mock/fallback candidates in production.
- Admin/debug candidate-pool tools in user-facing or agent-token runtime
  registries.

## Tools

- `search_public_candidates`
- `search_public_activities`
- `apply_social_sandbox`

## Approval Rules

Search is read-only and usually does not need approval. Side effects after
search are delegated to approval-governed skills.

## Success Output

- `candidate_search.done`
- Candidate pool with real candidate ids and safe display fields

## Empty Result Fallback

If no real candidates are found, say that clearly and offer:

- publish or keep the OpportunityCard in Discover;
- expand city or distance;
- change time window;
- broaden activity or candidate preference.

Render this as `CandidateEmptyStateCard`, not `CandidateCards`. Empty results
are a recovery path, not a candidate list.

## Eval IDs

- `candidate_empty_safe_fallback`
- `candidate_search_no_mock_supply`
- `admin_debug_tools_hidden_from_user_runtime`
