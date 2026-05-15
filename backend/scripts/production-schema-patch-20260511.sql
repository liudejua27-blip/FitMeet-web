-- ============================================================================
--  FitMeet production schema patch — 2026-05-11
--  Goal: align an *older* production Postgres DB with the current TypeORM
--        entities, WITHOUT destroying any existing data.
--
--  Safety rules enforced in this script:
--    * CREATE TABLE IF NOT EXISTS only
--    * ALTER TABLE ... ADD COLUMN IF NOT EXISTS only
--    * CREATE INDEX IF NOT EXISTS only
--    * Enum types are created with a DO $$ ... $$ guard (CREATE TYPE has no
--      IF NOT EXISTS in Postgres).
--    * NO DROP TABLE, NO DROP COLUMN, NO TRUNCATE, NO DELETE.
--    * Every new column is either NULLable or has a DEFAULT, so existing
--      rows are never invalidated.
--
--  Column names match exactly the camelCase identifiers TypeORM produces
--  from the entity classes (e.g. "activityId", "locationUpdatedAt",
--  "acceptNearbyMatch"). They are quoted to preserve case.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Enum types (guarded — CREATE TYPE has no IF NOT EXISTS in Postgres)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- social_activities.status
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'social_activities_status_enum') THEN
    CREATE TYPE social_activities_status_enum AS ENUM
      ('draft','pending_confirm','confirmed','in_progress','completed','cancelled');
  END IF;
  -- ActivityType
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_templates_type_enum') THEN
    CREATE TYPE activity_templates_type_enum AS ENUM
      ('running','fitness','dog_walking','coffee_chat','city_walk','custom');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'social_activities_type_enum') THEN
    CREATE TYPE social_activities_type_enum AS ENUM
      ('running','fitness','dog_walking','coffee_chat','city_walk','custom');
  END IF;
  -- ActivitySafetyLevel
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_templates_safetylevel_enum') THEN
    CREATE TYPE activity_templates_safetylevel_enum AS ENUM ('low','medium','high');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'social_activities_safetylevel_enum') THEN
    CREATE TYPE social_activities_safetylevel_enum AS ENUM ('low','medium','high');
  END IF;
  -- ActivityProofPolicy
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_templates_defaultproofpolicy_enum') THEN
    CREATE TYPE activity_templates_defaultproofpolicy_enum AS ENUM
      ('mutual_confirm','mutual_or_proof','mutual_and_proof');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'social_activities_proofpolicy_enum') THEN
    CREATE TYPE social_activities_proofpolicy_enum AS ENUM
      ('mutual_confirm','mutual_or_proof','mutual_and_proof');
  END IF;
  -- ActivityProof
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_proofs_prooftype_enum') THEN
    CREATE TYPE activity_proofs_prooftype_enum AS ENUM
      ('checkin','mutual_confirm','scene_photo','selfie_optional','qr_code','merchant_confirm');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_proofs_status_enum') THEN
    CREATE TYPE activity_proofs_status_enum AS ENUM ('pending','accepted','rejected');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_proofs_privacymode_enum') THEN
    CREATE TYPE activity_proofs_privacymode_enum AS ENUM ('hidden_face','scene_only','private');
  END IF;
  -- UserSocialRequest
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_social_requests_source_enum') THEN
    CREATE TYPE user_social_requests_source_enum AS ENUM
      ('manual','openclaw','codex','claude','custom_agent','public');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_social_requests_type_enum') THEN
    CREATE TYPE user_social_requests_type_enum AS ENUM
      ('running_partner','fitness_partner','dog_walking','coffee_chat','city_walk','study_partner','custom');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_social_requests_genderpreference_enum') THEN
    CREATE TYPE user_social_requests_genderpreference_enum AS ENUM
      ('any','male','female','non_specified');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_social_requests_safetyrequirement_enum') THEN
    CREATE TYPE user_social_requests_safetyrequirement_enum AS ENUM
      ('none','verified_only','low_risk_only');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_social_requests_status_enum') THEN
    CREATE TYPE user_social_requests_status_enum AS ENUM
      ('draft','matching','matched','invitation_pending','chatting','activity_created','completed','cancelled','expired');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_social_requests_visibility_enum') THEN
    CREATE TYPE user_social_requests_visibility_enum AS ENUM
      ('private','matched_only','public');
  END IF;
  -- SocialRequestCandidate
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'social_request_candidates_status_enum') THEN
    CREATE TYPE social_request_candidates_status_enum AS ENUM
      ('suggested','approved','messaged','rejected','expired');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'social_request_candidates_level_enum') THEN
    CREATE TYPE social_request_candidates_level_enum AS ENUM ('high','medium','low');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'social_request_candidates_risklevel_enum') THEN
    CREATE TYPE social_request_candidates_risklevel_enum AS ENUM ('low','medium','high');
  END IF;
  -- AgentConnection
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_connections_permissionlevel_enum') THEN
    CREATE TYPE agent_connections_permissionlevel_enum AS ENUM
      ('read_only','draft_mode','basic','standard','open','sandbox_internal');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_connections_status_enum') THEN
    CREATE TYPE agent_connections_status_enum AS ENUM ('active','suspended','revoked');
  END IF;
  -- AgentSettings.mode
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_settings_mode_enum') THEN
    CREATE TYPE agent_settings_mode_enum AS ENUM ('basic','standard','open','sandbox_internal');
  END IF;
  -- AgentPermission.action
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_permissions_action_enum') THEN
    CREATE TYPE agent_permissions_action_enum AS ENUM
      ('create_social_request','search_profiles','generate_post','generate_message',
       'send_message','contact_request','lab_chat','create_activity','join_activity',
       'report_risk','submit_completion_proof');
  END IF;
  -- AgentApprovalRequest
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_approval_requests_type_enum') THEN
    CREATE TYPE agent_approval_requests_type_enum AS ENUM
      ('send_message','first_message','post_publish','contact_request','contact_exchange',
       'create_activity','join_activity','offline_meeting','share_location','photo_upload',
       'submit_completion_proof','night_activity','alcohol_activity','payment','unknown_risk','custom');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_approval_requests_risklevel_enum') THEN
    CREATE TYPE agent_approval_requests_risklevel_enum AS ENUM ('low','medium','high');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_approval_requests_status_enum') THEN
    CREATE TYPE agent_approval_requests_status_enum AS ENUM
      ('pending','approved','rejected','expired');
  END IF;
  -- AgentActionLog (append-only agent audit log)
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_action_logs_actiontype_enum') THEN
    CREATE TYPE agent_action_logs_actiontype_enum AS ENUM
      ('read_profile','generate_profile_question','update_profile',
       'create_social_request','sync_to_hall','run_match','generate_invite',
       'send_message','add_friend','create_activity','invite_activity',
       'approve_action','reject_action');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_action_logs_actionstatus_enum') THEN
    CREATE TYPE agent_action_logs_actionstatus_enum AS ENUM
      ('planned','executed','pending_approval','rejected','failed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_action_logs_risklevel_enum') THEN
    CREATE TYPE agent_action_logs_risklevel_enum AS ENUM ('low','medium','high');
  END IF;
  -- AgentActivityLog
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_activity_logs_action_enum') THEN
    CREATE TYPE agent_activity_logs_action_enum AS ENUM
      ('create_social_request','confirm_social_request_candidate','search','draft_post',
       'draft_message','send_message','contact_request','lab_chat','intercepted',
       'match_partner','create_activity','join_activity','report_risk','submit_completion_proof');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_activity_logs_result_enum') THEN
    CREATE TYPE agent_activity_logs_result_enum AS ENUM
      ('success','blocked','pending_approval','error');
  END IF;
  -- ContactRequest
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_requests_status_enum') THEN
    CREATE TYPE contact_requests_status_enum AS ENUM ('pending','accepted','declined','expired');
  END IF;
  -- MatchCandidate
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'match_candidates_status_enum') THEN
    CREATE TYPE match_candidates_status_enum AS ENUM
      ('pending_review','approved','rejected','contacted');
  END IF;
  -- SafetyEvent
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'safety_events_eventtype_enum') THEN
    CREATE TYPE safety_events_eventtype_enum AS ENUM
      ('rate_limit_exceeded','harassment_detected','spam_detected','impersonation_attempt',
       'contact_bypass','unauthorized_action','suspicious_pattern');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'safety_events_severity_enum') THEN
    CREATE TYPE safety_events_severity_enum AS ENUM ('low','medium','high','critical');
  END IF;
  -- UserPreference
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_preferences_relationshipgoal_enum') THEN
    CREATE TYPE user_preferences_relationshipgoal_enum AS ENUM
      ('fitness_buddy','casual','dating','serious');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_preferences_chatstyle_enum') THEN
    CREATE TYPE user_preferences_chatstyle_enum AS ENUM
      ('playful','direct','intellectual','warm');
  END IF;
  -- Legacy social_requests
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'social_requests_risklevel_enum') THEN
    CREATE TYPE social_requests_risklevel_enum AS ENUM ('low','medium','high');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'social_requests_status_enum') THEN
    CREATE TYPE social_requests_status_enum AS ENUM ('searching','matched','closed','cancelled');
  END IF;
  -- Public social intents reuse the legacy risk/status enums above
