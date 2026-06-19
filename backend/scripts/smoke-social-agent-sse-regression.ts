/**
 * Full-chain SSE regression for the Social Agent chat surface.
 *
 * This script intentionally reads the response body chunk-by-chunk instead of
 * calling res.text(), so it can verify first-token latency, real assistant
 * deltas, client abort, and reconnect behavior against a running API.
 *
 * Required env:
 *   FITMEET_API_BASE_URL        e.g. http://127.0.0.1:3100/api
 *   USER_JWT                   JWT for a real test user
 *
 * Optional env:
 *   EXPECT_REAL_LLM_STREAM     true => fail when deltas are fallback-only
 *   SMOKE_TIMEOUT_MS           per-stream timeout, default 45000
 */

const baseUrl = (process.env.FITMEET_API_BASE_URL ?? '').replace(/\/$/, '');
const userJwt = process.env.USER_JWT ?? process.env.FITMEET_USER_JWT;
const streamTimeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? '45000');
const expectRealLlmStream = process.env.EXPECT_REAL_LLM_STREAM === 'true';

if (!baseUrl || !userJwt) {
  console.error('Missing env: FITMEET_API_BASE_URL and USER_JWT are required.');
  process.exit(1);
}

type JsonRecord = Record<string, unknown>;

type SseEvent = {
  event: string;
  data: JsonRecord;
  atMs: number;
};

type StreamProbeResult = {
  label: string;
  path: string;
  status: number;
  events: SseEvent[];
  deltaCount: number;
  doneCount: number;
  resultCount: number;
  fallbackDeltaCount: number;
  llmDeltaCount: number;
  firstDeltaMs: number | null;
  abortedByClient: boolean;
};

let pass = 0;
let fail = 0;

async function main(): Promise<void> {
  console.log(
    `SSE regression base=${baseUrl} expectRealLlmStream=${expectRealLlmStream}`,
  );

  const first = await runStreamProbe({
    label: 'messages/stream real delta',
    path: '/social-agent/chat/messages/stream',
    body: {
      message:
        '请用自然中文回答：我今天有点紧张，给我一句简短安慰。不要搜索候选人。',
    },
  });
  assertHealthyStream(first, { requireRealLlm: expectRealLlmStream });

  const taskId = await latestTaskId();
  if (!taskId) {
    recordFail('session task id', 'messages/stream 后没有恢复到 activeTaskId');
  } else {
    recordPass('session task id', `activeTaskId=${taskId}`);
  }

  const route = await runStreamProbe({
    label: 'route-message/stream real delta',
    path: '/social-agent/chat/route-message/stream',
    body: {
      message: '继续刚才的语气，用一句话告诉我 FitMeet Agent 能帮我什么。',
      taskId,
    },
  });
  assertHealthyStream(route, { requireRealLlm: expectRealLlmStream });

  if (taskId) {
    const taskStream = await runStreamProbe({
      label: 'tasks/:id/messages/stream real delta',
      path: `/social-agent/chat/tasks/${taskId}/messages/stream`,
      body: {
        message: '这是同一个任务里的追问，请用一句话接住上下文。',
      },
    });
    assertHealthyStream(taskStream, {
      requireRealLlm: expectRealLlmStream,
    });
  }

  const userRun = await runStreamProbe({
    label: 'stream-user run delta',
    path: '/social-agent/chat/stream-user',
    body: {
      goal: '帮我规划一个低压力的线下认识新朋友方式，只需要先给自然回答。',
      taskId,
      permissionMode: 'confirm',
    },
  });
  assertHealthyStream(userRun, { requireRealLlm: expectRealLlmStream });

  const abortedAfterDelta = await runStreamProbe({
    label: 'messages/stream client abort after llm delta',
    path: '/social-agent/chat/messages/stream',
    body: {
      message:
        '请分六段详细讲讲如何自然认识跑步搭子，重点说开场、节奏、边界和公共场所。',
    },
    abortAfterDeltaCount: 1,
  });
  if (
    abortedAfterDelta.abortedByClient &&
    abortedAfterDelta.llmDeltaCount > 0 &&
    abortedAfterDelta.doneCount === 0 &&
    abortedAfterDelta.resultCount === 0
  ) {
    recordPass(
      'client abort after llm delta',
      `aborted after llmDelta=${abortedAfterDelta.llmDeltaCount}, totalEvents=${abortedAfterDelta.events.length}`,
    );
  } else {
    recordFail(
      'client abort after llm delta',
      `aborted=${abortedAfterDelta.abortedByClient}, llm=${abortedAfterDelta.llmDeltaCount}, done=${abortedAfterDelta.doneCount}, result=${abortedAfterDelta.resultCount}`,
    );
  }

  const aborted = await runStreamProbe({
    label: 'messages/stream client abort',
    path: '/social-agent/chat/messages/stream',
    body: {
      message: '请分六段详细讲讲如何自然认识跑步搭子，这条用于测试停止生成。',
      taskId,
    },
    abortAfterEventCount: 1,
  });
  if (aborted.abortedByClient && aborted.events.length > 0) {
    recordPass(
      'client abort',
      `aborted after ${aborted.events.length} event(s), deltaCount=${aborted.deltaCount}`,
    );
  } else {
    recordFail(
      'client abort',
      `aborted=${aborted.abortedByClient}, eventCount=${aborted.events.length}, deltaCount=${aborted.deltaCount}`,
    );
  }

  await sleep(300);

  const reconnect = await runStreamProbe({
    label: 'messages/stream reconnect after abort',
    path: '/social-agent/chat/messages/stream',
    body: {
      message: '刚才停止后继续，用一句话自然收尾。',
      taskId,
    },
  });
  assertHealthyStream(reconnect, { requireRealLlm: expectRealLlmStream });

  console.log(`\nresult: pass=${pass} fail=${fail}`);
  if (fail > 0) process.exit(1);
}

