import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const APP_MODULE_SOURCE = readSource('src/app.module.ts');
const DATA_SOURCE_SOURCE = readSource('src/database/data-source.ts');

describe('TypeORM launch configuration contract', () => {
  it('uses glob-based entity discovery in both runtime and migration CLI config', () => {
    expect(APP_MODULE_SOURCE).toMatch(
      /entities:\s*\[\s*__dirname\s*\+\s*['"]\/\*\*\/\*\.entity\{\.ts,\.js\}['"]\s*\]/,
    );
    expect(DATA_SOURCE_SOURCE).toMatch(
      /entities:\s*\[\s*join\(\s*__dirname,\s*['"]\.\.['"],\s*['"]\*\*['"],\s*['"]\*\.entity\{\.ts,\.js\}['"]\s*\)\s*\]/,
    );
  });

  it('keeps runtime and migration CLI pointed at the same migration directory', () => {
    expect(APP_MODULE_SOURCE).toMatch(
      /migrations:\s*\[\s*__dirname\s*\+\s*['"]\/database\/migrations\/\[0-9\]\*\{\.ts,\.js\}['"]\s*\]/,
    );
    expect(DATA_SOURCE_SOURCE).toMatch(
      /migrations:\s*\[\s*join\(\s*__dirname,\s*['"]migrations['"],\s*['"]\[0-9\]\*\{\.ts,\.js\}['"]\s*\)\s*\]/,
    );
  });

  it('keeps schema changes migration-first instead of synchronize-first', () => {
    expect(APP_MODULE_SOURCE).toContain("const defaultSynchronize = 'false'");
    expect(APP_MODULE_SOURCE).toMatch(
      /configService\.get<string>\(\s*['"]DB_SYNCHRONIZE['"],\s*defaultSynchronize\s*\)\s*===\s*['"]true['"]/,
    );
    expect(APP_MODULE_SOURCE).toMatch(
      /migrationsRun:\s*nodeEnv\s*===\s*['"]production['"]\s*&&\s*configService\.get<string>\(\s*['"]DB_MIGRATIONS_RUN['"],\s*['"]false['"]\s*\)\s*===\s*['"]true['"]/,
    );
    expect(DATA_SOURCE_SOURCE).toMatch(/synchronize:\s*false/);
  });

  it('keeps migrations transactional per file for safer rollout recovery', () => {
    expect(APP_MODULE_SOURCE).toMatch(
      /migrationsTransactionMode:\s*['"]each['"]/,
    );
    expect(DATA_SOURCE_SOURCE).toMatch(
      /migrationsTransactionMode:\s*['"]each['"]/,
    );
  });
});

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}
