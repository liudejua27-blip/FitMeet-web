import { MigrationInterface, QueryRunner } from 'typeorm';

export class AgentAuxiliarySchemaAlignment1783100000000 implements MigrationInterface {
  name = 'AgentAuxiliarySchemaAlignment1783100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const statements = [
      `ALTER TABLE "social_agent_reminder_preferences"
       ADD COLUMN IF NOT EXISTS "topics" jsonb NOT NULL DEFAULT '["friendship", "fitness_partner", "activity"]'::jsonb`,
      `ALTER TABLE "social_agent_reminder_preferences"
       ADD COLUMN IF NOT EXISTS "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb`,
      `ALTER TABLE "social_agent_reminders"
       ADD COLUMN IF NOT EXISTS "taskId" integer`,
      `ALTER TABLE "social_agent_reminders"
       ADD COLUMN IF NOT EXISTS "dismissedAt" timestamptz`,
      `ALTER TABLE "social_agent_reminders"
       ADD COLUMN IF NOT EXISTS "context" jsonb NOT NULL DEFAULT '{}'::jsonb`,
      `ALTER TABLE "social_agent_reminders"
       ADD COLUMN IF NOT EXISTS "message" text NOT NULL DEFAULT ''`,
      `ALTER TABLE "life_graph_audit_logs"
       ADD COLUMN IF NOT EXISTS "category" varchar(64) NOT NULL DEFAULT 'lifestyle'`,
      `ALTER TABLE "life_graph_audit_logs"
       ADD COLUMN IF NOT EXISTS "oldValue" jsonb`,
      `ALTER TABLE "life_graph_audit_logs"
       ADD COLUMN IF NOT EXISTS "newValue" jsonb`,
      `ALTER TABLE "life_graph_audit_logs"
       ADD COLUMN IF NOT EXISTS "taskId" integer`,
      `ALTER TABLE "life_graph_audit_logs"
       ADD COLUMN IF NOT EXISTS "messageId" varchar(96)`,
    ];

    for (const statement of statements) {
      await queryRunner.query(statement);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const statements = [
      `ALTER TABLE "life_graph_audit_logs" DROP COLUMN IF EXISTS "messageId"`,
      `ALTER TABLE "life_graph_audit_logs" DROP COLUMN IF EXISTS "taskId"`,
      `ALTER TABLE "life_graph_audit_logs" DROP COLUMN IF EXISTS "newValue"`,
      `ALTER TABLE "life_graph_audit_logs" DROP COLUMN IF EXISTS "oldValue"`,
      `ALTER TABLE "life_graph_audit_logs" DROP COLUMN IF EXISTS "category"`,
      `ALTER TABLE "social_agent_reminders" DROP COLUMN IF EXISTS "message"`,
      `ALTER TABLE "social_agent_reminders" DROP COLUMN IF EXISTS "context"`,
      `ALTER TABLE "social_agent_reminders" DROP COLUMN IF EXISTS "dismissedAt"`,
      `ALTER TABLE "social_agent_reminders" DROP COLUMN IF EXISTS "taskId"`,
      `ALTER TABLE "social_agent_reminder_preferences" DROP COLUMN IF EXISTS "metadata"`,
      `ALTER TABLE "social_agent_reminder_preferences" DROP COLUMN IF EXISTS "topics"`,
    ];

    for (const statement of statements) {
      await queryRunner.query(statement);
    }
  }
}
