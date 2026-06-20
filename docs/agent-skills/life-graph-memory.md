# life_graph_memory_skill

## Purpose

Turn repeated or stable user preferences into governed Life Graph facts without
creating noisy or unsafe memory.

## Trigger

- User expresses a stable preference or boundary.
- Meet Loop completes and provides outcome feedback.
- Profile onboarding supplies durable public-safe facts.

## Must Not Write

- One-off filler such as "可以", "随便", "为什么".
- Private contact data.
- Exact address or precise coordinates.
- Private message content.
- Sensitive profile claims without confirmation.

## Tools

- `propose_life_graph_facts`
- `confirm_life_graph_write`
- `save_life_graph_fact`
- `revoke_life_graph_fact`

## Fact Contract

Each fact must have:

- key;
- display value;
- evidence count;
- confidence;
- sensitivity;
- write policy;
- expiry or retention rule;
- revoke/export/delete path.

## Success Output

- `LifeGraphDiffCard`
- `memory.saved` for low-risk auto-save
- `approval.required` or user confirmation for sensitive updates

## Eval IDs

- `stable_preference_saved_with_evidence`
- `one_off_noise_not_saved`
