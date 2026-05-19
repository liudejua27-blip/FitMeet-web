# FitMeet Social Skills for OpenClaw and External Agents

Version: `v1.0-draft`
Status: Enterprise design spec
Primary goal: allow OpenClaw, custom agents, and partner agents to submit user social intent to FitMeet, receive FitMeet-owned matching results, ask the owner for confirmation, and let FitMeet safely execute the connection workflow.

## 1. Product Principle

FitMeet social-skills are not a free-form chat plugin. They are a permissioned social operating layer.

FitMeet is the matching network and social graph. OpenClaw is the user's local delegate. OpenClaw should not own matching, ranking, safety decisions, or contact exchange. It should collect the owner's need, submit it to FitMeet, show FitMeet's results, and return the owner's decision.

The core loop is:

```text
Owner tells OpenClaw a need
OpenClaw submits structured SocialIntent to FitMeet
FitMeet creates a SocialRequest and runs platform matching
FitMeet returns ranked candidates, reasons, and risk level
OpenClaw asks the owner whether to accept a candidate/action
FitMeet executes the bounded intro, chat, or contact request
Both sides consent before contact exchange or offline meeting
All actions are logged and risk-scored
```

Hard rule: external agents may submit intent and relay owner decisions, but FitMeet owns matching, social graph access, safety ranking, private data boundaries, and connection execution. Agents must not bypass FitMeet for contact exchange, offline meetings, payments, sensitive photos, relationship commitments, or high-risk contexts.

## 2. Actors

`Owner`: the FitMeet user who authorized an agent.

`Agent`: OpenClaw, Codex, Hermes, QClaw, Doubao, Qwen, Claude, GPT, or a custom agent using FitMeet APIs.

`Candidate`: a FitMeet user returned by a search or match operation.

`Counterparty Agent`: an agent acting for the candidate.

`FitMeet Safety Supervisor`: platform safety layer that risk-scores actions and may warn, block, freeze, or escalate.

`Merchant/Service Provider`: a future entity that can expose services to agents.

## 3. Integration Modes

### 3.1 API Token Mode

OpenClaw registers through FitMeet and receives an `X-Agent-Token`.

Use for:

- Self-hosted agents
- Scripted agents
- Server-to-server workflows
- Early MVP OpenClaw integration

Header:

```http
X-Agent-Token: fm_agent_xxx
Content-Type: application/json
```

### 3.2 OAuth Agent Mode

Future enterprise mode for third-party platforms.

Use for:

- Marketplace agents
- Enterprise user bases
- Scoped delegated access
- Token rotation and audit requirements

Required OAuth scopes map directly to FitMeet capabilities.

### 3.3 Lab Mode

Sandbox mode for agent-to-agent experiments. No real user contact.

Use for:

- Skill testing
- Prompt calibration
- Agent negotiation simulations
- Safety evaluation

## 4. Permission Model

### 4.1 Permission Levels

`read_only`

- Can read owner preferences.
- Can search candidates.
- Cannot create tasks or messages.

`draft_mode`

- Can create social requests.
- Can search candidates.
- Can draft posts/messages.
- Cannot send messages without owner confirmation.

`assisted_mode`

- Can create tasks.
- Can search.
- Can draft and request sending.
- Every outbound action requires owner confirmation.

`limited_auto`

- Can perform low-risk automatic actions within daily limits.
- High-risk actions still require confirmation.
- Must obey rate limits and safety supervisor decisions.

`lab_mode`

- Can only run sandbox social experiments.
- Cannot contact real users.

### 4.2 Capability Scopes

Current and proposed scopes:

```json
[
  "profile.read_preferences",
  "profile.update_preferences",
  "social_request.create",
  "social_request.read",
  "nearby.search_people",
  "match.search",
  "message.draft",
  "message.send",
  "contact.request",
  "approval.read",
  "activity.read",
  "risk.report",
  "lab.chat"
]
```

FitMeet internal mapping:

```json
{
  "social_request.create": "create_social_request",
  "nearby.search_people": "search_profiles",
  "match.search": "search_profiles",
  "message.draft": "generate_message",
  "message.send": "send_message",
  "contact.request": "contact_request",
  "lab.chat": "lab_chat"
}
```

## 5. Skill Manifest

Each agent should receive a machine-readable manifest.

Endpoint:

```http
GET /api/agent/skills/manifest
```

Response:

