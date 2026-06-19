/**
 * Real API smoke for the product-grade FitMeet Agent opportunity journey.
 *
 * This is intentionally HTTP/SSE based: it proves the deployed backend can run
 * the user-facing social chain instead of only passing in-process unit tests.
 *
 * Required auth, choose one:
 *   USER_JWT / FITMEET_USER_JWT
 *   or AGENT_SMOKE_EMAIL + AGENT_SMOKE_PASSWORD
 *
 * Optional env:
 *   FITMEET_API_BASE_URL / AGENT_SMOKE_API_BASE_URL / API_BASE_URL
 *   AGENT_SMOKE_ALLOW_REMOTE=true for non-local targets
 *   AGENT_SMOKE_ALLOW_MUTATIONS=true for remote mutating opportunity smoke
 *   AGENT_SMOKE_ALLOW_NON_SMOKE_USER=true to use a non-smoke email remotely
 *   AGENT_SMOKE_ALLOW_JWT_MUTATIONS=true to use USER_JWT remotely
 *   AGENT_SMOKE_CITY=青岛
 *   AGENT_SMOKE_ACTIVITY=咖啡轻聊天
 *   AGENT_SMOKE_TIME=周末下午
 *   AGENT_SMOKE_INTENSITY=轻松
 *   AGENT_SMOKE_TIMEOUT_MS=20000
 *   AGENT_SMOKE_STOP_AFTER_OPPORTUNITIES=true to stop after the
 *     clarification -> OpportunityCard readiness checks. This still writes
 *     chat/search smoke data, but avoids opener send, activity creation,
 *     review, and Life Graph proposal actions.
 *
 * Recommended staging flow:
 *   pnpm --dir backend run seed:agent-smoke
 *   AGENT_SMOKE_EMAIL=agent-smoke-owner@socialworld.world \
 *   AGENT_SMOKE_PASSWORD=FitMeetAgentSmoke123! \
 *   AGENT_SMOKE_ALLOW_MUTATIONS=true \
 *   pnpm --dir backend run smoke:agent-opportunity
 */

type JsonRecord = Record<string, unknown>;

