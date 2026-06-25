import { MigrationInterface, QueryRunner } from 'typeorm';

export class OnboardingProfileGateV11781600000000 implements MigrationInterface {
  name = 'OnboardingProfileGateV11781600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const statements = [
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dateOfBirth" date`,
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" timestamptz`,
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboardingVersion" integer NOT NULL DEFAULT 0`,
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "profileVersion" integer NOT NULL DEFAULT 0`,
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "primaryPurpose" varchar NOT NULL DEFAULT ''`,
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "defaultMatchRadiusKm" integer NOT NULL DEFAULT 20`,
      `CREATE TABLE IF NOT EXISTS "api_idempotency_records" (
        "id" SERIAL PRIMARY KEY,
        "ownerUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "scope" varchar(80) NOT NULL,
        "idempotencyKey" varchar(180) NOT NULL,
        "requestHash" varchar(80) NOT NULL,
        "status" varchar(32) NOT NULL DEFAULT 'processing',
        "responseStatus" integer,
        "responseBody" jsonb,
        "expiresAt" timestamptz NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS "media_assets" (
        "id" SERIAL PRIMARY KEY,
        "ownerUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "purpose" varchar(40) NOT NULL DEFAULT 'profile_photo',
        "storageKey" text NOT NULL,
        "url" text NOT NULL,
        "mimeType" varchar(120) NOT NULL DEFAULT 'image/webp',
        "width" integer NOT NULL DEFAULT 0,
        "height" integer NOT NULL DEFAULT 0,
        "sha256" varchar(80) NOT NULL DEFAULT '',
        "moderationStatus" varchar(32) NOT NULL DEFAULT 'pending',
        "moderationReason" text NOT NULL DEFAULT '',
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS "user_profile_photos" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "assetId" integer NOT NULL REFERENCES "media_assets"("id") ON DELETE CASCADE,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "isCover" boolean NOT NULL DEFAULT false,
        "status" varchar(32) NOT NULL DEFAULT 'pending',
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS "user_consents" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "consentType" varchar(60) NOT NULL,
        "version" varchar(40) NOT NULL,
        "acceptedAt" timestamptz NOT NULL,
        "revokedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS "idx_media_assets_owner_purpose" ON "media_assets" ("ownerUserId", "purpose")`,
      `CREATE INDEX IF NOT EXISTS "idx_media_assets_moderation_status" ON "media_assets" ("moderationStatus")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_api_idempotency_records_owner_scope_key" ON "api_idempotency_records" ("ownerUserId", "scope", "idempotencyKey")`,
      `CREATE INDEX IF NOT EXISTS "idx_api_idempotency_records_expires" ON "api_idempotency_records" ("expiresAt")`,
      `CREATE INDEX IF NOT EXISTS "idx_user_profile_photos_user_status" ON "user_profile_photos" ("userId", "status")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_profile_photos_one_cover" ON "user_profile_photos" ("userId") WHERE "isCover" = true AND "status" != 'deleted'`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_profile_photos_asset_active" ON "user_profile_photos" ("assetId") WHERE "status" != 'deleted'`,
      `CREATE INDEX IF NOT EXISTS "idx_user_consents_user_type" ON "user_consents" ("userId", "consentType")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_consents_active_version" ON "user_consents" ("userId", "consentType", "version") WHERE "revokedAt" IS NULL`,
    ];

    for (const statement of statements) {
      await queryRunner.query(statement);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const statements = [
      `DROP INDEX IF EXISTS "idx_user_consents_active_version"`,
      `DROP INDEX IF EXISTS "idx_user_consents_user_type"`,
      `DROP INDEX IF EXISTS "idx_user_profile_photos_asset_active"`,
      `DROP INDEX IF EXISTS "idx_user_profile_photos_one_cover"`,
      `DROP INDEX IF EXISTS "idx_user_profile_photos_user_status"`,
      `DROP INDEX IF EXISTS "idx_api_idempotency_records_expires"`,
      `DROP INDEX IF EXISTS "idx_api_idempotency_records_owner_scope_key"`,
      `DROP INDEX IF EXISTS "idx_media_assets_moderation_status"`,
      `DROP INDEX IF EXISTS "idx_media_assets_owner_purpose"`,
      `DROP TABLE IF EXISTS "user_consents"`,
      `DROP TABLE IF EXISTS "user_profile_photos"`,
      `DROP TABLE IF EXISTS "media_assets"`,
      `DROP TABLE IF EXISTS "api_idempotency_records"`,
      `ALTER TABLE "user_social_profiles" DROP COLUMN IF EXISTS "defaultMatchRadiusKm"`,
      `ALTER TABLE "user_social_profiles" DROP COLUMN IF EXISTS "primaryPurpose"`,
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "onboardingVersion"`,
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "onboardingCompletedAt"`,
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "dateOfBirth"`,
    ];

    for (const statement of statements) {
      await queryRunner.query(statement);
    }
  }
}
