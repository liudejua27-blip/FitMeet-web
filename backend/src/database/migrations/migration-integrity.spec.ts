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

  it('keeps enum value additions outside TypeORM migration transactions', () => {
    for (const migration of migrations) {
      const addsPostgresEnumValue = /ALTER\s+TYPE[\s\S]+ADD\s+VALUE/i.test(
        migration.source,
      );
      if (!addsPostgresEnumValue) continue;

      expect(migration.source).toMatch(/transaction\s*=\s*false\s+as\s+const/);
    }
  });

  it('only opts out of migration transactions for documented Postgres enum value additions', () => {
    for (const migration of migrations) {
      const disablesTransaction = /transaction\s*=\s*false\s+as\s+const/.test(
        migration.source,
      );
      if (!disablesTransaction) continue;

      expect(migration.source).toMatch(/ALTER\s+TYPE[\s\S]+ADD\s+VALUE/i);
      expect(migration.source).toMatch(/ALTER TYPE.*ADD VALUE|ADD VALUE/i);
    }
  });

  it('keeps destructive data or table operations out of production up migrations', () => {
    for (const migration of migrations) {
      const upBody = extractMethodBody(migration.source, 'up');
      const hasDestructiveDataOrTableOperation =
        /\bDROP\s+(TABLE|COLUMN)\b/i.test(upBody) ||
        /\bALTER\s+TABLE[\s\S]*?\bDROP\s+COLUMN\b/i.test(upBody) ||
        /\bDELETE\s+FROM\b/i.test(upBody) ||
        /\bTRUNCATE\b/i.test(upBody);

      expect(hasDestructiveDataOrTableOperation).toBe(false);

      const dropsType = /\bDROP\s+TYPE\b/i.test(upBody);
      if (!dropsType) continue;

      expect(migration.fileName).toBe('1771600000000-RenameAgentModes.ts');
      expect(upBody).toMatch(/\bCREATE\s+TYPE\b[\s\S]+_new/i);
      expect(upBody).toMatch(/\bALTER\s+TABLE\b[\s\S]+\bUSING\b/i);
      expect(upBody).toMatch(/\bALTER\s+TYPE\b[\s\S]+\bRENAME\s+TO\b/i);
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

function extractMethodBody(source: string, methodName: 'up' | 'down'): string {
  const marker = `public async ${methodName}(`;
  const start = source.indexOf(marker);
  if (start === -1) return '';

  const bodyStart = source.indexOf('{', start);
  if (bodyStart === -1) return '';

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return source.slice(bodyStart + 1, index);
  }

  return source.slice(bodyStart + 1);
}
