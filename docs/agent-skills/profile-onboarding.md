# profile_onboarding_skill

## Purpose

Collect the minimum safe profile information needed before FitMeet can match,
publish, invite, or message on behalf of a user.

## Trigger

- User is new or `profileCompleteness` is below the match threshold.
- User attempts a social execution action: match, publish, invite, connect, or message.
- User explicitly asks to complete their profile, answer a few questions, or
  supplement preferences.

## Must Not Trigger

- Ordinary chat, product questions, casual conversation, or general advice.
- Candidate recommendation, opener generation, invitation sending, or Discover
  publication before the profile gate has passed and the user has explicitly
  asked to continue.

## Required Slots

- `city_or_area`
- `activity_interests`
- `availability`
- `social_boundary`
- `publish_consent`

## Tools

- `check_profile_gate`
- `save_profile_gate_answers`
- `propose_life_graph_facts`

## Approval Rules

- Low-risk onboarding answers may be saved to task memory.
- Sensitive or long-term Life Graph facts require `life_graph_memory_skill`.
- Publishing consent only authorizes future low-risk Discover publication. It
  does not authorize precise location, contact exchange, invite sending, or payments.
- Durable profile writes must show a structured update preview first. The user
  may choose "保存", "修改后保存", "不保存", or "本次使用，不保存".
- Each onboarding turn asks one compact group of up to 3-5 high-value questions.
  Every question must support "暂不确定" or skip.

## Success Output

- `profileGate.passed`
- `taskSlots` updated
- `LifeGraphDiffCard` when durable memory is proposed
- A separate final prompt asking whether to start matching after profile
  completion; do not enter candidate recommendation without that consent.

## Failure / Fallback

If the user does not want to complete onboarding, continue ordinary chat and
explain that matching/publishing/inviting will remain unavailable.

## Eval IDs

- `profile_gate_new_user_minimum_questions`
- `ordinary_chat_not_blocked_by_profile_gate`
