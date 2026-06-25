import { MigrationInterface, QueryRunner } from 'typeorm';

export class MatchingWorkerReconcilerStabilization1781800000000 implements MigrationInterface {
  name = 'MatchingWorkerReconcilerStabilization1781800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "matching_jobs" ADD COLUMN IF NOT EXISTS "leaseOwner" varchar(120)`,
    );
    await queryRunner.query(
      `ALTER TABLE "matching_jobs" ADD COLUMN IF NOT EXISTS "leaseExpiresAt" timestamptz`,
    );
    await queryRunner.query(
      `ALTER TABLE "matching_jobs" ADD COLUMN IF NOT EXISTS "lastHeartbeatAt" timestamptz`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_matching_jobs_status_lease"
       ON "matching_jobs" ("status", "leaseExpiresAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_matching_jobs_owner_status"
       ON "matching_jobs" ("ownerUserId", "status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_matching_jobs_owner_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_matching_jobs_status_lease"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matching_jobs" DROP COLUMN IF EXISTS "lastHeartbeatAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matching_jobs" DROP COLUMN IF EXISTS "leaseExpiresAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matching_jobs" DROP COLUMN IF EXISTS "leaseOwner"`,
    );
  }
}
