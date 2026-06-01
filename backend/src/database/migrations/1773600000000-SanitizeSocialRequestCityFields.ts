import { MigrationInterface, QueryRunner } from 'typeorm';

export class SanitizeSocialRequestCityFields1773600000000 implements MigrationInterface {
  name = 'SanitizeSocialRequestCityFields1773600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const cityPattern =
      '(北京|上海|广州|深圳|杭州|成都|重庆|南京|苏州|武汉|西安|长沙|郑州|天津|青岛|济南|厦门|福州|宁波|大连|沈阳|合肥|昆明|佛山|东莞|无锡|珠海|中山|惠州|南昌|南宁|贵阳|太原|石家庄|哈尔滨|长春|兰州|海口|三亚|呼和浩特|乌鲁木齐|拉萨|银川|西宁|香港|澳门|台北)';
    const abnormalPattern =
      '(城市是哪里|城市在哪里|在哪个城市|城市是哪|优先匹配|优先找|匹配城市|目标城市|所在城市|常驻城市|城市|地区|地点|位置|哪里|哪儿|哪座|附近|公开地点|低压力)';

    await queryRunner.query(
      `
      DO $$
      BEGIN
        IF to_regclass('public.public_social_intents') IS NOT NULL THEN
          EXECUTE $SQL$
            WITH fixed AS (
              SELECT
                id,
                COALESCE((regexp_match(city, '${cityPattern}'))[1], '') AS clean_city
              FROM public_social_intents
              WHERE city IS NOT NULL
                AND city <> ''
                AND city ~ '${abnormalPattern}'
            )
            UPDATE public_social_intents target
            SET city = fixed.clean_city
            FROM fixed
            WHERE target.id = fixed.id
              AND target.city IS DISTINCT FROM fixed.clean_city
          $SQL$;
        END IF;
      END $$;
      `,
    );

    await queryRunner.query(
      `
      DO $$
      BEGIN
        IF to_regclass('public.social_requests') IS NOT NULL THEN
          EXECUTE $SQL$
            WITH fixed AS (
              SELECT
                id,
                COALESCE((regexp_match(city, '${cityPattern}'))[1], '') AS clean_city
              FROM social_requests
              WHERE city IS NOT NULL
                AND city <> ''
                AND city ~ '${abnormalPattern}'
            )
            UPDATE social_requests target
            SET city = fixed.clean_city
            FROM fixed
            WHERE target.id = fixed.id
              AND target.city IS DISTINCT FROM fixed.clean_city
          $SQL$;
        END IF;
      END $$;
      `,
    );
  }

  public async down(): Promise<void> {
    // Data cleaning is intentionally not reversible.
  }
}
