import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenAgentActivityLogConnectionFk1776100000000 implements MigrationInterface {
  name = 'HardenAgentActivityLogConnectionFk1776100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "agent_activity_logs" log
      SET "agentConnectionId" = NULL
      WHERE "agentConnectionId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM "agent_connections" conn
          WHERE conn.id = log."agentConnectionId"
        )
    `);
    await queryRunner.query(`
      ALTER TABLE "agent_activity_logs"
      ALTER COLUMN "agentConnectionId" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "agent_activity_logs"
      DROP CONSTRAINT IF EXISTS "fk_agent_activity_logs_connection"
    `);
    await queryRunner.query(`
      ALTER TABLE "agent_activity_logs"
      ADD CONSTRAINT "fk_agent_activity_logs_connection"
      FOREIGN KEY ("agentConnectionId")
      REFERENCES "agent_connections"("id")
      ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "agent_activity_logs"
      DROP CONSTRAINT IF EXISTS "fk_agent_activity_logs_connection"
    `);
    await queryRunner.query(`
      ALTER TABLE "agent_activity_logs"
      ADD CONSTRAINT "fk_agent_activity_logs_connection"
      FOREIGN KEY ("agentConnectionId")
      REFERENCES "agent_connections"("id")
      ON DELETE SET NULL
    `);
  }
}
