import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLifeGraphBehaviorSignals1774300000000 implements MigrationInterface {
  name = 'AddLifeGraphBehaviorSignals1774300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "life_graph_events" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL,
        "eventType" varchar(64) NOT NULL,
        "source" varchar(80),
        "taskId" integer,
        "activityId" integer,
        "candidateUserId" integer,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "naturalSummary" text NOT NULL DEFAULT '',
        "weight" double precision NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "fk_life_graph_events_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "life_graph_signal_scores" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL,
        "signalKey" varchar(80) NOT NULL,
        "score" double precision NOT NULL DEFAULT 50,
        "confidence" double precision NOT NULL DEFAULT 0.5,
        "source" varchar(80) NOT NULL DEFAULT 'rules_v1',
        "explanation" text NOT NULL DEFAULT '',
        "evidence" jsonb NOT NULL DEFAULT '{}',
        "enabledForMatching" boolean NOT NULL DEFAULT true,
        "correctionCount" integer NOT NULL DEFAULT 0,
        "lastCalculatedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "fk_life_graph_signal_scores_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "life_graph_update_audits" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL,
        "updateType" varchar(80) NOT NULL,
        "source" varchar(80) NOT NULL DEFAULT 'life_graph',
        "status" varchar(40) NOT NULL,
        "before" jsonb NOT NULL DEFAULT '{}',
        "after" jsonb NOT NULL DEFAULT '{}',
        "userFacingSummary" text NOT NULL DEFAULT '',
        "reversible" boolean NOT NULL DEFAULT true,
        "eventId" integer,
        "correctionId" integer,
        "revokedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "fk_life_graph_update_audits_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "life_graph_corrections" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL,
        "correctionType" varchar(48) NOT NULL,
        "signalKey" varchar(80),
        "category" varchar(64),
        "fieldKey" varchar(96),
        "note" text NOT NULL DEFAULT '',
        "previousValue" jsonb NOT NULL DEFAULT '{}',
        "correctedValue" jsonb NOT NULL DEFAULT '{}',
        "applied" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "fk_life_graph_corrections_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_life_graph_events_user_type_created" ON "life_graph_events" ("userId", "eventType", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_life_graph_events_user_created" ON "life_graph_events" ("userId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_life_graph_signal_scores_user_key" ON "life_graph_signal_scores" ("userId", "signalKey")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_life_graph_signal_scores_user_updated" ON "life_graph_signal_scores" ("userId", "updatedAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_life_graph_update_audits_user_created" ON "life_graph_update_audits" ("userId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_life_graph_update_audits_user_status" ON "life_graph_update_audits" ("userId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_life_graph_corrections_user_created" ON "life_graph_corrections" ("userId", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_life_graph_corrections_user_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_life_graph_update_audits_user_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_life_graph_update_audits_user_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_life_graph_signal_scores_user_updated"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_life_graph_signal_scores_user_key"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_life_graph_events_user_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_life_graph_events_user_type_created"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "life_graph_corrections"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "life_graph_update_audits"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "life_graph_signal_scores"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "life_graph_events"`);
  }
}
