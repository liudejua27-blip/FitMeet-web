import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignAgentAutonomyModes1772000000000
  implements MigrationInterface
{
  name = 'AlignAgentAutonomyModes1772000000000';
  transaction = false as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const value of ['assisted', 'normal', 'open']) {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_settings_mode_enum') THEN
            IF NOT EXISTS (
              SELECT 1
              FROM pg_enum e
              JOIN pg_type t ON t.oid = e.enumtypid
              WHERE t.typname = 'agent_settings_mode_enum'
                AND e.enumlabel = '${value}'
            ) THEN
              ALTER TYPE "agent_settings_mode_enum" ADD VALUE '${value}';
            END IF;
          END IF;
        END $$;
      `);
    }

    await queryRunner.query(
      `ALTER TABLE "agent_settings" ALTER COLUMN "mode" SET DEFAULT 'assisted'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "agent_settings" ALTER COLUMN "mode" SET DEFAULT 'basic'`,
    );
  }
}
