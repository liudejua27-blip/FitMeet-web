#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const skillDir = path.join(root, 'docs', 'agent-skills');
const evalFile = path.join(skillDir, 'eval-cases.jsonl');
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
  'Empty Result Rule',
]) {
  if (!contract.includes(phrase)) {
    fail(`tool-contract.md missing ${phrase}`);
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

const evalSource = fs.existsSync(evalFile) ? fs.readFileSync(evalFile, 'utf8') : '';
for (const phrase of [
  '"mustEmit":"approval.required"',
  '"twenty_turn_memory_no_repeat_questions"',
  '"candidate_empty_safe_fallback"',
  '"mustNotFakeCandidates":true',
  '"sideEffectBeforeApproval":false',
]) {
  if (!evalSource.includes(phrase)) {
    fail(`eval-cases.jsonl missing invariant ${phrase}`);
  }
}

const runnerSource = readRequired(runnerFile);
for (const phrase of [
  'twenty_turn_memory_no_repeat_questions',
  'candidate_empty_safe_fallback',
  'meet_loop_full_state_machine',
  '--backend',
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