type SmokeResponse = {
  assistantMessage?: string;
  lightStatus?: string;
  taskId?: number;
  cards?: Array<JsonRecord>;
  pendingApproval?: JsonRecord | null;
  pendingConfirmations?: JsonRecord[];
  streamEvents: string[];
  assistantDeltaCount: number;
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const API_BASE_URL = resolveApiBaseUrl();
const REQUEST_TIMEOUT_MS = positiveInt(
  process.env.AGENT_SMOKE_TIMEOUT_MS,
  20_000,
);
const SMOKE_CITY = nonEmpty(process.env.AGENT_SMOKE_CITY, '青岛');
const SMOKE_ACTIVITY = nonEmpty(process.env.AGENT_SMOKE_ACTIVITY, '咖啡轻聊天');
const SMOKE_TIME = nonEmpty(process.env.AGENT_SMOKE_TIME, '周末下午');
const SMOKE_INTENSITY = nonEmpty(process.env.AGENT_SMOKE_INTENSITY, '轻松');
const STOP_AFTER_OPPORTUNITIES = truthy(
  process.env.AGENT_SMOKE_STOP_AFTER_OPPORTUNITIES,
);

let passCount = 0;

async function main() {
  assertRemoteIntent();
  assertMutationSmokeSafety();
  const token = await resolveUserToken();

  const ordinary = await postMessageStream(token, {
    message: '只想普通聊天，帮我梳理今天训练安排',
  });
  assertNoOpportunityCards('ordinary chat', ordinary);
  assertNoSocialExecutionArtifacts('ordinary chat', ordinary);
  assertNoPendingApproval('ordinary chat', ordinary);
  pass('ordinary chat stays conversational');

  const emotionalChat = await postMessageStream(token, {
    message: '最近压力有点大，只想安静聊聊，不要推荐人，也不要约练',
    taskId: ordinary.taskId,
  });
  assertNoOpportunityCards('emotional casual chat', emotionalChat);
  assertNoSocialExecutionArtifacts('emotional casual chat', emotionalChat);
  assertNoPendingApproval('emotional casual chat', emotionalChat);
  assertTextIncludesAny(
    'emotional casual chat response',
    emotionalChat.assistantMessage,
    ['压力', '聊', '先', '可以', '不用', '慢慢'],
  );
  pass('emotional casual chat stays supportive without social execution');

  const socialAdvice = await postMessageStream(token, {
    message:
      '根据我的画像，推荐一些适合我的运动搭子类型，不要给真实用户，也不要搜索候选人',
    taskId: emotionalChat.taskId,
  });
  assertNoOpportunityCards('social advice question', socialAdvice);
  assertNoSocialExecutionArtifacts('social advice question', socialAdvice);
  assertNoPendingApproval('social advice question', socialAdvice);
  assertTextIncludesAny(
    'social advice response',
    socialAdvice.assistantMessage,
    ['类型', '建议', '适合', '可以', '方向'],
  );
  pass('social advice questions do not trigger candidate search');

  const vague = await postMessageStream(token, {
    message: `我想找人一起${SMOKE_ACTIVITY}`,
    taskId: socialAdvice.taskId,
  });
  assertNoOpportunityCards('vague social request', vague);
  assertNoSocialExecutionArtifacts('vague social request', vague);
  assertNoPendingApproval('vague social request', vague);
  assertTextIncludesAny(
    'vague social request clarification',
    vague.assistantMessage,
    ['城市', '时间', '强度', '社交边界', '接受陌生人', '公开发起活动'],
  );
  pass('vague social request clarifies before search');

  const partialBoundary = await postMessageStream(token, {
    message: `${SMOKE_CITY}${SMOKE_TIME}，${SMOKE_INTENSITY}${SMOKE_ACTIVITY}，只在公共场所，先站内聊，发送前确认`,
    taskId: vague.taskId,
  });
  assertNoOpportunityCards('partial boundary clarification', partialBoundary);
  assertNoSocialExecutionArtifacts(
    'partial boundary clarification',
    partialBoundary,
  );
  assertNoPendingApproval('partial boundary clarification', partialBoundary);
  assertTextIncludesAny(
    'partial boundary clarification',
    partialBoundary.assistantMessage,
    ['是否接受陌生人', '是否公开发起活动'],
  );
  pass(
    'partial safety boundary still clarifies stranger/public-activity policy',
  );

  const clarified = await postMessageStream(token, {
    message: `${SMOKE_CITY}${SMOKE_TIME}，${SMOKE_INTENSITY}${SMOKE_ACTIVITY}，接受陌生人，可以公开发起活动，发送前确认`,
    taskId: partialBoundary.taskId,
  });
  assertOpportunityCards(clarified, {
    minTotal: 3,
    minCandidates: 3,
    requireActivity: true,
  });
  const candidateCard = findActionCard(clarified, 'candidate.generate_opener');
  const activityCard = findActionCard(clarified, 'activity.confirm_create');
  assertCard(candidateCard, 'candidate OpportunityCard');
  assertCard(activityCard, 'activity OpportunityCard');
  assertNoPendingApproval('clarified search', clarified);
  pass('clarified social request returns 3+ candidate/activity opportunities');
  if (STOP_AFTER_OPPORTUNITIES) {
    await assertTraceEvalPass(
      token,
      'readiness opportunity trace',
      clarified.taskId,
    );
    pass('readiness-only smoke stopped before high-risk card actions');
    return;
  }

  const opener = await postActionStream(token, Number(clarified.taskId), {
    action: 'candidate.generate_opener',
    payload: actionPayload(candidateCard, 'candidate.generate_opener'),
    idempotencyKey: smokeKey('generate-opener'),
  });
  const openerCard = findActionCard(opener, 'opener.confirm_send');
  assertCard(openerCard, 'opener approval card');
  assertApprovalRequiredEvent('opener approval stream', opener);
  assertTextIncludesAny('opener approval copy', opener.assistantMessage, [
    '开场白',
    '确认',
    '发送',
  ]);
  pass('candidate.generate_opener creates a send approval card');

  const rejected = await postActionStream(token, Number(opener.taskId), {
    action: 'opener.reject',
    payload: actionPayload(openerCard, 'opener.reject'),
    idempotencyKey: smokeKey('reject-opener'),
  });
  assertNoPendingApproval('rejected opener', rejected);
  assertTextIncludesAny('rejected opener response', rejected.assistantMessage, [
    '已取消',
    '未联系对方',
    '不会发送',
  ]);
  pass('opener.reject cancels the high-risk send without side effects');

  const secondOpener = await postActionStream(token, Number(clarified.taskId), {
    action: 'candidate.generate_opener',
    payload: actionPayload(candidateCard, 'candidate.generate_opener'),
    idempotencyKey: smokeKey('generate-opener-after-reject'),
  });
  const secondOpenerCard = findActionCard(secondOpener, 'opener.confirm_send');
  assertCard(secondOpenerCard, 'second opener approval card');
  assertApprovalRequiredEvent('second opener approval stream', secondOpener);

  const confirmed = await postActionStream(token, Number(secondOpener.taskId), {
    action: 'opener.confirm_send',
    payload: actionPayload(secondOpenerCard, 'opener.confirm_send'),
    idempotencyKey: smokeKey('confirm-send'),
  });
  assertTextIncludesAny('confirmed send response', confirmed.assistantMessage, [
    '已确认',
    '已按你的确认',
    '等待对方回复',
    '下一步',
  ]);
  const timelineCard =
    (confirmed.cards ?? []).find(
      (card) => readString(card.schemaType) === 'meet_loop.timeline',
    ) ??
    (confirmed.cards ?? []).find((card) =>
      JSON.stringify(card).includes('message_sent'),
    );
  assertCard(timelineCard, 'Meet Loop timeline after confirmed send');
  pass('opener.confirm_send resumes saved send step and returns Meet Loop');

  const activityDraft = await postActionStream(
    token,
    Number(clarified.taskId),
    {
      action: 'activity.confirm_create',
      payload: actionPayload(activityCard, 'activity.confirm_create'),
      idempotencyKey: smokeKey('activity-draft'),
    },
  );
  const activityApprovalCard = findActionCard(
    activityDraft,
    'activity.confirm_create',
  );
  assertCard(activityApprovalCard, 'activity create approval card');
  assertCardHasActions(
    'activity create approval card',
    actions(activityApprovalCard),
    [
      'activity.confirm_create',
      'activity.modify_time',
      'activity.modify_location',
    ],
  );
  assertApprovalRequiredEvent('activity create approval stream', activityDraft);
  assertPendingApproval('activity draft', activityDraft);
  assertTextIncludesAny(
    'activity draft response',
    activityDraft.assistantMessage,
    ['约练计划', '确认', '不会创建'],
  );
  pass(
    'activity.confirm_create creates a confirmation card before side effects',
  );

  const activityTimeAdjustment = await postActionStream(
    token,
    Number(activityDraft.taskId),
    {
      action: 'activity.modify_time',
      payload: actionPayload(activityApprovalCard, 'activity.modify_time'),
      idempotencyKey: smokeKey('activity-modify-time'),
    },
  );
  assertNoPendingApproval(
    'activity time adjustment draft',
    activityTimeAdjustment,
  );
  assertTextIncludesAny(
    'activity time adjustment response',
    activityTimeAdjustment.assistantMessage,
    ['不会自动通知对方', '新的时间范围', '改期草稿'],
  );
  const activityTimeAdjustmentCard = (activityTimeAdjustment.cards ?? []).find(
    (card) =>
      readString(card.schemaType) === 'meet_loop.timeline' &&
      JSON.stringify(card).includes('reschedule_requested'),
  );
  assertCard(activityTimeAdjustmentCard, 'activity time adjustment timeline');
  assertCardStage(activityTimeAdjustmentCard, 'reschedule_requested');
  pass('activity.modify_time prepares reschedule without side effects');

  const activityLocationAdjustment = await postActionStream(
    token,
    Number(activityDraft.taskId),
    {
      action: 'activity.modify_location',
      payload: actionPayload(activityApprovalCard, 'activity.modify_location'),
      idempotencyKey: smokeKey('activity-modify-location'),
    },
  );
  assertNoPendingApproval(
    'activity location adjustment draft',
    activityLocationAdjustment,
  );
  assertTextIncludesAny(
    'activity location adjustment response',
    activityLocationAdjustment.assistantMessage,
    ['不会自动通知对方', '新的时间范围', '改期草稿'],
  );
  const activityLocationAdjustmentCard = (
    activityLocationAdjustment.cards ?? []
  ).find(
    (card) =>
      readString(card.schemaType) === 'meet_loop.timeline' &&
      JSON.stringify(card).includes('reschedule_requested'),
  );
  assertCard(
    activityLocationAdjustmentCard,
    'activity location adjustment timeline',
  );
  assertCardStage(activityLocationAdjustmentCard, 'reschedule_requested');
  pass('activity.modify_location prepares reschedule without side effects');

  const activityConfirmed = await postActionStream(
    token,
    Number(activityDraft.taskId),
    {
      action: 'activity.confirm_create',
      payload: actionPayload(activityApprovalCard, 'activity.confirm_create'),
      idempotencyKey: smokeKey('activity-confirm'),
    },
  );
  assertNoPendingApproval('activity confirmed', activityConfirmed);
  assertTextIncludesAny(
    'activity confirmed response',
    activityConfirmed.assistantMessage,
    ['约练计划已经创建', '签到', '公共场所'],
  );
  const activityTimeline = (activityConfirmed.cards ?? []).find(
    (card) =>
      readString(card.schemaType) === 'meet_loop.timeline' &&
      JSON.stringify(card).includes('activity_confirmed'),
  );
  const checkinCard = findActionCard(activityConfirmed, 'activity.check_in');
  assertCard(
    activityTimeline,
    'Meet Loop timeline after activity confirmation',
  );
  assertCard(checkinCard, 'activity check-in card after activity confirmation');
  pass('activity.confirm_create confirms activity and advances Meet Loop');

  const checkedIn = await postActionStream(
    token,
    Number(activityConfirmed.taskId),
    {
      action: 'activity.check_in',
      payload: actionPayload(checkinCard, 'activity.check_in'),
      idempotencyKey: smokeKey('activity-check-in'),
    },
  );
  assertTextIncludesAny(
    'activity check-in response',
    checkedIn.assistantMessage,
    ['签到已记录', '活动结束', 'Life Graph'],
  );
  const completeCard = findActionCard(checkedIn, 'activity.complete');
  assertCard(completeCard, 'activity completion card after check-in');
  assertCardStage(completeCard, 'activity_checked_in');
  pass('activity.check_in advances Meet Loop to completion prompt');

  const completed = await postActionStream(token, Number(checkedIn.taskId), {
    action: 'activity.complete',
    payload: actionPayload(completeCard, 'activity.complete'),
    idempotencyKey: smokeKey('activity-complete'),
  });
  assertTextIncludesAny(
    'activity complete response',
    completed.assistantMessage,
    ['标记为完成', '评价', 'trust score'],
  );
  const reviewCard = findActionCard(completed, 'review.submit');
  assertCard(reviewCard, 'review card after activity completion');
  assertCardStage(reviewCard, 'activity_completed');
  pass('activity.complete advances Meet Loop to review prompt');

  const reviewed = await postActionStream(token, Number(completed.taskId), {
    action: 'review.submit',
    payload: {
      ...actionPayload(reviewCard, 'review.submit'),
      rating: 5,
      comment: '这次约练顺利完成，节奏很舒服。',
    },
    idempotencyKey: smokeKey('review-submit'),
  });
  assertTextIncludesAny('review submit response', reviewed.assistantMessage, [
    '评价已提交',
    'Life Graph',
    '撤回',
  ]);
  const lifeGraphCard =
    findActionCard(reviewed, 'life_graph.accept_update') ??
    findActionCard(reviewed, 'life_graph.reject_update');
  assertCard(lifeGraphCard, 'Life Graph update card after review');
  assertCardStage(lifeGraphCard, 'trust_score_updated');
  assertCardDataFlag(lifeGraphCard, 'canCorrect', true);
  assertCardDataFlag(lifeGraphCard, 'canRevoke', true);
  pass('review.submit creates a reversible Life Graph update proposal');

  const revokedInfluence = await postActionStream(
    token,
    Number(reviewed.taskId),
    {
      action: 'life_graph.reject_update',
      payload: actionPayload(lifeGraphCard, 'life_graph.reject_update'),
      idempotencyKey: smokeKey('life-graph-reject'),
    },
  );
  assertNoPendingApproval('Life Graph influence rejected', revokedInfluence);
  assertTextIncludesAny(
    'Life Graph influence rejected response',
    revokedInfluence.assistantMessage,
    ['不会继续用于后续推荐', '不会保存', '画像偏好信号'],
  );
  pass(
    'life_graph.reject_update revokes the Meet Loop recommendation influence',
  );

  const reviewedAgain = await postActionStream(
    token,
    Number(completed.taskId),
    {
      action: 'review.submit',
      payload: {
        ...actionPayload(reviewCard, 'review.submit'),
        rating: 5,
        comment: '这次体验仍然很舒服，可以继续用于推荐。',
      },
      idempotencyKey: smokeKey('review-submit-accept-path'),
    },
  );
  const secondLifeGraphCard =
    findActionCard(reviewedAgain, 'life_graph.accept_update') ??
    findActionCard(reviewedAgain, 'life_graph.reject_update');
  assertCard(secondLifeGraphCard, 'second Life Graph update card after review');
  assertCardStage(secondLifeGraphCard, 'trust_score_updated');
  const keptInfluence = await postActionStream(
    token,
    Number(reviewedAgain.taskId),
    {
      action: 'life_graph.accept_update',
      payload: actionPayload(secondLifeGraphCard, 'life_graph.accept_update'),
      idempotencyKey: smokeKey('life-graph-accept'),
    },
  );
  assertNoPendingApproval('Life Graph influence accepted', keptInfluence);
  assertTextIncludesAny(
    'Life Graph influence accepted response',
    keptInfluence.assistantMessage,
    ['已保留这次约练', '后续推荐', '查看、纠正或撤回'],
  );
  pass('life_graph.accept_update keeps the Meet Loop recommendation influence');

  await assertTraceEvalPass(
    token,
    'full opportunity journey trace',
    keptInfluence.taskId ?? reviewedAgain.taskId ?? completed.taskId,
  );

  console.log(`\n[agent-opportunity-smoke] PASS (${passCount} checks)`);
}

async function resolveUserToken() {
  const direct = process.env.USER_JWT ?? process.env.FITMEET_USER_JWT;
  if (direct) return direct;
  const email = process.env.AGENT_SMOKE_EMAIL;
  const password = process.env.AGENT_SMOKE_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'Missing auth. Set USER_JWT/FITMEET_USER_JWT or AGENT_SMOKE_EMAIL + AGENT_SMOKE_PASSWORD.',
    );
  }
  const result = await requestJson('/auth/login', {
    method: 'POST',
    body: { email, password },
    token: null,
  });
  const token = readString(result.access_token);
  if (!token) throw new Error('Login did not return access_token.');
  pass(`logged in smoke user ${email}`);
  return token;
}

