import { QueryRunner } from 'typeorm';

import { AgentGlobalTimeGeoFoundation1782400000000 } from './1782400000000-AgentGlobalTimeGeoFoundation';

describe('AgentGlobalTimeGeoFoundation migration', () => {
  function makeQueryRunner() {
    return {
      query: jest.fn(),
    } as unknown as QueryRunner & { query: jest.Mock };
  }

  it('adds locale, timezone and geohash columns to social matching tables', async () => {
    const migration = new AgentGlobalTimeGeoFoundation1782400000000();
    const queryRunner = makeQueryRunner();

    await migration.up(queryRunner);

    const sql = queryRunner.query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n');
    for (const table of [
      'user_social_profiles',
      'user_social_requests',
      'public_social_intents',
      'candidate_search_index',
    ]) {
      expect(sql).toContain(`ALTER TABLE "${table}"`);
    }
    expect(sql).toContain('"locale" varchar(20) NOT NULL DEFAULT');
    expect(sql).toContain('"countryCode" varchar(8) NOT NULL DEFAULT');
    expect(sql).toContain('"timeZone" varchar(80) NOT NULL DEFAULT');
    expect(sql).toContain('"utcOffsetMinutes" integer NOT NULL DEFAULT 480');
    expect(sql).toContain('"geoHash" varchar(16) NOT NULL DEFAULT');
    expect(sql).toContain('idx_candidate_search_index_status_country_city');
    expect(sql).toContain('idx_candidate_search_index_geohash_status');
  });

  it('drops new indexes before dropping incremental columns', async () => {
    const migration = new AgentGlobalTimeGeoFoundation1782400000000();
    const queryRunner = makeQueryRunner();

    await migration.down(queryRunner);

    const statements = queryRunner.query.mock.calls.map(([statement]) =>
      String(statement),
    );
    expect(statements[0]).toContain(
      'DROP INDEX IF EXISTS "idx_candidate_search_index_geohash_status"',
    );
    expect(statements[1]).toContain(
      'DROP INDEX IF EXISTS "idx_candidate_search_index_status_country_city"',
    );
    expect(statements.join('\n')).toContain(
      'ALTER TABLE "candidate_search_index" DROP COLUMN IF EXISTS "geoHash"',
    );
  });
});
