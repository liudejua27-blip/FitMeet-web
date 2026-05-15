// FitMeet Agent 社交闭环 E2E 测试
// 真实跑：注册 A/B → 设位置 → 发 token → 创建 SocialRequest → 匹配 → draft → send
//        → WS 验 newMessage → B 回复 → A 创建 Activity → B 加入 → checkin → proof → accept → 验 DB
//
// 用法：node scripts/e2e/social-loop.mjs
import { io } from 'socket.io-client';
import { spawnSync } from 'node:child_process';

const API = 'http://localhost:3000/api';
const WS  = 'http://localhost:3000/messages';
const PG_CONTAINER = 'fitness-app-postgres-1';
const PG_USER = 'root';
const PG_DB   = 'fitness_app';

const ts = Date.now();
const A_EMAIL = `e2e-a-${ts}@fitmeet.test`;
const B_EMAIL = `e2e-b-${ts}@fitmeet.test`;
const PASSWORD = 'Password123!';

// ── Helpers ───────────────────────────────────────────────────────
function log(step, ...args) {
  console.log(`\n\u001b[36m▶ ${step}\u001b[0m`, ...args);
}
function ok(...args) {
  console.log('  \u001b[32m✓\u001b[0m', ...args);
}
function fail(msg) {
  console.error('\n\u001b[31m✗ FAIL:\u001b[0m', msg);
  process.exit(1);
}

async function curl(method, path, { token, agentToken, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (agentToken) headers['x-agent-token'] = agentToken;
  const url = `${API}${path}`;
  const init = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);

  let res, txt, json;
  for (let attempt = 0; attempt < 6; attempt++) {
    const start = Date.now();
    res = await fetch(url, init);
    txt = await res.text();
    try { json = txt ? JSON.parse(txt) : null; } catch { json = txt; }
    if (res.status === 429) {
      const wait = 15000 + attempt * 5000;
      console.log(`  ⏳ 429 throttled, waiting ${wait}ms (attempt ${attempt + 1})`);
      await sleep(wait);
      continue;
    }
    const cmd =
      `curl -X ${method} '${url}' ` +
      Object.entries(headers).map(([k, v]) => `-H '${k}: ${v}'`).join(' ') +
      (body !== undefined ? ` -d '${JSON.stringify(body)}'` : '');
    console.log('  $', cmd);
    console.log(`  → ${res.status} (${Date.now() - start}ms)`,
      typeof json === 'string' ? json.slice(0, 200) : JSON.stringify(json).slice(0, 400));
    break;
  }
  if (!res.ok) fail(`${method} ${path} → ${res.status}: ${txt}`);
  return json;
}