async function runStreamProbe(input: {
  label: string;
  path: string;
  body: JsonRecord;
  abortAfterDeltaCount?: number;
  abortAfterEventCount?: number;
}): Promise<StreamProbeResult> {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeout = setTimeout(() => controller.abort(), streamTimeoutMs);
  const events: SseEvent[] = [];
  let status = 0;
  let abortedByClient = false;
  let buffer = '';

  try {
    const response = await fetch(`${baseUrl}${input.path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${userJwt}`,
        'content-type': 'application/json',
        connection: 'close',
      },
      body: JSON.stringify(input.body),
      signal: controller.signal,
    });
    status = response.status;
    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status} ${text.slice(0, 300)}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let deltaCount = 0;

    while (true) {
      const read = await reader.read();
      if (read.done) break;
      buffer += decoder.decode(read.value, { stream: true });
      const parsed = drainSseBuffer(buffer, startedAt);
      buffer = parsed.remaining;
      for (const event of parsed.events) {
        events.push(event);
        if (event.event === 'assistant_delta') deltaCount++;
        if (
          input.abortAfterEventCount &&
          events.length >= input.abortAfterEventCount
        ) {
          abortedByClient = true;
          controller.abort();
          await reader.cancel().catch(() => undefined);
          return summarizeProbe(input.label, input.path, status, events, true);
        }
        if (
          input.abortAfterDeltaCount &&
          deltaCount >= input.abortAfterDeltaCount
        ) {
          abortedByClient = true;
          controller.abort();
          await reader.cancel().catch(() => undefined);
          return summarizeProbe(input.label, input.path, status, events, true);
        }
      }
    }
    if (buffer.trim()) {
      const parsed = drainSseBuffer(`${buffer}\n\n`, startedAt);
      buffer = parsed.remaining;
      for (const event of parsed.events) {
        events.push(event);
        if (event.event === 'assistant_delta') deltaCount++;
        if (
          input.abortAfterDeltaCount &&
          deltaCount >= input.abortAfterDeltaCount
        ) {
          abortedByClient = true;
          controller.abort();
          await reader.cancel().catch(() => undefined);
          return summarizeProbe(input.label, input.path, status, events, true);
        }
      }
    }
  } catch (error) {
    if (abortedByClient || isAbortError(error)) {
      return summarizeProbe(input.label, input.path, status, events, true);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const summary = summarizeProbe(
    input.label,
    input.path,
    status,
    events,
    abortedByClient,
  );
  console.log(
    `[SSE] ${summary.label}: status=${summary.status} deltas=${summary.deltaCount} llm=${summary.llmDeltaCount} fallback=${summary.fallbackDeltaCount} done=${summary.doneCount} result=${summary.resultCount} firstDeltaMs=${summary.firstDeltaMs}`,
  );
  return summary;
}

function drainSseBuffer(
  input: string,
  startedAt: number,
): { events: SseEvent[]; remaining: string } {
  const events: SseEvent[] = [];
  let buffer = input;
  while (true) {
    const separator = buffer.indexOf('\n\n');
    if (separator < 0) break;
    const block = buffer.slice(0, separator);
    buffer = buffer.slice(separator + 2);
    const event = parseSseBlock(block, startedAt);
    if (event) events.push(event);
  }
  return { events, remaining: buffer };
}

function parseSseBlock(block: string, startedAt: number): SseEvent | null {
  const lines = block.split(/\r?\n/);
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart());
    }
  }
  if (dataLines.length === 0) return null;
  const rawData = dataLines.join('\n');
  let data: JsonRecord;
  try {
    const parsed = JSON.parse(rawData) as unknown;
    data = isRecord(parsed) ? parsed : { value: parsed };
  } catch {
    data = { rawData };
  }
  return { event, data, atMs: Date.now() - startedAt };
}

