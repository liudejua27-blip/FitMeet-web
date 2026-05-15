import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the user-facing social-task-card table `user_social_requests`.
 *
 * NOTE: This coexists with the legacy `social_requests` table (used by
 * the AgentGateway internal matching pipeline). Consolidation is planned
 * separately; for now both tables are kept and the application layer
 * routes between them.
 *
 * Schema mirrors `UserSocialRequest` entity in
 * src/social-requests/social-request.entity.ts.
 */
export class AddUserSocialRequests1771200000000 implements MigrationInterface {
  name = 'AddUserSocialRequests1771200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── enums ─────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "user_social_requests_source_enum" AS ENUM (
          'manual', 'openclaw', 'codex', 'claude', 'custom_agent', 'public'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "user_social_requests_type_enum" AS ENUM (
          'running_partner', 'fitness_partner', 'dog_walking', 'coffee_chat',
          'city_walk', 'study_partner', 'custom'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "user_social_requests_genderPreference_enum" AS ENUM (
          'any', 'male', 'female', 'non_specified'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "user_social_requests_safetyRequirement_enum" AS ENUM (
          'none', 'verified_only', 'low_risk_only'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "user_social_requests_visibility_enum" AS ENUM (
          'private', 'matched_only', 'public'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "user_social_requests_status_enum" AS ENUM (
          'draft', 'matching', 'matched', 'invitation_pending', 'chatting',
          'activity_created', 'completed', 'cancelled', 'expired'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    // ── table ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_social_requests" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL,
        "agentId" integer,
        "source" "user_social_requests_source_enum" NOT NULL DEFAULT 'manual',
        "type" "user_social_requests_type_enum" NOT NULL DEFAULT 'custom',
        "title" varchar(200) NOT NULL DEFAULT '',
        "description" text NOT NULL DEFAULT '',
        "rawText" text NOT NULL DEFAULT '',
        "city" varchar(100) NOT NULL DEFAULT '',
        "lat" double precision,
        "lng" double precision,
        "radiusKm" integer NOT NULL DEFAULT 5,
        "timeStart" timestamptz,
        "timeEnd" timestamptz,
        "genderPreference" "user_social_requests_genderPreference_enum" NOT NULL DEFAULT 'any',
        "ageMin" integer,
        "ageMax" integer,
        "interestTags" jsonb NOT NULL DEFAULT '[]',
        "activityType" varchar(100) NOT NULL DEFAULT '',
        "safetyRequirement" "user_social_requests_safetyRequirement_enum" NOT NULL DEFAULT 'none',
        "agentAllowed" boolean NOT NULL DEFAULT true,
        "requireUserConfirmation" boolean NOT NULL DEFAULT true,
        "status" "user_social_requests_status_enum" NOT NULL DEFAULT 'draft',
        "visibility" "user_social_requests_visibility_enum" NOT NULL DEFAULT 'matched_only',
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "expiresAt" timestamptz,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_user_social_requests_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_user_social_requests_agent" FOREIGN KEY ("agentId") REFERENCES "agent_connections"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_user_social_requests_user_status" ON "user_social_requests" ("userId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_user_social_requests_city_status" ON "user_social_requests" ("city", "status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_user_social_requests_city_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_user_social_requests_user_status"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "user_social_requests"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "user_social_requests_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "user_social_requests_visibility_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "user_social_requests_safetyRequirement_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "user_social_requests_genderPreference_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "user_social_requests_type_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "user_social_requests_source_enum"`,
    );
  }
}
