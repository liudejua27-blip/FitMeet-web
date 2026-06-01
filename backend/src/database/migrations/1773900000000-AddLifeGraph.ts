import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLifeGraph1773900000000 implements MigrationInterface {
  name = 'AddLifeGraph1773900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "life_graph_profiles" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL UNIQUE,
        "completenessScore" integer NOT NULL DEFAULT 0,
        "currentSocialGoal" text NOT NULL DEFAULT '',
        "aiSummary" text NOT NULL DEFAULT '',
        "preferredLanguage" varchar NOT NULL DEFAULT 'zh-CN',
        "country" varchar NOT NULL DEFAULT '',
        "region" varchar NOT NULL DEFAULT '',
        "city" varchar NOT NULL DEFAULT '',
        "timezone" varchar NOT NULL DEFAULT 'Asia/Shanghai',
        "lastUpdatedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "fk_life_graph_profiles_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "life_graph_fields" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL,
        "category" varchar(64) NOT NULL,
        "fieldKey" varchar(96) NOT NULL,
        "fieldValue" jsonb NOT NULL DEFAULT '{}',
        "source" varchar(48) NOT NULL,
        "confidence" double precision NOT NULL DEFAULT 1,
        "confirmedByUser" boolean NOT NULL DEFAULT false,
        "editable" boolean NOT NULL DEFAULT true,
        "revoked" boolean NOT NULL DEFAULT false,
        "revokedAt" TIMESTAMP WITH TIME ZONE,
        "lastInferredAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "fk_life_graph_fields_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "life_graph_audit_logs" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL,
        "fieldKey" varchar(96) NOT NULL,
        "category" varchar(64) NOT NULL,
        "oldValue" jsonb,
        "newValue" jsonb,
        "source" varchar(48) NOT NULL,
        "confidence" double precision,
        "action" varchar(48) NOT NULL,
        "reason" text NOT NULL DEFAULT '',
        "taskId" integer,
        "messageId" varchar(96),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "fk_life_graph_audit_logs_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "life_graph_proposals" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL,
        "taskId" integer,
        "messageId" varchar(96),
        "proposedFields" jsonb NOT NULL DEFAULT '[]',
        "status" varchar(48) NOT NULL DEFAULT 'proposed',
        "aiSummary" text NOT NULL DEFAULT '',
        "missingFields" jsonb NOT NULL DEFAULT '[]',
        "confirmationRequired" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "confirmedAt" TIMESTAMP WITH TIME ZONE,
        "rejectedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "fk_life_graph_proposals_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_life_graph_profiles_user" ON "life_graph_profiles" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_life_graph_fields_user" ON "life_graph_fields" ("userId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_life_graph_fields_user_category_key" ON "life_graph_fields" ("userId", "category", "fieldKey")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_life_graph_fields_user_category" ON "life_graph_fields" ("userId", "category")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_life_graph_fields_user_field_key" ON "life_graph_fields" ("userId", "fieldKey")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_life_graph_audit_logs_user" ON "life_graph_audit_logs" ("userId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_life_graph_audit_logs_created_at" ON "life_graph_audit_logs" ("createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_life_graph_proposals_user" ON "life_graph_proposals" ("userId", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_life_graph_audit_logs_user"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_life_graph_audit_logs_created_at"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_life_graph_proposals_user"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_life_graph_fields_user_field_key"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_life_graph_fields_user_category"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_life_graph_fields_user_category_key"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_life_graph_fields_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_life_graph_profiles_user"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "life_graph_audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "life_graph_proposals"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "life_graph_fields"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "life_graph_profiles"`);
  }
}
