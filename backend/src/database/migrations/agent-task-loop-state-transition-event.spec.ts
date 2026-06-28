import { QueryRunner } from 'typeorm';

import { AddAgentTaskLoopStateTransitionEvent1783000000000 } from './1783000000000-AddAgentTaskLoopStateTransitionEvent';

describe('AddAgentTaskLoopStateTransitionEvent migration', () => {
  function makeQueryRunner() {
    return {
      query: jest.fn(),
    } as unknown as QueryRunner & { query: jest.Mock };
  }

  it('adds the loop transition event type to the existing Postgres enum', async () => {
    const migration = new AddAgentTaskLoopStateTransitionEvent1783000000000();
    const queryRunner = makeQueryRunner();

    await migration.up(queryRunner);

    const sql = queryRunner.query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n');
    expect(sql).toContain('ALTER TYPE "agent_task_event_type_enum"');
    expect(sql).toContain(
      "ADD VALUE IF NOT EXISTS 'social_agent.loop_state.transition'",
    );
  });

  it('keeps down migration as a safe no-op because enum value removal is unsafe', async () => {
    const migration = new AddAgentTaskLoopStateTransitionEvent1783000000000();
    const queryRunner = makeQueryRunner();

    await migration.down();

    expect(queryRunner.query).not.toHaveBeenCalled();
  });
});
