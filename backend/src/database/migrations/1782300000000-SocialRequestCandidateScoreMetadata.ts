import { MigrationInterface, QueryRunner } from 'typeorm';

export class SocialRequestCandidateScoreMetadata1782300000000 implements MigrationInterface {
  name = 'SocialRequestCandidateScoreMetadata1782300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "social_request_candidates"
      ADD COLUMN IF NOT EXISTS "sourceType" varchar(40) NOT NULL DEFAULT 'profile',
      ADD COLUMN IF NOT EXISTS "sourceId" varchar(120) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "publicIntentId" varchar(80),
      ADD COLUMN IF NOT EXISTS "activityId" integer,
      ADD COLUMN IF NOT EXISTS "rankPosition" integer,
      ADD COLUMN IF NOT EXISTS "scoreVersion" varchar(40) NOT NULL DEFAULT 'fitmeet_match_v1',
      ADD COLUMN IF NOT EXISTS "explanation" jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS "relationshipState" jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS "exposureReason" varchar(120) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "userAction" varchar(40) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "userActionAt" timestamptz
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_social_request_candidates_score_version"
      ON "social_request_candidates" ("socialRequestId", "scoreVersion")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_social_request_candidates_source"
      ON "social_request_candidates" ("socialRequestId", "sourceType", "sourceId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_social_request_candidates_user_action"
      ON "social_request_candidates" ("socialRequestId", "userAction")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_social_request_candidates_user_action"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_social_request_candidates_source"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_social_request_candidates_score_version"`,
    );
    await queryRunner.query(`
      ALTER TABLE "social_request_candidates"
      DROP COLUMN IF EXISTS "userActionAt",
      DROP COLUMN IF EXISTS "userAction",
      DROP COLUMN IF EXISTS "exposureReason",
      DROP COLUMN IF EXISTS "relationshipState",
      DROP COLUMN IF EXISTS "explanation",
      DROP COLUMN IF EXISTS "scoreVersion",
      DROP COLUMN IF EXISTS "rankPosition",
      DROP COLUMN IF EXISTS "activityId",
      DROP COLUMN IF EXISTS "publicIntentId",
      DROP COLUMN IF EXISTS "sourceId",
      DROP COLUMN IF EXISTS "sourceType"
    `);
  }
}