```json
{
  "name": "fitmeet-social-skills",
  "version": "1.0.0",
  "platform": "fitmeet",
  "agent_compatibility": ["openclaw", "custom", "codex", "qclaw", "hermes"],
  "auth": {
    "type": "agent_token",
    "header": "X-Agent-Token"
  },
  "principles": [
    "fitmeet_owns_matching_and_safety_ranking",
    "external_agents_submit_intents_not_raw_search_decisions",
    "human_confirmation_for_risky_actions",
    "privacy_by_default",
    "safe_profile_data_only",
    "audit_every_agent_action"
  ],
  "skills": [
    {
      "name": "submit_social_intent",
      "method": "POST",
      "path": "/api/agent/social-intents",
      "scope": "social_request.create",
      "risk": "contextual",
      "owner": "fitmeet_matching_engine"
    },
    {
      "name": "get_match_results",
      "method": "GET",
      "path": "/api/agent/social-requests/{id}/matches",
      "scope": "social_request.read_matches",
      "risk": "low"
    },
    {
      "name": "confirm_candidate_decision",
      "method": "POST",
      "path": "/api/agent/social-requests/{id}/candidates/decision",
      "scope": "social_request.confirm_candidate",
      "risk": "medium_to_high",
      "requires_owner_confirmation": true
    },
    {
      "name": "draft_private_message",
      "method": "POST",
      "path": "/api/agent/messages/draft",
      "scope": "message.draft",
      "risk": "low"
    },
    {
      "name": "send_private_message",
      "method": "POST",
      "path": "/api/agent/messages/send",
      "scope": "message.send",
      "risk": "medium",
      "requires_approval_unless": "limited_auto_low_risk"
    },
    {
      "name": "get_agent_inbox_events",
      "method": "GET",
      "path": "/api/agent/inbox/events",
      "scope": "agent_inbox.read",
      "risk": "low",
      "background_poll": {
        "enabled_by_default": true,
        "interval_seconds": 60,
        "silent_when_empty": true
      }
    },
    {
      "name": "generate_ai_profile_draft",
      "method": "POST",
      "path": "/api/agent/owner/social-profile/ai-draft",
      "scope": "profile.update_preferences",
      "risk": "low",
      "owner": "fitmeet_profile_builder",
      "description": "OpenClaw submits owner interview answers and receives a structured AI persona card draft. The draft must be shown to the owner before saving."
    },
    {
      "name": "save_ai_profile_draft",
      "method": "POST",
      "path": "/api/agent/owner/social-profile/ai-save",
      "scope": "profile.update_preferences",
      "risk": "medium",
      "requires_owner_confirmation": true,
      "description": "Save an owner-confirmed AI persona card and optionally enable profile-based matching even when no social request has been posted."
    },
    {
      "name": "request_contact_exchange",
      "method": "POST",
      "path": "/api/agent/contact/request",
      "scope": "contact.request",
      "risk": "high",
      "requires_approval": true
    }
  ]
}
```

## 6. Core Data Schemas

### 6.1 SocialRequest

The SocialRequest is the main task card.

```json
{
  "request_id": "sr_10001",
  "owner_user_id": "fm_user_10001",
  "agent_connection_id": "agent_20001",
  "request_type": "fitness_partner",
  "title": "寻找附近约练搭子",
  "description": "用户想找附近5公里今晚可以一起健身的人。",
  "location": {
    "city": "Shanghai",
    "loc": "静安寺附近",
    "lat": 31.224,
    "lng": 121.469,
    "radius_km": 5
  },
  "time_preference": "today_evening",
  "visibility": "matched_users_only",
  "filters": {
    "verified_only": true,
    "interests": ["fitness", "running"],
    "age_min": 18,
    "age_max": 45,
    "accept_agent_messages": true
  },
  "risk": {
    "level": "medium",
    "reasons": ["offline_meeting"],
    "requires_user_confirmation": true
  },
  "status": "matched",
  "matched_count": 4,
  "created_at": "2026-05-09T10:00:00Z"
}
```

### 6.2 Candidate Profile

Agents must only receive safe candidate data.

Allowed:

```json
{
  "id": 20002,
  "name": "Alex",
  "avatar": "A",
  "color": "#16C784",
  "age": 26,
  "city": "Shanghai",
  "bio": "喜欢跑步和城市漫步",
  "verified": true,
  "interest_tags": ["running", "coffee", "photography"]
}
```

Blocked by default:

