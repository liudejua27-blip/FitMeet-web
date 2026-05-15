-- =============================================================================
-- agent-schema-drift-fix-20260513.sql
--
-- Fixes Entity-vs-production-schema drift found by scanning current TypeORM
-- entities against backend/src/database/migrations and the production SQL
-- patches.
--
-- Critical fixes:
--   1. Create/complete agent_action_logs for AgentActionLog.
--   2. Add agent_approval_requests.relatedActivityId for pending activity
--      approvals and action-log linkage.
--
-- Rules:
--   - Idempotent. Safe to re-run.
--   - No DROP / DELETE / TRUNCATE / data-loss statements.
--   - All camelCase identifiers are double-quoted.
--   - Verification runs inside the transaction and raises if the critical
--     table or column is still missing.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_action_logs_actiontype_enum') THEN
    CREATE TYPE agent_action_logs_actiontype_enum AS ENUM (
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
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_action_logs_actionstatus_enum') THEN
    CREATE TYPE agent_action_logs_actionstatus_enum AS ENUM (
      'planned',
      'executed',
      'pending_approval',
      'rejected',
      'failed'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_action_logs_risklevel_enum') THEN
    CREATE TYPE agent_action_logs_risklevel_enum AS ENUM ('low','medium','high');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "agent_action_logs" (
  "id"                     SERIAL PRIMARY KEY,
  "agentId"                integer NULL,
  "ownerUserId"            integer NOT NULL,
  "actionType"             agent_action_logs_actiontype_enum NOT NULL,
  "actionStatus"           agent_action_logs_actionstatus_enum NOT NULL DEFAULT 'planned',
  "riskLevel"              agent_action_logs_risklevel_enum NOT NULL DEFAULT 'low',
  "targetUserId"           integer NULL,
  "targetAgentId"          integer NULL,
  "relatedSocialRequestId" integer NULL,
  "relatedCandidateId"     integer NULL,
  "relatedActivityId"      integer NULL,
  "inputSummary"           varchar(500) NULL,
  "outputSummary"          varchar(500) NULL,
  "payload"                jsonb NOT NULL DEFAULT '{}'::jsonb,
  "reason"                 text NULL,
  "createdAt"              timestamp NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS "agent_action_logs"
  ADD COLUMN IF NOT EXISTS "agentId"                integer NULL,
  ADD COLUMN IF NOT EXISTS "ownerUserId"            integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "actionType"             agent_action_logs_actiontype_enum NOT NULL DEFAULT 'read_profile',
  ADD COLUMN IF NOT EXISTS "actionStatus"           agent_action_logs_actionstatus_enum NOT NULL DEFAULT 'planned',
  ADD COLUMN IF NOT EXISTS "riskLevel"              agent_action_logs_risklevel_enum NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS "targetUserId"           integer NULL,
  ADD COLUMN IF NOT EXISTS "targetAgentId"          integer NULL,
  ADD COLUMN IF NOT EXISTS "relatedSocialRequestId" integer NULL,
  ADD COLUMN IF NOT EXISTS "relatedCandidateId"     integer NULL,
  ADD COLUMN IF NOT EXISTS "relatedActivityId"      integer NULL,
  ADD COLUMN IF NOT EXISTS "inputSummary"           varchar(500) NULL,
  ADD COLUMN IF NOT EXISTS "outputSummary"          varchar(500) NULL,
  ADD COLUMN IF NOT EXISTS "payload"                jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "reason"                 text NULL,
  ADD COLUMN IF NOT EXISTS "createdAt"              timestamp NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS "idx_agent_action_logs_owner_created"
  ON "agent_action_logs" ("ownerUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_agent_action_logs_agent_created"
  ON "agent_action_logs" ("agentId", "createdAt");

ALTER TABLE IF EXISTS "agent_approval_requests"
  ADD COLUMN IF NOT EXISTS "relatedActivityId" integer NULL;

DO $$
BEGIN
  IF to_regclass('public.agent_action_logs') IS NULL THEN
    RAISE EXCEPTION 'schema drift fix failed: agent_action_logs table is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'agent_approval_requests'
       AND column_name = 'relatedActivityId'
  ) THEN
    RAISE EXCEPTION 'schema drift fix failed: agent_approval_requests.relatedActivityId is missing';
  END IF;
END
$$;

COMMIT;

-- Verification queries for operators:
--   SELECT to_regclass('public.agent_action_logs') IS NOT NULL AS has_agent_action_logs;
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND table_name = 'agent_approval_requests'
--      AND column_name = 'relatedActivityId';
