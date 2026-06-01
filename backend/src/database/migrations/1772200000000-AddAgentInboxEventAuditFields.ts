import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAgentInboxEventAuditFields1772200000000 implements MigrationInterface {
  name = 'AddAgentInboxEventAuditFields1772200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "agent_activity_logs_action_enum"
      ADD VALUE IF NOT EXISTS 'agent_event'
    `);
    await queryRunner.query(`
      ALTER TYPE "agent_action_logs_actiontype_enum"
      ADD VALUE IF NOT EXISTS 'agent_event'
    `);
    await queryRunner.query(
      `ALTER TABLE "agent_activity_logs" ADD COLUMN IF NOT EXISTS "ownerUserId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_activity_logs" ADD COLUMN IF NOT EXISTS "eventType" varchar(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_activity_logs" ADD COLUMN IF NOT EXISTS "conversationId" varchar(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_activity_logs" ADD COLUMN IF NOT EXISTS "messageId" varchar(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_activity_logs" ADD COLUMN IF NOT EXISTS "status" varchar(40)`,
    );
    await queryRunner.query(`
      UPDATE "agent_activity_logs"
      SET "ownerUserId" = "userId"
      WHERE "ownerUserId" IS NULL
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_agent_activity_logs_event_created" ON "agent_activity_logs" ("agentConnectionId", "eventType", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_agent_activity_logs_conversation" ON "agent_activity_logs" ("conversationId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_action_logs" ADD COLUMN IF NOT EXISTS "eventType" varchar(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_action_logs" ADD COLUMN IF NOT EXISTS "conversationId" varchar(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_action_logs" ADD COLUMN IF NOT EXISTS "messageId" varchar(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_action_logs" ADD COLUMN IF NOT EXISTS "status" varchar(40)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_agent_action_logs_event_created" ON "agent_action_logs" ("agentId", "eventType", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_activity_logs_conversation"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_activity_logs_event_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_action_logs_event_created"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_action_logs" DROP COLUMN IF EXISTS "status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_action_logs" DROP COLUMN IF EXISTS "messageId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_action_logs" DROP COLUMN IF EXISTS "conversationId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_action_logs" DROP COLUMN IF EXISTS "eventType"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_activity_logs" DROP COLUMN IF EXISTS "status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_activity_logs" DROP COLUMN IF EXISTS "messageId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_activity_logs" DROP COLUMN IF EXISTS "conversationId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_activity_logs" DROP COLUMN IF EXISTS "eventType"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_activity_logs" DROP COLUMN IF EXISTS "ownerUserId"`,
    );
  }
}
