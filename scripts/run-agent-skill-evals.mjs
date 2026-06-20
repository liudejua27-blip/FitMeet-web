#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const evalFile = path.join(root, 'docs', 'agent-skills', 'eval-cases.jsonl');
const workflowFile = path.join(root, 'docs', 'agent-skills', 'social-meetup-workflow.md');
const toolExamplesFile = path.join(root, 'docs', 'agent-skills', 'tool-examples.jsonl');
const args = new Set(process.argv.slice(2));
const reportArgIndex = process.argv.findIndex((arg) => arg === '--report');
const reportFile =
  reportArgIndex >= 0 ? process.argv[reportArgIndex + 1] : undefined;
const supportedApiFlags = [
  '--api-readiness',
  '--api-empty-candidate',
  '--api-full',
  '--api-sse-abort',
  '--api-all',
];
if (args.has('--help') || args.has('-h')) {
  console.log(`Usage: node scripts/run-agent-skill-evals.mjs [--backend] [--show-details] [--report FILE] [${supportedApiFlags.join('|')}]

Default mode validates FitMeet skill eval cases against project contracts and
evidence files. --backend also runs the critical Jest assertions. API modes run
the existing authenticated Agent smoke scripts against AGENT_SMOKE_API_BASE_URL,
FITMEET_API_BASE_URL, API_BASE_URL, or http://localhost:3000/api.

API modes require USER_JWT/FITMEET_USER_JWT or AGENT_SMOKE_EMAIL/PASSWORD.
Remote targets also require the existing AGENT_SMOKE_ALLOW_* safety flags.`);
  process.exit(0);
}
if (reportArgIndex >= 0 && (!reportFile || reportFile.startsWith('--'))) {
  console.error('[FAIL] --report requires a file path');
  process.exit(1);
}
const runBackend = args.has('--backend');
const showDetails = args.has('--show-details');
const apiModes = new Set(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith('--api'))
    .map((arg) => arg.replace(/^--api-?/, '') || 'readiness'),
);
const runApiReadiness =
  apiModes.has('readiness') || apiModes.has('smoke') || apiModes.has('all');
const runApiEmptyCandidate =
  apiModes.has('empty-candidate') ||
  apiModes.has('empty') ||
  apiModes.has('all');
const runApiFull = apiModes.has('full') || apiModes.has('all');
const runApiSseAbort =
  apiModes.has('sse-abort') ||
  apiModes.has('sse') ||
  apiModes.has('abort') ||
  apiModes.has('all');

const sourceFiles = {
  acceptance:
    'backend/src/agent-gateway/social-agent-chat.acceptance.spec.ts',
  candidatePresenter:
    'backend/src/agent-gateway/social-agent-candidate-pool-result.presenter.ts',
  candidatePresenterSpec:
    'backend/src/agent-gateway/social-agent-candidate-pool-result.presenter.spec.ts',
  contextWindowSpec:
    'backend/src/agent-gateway/social-agent-context-window.spec.ts',
  deepseekQualityBoundarySpec:
    'backend/src/agent-gateway/social-agent-deepseek-quality-boundary.spec.ts',
  fallbackSourceBoundarySpec:
    'backend/src/agent-gateway/social-agent-fallback-source-boundary.spec.ts',
  fitmeetAlphaAgentSdkSpec:
    'backend/src/agent-gateway/fitmeet-alpha-agent-sdk.service.spec.ts',
  agentRouteIsolationSpec: 'frontend/src/test/AgentRouteIsolation.test.ts',
  agentWorkspaceRuntimeSpec: 'frontend/src/test/agentWorkspaceRuntime.test.ts',
  toolFallbackRenderSpec: 'frontend/src/test/toolFallbackRender.test.tsx',
  agentAdapterSpec: 'frontend/src/test/agentAdapter.test.ts',
  inboxToolSpec:
    'backend/src/agent-gateway/social-agent-inbox-tool.service.spec.ts',
  lifeGraphGovernanceSpec:
    'backend/src/agent-gateway/social-codex-life-graph-governance.service.spec.ts',
  meetLoopSpec:
    'backend/src/agent-gateway/social-agent-meet-loop.service.spec.ts',
  opportunityClarificationSpec:
    'backend/src/agent-gateway/social-agent-opportunity-clarification.spec.ts',
  profileGateSpec:
    'backend/src/agent-gateway/social-agent-profile-gate.service.spec.ts',
  releaseVerify: 'scripts/verify-agent-release.sh',
  smokeOpportunity: 'backend/src/scripts/smoke-agent-opportunity-journey.ts',
  stateMachineSpec:
    'backend/src/agent-gateway/social-agent-task-memory-state-machine.service.spec.ts',
  toolUiSchemaSpec: 'frontend/src/test/toolUiSchema.test.ts',
  traceEvalSpec:
    'backend/src/agent-gateway/social-codex-trace-eval.service.spec.ts',
};

