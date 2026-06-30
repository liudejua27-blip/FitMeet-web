import { MigrationInterface, QueryRunner } from 'typeorm';

export class AgentRuntimeSchemaDriftAlignment1783200000000 implements MigrationInterface {
  name = 'AgentRuntimeSchemaDriftAlignment1783200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "life_graph_events" ADD COLUMN IF NOT EXISTS "taskId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "life_graph_events" ADD COLUMN IF NOT EXISTS "activityId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "life_graph_events" ADD COLUMN IF NOT EXISTS "candidateUserId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "life_graph_events" ADD COLUMN IF NOT EXISTS "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "life_graph_events" ADD COLUMN IF NOT EXISTS "naturalSummary" text NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "life_graph_events" ADD COLUMN IF NOT EXISTS "source" varchar(80)`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'life_graph_events' AND column_name = 'agentTaskId'
        ) THEN
          UPDATE "life_graph_events"
          SET "taskId" = COALESCE("taskId", "agentTaskId")
          WHERE "taskId" IS NULL AND "agentTaskId" IS NOT NULL;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'life_graph_events' AND column_name = 'candidateId'
        ) THEN
          UPDATE "life_graph_events"
          SET "candidateUserId" = COALESCE("candidateUserId", "candidateId")
          WHERE "candidateUserId" IS NULL AND "candidateId" IS NOT NULL;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'life_graph_events' AND column_name = 'payload'
        ) THEN
          UPDATE "life_graph_events"
          SET "metadata" = COALESCE(NULLIF("metadata", '{}'::jsonb), "payload", '{}'::jsonb)
          WHERE "payload" IS NOT NULL;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'life_graph_events' AND column_name = 'summary'
        ) THEN
          UPDATE "life_graph_events"
          SET "naturalSummary" = COALESCE(NULLIF("naturalSummary", ''), "summary", '')
          WHERE "summary" IS NOT NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(
      `ALTER TABLE "life_graph_signal_scores" ADD COLUMN IF NOT EXISTS "source" varchar(80) NOT NULL DEFAULT 'rules_v1'`,
    );
    await queryRunner.query(
      `ALTER TABLE "life_graph_signal_scores" ADD COLUMN IF NOT EXISTS "explanation" text NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "life_graph_signal_scores" ADD COLUMN IF NOT EXISTS "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "life_graph_signal_scores" ADD COLUMN IF NOT EXISTS "enabledForMatching" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "life_graph_signal_scores" ADD COLUMN IF NOT EXISTS "correctionCount" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "life_graph_signal_scores" ADD COLUMN IF NOT EXISTS "lastCalculatedAt" timestamptz`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'life_graph_signal_scores' AND column_name = 'model'
        ) THEN
          UPDATE "life_graph_signal_scores"
          SET "source" = COALESCE(NULLIF("source", ''), "model", 'rules_v1')
          WHERE "source" = 'rules_v1' AND "model" IS NOT NULL;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'life_graph_signal_scores' AND column_name = 'lastComputedAt'
        ) THEN
          UPDATE "life_graph_signal_scores"
          SET "lastCalculatedAt" = COALESCE("lastCalculatedAt", "lastComputedAt")
          WHERE "lastCalculatedAt" IS NULL AND "lastComputedAt" IS NOT NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(
      `ALTER TABLE "social_agent_user_interest_events" ADD COLUMN IF NOT EXISTS "activityId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_agent_user_interest_events" ADD COLUMN IF NOT EXISTS "city" varchar(120)`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_agent_user_interest_events" ADD COLUMN IF NOT EXISTS "candidateRecordId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_agent_user_interest_events" ADD COLUMN IF NOT EXISTS "activityTags" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_agent_user_interest_events" ADD COLUMN IF NOT EXISTS "candidatePreferenceTags" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_agent_user_interest_events" ADD COLUMN IF NOT EXISTS "locationText" varchar(160)`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_agent_user_interest_events" ADD COLUMN IF NOT EXISTS "timeWindow" varchar(120)`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'social_agent_user_interest_events' AND column_name = 'candidateId'
        ) THEN
          UPDATE "social_agent_user_interest_events"
          SET "candidateRecordId" = COALESCE("candidateRecordId", "candidateId")
          WHERE "candidateRecordId" IS NULL AND "candidateId" IS NOT NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_life_graph_events_user_task_created"
      ON "life_graph_events" ("userId", "taskId", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_life_graph_events_user_candidate_created"
      ON "life_graph_events" ("userId", "candidateUserId", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_social_agent_user_interest_events_activity"
      ON "social_agent_user_interest_events" ("ownerUserId", "activityId", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_social_agent_user_interest_events_activity"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_life_graph_events_user_candidate_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_life_graph_events_user_task_created"`,
    );
  }
}
