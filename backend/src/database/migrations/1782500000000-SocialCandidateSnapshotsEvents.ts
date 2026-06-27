import { MigrationInterface, QueryRunner } from 'typeorm';

export class SocialCandidateSnapshotsEvents1782500000000 implements MigrationInterface {
  name = 'SocialCandidateSnapshotsEvents1782500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social_candidate_snapshots" (
        "id" SERIAL PRIMARY KEY,
        "ownerUserId" integer NOT NULL,
        "taskId" integer,
        "socialRequestId" integer,
        "publicIntentId" varchar(80),
        "matchingJobId" integer,
        "snapshotType" varchar(60) NOT NULL,
        "sourceVersion" varchar(128) NOT NULL DEFAULT '',
        "scoreVersion" varchar(80) NOT NULL DEFAULT '',
        "candidateCount" integer NOT NULL DEFAULT 0,
        "query" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "constraints" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "candidates" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "debug" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social_candidate_events" (
        "id" SERIAL PRIMARY KEY,
        "ownerUserId" integer NOT NULL,
        "taskId" integer,
        "snapshotId" integer,
        "socialRequestId" integer,
        "publicIntentId" varchar(80),
        "matchingJobId" integer,
        "candidateUserId" integer,
        "candidateRecordId" integer,
        "eventType" varchar(80) NOT NULL,
        "idempotencyKey" varchar(180),
        "source" varchar(80) NOT NULL DEFAULT 'agent',
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "social_candidate_snapshots"
      ADD CONSTRAINT "fk_social_candidate_snapshots_owner"
      FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "social_candidate_snapshots"
      ADD CONSTRAINT "fk_social_candidate_snapshots_task"
      FOREIGN KEY ("taskId") REFERENCES "agent_tasks"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "social_candidate_snapshots"
      ADD CONSTRAINT "fk_social_candidate_snapshots_social_request"
      FOREIGN KEY ("socialRequestId") REFERENCES "user_social_requests"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "social_candidate_snapshots"
      ADD CONSTRAINT "fk_social_candidate_snapshots_public_intent"
      FOREIGN KEY ("publicIntentId") REFERENCES "public_social_intents"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "social_candidate_snapshots"
      ADD CONSTRAINT "fk_social_candidate_snapshots_matching_job"
      FOREIGN KEY ("matchingJobId") REFERENCES "matching_jobs"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "social_candidate_events"
      ADD CONSTRAINT "fk_social_candidate_events_owner"
      FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "social_candidate_events"
      ADD CONSTRAINT "fk_social_candidate_events_task"
      FOREIGN KEY ("taskId") REFERENCES "agent_tasks"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "social_candidate_events"
      ADD CONSTRAINT "fk_social_candidate_events_snapshot"
      FOREIGN KEY ("snapshotId") REFERENCES "social_candidate_snapshots"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "social_candidate_events"
      ADD CONSTRAINT "fk_social_candidate_events_social_request"
      FOREIGN KEY ("socialRequestId") REFERENCES "user_social_requests"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "social_candidate_events"
      ADD CONSTRAINT "fk_social_candidate_events_public_intent"
      FOREIGN KEY ("publicIntentId") REFERENCES "public_social_intents"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "social_candidate_events"
      ADD CONSTRAINT "fk_social_candidate_events_matching_job"
      FOREIGN KEY ("matchingJobId") REFERENCES "matching_jobs"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_social_candidate_snapshots_owner_created"
      ON "social_candidate_snapshots" ("ownerUserId", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_social_candidate_snapshots_task_created"
      ON "social_candidate_snapshots" ("taskId", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_social_candidate_snapshots_public_intent"
      ON "social_candidate_snapshots" ("publicIntentId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_social_candidate_snapshots_matching_job"
      ON "social_candidate_snapshots" ("matchingJobId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_social_candidate_snapshots_social_request"
      ON "social_candidate_snapshots" ("socialRequestId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_social_candidate_snapshots_type_created"
      ON "social_candidate_snapshots" ("snapshotType", "createdAt")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_social_candidate_events_owner_created"
      ON "social_candidate_events" ("ownerUserId", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_social_candidate_events_task_created"
      ON "social_candidate_events" ("taskId", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_social_candidate_events_snapshot"
      ON "social_candidate_events" ("snapshotId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_social_candidate_events_public_intent"
      ON "social_candidate_events" ("publicIntentId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_social_candidate_events_matching_job"
      ON "social_candidate_events" ("matchingJobId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_social_candidate_events_social_request"
      ON "social_candidate_events" ("socialRequestId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_social_candidate_events_candidate"
      ON "social_candidate_events" ("candidateUserId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_social_candidate_events_type_created"
      ON "social_candidate_events" ("eventType", "createdAt")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_social_candidate_events_idempotency"
      ON "social_candidate_events" ("ownerUserId", "eventType", "idempotencyKey")
      WHERE "idempotencyKey" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_social_candidate_events_idempotency"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_social_candidate_events_type_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_social_candidate_events_candidate"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_social_candidate_events_social_request"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_social_candidate_events_matching_job"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_social_candidate_events_public_intent"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_social_candidate_events_snapshot"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_social_candidate_events_task_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_social_candidate_events_owner_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_social_candidate_snapshots_type_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_social_candidate_snapshots_social_request"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_social_candidate_snapshots_matching_job"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_social_candidate_snapshots_public_intent"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_social_candidate_snapshots_task_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_social_candidate_snapshots_owner_created"`,
    );

    await queryRunner.query(
      `ALTER TABLE "social_candidate_events" DROP CONSTRAINT IF EXISTS "fk_social_candidate_events_matching_job"`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_candidate_events" DROP CONSTRAINT IF EXISTS "fk_social_candidate_events_public_intent"`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_candidate_events" DROP CONSTRAINT IF EXISTS "fk_social_candidate_events_social_request"`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_candidate_events" DROP CONSTRAINT IF EXISTS "fk_social_candidate_events_snapshot"`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_candidate_events" DROP CONSTRAINT IF EXISTS "fk_social_candidate_events_task"`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_candidate_events" DROP CONSTRAINT IF EXISTS "fk_social_candidate_events_owner"`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_candidate_snapshots" DROP CONSTRAINT IF EXISTS "fk_social_candidate_snapshots_matching_job"`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_candidate_snapshots" DROP CONSTRAINT IF EXISTS "fk_social_candidate_snapshots_public_intent"`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_candidate_snapshots" DROP CONSTRAINT IF EXISTS "fk_social_candidate_snapshots_social_request"`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_candidate_snapshots" DROP CONSTRAINT IF EXISTS "fk_social_candidate_snapshots_task"`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_candidate_snapshots" DROP CONSTRAINT IF EXISTS "fk_social_candidate_snapshots_owner"`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS "social_candidate_events"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "social_candidate_snapshots"`,
    );
  }
}
