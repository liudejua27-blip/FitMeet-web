import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const srcRoot = join(__dirname, '..', '..');
const baselinePath = join(__dirname, '1780000000000-CoreBaseline.ts');

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

function baselineTables(): Set<string> {
  const text = readFileSync(baselinePath, 'utf8');
  return new Set(
    Array.from(text.matchAll(/CREATE TABLE "([^"]+)"/g), (match) => match[1]),
  );
}

describe('CoreBaseline migration entity coverage', () => {
  it('creates every TypeORM entity table and no stale extra tables', () => {
    const entities = entityTables();
    const baseline = baselineTables();
    const entityTableNames = new Set(entities.keys());

    const missing = Array.from(entityTableNames)
      .filter((table) => !baseline.has(table))
      .map((table) => `${table} (${entities.get(table)?.join(', ')})`);
    const stale = Array.from(baseline).filter(
      (table) => !entityTableNames.has(table),
    );

    expect(missing).toEqual([]);
    expect(stale).toEqual([]);
  });
});
