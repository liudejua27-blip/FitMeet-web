import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiDelegateMatching1770500000000 implements MigrationInterface {
  name = 'AddAiDelegateMatching1770500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ai_delegate_profiles" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL UNIQUE,
        "enabled" boolean NOT NULL DEFAULT false,
        "privacyConsent" boolean NOT NULL DEFAULT false,
        "preferredName" varchar NOT NULL DEFAULT '',
        "city" varchar NOT NULL DEFAULT '',
        "favoriteSports" text NOT NULL DEFAULT '',
        "interests" text NOT NULL DEFAULT '',
        "workExperience" text NOT NULL DEFAULT '',
        "idealPartner" text NOT NULL DEFAULT '',
        "trainingGoals" text NOT NULL DEFAULT '',
        "boundaries" text NOT NULL DEFAULT '',
        "availability" varchar NOT NULL DEFAULT '',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_ai_delegate_profiles_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ai_match_sessions" (
        "id" SERIAL PRIMARY KEY,
        "ownerId" integer NOT NULL,
        "targetUserId" integer NOT NULL,
        "score" integer NOT NULL DEFAULT 0,
        "status" varchar NOT NULL DEFAULT 'review',
        "summary" text NOT NULL DEFAULT '',
        "reasons" text NOT NULL DEFAULT '',
        "transcript" jsonb NOT NULL DEFAULT '[]',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_ai_match_sessions_owner" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_ai_match_sessions_target" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_ai_delegate_profiles_enabled" ON "ai_delegate_profiles" ("enabled", "privacyConsent")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_ai_match_sessions_owner" ON "ai_match_sessions" ("ownerId", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_ai_match_sessions_owner"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_ai_delegate_profiles_enabled"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_match_sessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_delegate_profiles"`);
  }
}
