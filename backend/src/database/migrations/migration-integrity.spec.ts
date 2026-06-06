import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const MIGRATIONS_DIR = __dirname;
const LEGACY_DUPLICATE_TIMESTAMPS = new Map([
  [
    '1771300000000',
    [
      '1771300000000-AddAgentProfiles.ts',
      '1771300000000-AddSocialRequestCandidates.ts',
    ],
  ],
  [
    '1773800000000',
    [
      '1773800000000-AddSocialAgentLongTermMemory.ts',
      '1773800000000-AddSocialAgentTimelineEvents.ts',
    ],
  ],
]);

type MigrationSource = {
  fileName: string;
  timestamp: string;
  source: string;
};

describe('database migration integrity', () => {
  const migrations = loadMigrationSources();

  it('keeps migration filenames in monotonic timestamp order', () => {
    const timestamps = migrations.map((migration) => migration.timestamp);

    expect(timestamps).toEqual([...timestamps].sort());
  });

  it('keeps duplicate timestamps explicitly allowlisted', () => {
    const groups = groupByTimestamp(migrations);

    for (const [timestamp, files] of groups) {
      if (files.length === 1) continue;

      expect(files.map((file) => file.fileName).sort()).toEqual(
        (LEGACY_DUPLICATE_TIMESTAMPS.get(timestamp) ?? []).sort(),
      );
    }

    for (const [timestamp, allowedFiles] of LEGACY_DUPLICATE_TIMESTAMPS) {
      expect(
        groups
          .get(timestamp)
          ?.map((file) => file.fileName)
          .sort(),
      ).toEqual(allowedFiles.sort());
    }
  });

  it('keeps class names and TypeORM migration names aligned with filenames', () => {
    for (const migration of migrations) {
      const slug = migration.fileName.replace(/^\d+-/, '').replace(/\.ts$/, '');
      const expectedName = `${slug}${migration.timestamp}`;
      const explicitName = migration.source.match(
        /^\s*name\s*=\s*'([^']+)'/m,
      )?.[1];

      expect(migration.source).toContain(`export class ${expectedName}`);
      if (explicitName) {
        expect(explicitName).toBe(expectedName);
      }
    }
  });

  it('keeps every migration reversible at the interface level', () => {
    for (const migration of migrations) {
      expect(migration.source).toMatch(/public async up\(/);
      expect(migration.source).toMatch(/public async down\(/);
    }
  });
});

function loadMigrationSources(): MigrationSource[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((fileName) => /^\d{13}-.+\.ts$/.test(fileName))
    .sort()
    .map((fileName) => ({
      fileName,
      timestamp: fileName.slice(0, 13),
      source: readFileSync(join(MIGRATIONS_DIR, basename(fileName)), 'utf8'),
    }));
}

function groupByTimestamp(migrations: MigrationSource[]) {
  const groups = new Map<string, MigrationSource[]>();
  for (const migration of migrations) {
    groups.set(migration.timestamp, [
      ...(groups.get(migration.timestamp) ?? []),
      migration,
    ]);
  }
  return groups;
}
