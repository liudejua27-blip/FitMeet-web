import { MigrationInterface, QueryRunner } from 'typeorm';

export class TaskHallProjection1783600000000 implements MigrationInterface {
  name = 'TaskHallProjection1783600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "public_task_intents" (
        "id" varchar(80) PRIMARY KEY,
        "userId" integer,
        "demandId" varchar(80) NOT NULL,
        "source" varchar NOT NULL DEFAULT 'demand',
        "mode" varchar NOT NULL DEFAULT 'public',
        "requestType" varchar(32) NOT NULL,
        "category" varchar(40) NOT NULL DEFAULT 'service',
        "title" varchar(120) NOT NULL,
        "summary" text NOT NULL DEFAULT '',
        "fields" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "city" varchar NOT NULL DEFAULT '',
        "loc" varchar NOT NULL DEFAULT '',
        "lat" double precision,
        "lng" double precision,
        "timePreference" varchar NOT NULL DEFAULT '',
        "budgetText" varchar NOT NULL DEFAULT '',
        "urgencyText" varchar NOT NULL DEFAULT '',
        "riskLevel" varchar(24) NOT NULL DEFAULT 'medium',
        "applicationPolicy" varchar(24) NOT NULL DEFAULT 'owner_approval_required',
        "applicantCount" integer NOT NULL DEFAULT 0,
        "acceptedApplicantId" integer,
        "status" varchar(24) NOT NULL DEFAULT 'open',
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_public_task_intents_status" CHECK ("status" IN ('open', 'in_progress', 'closed', 'cancelled')),
        CONSTRAINT "fk_public_task_intents_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_public_task_intents_demand" FOREIGN KEY ("demandId") REFERENCES "demands"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_public_task_intents_user_status" ON "public_task_intents" ("userId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_public_task_intents_category_status" ON "public_task_intents" ("category", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_public_task_intents_demand" ON "public_task_intents" ("demandId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "task_intent_applications" (
        "id" SERIAL PRIMARY KEY,
        "taskIntentId" varchar(80) NOT NULL,
        "ownerUserId" integer NOT NULL,
        "applicantUserId" integer NOT NULL,
        "status" varchar(24) NOT NULL DEFAULT 'pending',
        "message" text NOT NULL DEFAULT '',
        "resolvedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_task_intent_applications_status" CHECK ("status" IN ('pending', 'accepted', 'rejected', 'cancelled')),
        CONSTRAINT "fk_task_intent_applications_intent" FOREIGN KEY ("taskIntentId") REFERENCES "public_task_intents"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_task_intent_applications_owner" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_task_intent_applications_applicant" FOREIGN KEY ("applicantUserId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_task_intent_applications_intent_applicant_status"
      ON "task_intent_applications" ("taskIntentId", "applicantUserId", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_task_intent_applications_owner_status"
      ON "task_intent_applications" ("ownerUserId", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_task_intent_applications_applicant_status"
      ON "task_intent_applications" ("applicantUserId", "status")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uniq_task_intent_applications_active"
      ON "task_intent_applications" ("taskIntentId", "applicantUserId")
      WHERE "status" IN ('pending', 'accepted')
    `);

    await queryRunner.query(`
      ALTER TABLE "demands"
      ADD COLUMN IF NOT EXISTS "hallTarget" varchar(24) NOT NULL DEFAULT 'socialHall'
    `);
    await queryRunner.query(`
      ALTER TABLE "demands"
      ADD COLUMN IF NOT EXISTS "category" varchar(40) NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE "demands"
      ADD COLUMN IF NOT EXISTS "taskIntentId" varchar(80)
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_demands_hall_status" ON "demands" ("hallTarget", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_demands_task_intent" ON "demands" ("taskIntentId")`,
    );
    await queryRunner.query(`
      ALTER TABLE "demands"
      DROP CONSTRAINT IF EXISTS "fk_demands_task_intent"
    `);
    await queryRunner.query(`
      ALTER TABLE "demands"
      ADD CONSTRAINT "fk_demands_task_intent"
        FOREIGN KEY ("taskIntentId") REFERENCES "public_task_intents"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "demands" DROP CONSTRAINT IF EXISTS "fk_demands_task_intent"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_demands_task_intent"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_demands_hall_status"`);
    await queryRunner.query(
      `ALTER TABLE "demands" DROP COLUMN IF EXISTS "taskIntentId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "demands" DROP COLUMN IF EXISTS "category"`,
    );
    await queryRunner.query(
      `ALTER TABLE "demands" DROP COLUMN IF EXISTS "hallTarget"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uniq_task_intent_applications_active"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_task_intent_applications_applicant_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_task_intent_applications_owner_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_task_intent_applications_intent_applicant_status"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "task_intent_applications"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_public_task_intents_demand"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_public_task_intents_category_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_public_task_intents_user_status"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "public_task_intents"`);
  }
}
