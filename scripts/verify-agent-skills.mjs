#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const skillDir = path.join(root, 'docs', 'agent-skills');
const evalFile = path.join(skillDir, 'eval-cases.jsonl');
const workflowFile = path.join(skillDir, 'social-meetup-workflow.md');
const toolExamplesFile = path.join(skillDir, 'tool-examples.jsonl');
const runnerFile = path.join(root, 'scripts', 'run-agent-skill-evals.mjs');

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

const skillFiles = new Map([
  ['profile_onboarding_skill', 'profile-onboarding.md'],
  ['social_intent_clarifier_skill', 'social-intent-clarifier.md'],
  ['opportunity_card_skill', 'opportunity-card.md'],
  ['discover_publish_skill', 'discover-publish.md'],
  ['candidate_search_skill', 'candidate-search.md'],
  ['candidate_rank_skill', 'candidate-rank.md'],
  ['safety_approval_skill', 'safety-approval.md'],
  ['invitation_skill', 'invitation.md'],
  ['meet_loop_skill', 'meet-loop.md'],
  ['life_graph_memory_skill', 'life-graph-memory.md'],
]);

const requiredEvalIds = [
  'ordinary_chat_no_social_tools',
  'profile_gate_new_user_minimum_questions',
  'ordinary_chat_not_blocked_by_profile_gate',
  'social_intent_extracts_slots_once',
  'correction_updates_candidate_preference_without_reasking_core_slots',
  'twenty_turn_memory_no_repeat_questions',
  'opportunity_card_from_completed_slots',
  'missing_slot_blocks_card_generation',
  'publish_to_discover_requires_approval',
  'discover_card_has_real_detail_link',
  'candidate_empty_safe_fallback',
  'candidate_search_no_mock_supply',
  'candidate_top_three_with_reasons',
  'candidate_preference_uses_public_fields_only',
  'invite_requires_approval_checkpoint',
  'approval_reject_prevents_side_effect',
  'approval_resume_is_idempotent',
  'opener_preview_without_side_effect',
  'send_invite_requires_confirmation',
  'meet_loop_full_state_machine',
  'waiting_reply_missing_connection_no_error_loop',
  'stable_preference_saved_with_evidence',
  'one_off_noise_not_saved',
  'deepseek_quality_routing_not_downgraded',
  'deepseek_context_window_not_truncated',
  'fallback_not_streamed_as_llm_answer',
  'thread_append_no_duplicate_creation',
  'visible_process_overlay_not_timeline',
];

const requiredToolExampleIds = [
  'profile_onboarding_minimum_gate',
  'ordinary_chat_stays_conversation',
  'social_slots_are_extracted_once',
  'correction_updates_public_candidate_preference',
  'opportunity_card_from_slots',
  'discover_publish_checkpoint',
  'candidate_search_public_only',
  'candidate_rank_top_three',
  'candidate_empty_result_fallback',
  'opener_preview_dry_run',
  'invite_send_requires_resume_checkpoint',
  'safety_approval_reject_cancel_side_effect',
  'meet_loop_wait_reply_safe_skip',
  'meet_loop_review_writeback',
  'life_graph_stable_fact_with_evidence',
];

const errors = [];

function fail(message) {
  errors.push(message);
}

