import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSocialAgentReplyLoop1773400000000 implements MigrationInterface {
  name = 'AddSocialAgentReplyLoop1773400000000';
  transaction = false as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const value of ['waiting_result', 'waiting_reply']) {
      await queryRunner.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_enum e
              JOIN pg_type t ON t.oid = e.enumtypid
              WHERE t.typname = 'agent_task_status_enum'
                AND e.enumlabel = '${value}'
          ) THEN
            EXECUTE 'ALTER TYPE "agent_task_status_enum" ADD VALUE ''${value}''';
          END IF;
        END $$;
      `);
    }

    await queryRunner.query(
      `ALTER TABLE "agent_tasks" ADD COLUMN IF NOT EXISTS "memory" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "agent_tasks" DROP COLUMN IF EXISTS "memory"`,
    );
  }
}