- Phone number
- WeChat
- Email
- Exact home address
- ID details
- Private preference raw text
- Sensitive emotional disclosures
- Precise real-time location unless explicitly granted

### 6.3 Approval Request

```json
{
  "approval_request_id": 90001,
  "type": "send_message",
  "status": "pending",
  "agent_rationale": "OpenClaw wants to send a polite fitness invitation.",
  "payload": {
    "recipient_user_id": 20002,
    "text": "你好，我的主人今晚想找一个节奏稳定的健身搭子。你有兴趣先站内聊聊吗？"
  },
  "expires_at": "2026-05-10T10:00:00Z"
}
```

## 7. Skill APIs

### 7.1 Read Owner Preferences

```http
GET /api/agent/profile/preferences
```

Use this before creating a request.

Returns:

```json
{
  "relationshipGoal": "fitness_buddy",
  "idealPartnerDescription": "节奏稳定、有边界感",
  "privacyBoundaries": {
    "noPhotoSharing": true,
    "noContactExchangeWithoutApproval": true
  },
  "agentMessagingEnabled": true,
  "acceptAgentMessages": true
}
```

### 7.2 Create Social Request

```http
POST /api/agent/social-intents
```

Preferred OpenClaw entrypoint. OpenClaw submits the owner's social intent; FitMeet creates the task card, matches candidates, ranks them, risk-scores the request, and returns a handoff package.

Input:

```json
{
  "requestType": "dog_walking",
  "description": "我的主人今晚想找附近能一起遛狗的人，希望对方也喜欢宠物。",
  "city": "Shanghai",
  "loc": "徐汇滨江",
  "radiusKm": 3,
  "timePreference": "today_evening",
  "verifiedOnly": true,
  "interests": ["pet", "dog"],
  "limit": 8
}
```

Output:

```json
{
  "request": {
    "id": 123,
    "requestType": "dog_walking",
    "title": "寻找附近遛狗搭子",
    "riskLevel": "medium",
    "status": "matched",
    "matchedCount": 3,
    "requiresUserConfirmation": true
  },
  "candidates": [
    {
      "profile": {
        "id": 20002,
        "name": "Mia",
        "city": "Shanghai",
        "verified": true,
        "interestTags": ["pet", "walking"]
      },
      "score": 82,
      "reasonTags": ["same_city", "verified", "interest_pet"],
      "reasonText": "同在Shanghai，已完成认证，兴趣重合：pet，建议先发送礼貌邀约并等待对方确认。",
      "nextAction": "draft_invitation"
    }
  ],
  "matchedBy": "fitmeet_matching_engine",
  "handoff": {
    "openClawNextStep": "present_results_to_owner",
    "ownerDecisionEndpoint": "/api/agent/social-requests/123/candidates/decision",
    "allowedDecisions": ["approve", "reject"],
    "allowedConnectionActions": ["none", "send_intro", "request_contact_exchange"]
  }
}
```

### 7.3 Get Match Results

```http
GET /api/agent/social-requests/{id}/matches
```

Use when OpenClaw needs to refresh or poll FitMeet-produced matching results. The result shape is the same as `submit_social_intent`.

### 7.3.1 Public Hall Search

Tokenless agents may read the public FitMeet hall and search public social intents. This is the supported path for Codex, OpenClaw, or downloaded skills that need to check whether the owner's request already matches visible public demand.

```http
GET /api/public/social-intents?q={keyword}&city={city}&requestType={type}&status={status}&page=1&limit=30
GET /api/public/social-intents/{publicIntentId}
GET /api/public/social-intents/{publicIntentId}/matches
```

Rules:

- Public search returns only public intent fields, safe counts, and FitMeet-generated match summaries.
- Public mode can submit intent, read public intents, and refresh public matches.
- Public mode cannot send messages, exchange contacts, read long-term owner preferences, or manage history.
- Authorized token mode should be used for deep personalization and owner-specific automation.

### 7.4 Confirm Candidate Decision

```http
POST /api/agent/social-requests/{id}/candidates/decision
```

OpenClaw calls this only after showing FitMeet's results to the owner and receiving explicit approval or rejection.

Input:

```json
{
  "candidateUserId": 20002,
  "decision": "approve",
  "connectionAction": "send_intro",
  "ownerConfirmed": true,
  "note": "Owner agreed to say hello inside FitMeet."
}
```

Output:

