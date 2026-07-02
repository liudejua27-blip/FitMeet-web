import { MigrationInterface, QueryRunner } from 'typeorm';

export class DemandCandidates1783400000000 implements MigrationInterface {
  name = 'DemandCandidates1783400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "demand_candidates" (
        "id" SERIAL PRIMARY KEY,
        "demandId" varchar(80) NOT NULL,
        "ownerUserId" integer NOT NULL,
        "candidateUserId" integer NOT NULL,
        "source" varchar(40) NOT NULL DEFAULT 'candidate_search_index',
        "sourceId" varchar(120) NOT NULL DEFAULT '',
        "score" integer NOT NULL DEFAULT 0,
        "reasons" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "sharedPoints" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "distanceText" varchar(80) NOT NULL DEFAULT '',
        "timeFitText" varchar(120) NOT NULL DEFAULT '',
        "safetyNote" varchar(240) NOT NULL DEFAULT '',
        "status" varchar(32) NOT NULL DEFAULT 'recommended',
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_demand_candidates_demand"
          FOREIGN KEY ("demandId") REFERENCES "demands"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_demand_candidates_owner"
          FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_demand_candidates_user"
          FOREIGN KEY ("candidateUserId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "chk_demand_candidates_status"
          CHECK ("status" IN ('recommended', 'viewed', 'invited', 'dismissed', 'expired'))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_demand_candidates_demand_user"
      ON "demand_candidates" ("demandId", "candidateUserId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_demand_candidates_owner_status"
      ON "demand_candidates" ("ownerUserId", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_demand_candidates_demand_status"
      ON "demand_candidates" ("demandId", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_demand_candidates_demand_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_demand_candidates_owner_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_demand_candidates_demand_user"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "demand_candidates"`);
  }
}
