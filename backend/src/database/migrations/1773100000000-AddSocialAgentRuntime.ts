import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSocialAgentRuntime1773100000000
  implements MigrationInterface
{
  name = 'AddSocialAgentRuntime1773100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_runtime_permission_mode_enum" AS ENUM (
          'assist', 'confirm', 'limited_auto'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_runtime_task_status_enum" AS ENUM (
          'queued', 'planning', 'running', 'waiting_confirmation',
          'succeeded', 'failed', 'cancelled'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_runtime_risk_level_enum" AS ENUM (
          'low', 'medium', 'high', 'blocked'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_runtime_goal_status_enum" AS ENUM (
          'active', 'satisfied', 'failed', 'cancelled'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_runtime_plan_status_enum" AS ENUM (
          'draft', 'active', 'superseded', 'completed', 'failed'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_runtime_step_status_enum" AS ENUM (
          'planned', 'running', 'waiting_confirmation', 'retrying',
          'skipped', 'succeeded', 'failed', 'cancelled'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_runtime_tool_call_status_enum" AS ENUM (
          'planned', 'running', 'waiting_confirmation', 'succeeded',
          'failed', 'blocked'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_runtime_result_status_enum" AS ENUM (
          'pending', 'succeeded', 'partial', 'failed'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_runtime_log_level_enum" AS ENUM (
          'debug', 'info', 'warn', 'error', 'audit'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_runtime_tasks" (
        "id" SERIAL PRIMARY KEY,
        "ownerUserId" integer NOT NULL,
        "agentConnectionId" integer,
        "source" varchar(80) NOT NULL DEFAULT 'social_agent_runtime',
        "permissionMode" "agent_runtime_permission_mode_enum" NOT NULL DEFAULT 'assist',
        "taskType" varchar(80) NOT NULL DEFAULT 'social_goal',
        "title" varchar(200) NOT NULL DEFAULT '',
        "goalSummary" text NOT NULL DEFAULT '',
        "status" "agent_runtime_task_status_enum" NOT NULL DEFAULT 'queued',
        "riskLevel" "agent_runtime_risk_level_enum" NOT NULL DEFAULT 'low',
        "priority" integer NOT NULL DEFAULT 0,
        "idempotencyKey" varchar(120),
        "context" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "memory" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "resultSummary" text NOT NULL DEFAULT '',
        "resultPayload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "errorCode" varchar(80),
        "errorMessage" text,
        "retryCount" integer NOT NULL DEFAULT 0,
        "maxRetries" integer NOT NULL DEFAULT 3,
        "lockedAt" timestamptz,
        "startedAt" timestamptz,
        "waitingForUserAt" timestamptz,
        "completedAt" timestamptz,
        "failedAt" timestamptz,
        "cancelledAt" timestamptz,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_agent_runtime_tasks_owner" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_agent_runtime_tasks_connection" FOREIGN KEY ("agentConnectionId") REFERENCES "agent_connections"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_runtime_goals" (
        "id" SERIAL PRIMARY KEY,
        "taskId" integer NOT NULL,
        "ownerUserId" integer NOT NULL,
        "goalType" varchar(80) NOT NULL DEFAULT 'social',
        "title" varchar(200) NOT NULL DEFAULT '',
        "description" text NOT NULL DEFAULT '',
        "status" "agent_runtime_goal_status_enum" NOT NULL DEFAULT 'active',
        "priority" integer NOT NULL DEFAULT 0,
        "successCriteria" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "constraints" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "targetProfile" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "resultPayload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_agent_runtime_goals_task" FOREIGN KEY ("taskId") REFERENCES "agent_runtime_tasks"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_agent_runtime_goals_owner" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_runtime_plans" (
        "id" SERIAL PRIMARY KEY,
        "taskId" integer NOT NULL,
        "ownerUserId" integer NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        "status" "agent_runtime_plan_status_enum" NOT NULL DEFAULT 'draft',
        "rationale" text NOT NULL DEFAULT '',
        "steps" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "riskAssessment" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "activatedAt" timestamptz,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_agent_runtime_plans_task" FOREIGN KEY ("taskId") REFERENCES "agent_runtime_tasks"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_agent_runtime_plans_owner" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_runtime_steps" (
        "id" SERIAL PRIMARY KEY,
        "taskId" integer NOT NULL,
        "planId" integer,
        "ownerUserId" integer NOT NULL,
        "stepOrder" integer NOT NULL DEFAULT 0,
        "title" varchar(200) NOT NULL DEFAULT '',
        "actionType" varchar(80) NOT NULL DEFAULT '',
        "toolName" varchar(120),
        "status" "agent_runtime_step_status_enum" NOT NULL DEFAULT 'planned',
        "riskLevel" "agent_runtime_risk_level_enum" NOT NULL DEFAULT 'low',
        "requiresUserConfirmation" boolean NOT NULL DEFAULT false,
        "approvalRequestId" integer,
        "idempotencyKey" varchar(120),
        "inputPayload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "outputPayload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "errorCode" varchar(80),
        "errorMessage" text,
        "attemptCount" integer NOT NULL DEFAULT 0,
        "maxAttempts" integer NOT NULL DEFAULT 3,
        "scheduledAt" timestamptz,
        "startedAt" timestamptz,
        "waitingForUserAt" timestamptz,
        "completedAt" timestamptz,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_agent_runtime_steps_task" FOREIGN KEY ("taskId") REFERENCES "agent_runtime_tasks"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_agent_runtime_steps_plan" FOREIGN KEY ("planId") REFERENCES "agent_runtime_plans"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_agent_runtime_steps_owner" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_agent_runtime_steps_approval" FOREIGN KEY ("approvalRequestId") REFERENCES "agent_approval_requests"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_runtime_tool_calls" (
        "id" SERIAL PRIMARY KEY,
        "taskId" integer NOT NULL,
        "stepId" integer,
        "ownerUserId" integer NOT NULL,
        "agentConnectionId" integer,
        "toolName" varchar(120) NOT NULL,
        "toolAction" varchar(120) NOT NULL DEFAULT '',
        "status" "agent_runtime_tool_call_status_enum" NOT NULL DEFAULT 'planned',
        "riskLevel" "agent_runtime_risk_level_enum" NOT NULL DEFAULT 'low',
        "requiresUserConfirmation" boolean NOT NULL DEFAULT false,
        "approvalRequestId" integer,
        "idempotencyKey" varchar(120),
        "requestPayload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "responsePayload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "errorCode" varchar(80),
        "errorMessage" text,
        "durationMs" integer,
        "startedAt" timestamptz,
        "completedAt" timestamptz,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_agent_runtime_tool_calls_task" FOREIGN KEY ("taskId") REFERENCES "agent_runtime_tasks"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_agent_runtime_tool_calls_step" FOREIGN KEY ("stepId") REFERENCES "agent_runtime_steps"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_agent_runtime_tool_calls_owner" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_agent_runtime_tool_calls_connection" FOREIGN KEY ("agentConnectionId") REFERENCES "agent_connections"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_agent_runtime_tool_calls_approval" FOREIGN KEY ("approvalRequestId") REFERENCES "agent_approval_requests"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_runtime_results" (
        "id" SERIAL PRIMARY KEY,
        "taskId" integer NOT NULL,
        "stepId" integer,
        "toolCallId" integer,
        "ownerUserId" integer NOT NULL,
        "resultType" varchar(80) NOT NULL DEFAULT 'runtime',
        "status" "agent_runtime_result_status_enum" NOT NULL DEFAULT 'pending',
        "summary" varchar(500) NOT NULL DEFAULT '',
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "targetUserId" integer,
        "relatedSocialRequestId" integer,
        "relatedCandidateId" integer,
        "relatedActivityId" integer,
        "paymentReference" varchar(120),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_agent_runtime_results_task" FOREIGN KEY ("taskId") REFERENCES "agent_runtime_tasks"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_agent_runtime_results_step" FOREIGN KEY ("stepId") REFERENCES "agent_runtime_steps"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_agent_runtime_results_tool_call" FOREIGN KEY ("toolCallId") REFERENCES "agent_runtime_tool_calls"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_agent_runtime_results_owner" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_runtime_logs" (
        "id" SERIAL PRIMARY KEY,
        "taskId" integer NOT NULL,
        "stepId" integer,
        "toolCallId" integer,
        "ownerUserId" integer NOT NULL,
        "level" "agent_runtime_log_level_enum" NOT NULL DEFAULT 'info',
        "eventType" varchar(100) NOT NULL,
        "message" text NOT NULL DEFAULT '',
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_agent_runtime_logs_task" FOREIGN KEY ("taskId") REFERENCES "agent_runtime_tasks"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_agent_runtime_logs_step" FOREIGN KEY ("stepId") REFERENCES "agent_runtime_steps"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_agent_runtime_logs_tool_call" FOREIGN KEY ("toolCallId") REFERENCES "agent_runtime_tool_calls"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_agent_runtime_logs_owner" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agent_runtime_tasks_owner_status_updated" ON "agent_runtime_tasks" ("ownerUserId", "status", "updatedAt")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agent_runtime_tasks_agent_status" ON "agent_runtime_tasks" ("agentConnectionId", "status")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uniq_agent_runtime_tasks_idempotency_key" ON "agent_runtime_tasks" ("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agent_runtime_goals_task_status" ON "agent_runtime_goals" ("taskId", "status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agent_runtime_goals_owner_status" ON "agent_runtime_goals" ("ownerUserId", "status")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uniq_agent_runtime_plans_task_version" ON "agent_runtime_plans" ("taskId", "version")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agent_runtime_plans_task_status" ON "agent_runtime_plans" ("taskId", "status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agent_runtime_plans_owner_status" ON "agent_runtime_plans" ("ownerUserId", "status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agent_runtime_steps_task_order" ON "agent_runtime_steps" ("taskId", "stepOrder")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agent_runtime_steps_plan_status" ON "agent_runtime_steps" ("planId", "status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agent_runtime_steps_owner_status" ON "agent_runtime_steps" ("ownerUserId", "status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agent_runtime_steps_approval" ON "agent_runtime_steps" ("approvalRequestId")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uniq_agent_runtime_steps_idempotency_key" ON "agent_runtime_steps" ("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agent_runtime_tool_calls_task_created" ON "agent_runtime_tool_calls" ("taskId", "createdAt")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agent_runtime_tool_calls_step_created" ON "agent_runtime_tool_calls" ("stepId", "createdAt")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agent_runtime_tool_calls_owner_status" ON "agent_runtime_tool_calls" ("ownerUserId", "status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agent_runtime_tool_calls_tool_status" ON "agent_runtime_tool_calls" ("toolName", "status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agent_runtime_tool_calls_approval" ON "agent_runtime_tool_calls" ("approvalRequestId")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uniq_agent_runtime_tool_calls_idempotency_key" ON "agent_runtime_tool_calls" ("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agent_runtime_results_task_created" ON "agent_runtime_results" ("taskId", "createdAt")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agent_runtime_results_owner_type_created" ON "agent_runtime_results" ("ownerUserId", "resultType", "createdAt")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agent_runtime_results_target_user" ON "agent_runtime_results" ("targetUserId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agent_runtime_results_related_social_request" ON "agent_runtime_results" ("relatedSocialRequestId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agent_runtime_results_related_candidate" ON "agent_runtime_results" ("relatedCandidateId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agent_runtime_results_related_activity" ON "agent_runtime_results" ("relatedActivityId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agent_runtime_logs_task_created" ON "agent_runtime_logs" ("taskId", "createdAt")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agent_runtime_logs_owner_event_created" ON "agent_runtime_logs" ("ownerUserId", "eventType", "createdAt")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agent_runtime_logs_level_created" ON "agent_runtime_logs" ("level", "createdAt")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agent_runtime_logs_tool_call" ON "agent_runtime_logs" ("toolCallId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_runtime_logs_tool_call"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_runtime_logs_level_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_runtime_logs_owner_event_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_runtime_logs_task_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_runtime_results_related_activity"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_runtime_results_related_candidate"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_runtime_results_related_social_request"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_runtime_results_target_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_runtime_results_owner_type_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_runtime_results_task_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uniq_agent_runtime_tool_calls_idempotency_key"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_runtime_tool_calls_approval"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_runtime_tool_calls_tool_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_runtime_tool_calls_owner_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_runtime_tool_calls_step_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_runtime_tool_calls_task_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uniq_agent_runtime_steps_idempotency_key"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_runtime_steps_approval"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_runtime_steps_owner_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_runtime_steps_plan_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_runtime_steps_task_order"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_runtime_plans_owner_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_runtime_plans_task_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uniq_agent_runtime_plans_task_version"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_runtime_goals_owner_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_runtime_goals_task_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uniq_agent_runtime_tasks_idempotency_key"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_runtime_tasks_agent_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_runtime_tasks_owner_status_updated"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_runtime_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_runtime_results"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_runtime_tool_calls"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_runtime_steps"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_runtime_plans"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_runtime_goals"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_runtime_tasks"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_runtime_log_level_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_runtime_result_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_runtime_tool_call_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_runtime_step_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_runtime_plan_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_runtime_goal_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_runtime_risk_level_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_runtime_task_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_runtime_permission_mode_enum"`);
  }
}