async function postMessageStream(
  token: string,
  body: JsonRecord,
): Promise<SmokeResponse> {
  return postSse('/social-agent/chat/messages/stream', token, body);
}

async function postActionStream(
  token: string,
  taskId: number,
  body: JsonRecord,
): Promise<SmokeResponse> {
  if (!Number.isFinite(taskId) || taskId <= 0) {
    throw new Error(`Cannot post action without a valid taskId: ${taskId}`);
  }
  return postSse(
    `/social-agent/chat/tasks/${taskId}/actions/stream`,
    token,
    body,
  );
}

async function postSse(
  endpoint: string,
  token: string,
  body: JsonRecord,
): Promise<SmokeResponse> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `${endpoint} HTTP ${response.status}: ${text.slice(0, 500)}`,
    );
  }
  const events = parseSse(text);
  assertSseAssistantProtocol(endpoint, events);
  const result = events
    .map((event) => asRecord(event.data))
    .map((data) => asRecord(data.result))
    .filter((data) => Object.keys(data).length > 0)
    .at(-1);
  if (!result) {
    throw new Error(
      `${endpoint} did not emit a result event. events=${events
        .map((event) => event.event)
        .join(',')}`,
    );
  }
  const normalized = normalizeSmokeResponse(result, events);
  assertSmokeResponsePublicSafety(endpoint, normalized);
  return normalized;
}

