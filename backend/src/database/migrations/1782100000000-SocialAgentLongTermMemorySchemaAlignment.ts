import { MigrationInterface, QueryRunner } from 'typeorm';

export class SocialAgentLongTermMemorySchemaAlignment1782100000000 implements MigrationInterface {
  name = 'SocialAgentLongTermMemorySchemaAlignment1782100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "social_agent_long_term_memory"
      ADD COLUMN IF NOT EXISTS "userId" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "social_agent_long_term_memory"
      ADD COLUMN IF NOT EXISTS "boundaries" jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "social_agent_long_term_memory"
      ADD COLUMN IF NOT EXISTS "matchSignals" jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "social_agent_long_term_memory"
      ADD COLUMN IF NOT EXISTS "preferences" jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "social_agent_long_term_memory"
      ADD COLUMN IF NOT EXISTS "activityPreferences" jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "social_agent_long_term_memory"
      ADD COLUMN IF NOT EXISTS "taskSummaries" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "social_agent_long_term_memory"
      ADD COLUMN IF NOT EXISTS "taskCount" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'social_agent_long_term_memory'
            AND column_name = 'ownerUserId'
            AND table_schema = current_schema()
        ) THEN
          UPDATE "social_agent_long_term_memory"
          SET "userId" = COALESCE("userId", "ownerUserId")
          WHERE "userId" IS NULL;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'social_agent_long_term_memory'
            AND column_name = 'preferenceMemory'
            AND table_schema = current_schema()
        ) THEN
          UPDATE "social_agent_long_term_memory"
          SET "preferences" = "preferenceMemory"
          WHERE "preferences" = '{}'::jsonb
            AND "preferenceMemory" <> '{}'::jsonb;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'social_agent_long_term_memory'
            AND column_name = 'safetyMemory'
            AND table_schema = current_schema()
        ) THEN
          UPDATE "social_agent_long_term_memory"
          SET "boundaries" = "safetyMemory"
          WHERE "boundaries" = '{}'::jsonb
            AND "safetyMemory" <> '{}'::jsonb;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'social_agent_long_term_memory'
            AND column_name = 'activityMemory'
            AND table_schema = current_schema()
        ) THEN
          UPDATE "social_agent_long_term_memory"
          SET "activityPreferences" = "activityMemory"
          WHERE "activityPreferences" = '{}'::jsonb
            AND "activityMemory" <> '{}'::jsonb;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'social_agent_long_term_memory'
            AND column_name = 'relationshipMemory'
            AND table_schema = current_schema()
        ) THEN
          UPDATE "social_agent_long_term_memory"
          SET "matchSignals" = "relationshipMemory"
          WHERE "matchSignals" = '{}'::jsonb
            AND "relationshipMemory" <> '{}'::jsonb;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "social_agent_long_term_memory"
      ALTER COLUMN "userId" SET NOT NULL
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_social_agent_ltm_user_id'
        ) THEN
          ALTER TABLE "social_agent_long_term_memory"
          ADD CONSTRAINT "fk_social_agent_ltm_user_id"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_social_agent_ltm_user_id"
      ON "social_agent_long_term_memory" ("userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_social_agent_ltm_user_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "social_agent_long_term_memory"
      DROP CONSTRAINT IF EXISTS "fk_social_agent_ltm_user_id"
    `);
  }
}
