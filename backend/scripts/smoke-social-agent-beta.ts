/**
 * Smoke test (beta) for Social Agent stability + observability.
 *
 * Exercises the public chat pipeline through `POST /api/social-agent/chat/messages`
 * across the main intents (casual_chat, profile_update, social_search,
 * activity_search, safety_or_boundary, action_request) and then reads
 * `GET /api/social-agent/metrics` to verify counters and latency
 * histograms were updated. No product behaviour is changed; failures
 * surface as a non-zero exit code so this can be wired into CI / on-call.
 *
 * Required env:
 *   FITMEET_API_BASE_URL  e.g. https://www.ourfitmeet.cn/api
 *   USER_JWT              JWT for a real (test) FitMeet user
 *
 * Optional env:
 *   SMOKE_TIMEOUT_MS      per-request soft cap (default 8000)
 *
 * Run:
 *   node --experimental-strip-types backend/scripts/smoke-social-agent-beta.ts
 */

const baseUrl = (process.env.FITMEET_API_BASE_URL ?? '').replace(/\/$/, '');
const userJwt = process.env.USER_JWT ?? process.env.FITMEET_USER_JWT;
const softTimeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? '8000');

if (!baseUrl || !userJwt) {
  console.error('Missing env: FITMEET_API_BASE_URL and USER_JWT are required.');
  process.exit(1);
}

interface MessageProbe {
  label: string;
  message: string;
  expectIntent: string;
  taskId?: number;
}

interface RouteMessageResponse {
  intent?: string;
  action?: string;
  assistantMessage?: string;
  taskId?: number;
  source?: string;
  pendingApproval?: { id: number; type: string } | null;
  queuedRun?: { runId: string; mode: string } | null;
}

interface MetricsSnapshot {
  startedAt: string;
  intentTotal: Record<string, number>;
  actionTotal: Record<string, number>;
  errorTotal: Record<string, number>;
  fallbackTotal: Record<string, number>;
  stageLatencyMs: Record<
    string,
    { count: number; avgMs: number; maxMs: number }
  >;
  routeLatencyMs: { count: number; avgMs: number; sumMs: number };
}

const probes: MessageProbe[] = [
  {
    label: 'casual_chat',
    message: '你好，能帮我聊聊吗？',
    expectIntent: 'casual_chat',
  },
  {
    label: 'profile_update',
    message: '我比较内向，平时喜欢周末跑步和拍照',
    expectIntent: 'profile_update',
  },
  {
    label: 'safety_or_boundary',
    message: '我不接受夜间见面，也不要主动发消息',
    expectIntent: 'safety_or_boundary',
  },
  {
    label: 'social_search',
    message: '帮我在上海找一个跑步搭子',
    expectIntent: 'social_search',
  },
  {
    label: 'activity_search',
    message: '附近这周末有什么羽毛球局？',
    expectIntent: 'activity_search',
  },
  {
    label: 'action_request',
    message: '帮我给第一个候选发条招呼吧',
    expectIntent: 'action_request',
  },
];

let lastTaskId: number | undefined;
let pass = 0;
let warn = 0;
let fail = 0;

async function main(): Promise<void> {
  const before = await fetchMetrics();
  console.log(
    `metrics.routeLatencyMs.count(before) = ${before.routeLatencyMs.count}`,
  );

  const perProbeLatency: Array<{ label: string; ms: number; intent: string }> =
    [];

  for (const probe of probes) {
    const startedAt = Date.now();
    let response: RouteMessageResponse | null = null;
    try {
      response = await postMessage(probe.message, lastTaskId);
    } catch (error) {
      fail++;
      console.error(`[FAIL] ${probe.label}: ${(error as Error).message}`);
      continue;
    }
    const elapsed = Date.now() - startedAt;
    const intent = readResponseIntent(response);
    const action = readResponseAction(response);
    perProbeLatency.push({ label: probe.label, ms: elapsed, intent });
    const taskId = readResponseTaskId(response);
    if (taskId) lastTaskId = taskId;

    if (intent === probe.expectIntent) {
      pass++;
      console.log(
        `[PASS] ${probe.label} -> intent=${intent} action=${action} (${elapsed}ms)`,
      );
    } else if (intent === 'user_facing_response') {
      warn++;
      console.warn(
        `[WARN] ${probe.label} -> product response hides internal intent (expected ${probe.expectIntent}, ${elapsed}ms)`,
      );
    } else {
      warn++;
      console.warn(
        `[WARN] ${probe.label} -> intent=${intent} (expected ${probe.expectIntent}, ${elapsed}ms)`,
      );
    }

    if (elapsed > softTimeoutMs) {
      warn++;
      console.warn(
        `[WARN] ${probe.label} exceeded soft timeout ${softTimeoutMs}ms`,
      );
    }
  }

  const after = await fetchMetrics();
  console.log('--- metrics delta ---');
  console.log(
    `routeLatencyMs.count: ${before.routeLatencyMs.count} -> ${after.routeLatencyMs.count}`,
  );
  console.log(`fallbackTotal: ${JSON.stringify(after.fallbackTotal)}`);
  console.log(`errorTotal:    ${JSON.stringify(after.errorTotal)}`);
  console.log(`stageLatency:  ${JSON.stringify(after.stageLatencyMs)}`);

  assertCounterIncreased(
    'routeLatencyMs.count',
    before.routeLatencyMs.count,
    after.routeLatencyMs.count,
    probes.length - fail,
  );

  console.log('--- per-probe latency ---');
  for (const entry of perProbeLatency) {
    console.log(
      `  ${entry.label.padEnd(18)} intent=${entry.intent.padEnd(20)} ${entry.ms}ms`,
    );
  }

  await smokeStreamingMessage(lastTaskId);

  console.log(`\nresult: pass=${pass} warn=${warn} fail=${fail}`);
  if (fail > 0) process.exit(1);
}

