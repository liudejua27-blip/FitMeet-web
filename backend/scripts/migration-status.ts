import dataSource from '../src/database/data-source';

type AppliedMigrationRow = {
  id: number;
  timestamp: string | number;
  name: string;
};

async function main() {
  await dataSource.initialize();

  const available = dataSource.migrations
    .map((migration) => ({
      name: migration.name,
      timestamp: timestampFromMigrationName(migration.name),
    }))
    .filter(
      (migration): migration is { name: string; timestamp: number | null } =>
        typeof migration.name === 'string' && migration.name.length > 0,
    );

  const migrationsTableExists = await hasMigrationsTable();
  const applied = migrationsTableExists
    ? await dataSource.query(
        'SELECT id, timestamp, name FROM migrations ORDER BY timestamp ASC',
      )
    : [];
  const appliedRows = applied as AppliedMigrationRow[];
  const appliedNames = new Set(appliedRows.map((row) => row.name));
  const pending = available.filter((migration) => !appliedNames.has(migration.name));
  const latestApplied = appliedRows.length
    ? appliedRows[appliedRows.length - 1]
    : null;

  console.log(
    JSON.stringify(
      {
        event: 'database.migration_status',
        database: dataSource.options.database ?? null,
        migrationsTable: 'migrations',
        migrationsTableExists,
        availableCount: available.length,
        appliedCount: appliedRows.length,
        pendingCount: pending.length,
        latestApplied,
        pending,
      },
      null,
      2,
    ),
  );
}

function timestampFromMigrationName(name: string | undefined): number | null {
  const match = name?.match(/(\d{13})$/);
  return match ? Number(match[1]) : null;
}

async function hasMigrationsTable(): Promise<boolean> {
  const rows = (await dataSource.query(
    "SELECT to_regclass('migrations') AS table_name",
  )) as { table_name: string | null }[];
  return Boolean(rows[0]?.table_name);
}

main()
  .catch((error: unknown) => {
    console.error(
      JSON.stringify({
        event: 'database.migration_status_failed',
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });
