import { MigrationInterface, QueryRunner } from 'typeorm';

export class CandidateSearchIndexRecallIndexes1782800000000 implements MigrationInterface {
  name = 'CandidateSearchIndexRecallIndexes1782800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_candidate_search_index_activity_gin"
      ON "candidate_search_index" USING GIN ("activityTypes")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_candidate_search_index_interest_gin"
      ON "candidate_search_index" USING GIN ("interestTags")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_candidate_search_index_time_gin"
      ON "candidate_search_index" USING GIN ("timeBuckets")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_candidate_search_index_city_trgm"
      ON "candidate_search_index" USING GIN ("city" gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_candidate_search_index_recall_order"
      ON "candidate_search_index" ("status", "sourceType", "lastActiveAt" DESC, "updatedAt" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_candidate_search_index_recall_order"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_candidate_search_index_city_trgm"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_candidate_search_index_time_gin"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_candidate_search_index_interest_gin"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_candidate_search_index_activity_gin"`,
    );
  }
}