END$$;

-- ---------------------------------------------------------------------------
-- 1. users — add new columns the current entity expects
-- ---------------------------------------------------------------------------
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone"               varchar          NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "wechatOpenId"        varchar          NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar"              varchar          NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "color"               varchar          NOT NULL DEFAULT '#C8FF00';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "gender"              varchar          NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "age"                 integer          NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "city"                varchar          NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lat"                 double precision NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lng"                 double precision NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "locationUpdatedAt"   timestamptz      NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "acceptNearbyMatch"   boolean          NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "gym"                 varchar          NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bio"                 text             NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "coverUrl"            varchar          NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "singleCert"          boolean          NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "verified"            boolean          NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "interestTags"        text             NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trainingDays"        integer          NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trainingCount"       integer          NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "caloriesBurned"      integer          NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bestRecords"         jsonb            NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isCoach"             boolean          NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trustScore"          integer          NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "socialTrustCount"    integer          NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "idx_users_city"               ON "users" ("city");
CREATE INDEX IF NOT EXISTS "idx_users_acceptNearbyMatch"  ON "users" ("acceptNearbyMatch");

-- ---------------------------------------------------------------------------
-- 2. meets — add new columns the current entity expects
-- ---------------------------------------------------------------------------
ALTER TABLE "meets" ADD COLUMN IF NOT EXISTS "address"        varchar          NOT NULL DEFAULT '';
ALTER TABLE "meets" ADD COLUMN IF NOT EXISTS "poiId"          varchar          NULL;
ALTER TABLE "meets" ADD COLUMN IF NOT EXISTS "lat"            double precision NULL;
ALTER TABLE "meets" ADD COLUMN IF NOT EXISTS "lng"            double precision NULL;
ALTER TABLE "meets" ADD COLUMN IF NOT EXISTS "feeType"        varchar          NULL;
ALTER TABLE "meets" ADD COLUMN IF NOT EXISTS "groupType"      varchar          NULL;
ALTER TABLE "meets" ADD COLUMN IF NOT EXISTS "creatorType"    varchar          NULL;
ALTER TABLE "meets" ADD COLUMN IF NOT EXISTS "status"         varchar          NOT NULL DEFAULT 'pending';
ALTER TABLE "meets" ADD COLUMN IF NOT EXISTS "tripShareToken" varchar          NULL;
ALTER TABLE "meets" ADD COLUMN IF NOT EXISTS "activityId"     integer          NULL;
ALTER TABLE "meets" ADD COLUMN IF NOT EXISTS "clubId"         integer          NULL;
ALTER TABLE "meets" ADD COLUMN IF NOT EXISTS "city"           varchar          NOT NULL DEFAULT '';
ALTER TABLE "meets" ADD COLUMN IF NOT EXISTS "startAt"        timestamp        NULL;
ALTER TABLE "meets" ADD COLUMN IF NOT EXISTS "autoCancelAt"   timestamp        NULL;
ALTER TABLE "meets" ADD COLUMN IF NOT EXISTS "cancelReason"   varchar          NULL;
ALTER TABLE "meets" ADD COLUMN IF NOT EXISTS "rating"         numeric(3,1)     NOT NULL DEFAULT 0;
ALTER TABLE "meets" ADD COLUMN IF NOT EXISTS "meetCount"      integer          NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "idx_meets_status"     ON "meets" ("status");
CREATE INDEX IF NOT EXISTS "idx_meets_activityId" ON "meets" ("activityId");
CREATE INDEX IF NOT EXISTS "idx_meets_clubId"     ON "meets" ("clubId");
CREATE INDEX IF NOT EXISTS "idx_meets_city"       ON "meets" ("city");

