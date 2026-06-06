import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompleteAiSocialLoop1771900000000 implements MigrationInterface {
  name = 'CompleteAiSocialLoop1771900000000';
  /**
   * `ALTER TYPE ... ADD VALUE` can fail inside a transaction on older
   * Postgres versions. Keep this migration aligned with TypeORM's per-file
   * transaction opt-out contract.
   */
  transaction = false as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const value of ['active', 'inactive', 'completed']) {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'public_social_intents_status_enum') THEN
            IF NOT EXISTS (
              SELECT 1
              FROM pg_enum e
              JOIN pg_type t ON t.oid = e.enumtypid
              WHERE t.typname = 'public_social_intents_status_enum'
                AND e.enumlabel = '${value}'
            ) THEN
              ALTER TYPE "public_social_intents_status_enum" ADD VALUE '${value}';
            END IF;
          END IF;
        END $$;
      `);
      await queryRunner.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'social_requests_status_enum') THEN
            IF NOT EXISTS (
              SELECT 1
              FROM pg_enum e
              JOIN pg_type t ON t.oid = e.enumtypid
              WHERE t.typname = 'social_requests_status_enum'
                AND e.enumlabel = '${value}'
            ) THEN
              ALTER TYPE "social_requests_status_enum" ADD VALUE '${value}';
            END IF;
          END IF;
        END $$;
      `);
    }

    for (const value of ['assisted', 'normal']) {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_settings_mode_enum') THEN
            IF NOT EXISTS (
              SELECT 1
              FROM pg_enum e
              JOIN pg_type t ON t.oid = e.enumtypid
              WHERE t.typname = 'agent_settings_mode_enum'
                AND e.enumlabel = '${value}'
            ) THEN
              ALTER TYPE "agent_settings_mode_enum" ADD VALUE '${value}';
            END IF;
          END IF;
        END $$;
      `);
    }

    await queryRunner.query(
      `ALTER TABLE "public_social_intents" ADD COLUMN IF NOT EXISTS "userId" int`,
    );
    await queryRunner.query(
      `ALTER TABLE "public_social_intents" ADD COLUMN IF NOT EXISTS "linkedSocialRequestId" int`,
    );
    await queryRunner.query(
      `ALTER TABLE "public_social_intents" ADD COLUMN IF NOT EXISTS "source" varchar NOT NULL DEFAULT 'public_social_skills'`,
    );
    await queryRunner.query(
      `ALTER TABLE "public_social_intents" ADD COLUMN IF NOT EXISTS "interestTags" jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "public_social_intents" ADD COLUMN IF NOT EXISTS "locationPreference" text NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "public_social_intents" ADD COLUMN IF NOT EXISTS "socialGoal" text NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_public_social_intents_user_status" ON "public_social_intents" ("userId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_public_social_intents_linked_request" ON "public_social_intents" ("linkedSocialRequestId")`,
    );

    await queryRunner.query(
      `ALTER TABLE "agent_approval_requests" ADD COLUMN IF NOT EXISTS "actionType" varchar(80) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_approval_requests" ADD COLUMN IF NOT EXISTS "reason" text NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_approval_requests" ADD COLUMN IF NOT EXISTS "createdBy" varchar(32) NOT NULL DEFAULT 'agent'`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_approval_requests" ADD COLUMN IF NOT EXISTS "relatedSocialRequestId" int`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_approval_requests" ADD COLUMN IF NOT EXISTS "relatedCandidateId" int`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "agent_approval_requests" DROP COLUMN IF EXISTS "relatedCandidateId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_approval_requests" DROP COLUMN IF EXISTS "relatedSocialRequestId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_approval_requests" DROP COLUMN IF EXISTS "createdBy"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_approval_requests" DROP COLUMN IF EXISTS "reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_approval_requests" DROP COLUMN IF EXISTS "actionType"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_public_social_intents_linked_request"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_public_social_intents_user_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public_social_intents" DROP COLUMN IF EXISTS "socialGoal"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public_social_intents" DROP COLUMN IF EXISTS "locationPreference"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public_social_intents" DROP COLUMN IF EXISTS "interestTags"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public_social_intents" DROP COLUMN IF EXISTS "source"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public_social_intents" DROP COLUMN IF EXISTS "linkedSocialRequestId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public_social_intents" DROP COLUMN IF EXISTS "userId"`,
    );
  }
}
