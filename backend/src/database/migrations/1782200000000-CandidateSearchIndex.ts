import { MigrationInterface, QueryRunner } from 'typeorm';

export class CandidateSearchIndex1782200000000 implements MigrationInterface {
  name = 'CandidateSearchIndex1782200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "candidate_search_index" (
        "id" SERIAL PRIMARY KEY,
        "sourceType" varchar(32) NOT NULL,
        "sourceId" varchar(120) NOT NULL,
        "sourceVersion" varchar(180) NOT NULL DEFAULT '',
        "userId" integer,
        "publicIntentId" varchar(80),
        "linkedSocialRequestId" integer,
        "isRealUser" boolean NOT NULL DEFAULT true,
        "profileDiscoverable" boolean NOT NULL DEFAULT false,
        "agentCanRecommendMe" boolean NOT NULL DEFAULT false,
        "agentCanStartChatAfterApproval" boolean NOT NULL DEFAULT false,
        "status" varchar(32) NOT NULL DEFAULT 'active',
        "displayName" varchar NOT NULL DEFAULT '',
        "city" varchar NOT NULL DEFAULT '',
        "areaText" text NOT NULL DEFAULT '',
        "lat" double precision,
        "lng" double precision,
        "radiusKm" integer NOT NULL DEFAULT 20,
        "activityTypes" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "interestTags" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "lifestyleTags" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "socialScenes" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "relationshipGoals" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "timeBuckets" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "publicSummary" text NOT NULL DEFAULT '',
        "publicSafetyNotes" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "safetyFlags" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "trustScore" integer NOT NULL DEFAULT 0,
        "profileCompleteness" integer NOT NULL DEFAULT 0,
        "exposureCount" integer NOT NULL DEFAULT 0,
        "lastRecommendedAt" timestamptz,
        "lastActiveAt" timestamptz,
        "sourceUpdatedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_candidate_search_index_source"
      ON "candidate_search_index" ("sourceType", "sourceId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_candidate_search_index_status_city"
      ON "candidate_search_index" ("status", "city")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_candidate_search_index_user_status"
      ON "candidate_search_index" ("userId", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_candidate_search_index_consent_status"
      ON "candidate_search_index" ("profileDiscoverable", "agentCanRecommendMe", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_candidate_search_index_source_updated"
      ON "candidate_search_index" ("sourceUpdatedAt", "updatedAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_candidate_search_index_source_updated"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_candidate_search_index_consent_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_candidate_search_index_user_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_candidate_search_index_status_city"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_candidate_search_index_source"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "candidate_search_index"`);
  }
}
