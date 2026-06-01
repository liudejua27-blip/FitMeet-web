import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLifeGraphSignalMetadata1774200000000 implements MigrationInterface {
  name = 'AddLifeGraphSignalMetadata1774200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "life_graph_fields" ADD COLUMN IF NOT EXISTS "signalType" varchar(40) NOT NULL DEFAULT 'core_signal'`,
    );
    await queryRunner.query(
      `ALTER TABLE "life_graph_fields" ADD COLUMN IF NOT EXISTS "visibleInRecommendationReason" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "life_graph_fields" ADD COLUMN IF NOT EXISTS "userCanDisableForMatching" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "life_graph_fields" ADD COLUMN IF NOT EXISTS "enabledForMatching" boolean NOT NULL DEFAULT true`,
    );

    await queryRunner.query(`
      UPDATE "life_graph_fields"
      SET
        "signalType" = CASE
          WHEN "fieldKey" IN ('zodiac', 'zodiacSign', 'birthdayPersonality', 'mysticInterestTags', 'fortuneInterestTags', 'astrologyInterestTags')
            THEN 'entertainment_signal'
          WHEN "fieldKey" = 'mbti'
            THEN 'weak_signal'
          WHEN "fieldKey" IN ('birthDate', 'preciseLocationSharing', 'healthDataEnabled', 'periodCycleEnabled', 'contactSharing', 'paymentBoundary', 'paymentAutoExecution')
            THEN 'sensitive_signal'
          ELSE "signalType"
        END,
        "visibleInRecommendationReason" = CASE
          WHEN "fieldKey" IN ('zodiac', 'zodiacSign', 'mbti', 'birthdayPersonality', 'mysticInterestTags', 'fortuneInterestTags', 'astrologyInterestTags', 'birthDate', 'preciseLocationSharing', 'healthDataEnabled', 'periodCycleEnabled', 'contactSharing', 'paymentBoundary', 'paymentAutoExecution')
            THEN false
          ELSE "visibleInRecommendationReason"
        END,
        "userCanDisableForMatching" = CASE
          WHEN "fieldKey" IN ('zodiac', 'zodiacSign', 'mbti', 'birthdayPersonality', 'mysticInterestTags', 'fortuneInterestTags', 'astrologyInterestTags')
            THEN true
          ELSE "userCanDisableForMatching"
        END,
        "enabledForMatching" = CASE
          WHEN "fieldKey" IN ('birthDate', 'preciseLocationSharing', 'healthDataEnabled', 'periodCycleEnabled', 'contactSharing', 'paymentBoundary', 'paymentAutoExecution')
            THEN false
          ELSE "enabledForMatching"
        END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "life_graph_fields" DROP COLUMN IF EXISTS "enabledForMatching"`,
    );
    await queryRunner.query(
      `ALTER TABLE "life_graph_fields" DROP COLUMN IF EXISTS "userCanDisableForMatching"`,
    );
    await queryRunner.query(
      `ALTER TABLE "life_graph_fields" DROP COLUMN IF EXISTS "visibleInRecommendationReason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "life_graph_fields" DROP COLUMN IF EXISTS "signalType"`,
    );
  }
}
