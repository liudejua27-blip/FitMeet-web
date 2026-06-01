import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentIntents1773300000000 implements MigrationInterface {
  name = 'AddPaymentIntents1773300000000';
  transaction = false as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const value of ['offline_meeting', 'payment']) {
      await queryRunner.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_enum e
              JOIN pg_type t ON t.oid = e.enumtypid
              WHERE t.typname = 'agent_action_logs_actiontype_enum'
                AND e.enumlabel = '${value}'
          ) THEN
            EXECUTE 'ALTER TYPE "agent_action_logs_actiontype_enum" ADD VALUE ''${value}''';
          END IF;
        END $$;
      `);
    }

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "payment_intents_status_enum" AS ENUM (
          'pending', 'created', 'completed', 'failed'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_intents" (
        "id" SERIAL PRIMARY KEY,
        "ownerUserId" integer NOT NULL,
        "agentConnectionId" integer,
        "agentTaskId" integer,
        "stepId" varchar(80),
        "targetUserId" integer,
        "amount" numeric(12,2) NOT NULL,
        "currency" varchar(8) NOT NULL DEFAULT 'CNY',
        "description" text NOT NULL DEFAULT '',
        "status" "payment_intents_status_enum" NOT NULL DEFAULT 'created',
        "provider" varchar(80) NOT NULL DEFAULT 'manual_intent',
        "providerReference" varchar(120),
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_payment_intents_owner" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_payment_intents_agent" FOREIGN KEY ("agentConnectionId") REFERENCES "agent_connections"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_payment_intents_task" FOREIGN KEY ("agentTaskId") REFERENCES "agent_tasks"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_payment_intents_owner_created" ON "payment_intents" ("ownerUserId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_payment_intents_agent_created" ON "payment_intents" ("agentConnectionId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_payment_intents_status_created" ON "payment_intents" ("status", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_payment_intents_status_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_payment_intents_agent_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_payment_intents_owner_created"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_intents"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "payment_intents_status_enum"`,
    );
  }
}
