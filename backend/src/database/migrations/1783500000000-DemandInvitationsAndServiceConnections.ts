import { MigrationInterface, QueryRunner } from 'typeorm';

export class DemandInvitationsAndServiceConnections1783500000000 implements MigrationInterface {
  name = 'DemandInvitationsAndServiceConnections1783500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "demand_invitations" (
        "id" SERIAL PRIMARY KEY,
        "demandId" varchar(80),
        "candidateRecordId" integer,
        "inviterUserId" integer NOT NULL,
        "inviteeUserId" integer NOT NULL,
        "sourceType" varchar(40) NOT NULL DEFAULT 'agent_candidate',
        "sourceId" varchar(120),
        "publicIntentId" varchar(80),
        "title" varchar(120) NOT NULL,
        "message" text NOT NULL,
        "activityType" varchar(80) NOT NULL,
        "city" varchar(80),
        "locationText" varchar(160),
        "timeWindow" varchar(160),
        "capacityMin" integer,
        "capacityMax" integer,
        "status" varchar(24) NOT NULL DEFAULT 'pending',
        "proposedMeetId" integer,
        "acceptedMeetId" integer,
        "conversationId" varchar(120),
        "expiresAt" timestamptz,
        "resolvedAt" timestamptz,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_demand_invitations_status" CHECK ("status" IN ('pending', 'accepted', 'rejected', 'cancelled', 'expired')),
        CONSTRAINT "chk_demand_invitations_source_type" CHECK ("sourceType" IN ('agent_candidate', 'profile', 'friendship', 'public_intent')),
        CONSTRAINT "fk_demand_invitations_demand" FOREIGN KEY ("demandId") REFERENCES "demands"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_demand_invitations_candidate" FOREIGN KEY ("candidateRecordId") REFERENCES "demand_candidates"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_demand_invitations_inviter" FOREIGN KEY ("inviterUserId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_demand_invitations_invitee" FOREIGN KEY ("inviteeUserId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_demand_invitations_inviter_status"
      ON "demand_invitations" ("inviterUserId", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_demand_invitations_invitee_status"
      ON "demand_invitations" ("inviteeUserId", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_demand_invitations_demand_candidate"
      ON "demand_invitations" ("demandId", "candidateRecordId")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uniq_demand_invitations_pending_pair"
      ON "demand_invitations" ("demandId", "candidateRecordId", "inviteeUserId")
      WHERE "status" = 'pending' AND "demandId" IS NOT NULL AND "candidateRecordId" IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "connection_requests"
      ADD COLUMN IF NOT EXISTS "contextType" varchar(40)
    `);
    await queryRunner.query(`
      ALTER TABLE "connection_requests"
      ADD COLUMN IF NOT EXISTS "contextId" varchar(120)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_connection_requests_context"
      ON "connection_requests" ("contextType", "contextId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_connection_requests_context"`,
    );
    await queryRunner.query(
      `ALTER TABLE "connection_requests" DROP COLUMN IF EXISTS "contextId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "connection_requests" DROP COLUMN IF EXISTS "contextType"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uniq_demand_invitations_pending_pair"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_demand_invitations_demand_candidate"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_demand_invitations_invitee_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_demand_invitations_inviter_status"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "demand_invitations"`);
  }
}
