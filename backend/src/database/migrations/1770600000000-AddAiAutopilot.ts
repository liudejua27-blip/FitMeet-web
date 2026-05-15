import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiAutopilot1770600000000 implements MigrationInterface {
  name = 'AddAiAutopilot1770600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "ai_delegate_profiles"
      ADD COLUMN IF NOT EXISTS "autoChatEnabled" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "dailyAutoChatLimit" integer NOT NULL DEFAULT 3
    `);

    await queryRunner.query(`
      ALTER TABLE "ai_match_sessions"
      ADD COLUMN IF NOT EXISTS "initiatedBy" varchar NOT NULL DEFAULT 'manual',
      ADD COLUMN IF NOT EXISTS "conversationId" varchar,
      ADD COLUMN IF NOT EXISTS "contactCardSent" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "contactedAt" TIMESTAMP
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_ai_match_sessions_autopilot_daily"
      ON "ai_match_sessions" ("ownerId", "initiatedBy", "createdAt")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_ai_match_sessions_autopilot_target"
      ON "ai_match_sessions" ("ownerId", "targetUserId", "initiatedBy")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_ai_match_sessions_autopilot_target"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_ai_match_sessions_autopilot_daily"`,
    );
    await queryRunner.query(`
      ALTER TABLE "ai_match_sessions"
      DROP COLUMN IF EXISTS "contactedAt",
      DROP COLUMN IF EXISTS "contactCardSent",
      DROP COLUMN IF EXISTS "conversationId",
      DROP COLUMN IF EXISTS "initiatedBy"
    `);
    await queryRunner.query(`
      ALTER TABLE "ai_delegate_profiles"
      DROP COLUMN IF EXISTS "dailyAutoChatLimit",
      DROP COLUMN IF EXISTS "autoChatEnabled"
    `);
  }
}
