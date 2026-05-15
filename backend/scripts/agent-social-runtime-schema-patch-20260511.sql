-- =============================================================================
-- agent-social-runtime-schema-patch-20260511.sql
--
-- Round-3 (Agent Gateway runtime + AI social loop) schema delta on top of
-- backend/scripts/production-schema-patch-20260511.sql.
--
-- Scope (only what migrations 1771900-CompleteAiSocialLoop.ts introduces and
-- is NOT yet covered by production-schema-patch-20260511.sql):
--
--   1. agent_settings_mode_enum            +VALUE 'assisted', 'normal'
--   2. social_requests_status_enum         +VALUE 'active', 'inactive', 'completed'
--   3. public_social_intents_status_enum   +VALUE 'active', 'inactive', 'completed'
--                                          (only if the standalone enum exists)
--   4. public_social_intents               +columns userId / linkedSocialRequestId /
--                                                   source / interestTags /
--                                                   locationPreference / socialGoal
--                                          +indexes (userId,status) and (linkedSocialRequestId)
--   5. agent_approval_requests             +columns actionType / reason / createdBy /
--                                                   relatedSocialRequestId / relatedCandidateId
--
-- Rules (same as the previous patch):
--   - Idempotent. Re-running this script is a no-op.
--   - No DROP / DELETE / TRUNCATE / data-loss statements.
--   - All identifiers double-quoted (camelCase preserved).
--   - Wrapped in a single transaction so partial failures roll back.
--
-- Round-3 task 6 (Agent Gateway pause / resume) reuses the existing
-- `agent_connections.status` ('active' | 'suspended' | 'revoked') enum and
-- introduces NO new tables or columns of its own — nothing to patch here.
--
-- Apply on production:
--     psql "$DATABASE_URL" \
--          -v ON_ERROR_STOP=1 \
--          -f backend/scripts/agent-social-runtime-schema-patch-20260511.sql
--
--   or, if using the Docker stack:
--     docker compose --env-file .env.production -f docker-compose.prod.yml \
--         exec -T postgres psql -U "$DB_USERNAME" -d "$DB_DATABASE" \
--         -v ON_ERROR_STOP=1 \
--         < backend/scripts/agent-social-runtime-schema-patch-20260511.sql
--
-- IMPORTANT: take a pg_dump backup before applying (see DEPLOY_PRODUCTION.md §10).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. agent_settings_mode_enum: add 'assisted', 'normal'
--    Postgres ALTER TYPE ... ADD VALUE has no IF NOT EXISTS in all versions
--    we target, so guard via pg_enum lookup.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_settings_mode_enum') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'agent_settings_mode_enum' AND e.enumlabel = 'assisted'
    ) THEN
      ALTER TYPE "agent_settings_mode_enum" ADD VALUE 'assisted';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'agent_settings_mode_enum' AND e.enumlabel = 'normal'
    ) THEN
      ALTER TYPE "agent_settings_mode_enum" ADD VALUE 'normal';
    END IF;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. social_requests_status_enum: add 'active', 'inactive', 'completed'
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'social_requests_status_enum') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'social_requests_status_enum' AND e.enumlabel = 'active'
    ) THEN
      ALTER TYPE "social_requests_status_enum" ADD VALUE 'active';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'social_requests_status_enum' AND e.enumlabel = 'inactive'
    ) THEN
      ALTER TYPE "social_requests_status_enum" ADD VALUE 'inactive';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'social_requests_status_enum' AND e.enumlabel = 'completed'
    ) THEN
      ALTER TYPE "social_requests_status_enum" ADD VALUE 'completed';
    END IF;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. public_social_intents_status_enum: add 'active', 'inactive', 'completed'
--    (Only patched if a DB happened to materialise this as a standalone enum;
--     in our reference schema public_social_intents.status uses
--     social_requests_status_enum, handled above.)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'public_social_intents_status_enum') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'public_social_intents_status_enum' AND e.enumlabel = 'active'
    ) THEN
      ALTER TYPE "public_social_intents_status_enum" ADD VALUE 'active';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'public_social_intents_status_enum' AND e.enumlabel = 'inactive'
    ) THEN
      ALTER TYPE "public_social_intents_status_enum" ADD VALUE 'inactive';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'public_social_intents_status_enum' AND e.enumlabel = 'completed'
    ) THEN
      ALTER TYPE "public_social_intents_status_enum" ADD VALUE 'completed';
    END IF;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 4. public_social_intents: link-to-user + AI-social-loop columns and indexes
-- ---------------------------------------------------------------------------
ALTER TABLE "public_social_intents"
  ADD COLUMN IF NOT EXISTS "userId"                integer          NULL;
ALTER TABLE "public_social_intents"
  ADD COLUMN IF NOT EXISTS "linkedSocialRequestId" integer          NULL;
ALTER TABLE "public_social_intents"
  ADD COLUMN IF NOT EXISTS "source"                varchar          NOT NULL DEFAULT 'public_social_skills';
ALTER TABLE "public_social_intents"
  ADD COLUMN IF NOT EXISTS "interestTags"          jsonb            NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "public_social_intents"
  ADD COLUMN IF NOT EXISTS "locationPreference"    text             NOT NULL DEFAULT '';
ALTER TABLE "public_social_intents"
  ADD COLUMN IF NOT EXISTS "socialGoal"            text             NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS "idx_public_social_intents_user_status"
  ON "public_social_intents" ("userId", "status");
CREATE INDEX IF NOT EXISTS "idx_public_social_intents_linked_request"
  ON "public_social_intents" ("linkedSocialRequestId");

-- ---------------------------------------------------------------------------
-- 5. agent_approval_requests: action metadata + cross-links for AI social loop
-- ---------------------------------------------------------------------------
ALTER TABLE "agent_approval_requests"
  ADD COLUMN IF NOT EXISTS "actionType"             varchar(80) NOT NULL DEFAULT '';
ALTER TABLE "agent_approval_requests"
  ADD COLUMN IF NOT EXISTS "reason"                 text        NOT NULL DEFAULT '';
ALTER TABLE "agent_approval_requests"
  ADD COLUMN IF NOT EXISTS "createdBy"              varchar(32) NOT NULL DEFAULT 'agent';
ALTER TABLE "agent_approval_requests"
  ADD COLUMN IF NOT EXISTS "relatedSocialRequestId" integer     NULL;
ALTER TABLE "agent_approval_requests"
  ADD COLUMN IF NOT EXISTS "relatedCandidateId"     integer     NULL;

COMMIT;

-- =============================================================================
-- Verification queries (run manually after COMMIT; expect non-zero rows):
--
--   SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
--    WHERE t.typname = 'agent_settings_mode_enum'
--    ORDER BY enumlabel;
--   -- expect 'assisted' and 'normal' present
--
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'public_social_intents'
--      AND column_name IN ('userId','linkedSocialRequestId','source',
--                          'interestTags','locationPreference','socialGoal');
--   -- expect 6 rows
--
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'agent_approval_requests'
--      AND column_name IN ('actionType','reason','createdBy',
--                          'relatedSocialRequestId','relatedCandidateId');
--   -- expect 5 rows
-- =============================================================================