```json
{
  "status": "intro_sent",
  "requestId": 123,
  "candidateUserId": 20002,
  "source": "fitmeet_connection_orchestrator",
  "riskScore": 0.1,
  "conversationId": "665f..."
}
```

### 7.5 Draft Message

```http
POST /api/agent/messages/draft
```

Input:

```json
{
  "type": "message",
  "recipientUserId": 20002,
  "context": "Owner wants a dog walking partner near Xuhui Riverside tonight.",
  "tone": "warm"
}
```

Output:

```json
{
  "draft": {
    "content": "你好，我的主人今晚想找附近一起遛狗的搭子。你有兴趣先在 FitMeet 站内聊聊吗？"
  },
  "riskScore": 0.1
}
```

### 7.6 Send Message

```http
POST /api/agent/messages/send
```

Legacy/direct mode. For the main OpenClaw social-skills flow, prefer `confirm_candidate_decision` so FitMeet executes the bounded connection action after owner approval.

Without approval:

```json
{
  "recipientUserId": 20002,
  "text": "你好，我的主人今晚想找附近一起遛狗的搭子。你有兴趣先站内聊聊吗？"
}
```

If permission level is not `limited_auto`, FitMeet returns:

```json
{
  "status": "pending_approval",
  "approvalRequestId": 90001
}
```

After owner approves, agent retries with:

```json
{
  "recipientUserId": 20002,
  "text": "你好，我的主人今晚想找附近一起遛狗的搭子。你有兴趣先站内聊聊吗？",
  "approvalRequestId": 90001
}
```

Success:

```json
{
  "status": "sent",
  "source": "ai_delegate",
  "riskScore": 0.1,
  "conversationId": "665f...",
  "message": {
    "id": "6660...",
    "text": "你好，我的主人今晚想找附近一起遛狗的搭子。你有兴趣先站内聊聊吗？",
    "source": "ai_delegate"
  }
}
```

### 7.7 Request Contact Exchange

```http
POST /api/agent/contact/request
```

Use only after both sides show interest.

Input:

```json
{
  "targetUserId": 20002,
  "note": "双方已经在站内聊过，主人希望交换联系方式。"
}
```

Output:

```json
{
  "status": "pending_target_consent",
  "contactRequestId": 50001
}
```

## 8. OpenClaw Skill Adapter

OpenClaw should expose these callable tools to its own reasoning loop:

```json
[
  {
    "name": "fitmeet_read_owner_preferences",
    "description": "Read the owner's FitMeet social preferences and privacy boundaries."
  },
  {
    "name": "fitmeet_submit_social_intent",
    "description": "Submit the owner's natural-language social need to FitMeet for platform-owned matching."
  },
  {
    "name": "fitmeet_get_match_results",
    "description": "Read candidates produced and ranked by the FitMeet matching engine."
  },
  {
    "name": "fitmeet_confirm_candidate_decision",
    "description": "Submit the owner's approve/reject decision and requested bounded connection action."
  },
  {
    "name": "fitmeet_request_contact_exchange",
    "description": "Ask FitMeet to mediate contact exchange after mutual consent."
  },
  {
    "name": "fitmeet_read_activity_log",
    "description": "Read recent actions the agent performed for transparency."
  }
]
```

Recommended OpenClaw system instruction:

```text
You are acting as the owner's social delegate inside FitMeet.
Before submitting intent, ask only for missing details needed to keep the request safe:
location scope, time, scenario type, hard boundaries, and confirmation rules.
Never ask for or reveal phone, WeChat, email, address, real-time location, payment, or sensitive identity data unless FitMeet returns an explicit approval workflow.
For offline, alcohol, travel, emergency, or payment scenarios, prefer verified users, public places, and human confirmation.
Do not independently rank or expose people outside FitMeet. Show FitMeet's candidates and reasons to the owner, then send the owner's decision back to FitMeet.
```

## 9. Scenario Mapping

### 9.1 Nearby Fitness Partner

`requestType`: `fitness_partner`

Default risk: `low` to `medium`

Required filters:

- Same city
- Interest overlap
- Time availability
- Optional verified users

Suggested message:

```text
你好，我的主人正在找一个节奏稳定的约练搭子。你最近有兴趣先在 FitMeet 上聊聊训练时间吗？
```

### 9.2 Offline Friend

`requestType`: `offline_friend`

Default risk: `medium`

Required safeguards:

- Public location
- No contact exchange before chat
- Owner confirmation before meet

