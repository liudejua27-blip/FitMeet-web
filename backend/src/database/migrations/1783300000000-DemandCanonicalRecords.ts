import { MigrationInterface, QueryRunner } from 'typeorm';

export class DemandCanonicalRecords1783300000000 implements MigrationInterface {
  name = 'DemandCanonicalRecords1783300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "demands" (
        "id" varchar(80) PRIMARY KEY,
        "ownerUserId" integer NOT NULL,
        "type" varchar(32) NOT NULL,
        "title" varchar(120) NOT NULL,
        "summary" text NOT NULL DEFAULT '',
        "fields" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "visibility" varchar(16) NOT NULL,
        "status" varchar(32) NOT NULL,
        "sourceConversationId" varchar(120),
        "matchingPolicy" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "safetyFlags" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "publicIntentId" varchar(80),
        "candidateCount" integer NOT NULL DEFAULT 0,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_demands_owner"
          FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "chk_demands_type"
          CHECK ("type" IN ('friends', 'dating', 'workout', 'buddy', 'travel', 'service', 'housing', 'activity', 'help', 'other')),
        CONSTRAINT "chk_demands_visibility"
          CHECK ("visibility" IN ('public', 'hidden')),
        CONSTRAINT "chk_demands_status"
          CHECK ("status" IN ('draft', 'confirmable', 'published', 'hidden', 'matching', 'candidatePool', 'hasCandidates', 'invited', 'matchedCommunicating', 'closed', 'canceled'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_demands_owner_status" ON "demands" ("ownerUserId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_demands_owner_visibility" ON "demands" ("ownerUserId", "visibility")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_demands_public_intent" ON "demands" ("publicIntentId")`,
    );
    await queryRunner.query(`
      ALTER TABLE "demands"
      DROP CONSTRAINT IF EXISTS "fk_demands_public_intent"
    `);
    await queryRunner.query(`
      ALTER TABLE "demands"
      ADD CONSTRAINT "fk_demands_public_intent"
        FOREIGN KEY ("publicIntentId") REFERENCES "public_social_intents"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "demands" DROP CONSTRAINT IF EXISTS "fk_demands_public_intent"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_demands_public_intent"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_demands_owner_visibility"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_demands_owner_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "demands"`);
  }
}
