import { MigrationInterface, QueryRunner } from 'typeorm';

export class AgentDismissPersistenceStabilization1781600000000 implements MigrationInterface {
  name = 'AgentDismissPersistenceStabilization1781600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const statements = [
      `CREATE INDEX IF NOT EXISTS "idx_user_social_requests_publish_status"
       ON "user_social_requests" (("metadata" ->> 'publishStatus'))`,
      `CREATE INDEX IF NOT EXISTS "idx_public_social_intents_tombstone"
       ON "public_social_intents" (("metadata" ->> 'tombstoned'), "status")`,
      `CREATE INDEX IF NOT EXISTS "idx_matching_jobs_request_status"
       ON "matching_jobs" ("linkedSocialRequestId", "status")`,
      `CREATE INDEX IF NOT EXISTS "idx_matching_jobs_public_status"
       ON "matching_jobs" ("publicIntentId", "status")`,
    ];

    for (const statement of statements) {
      await queryRunner.query(statement);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const statements = [
      `DROP INDEX IF EXISTS "idx_matching_jobs_public_status"`,
      `DROP INDEX IF EXISTS "idx_matching_jobs_request_status"`,
      `DROP INDEX IF EXISTS "idx_public_social_intents_tombstone"`,
      `DROP INDEX IF EXISTS "idx_user_social_requests_publish_status"`,
    ];

    for (const statement of statements) {
      await queryRunner.query(statement);
    }
  }
}
