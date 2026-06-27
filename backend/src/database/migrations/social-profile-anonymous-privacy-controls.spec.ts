import { QueryRunner } from 'typeorm';

import { SocialProfileAnonymousPrivacyControls1782600000000 } from './1782600000000-SocialProfileAnonymousPrivacyControls';

describe('SocialProfileAnonymousPrivacyControls migration', () => {
  function makeQueryRunner() {
    return {
      query: jest.fn(),
    } as unknown as QueryRunner & { query: jest.Mock };
  }

  it('adds anonymous candidate privacy controls to user social profiles', async () => {
    const migration = new SocialProfileAnonymousPrivacyControls1782600000000();
    const queryRunner = makeQueryRunner();

    await migration.up(queryRunner);

    const sql = queryRunner.query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n');
    expect(sql).toContain('ALTER TABLE "user_social_profiles"');
    expect(sql).toContain('"candidateDisplayMode" varchar(40) NOT NULL');
    expect(sql).toContain('"candidateAvatarVisibility" varchar(40) NOT NULL');
    expect(sql).toContain('"contactDisclosurePolicy" varchar(40) NOT NULL');
    expect(sql).toContain('"preciseLocationPolicy" varchar(40) NOT NULL');
    expect(sql).toContain('"strangerOpenerPolicy" varchar(40) NOT NULL');
    expect(sql).toContain('idx_user_social_profiles_privacy_display');
  });

  it('drops the index before removing anonymous privacy controls', async () => {
    const migration = new SocialProfileAnonymousPrivacyControls1782600000000();
    const queryRunner = makeQueryRunner();

    await migration.down(queryRunner);

    const statements = queryRunner.query.mock.calls.map(([statement]) =>
      String(statement),
    );
    expect(statements[0]).toContain(
      'DROP INDEX IF EXISTS "idx_user_social_profiles_privacy_display"',
    );
    expect(statements[1]).toContain(
      'DROP COLUMN IF EXISTS "candidateDisplayMode"',
    );
  });
});
