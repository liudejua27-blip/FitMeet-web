import { MatchingJobRecoveryLineage1782900000000 } from './1782900000000-MatchingJobRecoveryLineage';

describe('MatchingJobRecoveryLineage migration', () => {
  it('adds matching job parent-child recovery columns and index', async () => {
    const migration = new MatchingJobRecoveryLineage1782900000000();
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string) => {
        queries.push(sql);
        return Promise.resolve();
      }),
    };

    await migration.up(queryRunner as never);

    const sql = queries.join('\n');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "parentJobId"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "recoveryStrategyId"');
    expect(sql).toContain('idx_matching_jobs_parent_status');
  });

  it('drops recovery lineage columns and index', async () => {
    const migration = new MatchingJobRecoveryLineage1782900000000();
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
      'DROP INDEX IF EXISTS "idx_matching_jobs_parent_status"',
    );
    expect(sql).toContain('DROP COLUMN IF EXISTS "recoveryStrategyId"');
    expect(sql).toContain('DROP COLUMN IF EXISTS "parentJobId"');
  });
});
