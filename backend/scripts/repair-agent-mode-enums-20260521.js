const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function quoteLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function findEnumType(client, candidates) {
  const result = await client.query(
    `
      SELECT n.nspname AS schema, t.typname AS name
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typtype = 'e'
        AND n.nspname = 'public'
        AND t.typname = ANY($1)
      ORDER BY t.typname
      LIMIT 1
    `,
    [candidates],
  );
  return result.rows[0] ?? null;
}

async function addEnumValues(client, candidates, values) {
  const type = await findEnumType(client, candidates);
  if (!type) return null;
  const qualified = `${quoteIdent(type.schema)}.${quoteIdent(type.name)}`;
  for (const value of values) {
    await client.query(
      `ALTER TYPE ${qualified} ADD VALUE IF NOT EXISTS ${quoteLiteral(value)}`,
    );
  }
  return type;
}

async function distinctValues(client, table, column) {
  const result = await client.query(
    `SELECT DISTINCT ${quoteIdent(column)}::text AS value FROM ${quoteIdent(table)} ORDER BY 1`,
  );
  return result.rows.map((row) => row.value);
}

async function main() {
  const cwd = process.cwd();
  for (const file of [
    '.env.development.local',
    '.env.local',
    '.env.development',
    '.env',
  ]) {
    loadEnvFile(path.join(cwd, file));
  }

  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });
  await client.connect();
  try {
    // PostgreSQL requires newly added enum labels to be committed before they
    // are used in UPDATE/CAST expressions, so ALTER TYPE must stay outside the
    // data-update transaction below.
    const permissionEnum = await addEnumValues(
      client,
      [
        'agent_connections_permissionlevel_enum',
        'agent_connections_permissionLevel_enum',
      ],
      ['basic', 'standard', 'open', 'sandbox_internal'],
    );
    const settingsEnum = await addEnumValues(
      client,
      ['agent_settings_mode_enum'],
      ['basic', 'normal', 'standard', 'open', 'sandbox_internal'],
    );

    await client.query('BEGIN');

    const permissionType = permissionEnum
      ? `${quoteIdent(permissionEnum.schema)}.${quoteIdent(permissionEnum.name)}`
      : 'text';
    const settingsType = settingsEnum
      ? `${quoteIdent(settingsEnum.schema)}.${quoteIdent(settingsEnum.name)}`
      : 'text';

    const agentConnections = await client.query(`
      UPDATE "agent_connections"
      SET "permissionLevel" = (
        CASE "permissionLevel"::text
          WHEN 'assisted_mode' THEN 'basic'
          WHEN 'limited_auto' THEN 'standard'
          WHEN 'lab_mode' THEN 'sandbox_internal'
          ELSE "permissionLevel"::text
        END
      )::${permissionType}
      WHERE "permissionLevel"::text IN ('assisted_mode', 'limited_auto', 'lab_mode')
    `);
    const agentSettings = await client.query(`
      UPDATE "agent_settings"
      SET "mode" = (
        CASE "mode"::text
          WHEN 'limited_auto' THEN 'standard'
          WHEN 'lab' THEN 'sandbox_internal'
          ELSE "mode"::text
        END
      )::${settingsType}
      WHERE "mode"::text IN ('limited_auto', 'lab')
    `);

    await client.query('COMMIT');

    const permissionLevels = await distinctValues(
      client,
      'agent_connections',
      'permissionLevel',
    );
    const settingsModes = await distinctValues(client, 'agent_settings', 'mode');
    console.log(
      JSON.stringify(
        {
          agentConnectionsUpdated: agentConnections.rowCount,
          agentSettingsUpdated: agentSettings.rowCount,
          permissionLevels,
          settingsModes,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
