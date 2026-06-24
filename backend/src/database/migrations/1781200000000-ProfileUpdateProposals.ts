import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProfileUpdateProposals1781200000000 implements MigrationInterface {
  name = 'ProfileUpdateProposals1781200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const statements = [
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "profileVersion" integer NOT NULL DEFAULT 0`,
      `CREATE TABLE IF NOT EXISTS "profile_update_proposals" (
        "proposalId" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "baseProfileVersion" integer NOT NULL,
        "proposedFields" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "draft" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "status" varchar(40) NOT NULL DEFAULT 'pending',
        "source" varchar(80) NOT NULL DEFAULT 'agent_profile_completion',
        "expiresAt" timestamptz NOT NULL,
        "appliedAt" timestamptz,
        "rejectedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS "idx_profile_update_proposals_user_status_expires" ON "profile_update_proposals" ("userId", "status", "expiresAt")`,
    ];

    for (const statement of statements) {
      await queryRunner.query(statement);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const statements = [
      `DROP INDEX IF EXISTS "idx_profile_update_proposals_user_status_expires"`,
      `DROP TABLE IF EXISTS "profile_update_proposals"`,
      `ALTER TABLE "user_social_profiles" DROP COLUMN IF EXISTS "profileVersion"`,
    ];

    for (const statement of statements) {
      await queryRunner.query(statement);
    }
  }
}
