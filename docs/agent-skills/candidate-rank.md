# candidate_rank_skill

## Purpose

Rank public candidate results and explain why the top opportunities are useful
without exposing private data.

## Trigger

- `candidate_search_skill` returns one or more candidates.

## Ranking Inputs

- Shared public interests.
- Coarse city/area match.
- Time compatibility.
- Activity compatibility.
- Safety and trust indicators.
- User's explicit candidate preference when it is based on public fields.

## Tools

- `rank_candidates`
- `explain_candidate_match`

## Output

Exactly three candidates by default, unless fewer real public candidates exist.

Each candidate card must include:

- avatar or safe placeholder;
- public display name;
- public interests;
- coarse city/area;
- match reasons;
- safety boundary note;
- actions: save, skip, generate opener, request invite approval.

## Failure / Fallback

If explanations are weak, show only verified public facts and ask whether the
user wants to broaden filters.

## Eval IDs

- `candidate_top_three_with_reasons`
- `candidate_preference_uses_public_fields_only`
