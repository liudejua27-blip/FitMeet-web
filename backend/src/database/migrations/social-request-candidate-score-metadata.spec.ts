import { QueryRunner } from 'typeorm';

import { SocialRequestCandidateScoreMetadata1782300000000 } from './1782300000000-SocialRequestCandidateScoreMetadata';

describe('SocialRequestCandidateScoreMetadata migration', () => {
  function makeQueryRunner() {
    return {
      query: jest.fn(),
    } as unknown as QueryRunner & { query: jest.Mock };
  }

  it('adds score metadata columns and lookup indexes', async () => {
    const migration = new SocialRequestCandidateScoreMetadata1782300000000();
    const queryRunner = makeQueryRunner();

    await migration.up(queryRunner);

    const sql = queryRunner.query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n');
    expect(sql).toContain('ALTER TABLE "social_request_candidates"');
    expect(sql).toContain('"sourceType" varchar(40)');
    expect(sql).toContain('"sourceId" varchar(120)');
    expect(sql).toContain('"scoreVersion" varchar(40)');
    expect(sql).toContain("'fitmeet_match_v1'");
    expect(sql).toContain('"explanation" jsonb NOT NULL DEFAULT');
    expect(sql).toContain('"relationshipState" jsonb NOT NULL DEFAULT');
    expect(sql).toContain('"userActionAt" timestamptz');
    expect(sql).toContain('idx_social_request_candidates_score_version');
    expect(sql).toContain('idx_social_request_candidates_source');
    expect(sql).toContain('idx_social_request_candidates_user_action');
  });

  it('drops indexes before metadata columns', async () => {
    const migration = new SocialRequestCandidateScoreMetadata1782300000000();
    const queryRunner = makeQueryRunner();

    await migration.down(queryRunner);

    const statements = queryRunner.query.mock.calls.map(([statement]) =>
      String(statement),
    );
    expect(statements[0]).toContain(
      'DROP INDEX IF EXISTS "idx_social_request_candidates_user_action"',
    );
    expect(statements[statements.length - 1]).toContain(
      'DROP COLUMN IF EXISTS "sourceType"',
    );
  });
});
