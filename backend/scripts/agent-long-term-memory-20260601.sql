-- Long-term Social Agent memory (v1, no Vector DB).
-- One row per user; populated when an agent_tasks row reaches a terminal state.
-- Read as a *weak signal* during planning / matching.

CREATE TABLE IF NOT EXISTS social_agent_long_term_memory (
  id                    SERIAL PRIMARY KEY,
  "userId"              INTEGER NOT NULL,
  preferences           JSONB NOT NULL DEFAULT '{}'::jsonb,
  boundaries            JSONB NOT NULL DEFAULT '{}'::jsonb,
  "activityPreferences" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "matchSignals"        JSONB NOT NULL DEFAULT '{}'::jsonb,
  "taskSummaries"       JSONB NOT NULL DEFAULT '[]'::jsonb,
  "taskCount"           INTEGER NOT NULL DEFAULT 0,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT social_agent_long_term_memory_user_fk
    FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS social_agent_long_term_memory_user_uq
  ON social_agent_long_term_memory ("userId");
