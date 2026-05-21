-- =============================================================================
-- social-agent-final-schema-patch-20260519.sql
--
-- Idempotent production patch for final Social Agent productization.
-- Adds reply-loop status values, agent_tasks.memory, payment intents, and
-- action-log enum values used by offline meeting/payment/autopilot flows.
-- =============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_task_status_enum')
     AND NOT EXISTS (
       SELECT 1 FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'agent_task_status_enum'
         AND e.enumlabel = 'waiting_result'
     ) THEN
    ALTER TYPE "agent_task_status_enum" ADD VALUE 'waiting_result';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_task_status_enum')
     AND NOT EXISTS (
       SELECT 1 FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'agent_task_status_enum'
         AND e.enumlabel = 'waiting_reply'
     ) THEN
    ALTER TYPE "agent_task_status_enum" ADD VALUE 'waiting_reply';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_action_logs_actiontype_enum')
     AND NOT EXISTS (
       SELECT 1 FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'agent_action_logs_actiontype_enum'
         AND e.enumlabel = 'offline_meeting'
     ) THEN
    ALTER TYPE "agent_action_logs_actiontype_enum" ADD VALUE 'offline_meeting';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_action_logs_actiontype_enum')
     AND NOT EXISTS (
       SELECT 1 FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'agent_action_logs_actiontype_enum'
         AND e.enumlabel = 'payment'
     ) THEN
    ALTER TYPE "agent_action_logs_actiontype_enum" ADD VALUE 'payment';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_action_logs_actiontype_enum')
     AND NOT EXISTS (
       SELECT 1 FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'agent_action_logs_actiontype_enum'
         AND e.enumlabel = 'agent_event'
     ) THEN
    ALTER TYPE "agent_action_logs_actiontype_enum" ADD VALUE 'agent_event';
  END IF;
END $$;

ALTER TABLE "agent_tasks"
  ADD COLUMN IF NOT EXISTS "memory" jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$ BEGIN
  CREATE TYPE "payment_intents_status_enum" AS ENUM (
    'pending', 'created', 'completed', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "payment_intents" (
  "id" SERIAL PRIMARY KEY,
  "ownerUserId" integer NOT NULL,
  "agentConnectionId" integer,
  "agentTaskId" integer,
  "stepId" varchar(80),
  "targetUserId" integer,
  "amount" numeric(12,2) NOT NULL,
  "currency" varchar(8) NOT NULL DEFAULT 'CNY',
  "description" text NOT NULL DEFAULT '',
  "status" "payment_intents_status_enum" NOT NULL DEFAULT 'created',
  "provider" varchar(80) NOT NULL DEFAULT 'manual_intent',
  "providerReference" varchar(120),
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "fk_payment_intents_owner" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_payment_intents_agent" FOREIGN KEY ("agentConnectionId") REFERENCES "agent_connections"("id") ON DELETE SET NULL,
  CONSTRAINT "fk_payment_intents_task" FOREIGN KEY ("agentTaskId") REFERENCES "agent_tasks"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_payment_intents_owner_created"
  ON "payment_intents" ("ownerUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_payment_intents_agent_created"
  ON "payment_intents" ("agentConnectionId", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_payment_intents_status_created"
  ON "payment_intents" ("status", "createdAt");
