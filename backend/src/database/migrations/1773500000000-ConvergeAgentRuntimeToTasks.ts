import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConvergeAgentRuntimeToTasks1773500000000 implements MigrationInterface {
  name = 'ConvergeAgentRuntimeToTasks1773500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "agent_approval_requests" ADD COLUMN IF NOT EXISTS "agentTaskId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_action_logs" ADD COLUMN IF NOT EXISTS "agentTaskId" integer`,
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_agent_approval_requests_task'
        ) THEN
          ALTER TABLE "agent_approval_requests"
          ADD CONSTRAINT "fk_agent_approval_requests_task"
          FOREIGN KEY ("agentTaskId") REFERENCES "agent_tasks"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_agent_action_logs_task'
        ) THEN
          ALTER TABLE "agent_action_logs"
          ADD CONSTRAINT "fk_agent_action_logs_task"
          FOREIGN KEY ("agentTaskId") REFERENCES "agent_tasks"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_agent_approval_requests_task" ON "agent_approval_requests" ("agentTaskId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_agent_action_logs_task_created" ON "agent_action_logs" ("agentTaskId", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_action_logs_task_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_approval_requests_task"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_action_logs" DROP CONSTRAINT IF EXISTS "fk_agent_action_logs_task"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_approval_requests" DROP CONSTRAINT IF EXISTS "fk_agent_approval_requests_task"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_action_logs" DROP COLUMN IF EXISTS "agentTaskId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_approval_requests" DROP COLUMN IF EXISTS "agentTaskId"`,
    );
  }
}
