import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 创建 `user_social_profiles` 表，承载 AI 社交助手用到的用户画像。
 *
 * 1:1 关系，`userId` 同时作为主键和指向 `users(id)` 的外键。
 */
export class AddUserSocialProfile1771800000000 implements MigrationInterface {
  name = 'AddUserSocialProfile1771800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_social_profiles" (
        "userId" integer PRIMARY KEY,
        "gender" varchar(20) NOT NULL DEFAULT '',
        "ageRange" varchar(20) NOT NULL DEFAULT '',
        "city" varchar(80) NOT NULL DEFAULT '',
        "nearbyArea" varchar(120) NOT NULL DEFAULT '',
        "fitnessGoals" text NOT NULL DEFAULT '',
        "interestTags" text NOT NULL DEFAULT '',
        "availableTimes" text NOT NULL DEFAULT '',
        "socialPreference" varchar(500) NOT NULL DEFAULT '',
        "rejectRules" varchar(500) NOT NULL DEFAULT '',
        "privacyBoundary" varchar(500) NOT NULL DEFAULT '',
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_user_social_profiles_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_social_profiles"`);
  }
}
