import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Social Agent Runtime — foundational layer.
 *
 * Adds the simple, self-contained `agent_tasks` + `agent_task_events` pair
 * that powers the new agent loop (understand goal → plan → call tools →
 * wait for confirmation → execute → listen for feedback). The older
 * fine-grained `agent_runtime_*` tables added in 1773100000000 are left
 * unchanged.
 */
export class AddAgentTaskRuntime1773200000000 implements MigrationInterface {
  name = 'AddAgentTaskRuntime1773200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_task_status_enum" AS ENUM (
          'pending', 'planning', 'awaiting_confirmation', 'executing',
          'awaiting_feedback', 'succeeded', 'failed', 'cancelled'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_task_permission_mode_enum" AS ENUM (
          'assist', 'confirm', 'limited_auto'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_task_risk_level_enum" AS ENUM (
          'low', 'medium', 'high', 'blocked'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_task_event_type_enum" AS ENUM (
          'task.created', 'goal.understood',
          'plan.generated', 'plan.updated',
          'step.started', 'tool.called', 'tool.returned',
          'confirmation.requested', 'confirmation.received',
          'step.completed', 'feedback.received',
          'task.succeeded', 'task.failed', 'task.cancelled',
          'note'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_task_event_actor_enum" AS ENUM (
          'agent', 'user', 'system', 'tool'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_tasks" (
        "id" SERIAL PRIMARY KEY,
        "ownerUserId" integer NOT NULL,
        "agentConnectionId" integer,
        "taskType" varchar(80) NOT NULL DEFAULT 'social_goal',
        "title" varchar(200) NOT NULL DEFAULT '',
        "goal" text NOT NULL DEFAULT '',
        "input" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "plan" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "toolCalls" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "result" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "status" "agent_task_status_enum" NOT NULL DEFAULT 'pending',
        "permissionMode" "agent_task_permission_mode_enum" NOT NULL DEFAULT 'confirm',
        "riskLevel" "agent_task_risk_level_enum" NOT NULL DEFAULT 'low',
        "idempotencyKey" varchar(120),
        "statusReason" text,
        "error" jsonb,
        "startedAt" timestamptz,
        "awaitingConfirmationAt" timestamptz,
        "completedAt" timestamptz,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_agent_tasks_owner" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_agent_tasks_connection" FOREIGN KEY ("agentConnectionId") REFERENCES "agent_connections"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_task_events" (
        "id" SERIAL PRIMARY KEY,
        "taskId" integer NOT NULL,
        "ownerUserId" integer NOT NULL,
        "eventType" "agent_task_event_type_enum" NOT NULL,
        "actor" "agent_task_event_actor_enum" NOT NULL DEFAULT 'agent',
        "summary" varchar(500) NOT NULL DEFAULT '',
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "stepId" varchar(80),
        "toolCallId" varchar(80),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_agent_task_events_task" FOREIGN KEY ("taskId") REFERENCES "agent_tasks"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_agent_task_events_owner" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_agent_tasks_owner_status_updated" ON "agent_tasks" ("ownerUserId", "status", "updatedAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_agent_tasks_agent_status" ON "agent_tasks" ("agentConnectionId", "status")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uniq_agent_tasks_idempotency_key" ON "agent_tasks" ("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_agent_task_events_task_created" ON "agent_task_events" ("taskId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_agent_task_events_owner_type_created" ON "agent_task_events" ("ownerUserId", "eventType", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_task_events_owner_type_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_task_events_task_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uniq_agent_tasks_idempotency_key"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_tasks_agent_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_tasks_owner_status_updated"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_task_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_tasks"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "agent_task_event_actor_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "agent_task_event_type_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_task_risk_level_enum"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "agent_task_permission_mode_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_task_status_enum"`);
  }
}
