import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAppWaitlistGrowth1774000000000 implements MigrationInterface {
  name = 'AddAppWaitlistGrowth1774000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "waitlist_app_entries" (
        "id" SERIAL PRIMARY KEY,
        "email" varchar(160) NOT NULL,
        "phone" varchar(40),
        "country" varchar(80) NOT NULL DEFAULT '',
        "region" varchar(80) NOT NULL DEFAULT '',
        "city" varchar(80) NOT NULL DEFAULT '',
        "preferredLanguage" varchar(20) NOT NULL DEFAULT 'zh-CN',
        "timezone" varchar(80) NOT NULL DEFAULT 'Asia/Shanghai',
        "deviceType" varchar(16) NOT NULL,
        "scenarios" jsonb NOT NULL DEFAULT '[]',
        "interests" jsonb NOT NULL DEFAULT '[]',
        "userRole" varchar(32) NOT NULL,
        "interviewWilling" boolean NOT NULL DEFAULT false,
        "inviteCode" varchar(64),
        "source" varchar(80) NOT NULL DEFAULT 'app_page',
        "qualityScore" integer NOT NULL DEFAULT 0,
        "qualityLevel" varchar(16) NOT NULL DEFAULT 'low',
        "qualityReasons" jsonb NOT NULL DEFAULT '[]',
        "status" varchar(24) NOT NULL DEFAULT 'pending',
        "ipHash" varchar(96) NOT NULL DEFAULT '',
        "userAgent" text NOT NULL DEFAULT '',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "invite_codes" (
        "id" SERIAL PRIMARY KEY,
        "code" varchar(64) NOT NULL,
        "batchName" varchar(120) NOT NULL DEFAULT '',
        "source" varchar(80) NOT NULL DEFAULT '',
        "city" varchar(80) NOT NULL DEFAULT '',
        "scenario" varchar(120) NOT NULL DEFAULT '',
        "maxUses" integer NOT NULL DEFAULT 1,
        "usedCount" integer NOT NULL DEFAULT 0,
        "active" boolean NOT NULL DEFAULT true,
        "expiresAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "waitlist_analytics_events" (
        "id" SERIAL PRIMARY KEY,
        "eventName" varchar(80) NOT NULL,
        "ipHash" varchar(96) NOT NULL DEFAULT '',
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_waitlist_app_entries_email" ON "waitlist_app_entries" ("email")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_waitlist_app_entries_phone" ON "waitlist_app_entries" ("phone") WHERE "phone" IS NOT NULL AND "phone" <> ''`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_waitlist_app_entries_status_created" ON "waitlist_app_entries" ("status", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_waitlist_app_entries_quality_created" ON "waitlist_app_entries" ("qualityLevel", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_waitlist_app_entries_city_created" ON "waitlist_app_entries" ("city", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_invite_codes_code" ON "invite_codes" ("code")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_invite_codes_active_expires" ON "invite_codes" ("active", "expiresAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_invite_codes_batch" ON "invite_codes" ("batchName")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_waitlist_events_name_created" ON "waitlist_analytics_events" ("eventName", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_waitlist_events_ip_created" ON "waitlist_analytics_events" ("ipHash", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_waitlist_events_ip_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_waitlist_events_name_created"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_invite_codes_batch"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_invite_codes_active_expires"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_invite_codes_code"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_waitlist_app_entries_city_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_waitlist_app_entries_quality_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_waitlist_app_entries_status_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_waitlist_app_entries_phone"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_waitlist_app_entries_email"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "waitlist_analytics_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "invite_codes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "waitlist_app_entries"`);
  }
}
