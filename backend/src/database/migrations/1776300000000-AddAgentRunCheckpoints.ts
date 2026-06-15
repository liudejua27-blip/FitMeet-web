import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAgentRunCheckpoints1776300000000 implements MigrationInterface {
  name = 'AddAgentRunCheckpoints1776300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_run_checkpoint_type_enum') THEN
          CREATE TYPE "agent_run_checkpoint_type_enum" AS ENUM ('step', 'interrupt', 'result', 'replay', 'fork');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_run_checkpoint_status_enum') THEN
          CREATE TYPE "agent_run_checkpoint_status_enum" AS ENUM ('active', 'resumed', 'replayed', 'forked', 'expired');
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_run_checkpoints" (
        "id" SERIAL PRIMARY KEY,
        "ownerUserId" integer NOT NULL,
        "agentTaskId" integer NOT NULL,
        "approvalRequestId" integer,
        "parentCheckpointId" integer,
        "type" "agent_run_checkpoint_type_enum" NOT NULL DEFAULT 'step',
        "status" "agent_run_checkpoint_status_enum" NOT NULL DEFAULT 'active',
        "runId" character varying(120),
        "traceId" character varying(120),
        "phase" character varying(80),
        "toolName" character varying(120),
        "stepId" character varying(120),
        "resumePrompt" text NOT NULL DEFAULT '',
        "state" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "steps" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "result" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "events" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "resumeCount" integer NOT NULL DEFAULT 0,
        "replayCount" integer NOT NULL DEFAULT 0,
        "forkCount" integer NOT NULL DEFAULT 0,
        "resumedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_agent_run_checkpoints_owner"
          FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_agent_run_checkpoints_task"
          FOREIGN KEY ("agentTaskId") REFERENCES "agent_tasks"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_agent_run_checkpoints_approval"
          FOREIGN KEY ("approvalRequestId") REFERENCES "agent_approval_requests"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_agent_run_checkpoints_parent"
          FOREIGN KEY ("parentCheckpointId") REFERENCES "agent_run_checkpoints"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_agent_run_checkpoints_owner_task_created"
        ON "agent_run_checkpoints" ("ownerUserId", "agentTaskId", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_agent_run_checkpoints_approval_status"
        ON "agent_run_checkpoints" ("approvalRequestId", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_agent_run_checkpoints_parent"
        ON "agent_run_checkpoints" ("parentCheckpointId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_run_checkpoints_parent"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_run_checkpoints_approval_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_run_checkpoints_owner_task_created"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_run_checkpoints"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "agent_run_checkpoint_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "agent_run_checkpoint_type_enum"`,
    );
  }
}
