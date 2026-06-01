import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAgentActionLogsSchema1772100000000 implements MigrationInterface {
  name = 'AddAgentActionLogsSchema1772100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_action_logs_actiontype_enum" AS ENUM (
          'read_profile',
          'generate_profile_question',
          'update_profile',
          'create_social_request',
          'sync_to_hall',
          'run_match',
          'generate_invite',
          'send_message',
          'add_friend',
          'create_activity',
          'invite_activity',
          'approve_action',
          'reject_action'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_action_logs_actionstatus_enum" AS ENUM (
          'planned',
          'executed',
          'pending_approval',
          'rejected',
          'failed'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_action_logs_risklevel_enum" AS ENUM (
          'low',
          'medium',
          'high'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_action_logs" (
        "id" SERIAL PRIMARY KEY,
        "agentId" integer,
        "ownerUserId" integer NOT NULL,
        "actionType" "agent_action_logs_actiontype_enum" NOT NULL,
        "actionStatus" "agent_action_logs_actionstatus_enum" NOT NULL DEFAULT 'planned',
        "riskLevel" "agent_action_logs_risklevel_enum" NOT NULL DEFAULT 'low',
        "targetUserId" integer,
        "targetAgentId" integer,
        "relatedSocialRequestId" integer,
        "relatedCandidateId" integer,
        "relatedActivityId" integer,
        "inputSummary" varchar(500),
        "outputSummary" varchar(500),
        "payload" jsonb NOT NULL DEFAULT '{}',
        "reason" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_agent_action_logs_owner_created" ON "agent_action_logs" ("ownerUserId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_agent_action_logs_agent_created" ON "agent_action_logs" ("agentId", "createdAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_approval_requests" ADD COLUMN IF NOT EXISTS "relatedActivityId" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "agent_approval_requests" DROP COLUMN IF EXISTS "relatedActivityId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_action_logs_agent_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_action_logs_owner_created"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_action_logs"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "agent_action_logs_risklevel_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "agent_action_logs_actionstatus_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "agent_action_logs_actiontype_enum"`,
    );
  }
}