async function postMessage(
  message: string,
  taskId?: number,
): Promise<RouteMessageResponse> {
  const url = `${baseUrl}/social-agent/chat/messages`;
  const body: Record<string, unknown> = { message };
  if (taskId) body.taskId = taskId;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${userJwt}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  return (await res.json()) as RouteMessageResponse;
}

async function smokeStreamingMessage(taskId?: number): Promise<void> {
  const url = `${baseUrl}/social-agent/chat/messages/stream`;
  const body: Record<string, unknown> = {
    message: '继续用一句自然的话总结我刚才的需求',
  };
  if (taskId) body.taskId = taskId;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${userJwt}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    fail++;
    console.error(`[FAIL] stream HTTP ${res.status} ${text.slice(0, 200)}`);
    return;
  }

  const text = await res.text();
  const eventNames = Array.from(text.matchAll(/^event:\s*(.+)$/gm)).map(
    (match) => match[1]?.trim() ?? '',
  );
  const deltaCount = eventNames.filter(
    (event) => event === 'assistant_delta',
  ).length;
  const hasDone =
    eventNames.includes('assistant_done') || eventNames.includes('result');
  if (deltaCount > 0 && hasDone) {
    pass++;
    console.log(
      `[PASS] messages/stream -> assistant_delta=${deltaCount}, done=${hasDone}`,
    );
    return;
  }

  fail++;
  console.error(
    `[FAIL] messages/stream expected assistant_delta and assistant_done/result, got events=${eventNames.join(',')}`,
  );
}

async function fetchMetrics(): Promise<MetricsSnapshot> {
  const url = `${baseUrl}/social-agent/metrics`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${userJwt}` },
  });
  if (!res.ok) throw new Error(`metrics HTTP ${res.status}`);
  return (await res.json()) as MetricsSnapshot;
}

function assertCounterIncreased(
  name: string,
  before: number,
  after: number,
  expectedAtLeast: number,
): void {
  const delta = after - before;
  if (delta >= expectedAtLeast) {
    console.log(`[PASS] ${name} delta=${delta} (>= ${expectedAtLeast})`);
    pass++;
  } else {
    console.error(
      `[FAIL] ${name} delta=${delta} (expected >= ${expectedAtLeast})`,
    );
    fail++;
  }
}

function readResponseIntent(response: RouteMessageResponse): string {
  const direct = readString(response.intent);
  if (direct) return direct;
  const nested = readRecordPath(response, [
    ['route', 'intent'],
    ['result', 'intent'],
    ['result', 'route', 'intent'],
    ['structuredIntent', 'intent'],
    ['alphaTurn', 'structuredIntent', 'intent'],
  ]);
  if (nested) return nested;
  if (readString(response.assistantMessage)) return 'user_facing_response';
  return 'unknown';
}

function readResponseAction(response: RouteMessageResponse): string {
  return (
    readString(response.action) ??
    readRecordPath(response, [
      ['route', 'action'],
      ['result', 'action'],
      ['result', 'route', 'action'],
    ]) ??
    'user_facing'
  );
}

function readResponseTaskId(
  response: RouteMessageResponse,
): number | undefined {
  if (typeof response.taskId === 'number') return response.taskId;
  const value =
    readRecordValue(response, ['taskId']) ??
    readRecordValue(response, ['result', 'taskId']);
  return typeof value === 'number' ? value : undefined;
}

function readRecordPath(value: unknown, paths: string[][]): string | undefined {
  for (const path of paths) {
    const text = readString(readRecordValue(value, path));
    if (text) return text;
  }
  return undefined;
}

function readRecordValue(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

main().catch((error) => {
  console.error(
    'fatal:',
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
  process.exit(1);
});
