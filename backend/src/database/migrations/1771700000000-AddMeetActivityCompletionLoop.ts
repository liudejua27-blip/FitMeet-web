import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMeetActivityCompletionLoop1771700000000
  implements MigrationInterface
{
  name = 'AddMeetActivityCompletionLoop1771700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "meets" ADD COLUMN IF NOT EXISTS "activityId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_activities" ADD COLUMN IF NOT EXISTS "meetId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_activities" ADD COLUMN IF NOT EXISTS "reviewByUserId" jsonb NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_activities" ADD COLUMN IF NOT EXISTS "recap" text`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_social_activities_meet_id" ON "social_activities" ("meetId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_social_activities_meet_id"`);
    await queryRunner.query(
      `ALTER TABLE "social_activities" DROP COLUMN IF EXISTS "recap"`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_activities" DROP COLUMN IF EXISTS "reviewByUserId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_activities" DROP COLUMN IF EXISTS "meetId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "meets" DROP COLUMN IF EXISTS "activityId"`,
    );
  }
}
