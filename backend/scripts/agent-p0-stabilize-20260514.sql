-- ============================================================================
-- FitMeet Agent P0 stabilization patch (idempotent)
-- ----------------------------------------------------------------------------
-- Fixes production schema drift for Agent Token, Agent inbox, A2A and Autopilot.
--
-- IMPORTANT: the current TypeORM entities use camelCase column names such as
-- "ownerUserId" and "agentConnectionId". Older patches used snake_case names;
-- those columns do not satisfy TypeORM queries and can leave production with
-- migrations "applied" but APIs still returning 500.
--
-- Safe to re-run: uses IF NOT EXISTS and no table/data DROP, DELETE or TRUNCATE.
-- ============================================================================

BEGIN;

-- Agent connections: token issuance and Agent Token guard depend on these.
ALTER TABLE IF EXISTS agent_connections
  ADD COLUMN IF NOT EXISTS "userId" int,
  ADD COLUMN IF NOT EXISTS "agentName" varchar NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS "agentDisplayName" varchar NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "agentWebhookUrl" varchar NULL,
  ADD COLUMN IF NOT EXISTS "agentTokenHash" varchar,
  ADD COLUMN IF NOT EXISTS "tokenPrefix" varchar(12),
  ADD COLUMN IF NOT EXISTS "permissionLevel" varchar NOT NULL DEFAULT 'read_only',
  ADD COLUMN IF NOT EXISTS status varchar NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "dailyActionLimit" int NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS "dailyActionsUsed" int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "dailyResetAt" timestamptz NULL,
  ADD COLUMN IF NOT EXISTS "lastActiveAt" timestamptz NULL,
  ADD COLUMN IF NOT EXISTS "expiresAt" timestamptz NULL,
  ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();

-- Agent profiles: discovery, owner inbox and platform_agent inbox depend on
-- nullable ownerUserId plus jsonb defaults.
ALTER TABLE IF EXISTS agent_profiles
  ADD COLUMN IF NOT EXISTS "ownerUserId" int NULL,
  ADD COLUMN IF NOT EXISTS "agentConnectionId" int NULL,
  ADD COLUMN IF NOT EXISTS "agentName" varchar(80) NOT NULL DEFAULT 'Agent',
  ADD COLUMN IF NOT EXISTS "agentType" varchar NOT NULL DEFAULT 'user_agent',
  ADD COLUMN IF NOT EXISTS provider varchar NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS avatar varchar NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bio text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS personality text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS goals jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS interests jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "preferredTargets" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS boundaries jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "autonomyLevel" varchar NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS status varchar NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "lastActiveAt" timestamptz NULL,
  ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();

ALTER TABLE IF EXISTS agent_profiles
  ALTER COLUMN "ownerUserId" DROP NOT NULL,
  ALTER COLUMN "agentConnectionId" DROP NOT NULL;

-- If an old snake_case patch already ran, copy its data into the columns that
-- the current TypeORM entities actually read.
DO $$
BEGIN
  IF to_regclass('public.agent_profiles') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'agent_profiles' AND column_name = 'owner_user_id'
    ) THEN
      UPDATE agent_profiles
      SET "ownerUserId" = COALESCE("ownerUserId", owner_user_id);
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'agent_profiles' AND column_name = 'agent_connection_id'
    ) THEN
      UPDATE agent_profiles
      SET "agentConnectionId" = COALESCE("agentConnectionId", agent_connection_id);
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'agent_profiles' AND column_name = 'agent_name'
    ) THEN
      UPDATE agent_profiles
      SET "agentName" = COALESCE(NULLIF("agentName", ''), agent_name);
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'agent_profiles' AND column_name = 'agent_type'
    ) THEN
      UPDATE agent_profiles
      SET "agentType" = COALESCE(NULLIF("agentType", ''), agent_type);
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'agent_profiles' AND column_name = 'preferred_targets'
    ) THEN
      UPDATE agent_profiles
      SET "preferredTargets" = CASE
        WHEN "preferredTargets" IS NULL OR "preferredTargets" = '[]'::jsonb
        THEN preferred_targets
        ELSE "preferredTargets"
      END
      WHERE preferred_targets IS NOT NULL;
    END IF;
  END IF;

  IF to_regclass('public.agent_connections') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'agent_connections' AND column_name = 'user_id'
    ) THEN
      UPDATE agent_connections SET "userId" = COALESCE("userId", user_id);
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'agent_connections' AND column_name = 'agent_name'
    ) THEN
      UPDATE agent_connections
      SET "agentName" = COALESCE(NULLIF("agentName", ''), agent_name);
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'agent_connections' AND column_name = 'daily_action_limit'
    ) THEN
      UPDATE agent_connections
      SET "dailyActionLimit" = COALESCE("dailyActionLimit", daily_action_limit);
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'agent_connections' AND column_name = 'daily_actions_used'
    ) THEN
      UPDATE agent_connections
      SET "dailyActionsUsed" = COALESCE("dailyActionsUsed", daily_actions_used);
    END IF;
  END IF;
END $$;

UPDATE agent_profiles SET goals = '[]'::jsonb WHERE goals IS NULL;
UPDATE agent_profiles SET interests = '[]'::jsonb WHERE interests IS NULL;
UPDATE agent_profiles SET "preferredTargets" = '[]'::jsonb WHERE "preferredTargets" IS NULL;
UPDATE agent_profiles SET boundaries = '[]'::jsonb WHERE boundaries IS NULL;
UPDATE agent_profiles SET avatar = '' WHERE avatar IS NULL;
UPDATE agent_profiles SET bio = '' WHERE bio IS NULL;
UPDATE agent_profiles SET personality = '' WHERE personality IS NULL;