function readRequired(file) {
  if (!fs.existsSync(file)) {
    fail(`missing file: ${path.relative(root, file)}`);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
}

for (const [skillId, fileName] of skillFiles.entries()) {
  const source = readRequired(path.join(skillDir, fileName));
  if (!source.includes(`# ${skillId}`)) {
    fail(`${fileName} must start with or include # ${skillId}`);
  }
  for (const section of ['## Purpose', '## Trigger', '## Tools', '## Eval IDs']) {
    if (!source.includes(section)) {
      fail(`${fileName} missing section ${section}`);
    }
  }
}

const readme = readRequired(path.join(skillDir, 'README.md'));
for (const skillId of requiredSkills) {
  if (!readme.includes(skillId)) {
    fail(`README.md does not list ${skillId}`);
  }
}

const contract = readRequired(path.join(skillDir, 'tool-contract.md'));
for (const phrase of [
  'FitMeetAgentToolContract',
  'idempotencyKeyRequired',
  'approvalRequired',
  'dryRunRequired',
  'CandidateEmptyStateCard',
  'Empty Result Rule',
]) {
  if (!contract.includes(phrase)) {
    fail(`tool-contract.md missing ${phrase}`);
  }
}

const workflow = readRequired(workflowFile);
for (const phrase of [
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
  'If candidate search returns no real public candidates',
]) {
  if (!workflow.includes(phrase)) {
    fail(`social-meetup-workflow.md missing ${phrase}`);
  }
}

const evalLines = readRequired(evalFile)
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const seenEvalIds = new Set();
const skillCoverage = new Map(requiredSkills.map((skillId) => [skillId, 0]));

for (const [index, line] of evalLines.entries()) {
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch (error) {
    fail(`eval-cases.jsonl line ${index + 1} is not valid JSON: ${error.message}`);
    continue;
  }
  if (!parsed.id || typeof parsed.id !== 'string') {
    fail(`eval-cases.jsonl line ${index + 1} missing string id`);
    continue;
  }
  if (seenEvalIds.has(parsed.id)) {
    fail(`duplicate eval id: ${parsed.id}`);
  }
  seenEvalIds.add(parsed.id);
  if (!Array.isArray(parsed.skillIds) || parsed.skillIds.length === 0) {
    fail(`${parsed.id} must declare skillIds`);
  } else {
    for (const skillId of parsed.skillIds) {
      if (!requiredSkills.includes(skillId)) {
        fail(`${parsed.id} references unknown skillId ${skillId}`);
      } else {
        skillCoverage.set(skillId, (skillCoverage.get(skillId) ?? 0) + 1);
      }
    }
  }
  if (!parsed.expected || typeof parsed.expected !== 'object') {
    fail(`${parsed.id} must include expected object`);
  }
}

for (const evalId of requiredEvalIds) {
  if (!seenEvalIds.has(evalId)) {
    fail(`missing required eval case: ${evalId}`);
  }
}

for (const [skillId, count] of skillCoverage.entries()) {
  if (count === 0) {
    fail(`skill has no eval coverage: ${skillId}`);
  }
}

const toolExampleLines = readRequired(toolExamplesFile)
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const seenToolExampleIds = new Set();
const toolExampleSkillCoverage = new Map(
  requiredSkills.map((skillId) => [skillId, 0]),
);
for (const [index, line] of toolExampleLines.entries()) {
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch (error) {
    fail(`tool-examples.jsonl line ${index + 1} is not valid JSON: ${error.message}`);
    continue;
  }
  if (!parsed.id || typeof parsed.id !== 'string') {
    fail(`tool-examples.jsonl line ${index + 1} missing string id`);
    continue;
  }
  if (seenToolExampleIds.has(parsed.id)) {
    fail(`duplicate tool example id: ${parsed.id}`);
  }
  seenToolExampleIds.add(parsed.id);
  if (!requiredSkills.includes(parsed.skillId)) {
    fail(`${parsed.id} references unknown skillId ${parsed.skillId}`);
  } else {
    toolExampleSkillCoverage.set(
      parsed.skillId,
      (toolExampleSkillCoverage.get(parsed.skillId) ?? 0) + 1,
    );
  }
  if (
    !Array.isArray(parsed.expectedToolSequence) ||
    parsed.expectedToolSequence.length === 0
  ) {
    fail(`${parsed.id} must include expectedToolSequence`);
  }
  if (!Array.isArray(parsed.expectedEvents)) {
    fail(`${parsed.id} must include expectedEvents`);
  }
  if (!Array.isArray(parsed.expectedToolUi)) {
    fail(`${parsed.id} must include expectedToolUi`);
  }
  if (!parsed.approvalPolicy || typeof parsed.approvalPolicy !== 'string') {
    fail(`${parsed.id} must include approvalPolicy`);
  }
}

for (const exampleId of requiredToolExampleIds) {
  if (!seenToolExampleIds.has(exampleId)) {
    fail(`missing required tool example: ${exampleId}`);
  }
}

for (const [skillId, count] of toolExampleSkillCoverage.entries()) {
  if (count === 0) {
    fail(`skill has no tool example coverage: ${skillId}`);
  }
}

const toolExamplesSource = fs.existsSync(toolExamplesFile)
  ? fs.readFileSync(toolExamplesFile, 'utf8')
  : '';
for (const phrase of [
  '"request_approval"',
  '"approval.required"',
  '"search_public_candidates"',
  '"candidate_empty_result_fallback"',
  '"expectedToolUi":["CandidateEmptyStateCard"]',
  '"mustNot":["fake_candidates","mock_people","CandidateCards"]',
  '"write_life_graph_outcome"',
]) {
  if (!toolExamplesSource.includes(phrase)) {
    fail(`tool-examples.jsonl missing invariant ${phrase}`);
  }
}

const evalSource = fs.existsSync(evalFile) ? fs.readFileSync(evalFile, 'utf8') : '';
for (const phrase of [
  '"mustEmit":"approval.required"',
  '"twenty_turn_memory_no_repeat_questions"',
  '"correction_updates_candidate_preference_without_reasking_core_slots"',
  '"candidate_empty_safe_fallback"',
  '"mustNotFakeCandidates":true',
  '"toolUiType":"CandidateEmptyStateCard"',
  '"mustNotShow":["CandidateCards"]',
  '"sideEffectBeforeApproval":false',
  '"deepseek_quality_routing_not_downgraded"',
  '"deepseek_context_window_not_truncated"',
  '"fallback_not_streamed_as_llm_answer"',
]) {
  if (!evalSource.includes(phrase)) {
    fail(`eval-cases.jsonl missing invariant ${phrase}`);
  }
}

const runnerSource = readRequired(runnerFile);
for (const phrase of [
  'twenty_turn_memory_no_repeat_questions',
  'correction_updates_candidate_preference_without_reasking_core_slots',
  'candidate_empty_safe_fallback',
  'meet_loop_full_state_machine',
  'deepseek_quality_routing_not_downgraded',
  'deepseek_context_window_not_truncated',
  'fallback_not_streamed_as_llm_answer',
  '--backend',
  '--api-readiness',
  '--api-full',
  '--api-sse-abort',
  '--report',
]) {
  if (!runnerSource.includes(phrase)) {
    fail(`run-agent-skill-evals.mjs missing ${phrase}`);
  }
}

if (errors.length > 0) {
  console.error('[FAIL] Agent skills verification failed');
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}

console.log(
  `[OK] Agent skills verified: ${requiredSkills.length} skills, ${seenEvalIds.size} eval cases`,
);
