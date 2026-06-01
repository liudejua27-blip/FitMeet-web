import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Baseline for the tables that pre-date the explicit migration chain.
 *
 * The next migration (1710748800000-AddIndexes) assumes these core tables
 * already exist because older deployments used TypeORM synchronize. Keep this
 * baseline intentionally limited to the pre-existing schema surface; later
 * migrations still add geo fields, clubs, agent tables, AI profile columns, and
 * trust-loop fields in their historical order.
 */
export class InitialSchemaBaseline1700000000000 implements MigrationInterface {
  name = 'InitialSchemaBaseline1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" SERIAL PRIMARY KEY,
        "email" varchar NOT NULL UNIQUE,
        "password" varchar NOT NULL,
        "phone" varchar UNIQUE,
        "wechatOpenId" varchar,
        "name" varchar NOT NULL,
        "avatar" varchar NOT NULL DEFAULT '',
        "color" varchar NOT NULL DEFAULT '#C8FF00',
        "gender" varchar NOT NULL DEFAULT '',
        "age" integer NOT NULL DEFAULT 0,
        "city" varchar NOT NULL DEFAULT '',
        "gym" varchar NOT NULL DEFAULT '',
        "bio" text NOT NULL DEFAULT '',
        "coverUrl" varchar,
        "singleCert" boolean NOT NULL DEFAULT false,
        "verified" boolean NOT NULL DEFAULT false,
        "interestTags" text NOT NULL DEFAULT '',
        "trainingDays" integer NOT NULL DEFAULT 0,
        "trainingCount" integer NOT NULL DEFAULT 0,
        "caloriesBurned" integer NOT NULL DEFAULT 0,
        "bestRecords" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "isCoach" boolean NOT NULL DEFAULT false,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "categories" (
        "id" varchar PRIMARY KEY,
        "label" varchar NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "posts" (
        "id" SERIAL PRIMARY KEY,
        "type" varchar NOT NULL,
        "sport" varchar NOT NULL,
        "title" varchar,
        "emoji" varchar NOT NULL DEFAULT '',
        "text" text NOT NULL,
        "tags" text NOT NULL DEFAULT '',
        "images" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "videoUrl" varchar,
        "level" varchar,
        "slots" varchar,
        "dist" varchar NOT NULL DEFAULT '',
        "likesCount" integer NOT NULL DEFAULT 0,
        "commentsCount" integer NOT NULL DEFAULT 0,
        "viewCount" integer NOT NULL DEFAULT 0,
        "userId" integer NOT NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "comments" (
        "id" SERIAL PRIMARY KEY,
        "text" text NOT NULL,
        "likesCount" integer NOT NULL DEFAULT 0,
        "userId" integer NOT NULL,
        "postId" integer NOT NULL,
        "createdAt" timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "follows" (
        "id" SERIAL PRIMARY KEY,
        "followerId" integer NOT NULL,
        "followingId" integer NOT NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_follows_follower_following"
          UNIQUE ("followerId", "followingId")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "post_likes" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL,
        "postId" integer NOT NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_post_likes_user_post" UNIQUE ("userId", "postId")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "post_saves" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL,
        "postId" integer NOT NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_post_saves_user_post" UNIQUE ("userId", "postId")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "coaches" (
        "id" SERIAL PRIMARY KEY,
        "specialty" varchar NOT NULL,
        "experience" varchar NOT NULL,
        "tags" text NOT NULL DEFAULT '',
        "specialtyCode" varchar NOT NULL,
        "rating" numeric(3,1) NOT NULL DEFAULT 0,
        "reviewCount" integer NOT NULL DEFAULT 0,
        "students" integer NOT NULL DEFAULT 0,
        "sessions" integer NOT NULL DEFAULT 0,
        "price" integer NOT NULL DEFAULT 0,
        "unit" varchar NOT NULL DEFAULT '/ 节',
        "cert" boolean NOT NULL DEFAULT false,
        "desc" text NOT NULL DEFAULT '',
        "cover" varchar NOT NULL DEFAULT '',
        "coverBg" varchar NOT NULL DEFAULT '',
        "works" text NOT NULL DEFAULT '',
        "coachCerts" text NOT NULL DEFAULT '',
        "income" integer NOT NULL DEFAULT 0,
        "userId" integer NOT NULL UNIQUE,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reviews" (
        "id" SERIAL PRIMARY KEY,
        "rating" numeric(2,1) NOT NULL,
        "text" text NOT NULL,
        "tags" text NOT NULL DEFAULT '',
        "userId" integer NOT NULL,
        "coachId" integer NOT NULL,
        "createdAt" timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "meets" (
        "id" SERIAL PRIMARY KEY,
        "title" varchar NOT NULL,
        "type" varchar NOT NULL,
        "sport" varchar NOT NULL,
        "time" varchar NOT NULL,
        "loc" varchar NOT NULL,
        "dist" varchar NOT NULL DEFAULT '',
        "price" varchar NOT NULL DEFAULT '免费',
        "slots" integer NOT NULL DEFAULT 0,
        "maxSlots" integer NOT NULL DEFAULT 4,
        "level" varchar NOT NULL DEFAULT '全部',
        "desc" text NOT NULL DEFAULT '',
        "feeType" varchar,
        "groupType" varchar,
        "creatorType" varchar,
        "status" varchar NOT NULL DEFAULT 'pending',
        "rating" numeric(3,1) NOT NULL DEFAULT 0,
        "meetCount" integer NOT NULL DEFAULT 0,
        "userId" integer NOT NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "meet_participants" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL,
        "meetId" integer NOT NULL,
        "status" varchar NOT NULL DEFAULT 'pending',
        "createdAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_meet_participants_user_meet"
          UNIQUE ("userId", "meetId")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "activity_templates" (
        "id" SERIAL PRIMARY KEY,
        "type" varchar NOT NULL UNIQUE,
        "title" varchar(200) NOT NULL,
        "description" text NOT NULL DEFAULT '',
        "defaultDurationMinutes" integer NOT NULL DEFAULT 30,
        "defaultIcebreakers" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "proofOptions" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "safetyTips" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "safetyLevel" varchar NOT NULL DEFAULT 'low',
        "defaultProofPolicy" varchar NOT NULL DEFAULT 'mutual_or_proof',
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social_activities" (
        "id" SERIAL PRIMARY KEY,
        "creatorId" integer NOT NULL,
        "participantIds" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "socialRequestId" integer,
        "matchedCandidateId" integer,
        "type" varchar NOT NULL DEFAULT 'custom',
        "title" varchar(200) NOT NULL DEFAULT '',
        "description" text NOT NULL DEFAULT '',
        "locationName" varchar(200) NOT NULL DEFAULT '',
        "city" varchar(100) NOT NULL DEFAULT '',
        "lat" double precision,
        "lng" double precision,
        "startTime" timestamp,
        "endTime" timestamp,
        "status" varchar NOT NULL DEFAULT 'draft',
        "icebreakerTasks" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "safetyTips" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "proofRequired" boolean NOT NULL DEFAULT true,
        "proofPolicy" varchar NOT NULL DEFAULT 'mutual_or_proof',
        "safetyLevel" varchar NOT NULL DEFAULT 'low',
        "checkinByUserId" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "confirmByUserId" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "activity_proofs" (
        "id" SERIAL PRIMARY KEY,
        "activityId" integer NOT NULL,
        "userId" integer NOT NULL,
        "proofType" varchar NOT NULL,
        "photoUrl" varchar(500),
        "note" varchar(500) NOT NULL DEFAULT '',
        "locationApprox" varchar(200) NOT NULL DEFAULT '',
        "status" varchar NOT NULL DEFAULT 'pending',
        "privacyMode" varchar NOT NULL DEFAULT 'scene_only',
        "createdAt" timestamp NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "activity_proofs" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "social_activities" CASCADE`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "activity_templates" CASCADE`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "meet_participants" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "meets" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reviews" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "coaches" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "post_saves" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "post_likes" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "follows" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "comments" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "posts" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "categories" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users" CASCADE`);
  }
}
