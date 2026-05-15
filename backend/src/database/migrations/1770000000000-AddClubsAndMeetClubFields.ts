import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClubsAndMeetClubFields1770000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "clubs" (
        "id" SERIAL PRIMARY KEY,
        "name" varchar NOT NULL,
        "city" varchar NOT NULL DEFAULT '',
        "sportType" varchar NOT NULL,
        "description" text NOT NULL DEFAULT '',
        "coverUrl" varchar NOT NULL DEFAULT '',
        "joinPolicy" varchar NOT NULL DEFAULT 'open',
        "announcement" text NOT NULL DEFAULT '',
        "memberCount" integer NOT NULL DEFAULT 1,
        "meetCount" integer NOT NULL DEFAULT 0,
        "ownerId" integer NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "club_members" (
        "id" SERIAL PRIMARY KEY,
        "clubId" integer NOT NULL,
        "userId" integer NOT NULL,
        "role" varchar NOT NULL DEFAULT 'member',
        "status" varchar NOT NULL DEFAULT 'pending',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "uq_club_members_pair" UNIQUE ("clubId", "userId")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "meets"
      ADD COLUMN IF NOT EXISTS "clubId" integer,
      ADD COLUMN IF NOT EXISTS "city" varchar NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "startAt" TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "autoCancelAt" TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "cancelReason" varchar
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_clubs_city_sport" ON "clubs" ("city", "sportType")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_club_members_club_status" ON "club_members" ("clubId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_club_members_user_status" ON "club_members" ("userId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_meets_club_status" ON "meets" ("clubId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_meets_auto_cancel" ON "meets" ("status", "autoCancelAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_meets_auto_cancel"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_meets_club_status"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_club_members_user_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_club_members_club_status"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_clubs_city_sport"`);
    await queryRunner.query(`
      ALTER TABLE "meets"
      DROP COLUMN IF EXISTS "cancelReason",
      DROP COLUMN IF EXISTS "autoCancelAt",
      DROP COLUMN IF EXISTS "startAt",
      DROP COLUMN IF EXISTS "city",
      DROP COLUMN IF EXISTS "clubId"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "club_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "clubs"`);
  }
}
