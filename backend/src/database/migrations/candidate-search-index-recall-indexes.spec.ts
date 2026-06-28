import { CandidateSearchIndexRecallIndexes1782800000000 } from './1782800000000-CandidateSearchIndexRecallIndexes';

describe('CandidateSearchIndexRecallIndexes migration', () => {
  it('adds recall indexes for tags, city and active ordering', async () => {
    const migration = new CandidateSearchIndexRecallIndexes1782800000000();
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string) => {
        queries.push(sql);
        return Promise.resolve();
      }),
    };

    await migration.up(queryRunner as never);

    const sql = queries.join('\n');
    expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    expect(sql).toContain('idx_candidate_search_index_activity_gin');
    expect(sql).toContain('idx_candidate_search_index_interest_gin');
    expect(sql).toContain('idx_candidate_search_index_time_gin');
    expect(sql).toContain('idx_candidate_search_index_city_trgm');
    expect(sql).toContain('idx_candidate_search_index_recall_order');
  });

  it('drops recall indexes in reverse-compatible down migration', async () => {
    const migration = new CandidateSearchIndexRecallIndexes1782800000000();
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string) => {
        queries.push(sql);
        return Promise.resolve();
      }),
    };

    await migration.down(queryRunner as never);

    const sql = queries.join('\n');
    expect(sql).toContain(
      'DROP INDEX IF EXISTS "idx_candidate_search_index_recall_order"',
    );
    expect(sql).toContain(
      'DROP INDEX IF EXISTS "idx_candidate_search_index_city_trgm"',
    );
    expect(sql).toContain(
      'DROP INDEX IF EXISTS "idx_candidate_search_index_activity_gin"',
    );
  });
});
