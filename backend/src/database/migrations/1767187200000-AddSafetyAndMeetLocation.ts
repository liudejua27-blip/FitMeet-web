import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSafetyAndMeetLocation1767187200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "meets"
      ADD COLUMN IF NOT EXISTS "address" varchar NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "poiId" varchar,
      ADD COLUMN IF NOT EXISTS "lat" double precision,
      ADD COLUMN IF NOT EXISTS "lng" double precision,
      ADD COLUMN IF NOT EXISTS "tripShareToken" varchar
    `);

    await queryRunner.query(`
      ALTER TABLE "meet_participants"
      ADD COLUMN IF NOT EXISTS "tripShareToken" varchar
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "safety_reports" (
        "id" SERIAL PRIMARY KEY,
        "reporterId" integer NOT NULL,
        "targetType" varchar NOT NULL,
        "targetId" integer NOT NULL,
        "reason" varchar NOT NULL,
        "description" text NOT NULL DEFAULT '',
        "status" varchar NOT NULL DEFAULT 'pending',
        "adminNote" text NOT NULL DEFAULT '',
        "handledById" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_blocks" (
        "id" SERIAL PRIMARY KEY,
        "blockerId" integer NOT NULL,
        "blockedId" integer NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "uq_user_blocks_pair" UNIQUE ("blockerId", "blockedId")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "verification_requests" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL,
        "type" varchar NOT NULL,
        "realName" varchar NOT NULL DEFAULT '',
        "idNumberMasked" varchar NOT NULL DEFAULT '',
        "certName" varchar NOT NULL DEFAULT '',
        "certImageUrl" varchar NOT NULL DEFAULT '',
        "status" varchar NOT NULL DEFAULT 'pending',
        "adminNote" text NOT NULL DEFAULT '',
        "handledById" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "emergency_contacts" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL,
        "name" varchar NOT NULL,
        "phone" varchar NOT NULL,
        "relation" varchar NOT NULL DEFAULT '',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_meets_location" ON "meets" ("lat", "lng")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_safety_reports_status" ON "safety_reports" ("status", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_verifications_status" ON "verification_requests" ("status", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_verifications_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_safety_reports_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_meets_location"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "emergency_contacts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "verification_requests"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_blocks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "safety_reports"`);
    await queryRunner.query(`
      ALTER TABLE "meet_participants"
      DROP COLUMN IF EXISTS "tripShareToken"
    `);
    await queryRunner.query(`
      ALTER TABLE "meets"
      DROP COLUMN IF EXISTS "tripShareToken",
      DROP COLUMN IF EXISTS "lng",
      DROP COLUMN IF EXISTS "lat",
      DROP COLUMN IF EXISTS "poiId",
      DROP COLUMN IF EXISTS "address"
    `);
  }
}
