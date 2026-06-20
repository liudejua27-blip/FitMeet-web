# FitMeet Social Codex Runtime

FitMeet Social Codex Runtime translates Codex-style agent ideas into a social and meet-up product loop. It does not expose raw chain-of-thought. It exposes a user-visible process summary, durable task memory, approval checkpoints, and message parts that can be rendered by the assistant-ui chat shell.

## Event Protocol

The user-facing stream keeps the old SSE events for compatibility and adds `SocialAgentEventV2` envelopes:

```ts
type SocialAgentEventV2 =
  | "run.started"
  | "visible_process.delta"
  | "assistant.delta"
  | "tool.started"
  | "tool.progress"
  | "tool.done"
  | "slot.filled"
  | "slot.completed"
  | "memory.saved"
  | "opportunity_card.created"
  | "candidate_search.started"
  | "candidate_search.done"
  | "safety_check.done"
  | "approval.required"
  | "approval.resolved"
  | "run.completed"
  | "run.failed";
```

Every event has `eventId`, `seq`, `createdAt`, `userId`, `threadId`, `taskId`, `runId`, `stage`, `visibility`, optional `display`, and optional public-safe `payload`.

Frontend rendering rule:

- `display.title` and `display.detail` are product language.
- `payload` is only for reducers and Tool UI. It must not be rendered as raw JSON.
- `visibility=internal` must never be shown.

## Thread / Task / Session

- A thread is the user-visible conversation row in the left sidebar.
- A task is the durable Social Codex runtime unit for one social or meet-up goal.
- A run is one Agent execution attempt inside a task.
- A session is the frontend view of one thread/task plus recent messages, runtime result, pending approvals, event replay, and branch metadata.
- A new thread is created only when the user explicitly clicks New Chat. Sending a message is never a thread creation signal by itself.
- Normal message sends append to the current `activeThreadId` / `taskId`.
- If a `taskId` exists, the visible thread is task-bound and every follow-up must resolve back to that task.
- `clientContext.threadId` is accepted by the backend so refreshes, route changes, and SSE reconnects do not accidentally create a new thread.
- Thread/task identifiers must resolve through the same parser. The backend accepts numeric ids (`44`) and checkpoint-style ids (`agent-task:44`, `task:44`, `thread:44`) as the same durable task.
- Runtime, checkpoint, replay, and frontend session outputs should use the canonical `agent-task:{taskId}` form. Plain numeric ids are accepted as compatibility input, not as the preferred output format.
- Thread titles should be generated from the first meaningful user intent, for example `周末青岛大学散步搭子`; generic prompts such as `你有什么功能` should become `普通聊天：功能咨询`, not repeated timestamp-like titles.
- Empty, generic, or stale checkpoints can be restored silently, but they must not create new sidebar rows or block ordinary chat.

## Memory Model

Runtime uses three layers:

1. `recentMessages`: recent thread conversation turns, currently read from task conversation memory.
2. `taskMemory`: per-task slots, candidate actions, pending approvals, and meet-loop state.
3. `Life Graph`: stable long-term preferences and boundaries.

Profile gate must consume the same task slot state machine as the Agent run.
If the user already answered `activity`, `time_window`, `location_text`,
`safety_boundary`, or `visibility` in the current task, the next turn must use
those slots as evidence and must not ask the same minimum-profile question
again. Database profile and Life Graph facts improve the gate, but they are not
the only source of truth for an in-progress meet-up task.

The slot state machine tracks:

- `activity`
- `time_window`
- `location_text`
- `geo_area`
- `intensity`
- `visibility`
- `safety_boundary`
- `invite_tone`

Slot states are:

- `missing`
- `inferred`
- `answered`
- `confirmed`
- `completed`
- `modified`

Answered or completed slots must not be asked again unless the user modifies them.

## Approval Gate

These actions must pause and emit approval:

- publish social request
- send invite
- exchange contact
- reveal precise location
- update sensitive profile
- connect candidate

Approval uses the existing checkpoint/resume system. The UI shows a message-part confirmation panel. Confirmation resumes the same run; rejection returns a natural reply and does not execute the side effect.

Approval is a first-class Social Codex lifecycle node:

- `approval.required` is emitted and stored when a run pauses for user confirmation.
- `approval.resolved` is emitted and stored when the user approves or rejects the action.
- Replay uses both events to decide whether a task is still waiting. A later
  `approval.resolved` only clears `pendingApproval` when it matches the same
  `approvalId`, `checkpointId`, or action identity. An unrelated resolved event
  in the same run must not clear a different pending approval.
- The resolved event carries only public-safe fields: approval id, decision, action type, risk level, checkpoint id, and resume cursor. It must not include raw private payloads.
- `approval.required` must include enough resume evidence for replay and UI:
  `approvalId`, `checkpointId` when available, `actionType`, `riskLevel`, and a
  `dryRunPreview` that explains what will happen before any side effect.
- High-risk approval and the later side-effect tool event must carry a stable
  `idempotencyKey`. `idempotencyKeyScope` only describes the namespace, while
  `idempotencyKey` identifies the exact publish/invite/message action so resume,
  retry, replay, and worker restarts cannot double-send or double-publish.

