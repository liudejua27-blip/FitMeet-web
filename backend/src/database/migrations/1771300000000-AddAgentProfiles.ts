import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAgentProfiles1771300000000 implements MigrationInterface {
  name = 'AddAgentProfiles1771300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_profiles_agentType_enum" AS ENUM (
          'user_agent', 'platform_agent', 'external_agent'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_profiles_provider_enum" AS ENUM (
          'deepseek', 'openclaw', 'codex', 'qclaw', 'custom'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_profiles_autonomyLevel_enum" AS ENUM (
          'assisted', 'normal', 'open'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_profiles_status_enum" AS ENUM (
          'active', 'paused', 'blocked'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_profiles" (
        "id" SERIAL PRIMARY KEY,
        "ownerUserId" integer,
        "agentConnectionId" integer,
        "agentName" varchar(80) NOT NULL,
        "agentType" "agent_profiles_agentType_enum" NOT NULL DEFAULT 'user_agent',
        "provider" "agent_profiles_provider_enum" NOT NULL DEFAULT 'custom',
        "avatar" varchar NOT NULL DEFAULT '',
        "bio" text NOT NULL DEFAULT '',
        "personality" text NOT NULL DEFAULT '',
        "goals" jsonb NOT NULL DEFAULT '[]',
        "interests" jsonb NOT NULL DEFAULT '[]',
        "preferredTargets" jsonb NOT NULL DEFAULT '[]',
        "boundaries" jsonb NOT NULL DEFAULT '[]',
        "autonomyLevel" "agent_profiles_autonomyLevel_enum" NOT NULL DEFAULT 'normal',
        "status" "agent_profiles_status_enum" NOT NULL DEFAULT 'active',
        "lastActiveAt" timestamptz,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_agent_profiles_owner" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_agent_profiles_connection" FOREIGN KEY ("agentConnectionId") REFERENCES "agent_connections"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_agent_profiles_ownerUserId" ON "agent_profiles" ("ownerUserId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_agent_profiles_agentType" ON "agent_profiles" ("agentType")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_agent_profiles_provider" ON "agent_profiles" ("provider")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_agent_profiles_agentConnectionId" ON "agent_profiles" ("agentConnectionId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_profiles_agentConnectionId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_profiles_provider"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_profiles_agentType"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_profiles_ownerUserId"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_profiles"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_profiles_status_enum"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "agent_profiles_autonomyLevel_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_profiles_provider_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_profiles_agentType_enum"`);
  }
}
