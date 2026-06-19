import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAgentCheckpointRetrySemantics1776400000000 implements MigrationInterface {
  name = 'AddAgentCheckpointRetrySemantics1776400000000';
  transaction = false as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "agent_run_checkpoint_type_enum" ADD VALUE IF NOT EXISTS 'retry'
    `);
    await queryRunner.query(`
      ALTER TYPE "agent_run_checkpoint_status_enum" ADD VALUE IF NOT EXISTS 'retried'
    `);
    await queryRunner.query(`
      ALTER TABLE "agent_run_checkpoints"
      ADD COLUMN IF NOT EXISTS "retryCount" integer NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "agent_run_checkpoints" DROP COLUMN IF EXISTS "retryCount"
    `);
  }
}
