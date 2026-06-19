import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSocialAgentReminders1776500000000
  implements MigrationInterface
{
  name = 'AddSocialAgentReminders1776500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social_agent_reminder_preferences" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL,
        "enabled" boolean NOT NULL DEFAULT false,
        "topics" jsonb NOT NULL DEFAULT '["friendship", "fitness_partner", "activity"]',
        "frequency" varchar(32) NOT NULL DEFAULT 'weekly',
        "quietStart" varchar(16) NOT NULL DEFAULT '09:00',
        "quietEnd" varchar(16) NOT NULL DEFAULT '21:00',
        "tone" varchar(24) NOT NULL DEFAULT 'gentle',
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "lastSuggestedAt" timestamptz,
        "mutedUntil" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_social_agent_reminder_preferences_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uniq_social_agent_reminder_preferences_user"
      ON "social_agent_reminder_preferences" ("userId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social_agent_reminders" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL,
        "topic" varchar(40) NOT NULL,
        "status" varchar(40) NOT NULL DEFAULT 'suggested',
        "dedupeKey" varchar(160) NOT NULL,
        "title" varchar(220) NOT NULL,
        "message" text NOT NULL,
        "context" jsonb NOT NULL DEFAULT '{}',
        "threadId" varchar(120),
        "taskId" integer,
        "openedAt" timestamptz,
        "dismissedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_social_agent_reminders_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uniq_social_agent_reminders_dedupe"
      ON "social_agent_reminders" ("dedupeKey")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_social_agent_reminders_user_status_created"
      ON "social_agent_reminders" ("userId", "status", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_social_agent_reminders_user_status_created"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "uniq_social_agent_reminders_dedupe"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "social_agent_reminders"`);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "uniq_social_agent_reminder_preferences_user"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "social_agent_reminder_preferences"
    `);
  }
}