const sourceCache = new Map();
const failures = [];
const passes = [];
const toolExamplePasses = [];
const workflowPasses = [];

function readSource(name) {
  const file = sourceFiles[name];
  if (!file) throw new Error(`Unknown source alias: ${name}`);
  if (!sourceCache.has(file)) {
    const absolute = path.join(root, file);
    if (!fs.existsSync(absolute)) {
      throw new Error(`Missing source evidence file: ${file}`);
    }
    sourceCache.set(file, fs.readFileSync(absolute, 'utf8'));
  }
  return sourceCache.get(file);
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function expectIncludes(sourceName, phrases) {
  const source = readSource(sourceName);
  for (const phrase of phrases) {
    expect(
      source.includes(phrase),
      `${sourceFiles[sourceName]} missing evidence: ${phrase}`,
    );
  }
}

function expectCase(caseItem, predicate, message) {
  expect(predicate(caseItem), `${caseItem.id}: ${message}`);
}

function parseEvalCases() {
  return parseJsonlFile(evalFile, 'eval-cases.jsonl');
}

function parseToolExamples() {
  return parseJsonlFile(toolExamplesFile, 'tool-examples.jsonl');
}

function parseJsonlFile(file, label) {
  const source = fs.readFileSync(file, 'utf8');
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(
          `${label} line ${index + 1} is invalid JSON: ${error.message}`,
        );
      }
    });
}

const requiredSkills = [
  'profile_onboarding_skill',
  'social_intent_clarifier_skill',
  'opportunity_card_skill',
  'discover_publish_skill',
  'candidate_search_skill',
  'candidate_rank_skill',
  'safety_approval_skill',
  'invitation_skill',
  'meet_loop_skill',
  'life_graph_memory_skill',
];

function commonCaseChecks(caseItem) {
  expectCase(
    caseItem,
    (item) => typeof item.id === 'string' && item.id.length > 0,
    'missing id',
  );
  expectCase(
    caseItem,
    (item) => Array.isArray(item.skillIds) && item.skillIds.length > 0,
    'missing skillIds',
  );
  expectCase(
    caseItem,
    (item) => item.expected && typeof item.expected === 'object',
    'missing expected object',
  );
}

function validateWorkflowContract() {
  const source = fs.readFileSync(workflowFile, 'utf8');
  const requiredPhrases = [
    'ordinary_chat',
    'detect_social_intent',
    'check_profile_gate',
    'clarify_social_intent',
    'create_opportunity_card',
    'request_publish_approval',
    'publish_public_intent',
    'search_public_candidates',
    'rank_candidates',
    'generate_opener',
    'request_invite_approval',
    'send_invite',
    'meet_loop',
    'life_graph_writeback',
    'must not block normal conversation',
    'Approval confirmation resumes the same checkpoint',
    'must not invent people',
  ];
  for (const phrase of requiredPhrases) {
    expect(source.includes(phrase), `social-meetup-workflow.md missing ${phrase}`);
  }
  workflowPasses.push('social-meetup-workflow');
}

function commonToolExampleChecks(example) {
  expect(
    typeof example.id === 'string' && example.id.length > 0,
    'tool example missing id',
  );
  expect(
    requiredSkills.includes(example.skillId),
    `${example.id}: unknown skillId ${example.skillId}`,
  );
  expect(
    Array.isArray(example.expectedToolSequence) &&
      example.expectedToolSequence.length > 0,
    `${example.id}: missing expectedToolSequence`,
  );
  expect(
    Array.isArray(example.expectedEvents),
    `${example.id}: missing expectedEvents`,
  );
  expect(
    Array.isArray(example.expectedToolUi),
    `${example.id}: missing expectedToolUi`,
  );
  expect(
    typeof example.approvalPolicy === 'string' &&
      example.approvalPolicy.length > 0,
    `${example.id}: missing approvalPolicy`,
  );
}

