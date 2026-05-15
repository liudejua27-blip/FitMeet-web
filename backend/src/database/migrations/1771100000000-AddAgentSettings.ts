import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the `agent_settings` table — coarse-grained per-(user, agent) policy
 * that gates agent autonomy. Sits one layer above `agent_permissions`.
 *
 * Schema mirrors `AgentSettings` entity in
 * src/agent-gateway/entities/agent-settings.entity.ts.
 */
export class AddAgentSettings1771100000000 implements MigrationInterface {
  name = 'AddAgentSettings1771100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_settings_mode_enum" AS ENUM ('assisted', 'limited_auto', 'lab');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_settings" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL,
        "agentConnectionId" integer,
        "mode" "agent_settings_mode_enum" NOT NULL DEFAULT 'assisted',
        "allowSearch" boolean NOT NULL DEFAULT true,
        "allowDraftMessage" boolean NOT NULL DEFAULT true,
        "allowSendMessage" boolean NOT NULL DEFAULT false,
        "allowAutoReply" boolean NOT NULL DEFAULT false,
        "allowCreateActivity" boolean NOT NULL DEFAULT false,
        "allowJoinActivity" boolean NOT NULL DEFAULT false,
        "allowShareLocation" boolean NOT NULL DEFAULT false,
        "allowUploadProof" boolean NOT NULL DEFAULT false,
        "allowContactExchange" boolean NOT NULL DEFAULT false,
        "maxDailyMessages" integer NOT NULL DEFAULT 20,
        "requireApprovalForFirstMessage" boolean NOT NULL DEFAULT true,
        "requireApprovalForOfflineMeeting" boolean NOT NULL DEFAULT true,
        "requireApprovalForPhotoUpload" boolean NOT NULL DEFAULT true,
        "requireApprovalForAll" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_agent_settings_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_agent_settings_connection" FOREIGN KEY ("agentConnectionId") REFERENCES "agent_connections"("id") ON DELETE CASCADE
      )
    `);

    // The entity's @Index(['userId','agentConnectionId'], { unique: true }) —
    // null `agentConnectionId` rows act as "applies to all agents". Postgres
    // treats NULLs as distinct in unique indexes by default which matches the
    // intent (multiple specific overrides + one global default).
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uniq_agent_settings_user_conn" ON "agent_settings" ("userId", "agentConnectionId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uniq_agent_settings_user_conn"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_settings"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_settings_mode_enum"`);
  }
}
