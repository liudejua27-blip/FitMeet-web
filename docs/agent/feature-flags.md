# Agent Feature Flags and Kill Switches

This document records the production switches for FitMeet Agent social-loop side effects. All switches default to enabled unless explicitly disabled or constrained.

## Global Kill Switches

- `FITMEET_SOCIAL_LOOP_KILL_SWITCH=1`: disables all guarded social-loop capabilities.
- `FITMEET_AGENT_KILL_SWITCH=1`: disables all guarded Agent capabilities.

## Feature Switches

| Capability | Env key | Legacy alias | Guarded path |
| --- | --- | --- | --- |
| Agent publish | `FITMEET_FEATURE_AGENT_PUBLISH_ENABLED` | `FITMEET_AGENT_PUBLISH_ENABLED` | Agent draft publish before public side effects |
| Discover public intent | `FITMEET_FEATURE_DISCOVER_PUBLIC_INTENT_ENABLED` | none | Public intent publish before Discover projection |
| Matching worker | `FITMEET_FEATURE_MATCHING_WORKER_ENABLED` | `FITMEET_MATCHING_JOB_WORKER_ENABLED` | Matching cron before claiming jobs |
| Automatic candidate search | `FITMEET_FEATURE_AUTOMATIC_CANDIDATE_SEARCH_ENABLED` | none | Matching processor before index/candidate search |
| Message send | `FITMEET_FEATURE_MESSAGE_SEND_ENABLED` | `FITMEET_AGENT_MESSAGE_SEND_ENABLED` | Send message and reply tools |
| Connect candidate | `FITMEET_FEATURE_CONNECT_CANDIDATE_ENABLED` | none | Candidate connect approval creation |
| Activity create/join | `FITMEET_FEATURE_ACTIVITY_CREATE_ENABLED` | none | Activity creation and join tools |

False values are `0`, `false`, `no`, and `off`. True values are `1`, `true`, `yes`, and `on`.

## Scoped Rollout Controls

Every feature supports scoped env keys:

- `<FEATURE_ENV>_USER_ALLOWLIST=7,9`
- `<FEATURE_ENV>_CITY_ALLOWLIST=青岛,beijing`
- `<FEATURE_ENV>_DISABLED_RISK_LEVELS=high,blocked`

Examples:

```bash
FITMEET_FEATURE_AGENT_PUBLISH_ENABLED_USER_ALLOWLIST=1001,1002
FITMEET_FEATURE_DISCOVER_PUBLIC_INTENT_ENABLED_CITY_ALLOWLIST=青岛
FITMEET_FEATURE_AUTOMATIC_CANDIDATE_SEARCH_ENABLED_DISABLED_RISK_LEVELS=high,blocked
FITMEET_FEATURE_MESSAGE_SEND_ENABLED=0
```

When a guarded capability is disabled, the backend fails closed with HTTP 503 and error code `FEATURE_DISABLED`. The request does not create the guarded side effect.
