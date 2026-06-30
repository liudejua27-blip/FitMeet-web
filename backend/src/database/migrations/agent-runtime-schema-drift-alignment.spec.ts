import { QueryRunner } from 'typeorm';

import { AgentRuntimeSchemaDriftAlignment1783200000000 } from './1783200000000-AgentRuntimeSchemaDriftAlignment';

describe('AgentRuntimeSchemaDriftAlignment migration', () => {
  function makeQueryRunner() {
    return {
      query: jest.fn(),
    } as unknown as QueryRunner & { query: jest.Mock };
  }

  it('adds runtime columns required by life graph, interest events, and matching', async () => {
    const migration = new AgentRuntimeSchemaDriftAlignment1783200000000();
    const queryRunner = makeQueryRunner();

    await migration.up(queryRunner);

    const sql = queryRunner.query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n');
    expect(sql).toContain(
      'ALTER TABLE "life_graph_events" ADD COLUMN IF NOT EXISTS "taskId"',
    );
    expect(sql).toContain(
      'ALTER TABLE "life_graph_events" ADD COLUMN IF NOT EXISTS "candidateUserId"',
    );
    expect(sql).toContain(
      'ALTER TABLE "life_graph_signal_scores" ADD COLUMN IF NOT EXISTS "source"',
    );
    expect(sql).toContain(
      'ALTER TABLE "social_agent_user_interest_events" ADD COLUMN IF NOT EXISTS "activityId"',
    );
    expect(sql).toContain('table_schema = current_schema()');
    expect(sql).toContain('idx_life_graph_events_user_task_created');
    expect(sql).toContain('idx_social_agent_user_interest_events_activity');
  });

  it('only removes indexes on rollback to avoid deleting pre-existing production columns', async () => {
    const migration = new AgentRuntimeSchemaDriftAlignment1783200000000();
    const queryRunner = makeQueryRunner();

    await migration.down(queryRunner);

    const sql = queryRunner.query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n');
    expect(sql).toContain(
      'DROP INDEX IF EXISTS "idx_social_agent_user_interest_events_activity"',
    );
    expect(sql).not.toContain('DROP COLUMN');
  });
});