### 9.3 Dog Walking Partner

`requestType`: `dog_walking`

Default risk: `medium`

Required safeguards:

- Pet-related interest tags
- Public walking route
- No private address exposure

### 9.4 Bar Friend

`requestType`: `bar_friend`

Default risk: `high`

Required safeguards:

- Verified users only by default
- Public venue only
- Prefer group setting
- Safety reminder required
- No intoxication-related pressure

### 9.5 Travel Partner

`requestType`: `travel_partner`

Default risk: `medium` to `high`

Required safeguards:

- Public itinerary
- No hotel/address sharing
- Prefer verified users
- Emergency contact reminder

### 9.6 Photo Partner

`requestType`: `photo_partner`

Default risk: `medium`

Required safeguards:

- Public place
- No sensitive photo requests
- No private album exchange before trust

## 10. Risk Engine

Risk inputs:

- Request type
- Natural-language description
- Offline / alcohol / travel / emergency / payment flags
- Candidate verification status
- Message text
- Contact exchange attempt
- Frequency and repetition
- Recipient opt-out
- Prior reports and blocks

Risk levels:

`low`

- Online chat
- Fitness recommendation
- Public non-sensitive interests

`medium`

- Offline meeting
- Travel
- Pet meetup
- Photo meetup
- One-on-one activity

`high`

- Alcohol
- Emergency
- Payment
- Contact exchange
- Sensitive photos
- Romantic commitment
- Requests to bypass FitMeet

Actions by risk:

```json
{
  "low": ["allow", "log"],
  "medium": ["allow_with_warning", "require_owner_confirmation", "log"],
  "high": ["require_confirmation", "prefer_verified_only", "safety_prompt", "log", "possible_manual_review"]
}
```

## 11. Consent Rules

Must require owner confirmation:

- Sending first outbound message unless permission allows limited low-risk automation
- Sharing contact information
- Accepting offline meet
- Joining paid activity
- Making payment
- Sending private photos
- Making relationship or contract commitments
- Contacting high-risk candidate

Must require target consent:

- Contact exchange
- Offline meeting
- Joining private group
- Receiving repeated agent messages

## 12. Webhooks

Agents may provide `agentWebhookUrl` during registration.

Events:

```json
[
  "approval.created",
  "approval.approved",
  "approval.rejected",
  "message.received",
  "agent.inbox.updated",
  "message.created",
  "match.completed",
  "contact.request.received",
  "contact.request.accepted",
  "contact.request.declined",
  "social_request.match.recommended",
  "safety.blocked",
  "daily_limit.near_exhausted"
]
```

Webhook payload:

```json
{
  "event": "approval.approved",
  "event_id": "evt_10001",
  "created_at": "2026-05-09T10:10:00Z",
  "agent_connection_id": 20001,
  "user_id": 10001,
  "data": {
    "approval_request_id": 90001,
    "type": "send_message"
  },
  "signature": "hmac_sha256..."
}
```

Security:

- HMAC signature required
- Timestamp tolerance: 5 minutes
- Idempotency key: `event_id`
- Retry: exponential backoff for 24 hours
- Webhook delivery is realtime best effort. OpenClaw should still run the default 30-60 second `GET /api/agent/inbox/events?unreadOnly=true&limit=20` heartbeat task and stay silent when no unread events are returned. After reporting returned events to the owner, call `POST /api/agent/inbox/events/ack` with their event ids so they are not reported again.

## 13. Error Codes

```json
{
  "AGENT_TOKEN_MISSING": "Missing or malformed X-Agent-Token",
  "AGENT_TOKEN_INVALID": "Invalid agent token",
  "AGENT_REVOKED": "Agent connection is revoked",
  "PERMISSION_DENIED": "Agent lacks permission",
  "DAILY_LIMIT_REACHED": "Daily agent action limit reached",
  "OWNER_CONFIRMATION_REQUIRED": "This action requires owner approval",
  "RECIPIENT_AGENT_MESSAGES_DISABLED": "Recipient has disabled agent messages",
  "SAFETY_BLOCKED": "Message blocked by safety filter",
  "CONTACT_CONSENT_REQUIRED": "Target user consent is required",
  "VALIDATION_FAILED": "Payload failed schema validation"
}
```

Recommended error response:

```json
{
  "error": {
    "code": "OWNER_CONFIRMATION_REQUIRED",
    "message": "Owner approval is required before sending this message.",
    "approvalRequestId": 90001,
    "retryable": true
  }
}
```

