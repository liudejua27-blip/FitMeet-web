import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignUserSocialProfileColumns1772900000000 implements MigrationInterface {
  name = 'AlignUserSocialProfileColumns1772900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "user_social_profiles" ("userId" integer PRIMARY KEY)`,
    );

    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "gender" character varying NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "nickname" character varying(80) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "ageRange" character varying NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "city" character varying NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "zodiac" character varying(40) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "mbti" character varying NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "traits" text NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "socialStyle" character varying NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "communicationStyle" character varying NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "nearbyArea" character varying NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "fitnessGoals" text NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "interestTags" text NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "lifestyleTags" text NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "socialScenes" text NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "wantToMeet" text NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "preferredTraits" text NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "avoidTraits" text NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "relationshipGoals" text NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "openness" character varying NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "availableTimes" text NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "weekdayAvailability" character varying NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "weekendAvailability" character varying NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "socialPreference" character varying NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "rejectRules" character varying NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "privacyBoundary" character varying NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "profileDiscoverable" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "agentCanRecommendMe" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "agentCanStartChatAfterApproval" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "hideSensitiveTags" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "aiSummary" text NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "aiProfileCard" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "matchSignals" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "sensitiveTagDecisions" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now()`,
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users')
          AND NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE table_name = 'user_social_profiles'
              AND constraint_name = 'fk_user_social_profiles_user'
          )
        THEN
          ALTER TABLE "user_social_profiles"
          ADD CONSTRAINT "fk_user_social_profiles_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const column of [
      'sensitiveTagDecisions',
      'matchSignals',
      'aiProfileCard',
      'aiSummary',
      'hideSensitiveTags',
      'agentCanStartChatAfterApproval',
      'agentCanRecommendMe',
      'profileDiscoverable',
      'weekendAvailability',
      'weekdayAvailability',
      'openness',
      'relationshipGoals',
      'avoidTraits',
      'preferredTraits',
      'wantToMeet',
      'socialScenes',
      'lifestyleTags',
      'communicationStyle',
      'socialStyle',
      'traits',
      'mbti',
      'zodiac',
      'nickname',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "user_social_profiles" DROP COLUMN IF EXISTS "${column}"`,
      );
    }
  }
}