async function requestJson(
  endpoint: string,
  input: { method: 'GET' | 'POST'; body?: JsonRecord; token?: string | null },
): Promise<JsonRecord> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (input.body) headers['Content-Type'] = 'application/json';
  if (input.token) headers.Authorization = `Bearer ${input.token}`;
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: input.method,
    headers,
    body: input.body ? JSON.stringify(input.body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  const data = safeJson(text);
  if (!response.ok) {
    throw new Error(
      `${endpoint} HTTP ${response.status}: ${text.slice(0, 500)}`,
    );
  }
  return asRecord(data);
}

async function assertTraceEvalPass(
  token: string,
  label: string,
  taskId: unknown,
) {
  const normalizedTaskId = readNumber(taskId);
  if (!normalizedTaskId) {
    throw new Error(`${label} cannot run without a valid taskId.`);
  }
  const evalResult = await requestJson(
    `/social-agent/tasks/${normalizedTaskId}/events/eval`,
    {
      method: 'GET',
      token,
    },
  );
  if (evalResult.pass !== true) {
    throw new Error(
      `${label} Social Codex trace eval failed: ${JSON.stringify(
        evalResult.issues ?? [],
      ).slice(0, 1000)}`,
    );
  }
  const socialCodexEventCount = readNumber(evalResult.socialCodexEventCount);
  if (!socialCodexEventCount || socialCodexEventCount <= 0) {
    throw new Error(`${label} did not persist SocialAgentEventV2 rows.`);
  }
  const runs = Array.isArray(evalResult.runs) ? evalResult.runs : [];
  if (runs.length === 0) {
    throw new Error(`${label} did not expose run-level trace eval results.`);
  }
  pass(
    `${label} Social Codex trace eval passed (${socialCodexEventCount} events, ${runs.length} runs)`,
  );
}

