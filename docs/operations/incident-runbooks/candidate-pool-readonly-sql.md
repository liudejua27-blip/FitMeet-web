# Social Agent Candidate Pool SQL

Use these read-only checks against production before and after deploying the candidate pool fix.

```sql
-- 1. 真实用户数
SELECT count(*) FROM users;

-- 2. 社交画像数
SELECT count(*) FROM user_social_profiles;

-- 3. 每个城市画像数
SELECT city, count(*)
FROM user_social_profiles
GROUP BY city
ORDER BY count(*) DESC;

-- 4. 公开意向数
SELECT count(*) FROM public_social_intents;

-- 5. 每个城市公开意向数
SELECT city, count(*)
FROM public_social_intents
GROUP BY city
ORDER BY count(*) DESC;

-- 6. 青岛画像候选
SELECT *
FROM user_social_profiles
WHERE city ILIKE '%青岛%'
   OR "nearbyArea" ILIKE '%青岛%';

-- 7. 青岛公开约练卡片
SELECT id, "userId", title, city, "interestTags", status, "createdAt"
FROM public_social_intents
WHERE city ILIKE '%青岛%'
ORDER BY "createdAt" DESC;
```
