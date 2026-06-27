import { QueryRunner } from 'typeorm';

import { SocialCandidateSnapshotsEvents1782500000000 } from './1782500000000-SocialCandidateSnapshotsEvents';

describe('SocialCandidateSnapshotsEvents migration', () => {
  function makeQueryRunner() {
    return {
      query: jest.fn(),
    } as unknown as QueryRunner & { query: jest.Mock };
  }

  it('creates candidate snapshot and event audit tables with lookup indexes', async () => {
    const migration = new SocialCandidateSnapshotsEvents1782500000000();
    const queryRunner = makeQueryRunner();

    await migration.up(queryRunner);

    const sql = queryRunner.query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n');
    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS "social_candidate_snapshots"',
    );
    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS "social_candidate_events"',
    );
    expect(sql).toContain('"snapshotType" varchar(60) NOT NULL');
    expect(sql).toContain('"candidates" jsonb NOT NULL DEFAULT');
    expect(sql).toContain('"eventType" varchar(80) NOT NULL');
    expect(sql).toContain(
      'FOREIGN KEY ("socialRequestId") REFERENCES "user_social_requests"("id")',
    );
    expect(sql).toContain('idx_social_candidate_snapshots_owner_created');
    expect(sql).toContain('idx_social_candidate_events_type_created');
    expect(sql).toContain('idx_social_candidate_events_idempotency');
    expect(sql).toContain('WHERE "idempotencyKey" IS NOT NULL');
  });

  it('drops indexes and constraints before dropping audit tables', async () => {
    const migration = new SocialCandidateSnapshotsEvents1782500000000();
    const queryRunner = makeQueryRunner();

    await migration.down(queryRunner);

    const statements = queryRunner.query.mock.calls.map(([statement]) =>
      String(statement),
    );
    expect(statements[0]).toContain(
      'DROP INDEX IF EXISTS "idx_social_candidate_events_idempotency"',
    );
    expect(statements.join('\n')).toContain(
      'ALTER TABLE "social_candidate_events" DROP CONSTRAINT IF EXISTS',
    );
    expect(statements.at(-2)).toContain(
      'DROP TABLE IF EXISTS "social_candidate_events"',
    );
    expect(statements.at(-1)).toContain(
      'DROP TABLE IF EXISTS "social_candidate_snapshots"',
    );
  });
});
