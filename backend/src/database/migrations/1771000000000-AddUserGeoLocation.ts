import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Batch A — real nearby matching.
 *
 * Adds geo + nearby-match opt-in fields onto `users`:
 *   - lat / lng: latest reported coordinates (nullable)
 *   - locationUpdatedAt: when those coordinates were last refreshed
 *   - acceptNearbyMatch: user opts into being surfaced in nearby searches
 *
 * Idempotent: safe to re-run.
 */
export class AddUserGeoLocation1771000000000 implements MigrationInterface {
  name = 'AddUserGeoLocation1771000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lat" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lng" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "locationUpdatedAt" timestamptz`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "acceptNearbyMatch" boolean NOT NULL DEFAULT true`,
    );
    // Cheap planar index for users with a known fix; bbox prefilter happens
    // before haversine in the application layer.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_users_geo" ON "users" ("lat", "lng") WHERE "lat" IS NOT NULL AND "lng" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_geo"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "acceptNearbyMatch"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "locationUpdatedAt"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "lng"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "lat"`);
  }
}
