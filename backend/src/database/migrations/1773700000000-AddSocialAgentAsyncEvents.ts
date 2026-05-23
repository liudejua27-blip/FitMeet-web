import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSocialAgentAsyncEvents1773700000000 implements MigrationInterface {
  name = 'AddSocialAgentAsyncEvents1773700000000';
  transaction = false as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const value of [
      'social_agent.context.appended',
      'social_agent.replan.queued',
      'social_agent.replan.started',
      'social_agent.replan.completed',
      'social_agent.replan.failed',
      'social_agent.llm.timeout',
    ]) {
      await queryRunner.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_enum e
              JOIN pg_type t ON t.oid = e.enumtypid
              WHERE t.typname = 'agent_task_event_type_enum'
                AND e.enumlabel = '${value}'
          ) THEN
            EXECUTE 'ALTER TYPE "agent_task_event_type_enum" ADD VALUE ''${value}''';
          END IF;
        END $$;
      `);
    }
  }

  public async down(): Promise<void> {
    return Promise.resolve();
  }
}
