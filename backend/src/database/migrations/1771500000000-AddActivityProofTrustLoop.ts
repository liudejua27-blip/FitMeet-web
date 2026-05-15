import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the trust-loop columns introduced by the ActivityProof accept/reject
 * flow:
 *   - users.trustScore, users.socialTrustCount
 *   - activity_proofs.reviewedById, .reviewedAt, .reviewReason
 *
 * No new enums; safe to run inside the default transaction.
 */
export class AddActivityProofTrustLoop1771500000000
  implements MigrationInterface
{
  name = 'AddActivityProofTrustLoop1771500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trustScore" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "socialTrustCount" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_proofs" ADD COLUMN IF NOT EXISTS "reviewedById" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_proofs" ADD COLUMN IF NOT EXISTS "reviewedAt" timestamptz`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_proofs" ADD COLUMN IF NOT EXISTS "reviewReason" varchar(500) NOT NULL DEFAULT ''`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "activity_proofs" DROP COLUMN IF EXISTS "reviewReason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_proofs" DROP COLUMN IF EXISTS "reviewedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_proofs" DROP COLUMN IF EXISTS "reviewedById"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "socialTrustCount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "trustScore"`,
    );
  }
}
