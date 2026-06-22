import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSocialAgentUserInterestEvents1776700000000
  implements MigrationInterface
{
  name = 'AddSocialAgentUserInterestEvents1776700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social_agent_user_interest_events" (
        "id" SERIAL PRIMARY KEY,
        "ownerUserId" integer NOT NULL,
        "agentTaskId" integer,
        "eventType" character varying(40) NOT NULL,
        "targetUserId" integer,
        "candidateRecordId" integer,
        "socialRequestId" integer,
        "activityId" integer,
        "weight" double precision NOT NULL DEFAULT 1,
        "activityTags" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "candidatePreferenceTags" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "city" character varying(120),
        "locationText" character varying(160),
        "timeWindow" character varying(120),
        "source" character varying(80) NOT NULL DEFAULT 'agent_web',
        "dedupeKey" character varying(240),
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_social_agent_user_interest_events_owner"
          FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_social_agent_user_interest_events_task"
          FOREIGN KEY ("agentTaskId") REFERENCES "agent_tasks"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_social_agent_user_interest_events_owner_created"
        ON "social_agent_user_interest_events" ("ownerUserId", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_social_agent_user_interest_events_owner_type_created"
        ON "social_agent_user_interest_events" ("ownerUserId", "eventType", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_social_agent_user_interest_events_target"
        ON "social_agent_user_interest_events" ("ownerUserId", "targetUserId", "eventType")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uniq_social_agent_user_interest_events_dedupe"
        ON "social_agent_user_interest_events" ("dedupeKey")
        WHERE "dedupeKey" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uniq_social_agent_user_interest_events_dedupe"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_social_agent_user_interest_events_target"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_social_agent_user_interest_events_owner_type_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_social_agent_user_interest_events_owner_created"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "social_agent_user_interest_events"`,
    );
  }
}