function summarizeProbe(
  label: string,
  path: string,
  status: number,
  events: SseEvent[],
  abortedByClient: boolean,
): StreamProbeResult {
  const deltas = events.filter((event) => event.event === 'assistant_delta');
  return {
    label,
    path,
    status,
    events,
    deltaCount: deltas.length,
    doneCount: events.filter((event) => event.event === 'assistant_done')
      .length,
    resultCount: events.filter((event) => event.event === 'result').length,
    fallbackDeltaCount: deltas.filter(
      (event) => readString(event.data.source) === 'fallback',
    ).length,
    llmDeltaCount: deltas.filter(
      (event) => readString(event.data.source) === 'llm',
    ).length,
    firstDeltaMs: deltas[0]?.atMs ?? null,
    abortedByClient,
  };
}

function assertHealthyStream(
  summary: StreamProbeResult,
  options: { requireRealLlm: boolean; allowToolOnly?: boolean },
): void {
  if (summary.status !== 200) {
    recordFail(summary.label, `HTTP status=${summary.status}`);
    return;
  }
  if (summary.deltaCount <= 0) {
    if (options.allowToolOnly && summary.resultCount > 0) {
      recordPass(summary.label, 'tool-only result stream completed');
      return;
    }
    recordFail(summary.label, 'missing assistant_delta');
    return;
  }
  if (summary.doneCount <= 0 && summary.resultCount <= 0) {
    recordFail(summary.label, 'missing assistant_done/result');
    return;
  }
  if (summary.doneCount > 1 || summary.resultCount > 1) {
    recordFail(
      summary.label,
      `duplicate completion events: done=${summary.doneCount}, result=${summary.resultCount}`,
    );
    return;
  }
  if (options.requireRealLlm && summary.llmDeltaCount <= 0) {
    recordFail(
      summary.label,
      `fallback-only stream: fallback=${summary.fallbackDeltaCount}, llm=${summary.llmDeltaCount}`,
    );
    return;
  }
  recordPass(
    summary.label,
    `deltas=${summary.deltaCount}, llm=${summary.llmDeltaCount}, fallback=${summary.fallbackDeltaCount}, firstDeltaMs=${summary.firstDeltaMs}`,
  );
}

async function latestTaskId(): Promise<number | null> {
  const response = await fetch(`${baseUrl}/social-agent/chat/session`, {
    headers: { authorization: `Bearer ${userJwt}` },
  });
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!isRecord(payload)) return null;
  return readNumber(payload.activeTaskId) ?? readNestedTaskId(payload);
}

function readNestedTaskId(input: unknown): number | null {
  if (!isRecord(input)) return null;
  const direct = readNumber(input.taskId) ?? readNumber(input.id);
  if (direct) return direct;
  for (const value of Object.values(input)) {
    const nested = readNestedTaskId(value);
    if (nested) return nested;
  }
  return null;
}

function recordPass(label: string, detail: string): void {
  pass++;
  console.log(`[PASS] ${label}: ${detail}`);
}

function recordFail(label: string, detail: string): void {
  fail++;
  console.error(`[FAIL] ${label}: ${detail}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || /aborted/i.test(error.message))
  );
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
