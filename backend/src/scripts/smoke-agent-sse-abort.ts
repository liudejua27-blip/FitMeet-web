/**
 * Real HTTP/SSE abort smoke for FitMeet Agent streaming.
 *
 * It opens the user-facing Agent run stream, waits for the first assistant
 * delta, aborts the HTTP request, and verifies the client did not receive a
 * complete result after the abort. Server-side AbortSignal propagation is
 * covered by controller tests; this script proves the deployed HTTP path is
 * abortable from a real client.
 *
 * Required auth, choose one:
 *   USER_JWT / FITMEET_USER_JWT
 *   or AGENT_SMOKE_EMAIL + AGENT_SMOKE_PASSWORD
 *
 * Optional env:
 *   FITMEET_API_BASE_URL / AGENT_SMOKE_API_BASE_URL / API_BASE_URL
 *   AGENT_SMOKE_ALLOW_REMOTE=true for non-local targets
 *   AGENT_SMOKE_ALLOW_NON_SMOKE_USER=true to use a non-smoke email remotely
 *   AGENT_SMOKE_ALLOW_JWT_MUTATIONS=true to use USER_JWT remotely
 *   AGENT_SSE_ABORT_TIMEOUT_MS=15000
 */

type JsonRecord = Record<string, unknown>;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const API_BASE_URL = resolveApiBaseUrl();
const REQUEST_TIMEOUT_MS = positiveInt(
  process.env.AGENT_SSE_ABORT_TIMEOUT_MS,
  15_000,
);

async function main() {
  assertRemoteIntent();
  assertRemoteSmokeAccountSafety();
  const token = await resolveUserToken();
  const result = await abortAfterFirstAssistantDelta(token);
  if (!result.sawAssistantDelta) {
    throw new Error(
      'SSE abort smoke did not receive assistant_delta before abort.',
    );
  }
  if (result.sawResult) {
    throw new Error('SSE abort smoke received result after client abort.');
  }
  console.log(
    `[agent-sse-abort-smoke] PASS (events=${result.events.join(',')})`,
  );
}

async function abortAfterFirstAssistantDelta(token: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const response = await fetch(
    `${API_BASE_URL}/social-agent/chat/stream-user`,
    {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        goal: '请用比较详细但自然的方式解释 FitMeet Agent 如何帮助我安排一场低压力运动社交。收到第一段回复后我会停止生成。',
      }),
      signal: controller.signal,
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `/social-agent/chat/stream-user HTTP ${response.status}: ${text.slice(0, 500)}`,
    );
  }
  if (!response.body) throw new Error('SSE response did not expose a body.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events: string[] = [];
  let sawAssistantDelta = false;
  let sawResult = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = drainSseBlocks(buffer);
      buffer = parsed.remainder;
      for (const event of parsed.events) {
        const eventName = eventNameOrType(event);
        events.push(eventName);
        if (eventName === 'result') sawResult = true;
        if (eventName === 'assistant_delta') {
          const data = asRecord(event.data);
          if (readString(data.delta)) {
            sawAssistantDelta = true;
            controller.abort();
            await reader.cancel().catch(() => undefined);
            clearTimeout(timeout);
            return { sawAssistantDelta, sawResult, events };
          }
        }
      }
    }
  } catch (error) {
    if (!isAbortError(error)) throw error;
  } finally {
    clearTimeout(timeout);
  }
  return { sawAssistantDelta, sawResult, events };
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
  return token;
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

function drainSseBlocks(text: string): {
  events: Array<{ event: string; data: unknown }>;
  remainder: string;
} {
  const parts = text.split(/\n\n+/);
  const remainder = parts.pop() ?? '';
  const events: Array<{ event: string; data: unknown }> = [];
  for (const block of parts) {
    if (!block.trim()) continue;
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    events.push({ event, data: safeJson(dataLines.join('\n')) });
  }
  return { events, remainder };
}

function eventNameOrType(event: { event: string; data: unknown }): string {
  const data = asRecord(event.data);
  return readString(data.type) ?? event.event;
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
    `Refusing to run Agent SSE abort smoke against remote API "${API_BASE_URL}". Set AGENT_SMOKE_ALLOW_REMOTE=true for staging/production.`,
  );
}

function assertRemoteSmokeAccountSafety() {
  const url = new URL(API_BASE_URL);
  if (LOCAL_HOSTS.has(url.hostname)) return;

  const directJwt = process.env.USER_JWT ?? process.env.FITMEET_USER_JWT;
  if (directJwt && !truthy(process.env.AGENT_SMOKE_ALLOW_JWT_MUTATIONS)) {
    throw new Error(
      'Refusing to run remote Agent SSE abort smoke with USER_JWT/FITMEET_USER_JWT. Set AGENT_SMOKE_ALLOW_JWT_MUTATIONS=true only for a dedicated smoke token.',
    );
  }

  const email = process.env.AGENT_SMOKE_EMAIL;
  if (
    email &&
    !looksLikeSmokeAccount(email) &&
    !truthy(process.env.AGENT_SMOKE_ALLOW_NON_SMOKE_USER)
  ) {
    throw new Error(
      `Refusing to run remote Agent SSE abort smoke for non-smoke email "${email}". Use a dedicated smoke account or set AGENT_SMOKE_ALLOW_NON_SMOKE_USER=true intentionally.`,
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

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asRecord(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function safeJson(text: string): unknown {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && /aborted|abort/i.test(error.message))
  );
}

main().catch((error) => {
  console.error(
    `[agent-sse-abort-smoke] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
