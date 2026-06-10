import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAgentL5Runtime1774600000000 implements MigrationInterface {
  name = 'AddAgentL5Runtime1774600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_online_replay_samples" (
        "id" SERIAL PRIMARY KEY,
        "ownerUserId" integer,
        "agentTaskId" integer,
        "evalCaseId" integer,
        "replayType" character varying(80) NOT NULL DEFAULT 'chat_turn',
        "status" character varying(40) NOT NULL DEFAULT 'captured',
        "input" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "expectedBehavior" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "replayContext" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "lastReplay" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_agent_online_replay_samples_owner"
          FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_agent_online_replay_samples_task"
          FOREIGN KEY ("agentTaskId") REFERENCES "agent_tasks"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_agent_online_replay_samples_eval_case"
          FOREIGN KEY ("evalCaseId") REFERENCES "agent_eval_cases"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_agent_online_replay_samples_task_created"
        ON "agent_online_replay_samples" ("agentTaskId", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_agent_online_replay_samples_eval_case"
        ON "agent_online_replay_samples" ("evalCaseId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_agent_online_replay_samples_owner_created"
        ON "agent_online_replay_samples" ("ownerUserId", "createdAt")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_subagent_memory" (
        "id" SERIAL PRIMARY KEY,
        "ownerUserId" integer NOT NULL,
        "agentTaskId" integer,
        "agentName" character varying(80) NOT NULL,
        "memoryScope" character varying(120) NOT NULL,
        "input" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "observation" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "critique" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "handoffOutput" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_agent_subagent_memory_owner"
          FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_agent_subagent_memory_task"
          FOREIGN KEY ("agentTaskId") REFERENCES "agent_tasks"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_agent_subagent_memory_user_agent_updated"
        ON "agent_subagent_memory" ("ownerUserId", "agentName", "updatedAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_agent_subagent_memory_task_agent"
        ON "agent_subagent_memory" ("agentTaskId", "agentName")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_agent_subagent_memory_scope"
        ON "agent_subagent_memory" ("memoryScope")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_meet_loop_states" (
        "id" SERIAL PRIMARY KEY,
        "ownerUserId" integer NOT NULL,
        "agentTaskId" integer NOT NULL,
        "activityId" integer,
        "candidateUserId" integer,
        "stage" character varying(80) NOT NULL DEFAULT 'draft_created',
        "waitingFor" character varying(80) NOT NULL DEFAULT 'waiting_confirmation',
        "state" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "transitionHistory" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "review" jsonb,
        "completedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_agent_meet_loop_states_owner"
          FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_agent_meet_loop_states_task"
          FOREIGN KEY ("agentTaskId") REFERENCES "agent_tasks"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uniq_agent_meet_loop_states_task"
        ON "agent_meet_loop_states" ("agentTaskId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_agent_meet_loop_states_owner_stage"
        ON "agent_meet_loop_states" ("ownerUserId", "stage")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_agent_meet_loop_states_activity"
        ON "agent_meet_loop_states" ("activityId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_skill_patch_effects" (
        "id" SERIAL PRIMARY KEY,
        "patchId" integer NOT NULL,
        "metric" character varying(80) NOT NULL,
        "value" double precision NOT NULL,
        "sampleSize" integer,
        "decision" character varying(40) NOT NULL DEFAULT 'observe',
        "note" text NOT NULL DEFAULT '',
        "context" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_agent_skill_patch_effects_patch"
          FOREIGN KEY ("patchId") REFERENCES "agent_skill_patches"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_agent_skill_patch_effects_patch_created"
        ON "agent_skill_patch_effects" ("patchId", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_agent_skill_patch_effects_decision_created"
        ON "agent_skill_patch_effects" ("decision", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_skill_patch_effects_decision_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_skill_patch_effects_patch_created"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_skill_patch_effects"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_meet_loop_states_activity"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_meet_loop_states_owner_stage"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uniq_agent_meet_loop_states_task"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_meet_loop_states"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_subagent_memory_scope"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_subagent_memory_task_agent"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_subagent_memory_user_agent_updated"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_subagent_memory"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_online_replay_samples_owner_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_online_replay_samples_eval_case"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_online_replay_samples_task_created"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "agent_online_replay_samples"`,
    );
  }
}
