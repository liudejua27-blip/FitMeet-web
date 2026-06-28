import { MigrationInterface, QueryRunner } from 'typeorm';

export class MatchingJobRecoveryLineage1782900000000 implements MigrationInterface {
  name = 'MatchingJobRecoveryLineage1782900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "matching_jobs" ADD COLUMN IF NOT EXISTS "parentJobId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "matching_jobs" ADD COLUMN IF NOT EXISTS "recoveryStrategyId" varchar(40)`,
    );
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_matching_jobs_parent_status"
      ON "matching_jobs" ("parentJobId", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_matching_jobs_parent_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matching_jobs" DROP COLUMN IF EXISTS "recoveryStrategyId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matching_jobs" DROP COLUMN IF EXISTS "parentJobId"`,
    );
  }
}