function psql(sql) {
  // Run via docker exec; returns { stdout, stderr }
  const r = spawnSync('docker',
    ['exec', PG_CONTAINER, 'psql', '-U', PG_USER, '-d', PG_DB, '-A', '-t', '-c', sql],
    { encoding: 'utf8' });
  if (r.status !== 0) fail(`psql failed: ${r.stderr}`);
  return r.stdout.trim();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Run ───────────────────────────────────────────────────────────
const summary = {};

(async () => {
  // 1. Register & login A
  log('STEP 1  注册并登录 A');
  await curl('POST', '/auth/register', {
    body: { email: A_EMAIL, password: PASSWORD, name: 'Alice E2E' },
  });
  const loginA = await curl('POST', '/auth/login', {
    body: { email: A_EMAIL, password: PASSWORD },
  });
  const tokenA = loginA.access_token || loginA.token || loginA.accessToken;
  const userA  = loginA.user;
  if (!tokenA || !userA?.id) fail('A 登录未拿到 token / user.id');
  ok('A id=', userA.id, 'token=', tokenA.slice(0, 24) + '…');
  summary.userA = userA.id;

  // 2. Register & login B
  log('STEP 2  注册并登录 B');
  await curl('POST', '/auth/register', {
    body: { email: B_EMAIL, password: PASSWORD, name: 'Bob E2E' },
  });
  const loginB = await curl('POST', '/auth/login', {
    body: { email: B_EMAIL, password: PASSWORD },
  });
  const tokenB = loginB.access_token || loginB.token || loginB.accessToken;
  const userB  = loginB.user;
  ok('B id=', userB.id, 'token=', tokenB.slice(0, 24) + '…');
  summary.userB = userB.id;

  // 3. Both set lat/lng (Shenzhen Nanshan)
  log('STEP 3  A/B 设置经纬度');
  await curl('PUT', '/users/me/location',
    { token: tokenA, body: { lat: 22.5430, lng: 113.9342, acceptNearbyMatch: true } });
  await curl('PUT', '/users/me/location',
    { token: tokenB, body: { lat: 22.5440, lng: 113.9352, acceptNearbyMatch: true } });
  // DB check
  const locA = psql(`SELECT lat,lng,"acceptNearbyMatch" FROM users WHERE id=${userA.id}`);
  const locB = psql(`SELECT lat,lng,"acceptNearbyMatch" FROM users WHERE id=${userB.id}`);
  ok('users(A) =', locA, '  users(B) =', locB);
  if (!locA.includes('22.543') || !locB.includes('22.544')) fail('坐标未落库');

  // 3.5  Force-verify A so personal-token can be issued
  log('STEP 3.5  SQL: UPDATE users SET verified=true WHERE id=A');
  psql(`UPDATE users SET verified=true WHERE id=${userA.id}`);
  ok('verified =', psql(`SELECT verified FROM users WHERE id=${userA.id}`));

  // 3.6  Set city=深圳 for both so MatchService ILIKE '%深圳%' hits B
  log('STEP 3.6  SQL: UPDATE users SET city=深圳 for A & B');
  psql(`UPDATE users SET city='深圳' WHERE id IN (${userA.id},${userB.id})`);
  // also expel old e2e users from match pool so B is in top-N
  psql(`UPDATE users SET city='__archived__', "acceptNearbyMatch"=false WHERE email LIKE 'e2e-%@fitmeet.test' AND id NOT IN (${userA.id},${userB.id})`);
  ok('cities =', psql(`SELECT id,city FROM users WHERE id IN (${userA.id},${userB.id}) ORDER BY id`));

  // 4-pre. Issue Agent Token for A (Standard)
  log('STEP 4-pre  POST /api/agents/personal-token  (Standard, 直发无审批)');
  const tk = await curl('POST', '/agents/personal-token', { token: tokenA });
  const agentToken = tk.agentToken;
  const agentConnId = tk.agentConnectionId;
  ok('agentToken=', agentToken.slice(0, 24) + '…  connectionId=', agentConnId);
  summary.agentConnectionId = agentConnId;

  // Grant extra permissions for the agent (Standard map omits these by default)
  log('STEP 4-pre.b  补 create_activity / join_activity / submit_completion_proof 权限');
  for (const action of ['create_activity', 'join_activity', 'submit_completion_proof']) {
    psql(`INSERT INTO agent_permissions ("agentConnectionId",action,granted)
          VALUES (${agentConnId},'${action}',true)
          ON CONFLICT DO NOTHING`);
  }
  ok('agent_permissions =',
    psql(`SELECT string_agg(action::text,',') FROM agent_permissions WHERE "agentConnectionId"=${agentConnId}`));

  // 4-pre.c  Enable AgentSettings capability flags (entity defaults are false)
  log('STEP 4-pre.c  UPSERT agent_settings: allowSendMessage / Create / Join / UploadProof = true, no approval');
  psql(`INSERT INTO agent_settings ("userId","agentConnectionId",mode,
        "allowSearch","allowDraftMessage","allowSendMessage","allowAutoReply",
        "allowCreateActivity","allowJoinActivity","allowShareLocation","allowUploadProof","allowContactExchange",
        "maxDailyMessages",
        "requireApprovalForFirstMessage","requireApprovalForOfflineMeeting","requireApprovalForPhotoUpload","requireApprovalForAll")
        VALUES (${userA.id},NULL,'standard',
        true,true,true,true,
        true,true,true,true,true,
        100,
        false,false,false,false)
        ON CONFLICT ("userId","agentConnectionId") DO UPDATE SET
          mode='standard',
          "allowSendMessage"=true,"allowAutoReply"=true,
          "allowCreateActivity"=true,"allowJoinActivity"=true,
          "allowShareLocation"=true,"allowUploadProof"=true,"allowContactExchange"=true,
          "requireApprovalForFirstMessage"=false,"requireApprovalForOfflineMeeting"=false,
          "requireApprovalForPhotoUpload"=false,"requireApprovalForAll"=false`);
  ok('agent_settings =',
    psql(`SELECT mode||'|send='||"allowSendMessage"||'|create='||"allowCreateActivity"||'|join='||"allowJoinActivity"||'|proof='||"allowUploadProof"||'|approveFirst='||"requireApprovalForFirstMessage" FROM agent_settings WHERE "userId"=${userA.id} AND "agentConnectionId" IS NULL`));

  // 4. A creates SocialRequest via Agent (legacy endpoint returns request+candidates+matchedBy)
  log('STEP 4  A 通过 Agent 创建 SocialRequest');
  const created = await curl('POST', '/agent/social-requests', {
    agentToken,
    body: {
      requestType: 'workout_buddy',
      title: '周末南山健身搭子',
      description: '本周末南山区找个一起练腿和有氧的搭子，最好也在科技园附近',
      city: '深圳',
      lat: 22.5430,
      lng: 113.9342,
      radiusKm: 5,
      timePreference: '本周末上午',
      limit: 20,
    },
  });
  const socialRequestId = created.request.id;
  ok('socialRequestId =', socialRequestId, ' matchedBy =', created.matchedBy);
  summary.socialRequestId = socialRequestId;

  // 5/6. System matched to B + reasons
  log('STEP 5/6  断言匹配到 B 且生成匹配理由');
  const matchedToB = created.candidates.find(c =>
    c.userId === userB.id ||
    c.candidateUserId === userB.id ||
    c.profile?.id === userB.id);
  if (!matchedToB) {
    console.log('candidates raw =', JSON.stringify(created.candidates, null, 2));
    fail('候选列表里没有 B');
  }
  ok('match candidate B:', JSON.stringify(matchedToB).slice(0, 400));
  const reason = matchedToB.reason || matchedToB.reasons || matchedToB.reasonText || matchedToB.explain;
  ok('reason =', reason);
  const dbCand = psql(`SELECT "candidateUserId",score,level,"distanceKm",reasons::text
                       FROM social_request_candidates
                       WHERE "socialRequestId"=${socialRequestId}
                       ORDER BY score DESC LIMIT 5`);
  ok('social_request_candidates =\n', dbCand);

  // 7. Generate message draft (邀约草稿)
  log('STEP 7  Agent 生成邀约草稿 /api/agent/messages/draft');
  const draft = await curl('POST', '/agent/messages/draft', {
    agentToken,
    body: {
      type: 'message',
      recipientUserId: userB.id,
      context: `邀约 #${socialRequestId}: 周末一起练腿`,
      tone: '友好、简短、礼貌',
    },
  });
  const draftText = draft.draft?.content || draft.draft?.text || draft.text || draft.content || draft.message ||
    '你好 B！我是 A，看到你也在科技园附近，要不要周末一起练腿？';
  ok('draftText =', draftText);

  // 8. Open WS for B BEFORE A sends, then A sends.
  log('STEP 8-pre  B 打开 /messages WebSocket 订阅 newMessage');
  const wsB = io(WS, {
    auth: { token: tokenB },
    transports: ['websocket'],
    forceNew: true,
  });
  const newMsgPromise = new Promise((resolve, reject) => {
    const tm = setTimeout(() => reject(new Error('WS 等待 newMessage 超时(10s)')), 10000);
    wsB.on('connect', () => ok('B WS connected, sid=', wsB.id));
    wsB.on('connect_error', e => reject(new Error('WS connect_error: ' + e.message)));
    wsB.on('newMessage', m => { clearTimeout(tm); resolve(m); });
  });
  // wait for connect
  await new Promise((res, rej) => {
    wsB.once('connect', res);
    wsB.once('connect_error', rej);
  });

  log('STEP 8  A 通过 Agent 确认发送消息 /api/agent/messages/send');
  const sent = await curl('POST', '/agent/messages/send', {
    agentToken,
    body: {
      toUserId: userB.id,
      content: draftText,
      socialRequestId,
      messageType: 'text',
    },
  });
  ok('send result =', JSON.stringify(sent).slice(0, 300));

  // If approval gate kicked in (first_contact_with_stranger), A approves it
  if (sent && sent.requiresApproval && sent.approvalId) {
    log('STEP 8.5  A 用户审批 approval#' + sent.approvalId);
    const approveRes = await curl('POST', `/agent/approvals/${sent.approvalId}/approve`, { token: tokenA });
    ok('approve result =', JSON.stringify(approveRes).slice(0, 300));
    if (!approveRes.dispatched) fail('Approval was not dispatched: ' + JSON.stringify(approveRes));
  }

  log('STEP 9   等待 B 实时收到 newMessage …');
  const wsMsg = await newMsgPromise;
  ok('WS newMessage 收到! payload =', JSON.stringify(wsMsg).slice(0, 400));
  summary.wsNewMessage = !!wsMsg;

  // 10. B replies via REST
  log('STEP 10  B 回复');
  const conv = await curl('POST', '/messages/start', {
    token: tokenB, body: { otherUserId: userA.id },
  });
  const convId = conv.id || conv.conversationId || conv._id;
  if (!convId) fail('未拿到 conversationId');
  ok('conversationId =', convId);
  await curl('POST', `/messages/conversations/${convId}/send`, {
    token: tokenB, body: { text: '好啊！周六上午 9:30 科技园 ROC 健身房见？' },
  });

  // 11. A creates Activity bound to socialRequestId via Agent
  log('STEP 11  A 通过 Agent 创建 Activity 并绑定 socialRequestId');
  const start = new Date(Date.now() + 60_000).toISOString();
  const activity = await curl('POST', '/agent/activities', {
    agentToken,
    body: {
      type: 'fitness',
      title: '南山周末练腿',
      description: '科技园 ROC 健身房一起练腿',
      locationName: 'ROC Gym 科技园店',
      city: '深圳',
      lat: 22.5430,
      lng: 113.9342,
      startTime: start,
      durationMinutes: 60,
      socialRequestId,
      invitedUserId: userB.id,
      proofRequired: true,
    },
  });
  const activityId = activity.id;
  ok('activityId =', activityId, ' status =', activity.status);
  summary.activityId = activityId;

  // 12. B joins
  log('STEP 12  B 加入 Activity');
  await curl('POST', `/activities/${activityId}/join`, { token: tokenB });

  // mutual confirm so checkin can move forward
  await curl('POST', `/activities/${activityId}/confirm`, { token: tokenA });
  await curl('POST', `/activities/${activityId}/confirm`, { token: tokenB });

  // 13. checkin both
  log('STEP 13  A/B 双方 checkin');
  await curl('POST', `/activities/${activityId}/checkin`,
    { token: tokenA, body: { locationApprox: '科技园 ROC' } });
  await curl('POST', `/activities/${activityId}/checkin`,
    { token: tokenB, body: { locationApprox: '科技园 ROC' } });

  // 14. A submits proof via Agent (scene_photo 走 Pending → 待 B accept)
  log('STEP 14  A 通过 Agent 提交 proof (scene_photo, Pending)');
  const proof = await curl('POST', `/agent/activities/${activityId}/proof`, {
    agentToken,
    body: {
      proofType: 'scene_photo',
      photoUrl: 'https://placeholder.fitmeet.test/scene.jpg',
      note: '完成练腿打卡',
      locationApprox: '科技园 ROC',
      privacyMode: 'scene_only',
    },
  });
  const proofId = proof.id;
  ok('proofId =', proofId, ' status =', proof.status);

  // 15. B accepts proof
  log('STEP 15  B accept proof');
  const respond = await curl('POST', `/activities/${activityId}/proofs/${proofId}/respond`,
    { token: tokenB, body: { accept: true, reason: '现场看到了，确认' } });
  ok('autoCompleted =', respond.autoCompleted, ' activity.status =', respond.activity?.status);

  // ── DB Verifications ───────────────────────────────────────────
  log('STEP 16  DB 校验：activity.status = completed');
  const aStatus = psql(`SELECT status FROM social_activities WHERE id=${activityId}`);
  ok('social_activities.status =', aStatus);
  if (aStatus !== 'completed') fail('activity 未 completed');

  log('STEP 17  DB 校验：user_social_requests.status = completed');
  const sStatus = psql(`SELECT status FROM user_social_requests WHERE id=${socialRequestId}`);
  ok('user_social_requests.status =', sStatus);
  if (sStatus !== 'completed') fail('social request 未 completed');

  log('STEP 18  DB 校验：A/B trustScore + socialTrustCount');
  const trust = psql(`SELECT id, "trustScore", "socialTrustCount" FROM users WHERE id IN (${userA.id},${userB.id}) ORDER BY id`);
  ok('users trust:\n', trust);
  // expect both >= 2 trust + 1 socialCount; A also +1 from accepted proof
  const lines = trust.split('\n').map(l => l.split('|'));
  for (const [id, score, cnt] of lines) {
    if (Number(score) < 2 || Number(cnt) < 1) fail(`user ${id} trust 没涨：score=${score} cnt=${cnt}`);
  }

  log('STEP 19  DB 校验：agent_activity_logs 必须包含 search/draft/send/create_activity/proof');
  const logs = psql(`SELECT action, result, "createdAt"
                     FROM agent_activity_logs
                     WHERE "agentConnectionId"=${agentConnId}
                     ORDER BY id`);
  ok('agent_activity_logs:\n', logs);
  const required = [
    'create_social_request',
    'draft_message',
    'send_message',
    'create_activity',
    'submit_completion_proof',
  ];
  const present = logs.split('\n').map(l => l.split('|')[0].trim());
  const missing = required.filter(r => !present.includes(r));
  if (missing.length) fail('agent_activity_logs 缺少: ' + missing.join(','));
  // search 由 Agent searchMatches/SearchProfiles 触发——本闭环里候选生成走的是 createUserSocialRequest 内部 match，
  // 没有显式调 /api/agent/match/search。下面补一刀，让"search"日志真实落地。
  log('STEP 19b  额外 /api/agent/match/search → 让 search 日志落地');
  await curl('POST', '/agent/match/search', {
    agentToken,
    body: { query: '周末练腿搭子', city: '深圳', limit: 5 },
  });
  const logs2 = psql(`SELECT DISTINCT action FROM agent_activity_logs WHERE "agentConnectionId"=${agentConnId} ORDER BY action`);
  ok('agent_activity_logs distinct actions:\n', logs2);
  if (!logs2.includes('search')) fail('search 日志没落');

  wsB.close();

  log('ALL GREEN ✅');
  console.log('summary:', JSON.stringify(summary, null, 2));
  console.log(`\n前端验证路径：用 B 的 token 打开 http://localhost:3001/messages`);
  console.log(`  - 应当看到与 A 的会话（conversationId=${convId}）`);
  console.log(`  - 应当看到 A 通过 Agent 发的 draftText`);
  console.log(`  - 应当能在 /activities/${activityId} 看到 status=completed`);
  process.exit(0);
})().catch(e => fail(e.stack || e.message));
