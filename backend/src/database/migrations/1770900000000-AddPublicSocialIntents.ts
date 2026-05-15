import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPublicSocialIntents1770900000000 implements MigrationInterface {
  name = 'AddPublicSocialIntents1770900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public_social_intents_riskLevel_enum" AS ENUM ('low', 'medium', 'high');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public_social_intents_status_enum" AS ENUM ('searching', 'matched', 'closed', 'cancelled');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "public_social_intents" (
        "id" varchar(80) PRIMARY KEY,
        "mode" varchar NOT NULL DEFAULT 'public',
        "requestType" varchar NOT NULL,
        "title" varchar NOT NULL,
        "description" text NOT NULL DEFAULT '',
        "city" varchar NOT NULL DEFAULT '',
        "loc" varchar NOT NULL DEFAULT '',
        "lat" double precision,
        "lng" double precision,
        "radiusKm" integer NOT NULL DEFAULT 5,
        "timePreference" varchar NOT NULL DEFAULT '',
        "riskLevel" "public_social_intents_riskLevel_enum" NOT NULL DEFAULT 'low',
        "requiresUserConfirmation" boolean NOT NULL DEFAULT true,
        "filters" jsonb NOT NULL DEFAULT '{}',
        "candidateUserIds" jsonb NOT NULL DEFAULT '[]',
        "matchedCount" integer NOT NULL DEFAULT 0,
        "status" "public_social_intents_status_enum" NOT NULL DEFAULT 'searching',
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_public_social_intents_created" ON "public_social_intents" ("createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_public_social_intents_city_status" ON "public_social_intents" ("city", "status", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_public_social_intents_city_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_public_social_intents_created"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "public_social_intents"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public_social_intents_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public_social_intents_riskLevel_enum"`,
    );
  }
}
