import { MigrationInterface, QueryRunner } from 'typeorm';

export class AgentPublicLoopP0DatabaseStabilization1781000000000 implements MigrationInterface {
  name = 'AgentPublicLoopP0DatabaseStabilization1781000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const statements = [
      `CREATE TABLE IF NOT EXISTS "agent_side_effect_ledger" (
        "id" SERIAL PRIMARY KEY,
        "ownerUserId" integer NOT NULL,
        "agentTaskId" integer,
        "actionType" varchar(96) NOT NULL,
        "idempotencyKey" varchar(180) NOT NULL,
        "status" varchar NOT NULL DEFAULT 'pending',
        "resourceType" varchar(80) NOT NULL DEFAULT '',
        "resourceId" varchar(120) NOT NULL DEFAULT '',
        "attemptCount" integer NOT NULL DEFAULT 0,
        "leaseOwner" varchar(120),
        "leaseExpiresAt" timestamptz,
        "requestHash" varchar(128) NOT NULL DEFAULT '',
        "result" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "errorMessage" text NOT NULL DEFAULT '',
        "lastAttemptAt" timestamptz,
        "nextRetryAt" timestamptz,
        "completedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`,
      `ALTER TABLE "agent_side_effect_ledger" ADD COLUMN IF NOT EXISTS "leaseOwner" varchar(120)`,
      `ALTER TABLE "agent_side_effect_ledger" ADD COLUMN IF NOT EXISTS "leaseExpiresAt" timestamptz`,
      `ALTER TABLE "agent_side_effect_ledger" ADD COLUMN IF NOT EXISTS "requestHash" varchar(128) NOT NULL DEFAULT ''`,
      `ALTER TABLE "agent_side_effect_ledger" ADD COLUMN IF NOT EXISTS "completedAt" timestamptz`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_agent_side_effect_action_key" ON "agent_side_effect_ledger" ("actionType", "idempotencyKey")`,
      `CREATE INDEX IF NOT EXISTS "idx_agent_side_effect_owner_task" ON "agent_side_effect_ledger" ("ownerUserId", "agentTaskId")`,
      `CREATE INDEX IF NOT EXISTS "idx_agent_side_effect_status_retry" ON "agent_side_effect_ledger" ("status", "nextRetryAt")`,
      `CREATE INDEX IF NOT EXISTS "idx_agent_side_effect_status_lease" ON "agent_side_effect_ledger" ("status", "leaseExpiresAt")`,
      `CREATE INDEX IF NOT EXISTS "idx_agent_side_effect_request_hash" ON "agent_side_effect_ledger" ("actionType", "requestHash") WHERE "requestHash" <> ''`,
      `ALTER TABLE "agent_run_checkpoints" ADD COLUMN IF NOT EXISTS "agentTaskId" integer`,
      `DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'agent_run_checkpoints'
            AND column_name = 'taskId'
            AND table_schema = current_schema()
        ) THEN
          UPDATE "agent_run_checkpoints"
          SET "agentTaskId" = "taskId"
          WHERE "agentTaskId" IS NULL AND "taskId" IS NOT NULL;
        END IF;
      END $$`,
      `ALTER TABLE "agent_run_checkpoints" ALTER COLUMN "agentTaskId" SET NOT NULL`,
      `ALTER TABLE "agent_run_checkpoints" ADD COLUMN IF NOT EXISTS "approvalRequestId" integer`,
      `ALTER TABLE "agent_run_checkpoints" ADD COLUMN IF NOT EXISTS "phase" varchar(80)`,
      `ALTER TABLE "agent_run_checkpoints" ADD COLUMN IF NOT EXISTS "resumePrompt" text NOT NULL DEFAULT ''`,
      `ALTER TABLE "agent_run_checkpoints" ADD COLUMN IF NOT EXISTS "state" jsonb NOT NULL DEFAULT '{}'::jsonb`,
      `ALTER TABLE "agent_run_checkpoints" ADD COLUMN IF NOT EXISTS "steps" jsonb NOT NULL DEFAULT '[]'::jsonb`,
      `ALTER TABLE "agent_run_checkpoints" ADD COLUMN IF NOT EXISTS "events" jsonb NOT NULL DEFAULT '[]'::jsonb`,
      `ALTER TABLE "agent_run_checkpoints" ADD COLUMN IF NOT EXISTS "resumeCount" integer NOT NULL DEFAULT 0`,
      `ALTER TABLE "agent_run_checkpoints" ADD COLUMN IF NOT EXISTS "resumedAt" timestamptz`,
      `ALTER TABLE "agent_run_checkpoints" ALTER COLUMN "runId" TYPE varchar(120) USING "runId"::text`,
      `ALTER TABLE "agent_run_checkpoints" ALTER COLUMN "runId" DROP DEFAULT`,
      `ALTER TABLE "agent_run_checkpoints" ALTER COLUMN "status" SET DEFAULT 'active'`,
      `UPDATE "agent_run_checkpoints" SET "status" = 'active' WHERE "status" = 'open'`,
      `ALTER TABLE "agent_run_checkpoints" ALTER COLUMN "toolName" TYPE varchar(120)`,
      `CREATE INDEX IF NOT EXISTS "idx_agent_run_checkpoints_owner_task_created" ON "agent_run_checkpoints" ("ownerUserId", "agentTaskId", "createdAt")`,
      `CREATE INDEX IF NOT EXISTS "idx_agent_run_checkpoints_approval_status" ON "agent_run_checkpoints" ("approvalRequestId", "status")`,
      `CREATE INDEX IF NOT EXISTS "idx_agent_run_checkpoints_parent" ON "agent_run_checkpoints" ("parentCheckpointId")`,
      `DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE c.conname = 'fk_agent_run_checkpoints_agent_task_id'
            AND t.relname = 'agent_run_checkpoints'
            AND n.nspname = current_schema()
        ) THEN
          ALTER TABLE "agent_run_checkpoints"
          ADD CONSTRAINT "fk_agent_run_checkpoints_agent_task_id"
          FOREIGN KEY ("agentTaskId") REFERENCES "agent_tasks"("id") ON DELETE CASCADE;
        END IF;
      END $$`,
      `DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE c.conname = 'fk_agent_run_checkpoints_approval_request_id'
            AND t.relname = 'agent_run_checkpoints'
            AND n.nspname = current_schema()
        ) THEN
          ALTER TABLE "agent_run_checkpoints"
          ADD CONSTRAINT "fk_agent_run_checkpoints_approval_request_id"
          FOREIGN KEY ("approvalRequestId") REFERENCES "agent_approval_requests"("id") ON DELETE SET NULL;
        END IF;
      END $$`,
      `DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE c.conname = 'fk_agent_run_checkpoints_parent_checkpoint_id'
            AND t.relname = 'agent_run_checkpoints'
            AND n.nspname = current_schema()
        ) THEN
          ALTER TABLE "agent_run_checkpoints"
          ADD CONSTRAINT "fk_agent_run_checkpoints_parent_checkpoint_id"
          FOREIGN KEY ("parentCheckpointId") REFERENCES "agent_run_checkpoints"("id") ON DELETE SET NULL;
        END IF;
      END $$`,
    ];

    for (const statement of statements) {
      await queryRunner.query(statement);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const statements = [
      `ALTER TABLE "agent_run_checkpoints" DROP CONSTRAINT IF EXISTS "fk_agent_run_checkpoints_parent_checkpoint_id"`,
      `ALTER TABLE "agent_run_checkpoints" DROP CONSTRAINT IF EXISTS "fk_agent_run_checkpoints_approval_request_id"`,
      `ALTER TABLE "agent_run_checkpoints" DROP CONSTRAINT IF EXISTS "fk_agent_run_checkpoints_agent_task_id"`,
      `DROP INDEX IF EXISTS "idx_agent_run_checkpoints_parent"`,
      `DROP INDEX IF EXISTS "idx_agent_run_checkpoints_approval_status"`,
      `DROP INDEX IF EXISTS "idx_agent_run_checkpoints_owner_task_created"`,
      `ALTER TABLE "agent_run_checkpoints" ALTER COLUMN "toolName" TYPE varchar(80)`,
      `UPDATE "agent_run_checkpoints" SET "status" = 'open' WHERE "status" = 'active'`,
      `ALTER TABLE "agent_run_checkpoints" ALTER COLUMN "status" SET DEFAULT 'open'`,
      `ALTER TABLE "agent_run_checkpoints" ALTER COLUMN "runId" TYPE integer USING CASE WHEN "runId" ~ '^[0-9]+$' THEN "runId"::integer ELSE NULL END`,
      `ALTER TABLE "agent_run_checkpoints" DROP COLUMN IF EXISTS "agentTaskId"`,
      `DROP INDEX IF EXISTS "idx_agent_side_effect_request_hash"`,
      `DROP INDEX IF EXISTS "idx_agent_side_effect_status_lease"`,
      `ALTER TABLE "agent_side_effect_ledger" DROP COLUMN IF EXISTS "completedAt"`,
      `ALTER TABLE "agent_side_effect_ledger" DROP COLUMN IF EXISTS "requestHash"`,
      `ALTER TABLE "agent_side_effect_ledger" DROP COLUMN IF EXISTS "leaseExpiresAt"`,
      `ALTER TABLE "agent_side_effect_ledger" DROP COLUMN IF EXISTS "leaseOwner"`,
    ];

    for (const statement of statements) {
      await queryRunner.query(statement);
    }
  }
}
