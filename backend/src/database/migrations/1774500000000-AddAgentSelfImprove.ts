import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAgentSelfImprove1774500000000 implements MigrationInterface {
  name = 'AddAgentSelfImprove1774500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_reflection_runs" (
        "id" SERIAL PRIMARY KEY,
        "ownerUserId" integer,
        "agentTaskId" integer,
        "triggerType" character varying(80) NOT NULL DEFAULT 'quality_failed',
        "status" character varying(40) NOT NULL DEFAULT 'queued',
        "source" character varying(80) NOT NULL DEFAULT 'fitmeet_agent',
        "severity" character varying(20) NOT NULL DEFAULT 'medium',
        "qualityScore" integer,
        "failedChecks" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "input" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "reflection" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "suggestedPatchIds" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "completedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_agent_reflection_runs_owner"
          FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_agent_reflection_runs_task"
          FOREIGN KEY ("agentTaskId") REFERENCES "agent_tasks"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_agent_reflection_runs_task_created"
        ON "agent_reflection_runs" ("agentTaskId", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_agent_reflection_runs_status_created"
        ON "agent_reflection_runs" ("status", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_agent_reflection_runs_owner_created"
        ON "agent_reflection_runs" ("ownerUserId", "createdAt")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_skill_patches" (
        "id" SERIAL PRIMARY KEY,
        "reflectionRunId" integer,
        "patchType" character varying(60) NOT NULL,
        "status" character varying(40) NOT NULL DEFAULT 'draft',
        "riskLevel" character varying(20) NOT NULL DEFAULT 'medium',
        "title" character varying(160) NOT NULL,
        "rationale" text NOT NULL DEFAULT '',
        "target" character varying(160) NOT NULL DEFAULT '',
        "patch" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "evalCaseIds" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "reviewedByUserId" integer,
        "reviewedAt" TIMESTAMP WITH TIME ZONE,
        "publishedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_agent_skill_patches_reflection"
          FOREIGN KEY ("reflectionRunId") REFERENCES "agent_reflection_runs"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_agent_skill_patches_reviewer"
          FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_agent_skill_patches_reflection"
        ON "agent_skill_patches" ("reflectionRunId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_agent_skill_patches_status_created"
        ON "agent_skill_patches" ("status", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_agent_skill_patches_type_status"
        ON "agent_skill_patches" ("patchType", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_eval_cases" (
        "id" SERIAL PRIMARY KEY,
        "reflectionRunId" integer,
        "agentTaskId" integer,
        "caseType" character varying(80) NOT NULL DEFAULT 'quality_regression',
        "status" character varying(40) NOT NULL DEFAULT 'active',
        "title" character varying(160) NOT NULL,
        "input" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "expectedBehavior" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "source" character varying(80) NOT NULL DEFAULT 'self_improve',
        "lastRun" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_agent_eval_cases_reflection"
          FOREIGN KEY ("reflectionRunId") REFERENCES "agent_reflection_runs"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_agent_eval_cases_task"
          FOREIGN KEY ("agentTaskId") REFERENCES "agent_tasks"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_agent_eval_cases_reflection"
        ON "agent_eval_cases" ("reflectionRunId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_agent_eval_cases_task_created"
        ON "agent_eval_cases" ("agentTaskId", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_agent_eval_cases_status_type"
        ON "agent_eval_cases" ("status", "caseType")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_eval_cases_status_type"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_eval_cases_task_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_eval_cases_reflection"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_eval_cases"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_skill_patches_type_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_skill_patches_status_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_skill_patches_reflection"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_skill_patches"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_reflection_runs_owner_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_reflection_runs_status_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_reflection_runs_task_created"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_reflection_runs"`);
  }
}
