import { MigrationInterface, QueryRunner } from 'typeorm';

export class AgentFeedbackEvents1782000000000 implements MigrationInterface {
  name = 'AgentFeedbackEvents1782000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_feedback_events" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL,
        "taskId" integer,
        "publicIntentId" varchar(80),
        "matchingJobId" integer,
        "candidateId" integer,
        "candidateRecordId" integer,
        "feedbackType" varchar(60) NOT NULL,
        "reasonCode" varchar(80) NOT NULL,
        "freeText" text,
        "correctionType" varchar(80),
        "oldValue" varchar(240),
        "newValue" varchar(240),
        "appliesToCurrentTask" boolean NOT NULL DEFAULT true,
        "appliesToFutureProfile" boolean NOT NULL DEFAULT false,
        "source" varchar(80) NOT NULL DEFAULT 'agent_web',
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "agent_feedback_events"
      ADD CONSTRAINT "fk_agent_feedback_events_user"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "agent_feedback_events"
      ADD CONSTRAINT "fk_agent_feedback_events_task"
      FOREIGN KEY ("taskId") REFERENCES "agent_tasks"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "agent_feedback_events"
      ADD CONSTRAINT "fk_agent_feedback_events_public_intent"
      FOREIGN KEY ("publicIntentId") REFERENCES "public_social_intents"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "agent_feedback_events"
      ADD CONSTRAINT "fk_agent_feedback_events_matching_job"
      FOREIGN KEY ("matchingJobId") REFERENCES "matching_jobs"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_agent_feedback_events_user_created"
      ON "agent_feedback_events" ("userId", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_agent_feedback_events_task_created"
      ON "agent_feedback_events" ("taskId", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_agent_feedback_events_public_intent"
      ON "agent_feedback_events" ("publicIntentId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_agent_feedback_events_matching_job"
      ON "agent_feedback_events" ("matchingJobId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_agent_feedback_events_candidate"
      ON "agent_feedback_events" ("candidateId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_agent_feedback_events_type_reason_created"
      ON "agent_feedback_events" ("feedbackType", "reasonCode", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_feedback_events_type_reason_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_feedback_events_candidate"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_feedback_events_matching_job"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_feedback_events_public_intent"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_feedback_events_task_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_feedback_events_user_created"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_feedback_events" DROP CONSTRAINT IF EXISTS "fk_agent_feedback_events_matching_job"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_feedback_events" DROP CONSTRAINT IF EXISTS "fk_agent_feedback_events_public_intent"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_feedback_events" DROP CONSTRAINT IF EXISTS "fk_agent_feedback_events_task"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_feedback_events" DROP CONSTRAINT IF EXISTS "fk_agent_feedback_events_user"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_feedback_events"`);
  }
}
