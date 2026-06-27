import { QueryRunner } from 'typeorm';

import { CandidateSearchIndex1782200000000 } from './1782200000000-CandidateSearchIndex';

describe('CandidateSearchIndex migration', () => {
  function makeQueryRunner() {
    return {
      query: jest.fn(),
    } as unknown as QueryRunner & { query: jest.Mock };
  }

  it('creates the candidate search index table and required lookup indexes', async () => {
    const migration = new CandidateSearchIndex1782200000000();
    const queryRunner = makeQueryRunner();

    await migration.up(queryRunner);

    const sql = queryRunner.query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n');
    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS "candidate_search_index"',
    );
    expect(sql).toContain('"sourceType" varchar(32) NOT NULL');
    expect(sql).toContain('"sourceId" varchar(120) NOT NULL');
    expect(sql).toContain(
      '"profileDiscoverable" boolean NOT NULL DEFAULT false',
    );
    expect(sql).toContain(
      '"agentCanRecommendMe" boolean NOT NULL DEFAULT false',
    );
    expect(sql).toContain('"activityTypes" jsonb NOT NULL DEFAULT');
    expect(sql).toContain('"timeBuckets" jsonb NOT NULL DEFAULT');
    expect(sql).toContain('idx_candidate_search_index_source');
    expect(sql).toContain('idx_candidate_search_index_status_city');
    expect(sql).toContain('idx_candidate_search_index_user_status');
    expect(sql).toContain('idx_candidate_search_index_consent_status');
    expect(sql).toContain('idx_candidate_search_index_source_updated');
  });

  it('drops lookup indexes before dropping the table', async () => {
    const migration = new CandidateSearchIndex1782200000000();
    const queryRunner = makeQueryRunner();

    await migration.down(queryRunner);

    const statements = queryRunner.query.mock.calls.map(([statement]) =>
      String(statement),
    );
    expect(statements[0]).toContain(
      'DROP INDEX IF EXISTS "idx_candidate_search_index_source_updated"',
    );
    expect(statements[statements.length - 1]).toContain(
      'DROP TABLE IF EXISTS "candidate_search_index"',
    );
  });
});