function validateToolExample(example) {
  commonToolExampleChecks(example);

  if (example.id === 'ordinary_chat_stays_conversation') {
    expect(
      example.expectedToolSequence.length === 1 &&
        example.expectedToolSequence[0] === 'detect_social_intent',
      'ordinary chat should only detect intent',
    );
    for (const forbidden of [
      'search_public_candidates',
      'publish_public_intent',
      'send_invite',
    ]) {
      expect(
        example.mustNot?.includes(forbidden),
        `ordinary chat must forbid ${forbidden}`,
      );
    }
  }

  if (example.id === 'discover_publish_checkpoint') {
    expect(
      example.expectedToolSequence.indexOf('request_approval') <
        example.expectedToolSequence.indexOf('publish_public_intent'),
      'publish must request approval before side effect',
    );
    expect(
      example.expectedEvents.includes('approval.required'),
      'publish example must emit approval.required',
    );
  }

  if (example.id === 'invite_send_requires_resume_checkpoint') {
    expect(
      example.expectedToolSequence.indexOf('request_approval') <
        example.expectedToolSequence.indexOf('send_invite'),
      'invite must request approval before sending',
    );
    expect(
      example.mustNot?.includes('double_send_on_retry'),
      'invite example must forbid double send',
    );
  }

  if (example.id === 'candidate_empty_result_fallback') {
    expect(
      example.expectedToolUi?.includes('CandidateEmptyStateCard'),
      'empty candidate fallback must render CandidateEmptyStateCard',
    );
    expect(
      example.mustNot?.includes('fake_candidates') &&
        example.mustNot?.includes('mock_people'),
      'empty candidate fallback must forbid fake people',
    );
    expect(
      example.mustSuggest?.includes('发布到发现') &&
        example.mustSuggest?.includes('扩大范围') &&
        example.mustSuggest?.includes('改时间'),
      'empty candidate fallback must suggest safe next steps',
    );
  }

  if (example.id === 'correction_updates_public_candidate_preference') {
    expect(
      example.expectedToolSequence.includes('update_candidate_preference'),
      'correction example must update candidate preference',
    );
    for (const forbidden of [
      'ask_activity_again',
      'ask_time_window_again',
      'ask_location_text_again',
      'infer_private_sensitive_fields',
    ]) {
      expect(
        example.mustNot?.includes(forbidden),
        `correction example must forbid ${forbidden}`,
      );
    }
  }

  if (example.id === 'life_graph_stable_fact_with_evidence') {
    expect(
      example.expectedToolSequence.includes('propose_life_graph_facts'),
      'Life Graph example must propose facts first',
    );
    expect(
      example.mustNot?.includes('save_one_off_noise'),
      'Life Graph example must forbid one-off noise',
    );
  }
}

