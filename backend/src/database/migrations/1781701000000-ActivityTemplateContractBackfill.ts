import { MigrationInterface, QueryRunner } from 'typeorm';

export class ActivityTemplateContractBackfill1781701000000 implements MigrationInterface {
  name = 'ActivityTemplateContractBackfill1781701000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "activity_templates"
      ADD COLUMN IF NOT EXISTS "safetyLevel" varchar NOT NULL DEFAULT 'low'
    `);
    await queryRunner.query(`
      ALTER TABLE "activity_templates"
      ADD COLUMN IF NOT EXISTS "defaultProofPolicy" varchar NOT NULL DEFAULT 'mutual_or_proof'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "activity_templates"
      DROP COLUMN IF EXISTS "defaultProofPolicy"
    `);
    await queryRunner.query(`
      ALTER TABLE "activity_templates"
      DROP COLUMN IF EXISTS "safetyLevel"
    `);
  }
}
