import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSocialAgentMessageFeedback1776200000000 implements MigrationInterface {
  name = 'AddSocialAgentMessageFeedback1776200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social_agent_message_feedback" (
        "id" SERIAL PRIMARY KEY,
        "ownerUserId" integer NOT NULL,
        "agentTaskId" integer,
        "messageId" character varying(160) NOT NULL,
        "value" character varying(20) NOT NULL,
        "reason" character varying(240),
        "runId" character varying(120),
        "traceId" character varying(120),
        "source" character varying(80) NOT NULL DEFAULT 'agent_web',
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_social_agent_message_feedback_owner"
          FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_social_agent_message_feedback_task"
          FOREIGN KEY ("agentTaskId") REFERENCES "agent_tasks"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uniq_social_agent_message_feedback_user_message"
        ON "social_agent_message_feedback" ("ownerUserId", "messageId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_social_agent_message_feedback_task_created"
        ON "social_agent_message_feedback" ("agentTaskId", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_social_agent_message_feedback_trace"
        ON "social_agent_message_feedback" ("traceId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_social_agent_message_feedback_trace"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_social_agent_message_feedback_task_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uniq_social_agent_message_feedback_user_message"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "social_agent_message_feedback"`,
    );
  }
}
