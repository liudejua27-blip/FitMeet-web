import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSocialAgentLongTermMemory1773800000000 implements MigrationInterface {
  name = 'AddSocialAgentLongTermMemory1773800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social_agent_long_term_memory" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL,
        "preferences" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "boundaries" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "activityPreferences" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "matchSignals" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "taskSummaries" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "taskCount" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_social_agent_long_term_memory_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_social_agent_long_term_memory_user"
        ON "social_agent_long_term_memory" ("userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_social_agent_long_term_memory_user"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "social_agent_long_term_memory"`,
    );
  }
}
