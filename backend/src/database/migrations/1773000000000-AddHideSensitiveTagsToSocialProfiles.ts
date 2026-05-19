import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHideSensitiveTagsToSocialProfiles1773000000000
  implements MigrationInterface
{
  name = 'AddHideSensitiveTagsToSocialProfiles1773000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" ADD COLUMN IF NOT EXISTS "hideSensitiveTags" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_social_profiles" DROP COLUMN IF EXISTS "hideSensitiveTags"`,
    );
  }
}
