-- =============================================================================
-- agent-task-runtime-schema-patch-20260519.sql
--
-- Idempotent production patch for migration
-- 1773200000000-AddAgentTaskRuntime.ts (Social Agent Runtime foundation).
--
-- Adds:
--   - enums  agent_task_status_enum, agent_task_permission_mode_enum,
--            agent_task_risk_level_enum, agent_task_event_type_enum,
--            agent_task_event_actor_enum
--   - tables agent_tasks, agent_task_events
--   - supporting indexes (incl. partial unique on idempotencyKey)
--
-- Rules:
--   - Idempotent. Re-running this script is a no-op.
--   - No DROP / DELETE / TRUNCATE / data-loss statements.
--   - All identifiers double-quoted (camelCase preserved).
--   - Wrapped in a single transaction so partial failures roll back.
--
-- Apply on production:
--     psql "$DATABASE_URL" \
--          -v ON_ERROR_STOP=1 \
--          -f backend/scripts/agent-task-runtime-schema-patch-20260519.sql
-- =============================================================================

BEGIN;

DO $$ BEGIN
  CREATE TYPE "agent_task_status_enum" AS ENUM (
    'pending', 'planning', 'awaiting_confirmation', 'executing',
    'awaiting_feedback', 'succeeded', 'failed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "agent_task_permission_mode_enum" AS ENUM (
    'assist', 'confirm', 'limited_auto'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "agent_task_risk_level_enum" AS ENUM (
    'low', 'medium', 'high', 'blocked'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "agent_task_event_type_enum" AS ENUM (
    'task.created', 'goal.understood',
    'plan.generated', 'plan.updated',
    'step.started', 'tool.called', 'tool.returned',
    'confirmation.requested', 'confirmation.received',
    'step.completed', 'feedback.received',
    'task.succeeded', 'task.failed', 'task.cancelled',
    'note'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "agent_task_event_actor_enum" AS ENUM (
    'agent', 'user', 'system', 'tool'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "agent_tasks" (
  "id" SERIAL PRIMARY KEY,
  "ownerUserId" integer NOT NULL,
  "agentConnectionId" integer,
  "taskType" varchar(80) NOT NULL DEFAULT 'social_goal',
  "title" varchar(200) NOT NULL DEFAULT '',
  "goal" text NOT NULL DEFAULT '',
  "input" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "plan" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "toolCalls" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "result" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" "agent_task_status_enum" NOT NULL DEFAULT 'pending',
  "permissionMode" "agent_task_permission_mode_enum" NOT NULL DEFAULT 'confirm',
  "riskLevel" "agent_task_risk_level_enum" NOT NULL DEFAULT 'low',
  "idempotencyKey" varchar(120),
  "statusReason" text,
  "error" jsonb,
  "startedAt" timestamptz,
  "awaitingConfirmationAt" timestamptz,
  "completedAt" timestamptz,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "fk_agent_tasks_owner" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_agent_tasks_connection" FOREIGN KEY ("agentConnectionId") REFERENCES "agent_connections"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "agent_task_events" (
  "id" SERIAL PRIMARY KEY,
  "taskId" integer NOT NULL,
  "ownerUserId" integer NOT NULL,
  "eventType" "agent_task_event_type_enum" NOT NULL,
  "actor" "agent_task_event_actor_enum" NOT NULL DEFAULT 'agent',
  "summary" varchar(500) NOT NULL DEFAULT '',
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "stepId" varchar(80),
  "toolCallId" varchar(80),
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "fk_agent_task_events_task" FOREIGN KEY ("taskId") REFERENCES "agent_tasks"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_agent_task_events_owner" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_agent_tasks_owner_status_updated"
  ON "agent_tasks" ("ownerUserId", "status", "updatedAt");
CREATE INDEX IF NOT EXISTS "idx_agent_tasks_agent_status"
  ON "agent_tasks" ("agentConnectionId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_agent_tasks_idempotency_key"
  ON "agent_tasks" ("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_agent_task_events_task_created"
  ON "agent_task_events" ("taskId", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_agent_task_events_owner_type_created"
  ON "agent_task_events" ("ownerUserId", "eventType", "createdAt");

COMMIT;
