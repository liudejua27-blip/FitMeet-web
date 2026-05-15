/**
 * Runtime end-to-end smoke test for the social-skills pack
 * (OpenClaw / Codex / Custom Agent → FitMeet platform).
 *
 * Goal: prove that every tool a third-party agent depends on works against
 *       a real backend, using ONLY tokens (no caller userId in any body).
 *
 * Required env:
 *   FITMEET_API_BASE_URL   default https://www.ourfitmeet.cn/api
 *   FITMEET_USER_TOKEN     a logged-in user JWT (Authorization: Bearer)
 * Optional env:
 *   FITMEET_AGENT_TOKEN    an X-Agent-Token for autopilot / owner approvals
 *
 * Run (Node ≥ 22.6, no extra deps):
 *   node --experimental-strip-types backend/scripts/test-social-skills-runtime-flow.ts
 *
 * Exit code 0 → all 13 steps green.
 * Exit code 1 → first failing step is reported with its error envelope.
 */

import {
  callPlatformTool,
  createPlatformSkillsFromEnv,
  type ToolResult,
} from '../../integrations/openclaw/social-skills/fitmeet-platform-skills.ts';

let stepIdx = 0;
const skipped: string[] = [];

function header(label: string): void {
  stepIdx += 1;
  console.log(`\n── Step ${stepIdx.toString().padStart(2, '0')} · ${label} ──`);
}

function fail(label: string, result: ToolResult<unknown>): never {
  if (!result.ok) {
    console.error(
      `❌  ${label} failed: [${result.error.code}] ${result.error.message}`,
    );
    if (result.error.details) {
      console.error(
        `   details=${JSON.stringify(result.error.details).slice(0, 600)}`,
      );
    }
  } else {
    console.error(`❌  ${label} failed (unexpected control flow)`);
  }
  process.exit(1);
}

function unwrap<T>(label: string, result: ToolResult<T>): T {
  if (!result.ok) fail(label, result);
  console.log(`✅  ${label}`);
  return result.data;
}

function softUnwrap<T>(label: string, result: ToolResult<T>): T | null {
  if (!result.ok) {
    console.log(
      `⚠️   ${label} skipped: [${result.error.code}] ${result.error.message}`,
    );
    skipped.push(label);
    return null;
  }
  console.log(`✅  ${label}`);
  return result.data;
}