function normalizeSmokeResponse(
  value: JsonRecord,
  events: Array<{ event: string; data: unknown }>,
): SmokeResponse {
  return {
    assistantMessage: readString(value.assistantMessage),
    lightStatus: readString(value.lightStatus),
    taskId: readNumber(value.taskId),
    cards: Array.isArray(value.cards)
      ? value.cards.filter(isRecord).map((card) => card)
      : [],
    pendingApproval: isRecord(value.pendingApproval)
      ? value.pendingApproval
      : null,
    pendingConfirmations: Array.isArray(value.pendingConfirmations)
      ? value.pendingConfirmations.filter(isRecord)
      : [],
    streamEvents: events.map((event) => eventNameOrType(event)),
    assistantDeltaCount: events.filter(
      (event) => eventNameOrType(event) === 'assistant_delta',
    ).length,
  };
}

function assertSseAssistantProtocol(
  endpoint: string,
  events: Array<{ event: string; data: unknown }>,
) {
  const eventNames = events.map((event) => eventNameOrType(event));
  const firstDeltaIndex = eventNames.indexOf('assistant_delta');
  const doneIndex = eventNames.indexOf('assistant_done');
  const resultIndex = eventNames.indexOf('result');
  if (firstDeltaIndex < 0) {
    throw new Error(`${endpoint} did not emit assistant_delta.`);
  }
  if (doneIndex < 0) {
    throw new Error(`${endpoint} did not emit assistant_done.`);
  }
  if (resultIndex < 0) {
    throw new Error(`${endpoint} did not emit result.`);
  }
  if (doneIndex < firstDeltaIndex) {
    throw new Error(
      `${endpoint} emitted assistant_done before assistant_delta.`,
    );
  }
  const hasNonEmptyDelta = events.some((event) => {
    if (eventNameOrType(event) !== 'assistant_delta') return false;
    const data = asRecord(event.data);
    return Boolean(readString(data.delta));
  });
  if (!hasNonEmptyDelta) {
    throw new Error(`${endpoint} emitted assistant_delta without text.`);
  }
  pass(`${endpoint} emits assistant_delta/assistant_done/result SSE protocol`);
}

function eventNameOrType(event: { event: string; data: unknown }): string {
  const data = asRecord(event.data);
  return readString(data.type) ?? event.event;
}

function findActionCard(
  response: SmokeResponse,
  action: string,
): JsonRecord | undefined {
  return (response.cards ?? []).find((card) =>
    actions(card).some(
      (item) =>
        readString(item.schemaAction) === action ||
        readString(item.action) === action,
    ),
  );
}

function actionPayload(card: JsonRecord | undefined, action: string) {
  if (!card) throw new Error(`Missing card for action ${action}`);
  const found = actions(card).find(
    (item) =>
      readString(item.schemaAction) === action ||
      readString(item.action) === action,
  );
  if (!found) throw new Error(`Card does not expose action ${action}`);
  return asRecord(found.payload);
}

function actions(card: JsonRecord): JsonRecord[] {
  return Array.isArray(card.actions)
    ? card.actions.filter(isRecord).map((item) => item)
    : [];
}

function assertNoOpportunityCards(label: string, response: SmokeResponse) {
  const hasOpportunity = (response.cards ?? []).some((card) => {
    const data = asRecord(card.data);
    return (
      data.opportunityCard === true ||
      readString(card.schemaType)?.startsWith('social_match.')
    );
  });
  if (hasOpportunity) {
    throw new Error(`${label} unexpectedly returned opportunity cards.`);
  }
}

function assertNoSocialExecutionArtifacts(
  label: string,
  response: SmokeResponse,
) {
  const forbiddenSchemas = new Set([
    'social_match.candidate',
    'social_match.activity',
    'meet_loop.timeline',
    'safety.approval',
  ]);
  const forbiddenCard = (response.cards ?? []).find((card) => {
    const schemaType = readString(card.schemaType);
    return schemaType ? forbiddenSchemas.has(schemaType) : false;
  });
  if (forbiddenCard) {
    throw new Error(
      `${label} unexpectedly returned social execution schema "${readString(forbiddenCard.schemaType)}".`,
    );
  }
  const socialStatuses = [
    '正在筛选合适的人',
    '正在排除时间不合适的人',
    '正在检查安全边界',
    '正在生成开场白',
    '正在等待你确认',
    '正在创建约练计划',
  ];
  if (
    response.lightStatus &&
    socialStatuses.some((status) => response.lightStatus === status)
  ) {
    throw new Error(
      `${label} unexpectedly entered social execution status "${response.lightStatus}".`,
    );
  }
}

function assertNoPendingApproval(label: string, response: SmokeResponse) {
  if (
    response.pendingApproval ||
    (response.pendingConfirmations ?? []).length > 0
  ) {
    throw new Error(`${label} unexpectedly returned pending approval.`);
  }
}

function assertPendingApproval(label: string, response: SmokeResponse) {
  if (
    !response.pendingApproval &&
    (response.pendingConfirmations ?? []).length === 0
  ) {
    throw new Error(`${label} did not return a pending approval.`);
  }
}

function assertApprovalRequiredEvent(label: string, response: SmokeResponse) {
  if (!response.streamEvents.includes('approval_required')) {
    throw new Error(
      `${label} did not emit approval_required SSE event for a high-risk action.`,
    );
  }
}

function assertOpportunityCards(
  response: SmokeResponse,
  options: {
    minTotal: number;
    minCandidates?: number;
    requireActivity: boolean;
  },
) {
  const cards = response.cards ?? [];
  const opportunities = cards.filter((card) => {
    const data = asRecord(card.data);
    const schemaType = readString(card.schemaType);
    return (
      data.opportunityCard === true || schemaType?.startsWith('social_match.')
    );
  });
  const candidateCount = opportunities.filter(
    (card) => readString(card.schemaType) === 'social_match.candidate',
  ).length;
  const activityCount = opportunities.filter(
    (card) => readString(card.schemaType) === 'social_match.activity',
  ).length;
  if (opportunities.length < options.minTotal) {
    throw new Error(
      `Expected at least ${options.minTotal} OpportunityCards, got ${opportunities.length}.`,
    );
  }
  if (candidateCount < (options.minCandidates ?? 0)) {
    throw new Error(
      `Expected at least ${options.minCandidates} Candidate OpportunityCards, got ${candidateCount}.`,
    );
  }
  if (options.requireActivity && activityCount < 1) {
    throw new Error('Expected at least one activity OpportunityCard.');
  }
  opportunities.forEach((card, index) =>
    assertOpportunityCardQuality(card, index),
  );
}

