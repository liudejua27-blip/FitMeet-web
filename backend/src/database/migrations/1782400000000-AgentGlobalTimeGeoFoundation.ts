import { MigrationInterface, QueryRunner } from 'typeorm';

export class AgentGlobalTimeGeoFoundation1782400000000 implements MigrationInterface {
  name = 'AgentGlobalTimeGeoFoundation1782400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'user_social_profiles',
      'user_social_requests',
      'public_social_intents',
      'candidate_search_index',
    ]) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
        ADD COLUMN IF NOT EXISTS "locale" varchar(20) NOT NULL DEFAULT 'zh-CN'
      `);
      await queryRunner.query(`
        ALTER TABLE "${table}"
        ADD COLUMN IF NOT EXISTS "countryCode" varchar(8) NOT NULL DEFAULT 'CN'
      `);
      await queryRunner.query(`
        ALTER TABLE "${table}"
        ADD COLUMN IF NOT EXISTS "timeZone" varchar(80) NOT NULL DEFAULT 'Asia/Shanghai'
      `);
      await queryRunner.query(`
        ALTER TABLE "${table}"
        ADD COLUMN IF NOT EXISTS "utcOffsetMinutes" integer NOT NULL DEFAULT 480
      `);
      await queryRunner.query(`
        ALTER TABLE "${table}"
        ADD COLUMN IF NOT EXISTS "geoHash" varchar(16) NOT NULL DEFAULT ''
      `);
    }
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_candidate_search_index_status_country_city"
      ON "candidate_search_index" ("status", "countryCode", "city")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_candidate_search_index_geohash_status"
      ON "candidate_search_index" ("geoHash", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_candidate_search_index_geohash_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_candidate_search_index_status_country_city"`,
    );
    for (const table of [
      'candidate_search_index',
      'public_social_intents',
      'user_social_requests',
      'user_social_profiles',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "geoHash"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "utcOffsetMinutes"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "timeZone"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "countryCode"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "locale"`,
      );
    }
  }
}
