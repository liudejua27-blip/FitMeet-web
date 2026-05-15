BEGIN;

ALTER TABLE "agent_action_logs"
  ADD COLUMN IF NOT EXISTS "eventType" varchar,
  ADD COLUMN IF NOT EXISTS "conversationId" varchar,
  ADD COLUMN IF NOT EXISTS "messageId" varchar,
  ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'success',
  ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb;

ALTER TABLE "agent_activity_logs"
  ADD COLUMN IF NOT EXISTS "ownerUserId" integer,
  ADD COLUMN IF NOT EXISTS "agentConnectionId" integer,
  ADD COLUMN IF NOT EXISTS "eventType" varchar,
  ADD COLUMN IF NOT EXISTS "conversationId" varchar,
  ADD COLUMN IF NOT EXISTS "messageId" varchar,
  ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'success',
  ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS "idx_agent_action_logs_event_type"
  ON "agent_action_logs" ("eventType");

CREATE INDEX IF NOT EXISTS "idx_agent_action_logs_conversation"
  ON "agent_action_logs" ("conversationId");

CREATE INDEX IF NOT EXISTS "idx_agent_activity_logs_owner"
  ON "agent_activity_logs" ("ownerUserId");

CREATE INDEX IF NOT EXISTS "idx_agent_activity_logs_agent_connection"
  ON "agent_activity_logs" ("agentConnectionId");

CREATE INDEX IF NOT EXISTS "idx_agent_activity_logs_event_type"
  ON "agent_activity_logs" ("eventType");

CREATE INDEX IF NOT EXISTS "idx_agent_activity_logs_conversation"
  ON "agent_activity_logs" ("conversationId");

COMMIT;
