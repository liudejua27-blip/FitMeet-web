/**
 * OpenClaw Agent Token smoke test for the FitMeet profile tool loop.
 *
 * Required env:
 *   FITMEET_API_BASE_URL   e.g. https://www.ourfitmeet.cn/api
 *   FITMEET_AGENT_TOKEN    OpenClaw / FitMeet personal agent token
 *
 * Run:
 *   node --experimental-strip-types backend/scripts/smoke-openclaw-profile-tools.ts
 */

type JsonObject = Record<string, unknown>;

const baseUrl = (process.env.FITMEET_API_BASE_URL ?? '').replace(/\/$/, '');
const agentToken = process.env.FITMEET_AGENT_TOKEN ?? process.env.AGENT_TOKEN;

if (!baseUrl || !agentToken) {
  console.error('Missing env: FITMEET_API_BASE_URL and FITMEET_AGENT_TOKEN are required.');
  process.exit(1);
}

let step = 0;

async function main() {
  await run('token valid: read social-skills manifest', () =>
    api('/agent/skills/manifest'),
  );

  await run('read profile status', () =>
    api('/agent/owner/social-profile/status'),
  );

  const questionsPayload = await run('generate profile questions', () =>
    api('/agent/owner/social-profile/questions'),
  );
  const firstQuestion = pickFirstQuestion(questionsPayload);
  const answerKey = firstQuestion?.key ?? 'nickname';
  const questionText = firstQuestion?.question ?? 'OpenClaw profile smoke answer';

  await run('upload one profile answer', () =>
    api('/agent/owner/social-profile/answers', {
      method: 'POST',
      body: {
        key: answerKey,
        answer: `OpenClaw profile smoke answer ${new Date().toISOString()}`,
      },
    }),
  );

  const draftPayload = await run('generate profile draft', () =>
    api('/agent/owner/social-profile/ai-draft', {
      method: 'POST',
      body: {
        answers: [
          {
            key: answerKey,
            question: questionText,
            answer: 'I want a safe fitness partner nearby and prefer in-platform contact first.',
          },
        ],
        rawText: 'OpenClaw smoke test profile draft. Prefer safe public places and respectful pacing.',
        source: 'openclaw_profile_smoke',
      },
    }),
  );
  const draft = (draftPayload as { draft?: JsonObject }).draft;
  assert(draft && typeof draft === 'object', 'profile draft missing draft object');

  await run('ownerConfirmed=true saves profile', () =>
    api('/agent/owner/social-profile/ai-save', {
      method: 'POST',
      body: {
        profile: draft,
        enableMatching: true,
        ownerConfirmed: true,
        sensitiveTagsConfirmed: true,
      },
    }),
  );

  await run('read profile recommendation events', () =>
    api('/agent/owner/profile-recommendations/events?limit=20&unreadOnly=false'),
  );

  console.log('\nAll OpenClaw profile tool smoke steps passed.');
}

async function run<T>(label: string, fn: () => Promise<T>): Promise<T> {
  step += 1;
  process.stdout.write(`Step ${step}: ${label} ... `);
  try {
    const result = await fn();
    console.log('ok');
    return result;
  } catch (err) {
    console.log('failed');
    throw err;
  }
}

async function api(path: string, opts: { method?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${agentToken}`,
  };
  if (agentToken) headers['X-Agent-Token'] = agentToken;
  const res = await fetch(`${baseUrl}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  const data = text ? safeJson(text) : {};
  if (!res.ok) {
    throw new Error(
      `${opts.method ?? 'GET'} ${path} failed ${res.status}: ${JSON.stringify(data).slice(0, 800)}`,
    );
  }
  return data as JsonObject;
}

function pickFirstQuestion(payload: JsonObject) {
  const questions = Array.isArray(payload.questions)
    ? payload.questions
    : Array.isArray((payload.data as JsonObject | undefined)?.questions)
      ? ((payload.data as JsonObject).questions as unknown[])
      : [];
  const first = questions[0];
  if (!first || typeof first !== 'object') return null;
  return first as { key?: string; question?: string };
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
