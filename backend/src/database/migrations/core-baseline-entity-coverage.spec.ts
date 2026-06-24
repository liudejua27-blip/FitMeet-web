import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const srcRoot = join(__dirname, '..', '..');
const migrationsRoot = __dirname;

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return listFiles(fullPath);
    return stat.isFile() ? [fullPath] : [];
  });
}

function entityTables(): Map<string, string[]> {
  const tables = new Map<string, string[]>();
  const entityRegex = /@Entity\((['"])([^'"]+)\1\)/g;

  for (const file of listFiles(srcRoot)) {
    if (!file.endsWith('.entity.ts')) continue;
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(entityRegex)) {
      const table = match[2];
      if (!table) continue;
      const owners = tables.get(table) ?? [];
      owners.push(relative(srcRoot, file));
      tables.set(table, owners);
    }
  }

  return tables;
}

function migrationTables(): Set<string> {
  const tables = new Set<string>();
  for (const file of listFiles(migrationsRoot)) {
    if (!/^\d+.*\.ts$/.test(relative(migrationsRoot, file))) continue;
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(
      /CREATE TABLE(?: IF NOT EXISTS)? "([^"]+)"/g,
    )) {
      tables.add(match[1]);
    }
  }
  return tables;
}

describe('CoreBaseline migration entity coverage', () => {
  it('creates every TypeORM entity table through baseline or incremental migrations', () => {
    const entities = entityTables();
    const migrations = migrationTables();
    const entityTableNames = new Set(entities.keys());

    const missing = Array.from(entityTableNames)
      .filter((table) => !migrations.has(table))
      .map((table) => `${table} (${entities.get(table)?.join(', ')})`);
    const stale = Array.from(migrations).filter(
      (table) => !entityTableNames.has(table),
    );

    expect(missing).toEqual([]);
    expect(stale).toEqual([]);
  });
});
