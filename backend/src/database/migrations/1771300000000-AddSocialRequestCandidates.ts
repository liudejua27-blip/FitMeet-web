import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `social_request_candidates` — persisted scored candidates for a
 * UserSocialRequest. Backs the "match review" surface so the algorithm
 * isn't re-run on every refresh / "换一批".
 *
 * Schema mirrors `SocialRequestCandidate` entity in
 * src/match/social-request-candidate.entity.ts.
 *
 * MUST run AFTER 1771200000000-AddUserSocialRequests (FK target).
 */
export class AddSocialRequestCandidates1771300000000
  implements MigrationInterface
{
  name = 'AddSocialRequestCandidates1771300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "social_request_candidates_status_enum" AS ENUM (
          'suggested', 'approved', 'messaged', 'rejected', 'expired'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "social_request_candidates_level_enum" AS ENUM (
          'high', 'medium', 'low'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "social_request_candidates_riskLevel_enum" AS ENUM (
          'low', 'medium', 'high'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social_request_candidates" (
        "id" SERIAL PRIMARY KEY,
        "socialRequestId" integer NOT NULL,
        "candidateUserId" integer NOT NULL,
        "score" integer NOT NULL,
        "level" "social_request_candidates_level_enum" NOT NULL DEFAULT 'medium',
        "scoreBreakdown" jsonb NOT NULL DEFAULT '{}',
        "reasons" jsonb NOT NULL DEFAULT '[]',
        "commonTags" jsonb NOT NULL DEFAULT '[]',
        "distanceKm" double precision,
        "riskLevel" "social_request_candidates_riskLevel_enum" NOT NULL DEFAULT 'low',
        "riskWarnings" jsonb NOT NULL DEFAULT '[]',
        "suggestedMessage" text NOT NULL DEFAULT '',
        "status" "social_request_candidates_status_enum" NOT NULL DEFAULT 'suggested',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_src_social_request" FOREIGN KEY ("socialRequestId") REFERENCES "user_social_requests"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_src_candidate_user" FOREIGN KEY ("candidateUserId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_src_request_status" ON "social_request_candidates" ("socialRequestId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_src_request_score" ON "social_request_candidates" ("socialRequestId", "score")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_src_request_score"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_src_request_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "social_request_candidates"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "social_request_candidates_riskLevel_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "social_request_candidates_level_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "social_request_candidates_status_enum"`,
    );
  }
}
