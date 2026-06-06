import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enforces idempotent candidate persistence for Social Agent searches.
 *
 * This migration does not delete existing duplicate rows. If duplicates are
 * present, it fails with a targeted preflight error so operators can inspect
 * and merge/reject rows before retrying the unique index creation.
 */
export class AddSocialRequestCandidateUniqueness1774400000000 implements MigrationInterface {
  name = 'AddSocialRequestCandidateUniqueness1774400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1
          FROM "social_request_candidates"
          GROUP BY "socialRequestId", "candidateUserId"
          HAVING COUNT(*) > 1
        ) THEN
          RAISE EXCEPTION 'social_request_candidates has duplicate (socialRequestId, candidateUserId) rows; merge or remove duplicates before applying uniq_src_request_candidate_user';
        END IF;
      END $$;
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uniq_src_request_candidate_user" ON "social_request_candidates" ("socialRequestId", "candidateUserId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uniq_src_request_candidate_user"`,
    );
  }
}
