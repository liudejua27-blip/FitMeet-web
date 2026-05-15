import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPostLocation1770700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "posts"
      ADD COLUMN IF NOT EXISTS "city" varchar NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "loc" varchar NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "address" varchar NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "poiId" varchar,
      ADD COLUMN IF NOT EXISTS "lat" double precision,
      ADD COLUMN IF NOT EXISTS "lng" double precision
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_posts_location" ON "posts" ("lat", "lng")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_posts_location"`);
    await queryRunner.query(`
      ALTER TABLE "posts"
      DROP COLUMN IF EXISTS "lng",
      DROP COLUMN IF EXISTS "lat",
      DROP COLUMN IF EXISTS "poiId",
      DROP COLUMN IF EXISTS "address",
      DROP COLUMN IF EXISTS "loc",
      DROP COLUMN IF EXISTS "city"
    `);
  }
}
