import { MigrationInterface, QueryRunner } from 'typeorm';

export class SocialContactLoopV11781700000000 implements MigrationInterface {
  name = 'SocialContactLoopV11781700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "connection_requests" (
        "id" SERIAL PRIMARY KEY,
        "requesterId" integer NOT NULL,
        "targetUserId" integer NOT NULL,
        "status" varchar(24) NOT NULL DEFAULT 'pending',
        "message" text NOT NULL DEFAULT '',
        "resolvedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_connection_requests_requester" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_connection_requests_target" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_connection_requests_requester_target_status"
      ON "connection_requests" ("requesterId", "targetUserId", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_connection_requests_target_status"
      ON "connection_requests" ("targetUserId", "status")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uniq_connection_requests_pending_pair"
      ON "connection_requests" ("requesterId", "targetUserId")
      WHERE "status" = 'pending'
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "friendships" (
        "id" SERIAL PRIMARY KEY,
        "userLowId" integer NOT NULL,
        "userHighId" integer NOT NULL,
        "status" varchar(24) NOT NULL DEFAULT 'active',
        "sourceConnectionRequestId" integer,
        "removedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_friendships_low_user" FOREIGN KEY ("userLowId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_friendships_high_user" FOREIGN KEY ("userHighId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_friendships_connection_request" FOREIGN KEY ("sourceConnectionRequestId") REFERENCES "connection_requests"("id") ON DELETE SET NULL,
        CONSTRAINT "chk_friendships_sorted_pair" CHECK ("userLowId" < "userHighId")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_friendships_pair"
      ON "friendships" ("userLowId", "userHighId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_friendships_status"
      ON "friendships" ("status")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contact_permissions" (
        "id" SERIAL PRIMARY KEY,
        "userLowId" integer NOT NULL,
        "userHighId" integer NOT NULL,
        "status" varchar(32) NOT NULL DEFAULT 'none',
        "conversationId" varchar(120),
        "openerSenderId" integer,
        "openerContextType" varchar(64),
        "openerContextId" varchar(120),
        "openerSentAt" timestamptz,
        "openedAt" timestamptz,
        "closedAt" timestamptz,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_contact_permissions_low_user" FOREIGN KEY ("userLowId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_contact_permissions_high_user" FOREIGN KEY ("userHighId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "chk_contact_permissions_sorted_pair" CHECK ("userLowId" < "userHighId")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_contact_permissions_pair"
      ON "contact_permissions" ("userLowId", "userHighId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_contact_permissions_conversation"
      ON "contact_permissions" ("conversationId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contact_permission_grants" (
        "id" SERIAL PRIMARY KEY,
        "permissionId" integer NOT NULL,
        "sourceType" varchar(64) NOT NULL,
        "sourceId" varchar(120) NOT NULL,
        "status" varchar(24) NOT NULL DEFAULT 'active',
        "grantedByUserId" integer,
        "revokedAt" timestamptz,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_contact_permission_grants_permission" FOREIGN KEY ("permissionId") REFERENCES "contact_permissions"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_contact_permission_grants_granted_by" FOREIGN KEY ("grantedByUserId") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_contact_permission_grants_permission_status"
      ON "contact_permission_grants" ("permissionId", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_contact_permission_grants_source_status"
      ON "contact_permission_grants" ("sourceType", "sourceId", "status")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uniq_contact_permission_grants_active_source"
      ON "contact_permission_grants" ("permissionId", "sourceType", "sourceId")
      WHERE "status" = 'active'
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "public_intent_applications" (
        "id" SERIAL PRIMARY KEY,
        "publicIntentId" varchar(80) NOT NULL,
        "ownerUserId" integer NOT NULL,
        "applicantUserId" integer NOT NULL,
        "status" varchar(24) NOT NULL DEFAULT 'pending',
        "message" text NOT NULL DEFAULT '',
        "meetId" integer,
        "resolvedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_public_intent_applications_intent" FOREIGN KEY ("publicIntentId") REFERENCES "public_social_intents"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_public_intent_applications_owner" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_public_intent_applications_applicant" FOREIGN KEY ("applicantUserId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_public_intent_applications_meet" FOREIGN KEY ("meetId") REFERENCES "meets"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_public_intent_applications_intent_applicant_status"
      ON "public_intent_applications" ("publicIntentId", "applicantUserId", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_public_intent_applications_owner_status"
      ON "public_intent_applications" ("ownerUserId", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_public_intent_applications_applicant_status"
      ON "public_intent_applications" ("applicantUserId", "status")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uniq_public_intent_applications_active"
      ON "public_intent_applications" ("publicIntentId", "applicantUserId")
      WHERE "status" IN ('pending', 'accepted')
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "domain_outbox_events" (
        "id" SERIAL PRIMARY KEY,
        "eventType" varchar(120) NOT NULL,
        "aggregateType" varchar(80) NOT NULL,
        "aggregateId" varchar(120) NOT NULL,
        "dedupeKey" varchar(180) NOT NULL,
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "status" varchar(24) NOT NULL DEFAULT 'pending',
        "attemptCount" integer NOT NULL DEFAULT 0,
        "availableAt" timestamptz NOT NULL DEFAULT now(),
        "processedAt" timestamptz,
        "leaseOwner" varchar(120),
        "leaseExpiresAt" timestamptz,
        "lastError" text NOT NULL DEFAULT '',
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_domain_outbox_events_dedupe"
      ON "domain_outbox_events" ("dedupeKey")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_domain_outbox_events_status_available"
      ON "domain_outbox_events" ("status", "availableAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_domain_outbox_events_status_lease"
      ON "domain_outbox_events" ("status", "leaseExpiresAt")
    `);

    await queryRunner.query(`
      ALTER TABLE "public_social_intents"
      ADD COLUMN IF NOT EXISTS "capacityMin" integer NOT NULL DEFAULT 1
    `);
    await queryRunner.query(`
      ALTER TABLE "public_social_intents"
      ADD COLUMN IF NOT EXISTS "capacityMax" integer NOT NULL DEFAULT 1
    `);
    await queryRunner.query(`
      ALTER TABLE "public_social_intents"
      ADD COLUMN IF NOT EXISTS "acceptedCount" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "public_social_intents"
      ADD COLUMN IF NOT EXISTS "applicationPolicy" varchar(32) NOT NULL DEFAULT 'approval_required'
    `);
    await queryRunner.query(`
      ALTER TABLE "public_social_intents"
      ADD COLUMN IF NOT EXISTS "linkedMeetId" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "public_social_intents"
      ADD COLUMN IF NOT EXISTS "closesAt" timestamptz
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_public_social_intents_linked_meet'
        ) THEN
          ALTER TABLE "public_social_intents"
          ADD CONSTRAINT "fk_public_social_intents_linked_meet"
          FOREIGN KEY ("linkedMeetId") REFERENCES "meets"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "public_social_intents"
      DROP CONSTRAINT IF EXISTS "fk_public_social_intents_linked_meet"
    `);
    await queryRunner.query(`
      ALTER TABLE "public_social_intents"
      DROP COLUMN IF EXISTS "closesAt",
      DROP COLUMN IF EXISTS "linkedMeetId",
      DROP COLUMN IF EXISTS "applicationPolicy",
      DROP COLUMN IF EXISTS "acceptedCount",
      DROP COLUMN IF EXISTS "capacityMax",
      DROP COLUMN IF EXISTS "capacityMin"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "domain_outbox_events"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "public_intent_applications"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "contact_permission_grants"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "contact_permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "friendships"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "connection_requests"`);
  }
}
