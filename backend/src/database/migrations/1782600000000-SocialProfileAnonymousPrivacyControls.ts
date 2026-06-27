import { MigrationInterface, QueryRunner } from 'typeorm';

export class SocialProfileAnonymousPrivacyControls1782600000000 implements MigrationInterface {
  name = 'SocialProfileAnonymousPrivacyControls1782600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_social_profiles"
      ADD COLUMN IF NOT EXISTS "candidateDisplayMode" varchar(40) NOT NULL DEFAULT 'anonymous_until_confirmed',
      ADD COLUMN IF NOT EXISTS "candidateAvatarVisibility" varchar(40) NOT NULL DEFAULT 'hidden_until_confirmed',
      ADD COLUMN IF NOT EXISTS "candidateCoarseArea" varchar(120) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "contactDisclosurePolicy" varchar(40) NOT NULL DEFAULT 'in_app_after_match',
      ADD COLUMN IF NOT EXISTS "preciseLocationPolicy" varchar(40) NOT NULL DEFAULT 'coarse_only',
      ADD COLUMN IF NOT EXISTS "strangerOpenerPolicy" varchar(40) NOT NULL DEFAULT 'opener_requires_confirmation',
      ADD COLUMN IF NOT EXISTS "strangerInvitePolicy" varchar(40) NOT NULL DEFAULT 'invite_requires_confirmation',
      ADD COLUMN IF NOT EXISTS "strangerFriendPolicy" varchar(40) NOT NULL DEFAULT 'friend_requires_confirmation'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_user_social_profiles_privacy_display"
      ON "user_social_profiles" ("candidateDisplayMode", "candidateAvatarVisibility")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_user_social_profiles_privacy_display"`,
    );
    await queryRunner.query(`
      ALTER TABLE "user_social_profiles"
      DROP COLUMN IF EXISTS "strangerFriendPolicy",
      DROP COLUMN IF EXISTS "strangerInvitePolicy",
      DROP COLUMN IF EXISTS "strangerOpenerPolicy",
      DROP COLUMN IF EXISTS "preciseLocationPolicy",
      DROP COLUMN IF EXISTS "contactDisclosurePolicy",
      DROP COLUMN IF EXISTS "candidateCoarseArea",
      DROP COLUMN IF EXISTS "candidateAvatarVisibility",
      DROP COLUMN IF EXISTS "candidateDisplayMode"
    `);
  }
}
