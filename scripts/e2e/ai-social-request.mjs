// FitMeet AI 社交需求链路 E2E 测试
// =================================================================
// 端到端验收下面这条链路（全部走 JWT 用户态，不依赖 Agent Token）：
//
//   用户输入自然语言
//   → DeepSeek 生成需求卡    : POST /api/social-requests/ai-draft
//   → 用户确认发布           : POST /api/social-requests
//   → 创建 user_social_requests
//   → 同步 public_social_intents 大厅
//   → 触发匹配                : POST /api/social-requests/:id/match
//   → 生成 social_request_candidates
//   → 发邀约 / mark-messaged  : POST /api/social-requests/:id/candidates/:cid/mark-messaged
//   → candidate.status = messaged
//   → SocialRequest.status = chatting
//
// 每一步：
//   - HTTP 必须 2xx
//   - 关键库表必须有行
//   - 关键状态必须推进
//   - 失败时 console.error 打印明确原因 + 进程 exit 1
//
// 用法： node scripts/e2e/ai-social-request.mjs
//
// 依赖：
//   - 后端在 http://localhost:3000 起着
//   - docker exec fitness-app-postgres-1 能连 fitness_app 库

import { spawnSync } from 'node:child_process';

const API = process.env.E2E_API || 'http://localhost:3000/api';
const PG_CONTAINER = process.env.E2E_PG_CONTAINER || 'fitness-app-postgres-1';
const PG_USER = process.env.E2E_PG_USER || 'root';
const PG_DB = process.env.E2E_PG_DB || 'fitness_app';

const ts = Date.now();
const A_EMAIL = `e2e-ai-a-${ts}@fitmeet.test`;
const B_EMAIL = `e2e-ai-b-${ts}@fitmeet.test`;
const PASSWORD = 'Password123!';
const RAW_TEXT =
  '本周末在深圳南山区想找个一起练腿和有氧的健身搭子，最好也在科技园附近，女生优先，时间晚上 7 点';

// ── helpers ──────────────────────────────────────────────────────
function log(step, ...args) {
  console.log(`\n\u001b[36m▶ ${step}\u001b[0m`, ...args);
}
function ok(...args) {
  console.log('  \u001b[32m✓\u001b[0m', ...args);
}
function fail(msg, extra) {
  console.error('\n\u001b[31m✗ FAIL:\u001b[0m', msg);
  if (extra !== undefined) console.error(extra);
  process.exit(1);
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function curl(method, path, { token, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const url = `${API}${path}`;
  const init = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);

  let res;
  let txt = '';
  let json = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const start = Date.now();
    res = await fetch(url, init);
    txt = await res.text();
    try {
      json = txt ? JSON.parse(txt) : null;
    } catch {
      json = txt;
    }
    if (res.status === 429) {
      const wait = 15000 + attempt * 5000;
      console.log(`  ⏳ 429 throttled, waiting ${wait}ms (attempt ${attempt + 1})`);
      await sleep(wait);
      continue;
    }
    console.log(`  → ${method} ${path}  ${res.status}  (${Date.now() - start}ms)`);
    if (res.status >= 400) {
      console.error(
        `    body: ${typeof json === 'string' ? json.slice(0, 400) : JSON.stringify(json).slice(0, 600)}`,
      );
    }
    break;
  }
  if (!res || !res.ok) {
    fail(`${method} ${path} → ${res ? res.status : 'no-response'}`, txt);
  }
  return json;
}

function psql(sql) {
  const r = spawnSync(
    'docker',
    ['exec', PG_CONTAINER, 'psql', '-U', PG_USER, '-d', PG_DB, '-A', '-t', '-c', sql],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) fail(`psql failed: ${r.stderr}`, sql);
  return r.stdout.trim();
}

// ── run ──────────────────────────────────────────────────────────
const summary = {};

