import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLifeGraphAccessAuditLogs1776600000000
  implements MigrationInterface
{
  name = 'AddLifeGraphAccessAuditLogs1776600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "life_graph_access_audit_logs" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL,
        "actorUserId" integer,
        "action" varchar(80) NOT NULL,
        "purpose" varchar(120) NOT NULL DEFAULT '',
        "route" varchar(180) NOT NULL DEFAULT '',
        "decision" varchar(40) NOT NULL DEFAULT 'allowed',
        "dataTiers" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "fieldKeys" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_life_graph_access_audit_logs_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_life_graph_access_audit_logs_actor"
          FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_life_graph_access_audit_user_created"
      ON "life_graph_access_audit_logs" ("userId", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_life_graph_access_audit_actor_created"
      ON "life_graph_access_audit_logs" ("actorUserId", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_life_graph_access_audit_action_created"
      ON "life_graph_access_audit_logs" ("action", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_life_graph_access_audit_action_created"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_life_graph_access_audit_actor_created"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_life_graph_access_audit_user_created"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "life_graph_access_audit_logs"
    `);
  }
}