function assertOpportunityCardQuality(card: JsonRecord, index: number) {
  const label = `OpportunityCard #${index + 1}`;
  const schemaType = readString(card.schemaType);
  const data = asRecord(card.data);
  const opportunity = asRecord(data.opportunity);
  const actionsList = actions(card);
  const confirmedContext = readStringArray(
    opportunity.confirmedContext ?? data.confirmedContext,
  );
  const safetyBadges = readStringArray(
    opportunity.safetyBadges ?? data.safetyBadges,
  );

  if (readString(card.schemaVersion) !== 'fitmeet.tool-ui.v1') {
    throw new Error(
      `${label} missing stable fitmeet.tool-ui.v1 schemaVersion.`,
    );
  }
  if (!schemaType?.startsWith('social_match.')) {
    throw new Error(
      `${label} has invalid schemaType "${schemaType ?? 'missing'}".`,
    );
  }
  if (readString(data.schemaName) !== 'OpportunityCard') {
    throw new Error(`${label} missing data.schemaName=OpportunityCard.`);
  }
  if (data.opportunityCard !== true) {
    throw new Error(`${label} missing data.opportunityCard=true.`);
  }
  if (!readString(opportunity.title) || !readString(opportunity.summary)) {
    throw new Error(`${label} missing public opportunity title or summary.`);
  }
  if (confirmedContext.length < 3) {
    throw new Error(`${label} missing confirmed context chips.`);
  }
  if (safetyBadges.length < 1) {
    throw new Error(`${label} missing safety badges.`);
  }
  if (!readString(opportunity.safetyBoundary)) {
    throw new Error(`${label} missing safetyBoundary.`);
  }
  if (actionsList.length < 1) {
    throw new Error(`${label} missing visible next actions.`);
  }
  if (schemaType === 'social_match.candidate') {
    assertCardHasActions(label, actionsList, [
      'candidate.view_detail',
      'candidate.generate_opener',
      'candidate.connect',
    ]);
    assertCandidateOpportunityActionCopy(
      label,
      card,
      data,
      opportunity,
      actionsList,
    );
    assertCandidateOpportunitySafetyConsent(label, data, opportunity);
    assertCandidateOpportunityRationale(label, data, opportunity);
  }
  if (schemaType === 'social_match.activity') {
    assertCardHasActions(label, actionsList, [
      'activity.view_detail',
      'activity.confirm_create',
    ]);
    assertActivityOpportunityProtocol(label, data, opportunity, actionsList);
  }
  assertNoPublicInternalLeak(label, {
    title: card.title,
    body: card.body,
    opportunity,
    confirmedContext,
    safetyBadges,
    explanationSteps: data.explanationSteps,
  });
}

function assertCandidateOpportunityActionCopy(
  label: string,
  card: JsonRecord,
  data: JsonRecord,
  opportunity: JsonRecord,
  actionsList: JsonRecord[],
) {
  const openerAction = actionsList.find(
    (item) => readString(item.schemaAction) === 'candidate.generate_opener',
  );
  const openerLabel = readString(openerAction?.label);
  if (openerLabel !== '生成开场白') {
    throw new Error(
      `${label} candidate.generate_opener label must be "生成开场白", got "${openerLabel ?? 'missing'}".`,
    );
  }

  const connectAction = actionsList.find(
    (item) => readString(item.schemaAction) === 'candidate.connect',
  );
  if (!connectAction || connectAction.requiresConfirmation !== true) {
    throw new Error(
      `${label} candidate.connect must require explicit user confirmation.`,
    );
  }
  const connectLabel = readString(connectAction.label) ?? '';
  if (!connectLabel.includes('确认') || !connectLabel.includes('邀请')) {
    throw new Error(
      `${label} candidate.connect label must make confirmation-before-invite clear.`,
    );
  }

  const publicText = JSON.stringify({
    title: card.title,
    body: card.body,
    recommendedNextAction: data.recommendedNextAction,
    nextActions: data.nextActions,
    opportunity,
    actionLabels: actionsList
      .map((item) => readString(item.label))
      .filter((item): item is string => Boolean(item)),
  });
  const staleCopy = ['生成邀请', '邀请开场白', '先生成邀请'].find((item) =>
    publicText.includes(item),
  );
  if (staleCopy) {
    throw new Error(
      `${label} uses stale invite-draft copy "${staleCopy}"; draft actions must say "生成开场白".`,
    );
  }
}

function assertCandidateOpportunitySafetyConsent(
  label: string,
  data: JsonRecord,
  opportunity: JsonRecord,
) {
  const consent = asRecord(
    opportunity.recommendationConsent ?? data.recommendationConsent,
  );
  if (consent.profileDiscoverable !== true) {
    throw new Error(`${label} missing profileDiscoverable recommendation consent.`);
  }
  if (consent.agentCanRecommendMe !== true) {
    throw new Error(`${label} missing agentCanRecommendMe recommendation consent.`);
  }
  const safetySignals = readStringArray(
    opportunity.discoverySafetySignals ?? data.discoverySafetySignals,
  );
  const safetyText = safetySignals.join(' ');
  for (const required of ['公开可发现', 'Agent 匹配', '资料已脱敏']) {
    if (!safetyText.includes(required)) {
      throw new Error(`${label} missing discovery safety signal "${required}".`);
    }
  }
  if (!/无拉黑|无投诉|无.*风险/.test(safetyText)) {
    throw new Error(
      `${label} must explicitly say the candidate has no block/complaint risk signal.`,
    );
  }
}