const validators = {
  ordinary_chat_no_social_tools(caseItem) {
    expectCase(caseItem, (item) => item.expected.intent === 'conversation', 'must stay conversation');
    expectCase(
      caseItem,
      (item) => item.expected.forbiddenTools?.includes('search_public_candidates'),
      'must forbid candidate search',
    );
    expectIncludes('acceptance', [
      'keeps twenty turns of ordinary chat without triggering social tools',
      'executor.executeToolAction).not.toHaveBeenCalled',
    ]);
  },

  profile_gate_new_user_minimum_questions(caseItem) {
    expectCase(
      caseItem,
      (item) => item.expected.blockedActions?.includes('invite'),
      'profile gate must block invite',
    );
    expectIncludes('profileGateSpec', [
      'summarizes the minimum profile gate for the Agent entry screen',
      'availability',
      'publicAuthorization',
      'keeps action execution gated by boundary and public authorization',
    ]);
  },

  ordinary_chat_not_blocked_by_profile_gate(caseItem) {
    expectCase(caseItem, (item) => item.expected.blockedByProfileGate === false, 'ordinary chat must not be blocked');
    expectIncludes('acceptance', [
      'keeps twenty turns of ordinary chat without triggering social tools',
    ]);
  },

  social_intent_extracts_slots_once(caseItem) {
    expectCase(
      caseItem,
      (item) => item.expected.mustNotAskAgain?.includes('location_text'),
      'must protect location from repeat questions',
    );
    expectIncludes('stateMachineSpec', [
      'does not ask again for answered slots on later turns',
      'avoidRepeatingAnsweredQuestions',
    ]);
  },

  correction_updates_candidate_preference_without_reasking_core_slots(caseItem) {
    expectCase(
      caseItem,
      (item) => item.expected.updatedSlots?.includes('candidate_preference'),
      'correction must update candidate preference',
    );
    expectCase(
      caseItem,
      (item) =>
        item.expected.mustNotAskAgain?.includes('activity') &&
        item.expected.mustNotAskAgain?.includes('time_window') &&
        item.expected.mustNotAskAgain?.includes('location_text'),
      'correction must not reopen completed core slots',
    );
    expectCase(
      caseItem,
      (item) =>
        item.expected.mustIncludePreference?.includes('女生') &&
        item.expected.mustIncludePreference?.includes('舞蹈相关'),
      'correction must preserve public candidate preference labels',
    );
    expectIncludes('stateMachineSpec', [
      'preserves completed core slots when the user corrects only candidate preference',
      '我说的是找个女舞蹈生散步，你到底懂没懂我的意思',
      'candidatePreferencePolicy',
      '公开可发现资料',
    ]);
  },

  twenty_turn_memory_no_repeat_questions(caseItem) {
    expectCase(caseItem, (item) => item.turns?.length >= 20, 'must include at least 20 turns');
    expectIncludes('stateMachineSpec', [
      'keeps social task slots stable through a 20-turn continuation',
      'doNotAskAgainFor',
    ]);
    expectIncludes('acceptance', [
      'keeps twenty turns of ordinary chat without triggering social tools',
    ]);
  },

  opportunity_card_from_completed_slots(caseItem) {
    expectCase(caseItem, (item) => item.expected.toolUiType === 'OpportunityCard', 'must render OpportunityCard');
    expectIncludes('toolUiSchemaSpec', [
      "productComponentForSchemaType('social_match.activity')).toBe('OpportunityCard')",
      'defaultOpportunityActionsForSchema',
    ]);
  },

  missing_slot_blocks_card_generation(caseItem) {
    expectCase(
      caseItem,
      (item) => item.expected.mustNotShow?.includes('OpportunityCard'),
      'must block card until required slots are complete',
    );
    expectIncludes('opportunityClarificationSpec', [
      'asks only for search-critical context before candidate discovery',
      "clarification.complete).toBe(false)",
    ]);
  },

  publish_to_discover_requires_approval(caseItem) {
    expectCase(caseItem, (item) => item.expected.mustEmit === 'approval.required', 'publish must require approval');
    expectCase(caseItem, (item) => item.expected.sideEffectBeforeApproval === false, 'publish must not execute before approval');
    expectIncludes('traceEvalSpec', [
      'approval_without_checkpoint',
      'approval_without_dry_run_preview',
      'high_risk_without_idempotency_key',
    ]);
  },

  discover_card_has_real_detail_link(caseItem) {
    expectCase(
      caseItem,
      (item) => item.expected.mustNotHref === '/discover?focusScene=',
      'must forbid focusScene as the primary detail link',
    );
    expectIncludes('releaseVerify', [
      'Run real API smoke for Agent opportunity readiness',
      'RUN_AGENT_OPPORTUNITY_SMOKE',
    ]);
  },

  candidate_empty_safe_fallback(caseItem) {
    expectCase(caseItem, (item) => item.expected.mustNotFakeCandidates === true, 'must forbid fake candidates');
    expectCase(
      caseItem,
      (item) => item.expected.toolUiType === 'CandidateEmptyStateCard',
      'empty candidate fallback must render CandidateEmptyStateCard',
    );
    expectCase(
      caseItem,
      (item) => item.expected.mustNotShow?.includes('CandidateCards'),
      'empty candidate fallback must not render CandidateCards',
    );
    expectIncludes('candidatePresenter', [
      '当前没有找到符合条件的真实用户',
      '发布一个约练需求',
      '放宽城市、时间、兴趣条件',
    ]);
    expectIncludes('candidatePresenterSpec', [
      "expect(result.candidates).toHaveLength(0)",
      "expect(result.message).toContain('发布')",
      "expect(JSON.stringify(result)).not.toContain('mock')",
    ]);
    expectIncludes('toolUiSchemaSpec', [
      'social_match.empty',
      'CandidateEmptyStateCard',
      'normalizeCandidateEmptyStateView',
    ]);
    expectIncludes('fitmeetAlphaAgentSdkSpec', [
      'builds a recovery card instead of fake candidates',
      'candidate_empty_state',
      'CandidateEmptyStateCard',
      '不会用假候选凑数',
    ]);
  },

  candidate_search_no_mock_supply(caseItem) {
    expectCase(caseItem, (item) => item.expected.forbiddenSources?.includes('mock'), 'mock source must be forbidden');
    expectIncludes('candidatePresenter', ['no_real_candidates']);
  },

  candidate_top_three_with_reasons(caseItem) {
    expectCase(caseItem, (item) => item.expected.maxVisibleCandidates === 3, 'must cap visible candidates to 3');
    expectIncludes('smokeOpportunity', [
      'minCandidates: 3',
      'candidate OpportunityCard',
    ]);
    expectIncludes('toolUiSchemaSpec', ['CandidateCards', 'OpportunityCard']);
  },

  candidate_preference_uses_public_fields_only(caseItem) {
    expectCase(
      caseItem,
      (item) => item.expected.mustNotInferPrivateFields === true,
      'private candidate inference must be forbidden',
    );
    expectIncludes('stateMachineSpec', [
      'candidatePreferencePolicy',
      '公开可发现资料',
    ]);
  },

  invite_requires_approval_checkpoint(caseItem) {
    expectCase(caseItem, (item) => item.expected.idempotencyKeyRequired === true, 'invite requires idempotency key');
    expectIncludes('traceEvalSpec', [
      'high-risk approvals to be resumable and dry-run previewed',
      'idempotencyKey',
    ]);
  },

  approval_reject_prevents_side_effect(caseItem) {
    expectCase(caseItem, (item) => item.expected.executed === false, 'reject must prevent execution');
    expectIncludes('smokeOpportunity', [
      'opener.reject cancels the high-risk send without side effects',
    ]);
  },

  approval_resume_is_idempotent(caseItem) {
    expectCase(caseItem, (item) => item.expected.doubleSend === false, 'resume must not double send');
    expectIncludes('traceEvalSpec', [
      'requires high-risk side effects to wait for approved resume',
      'approval.resolved',
    ]);
  },

  opener_preview_without_side_effect(caseItem) {
    expectCase(caseItem, (item) => item.expected.draftOnly === true && item.expected.sent === false, 'opener must be draft-only');
    expectIncludes('smokeOpportunity', [
      'candidate.generate_opener creates a send approval card',
    ]);
  },

  send_invite_requires_confirmation(caseItem) {
    expectCase(caseItem, (item) => item.expected.sentBeforeApproval === false, 'send invite cannot happen before approval');
    expectIncludes('traceEvalSpec', ['send_candidate_message', 'approval.required']);
  },

  meet_loop_full_state_machine(caseItem) {
    expectCase(caseItem, (item) => item.expected.states?.includes('life_graph_writeback'), 'meet loop must include writeback');
    expectIncludes('meetLoopSpec', [
      'runs the canonical card-action meet loop without ActivitiesService',
      'lifeGraphUpdated: true',
      'ActivityReviewedPositive',
    ]);
  },

  waiting_reply_missing_connection_no_error_loop(caseItem) {
    expectCase(caseItem, (item) => item.expected.workerErrorLoop === false, 'worker error loop must be impossible');
    expectIncludes('inboxToolSpec', [
      'reads owner inbox events without an agent connection when no conversation is scoped',
      'requires an agent connection for conversation-scoped inbox reads',
    ]);
  },

  stable_preference_saved_with_evidence(caseItem) {
    expectCase(caseItem, (item) => item.expected.evidenceRequired === true, 'Life Graph facts require evidence');
    expectIncludes('lifeGraphGovernanceSpec', [
      'proposes governed stable facts with evidence and expiry',
      'evidence.length',
      'ttlDays',
    ]);
  },

  one_off_noise_not_saved(caseItem) {
    expectCase(caseItem, (item) => item.expected.mustNotSaveNoise === true, 'one-off noise must not be saved');
    expectIncludes('lifeGraphGovernanceSpec', [
      'does not write precise contact or address noise into Life Graph',
      'shouldWriteFact',
    ]);
  },

  deepseek_quality_routing_not_downgraded(caseItem) {
    expectCase(
      caseItem,
      (item) => item.expected.noFastModelFallback === true,
      'DeepSeek quality routes must not downgrade to fast fallback models',
    );
    expectCase(
      caseItem,
      (item) => Number(item.expected.minimumTimeoutMs) >= 20_000,
      'DeepSeek route/planner/tool budgets must be long enough for production latency',
    );
    expectIncludes('deepseekQualityBoundarySpec', [
      'does not reintroduce premature DeepSeek route, planner, or tool timeouts',
      'keeps direct DeepSeek callers behind the shared quality timeout policy',
      'does not let fast model fallbacks downgrade user-facing chat, planner, or final responses',
      'keeps intent routing LLM-first for short follow-up turns with existing task context',
    ]);
  },

  deepseek_context_window_not_truncated(caseItem) {
    expectCase(
      caseItem,
      (item) => Number(item.expected.minimumContextTurns) >= 80,
      'DeepSeek context window must preserve enough turns for multi-round social tasks',
    );
    expectIncludes('contextWindowSpec', [
      'defaults to the production conversation memory window',
      'does not let explicit tiny windows weaken LLM-facing memory',
      'SOCIAL_AGENT_DEFAULT_CONTEXT_TURNS',
      'history.slice(-SOCIAL_AGENT_DEFAULT_CONTEXT_TURNS)',
    ]);
  },

  fallback_not_streamed_as_llm_answer(caseItem) {
    expectCase(
      caseItem,
      (item) => item.expected.fallbackAssistantDelta === false,
      'fallback text must not be streamed as LLM assistant.delta',
    );
    expectIncludes('fallbackSourceBoundarySpec', [
      'does not stream fallback text as an LLM assistant response',
      'centralizes SocialAgentEventV2 assistant deltas and skips fallback chunks',
      "input.source === 'fallback'",
    ]);
  },

  thread_append_no_duplicate_creation(caseItem) {
    expectCase(
      caseItem,
      (item) => item.expected.singleActiveThread === true,
      'same conversation should keep one active thread',
    );
    expectCase(
      caseItem,
      (item) => item.expected.createThreadOnlyOnExplicitNewChat === true,
      'new thread creation must be explicit',
    );
    expectCase(
      caseItem,
      (item) => item.expected.mustNotCreateThreadsPerMessage === true,
      'each message must not create a new thread',
    );
    expectIncludes('agentRouteIsolationSpec', [
      'keeps message submission inside the active thread instead of creating a thread per message',
      'threadId: canonicalActiveThreadId',
      'socialAgentApi.createThread()',
      'const startNewThread = async () =>',
    ]);
    expectIncludes('agentRouteIsolationSpec', [
      'expect(submitRuntimeSource).not.toMatch(/createThread',
      'expect(workspaceSource).not.toMatch(/createThread',
    ]);
  },

  visible_process_overlay_not_timeline(caseItem) {
    expectCase(
      caseItem,
      (item) => item.expected.displayMode === 'covering_status',
      'visible process should default to a covering status',
    );
    expectCase(
      caseItem,
      (item) => item.expected.defaultVisibleCount === 1,
      'visible process should show one latest status by default',
    );
    expectCase(
      caseItem,
      (item) => item.expected.mustNotDefaultToTimeline === true,
      'visible process must not default to a long timeline',
    );
    expectIncludes('agentWorkspaceRuntimeSpec', [
      'lets replay.summary replace old process nodes instead of accumulating a timeline',
      'starts a submitted run with one GPT-style covering status instead of a preset timeline',
      'displayMode: \'covering_status\'',
      'updateModel: \'latest_state\'',
      'defaultVisibleCount: 1',
      'historyVisibility: \'collapsed\'',
    ]);
    expectIncludes('toolFallbackRenderSpec', [
      'renders replay summaries as one covering status without opening a process timeline',
      'assistant-ui-process-status-line',
      'queryByText(\'查看过程\')).not.toBeInTheDocument',
    ]);
    expectIncludes('agentAdapterSpec', [
      'maps SocialAgentEventV2 visible process events to one cover-style public progress row',
      'tool_call_started|slot_filled|hydrate_context|planner|traceId|raw JSON|payload',
    ]);
  },
};

