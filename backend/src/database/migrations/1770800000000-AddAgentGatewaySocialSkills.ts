import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAgentGatewaySocialSkills1770800000000 implements MigrationInterface {
  name = 'AddAgentGatewaySocialSkills1770800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_connections_permissionLevel_enum" AS ENUM ('read_only', 'draft_mode', 'assisted_mode', 'limited_auto', 'lab_mode');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_connections_status_enum" AS ENUM ('active', 'suspended', 'revoked');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_permissions_action_enum" AS ENUM ('create_social_request', 'search_profiles', 'generate_post', 'generate_message', 'send_message', 'contact_request', 'lab_chat');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "user_preferences_relationshipGoal_enum" AS ENUM ('fitness_buddy', 'casual', 'dating', 'serious');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "user_preferences_chatStyle_enum" AS ENUM ('playful', 'direct', 'intellectual', 'warm');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "match_candidates_status_enum" AS ENUM ('pending_review', 'approved', 'rejected', 'contacted');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_activity_logs_action_enum" AS ENUM ('create_social_request', 'confirm_social_request_candidate', 'search', 'draft_post', 'draft_message', 'send_message', 'contact_request', 'lab_chat', 'intercepted');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_activity_logs_result_enum" AS ENUM ('success', 'blocked', 'pending_approval', 'error');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_approval_requests_type_enum" AS ENUM ('send_message', 'post_publish', 'contact_request');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_approval_requests_status_enum" AS ENUM ('pending', 'approved', 'rejected', 'expired');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "contact_requests_status_enum" AS ENUM ('pending', 'accepted', 'declined', 'expired');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "safety_events_eventType_enum" AS ENUM ('rate_limit_exceeded', 'harassment_detected', 'spam_detected', 'impersonation_attempt', 'contact_bypass', 'unauthorized_action', 'suspicious_pattern');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "safety_events_severity_enum" AS ENUM ('low', 'medium', 'high', 'critical');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "social_requests_riskLevel_enum" AS ENUM ('low', 'medium', 'high');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "social_requests_status_enum" AS ENUM ('searching', 'matched', 'closed', 'cancelled');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_connections" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL,
        "agentName" varchar NOT NULL DEFAULT 'custom',
        "agentDisplayName" varchar NOT NULL DEFAULT '',
        "agentWebhookUrl" varchar,
        "agentTokenHash" varchar NOT NULL,
        "tokenPrefix" varchar(12) NOT NULL,
        "permissionLevel" "agent_connections_permissionLevel_enum" NOT NULL DEFAULT 'read_only',
        "status" "agent_connections_status_enum" NOT NULL DEFAULT 'active',
        "dailyActionLimit" integer NOT NULL DEFAULT 50,
        "dailyActionsUsed" integer NOT NULL DEFAULT 0,
        "dailyResetAt" timestamptz,
        "lastActiveAt" timestamptz,
        "expiresAt" timestamptz,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_agent_connections_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_permissions" (
        "id" SERIAL PRIMARY KEY,
        "agentConnectionId" integer NOT NULL,
        "action" "agent_permissions_action_enum" NOT NULL,
        "granted" boolean NOT NULL DEFAULT true,
        "constraints" jsonb NOT NULL DEFAULT '{}',
        "grantedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_agent_permissions_connection" FOREIGN KEY ("agentConnectionId") REFERENCES "agent_connections"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_preferences" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL UNIQUE,
        "idealPartnerDescription" text NOT NULL DEFAULT '',
        "aestheticPreferences" jsonb NOT NULL DEFAULT '{}',
        "personalityPreferences" jsonb NOT NULL DEFAULT '{}',
        "relationshipGoal" "user_preferences_relationshipGoal_enum" NOT NULL DEFAULT 'fitness_buddy',
        "chatStyle" "user_preferences_chatStyle_enum" NOT NULL DEFAULT 'warm',
        "privacyBoundaries" jsonb NOT NULL DEFAULT '{}',
        "agentMessagingEnabled" boolean NOT NULL DEFAULT false,
        "acceptAgentMessages" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_user_preferences_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "match_candidates" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL,
        "agentConnectionId" integer,
        "candidateUserId" integer NOT NULL,
        "score" double precision NOT NULL DEFAULT 0,
        "reasonTags" jsonb NOT NULL DEFAULT '[]',
        "reasonText" text NOT NULL DEFAULT '',
        "status" "match_candidates_status_enum" NOT NULL DEFAULT 'pending_review',
        "userFeedback" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_match_candidates_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_match_candidates_connection" FOREIGN KEY ("agentConnectionId") REFERENCES "agent_connections"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_activity_logs" (
        "id" SERIAL PRIMARY KEY,
        "agentConnectionId" integer,
        "userId" integer NOT NULL,
        "action" "agent_activity_logs_action_enum" NOT NULL,
        "payload" jsonb NOT NULL DEFAULT '{}',
        "result" "agent_activity_logs_result_enum" NOT NULL DEFAULT 'success',
        "riskScore" double precision NOT NULL DEFAULT 0,
        "blockReason" text,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_agent_activity_logs_connection" FOREIGN KEY ("agentConnectionId") REFERENCES "agent_connections"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_agent_activity_logs_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_approval_requests" (
        "id" SERIAL PRIMARY KEY,
        "agentConnectionId" integer,
        "userId" integer NOT NULL,
        "type" "agent_approval_requests_type_enum" NOT NULL,
        "payload" jsonb NOT NULL DEFAULT '{}',
        "status" "agent_approval_requests_status_enum" NOT NULL DEFAULT 'pending',
        "agentRationale" text NOT NULL DEFAULT '',
        "expiresAt" timestamptz NOT NULL,
        "respondedAt" timestamptz,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_agent_approval_requests_connection" FOREIGN KEY ("agentConnectionId") REFERENCES "agent_connections"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_agent_approval_requests_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contact_requests" (
        "id" SERIAL PRIMARY KEY,
        "requesterId" integer NOT NULL,
        "targetUserId" integer NOT NULL,
        "agentConnectionId" integer,
        "status" "contact_requests_status_enum" NOT NULL DEFAULT 'pending',
        "note" text NOT NULL DEFAULT '',
        "expiresAt" timestamptz NOT NULL,
        "respondedAt" timestamptz,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_contact_requests_requester" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_contact_requests_connection" FOREIGN KEY ("agentConnectionId") REFERENCES "agent_connections"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "safety_events" (
        "id" SERIAL PRIMARY KEY,
        "agentConnectionId" integer,
        "userId" integer NOT NULL,
        "eventType" "safety_events_eventType_enum" NOT NULL,
        "severity" "safety_events_severity_enum" NOT NULL DEFAULT 'low',
        "description" text NOT NULL DEFAULT '',
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "resolved" boolean NOT NULL DEFAULT false,
        "resolution" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_safety_events_connection" FOREIGN KEY ("agentConnectionId") REFERENCES "agent_connections"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_safety_events_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social_requests" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL,
        "agentConnectionId" integer,
        "requestType" varchar NOT NULL,
        "title" varchar NOT NULL,
        "description" text NOT NULL DEFAULT '',
        "city" varchar NOT NULL DEFAULT '',
        "loc" varchar NOT NULL DEFAULT '',
        "lat" double precision,
        "lng" double precision,
        "radiusKm" integer NOT NULL DEFAULT 5,
        "timePreference" varchar NOT NULL DEFAULT '',
        "visibility" varchar NOT NULL DEFAULT 'matched_users_only',
        "riskLevel" "social_requests_riskLevel_enum" NOT NULL DEFAULT 'low',
        "requiresUserConfirmation" boolean NOT NULL DEFAULT true,
        "filters" jsonb NOT NULL DEFAULT '{}',
        "candidateUserIds" jsonb NOT NULL DEFAULT '[]',
        "matchedCount" integer NOT NULL DEFAULT 0,
        "status" "social_requests_status_enum" NOT NULL DEFAULT 'searching',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_social_requests_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_social_requests_connection" FOREIGN KEY ("agentConnectionId") REFERENCES "agent_connections"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "public_social_intents" (
        "id" varchar(80) PRIMARY KEY,
        "mode" varchar NOT NULL DEFAULT 'public',
        "requestType" varchar NOT NULL,
        "title" varchar NOT NULL,
        "description" text NOT NULL DEFAULT '',
        "city" varchar NOT NULL DEFAULT '',
        "loc" varchar NOT NULL DEFAULT '',
        "lat" double precision,
        "lng" double precision,
        "radiusKm" integer NOT NULL DEFAULT 5,
        "timePreference" varchar NOT NULL DEFAULT '',
        "riskLevel" "social_requests_riskLevel_enum" NOT NULL DEFAULT 'low',
        "requiresUserConfirmation" boolean NOT NULL DEFAULT true,
        "filters" jsonb NOT NULL DEFAULT '{}',
        "candidateUserIds" jsonb NOT NULL DEFAULT '[]',
        "matchedCount" integer NOT NULL DEFAULT 0,
        "status" "social_requests_status_enum" NOT NULL DEFAULT 'searching',
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_agent_connections_token_prefix" ON "agent_connections" ("tokenPrefix")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_agent_connections_user_status" ON "agent_connections" ("userId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_agent_permissions_connection_action" ON "agent_permissions" ("agentConnectionId", "action")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_match_candidates_user_status" ON "match_candidates" ("userId", "status", "score")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_agent_activity_logs_user_created" ON "agent_activity_logs" ("userId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_agent_approval_requests_user_status" ON "agent_approval_requests" ("userId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_contact_requests_target_status" ON "contact_requests" ("targetUserId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_safety_events_user_created" ON "safety_events" ("userId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_social_requests_user_status" ON "social_requests" ("userId", "status", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_social_requests_location" ON "social_requests" ("city", "lat", "lng")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_public_social_intents_created" ON "public_social_intents" ("createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_public_social_intents_city_status" ON "public_social_intents" ("city", "status", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_social_requests_location"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_public_social_intents_city_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_public_social_intents_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_social_requests_user_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_safety_events_user_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_contact_requests_target_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_approval_requests_user_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_activity_logs_user_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_match_candidates_user_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_permissions_connection_action"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_connections_user_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_connections_token_prefix"`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS "social_requests"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "public_social_intents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "safety_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "contact_requests"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_approval_requests"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_activity_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "match_candidates"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_preferences"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_connections"`);

    await queryRunner.query(
      `DROP TYPE IF EXISTS "social_requests_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "social_requests_riskLevel_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "safety_events_severity_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "safety_events_eventType_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "contact_requests_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "agent_approval_requests_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "agent_approval_requests_type_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "agent_activity_logs_result_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "agent_activity_logs_action_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "match_candidates_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "user_preferences_chatStyle_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "user_preferences_relationshipGoal_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "agent_permissions_action_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "agent_connections_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "agent_connections_permissionLevel_enum"`,
    );
  }
}
