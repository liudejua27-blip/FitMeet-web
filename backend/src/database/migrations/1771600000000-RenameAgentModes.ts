import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rename Agent permission modes to the product-facing names:
 *   AgentSettingsMode:
 *     assisted     → basic
 *     limited_auto → standard
 *     lab          → sandbox_internal   (kept; hidden in UI)
 *     (new)        + open
 *
 *   AgentPermissionLevel  (agent_connections.permissionLevel):
 *     read_only      → read_only        (kept)
 *     draft_mode     → draft_mode       (kept)
 *     assisted_mode  → basic
 *     limited_auto   → standard
 *     lab_mode       → sandbox_internal
 *     (new)          + open
 *
 * Existing rows are remapped in-place via ALTER COLUMN ... TYPE ... USING,
 * so previously-issued agent tokens (which authenticate via bcrypt hash on
 * the same agent_connections row) keep working — only the permissionLevel
 * label changes, the token string is untouched.
 */
export class RenameAgentModes1771600000000 implements MigrationInterface {
  name = 'RenameAgentModes1771600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. agent_settings_mode_enum  ─────────────────────────────
    await queryRunner.query(
      `CREATE TYPE "agent_settings_mode_enum_new" AS ENUM ('basic','standard','open','sandbox_internal')`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_settings" ALTER COLUMN "mode" DROP DEFAULT`,
    );
    await queryRunner.query(`
      ALTER TABLE "agent_settings"
        ALTER COLUMN "mode" TYPE "agent_settings_mode_enum_new"
        USING (
          CASE "mode"::text
            WHEN 'assisted'     THEN 'basic'
            WHEN 'limited_auto' THEN 'standard'
            WHEN 'lab'          THEN 'sandbox_internal'
            ELSE 'basic'
          END
        )::"agent_settings_mode_enum_new"
    `);
    await queryRunner.query(`DROP TYPE "agent_settings_mode_enum"`);
    await queryRunner.query(
      `ALTER TYPE "agent_settings_mode_enum_new" RENAME TO "agent_settings_mode_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_settings" ALTER COLUMN "mode" SET DEFAULT 'basic'`,
    );

    // ── 2. agent_connections_permissionLevel_enum  ───────────────
    await queryRunner.query(
      `CREATE TYPE "agent_connections_permissionLevel_enum_new" AS ENUM ('read_only','draft_mode','basic','standard','open','sandbox_internal')`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_connections" ALTER COLUMN "permissionLevel" DROP DEFAULT`,
    );
    await queryRunner.query(`
      ALTER TABLE "agent_connections"
        ALTER COLUMN "permissionLevel" TYPE "agent_connections_permissionLevel_enum_new"
        USING (
          CASE "permissionLevel"::text
            WHEN 'read_only'     THEN 'read_only'
            WHEN 'draft_mode'    THEN 'draft_mode'
            WHEN 'assisted_mode' THEN 'basic'
            WHEN 'limited_auto'  THEN 'standard'
            WHEN 'lab_mode'      THEN 'sandbox_internal'
            ELSE 'read_only'
          END
        )::"agent_connections_permissionLevel_enum_new"
    `);
    await queryRunner.query(
      `DROP TYPE "agent_connections_permissionLevel_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "agent_connections_permissionLevel_enum_new" RENAME TO "agent_connections_permissionLevel_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_connections" ALTER COLUMN "permissionLevel" SET DEFAULT 'read_only'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ── 1. agent_settings_mode_enum (revert)  ────────────────────
    await queryRunner.query(
      `CREATE TYPE "agent_settings_mode_enum_old" AS ENUM ('assisted','limited_auto','lab')`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_settings" ALTER COLUMN "mode" DROP DEFAULT`,
    );
    await queryRunner.query(`
      ALTER TABLE "agent_settings"
        ALTER COLUMN "mode" TYPE "agent_settings_mode_enum_old"
        USING (
          CASE "mode"::text
            WHEN 'basic'            THEN 'assisted'
            WHEN 'standard'         THEN 'limited_auto'
            WHEN 'open'             THEN 'limited_auto'
            WHEN 'sandbox_internal' THEN 'lab'
            ELSE 'assisted'
          END
        )::"agent_settings_mode_enum_old"
    `);
    await queryRunner.query(`DROP TYPE "agent_settings_mode_enum"`);
    await queryRunner.query(
      `ALTER TYPE "agent_settings_mode_enum_old" RENAME TO "agent_settings_mode_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_settings" ALTER COLUMN "mode" SET DEFAULT 'assisted'`,
    );

    // ── 2. agent_connections_permissionLevel_enum (revert)  ──────
    await queryRunner.query(
      `CREATE TYPE "agent_connections_permissionLevel_enum_old" AS ENUM ('read_only','draft_mode','assisted_mode','limited_auto','lab_mode')`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_connections" ALTER COLUMN "permissionLevel" DROP DEFAULT`,
    );
    await queryRunner.query(`
      ALTER TABLE "agent_connections"
        ALTER COLUMN "permissionLevel" TYPE "agent_connections_permissionLevel_enum_old"
        USING (
          CASE "permissionLevel"::text
            WHEN 'read_only'        THEN 'read_only'
            WHEN 'draft_mode'       THEN 'draft_mode'
            WHEN 'basic'            THEN 'assisted_mode'
            WHEN 'standard'         THEN 'limited_auto'
            WHEN 'open'             THEN 'limited_auto'
            WHEN 'sandbox_internal' THEN 'lab_mode'
            ELSE 'read_only'
          END
        )::"agent_connections_permissionLevel_enum_old"
    `);
    await queryRunner.query(
      `DROP TYPE "agent_connections_permissionLevel_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "agent_connections_permissionLevel_enum_old" RENAME TO "agent_connections_permissionLevel_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_connections" ALTER COLUMN "permissionLevel" SET DEFAULT 'read_only'`,
    );
  }
}