## Tool Governance / Social Sandbox

FitMeet tools follow the Codex-style rule: low-risk reads can run, medium-risk changes must be shown as a draft first, and real-world side effects must stop at an approval checkpoint.

Execution modes:

- `allow`: read or summarize only, no external side effect.
- `dry_run`: build a draft or proposal, but do not write externally.
- `approval_required`: high-risk action; create an approval and checkpoint before execution.
- `blocked`: forbidden until the user changes the request or confirms a safer boundary.

High-risk actions include:

- publishing a social request to Discover
- sending an invite or message
- connecting a candidate
- exchanging contact information
- revealing a precise location
- changing sensitive profile data
- payment-related actions

All high-risk actions require:

- idempotency key
- dry-run preview
- user-visible approval summary
- audit payload with sensitive fields redacted
- resume/reject behavior through checkpoint state

Tool policy metadata carries the same contract to executors and Tool UI:

- `socialCodex.sandbox.readOnlyAccessAllowed`: low-risk `allow` only permits
  reading, summarizing, and ranking already-safe data. It does not permit
  external side effects.
- `idempotencyKey`: deterministic key for the exact high-risk action, derived
  from task id, tool name, action scope, and a stable hash of the intended safe
  payload.
- `dryRunRequired`: the executor must produce a preview instead of a side effect.
- `socialCodex.dryRunPreview`: user-visible title, summary, safe fields, and the invariant that no side effect is allowed before approval.
- `socialCodexAudit`: sanitized policy decision payload for audit/replay. Contact information, exact location, private message content, and precise coordinates must be redacted or removed.
- `executionContract`: one of `approval_required_dry_run_audit`, `dry_run_required`, `blocked_by_social_codex_sandbox`, `audit_required`, or a tool-specific safe contract.

The social sandbox redacts phone numbers, WeChat IDs, exact addresses, private message text, and precise coordinates from logs and user-visible trace payloads. `externalSideEffectAllowed`, `contactExchangeAllowed`, and `preciseLocationAllowed` are false unless a later approved checkpoint resumes a narrowly scoped side-effect tool with an idempotency key and audit trail.

Stranger outreach has an additional sandbox boundary. Sending invites,
messages, connection requests, or contact-exchange proposals must prove one of
these safe boundaries before any real side effect executes:

- a public/discoverable candidate from Discover, a public intent, or an
  activity signup;
- or an existing relationship/conversation represented by a connection,
  conversation, or agent connection id.

If the candidate is explicitly private, hidden, closed, not discoverable, or the
runtime cannot prove a public candidate boundary, the policy returns
`blocked_by_social_codex_sandbox` before approval. User confirmation cannot
bypass cold-contacting arbitrary strangers. Existing approved conversations,
existing relationships, and card-action resumes can still enter the scoped
dry-run/approval lane because they already carry a safe relationship boundary.

Contact information and precise location have separate treatment:

- explicit `exchange_contact` and `reveal_precise_location` tools pause at
  `approval_required`;
- hidden contact or exact-location details inside another action, such as a
  normal message, are blocked by the Social Codex sandbox until the user changes
  the content or uses the explicit approval flow.

The sandbox also guards frequency. Stranger outreach is blocked when recent or
daily contact counters cross the runtime threshold. Count fields such as
`recentStrangerContactCount` are kept as audit metadata, while real contact
fields such as phone numbers, WeChat IDs, and exact addresses are redacted.

Action logs and inbox metadata must store sanitized `input`, `output`,
`inputSummary`, and `outputSummary`. The runtime keeps ids, status, policy,
approval id, and compensation metadata, but it must not persist raw phone
numbers, WeChat IDs, private exact addresses, dorm/building details, emails, or
precise coordinates in logs.

## Life Graph Governance

Life Graph is not a free-form memory dump. Runtime memory can propose governed facts with:

- `key`
- `value`
- user-visible `label`
- `evidence`
- `confidence`
- `sensitivity`
- `writePolicy`
- `expiresAt`
- `retention`
- `reason`

Each proposal also produces a governance summary for trace/eval:

- `autoSaveCount`: low-risk facts that may be retained without interrupting the conversation.
- `confirmationRequiredCount`: private or location/time facts that need explicit user confirmation before long-term merge.
- `blockedCount` / `sensitiveCount`: facts that must not be written.
- `expiringFactKeys`: facts with TTL-based expiry.

Expiry is derived from the source slot timestamp (`completedAt` first, then `updatedAt`) so replay and evals are deterministic. Runtime time is only used when the source has no valid timestamp.

Stable facts can be saved when they are low-risk and useful, for example:

- preferred activity
- preferred activity intensity
- first-meet safety boundary
- invite tone preference

Facts that should require confirmation:

- common time window
- coarse activity area

Facts that must not be written:

- phone number
- WeChat ID
- exact address
- dorm/building/unit details
- one-off filler such as "可以" or "随便"