-- Permissions and logs: register/personal-token/autopilot write these tables.
ALTER TABLE IF EXISTS agent_permissions
  ADD COLUMN IF NOT EXISTS "agentConnectionId" int,
  ADD COLUMN IF NOT EXISTS action varchar NOT NULL DEFAULT 'search_profiles',
  ADD COLUMN IF NOT EXISTS granted boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS constraints jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "grantedAt" timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF to_regclass('public.agent_permissions') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'agent_permissions' AND column_name = 'agent_connection_id'
     ) THEN
    UPDATE agent_permissions
    SET "agentConnectionId" = COALESCE("agentConnectionId", agent_connection_id);
  END IF;
END $$;

ALTER TABLE IF EXISTS agent_action_logs
  ADD COLUMN IF NOT EXISTS "agentId" int NULL,
  ADD COLUMN IF NOT EXISTS "ownerUserId" int,
  ADD COLUMN IF NOT EXISTS "actionType" varchar NOT NULL DEFAULT 'send_message',
  ADD COLUMN IF NOT EXISTS "actionStatus" varchar NOT NULL DEFAULT 'planned',
  ADD COLUMN IF NOT EXISTS "riskLevel" varchar NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS "targetUserId" int NULL,
  ADD COLUMN IF NOT EXISTS "targetAgentId" int NULL,
  ADD COLUMN IF NOT EXISTS "relatedSocialRequestId" int NULL,
  ADD COLUMN IF NOT EXISTS "relatedCandidateId" int NULL,
  ADD COLUMN IF NOT EXISTS "relatedActivityId" int NULL,
  ADD COLUMN IF NOT EXISTS "inputSummary" varchar(500) NULL,
  ADD COLUMN IF NOT EXISTS "outputSummary" varchar(500) NULL,
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reason text NULL,
  ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now();

-- User social requests and candidates: Autopilot scans these.
ALTER TABLE IF EXISTS user_social_requests
  ADD COLUMN IF NOT EXISTS "userId" int,
  ADD COLUMN IF NOT EXISTS "agentId" int NULL,
  ADD COLUMN IF NOT EXISTS source varchar NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS type varchar NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS title varchar(200) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "rawText" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS city varchar(100) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS lat double precision NULL,
  ADD COLUMN IF NOT EXISTS lng double precision NULL,
  ADD COLUMN IF NOT EXISTS "radiusKm" int NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "timeStart" timestamptz NULL,
  ADD COLUMN IF NOT EXISTS "timeEnd" timestamptz NULL,
  ADD COLUMN IF NOT EXISTS "genderPreference" varchar NOT NULL DEFAULT 'any',
  ADD COLUMN IF NOT EXISTS "ageMin" int NULL,
  ADD COLUMN IF NOT EXISTS "ageMax" int NULL,
  ADD COLUMN IF NOT EXISTS "interestTags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "activityType" varchar(100) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "safetyRequirement" varchar NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "agentAllowed" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "requireUserConfirmation" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS status varchar NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS visibility varchar NOT NULL DEFAULT 'matched_only',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "expiresAt" timestamptz NULL,
  ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();

ALTER TABLE IF EXISTS social_request_candidates
  ADD COLUMN IF NOT EXISTS "socialRequestId" int,
  ADD COLUMN IF NOT EXISTS "candidateUserId" int,
  ADD COLUMN IF NOT EXISTS score int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS level varchar NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS "scoreBreakdown" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "commonTags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "distanceKm" double precision NULL,
  ADD COLUMN IF NOT EXISTS "riskLevel" varchar NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS "riskWarnings" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "suggestedMessage" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status varchar NOT NULL DEFAULT 'suggested',
  ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();

-- Helpful indexes for token/status, discovery, inbox and autopilot queries.
CREATE INDEX IF NOT EXISTS idx_agent_connections_user_status_camel
  ON agent_connections ("userId", status);
CREATE INDEX IF NOT EXISTS idx_agent_connections_token_prefix_camel
  ON agent_connections ("tokenPrefix");
CREATE INDEX IF NOT EXISTS idx_agent_profiles_owner_camel
  ON agent_profiles ("ownerUserId");
CREATE INDEX IF NOT EXISTS idx_agent_profiles_connection_camel
  ON agent_profiles ("agentConnectionId");
CREATE INDEX IF NOT EXISTS idx_agent_profiles_type_status_camel
  ON agent_profiles ("agentType", status);
CREATE INDEX IF NOT EXISTS idx_agent_profiles_provider_camel
  ON agent_profiles (provider);
CREATE INDEX IF NOT EXISTS idx_agent_permissions_connection_action_camel
  ON agent_permissions ("agentConnectionId", action);
CREATE INDEX IF NOT EXISTS idx_agent_action_logs_owner_action_camel
  ON agent_action_logs ("ownerUserId", "actionType", "actionStatus");
CREATE INDEX IF NOT EXISTS idx_user_social_requests_user_status_camel
  ON user_social_requests ("userId", status);
CREATE INDEX IF NOT EXISTS idx_social_request_candidates_request_status_camel
  ON social_request_candidates ("socialRequestId", status);
CREATE INDEX IF NOT EXISTS idx_social_request_candidates_request_score_camel
  ON social_request_candidates ("socialRequestId", score);

COMMIT;

-- Verification queries (run manually):
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'agent_profiles'
--     AND column_name IN ('ownerUserId', 'agentConnectionId', 'preferredTargets')
--   ORDER BY column_name;
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'agent_connections'
--     AND column_name IN ('userId', 'agentName', 'dailyActionLimit')
--   ORDER BY column_name;
