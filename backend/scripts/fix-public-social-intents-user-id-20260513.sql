-- =============================================================================
-- fix-public-social-intents-user-id-20260513.sql
--
-- Production hotfix for public_social_intents schema drift.
-- The TypeORM entity has nullable integer "userId" and an index on
-- ("userId", "status"), but some production schemas were created from the
-- earlier public_social_intents migration before that column was added.
--
-- Safe to re-run. No DROP / DELETE / TRUNCATE.
-- =============================================================================

BEGIN;

ALTER TABLE "public_social_intents"
  ADD COLUMN IF NOT EXISTS "userId" integer NULL;

CREATE INDEX IF NOT EXISTS "idx_public_social_intents_user_status"
  ON "public_social_intents" ("userId", "status");

COMMIT;
