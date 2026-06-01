import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProfileMatchSignals1772300000000 implements MigrationInterface {
  name = 'AddProfileMatchSignals1772300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "user_social_profiles"
      ADD COLUMN IF NOT EXISTS "matchSignals" jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "ai_match_sessions"
      ADD COLUMN IF NOT EXISTS "source" character varying NOT NULL DEFAULT 'ai_delegate'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ai_match_sessions_owner_source"
      ON "ai_match_sessions" ("ownerId", "source", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_ai_match_sessions_owner_source"',
    );
    await queryRunner.query(
      'ALTER TABLE "ai_match_sessions" DROP COLUMN IF EXISTS "source"',
    );
    await queryRunner.query(
      'ALTER TABLE "user_social_profiles" DROP COLUMN IF EXISTS "matchSignals"',
    );
  }
}