function assertCandidateOpportunityRationale(
  label: string,
  data: JsonRecord,
  opportunity: JsonRecord,
) {
  const rationaleSignals = [
    ...readStringArray(opportunity.coldStartSignals ?? data.coldStartSignals),
    ...readStringArray(opportunity.preferenceHistorySignals ?? data.preferenceHistorySignals),
    ...readStringArray(opportunity.trustSignals ?? data.trustSignals),
    ...readStringArray(opportunity.reasons ?? data.fitReasons ?? data.matchReasons),
    ...readStringArray(opportunity.explanationSteps ?? data.explanationSteps),
    ...readStringArray(opportunity.confirmedContext ?? data.confirmedContext),
  ];
  const rationaleText = rationaleSignals.join(' ');
  const requiredDimensions = [
    {
      label: 'city/distance',
      pattern: /城市|同城|距离|区域|附近|city|distance/i,
    },
    {
      label: 'interest/activity',
      pattern: /兴趣|运动|活动|跑步|羽毛球|篮球|健身|咖啡|搭子|activity|interest/i,
    },
    {
      label: 'time/window',
      pattern: /时间|周末|晚上|下午|今晚|可约|time|window/i,
    },
    {
      label: 'social boundary',
      pattern: /边界|公共|站内|确认|低压力|陌生人|boundary|safe|consent/i,
    },
  ];

  for (const dimension of requiredDimensions) {
    if (!dimension.pattern.test(rationaleText)) {
      throw new Error(
        `${label} missing weak cold-start recommendation rationale for ${dimension.label}.`,
      );
    }
  }

  if (rationaleSignals.length < 4) {
    throw new Error(
      `${label} must expose at least four public recommendation rationale signals.`,
    );
  }
}

function assertActivityOpportunityProtocol(
  label: string,
  data: JsonRecord,
  opportunity: JsonRecord,
  actionsList: JsonRecord[],
) {
  const protocolSignals = [
    ...readStringArray(opportunity.activityProtocol ?? data.activityProtocol),
    ...readStringArray(opportunity.explanationSteps ?? data.explanationSteps),
    ...readStringArray(opportunity.confirmedContext ?? data.confirmedContext),
    ...readStringArray(opportunity.safetyBadges ?? data.safetyBadges),
    readString(opportunity.publishPolicy ?? data.publishPolicy),
    readString(opportunity.approvalPolicy ?? data.approvalPolicy),
    readString(opportunity.meetLoopNextStep ?? data.meetLoopNextStep),
    readString(opportunity.checkinReminder ?? data.checkinReminder),
    readString(opportunity.reviewPrompt ?? data.reviewPrompt),
    readString(opportunity.lifeGraphUpdatePreview ?? data.lifeGraphUpdatePreview),
    readString(opportunity.location ?? data.location ?? data.locationName),
    readString(opportunity.time ?? data.timeLabel ?? data.timePreference),
    readString(opportunity.intensity ?? data.intensity),
    ...actionsList
      .map((item) => readString(item.label))
      .filter((item): item is string => Boolean(item)),
  ].filter((item): item is string => Boolean(item));
  const protocolText = protocolSignals.join(' ');

  const requiredDimensions = [
    {
      label: 'time window',
      pattern: /时间|周末|晚上|下午|今晚|开始|time|window/i,
    },
    {
      label: 'safe place/location',
      pattern: /地点|场所|公共|路线|球馆|位置|location|venue|place/i,
    },
    {
      label: 'activity or intensity',
      pattern: /活动|约练|强度|轻松|跑步|羽毛球|篮球|健身|activity|intensity/i,
    },
    {
      label: 'approval before side effects',
      pattern: /确认|审批|不会自动|发送前|创建前|公开前|approval|confirm/i,
    },
    {
      label: 'meet-loop continuity',
      pattern: /等待回复|改期|确认到达|签到|评价|回写|Life Graph|闭环|meet loop/i,
    },
  ];

  for (const dimension of requiredDimensions) {
    if (!dimension.pattern.test(protocolText)) {
      throw new Error(
        `${label} missing activity opportunity protocol for ${dimension.label}.`,
      );
    }
  }

  if (protocolSignals.length < 5) {
    throw new Error(
      `${label} must expose at least five public activity protocol signals.`,
    );
  }
}

function assertCardHasActions(
  label: string,
  actionsList: JsonRecord[],
  requiredActions: string[],
) {
  const available = new Set(
    actionsList
      .map((item) => readString(item.schemaAction) ?? readString(item.action))
      .filter((item): item is string => Boolean(item)),
  );
  for (const action of requiredActions) {
    if (!available.has(action)) {
      throw new Error(`${label} missing ${action} action.`);
    }
  }
}

function assertNoPublicInternalLeak(label: string, value: unknown) {
  const text = JSON.stringify(value ?? {});
  const forbidden = [
    'traceId',
    'planner',
    'raw JSON',
    'rawJson',
    'stack',
    'debug',
    'toolCallId',
  ];
  const leaked = forbidden.find((item) =>
    new RegExp(`"${item}"|\\b${item}\\b`, 'i').test(text),
  );
  if (leaked) {
    throw new Error(
      `${label} leaks internal field "${leaked}" in public copy.`,
    );
  }
}

function assertSmokeResponsePublicSafety(
  label: string,
  response: SmokeResponse,
) {
  assertNoPublicInternalLeak(label, {
    assistantMessage: response.assistantMessage,
    cards: response.cards,
    pendingApproval: response.pendingApproval,
    pendingConfirmations: response.pendingConfirmations,
  });
  for (const [index, card] of (response.cards ?? []).entries()) {
    assertStableCardSchema(`${label} card #${index + 1}`, card);
  }
}

