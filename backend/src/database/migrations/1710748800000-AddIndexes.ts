import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIndexes1710748800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 用户表索引
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users" ("email")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_users_phone" ON "users" ("phone")`,
    );

    // 帖子表索引
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_posts_user_id" ON "posts" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_posts_created_at" ON "posts" ("createdAt" DESC)`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'posts'
            AND column_name = 'categoryId'
        ) THEN
          CREATE INDEX IF NOT EXISTS "idx_posts_category_created"
          ON "posts" ("categoryId", "createdAt" DESC);
        END IF;
      END $$;
    `);

    // 活动表索引
    await this.createIndexIfColumnsExist(
      queryRunner,
      'meets',
      'idx_meets_date',
      ['date'],
    );
    await this.createIndexIfColumnsExist(
      queryRunner,
      'meets',
      'idx_meets_type_date',
      ['type', 'date'],
    );
    await this.createIndexIfColumnsExist(
      queryRunner,
      'meets',
      'idx_meets_creator_id',
      ['creatorId'],
    );

    // 评论表索引
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_comments_post_id" ON "comments" ("postId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_comments_user_id" ON "comments" ("userId")`,
    );

    // 关注表索引
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_follows_follower_id" ON "follows" ("followerId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_follows_following_id" ON "follows" ("followingId")`,
    );

    // 点赞表索引
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_post_likes_post_id" ON "post_likes" ("postId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_post_likes_user_id" ON "post_likes" ("userId")`,
    );

    // 活动参与者索引
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_meet_participants_meet_id" ON "meet_participants" ("meetId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_meet_participants_user_id" ON "meet_participants" ("userId")`,
    );
  }

  private async createIndexIfColumnsExist(
    queryRunner: QueryRunner,
    tableName: string,
    indexName: string,
    columns: string[],
  ): Promise<void> {
    const quotedColumns = columns.map((column) => `"${column}"`).join(', ');
    const columnList = columns.map((column) => `'${column}'`).join(', ');

    await queryRunner.query(`
      DO $$
      BEGIN
        IF (
          SELECT COUNT(*)
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = '${tableName}'
            AND column_name IN (${columnList})
        ) = ${columns.length} THEN
          CREATE INDEX IF NOT EXISTS "${indexName}"
          ON "${tableName}" (${quotedColumns});
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_email"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_phone"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_posts_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_posts_created_at"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_posts_category_created"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_meets_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_meets_type_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_meets_creator_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_comments_post_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_comments_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_follows_follower_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_follows_following_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_post_likes_post_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_post_likes_user_id"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_meet_participants_meet_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_meet_participants_user_id"`,
    );
  }
}
