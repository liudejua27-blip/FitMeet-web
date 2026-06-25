import { MigrationInterface, QueryRunner } from 'typeorm';

export class MatchingJobs1781400000000 implements MigrationInterface {
  name = 'MatchingJobs1781400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "matching_jobs" (
        "id" SERIAL PRIMARY KEY,
        "publicIntentId" varchar(80) NOT NULL,
        "ownerUserId" integer,
        "linkedSocialRequestId" integer,
        "sourceVersion" varchar(128) NOT NULL,
        "idempotencyKey" varchar(180) NOT NULL,
        "status" varchar(40) NOT NULL DEFAULT 'queued',
        "attemptCount" integer NOT NULL DEFAULT 0,
        "candidateCount" integer NOT NULL DEFAULT 0,
        "errorMessage" text NOT NULL DEFAULT '',
        "result" jsonb NOT NULL DEFAULT '{}',
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "nextRunAt" timestamptz,
        "startedAt" timestamptz,
        "completedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_matching_jobs_idempotency_key" ON "matching_jobs" ("idempotencyKey")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_matching_jobs_public_intent_source" ON "matching_jobs" ("publicIntentId", "sourceVersion")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_matching_jobs_status_next_run" ON "matching_jobs" ("status", "nextRunAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_matching_jobs_status_next_run"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_matching_jobs_public_intent_source"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_matching_jobs_idempotency_key"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "matching_jobs"`);
  }
}
