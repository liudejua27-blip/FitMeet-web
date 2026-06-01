import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Aligns the `agent_approval_requests` table + enums with the current
 * `AgentApprovalRequest` entity (post AgentApprovalDispatcher rollout).
 *
 * Drift compared to 1770800000000:
 *   - `agent_approval_requests_type_enum` only had 3 values; the entity now
 *     has 16. Postgres requires `ALTER TYPE ... ADD VALUE` (one at a time,
 *     non-transactional) — wrapped in DO blocks for idempotency.
 *   - New enum: `agent_approval_requests_riskLevel_enum`.
 *   - New columns: `skillName`, `summary`, `riskLevel`.
 *
 * NOTE on `ALTER TYPE ADD VALUE`:
 *   - Cannot run inside a transaction block in PG <12. TypeORM's migration
 *     runner DOES wrap each migration in a transaction by default; we
 *     override that with `transaction = false`. Each ADD VALUE is also
 *     guarded with a `NOT EXISTS` check so the migration is replay-safe.
 */
export class AlignAgentApprovalRequests1771400000000 implements MigrationInterface {
  name = 'AlignAgentApprovalRequests1771400000000';
  /**
   * `ALTER TYPE ... ADD VALUE` cannot run inside a transaction in older
   * Postgres versions. Disable TypeORM's per-migration transaction so the
   * statements are committed individually.
   */
  transaction = false as const;

  /** Values to ensure exist on `agent_approval_requests_type_enum`. */
  private static readonly TYPE_VALUES = [
    'send_message',
    'first_message',
    'post_publish',
    'contact_request',
    'contact_exchange',
    'create_activity',
    'join_activity',
    'offline_meeting',
    'share_location',
    'photo_upload',
    'submit_completion_proof',
    'night_activity',
    'alcohol_activity',
    'payment',
    'unknown_risk',
    'custom',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Idempotently extend the type enum. We can't use plain
    //    `ALTER TYPE ... ADD VALUE IF NOT EXISTS` (only PG 9.6+ supports it,
    //    but `IF NOT EXISTS` is supported since 9.6 — we still wrap in a
    //    pg_enum lookup to stay safe and to show what's happening).
    for (const value of AlignAgentApprovalRequests1771400000000.TYPE_VALUES) {
      await queryRunner.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_enum e
              JOIN pg_type t ON t.oid = e.enumtypid
              WHERE t.typname = 'agent_approval_requests_type_enum'
                AND e.enumlabel = '${value}'
          ) THEN
            EXECUTE 'ALTER TYPE "agent_approval_requests_type_enum" ADD VALUE ''${value}''';
          END IF;
        END $$;
      `);
    }

    // 2) Create the new riskLevel enum.
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_approval_requests_riskLevel_enum" AS ENUM ('low', 'medium', 'high');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    // 3) Add the new columns. `IF NOT EXISTS` keeps it replay-safe.
    await queryRunner.query(
      `ALTER TABLE "agent_approval_requests" ADD COLUMN IF NOT EXISTS "skillName" varchar(64) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_approval_requests" ADD COLUMN IF NOT EXISTS "summary" varchar(500) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_approval_requests" ADD COLUMN IF NOT EXISTS "riskLevel" "agent_approval_requests_riskLevel_enum" NOT NULL DEFAULT 'medium'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop new columns. We do NOT roll back the enum value additions —
    // Postgres has no first-class `DROP VALUE` and rebuilding the enum
    // would risk data loss in production. Document and accept the
    // forward-only contract.
    await queryRunner.query(
      `ALTER TABLE "agent_approval_requests" DROP COLUMN IF EXISTS "riskLevel"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_approval_requests" DROP COLUMN IF EXISTS "summary"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_approval_requests" DROP COLUMN IF EXISTS "skillName"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "agent_approval_requests_riskLevel_enum"`,
    );
    // Intentionally not reverting `ALTER TYPE ... ADD VALUE`. See note above.
  }
}