This lets the Agent remember useful preferences without turning one chat turn into permanent sensitive memory.

User-visible events and replay packages must not expose the full
`lifeGraphFactProposals` object. Full proposals can contain evidence quotes and
internal governance fields, so they stay inside backend context/eval. The SSE
trace only emits:

- `lifeGraphGovernanceSummary`
- `lifeGraphFacts`: display-safe summaries with `key`, `label`,
  `displayValue`, `sensitivity`, `writePolicy`, `expiresAt`, `evidenceCount`,
  and `reason`

Trace eval fails any replayable user-visible event that contains raw
`lifeGraphFactProposals`, evidence arrays, direct quote fields, phone numbers,
WeChat IDs, precise addresses, private message text, or coordinates.

## Trace / Replay / Regression

Every run should be evaluable from its `SocialAgentEventV2` events. A valid replay sample must have:

- stable `threadId`
- stable `runId`
- monotonically increasing `seq`
- no raw chain-of-thought or internal technical labels in visible text
- approval before high-risk side effects
- `safety_check.done` before high-risk side effects such as publishing, inviting, connecting, contact exchange, or revealing precise location
- `approval.required` with a resumable `approvalId` or `checkpointId`
- dry-run preview on high-risk approvals, so the user can see what will happen before any side effect
- high-risk side effects only after an approved `approval.resolved`, not merely
  after rendering an approval card
- no phone number, WeChat ID, precise address, coordinates, private message text, or other sensitive payload leaks in replayable events
- no duplicate slot completion for the same field
- terminal `run.completed` or `run.failed`

The eval result also includes named regression checks so QA, CI, and future
self-improve runs can fail on product invariants instead of only raw issues:

- `visible_process_trace`: social/task runs must show a user-visible process
  status instead of leaving the user staring at waiting dots. The product UI
  should render the latest `replay.summary` / visible process event as one
  replaceable status line, with detailed evidence collapsed until the user
  opens "查看过程".
- `thread_task_run_binding`: replayable events must keep stable thread/run ids
  so one message does not create a new sidebar thread.
- `memory_slot_state_machine`: slot completion must not repeat the same
  already-answered field.
- `approval_lifecycle`: high-risk actions must have resumable approval and only
  execute after approval is resolved.
- `social_sandbox`: publishing, inviting, contact exchange, and location reveal
  must pass safety checks and cannot bypass the stranger boundary.
- `replay_terminal`: each replay sample must end in `run.completed` or
  `run.failed`.

These checks are the basis for regression tests and future self-improve eval cases. A failed trace should become a replay case before it becomes a patch suggestion.

Runtime endpoints:

- `GET /social-agent/tasks/:id/events` returns the raw task timeline for authenticated owners.
- `GET /social-agent/tasks/:id/events/eval` evaluates stored `SocialAgentEventV2` rows for replay readiness and returns both `issues` and `regressionChecks`.
- `GET /social-agent/tasks/:id/events/replay` returns a Social Codex replay package for reconnect, QA, and evals.

Replay supports:

- `afterSeq=<number>` for incremental reconnect after the last rendered sequence.
- `afterEventId=<eventId>` for cursor-based replay.
- `includeDebug=true` for internal QA. Production UI should omit it and only consume user-visible events.

The replay package includes `threadId`, `runId`, `lastSeq`, `lastEventId`, `terminalType`, `pendingApproval`, the replayable events, and an embedded trace eval result.

## Frontend Rendering

assistant-ui renders:

- assistant text deltas as normal assistant text
- `visible_process.delta`, tool events, slot events, and memory events as one
  lightweight covering status by default; older steps are audit evidence inside
  the collapsed "查看过程" area
- opportunity cards, candidate cards, and approvals as Tool UI message parts

The frontend must show:

- "正在读取你的偏好"
- "已记住：你想在周末下午散步"
- "已把地点记为青岛大学附近"
- "这张约练卡可以发布到发现"
- "找到 3 个公开可发现的人"
- "发送邀请前需要你确认"

The frontend must not show internal names such as `hydrate_context`, `tool_call_started`, `traceId`, planner dumps, or raw JSON.

## Why Visible Process, Not Raw Chain-of-Thought

Raw chain-of-thought can expose private reasoning, internal policies, model uncertainty, and implementation details. FitMeet only shows a concise visible process summary: what the Agent is doing, what user-provided information it recorded, which safe external action is pending, and what can be resumed. The default surface is a single replaceable status, not a long process log. This gives GPT/Codex-like transparency without exposing hidden reasoning.

## First Product Loop

The target runtime path is:

```text
chat
-> detect_social_intent
-> hydrate_context
-> profile_gate
-> slot_filling
-> create_opportunity_card
-> approval for publish if needed
-> publish_to_discover
-> search_candidates
-> safety_filter
-> rank_candidates
-> show_3_candidates
-> generate_opener
-> approval for invite
-> send_invite
-> meet_loop
-> feedback
-> life_graph_writeback
```

Ordinary chat stays in conversation mode and must not trigger social search, publishing, candidate recommendation, or side effects.
