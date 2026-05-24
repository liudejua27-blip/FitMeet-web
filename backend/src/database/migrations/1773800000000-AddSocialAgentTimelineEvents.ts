import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSocialAgentTimelineEvents1773800000000 implements MigrationInterface {
  name = 'AddSocialAgentTimelineEvents1773800000000';
  transaction = false as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const value of [
      'tool.failed',
      'social_agent.message.user',
      'social_agent.message.assistant',
      'social_agent.candidates.returned',
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