function runCase(caseItem) {
  commonCaseChecks(caseItem);
  const validator = validators[caseItem.id];
  expect(Boolean(validator), `${caseItem.id}: no eval runner validator registered`);
  validator(caseItem);
}

function runBackendAssertions() {
  const testTargets = [
    'src/agent-gateway/social-agent-chat.acceptance.spec.ts',
    'src/agent-gateway/social-agent-task-memory-state-machine.service.spec.ts',
    'src/agent-gateway/social-agent-candidate-pool-result.presenter.spec.ts',
    'src/agent-gateway/social-agent-meet-loop.service.spec.ts',
    'src/agent-gateway/social-agent-opportunity-clarification.spec.ts',
    'src/agent-gateway/social-agent-profile-gate.service.spec.ts',
    'src/agent-gateway/social-codex-trace-eval.service.spec.ts',
    'src/agent-gateway/social-agent-inbox-tool.service.spec.ts',
    'src/agent-gateway/social-agent-context-window.spec.ts',
    'src/agent-gateway/social-agent-deepseek-quality-boundary.spec.ts',
    'src/agent-gateway/social-agent-fallback-source-boundary.spec.ts',
  ];
  const result = spawnSync(
    'pnpm',
    ['--dir', 'backend', 'exec', 'jest', ...testTargets, '--runInBand'],
    {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
    },
  );
  if (result.status !== 0) {
    failures.push({
      id: 'backend-jest',
      message: `backend eval assertion specs failed with status ${result.status}`,
    });
  }
}