-- ---------------------------------------------------------------------------
-- 3. meet_participants — new columns
-- ---------------------------------------------------------------------------
ALTER TABLE "meet_participants" ADD COLUMN IF NOT EXISTS "status"         varchar NOT NULL DEFAULT 'pending';
ALTER TABLE "meet_participants" ADD COLUMN IF NOT EXISTS "tripShareToken" varchar NULL;

-- ---------------------------------------------------------------------------
-- 4. posts — location/POI columns (PostLocation migration)
-- ---------------------------------------------------------------------------
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "city"    varchar          NOT NULL DEFAULT '';
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "loc"     varchar          NOT NULL DEFAULT '';
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "address" varchar          NOT NULL DEFAULT '';
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "poiId"   varchar          NULL;
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "lat"     double precision NULL;
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "lng"     double precision NULL;

-- ---------------------------------------------------------------------------
-- 5. activity_templates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "activity_templates" (
  "id"                      SERIAL PRIMARY KEY,
  "type"                    activity_templates_type_enum NOT NULL UNIQUE,
  "title"                   varchar(200) NOT NULL,
  "description"             text NOT NULL DEFAULT '',
  "defaultDurationMinutes"  integer NOT NULL DEFAULT 30,
  "defaultIcebreakers"      jsonb NOT NULL DEFAULT '[]'::jsonb,
  "proofOptions"            jsonb NOT NULL DEFAULT '[]'::jsonb,
  "safetyTips"              jsonb NOT NULL DEFAULT '[]'::jsonb,
  "safetyLevel"             activity_templates_safetylevel_enum NOT NULL DEFAULT 'low',
  "defaultProofPolicy"      activity_templates_defaultproofpolicy_enum NOT NULL DEFAULT 'mutual_or_proof',
  "createdAt"               timestamp NOT NULL DEFAULT now(),
  "updatedAt"               timestamp NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 6. social_activities (entity = SocialActivity)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "social_activities" (
  "id"                  SERIAL PRIMARY KEY,
  "creatorId"           integer NOT NULL,
  "participantIds"      jsonb NOT NULL DEFAULT '[]'::jsonb,
  "socialRequestId"     integer NULL,
  "meetId"              integer NULL,
  "matchedCandidateId"  integer NULL,
  "type"                social_activities_type_enum NOT NULL DEFAULT 'custom',
  "title"               varchar(200) NOT NULL DEFAULT '',
  "description"         text NOT NULL DEFAULT '',
  "locationName"        varchar(200) NOT NULL DEFAULT '',
  "city"                varchar(100) NOT NULL DEFAULT '',
  "lat"                 double precision NULL,
  "lng"                 double precision NULL,
  "startTime"           timestamp NULL,
  "endTime"             timestamp NULL,
  "status"              social_activities_status_enum NOT NULL DEFAULT 'draft',
  "icebreakerTasks"     jsonb NOT NULL DEFAULT '[]'::jsonb,
  "safetyTips"          jsonb NOT NULL DEFAULT '[]'::jsonb,
  "proofRequired"       boolean NOT NULL DEFAULT true,
  "proofPolicy"         social_activities_proofpolicy_enum NOT NULL DEFAULT 'mutual_or_proof',
  "safetyLevel"         social_activities_safetylevel_enum NOT NULL DEFAULT 'low',
  "checkinByUserId"     jsonb NOT NULL DEFAULT '{}'::jsonb,
  "confirmByUserId"     jsonb NOT NULL DEFAULT '{}'::jsonb,
  "reviewByUserId"      jsonb NOT NULL DEFAULT '{}'::jsonb,
  "recap"               text NULL,
  "createdAt"           timestamp NOT NULL DEFAULT now(),
  "updatedAt"           timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_social_activities_city_status"
  ON "social_activities" ("city","status");
CREATE INDEX IF NOT EXISTS "idx_social_activities_creator_status"
  ON "social_activities" ("creatorId","status");

-- ---------------------------------------------------------------------------
-- 7. activity_proofs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "activity_proofs" (
  "id"             SERIAL PRIMARY KEY,
  "activityId"     integer NOT NULL,
  "userId"         integer NOT NULL,
  "proofType"      activity_proofs_prooftype_enum NOT NULL,
  "photoUrl"       varchar(500) NULL,
  "note"           varchar(500) NOT NULL DEFAULT '',
  "locationApprox" varchar(200) NOT NULL DEFAULT '',
  "status"         activity_proofs_status_enum NOT NULL DEFAULT 'pending',
  "privacyMode"    activity_proofs_privacymode_enum NOT NULL DEFAULT 'scene_only',
  "reviewedById"   integer NULL,
  "reviewedAt"     timestamptz NULL,
  "reviewReason"   varchar(500) NOT NULL DEFAULT '',
  "createdAt"      timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_activity_proofs_activity_user"
  ON "activity_proofs" ("activityId","userId");

-- ---------------------------------------------------------------------------
-- 8. user_social_requests (user-facing social intent card)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "user_social_requests" (
  "id"                       SERIAL PRIMARY KEY,
  "userId"                   integer NOT NULL,
  "agentId"                  integer NULL,
  "source"                   user_social_requests_source_enum NOT NULL DEFAULT 'manual',
  "type"                     user_social_requests_type_enum NOT NULL DEFAULT 'custom',
  "title"                    varchar(200) NOT NULL DEFAULT '',
  "description"              text NOT NULL DEFAULT '',
  "rawText"                  text NOT NULL DEFAULT '',
  "city"                     varchar(100) NOT NULL DEFAULT '',
  "lat"                      double precision NULL,
  "lng"                      double precision NULL,
  "radiusKm"                 integer NOT NULL DEFAULT 5,
  "timeStart"                timestamptz NULL,
  "timeEnd"                  timestamptz NULL,
  "genderPreference"         user_social_requests_genderpreference_enum NOT NULL DEFAULT 'any',
  "ageMin"                   integer NULL,
  "ageMax"                   integer NULL,
  "interestTags"             jsonb NOT NULL DEFAULT '[]'::jsonb,
  "activityType"             varchar(100) NOT NULL DEFAULT '',
  "safetyRequirement"        user_social_requests_safetyrequirement_enum NOT NULL DEFAULT 'none',
  "agentAllowed"             boolean NOT NULL DEFAULT true,
  "requireUserConfirmation"  boolean NOT NULL DEFAULT true,
  "status"                   user_social_requests_status_enum NOT NULL DEFAULT 'draft',
  "visibility"               user_social_requests_visibility_enum NOT NULL DEFAULT 'matched_only',
  "metadata"                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  "expiresAt"                timestamptz NULL,
  "createdAt"                timestamp NOT NULL DEFAULT now(),
  "updatedAt"                timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_user_social_requests_user_status"
  ON "user_social_requests" ("userId","status");
CREATE INDEX IF NOT EXISTS "idx_user_social_requests_city_status"
  ON "user_social_requests" ("city","status");

-- ---------------------------------------------------------------------------
-- 9. social_request_candidates (matching review surface)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "social_request_candidates" (
  "id"                SERIAL PRIMARY KEY,
  "socialRequestId"   integer NOT NULL,
  "candidateUserId"   integer NOT NULL,
  "score"             integer NOT NULL,
  "level"             social_request_candidates_level_enum NOT NULL DEFAULT 'medium',
  "scoreBreakdown"    jsonb NOT NULL DEFAULT '{}'::jsonb,
  "reasons"           jsonb NOT NULL DEFAULT '[]'::jsonb,
  "commonTags"        jsonb NOT NULL DEFAULT '[]'::jsonb,
  "distanceKm"        double precision NULL,
  "riskLevel"         social_request_candidates_risklevel_enum NOT NULL DEFAULT 'low',
  "riskWarnings"      jsonb NOT NULL DEFAULT '[]'::jsonb,
  "suggestedMessage"  text NOT NULL DEFAULT '',
  "status"            social_request_candidates_status_enum NOT NULL DEFAULT 'suggested',
  "createdAt"         timestamp NOT NULL DEFAULT now(),
  "updatedAt"         timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_social_request_candidates_req_status"
  ON "social_request_candidates" ("socialRequestId","status");
CREATE INDEX IF NOT EXISTS "idx_social_request_candidates_req_score"
  ON "social_request_candidates" ("socialRequestId","score");

-- ---------------------------------------------------------------------------
-- 10. user_social_profiles (AI social assistant profile)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "user_social_profiles" (
  "userId"           integer PRIMARY KEY,
  "gender"           varchar NOT NULL DEFAULT '',
  "ageRange"         varchar NOT NULL DEFAULT '',
  "city"             varchar NOT NULL DEFAULT '',
  "nearbyArea"       varchar NOT NULL DEFAULT '',
  "fitnessGoals"     text NOT NULL DEFAULT '',
  "interestTags"     text NOT NULL DEFAULT '',
  "availableTimes"   text NOT NULL DEFAULT '',
  "socialPreference" varchar NOT NULL DEFAULT '',
  "rejectRules"      varchar NOT NULL DEFAULT '',
  "privacyBoundary"  varchar NOT NULL DEFAULT '',
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  "updatedAt"        timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 11. agent_connections
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "agent_connections" (
  "id"                  SERIAL PRIMARY KEY,
  "userId"              integer NOT NULL,
  "agentName"           varchar NOT NULL DEFAULT 'custom',
  "agentDisplayName"    varchar NOT NULL DEFAULT '',
  "agentWebhookUrl"     varchar NULL,
  "agentTokenHash"      varchar NOT NULL,
  "tokenPrefix"         varchar(12) NOT NULL,
  "permissionLevel"     agent_connections_permissionlevel_enum NOT NULL DEFAULT 'read_only',
  "status"              agent_connections_status_enum NOT NULL DEFAULT 'active',
  "dailyActionLimit"    integer NOT NULL DEFAULT 50,
  "dailyActionsUsed"    integer NOT NULL DEFAULT 0,
  "dailyResetAt"        timestamptz NULL,
  "lastActiveAt"        timestamptz NULL,
  "expiresAt"           timestamptz NULL,
  "createdAt"           timestamp NOT NULL DEFAULT now(),
  "updatedAt"           timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_agent_connections_user" ON "agent_connections" ("userId");
CREATE INDEX IF NOT EXISTS "idx_agent_connections_tokenPrefix" ON "agent_connections" ("tokenPrefix");

-- ---------------------------------------------------------------------------
-- 12. agent_permissions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "agent_permissions" (
  "id"                  SERIAL PRIMARY KEY,
  "agentConnectionId"   integer NOT NULL,
  "action"              agent_permissions_action_enum NOT NULL,
  "granted"             boolean NOT NULL DEFAULT true,
  "constraints"         jsonb NOT NULL DEFAULT '{}'::jsonb,
  "grantedAt"           timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_agent_permissions_conn" ON "agent_permissions" ("agentConnectionId");

-- ---------------------------------------------------------------------------
-- 13. agent_settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "agent_settings" (
  "id"                                  SERIAL PRIMARY KEY,
  "userId"                              integer NOT NULL,
  "agentConnectionId"                   integer NULL,
  "mode"                                agent_settings_mode_enum NOT NULL DEFAULT 'basic',
  "allowSearch"                         boolean NOT NULL DEFAULT true,
  "allowDraftMessage"                   boolean NOT NULL DEFAULT true,
  "allowSendMessage"                    boolean NOT NULL DEFAULT false,
  "allowAutoReply"                      boolean NOT NULL DEFAULT false,
  "allowCreateActivity"                 boolean NOT NULL DEFAULT false,
  "allowJoinActivity"                   boolean NOT NULL DEFAULT false,
  "allowShareLocation"                  boolean NOT NULL DEFAULT false,
  "allowUploadProof"                    boolean NOT NULL DEFAULT false,
  "allowContactExchange"                boolean NOT NULL DEFAULT false,
  "maxDailyMessages"                    integer NOT NULL DEFAULT 20,
  "requireApprovalForFirstMessage"      boolean NOT NULL DEFAULT true,
  "requireApprovalForOfflineMeeting"    boolean NOT NULL DEFAULT true,
  "requireApprovalForPhotoUpload"       boolean NOT NULL DEFAULT true,
  "requireApprovalForAll"               boolean NOT NULL DEFAULT false,
  "createdAt"                           timestamp NOT NULL DEFAULT now(),
  "updatedAt"                           timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_agent_settings_user_conn"
  ON "agent_settings" ("userId","agentConnectionId");

-- ---------------------------------------------------------------------------
-- 14. agent_approval_requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "agent_approval_requests" (
  "id"                     SERIAL PRIMARY KEY,
  "agentConnectionId"      integer NULL,
  "userId"                 integer NOT NULL,
  "type"                   agent_approval_requests_type_enum NOT NULL,
  "actionType"             varchar(80) NOT NULL DEFAULT '',
  "skillName"              varchar(64) NOT NULL DEFAULT '',
  "payload"                jsonb NOT NULL DEFAULT '{}'::jsonb,
  "summary"                varchar(500) NOT NULL DEFAULT '',
  "reason"                 text NOT NULL DEFAULT '',
  "createdBy"              varchar(32) NOT NULL DEFAULT 'agent',
  "relatedSocialRequestId" integer NULL,
  "relatedCandidateId"     integer NULL,
  "relatedActivityId"      integer NULL,
  "riskLevel"              agent_approval_requests_risklevel_enum NOT NULL DEFAULT 'medium',
  "status"                 agent_approval_requests_status_enum NOT NULL DEFAULT 'pending',
  "agentRationale"         text NOT NULL DEFAULT '',
  "expiresAt"              timestamptz NOT NULL DEFAULT now(),
  "respondedAt"            timestamptz NULL,
  "createdAt"              timestamp NOT NULL DEFAULT now(),
  "updatedAt"              timestamp NOT NULL DEFAULT now()
);
-- Older DBs may have an earlier CREATE TABLE without these columns; backfill.
ALTER TABLE "agent_approval_requests"
  ADD COLUMN IF NOT EXISTS "actionType"             varchar(80) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "reason"                 text        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "createdBy"              varchar(32) NOT NULL DEFAULT 'agent',
  ADD COLUMN IF NOT EXISTS "relatedSocialRequestId" integer     NULL,
  ADD COLUMN IF NOT EXISTS "relatedCandidateId"     integer     NULL,
  ADD COLUMN IF NOT EXISTS "relatedActivityId"      integer     NULL;
CREATE INDEX IF NOT EXISTS "idx_agent_approvals_user_status"
  ON "agent_approval_requests" ("userId","status");

-- ---------------------------------------------------------------------------
-- 14a. agent_action_logs (append-only agent audit log — AgentActionLog entity)
-- ---------------------------------------------------------------------------
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
CREATE INDEX IF NOT EXISTS "idx_agent_action_logs_owner_created"
  ON "agent_action_logs" ("ownerUserId","createdAt");
CREATE INDEX IF NOT EXISTS "idx_agent_action_logs_agent_created"
  ON "agent_action_logs" ("agentId","createdAt");

-- ---------------------------------------------------------------------------
-- 15. agent_activity_logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "agent_activity_logs" (
  "id"                  SERIAL PRIMARY KEY,
  "agentConnectionId"   integer NULL,
  "userId"              integer NOT NULL,
  "action"              agent_activity_logs_action_enum NOT NULL,
  "payload"             jsonb NOT NULL DEFAULT '{}'::jsonb,
  "result"              agent_activity_logs_result_enum NOT NULL DEFAULT 'success',
  "riskScore"           double precision NOT NULL DEFAULT 0,
  "blockReason"         text NULL,
  "metadata"            jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt"           timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_agent_activity_logs_user_action"
  ON "agent_activity_logs" ("userId","action");

-- ---------------------------------------------------------------------------
-- 16. contact_requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "contact_requests" (
  "id"                  SERIAL PRIMARY KEY,
  "requesterId"         integer NOT NULL,
  "targetUserId"        integer NOT NULL,
  "agentConnectionId"   integer NULL,
  "status"              contact_requests_status_enum NOT NULL DEFAULT 'pending',
  "note"                text NOT NULL DEFAULT '',
  "expiresAt"           timestamptz NOT NULL DEFAULT now(),
  "respondedAt"         timestamptz NULL,
  "createdAt"           timestamp NOT NULL DEFAULT now(),
  "updatedAt"           timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_contact_requests_target_status"
  ON "contact_requests" ("targetUserId","status");

-- ---------------------------------------------------------------------------
-- 17. match_candidates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "match_candidates" (
  "id"                  SERIAL PRIMARY KEY,
  "userId"              integer NOT NULL,
  "agentConnectionId"   integer NULL,
  "candidateUserId"     integer NOT NULL,
  "score"               double precision NOT NULL DEFAULT 0,
  "reasonTags"          jsonb NOT NULL DEFAULT '[]'::jsonb,
  "reasonText"          text NOT NULL DEFAULT '',
  "status"              match_candidates_status_enum NOT NULL DEFAULT 'pending_review',
  "userFeedback"        text NULL,
  "createdAt"           timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_match_candidates_user_status"
  ON "match_candidates" ("userId","status");

-- ---------------------------------------------------------------------------
-- 18. safety_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "safety_events" (
  "id"                  SERIAL PRIMARY KEY,
  "agentConnectionId"   integer NULL,
  "userId"              integer NOT NULL,
  "eventType"           safety_events_eventtype_enum NOT NULL,
  "severity"            safety_events_severity_enum NOT NULL DEFAULT 'low',
  "description"         text NOT NULL DEFAULT '',
  "metadata"            jsonb NOT NULL DEFAULT '{}'::jsonb,
  "resolved"            boolean NOT NULL DEFAULT false,
  "resolution"          text NULL,
  "createdAt"           timestamp NOT NULL DEFAULT now(),
  "updatedAt"           timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_safety_events_severity"
  ON "safety_events" ("severity","resolved");

-- ---------------------------------------------------------------------------
-- 19. user_preferences (agent-gateway personal prefs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "user_preferences" (
  "id"                       SERIAL PRIMARY KEY,
  "userId"                   integer NOT NULL,
  "idealPartnerDescription"  text NOT NULL DEFAULT '',
  "aestheticPreferences"     jsonb NOT NULL DEFAULT '{}'::jsonb,
  "personalityPreferences"   jsonb NOT NULL DEFAULT '{}'::jsonb,
  "relationshipGoal"         user_preferences_relationshipgoal_enum NOT NULL DEFAULT 'fitness_buddy',
  "chatStyle"                user_preferences_chatstyle_enum NOT NULL DEFAULT 'warm',
  "privacyBoundaries"        jsonb NOT NULL DEFAULT '{}'::jsonb,
  "agentMessagingEnabled"    boolean NOT NULL DEFAULT false,
  "acceptAgentMessages"      boolean NOT NULL DEFAULT true,
  "createdAt"                timestamp NOT NULL DEFAULT now(),
  "updatedAt"                timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_preferences_user" ON "user_preferences" ("userId");

-- ---------------------------------------------------------------------------
-- 20. social_requests (legacy compat — referenced by AgentGateway read paths)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "social_requests" (
  "id"                       SERIAL PRIMARY KEY,
  "userId"                   integer NOT NULL,
  "agentConnectionId"        integer NULL,
  "requestType"              varchar NOT NULL,
  "title"                    varchar NOT NULL,
  "description"              text NOT NULL DEFAULT '',
  "city"                     varchar NOT NULL DEFAULT '',
  "loc"                      varchar NOT NULL DEFAULT '',
  "lat"                      double precision NULL,
  "lng"                      double precision NULL,
  "radiusKm"                 integer NOT NULL DEFAULT 5,
  "timePreference"           varchar NOT NULL DEFAULT '',
  "visibility"               varchar NOT NULL DEFAULT 'matched_users_only',
  "riskLevel"                social_requests_risklevel_enum NOT NULL DEFAULT 'low',
  "requiresUserConfirmation" boolean NOT NULL DEFAULT true,
  "filters"                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  "candidateUserIds"         jsonb NOT NULL DEFAULT '[]'::jsonb,
  "matchedCount"             integer NOT NULL DEFAULT 0,
  "status"                   social_requests_status_enum NOT NULL DEFAULT 'searching',
  "createdAt"                timestamp NOT NULL DEFAULT now(),
  "updatedAt"                timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_social_requests_user_status"
  ON "social_requests" ("userId","status");

-- ---------------------------------------------------------------------------
-- 21. public_social_intents — patch any columns the entity expects
--     (table already exists per ops report; ensure required columns are
--     present so we don't crash on read).
-- ---------------------------------------------------------------------------
ALTER TABLE "public_social_intents" ADD COLUMN IF NOT EXISTS "mode"                     varchar          NOT NULL DEFAULT 'public';
ALTER TABLE "public_social_intents" ADD COLUMN IF NOT EXISTS "requestType"              varchar          NOT NULL DEFAULT '';
ALTER TABLE "public_social_intents" ADD COLUMN IF NOT EXISTS "title"                    varchar          NOT NULL DEFAULT '';
ALTER TABLE "public_social_intents" ADD COLUMN IF NOT EXISTS "description"              text             NOT NULL DEFAULT '';
ALTER TABLE "public_social_intents" ADD COLUMN IF NOT EXISTS "city"                     varchar          NOT NULL DEFAULT '';
ALTER TABLE "public_social_intents" ADD COLUMN IF NOT EXISTS "loc"                      varchar          NOT NULL DEFAULT '';
ALTER TABLE "public_social_intents" ADD COLUMN IF NOT EXISTS "lat"                      double precision NULL;
ALTER TABLE "public_social_intents" ADD COLUMN IF NOT EXISTS "lng"                      double precision NULL;
ALTER TABLE "public_social_intents" ADD COLUMN IF NOT EXISTS "radiusKm"                 integer          NOT NULL DEFAULT 5;
ALTER TABLE "public_social_intents" ADD COLUMN IF NOT EXISTS "timePreference"           varchar          NOT NULL DEFAULT '';
ALTER TABLE "public_social_intents" ADD COLUMN IF NOT EXISTS "requiresUserConfirmation" boolean          NOT NULL DEFAULT true;
ALTER TABLE "public_social_intents" ADD COLUMN IF NOT EXISTS "filters"                  jsonb            NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "public_social_intents" ADD COLUMN IF NOT EXISTS "candidateUserIds"         jsonb            NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "public_social_intents" ADD COLUMN IF NOT EXISTS "matchedCount"             integer          NOT NULL DEFAULT 0;
ALTER TABLE "public_social_intents" ADD COLUMN IF NOT EXISTS "metadata"                 jsonb            NOT NULL DEFAULT '{}'::jsonb;
-- Enum-typed columns added defensively (cannot be ALTER...ADD on non-existing
-- column with enum default until the type exists; guarded above).
ALTER TABLE "public_social_intents" ADD COLUMN IF NOT EXISTS "riskLevel" social_requests_risklevel_enum NOT NULL DEFAULT 'low';
ALTER TABLE "public_social_intents" ADD COLUMN IF NOT EXISTS "status"    social_requests_status_enum    NOT NULL DEFAULT 'searching';

-- ---------------------------------------------------------------------------
-- 22. ai_match_sessions / ai_delegate_profiles — patch new columns
--     (tables already exist per ops report).
-- ---------------------------------------------------------------------------
ALTER TABLE "ai_match_sessions" ADD COLUMN IF NOT EXISTS "initiatedBy"     varchar     NOT NULL DEFAULT 'manual';
ALTER TABLE "ai_match_sessions" ADD COLUMN IF NOT EXISTS "conversationId"  varchar     NULL;
ALTER TABLE "ai_match_sessions" ADD COLUMN IF NOT EXISTS "contactCardSent" boolean     NOT NULL DEFAULT false;
ALTER TABLE "ai_match_sessions" ADD COLUMN IF NOT EXISTS "contactedAt"     timestamp   NULL;
ALTER TABLE "ai_match_sessions" ADD COLUMN IF NOT EXISTS "summary"         text        NOT NULL DEFAULT '';
ALTER TABLE "ai_match_sessions" ADD COLUMN IF NOT EXISTS "reasons"         text        NOT NULL DEFAULT '';
ALTER TABLE "ai_match_sessions" ADD COLUMN IF NOT EXISTS "transcript"      jsonb       NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "ai_delegate_profiles" ADD COLUMN IF NOT EXISTS "autoChatEnabled"     boolean NOT NULL DEFAULT false;
ALTER TABLE "ai_delegate_profiles" ADD COLUMN IF NOT EXISTS "dailyAutoChatLimit"  integer NOT NULL DEFAULT 3;
ALTER TABLE "ai_delegate_profiles" ADD COLUMN IF NOT EXISTS "preferredName"       varchar NOT NULL DEFAULT '';
ALTER TABLE "ai_delegate_profiles" ADD COLUMN IF NOT EXISTS "city"                varchar NOT NULL DEFAULT '';
ALTER TABLE "ai_delegate_profiles" ADD COLUMN IF NOT EXISTS "favoriteSports"      text    NOT NULL DEFAULT '';
ALTER TABLE "ai_delegate_profiles" ADD COLUMN IF NOT EXISTS "interests"           text    NOT NULL DEFAULT '';
ALTER TABLE "ai_delegate_profiles" ADD COLUMN IF NOT EXISTS "workExperience"      text    NOT NULL DEFAULT '';
ALTER TABLE "ai_delegate_profiles" ADD COLUMN IF NOT EXISTS "idealPartner"        text    NOT NULL DEFAULT '';
ALTER TABLE "ai_delegate_profiles" ADD COLUMN IF NOT EXISTS "trainingGoals"       text    NOT NULL DEFAULT '';
ALTER TABLE "ai_delegate_profiles" ADD COLUMN IF NOT EXISTS "boundaries"          text    NOT NULL DEFAULT '';
ALTER TABLE "ai_delegate_profiles" ADD COLUMN IF NOT EXISTS "availability"        varchar NOT NULL DEFAULT '';

-- ---------------------------------------------------------------------------
-- 23. Defensive guards for legacy tables that the current entities still rely
--     on. These tables already exist in any reasonably recent production DB,
--     so each statement is a no-op there; they only execute on an *empty* or
--     unusually old DB. No data is touched.
-- ---------------------------------------------------------------------------

-- safety module ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "safety_reports" (
  "id"           SERIAL PRIMARY KEY,
  "reporterId"   integer NOT NULL,
  "targetType"   varchar NOT NULL,
  "targetId"     integer NOT NULL,
  "reason"       varchar NOT NULL,
  "description"  text    NOT NULL DEFAULT '',
  "status"       varchar NOT NULL DEFAULT 'pending',
  "adminNote"    text    NOT NULL DEFAULT '',
  "handledById"  integer NULL,
  "createdAt"    timestamp NOT NULL DEFAULT now(),
  "updatedAt"    timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "verification_requests" (
  "id"              SERIAL PRIMARY KEY,
  "userId"          integer NOT NULL,
  "type"            varchar NOT NULL,
  "realName"        varchar NOT NULL DEFAULT '',
  "idNumberMasked"  varchar NOT NULL DEFAULT '',
  "certName"        varchar NOT NULL DEFAULT '',
  "certImageUrl"    varchar NOT NULL DEFAULT '',
  "status"          varchar NOT NULL DEFAULT 'pending',
  "adminNote"       text    NOT NULL DEFAULT '',
  "handledById"     integer NULL,
  "createdAt"       timestamp NOT NULL DEFAULT now(),
  "updatedAt"       timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "user_blocks" (
  "id"         SERIAL PRIMARY KEY,
  "blockerId"  integer NOT NULL,
  "blockedId"  integer NOT NULL,
  "createdAt"  timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "uq_user_blocks_pair" UNIQUE ("blockerId","blockedId")
);

CREATE TABLE IF NOT EXISTS "emergency_contacts" (
  "id"        SERIAL PRIMARY KEY,
  "userId"    integer NOT NULL,
  "name"      varchar NOT NULL,
  "phone"     varchar NOT NULL,
  "relation"  varchar NOT NULL DEFAULT '',
  "createdAt" timestamp NOT NULL DEFAULT now()
);

-- coaches / reviews --------------------------------------------------------
CREATE TABLE IF NOT EXISTS "coaches" (
  "id"             SERIAL PRIMARY KEY,
  "userId"         integer NOT NULL UNIQUE,
  "specialty"      varchar NOT NULL DEFAULT '',
  "experience"    varchar NOT NULL DEFAULT '',
  "tags"           text    NOT NULL DEFAULT '',
  "specialtyCode"  varchar NOT NULL DEFAULT '',
  "rating"         numeric(3,1) NOT NULL DEFAULT 0,
  "reviewCount"    integer NOT NULL DEFAULT 0,
  "students"       integer NOT NULL DEFAULT 0,
  "sessions"       integer NOT NULL DEFAULT 0,
  "price"          integer NOT NULL DEFAULT 0,
  "unit"           varchar NOT NULL DEFAULT '/ 节',
  "cert"           boolean NOT NULL DEFAULT false,
  "desc"           text    NOT NULL DEFAULT '',
  "cover"          varchar NOT NULL DEFAULT '',
  "coverBg"        varchar NOT NULL DEFAULT '',
  "works"          text    NOT NULL DEFAULT '',
  "coachCerts"     text    NOT NULL DEFAULT '',
  "income"         integer NOT NULL DEFAULT 0,
  "createdAt"      timestamp NOT NULL DEFAULT now(),
  "updatedAt"      timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "reviews" (
  "id"        SERIAL PRIMARY KEY,
  "rating"    numeric(2,1) NOT NULL,
  "text"      text NOT NULL,
  "tags"      text NOT NULL DEFAULT '',
  "userId"    integer NOT NULL,
  "coachId"   integer NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

-- clubs --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "clubs" (
  "id"            SERIAL PRIMARY KEY,
  "name"          varchar NOT NULL,
  "city"          varchar NOT NULL DEFAULT '',
  "sportType"     varchar NOT NULL,
  "description"   text    NOT NULL DEFAULT '',
  "coverUrl"      varchar NOT NULL DEFAULT '',
  "joinPolicy"    varchar NOT NULL DEFAULT 'open',
  "announcement"  text    NOT NULL DEFAULT '',
  "memberCount"   integer NOT NULL DEFAULT 1,
  "meetCount"     integer NOT NULL DEFAULT 0,
  "ownerId"       integer NOT NULL,
  "createdAt"     timestamp NOT NULL DEFAULT now(),
  "updatedAt"     timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "club_members" (
  "id"         SERIAL PRIMARY KEY,
  "clubId"     integer NOT NULL,
  "userId"     integer NOT NULL,
  "role"       varchar NOT NULL DEFAULT 'member',
  "status"     varchar NOT NULL DEFAULT 'pending',
  "createdAt"  timestamp NOT NULL DEFAULT now(),
  "updatedAt"  timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "uq_club_members_pair" UNIQUE ("clubId","userId")
);

COMMIT;

-- ============================================================================
-- End of patch. To verify post-apply, run:
--   \dt
--   \d users
--   \d meets
--   \d social_activities
--   \d user_social_requests
-- ============================================================================