function assertStableCardSchema(label: string, card: JsonRecord) {
  const schemaVersion = readString(card.schemaVersion);
  const schemaType = readString(card.schemaType);
  if (!schemaVersion && !schemaType) return;
  if (schemaVersion !== 'fitmeet.tool-ui.v1') {
    throw new Error(
      `${label} has schemaType but missing fitmeet.tool-ui.v1 schemaVersion.`,
    );
  }
  const allowed = new Set([
    'social_match.candidate',
    'social_match.activity',
    'life_graph.diff',
    'meet_loop.timeline',
    'safety.approval',
    'generic.card',
  ]);
  if (!schemaType || !allowed.has(schemaType)) {
    throw new Error(
      `${label} has unsupported assistant-ui schemaType "${schemaType ?? 'missing'}".`,
    );
  }
  const data = asRecord(card.data);
  const dataSchemaVersion = readString(data.schemaVersion);
  const dataSchemaType = readString(data.schemaType);
  if (dataSchemaVersion && dataSchemaVersion !== 'fitmeet.tool-ui.v1') {
    throw new Error(`${label} has mismatched data.schemaVersion.`);
  }
  if (dataSchemaType && dataSchemaType !== schemaType) {
    throw new Error(`${label} has mismatched data.schemaType.`);
  }
}

function assertTextIncludesAny(
  label: string,
  value: string | undefined,
  expected: string[],
) {
  const text = value ?? '';
  if (!expected.some((item) => text.includes(item))) {
    throw new Error(`${label} missing any of: ${expected.join(', ')}`);
  }
}

function assertCard(
  card: JsonRecord | undefined,
  label: string,
): asserts card is JsonRecord {
  if (!card) throw new Error(`Missing ${label}.`);
}

function assertCardStage(card: JsonRecord | undefined, expectedStage: string) {
  assertCard(card, `${expectedStage} card`);
  const data = asRecord(card.data);
  const stage = readString(data.loopStage);
  if (stage !== expectedStage) {
    throw new Error(
      `Expected card loopStage "${expectedStage}", got "${stage ?? 'missing'}".`,
    );
  }
}

function assertCardDataFlag(
  card: JsonRecord | undefined,
  key: string,
  expected: boolean,
) {
  assertCard(card, `${key} card`);
  const data = asRecord(card.data);
  if (data[key] !== expected) {
    throw new Error(`Expected card data.${key} to be ${expected}.`);
  }
}

function parseSse(text: string) {
  const events: Array<{ event: string; data: unknown }> = [];
  for (const block of text.split(/\n\n+/)) {
    if (!block.trim()) continue;
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    const rawData = dataLines.join('\n');
    events.push({ event, data: safeJson(rawData) });
  }
  return events;
}

function pass(message: string) {
  passCount += 1;
  console.log(`[PASS] ${message}`);
}

function smokeKey(label: string) {
  return `agent-opportunity-smoke-${label}-${Date.now()}`;
}

function resolveApiBaseUrl() {
  const value =
    process.env.AGENT_SMOKE_API_BASE_URL ??
    process.env.FITMEET_API_BASE_URL ??
    process.env.API_BASE_URL ??
    'http://localhost:3000/api';
  return value.replace(/\/$/, '');
}

function assertRemoteIntent() {
  if (truthy(process.env.AGENT_SMOKE_ALLOW_REMOTE)) return;
  const url = new URL(API_BASE_URL);
  if (LOCAL_HOSTS.has(url.hostname)) return;
  throw new Error(
    `Refusing to run Agent opportunity smoke against remote API "${API_BASE_URL}". Set AGENT_SMOKE_ALLOW_REMOTE=true for staging/production.`,
  );
}

function assertMutationSmokeSafety() {
  const url = new URL(API_BASE_URL);
  if (LOCAL_HOSTS.has(url.hostname)) return;

  if (!truthy(process.env.AGENT_SMOKE_ALLOW_MUTATIONS)) {
    throw new Error(
      `Refusing to run mutating Agent opportunity smoke against remote API "${API_BASE_URL}". Set AGENT_SMOKE_ALLOW_MUTATIONS=true only for a dedicated smoke account.`,
    );
  }

  const directJwt = process.env.USER_JWT ?? process.env.FITMEET_USER_JWT;
  if (directJwt && !truthy(process.env.AGENT_SMOKE_ALLOW_JWT_MUTATIONS)) {
    throw new Error(
      'Refusing to run remote mutating Agent opportunity smoke with USER_JWT/FITMEET_USER_JWT. Set AGENT_SMOKE_ALLOW_JWT_MUTATIONS=true only for a dedicated smoke token.',
    );
  }

  const email = process.env.AGENT_SMOKE_EMAIL;
  if (
    email &&
    !looksLikeSmokeAccount(email) &&
    !truthy(process.env.AGENT_SMOKE_ALLOW_NON_SMOKE_USER)
  ) {
    throw new Error(
      `Refusing to run remote mutating Agent opportunity smoke for non-smoke email "${email}". Use a dedicated smoke account or set AGENT_SMOKE_ALLOW_NON_SMOKE_USER=true intentionally.`,
    );
  }
}

function looksLikeSmokeAccount(email: string) {
  return /(^|[._+-])(agent-)?(smoke|test|qa|e2e|staging)([._+-]|@)/i.test(
    email,
  );
}

function truthy(value: string | undefined) {
  return /^(1|true|yes)$/i.test(value ?? '');
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonEmpty(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => readString(item))
        .filter((item): item is string => Boolean(item))
    : [];
}

function readNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeJson(text: string): unknown {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

main().catch((error) => {
  console.error(
    `[agent-opportunity-smoke] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