(async () => {
  // ===========================================================
  // STEP 1 — 注册 + 登录 A，拿 JWT
  // ===========================================================
  log('STEP 1  注册并登录 A（自然语言输入方）');
  await curl('POST', '/auth/register', {
    body: { email: A_EMAIL, password: PASSWORD, name: 'AliceAI E2E' },
  });
  const loginA = await curl('POST', '/auth/login', {
    body: { email: A_EMAIL, password: PASSWORD },
  });
  const tokenA = loginA.access_token || loginA.token || loginA.accessToken;
  const userA = loginA.user;
  if (!tokenA || !userA?.id) fail('A 登录未拿到 token / user.id', loginA);
  ok('A id=', userA.id, ' token=', tokenA.slice(0, 24) + '…');
  summary.userA = userA.id;

  // B 只是为了让匹配能跑出候选
  log('STEP 1.b 注册并登录 B（作为候选目标）');
  await curl('POST', '/auth/register', {
    body: { email: B_EMAIL, password: PASSWORD, name: 'BobAI E2E' },
  });
  const loginB = await curl('POST', '/auth/login', {
    body: { email: B_EMAIL, password: PASSWORD },
  });
  const userB = loginB.user;
  const tokenB = loginB.access_token || loginB.token || loginB.accessToken;
  if (!userB?.id) fail('B 登录未拿到 user.id', loginB);
  ok('B id=', userB.id);
  summary.userB = userB.id;

  // 让 A/B 在同城同坐标里，把历史 e2e 用户挤出 match pool
  log('STEP 1.c 设置 A/B 同城坐标 + 归档历史 e2e 用户');
  await curl('PUT', '/users/me/location', {
    token: tokenA,
    body: { lat: 22.5430, lng: 113.9342, acceptNearbyMatch: true },
  });
  await curl('PUT', '/users/me/location', {
    token: tokenB,
    body: { lat: 22.5440, lng: 113.9352, acceptNearbyMatch: true },
  });
  psql(
    `UPDATE users SET city='深圳' WHERE id IN (${userA.id},${userB.id})`,
  );
  psql(
    `UPDATE users SET city='__archived__', "acceptNearbyMatch"=false
       WHERE email LIKE 'e2e-%@fitmeet.test'
         AND id NOT IN (${userA.id},${userB.id})`,
  );
  ok(
    'cities =',
    psql(
      `SELECT id||'='||city FROM users WHERE id IN (${userA.id},${userB.id}) ORDER BY id`,
    ),
  );

  // ===========================================================
  // STEP 2 — POST /social-requests/ai-draft  (DeepSeek / rule-based)
  // ===========================================================
  log('STEP 2  调用 /social-requests/ai-draft 生成结构化草稿');
  const draftResp = await curl('POST', '/social-requests/ai-draft', {
    token: tokenA,
    body: { rawText: RAW_TEXT },
  });
  const draft = draftResp?.draft;
  if (!draft || !draft.type) {
    fail('ai-draft 返回缺少 draft.type', draftResp);
  }
  ok('mode =', draftResp.mode, ' llmEnabled =', draftResp.llmEnabled);
  ok('draft.type =', draft.type, ' title =', draft.title);
  ok('draft.interestTags =', JSON.stringify(draft.interestTags));
  summary.draftMode = draftResp.mode;

  // ===========================================================
  // STEP 3 — POST /social-requests  用户确认发布 → 创建 user_social_requests
  // ===========================================================
  log('STEP 3  用户确认发布 -> POST /social-requests');
  // 强制带上结构化字段，去掉草稿里可能的非持久化字段
  const createBody = {
    type: draft.type,
    title: draft.title,
    description: draft.description,
    rawText: draft.rawText || RAW_TEXT,
    city: draft.city || '深圳',
    radiusKm: draft.radiusKm || 5,
    interestTags: draft.interestTags || [],
    lat: 22.5430,
    lng: 113.9342,
  };
  const created = await curl('POST', '/social-requests', {
    token: tokenA,
    body: createBody,
  });
  const reqId = created?.id;
  if (!reqId) fail('POST /social-requests 没返回 id', created);
  ok('socialRequestId =', reqId, ' status =', created.status);
  summary.socialRequestId = reqId;

  // ===========================================================
  // STEP 4 — DB 校验 user_social_requests
  // ===========================================================
  log('STEP 4  断言 user_social_requests 已落库');
  const row = psql(
    `SELECT id||'|'||"userId"||'|'||type||'|'||status||'|'||COALESCE(city,'')
       FROM user_social_requests WHERE id=${reqId}`,
  );
  if (!row || !row.includes(`${reqId}|${userA.id}|`)) {
    fail('user_social_requests 没找到该行', row);
  }
  ok('user_social_requests =', row);
  // 默认 create() 把 status 置为 matching
  if (!row.includes('|matching|') && !row.includes('|draft|')) {
    fail('新建后 status 既不是 matching 也不是 draft', row);
  }

  // ===========================================================
  // STEP 5 — DB 校验 public_social_intents 自动同步
  // ===========================================================
  log('STEP 5  断言 public_social_intents 已自动同步');
  // syncPublicIntent 在 create() 末尾被调用；这里给一点点容忍时间
  let intent = '';
  for (let i = 0; i < 5; i++) {
    intent = psql(
      `SELECT id||'|'||COALESCE("linkedSocialRequestId"::text,'-')||'|'||COALESCE(status::text,'-')
         FROM public_social_intents
         WHERE "linkedSocialRequestId"=${reqId}
         LIMIT 1`,
    );
    if (intent) break;
    await sleep(400);
  }
  if (!intent) {
    fail(
      'public_social_intents 没有 linkedSocialRequestId=' +
        reqId +
        ' 的行（大厅同步未发生）',
    );
  }
  ok('public_social_intents =', intent);

  // ===========================================================
  // STEP 6 — POST /social-requests/:id/match  触发匹配
  // ===========================================================
  log('STEP 6  触发匹配 /social-requests/' + reqId + '/match');
  const matched = await curl('POST', `/social-requests/${reqId}/match`, {
    token: tokenA,
    body: { limit: 20 },
  });
  const candList = Array.isArray(matched)
    ? matched
    : matched?.candidates || matched?.items || [];
  ok('returned candidates =', candList.length);

  // ===========================================================
  // STEP 7 — DB 校验 social_request_candidates 生成
  // ===========================================================
  log('STEP 7  断言 social_request_candidates 已生成');
  const candRows = psql(
    `SELECT id||'|'||"candidateUserId"||'|'||status||'|'||score
       FROM social_request_candidates
       WHERE "socialRequestId"=${reqId}
       ORDER BY score DESC`,
  );
  if (!candRows) fail('social_request_candidates 为空');
  console.log('  rows:\n' + candRows.split('\n').map((l) => '    ' + l).join('\n'));

  // 找到指向 B 的那一条
  const lines = candRows.split('\n').filter(Boolean);
  const lineB = lines.find((l) => l.split('|')[1] === String(userB.id));
  if (!lineB) {
    fail('候选列表里没有 B（id=' + userB.id + '），匹配池可能受其它 e2e 数据污染');
  }
  const candidateId = Number(lineB.split('|')[0]);
  ok('candidate(B) id =', candidateId, ' line =', lineB);
  summary.candidateId = candidateId;

  // ===========================================================
  // STEP 8 — 发邀约（用户态等价：mark-messaged）
  //          POST /social-requests/:id/candidates/:cid/mark-messaged
  //          后端会同步把 candidate.status -> messaged，
  //          并把 user_social_requests.status -> chatting
  // ===========================================================
  log('STEP 8  发送邀约 -> mark-messaged');
  const inviteResp = await curl(
    'POST',
    `/social-requests/${reqId}/candidates/${candidateId}/mark-messaged`,
    { token: tokenA },
  );
  ok('mark-messaged resp =', JSON.stringify(inviteResp).slice(0, 300));

  // ===========================================================
  // STEP 9 — DB 校验 candidate.status = messaged
  // ===========================================================
  log('STEP 9  断言 candidate.status = messaged');
  const candStatus = psql(
    `SELECT status FROM social_request_candidates WHERE id=${candidateId}`,
  );
  if (candStatus !== 'messaged') {
    fail(`candidate.status 仍为 "${candStatus}"，预期 messaged`);
  }
  ok('candidate.status =', candStatus);

  // ===========================================================
  // STEP 10 — DB 校验 socialRequest.status = chatting
  // ===========================================================
  log('STEP 10  断言 user_social_requests.status = chatting');
  const reqStatus = psql(
    `SELECT status FROM user_social_requests WHERE id=${reqId}`,
  );
  if (reqStatus !== 'chatting') {
    fail(`user_social_requests.status 仍为 "${reqStatus}"，预期 chatting`);
  }
  ok('user_social_requests.status =', reqStatus);

  // ===========================================================
  // BONUS — agent_action_logs 是否有审计行（不致命，仅 warn）
  // ===========================================================
  log('BONUS  检查 agent_action_logs 是否有该 request 的审计');
  const logCount = psql(
    `SELECT COUNT(*) FROM agent_action_logs
       WHERE "relatedSocialRequestId"=${reqId}`,
  );
  if (Number(logCount) === 0) {
    console.warn(
      '  \u001b[33m! WARN\u001b[0m agent_action_logs 没有该 request 的审计行（用户态直走不一定写）',
    );
  } else {
    ok('agent_action_logs rows =', logCount);
  }

  // ===========================================================
  // 完成
  // ===========================================================
  console.log('\n\u001b[32m═══ ALL PASS ═══\u001b[0m');
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
})().catch((e) => {
  console.error('\n\u001b[31m✗ UNCAUGHT:\u001b[0m', e);
  process.exit(1);
});
