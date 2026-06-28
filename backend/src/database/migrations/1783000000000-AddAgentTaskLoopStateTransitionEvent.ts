import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAgentTaskLoopStateTransitionEvent1783000000000 implements MigrationInterface {
  name = 'AddAgentTaskLoopStateTransitionEvent1783000000000';
  public readonly transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_type
          WHERE typname = 'agent_task_event_type_enum'
        ) THEN
          ALTER TYPE "agent_task_event_type_enum"
          ADD VALUE IF NOT EXISTS 'social_agent.loop_state.transition';
        END IF;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }

  public async down(): Promise<void> {
    // PostgreSQL does not support safely removing enum values in-place.
  }
}
