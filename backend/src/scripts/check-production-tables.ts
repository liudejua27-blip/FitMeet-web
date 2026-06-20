import 'reflect-metadata';

import dataSource from '../database/data-source';

const REQUIRED_TABLES = [
  'users',
  'agent_profiles',
  'user_social_profiles',
  'activity_templates',
  'subagent_worker_jobs',
  'subagent_worker_heartbeats',
  'subagent_worker_failures',
  'agent_activity_logs',
  'social_request_candidates',
  'life_graph_profiles',
  'life_graph_access_audit_logs',
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