## 14. Rate Limits

Suggested enterprise defaults:

Per agent:

- `search`: 100/day
- `create_social_request`: 30/day
- `draft_message`: 100/day
- `send_message`: 20/day
- `contact_request`: 10/day

Per target user:

- Max 2 first-contact agent messages per 24 hours from same owner
- Max 5 total agent-origin first-contact messages per day

High-risk contexts:

- `bar_friend`: max 3/day
- `travel_partner`: max 5/day
- `contact_request`: always confirmation-gated

## 15. Audit Log

Every agent action must log:

```json
{
  "agent_connection_id": 20001,
  "user_id": 10001,
  "action": "create_social_request",
  "result": "success",
  "risk_score": 0.3,
  "payload": {
    "request_type": "dog_walking",
    "request_id": 123,
    "result_count": 3
  },
  "created_at": "2026-05-09T10:00:00Z"
}
```

User-facing activity text should be understandable:

```text
OpenClaw created a dog walking task card and found 3 candidates.
OpenClaw requested approval to send a message to Mia.
FitMeet blocked one message because it attempted to share external contact info.
```

## 16. Enterprise SDK Shape

Recommended TypeScript SDK:

```ts
const fitmeet = new FitMeetSocialSkills({
  baseUrl: 'https://fitmeet.example.com/api',
  agentToken: process.env.FITMEET_AGENT_TOKEN,
  agentName: 'openclaw',
});

const prefs = await fitmeet.profile.readPreferences();

const task = await fitmeet.submitSocialIntent({
  requestType: 'fitness_partner',
  description: 'Owner wants a fitness partner near Jing An tonight.',
  city: 'Shanghai',
  radiusKm: 5,
  verifiedOnly: true,
});

// OpenClaw shows FitMeet's ranked result to the owner.
const chosen = task.candidates[0];

const result = await fitmeet.confirmCandidateDecision(task.request.id, {
  candidateUserId: chosen.profile.id,
  decision: 'approve',
  connectionAction: 'send_intro',
  ownerConfirmed: true,
});
```

## 17. Versioning

API path versioning:

```text
/api/v1/agent/social-requests
/api/v1/agent/nearby/search
```

Current MVP paths may remain unversioned during development:

```text
/api/agent/social-requests
/api/agent/nearby/search
```

Breaking changes require:

- New major version
- 90-day deprecation window
- Manifest version update
- SDK compatibility note

## 18. OpenAPI and Developer Portal Requirements

Developer portal should include:

- Agent registration
- Token rotation
- Scope management
- Interactive API docs
- Skill manifest download
- Webhook settings
- Test sandbox
- Activity logs
- Safety event logs
- Quota dashboard
- SDK examples

## 19. MVP Implementation Checklist

Already available or started:

- Agent registration
- Agent token auth
- Permission levels
- User preferences
- SocialRequest creation
- Nearby candidate search
- Draft message
- Real message delivery through station chat
- Approval request flow
- Activity log
- Basic risk scoring

Next implementation steps:

- Add `/api/agent/skills/manifest`
- Add formal error codes
- Keep webhook delivery, HMAC signing, ack semantics, and the 30-60 second inbox event heartbeat documented together
- Add target consent response for contact requests
- Add per-target anti-spam throttles
- Add precise geospatial search
- Add OpenAPI schema generation
- Add TypeScript SDK package
- Add OpenClaw adapter examples
- Add enterprise developer portal page

## 20. Reference OpenClaw Flow

Owner says:

```text
帮我找附近能一起遛狗的人，今晚 8 点左右，最好是实名认证用户。
```

OpenClaw:

1. Reads owner preferences.
2. Submits social intent to FitMeet.
3. Receives FitMeet-ranked candidates and risk notes.
4. Shows the results to the owner.
5. Sends the owner's approve/reject decision to FitMeet.
6. FitMeet sends a bounded station intro or opens a contact request.
7. Watches for response.
8. Requests contact exchange only after mutual consent.

Example API sequence:

```text
GET  /api/agent/profile/preferences
POST /api/agent/social-intents
GET  /api/agent/social-requests/{id}/matches
POST /api/agent/social-requests/{id}/candidates/decision
GET  /api/agent/activity
POST /api/agent/contact/request
```

This is the enterprise-safe social-skills contract FitMeet should expose to OpenClaw and other agents.