function runCommand(id, command, commandArgs, env = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...env,
    },
  });
  if (result.status !== 0) {
    failures.push({
      id,
      message: `${command} ${commandArgs.join(' ')} failed with status ${result.status}`,
    });
  }
}

function runApiScenarioAssertions() {
  if (runApiReadiness || runApiEmptyCandidate || runApiFull) {
    runCommand(
      'api-preflight-readiness',
      path.join(root, 'scripts', 'agent-remote-smoke-preflight.sh'),
      ['--readiness', '--api-base-url', agentSmokeApiBaseUrl()],
    );
    if (runApiReadiness) {
      runCommand(
        'api-opportunity-readiness',
        'pnpm',
        ['--dir', 'backend', 'run', 'smoke:agent-opportunity'],
        { AGENT_SMOKE_STOP_AFTER_OPPORTUNITIES: 'true' },
      );
    }
  }
  if (runApiEmptyCandidate) {
    runCommand(
      'api-empty-candidate',
      'pnpm',
      ['--dir', 'backend', 'run', 'smoke:agent-opportunity'],
      {
        AGENT_SMOKE_RUN_EMPTY_CANDIDATE_FALLBACK: 'true',
        AGENT_SMOKE_STOP_AFTER_OPPORTUNITIES: 'true',
      },
    );
  }
  if (runApiFull) {
    runCommand(
      'api-preflight-full',
      path.join(root, 'scripts', 'agent-remote-smoke-preflight.sh'),
      ['--full', '--api-base-url', agentSmokeApiBaseUrl()],
    );
    runCommand(
      'api-opportunity-full',
      'pnpm',
      ['--dir', 'backend', 'run', 'smoke:agent-opportunity'],
      { AGENT_SMOKE_STOP_AFTER_OPPORTUNITIES: 'false' },
    );
  }
  if (runApiSseAbort) {
    runCommand(
      'api-preflight-sse-abort',
      path.join(root, 'scripts', 'agent-remote-smoke-preflight.sh'),
      ['--sse-abort', '--api-base-url', agentSmokeApiBaseUrl()],
    );
    runCommand(
      'api-sse-abort',
      'pnpm',
      ['--dir', 'backend', 'run', 'smoke:agent-sse-abort'],
    );
  }
}