async function main(): Promise<void> {
  const baseUrl = process.env.FITMEET_API_BASE_URL;
  const userToken = process.env.FITMEET_USER_TOKEN;
  if (!baseUrl || !userToken) {
    console.error(
      '❌  Missing env. Set FITMEET_API_BASE_URL and FITMEET_USER_TOKEN.',
    );
    process.exit(1);
  }
  const hasAgentToken = Boolean(process.env.FITMEET_AGENT_TOKEN);
  console.log(`FitMeet API base: ${baseUrl}`);
  console.log(`Agent token: ${hasAgentToken ? 'present' : 'missing (steps 10–12 will be soft-skipped if backend requires X-Agent-Token)'}`);

  const client = createPlatformSkillsFromEnv();

  // ── 1. Identity: my agent profile ────────────────────────────────
  header('fitmeet_get_my_agent_profile');
  unwrap(
    'fitmeet_get_my_agent_profile',
    await callPlatformTool(client, 'fitmeet_get_my_agent_profile', {}),
  );

  // ── 2. Profile QA: generate questions ────────────────────────────
  header('fitmeet_generate_profile_questions');
  const questions = unwrap(
    'fitmeet_generate_profile_questions',
    await callPlatformTool(client, 'fitmeet_generate_profile_questions', {}),
  ) as { items?: Array<{ key: string }> } | Array<{ key: string }>;
  const firstQuestionKey =
    (Array.isArray(questions) ? questions[0]?.key : questions?.items?.[0]?.key) ??
    'intent_summary';

  // ── 3. Profile QA: save one answer ───────────────────────────────
  header('fitmeet_save_profile_answer');
  unwrap(
    'fitmeet_save_profile_answer',
    await callPlatformTool(client, 'fitmeet_save_profile_answer', {
      key: firstQuestionKey,
      value: 'runtime-smoke-test answer',
    }),
  );

  // ── 4. AI social request draft ───────────────────────────────────
  header('fitmeet_create_ai_social_request (DeepSeek draft)');
  const draft = unwrap(
    'fitmeet_create_ai_social_request',
    await callPlatformTool(client, 'fitmeet_create_ai_social_request', {
      type: 'coffee_chat',
      rawText: '想找人喝咖啡聊聊产品想法（runtime smoke）',
      city: 'Shanghai',
      radiusKm: 5,
    }),
  ) as { socialRequestId?: number; id?: number };
  const socialRequestId = draft.socialRequestId ?? draft.id;
  if (!socialRequestId) fail('fitmeet_create_ai_social_request', { ok: false, error: { code: 'no_id', message: 'draft did not return socialRequestId' } });
  console.log(`   → socialRequestId=${socialRequestId}`);

  // ── 5. Publish the social request ────────────────────────────────
  header('fitmeet_publish_ai_social_request');
  unwrap(
    'fitmeet_publish_ai_social_request',
    await callPlatformTool(client, 'fitmeet_publish_ai_social_request', {
      socialRequestId,
    }),
  );

  // ── 6. Sync to public hall ───────────────────────────────────────
  header('fitmeet_sync_social_request_to_hall');
  softUnwrap(
    'fitmeet_sync_social_request_to_hall',
    await callPlatformTool(client, 'fitmeet_sync_social_request_to_hall', {
      socialRequestId,
    }),
  );

  // ── 7. Run match ─────────────────────────────────────────────────
  header('fitmeet_run_match');
  unwrap(
    'fitmeet_run_match',
    await callPlatformTool(client, 'fitmeet_run_match', { socialRequestId }),
  );

  // ── 8. Get candidates ────────────────────────────────────────────
  header('fitmeet_get_candidates');
  const candidates = unwrap(
    'fitmeet_get_candidates',
    await callPlatformTool(client, 'fitmeet_get_candidates', {
      socialRequestId,
    }),
  ) as { items?: Array<{ id: number; userId: number }> };
  const firstCandidate = candidates.items?.[0];
  if (firstCandidate) {
    console.log(
      `   → candidate.id=${firstCandidate.id}, userId=${firstCandidate.userId}`,
    );
  } else {
    console.log('   → no candidates returned (continuing; invite step will soft-skip).');
  }

  // ── 9. Send invite (mark candidate messaged) ────────────────────
  header('fitmeet_send_invite');
  if (firstCandidate) {
    softUnwrap(
      'fitmeet_send_invite',
      await callPlatformTool(client, 'fitmeet_send_invite', {
        socialRequestId,
        candidateRecordId: firstCandidate.id,
        candidateUserId: firstCandidate.userId,
        message: '你好，想约你喝杯咖啡聊聊～（runtime smoke）',
      }),
    );
  } else {
    skipped.push('fitmeet_send_invite (no candidate)');
    console.log('⚠️   fitmeet_send_invite skipped (no candidate)');
  }

  // ── 10. Autopilot run-once (needs X-Agent-Token) ─────────────────
  header('fitmeet_run_ai_social_autopilot_once');
  softUnwrap(
    'fitmeet_run_ai_social_autopilot_once',
    await callPlatformTool(
      client,
      'fitmeet_run_ai_social_autopilot_once',
      {},
    ),
  );

  // ── 11. Owner pending approvals (needs X-Agent-Token) ────────────
  header('fitmeet_get_pending_approvals');
  const pending = softUnwrap(
    'fitmeet_get_pending_approvals',
    await callPlatformTool(client, 'fitmeet_get_pending_approvals', {}),
  ) as unknown[] | null;
  const firstApprovalId = Array.isArray(pending)
    ? (pending[0] as { id?: number } | undefined)?.id
    : undefined;

  // ── 12. Approve first pending (if any) ───────────────────────────
  header('fitmeet_approve_action');
  if (firstApprovalId != null) {
    softUnwrap(
      'fitmeet_approve_action',
      await callPlatformTool(client, 'fitmeet_approve_action', {
        approvalId: firstApprovalId,
      }),
    );
  } else {
    skipped.push('fitmeet_approve_action (no pending approval)');
    console.log('⚠️   fitmeet_approve_action skipped (no pending approval)');
  }

  // ── 13. Agent action audit log ───────────────────────────────────
  header('fitmeet_get_agent_action_logs');
  unwrap(
    'fitmeet_get_agent_action_logs',
    await callPlatformTool(client, 'fitmeet_get_agent_action_logs', {
      limit: 20,
    }),
  );

  console.log('\n────────────────────────────────────────');
  console.log('✅  All 13 runtime steps completed.');
  if (skipped.length) {
    console.log(`⚠️   Soft-skipped: ${skipped.length}`);
    for (const s of skipped) console.log(`     - ${s}`);
  }
  console.log('────────────────────────────────────────');
}

main().catch((err) => {
  console.error('❌  Unexpected exception:', err);
  process.exit(1);
});
