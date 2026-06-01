import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFitMeetAgentRuntime1774100000000
  implements MigrationInterface
{
  name = 'AddFitMeetAgentRuntime1774100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`
      CREATE TYPE "fitmeet_agent_permission_mode_enum" AS ENUM ('assist', 'limited_auto', 'open')
    `);
    await queryRunner.query(`
      CREATE TYPE "fitmeet_agent_run_status_enum" AS ENUM ('running', 'waiting_confirmation', 'completed', 'failed', 'cancelled')
    `);
    await queryRunner.query(`
      CREATE TYPE "fitmeet_agent_step_status_enum" AS ENUM ('running', 'completed', 'waiting_confirmation', 'failed', 'blocked')
    `);
    await queryRunner.query(`
      CREATE TYPE "fitmeet_agent_tool_status_enum" AS ENUM ('running', 'succeeded', 'failed', 'blocked', 'waiting_confirmation')
    `);

    await queryRunner.query(`
      CREATE TABLE "agent_runs" (
        "id" SERIAL NOT NULL,
        "userId" integer NOT NULL,
        "agentTaskId" integer,
        "agentName" character varying(80) NOT NULL DEFAULT 'fitmeet_social_agent',
        "permissionMode" "fitmeet_agent_permission_mode_enum" NOT NULL DEFAULT 'assist',
        "status" "fitmeet_agent_run_status_enum" NOT NULL DEFAULT 'running',
        "userMessage" text NOT NULL,
        "safeSummary" text,
        "resultPayload" jsonb,
        "completedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_agent_runs_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_agent_runs_user_status_updated" ON "agent_runs" ("userId", "status", "updatedAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_agent_runs_task" ON "agent_runs" ("agentTaskId")`,
    );

    await queryRunner.query(`
      CREATE TABLE "agent_run_steps" (
        "id" SERIAL NOT NULL,
        "runId" integer NOT NULL,
        "userId" integer NOT NULL,
        "stepOrder" integer NOT NULL,
        "stepKey" character varying(80) NOT NULL,
        "title" character varying(160) NOT NULL,
        "status" "fitmeet_agent_step_status_enum" NOT NULL DEFAULT 'running',
        "toolName" character varying(120),
        "requiresUserConfirmation" boolean NOT NULL DEFAULT false,
        "safePayload" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_agent_run_steps_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_agent_run_steps_run_order" ON "agent_run_steps" ("runId", "stepOrder")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_agent_run_steps_user_created" ON "agent_run_steps" ("userId", "createdAt")`,
    );

    await queryRunner.query(`
      CREATE TABLE "agent_tool_calls" (
        "id" SERIAL NOT NULL,
        "runId" integer NOT NULL,
        "userId" integer NOT NULL,
        "stepId" integer,
        "toolName" character varying(120) NOT NULL,
        "status" "fitmeet_agent_tool_status_enum" NOT NULL DEFAULT 'running',
        "requiresUserConfirmation" boolean NOT NULL DEFAULT false,
        "safeInput" jsonb,
        "safeOutput" jsonb,
        "errorCode" character varying(80),
        "errorMessage" character varying(240),
        "durationMs" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_agent_tool_calls_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_agent_tool_calls_run_created" ON "agent_tool_calls" ("runId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_agent_tool_calls_user_tool_status" ON "agent_tool_calls" ("userId", "toolName", "status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "agent_messages" (
        "id" SERIAL NOT NULL,
        "runId" integer NOT NULL,
        "userId" integer NOT NULL,
        "role" character varying(24) NOT NULL,
        "messageType" character varying(40) NOT NULL DEFAULT 'chat',
        "content" text NOT NULL,
        "safeMetadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_agent_messages_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_agent_messages_run_created" ON "agent_messages" ("runId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_agent_messages_user_created" ON "agent_messages" ("userId", "createdAt")`,
    );

    await queryRunner.query(`
      CREATE TABLE "agent_memory_updates" (
        "id" SERIAL NOT NULL,
        "runId" integer NOT NULL,
        "userId" integer NOT NULL,
        "memoryType" character varying(80) NOT NULL,
        "source" character varying(80) NOT NULL DEFAULT 'fitmeet_agent',
        "safePayload" jsonb,
        "requiresUserConfirmation" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_agent_memory_updates_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_agent_memory_updates_run_created" ON "agent_memory_updates" ("runId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_agent_memory_updates_user_type" ON "agent_memory_updates" ("userId", "memoryType")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_memory_updates_user_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_memory_updates_run_created"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_memory_updates"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_messages_user_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_messages_run_created"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_messages"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_tool_calls_user_tool_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_tool_calls_run_created"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_tool_calls"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_run_steps_user_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_run_steps_run_order"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_run_steps"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_runs_task"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_runs_user_status_updated"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_runs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "fitmeet_agent_tool_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "fitmeet_agent_step_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "fitmeet_agent_run_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "fitmeet_agent_permission_mode_enum"`);
  }
}
