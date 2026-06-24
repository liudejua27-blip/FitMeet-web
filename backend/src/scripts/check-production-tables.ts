import 'reflect-metadata';

import dataSource from '../database/data-source';

const REQUIRED_TABLES = [
  'activity_templates',
  'activity_proofs',
  'admin_audit_logs',
  'admin_permissions',
  'admin_roles',
  'admin_user_roles',
  'agent_action_logs',
  'agent_activity_logs',
  'agent_approval_requests',
  'agent_connections',
  'agent_eval_cases',
  'agent_meet_loop_states',
  'agent_memory_updates',
  'agent_messages',
  'agent_online_replay_samples',
  'agent_permissions',
  'agent_profiles',
  'agent_reflection_runs',
  'agent_run_checkpoints',
  'agent_run_steps',
  'agent_runs',
  'agent_settings',
  'agent_skill_patch_effects',
  'agent_skill_patches',
  'agent_subagent_memory',
  'agent_task_events',
  'agent_tasks',
  'agent_tool_calls',
  'ai_delegate_profiles',
  'ai_match_sessions',
  'contact_requests',
  'emergency_contacts',
  'follows',
  'invite_codes',
  'life_graph_access_audit_logs',
  'life_graph_audit_logs',
  'life_graph_corrections',
  'life_graph_events',
  'life_graph_fields',
  'life_graph_profiles',
  'life_graph_proposals',
  'life_graph_security_requests',
  'life_graph_signal_scores',
  'life_graph_update_audits',
  'match_candidates',
  'meet_participants',
  'meets',
  'payment_intents',
  'public_social_intents',
  'safety_events',
  'safety_reports',
  'social_activities',
  'social_agent_long_term_memory',
  'social_agent_message_feedback',
  'social_agent_reminder_preferences',
  'social_agent_reminders',
  'social_agent_user_interest_events',
  'social_request_candidates',
  'social_requests',
  'subagent_worker_failures',
  'subagent_worker_heartbeats',
  'subagent_worker_jobs',
  'user_blocks',
  'user_preferences',
  'user_social_profiles',
  'user_social_requests',
  'users',
  'verification_requests',
  'waitlist_analytics_events',
  'waitlist_app_entries',
] as const;

type TableCheckRow = {
  tableName: string | null;
};

async function main() {
  await dataSource.initialize();
  try {
    const missing: string[] = [];
    for (const table of REQUIRED_TABLES) {
      const rawRows: unknown = await dataSource.query(
        `SELECT to_regclass($1) AS "tableName"`,
        [`public.${table}`],
      );
      const rows = Array.isArray(rawRows) ? (rawRows as TableCheckRow[]) : [];
      if (!rows?.[0]?.tableName) missing.push(table);
    }

    if (missing.length > 0) {
      throw new Error(
        `Missing critical production table(s): ${missing.join(', ')}`,
      );
    }

    console.log(
      JSON.stringify({
        status: 'ok',
        tables: REQUIRED_TABLES,
      }),
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exit(1);
});