function validateToolExamples() {
  const examples = parseToolExamples();
  const seen = new Set();
  const skillCoverage = new Map(requiredSkills.map((skillId) => [skillId, 0]));
  for (const example of examples) {
    if (seen.has(example.id)) {
      failures.push({ id: example.id, message: 'duplicate tool example id' });
      continue;
    }
    seen.add(example.id);
    try {
      validateToolExample(example);
      skillCoverage.set(
        example.skillId,
        (skillCoverage.get(example.skillId) ?? 0) + 1,
      );
      toolExamplePasses.push(example.id);
      if (showDetails) console.log(`[PASS] ${example.id}`);
    } catch (error) {
      failures.push({
        id: example.id ?? 'tool-example',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  for (const [skillId, count] of skillCoverage.entries()) {
    if (count === 0) {
      failures.push({
        id: `tool-example-coverage:${skillId}`,
        message: 'skill has no tool example coverage',
      });
    }
  }
}

function currentGitBranch() {
  const result = spawnSync('git', ['branch', '--show-current'], {
    cwd: root,
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function writeReport(status) {
  if (!reportFile) return;
  const absoluteReportPath = path.isAbsolute(reportFile)
    ? reportFile
    : path.join(root, reportFile);
  fs.mkdirSync(path.dirname(absoluteReportPath), { recursive: true });
  const report = {
    status,
    generatedAt: new Date().toISOString(),
    branch: currentGitBranch(),
    workflow: {
      files: [
        path.relative(root, workflowFile),
        path.relative(root, toolExamplesFile),
        path.relative(root, evalFile),
      ],
      passed: workflowPasses,
    },
    evalCases: {
      total: cases.length,
      passed: passes,
    },
    toolExamples: {
      total: parseToolExamples().length,
      passed: toolExamplePasses,
    },
    modes: {
      backend: runBackend,
      apiReadiness: runApiReadiness,
      apiEmptyCandidate: runApiEmptyCandidate,
      apiFull: runApiFull,
      apiSseAbort: runApiSseAbort,
    },
    failures,
  };
  fs.writeFileSync(absoluteReportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[OK] Wrote Agent skill eval report: ${absoluteReportPath}`);
}

function agentSmokeApiBaseUrl() {
  return (
    process.env.AGENT_SMOKE_API_BASE_URL ??
    process.env.FITMEET_API_BASE_URL ??
    process.env.API_BASE_URL ??
    'http://localhost:3000/api'
  );
}

const cases = parseEvalCases();
try {
  validateWorkflowContract();
} catch (error) {
  failures.push({
    id: 'social-meetup-workflow',
    message: error instanceof Error ? error.message : String(error),
  });
}
const seen = new Set();
for (const caseItem of cases) {
  if (seen.has(caseItem.id)) {
    failures.push({ id: caseItem.id, message: 'duplicate eval id' });
    continue;
  }
  seen.add(caseItem.id);
  try {
    runCase(caseItem);
    passes.push(caseItem.id);
    if (showDetails) console.log(`[PASS] ${caseItem.id}`);
  } catch (error) {
    failures.push({
      id: caseItem.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
validateToolExamples();

if (runBackend) runBackendAssertions();
runApiScenarioAssertions();

if (failures.length > 0) {
  writeReport('failed');
  console.error(
    `[FAIL] Agent skill eval runner failed: ${passes.length}/${cases.length} case(s) passed`,
  );
  for (const failure of failures) {
    console.error(` - ${failure.id}: ${failure.message}`);
  }
  process.exit(1);
}

writeReport('passed');
console.log(
  `[OK] Agent skill eval runner passed: ${passes.length}/${cases.length} case(s), ${toolExamplePasses.length} tool example(s)${runBackend ? ' + backend assertions' : ''}${runApiReadiness || runApiEmptyCandidate || runApiFull || runApiSseAbort ? ' + API scenario smoke' : ''}`,
);
