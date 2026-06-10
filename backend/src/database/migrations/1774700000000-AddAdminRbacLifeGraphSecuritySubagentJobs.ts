import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdminRbacLifeGraphSecuritySubagentJobs1774700000000 implements MigrationInterface {
  name = 'AddAdminRbacLifeGraphSecuritySubagentJobs1774700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_roles" (
        "id" SERIAL PRIMARY KEY,
        "key" character varying(80) NOT NULL,
        "name" character varying(120) NOT NULL,
        "description" text NOT NULL DEFAULT '',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uniq_admin_roles_key"
        ON "admin_roles" ("key")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_permissions" (
        "id" SERIAL PRIMARY KEY,
        "key" character varying(120) NOT NULL,
        "description" text NOT NULL DEFAULT '',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uniq_admin_permissions_key"
        ON "admin_permissions" ("key")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_user_roles" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL,
        "roleKey" character varying(80) NOT NULL,
        "grantedByUserId" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uniq_admin_user_roles_user_role"
        ON "admin_user_roles" ("userId", "roleKey")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_admin_user_roles_user"
        ON "admin_user_roles" ("userId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer,
        "permission" character varying(120),
        "route" character varying(240) NOT NULL DEFAULT '',
        "decision" character varying(40) NOT NULL,
        "reason" text NOT NULL DEFAULT '',
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_admin_audit_logs_user_created"
        ON "admin_audit_logs" ("userId", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_admin_audit_logs_permission_created"
        ON "admin_audit_logs" ("permission", "createdAt")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "life_graph_security_requests" (
        "id" SERIAL PRIMARY KEY,
        "type" character varying(20) NOT NULL,
        "status" character varying(40) NOT NULL DEFAULT 'pending_cooldown',
        "requestedByUserId" integer NOT NULL,
        "confirmationCodeHash" character varying(128) NOT NULL,
        "availableAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "confirmedAt" TIMESTAMP WITH TIME ZONE,
        "executedAt" TIMESTAMP WITH TIME ZONE,
        "notificationEmail" character varying(160),
        "notificationStatus" character varying(40) NOT NULL DEFAULT 'skipped',
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_life_graph_security_requests_user_type_created"
        ON "life_graph_security_requests" ("requestedByUserId", "type", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_life_graph_security_requests_status_available"
        ON "life_graph_security_requests" ("status", "availableAt")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "subagent_worker_jobs" (
        "id" SERIAL PRIMARY KEY,
        "agentName" character varying(80) NOT NULL,
        "queueName" character varying(120) NOT NULL,
        "status" character varying(40) NOT NULL DEFAULT 'queued',
        "priority" integer NOT NULL DEFAULT 0,
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "result" jsonb,
        "attempts" integer NOT NULL DEFAULT 0,
        "maxAttempts" integer NOT NULL DEFAULT 3,
        "lockedBy" character varying(160),
        "lockedUntil" TIMESTAMP WITH TIME ZONE,
        "runId" character varying(96),
        "traceId" character varying(96),
        "lastError" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_subagent_worker_jobs_queue_status_priority"
        ON "subagent_worker_jobs" ("queueName", "status", "priority", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_subagent_worker_jobs_run_trace"
        ON "subagent_worker_jobs" ("runId", "traceId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_subagent_worker_jobs_locked"
        ON "subagent_worker_jobs" ("lockedBy", "lockedUntil")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "subagent_worker_heartbeats" (
        "id" SERIAL PRIMARY KEY,
        "workerId" character varying(160) NOT NULL,
        "queueName" character varying(120) NOT NULL,
        "status" character varying(40) NOT NULL DEFAULT 'idle',
        "activeJobId" integer,
        "lastSeenAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uniq_subagent_worker_heartbeats_worker_queue"
        ON "subagent_worker_heartbeats" ("workerId", "queueName")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_subagent_worker_heartbeats_seen"
        ON "subagent_worker_heartbeats" ("lastSeenAt")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "subagent_worker_failures" (
        "id" SERIAL PRIMARY KEY,
        "jobId" integer NOT NULL,
        "agentName" character varying(80) NOT NULL,
        "queueName" character varying(120) NOT NULL,
        "workerId" character varying(160),
        "error" text NOT NULL,
        "context" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_subagent_worker_failures_job_created"
        ON "subagent_worker_failures" ("jobId", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_subagent_worker_failures_queue_created"
        ON "subagent_worker_failures" ("queueName", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_subagent_worker_failures_queue_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_subagent_worker_failures_job_created"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "subagent_worker_failures"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_subagent_worker_heartbeats_seen"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uniq_subagent_worker_heartbeats_worker_queue"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "subagent_worker_heartbeats"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_subagent_worker_jobs_locked"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_subagent_worker_jobs_run_trace"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_subagent_worker_jobs_queue_status_priority"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "subagent_worker_jobs"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_life_graph_security_requests_status_available"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_life_graph_security_requests_user_type_created"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "life_graph_security_requests"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_admin_audit_logs_permission_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_admin_audit_logs_user_created"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_audit_logs"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_admin_user_roles_user"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uniq_admin_user_roles_user_role"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_user_roles"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uniq_admin_permissions_key"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_permissions"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uniq_admin_roles_key"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_roles"`);
  }
}
