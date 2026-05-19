import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProfilePrivacyControls1772800000000
  implements MigrationInterface
{
  name = 'AddProfilePrivacyControls1772800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_social_profiles"
      ADD COLUMN IF NOT EXISTS "sensitiveTagDecisions" jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "user_social_profiles" DROP COLUMN IF EXISTS "sensitiveTagDecisions"',
    );
  }
}
