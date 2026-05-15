/**
 * Smoke test for OpenClaw -> FitMeet -> website messages -> Agent Inbox.
 *
 * Required env:
 *   FITMEET_API_BASE_URL   e.g. https://www.ourfitmeet.cn/api
 *   AGENT_TOKEN            OpenClaw / FitMeet agent token
 *   OTHER_USER_JWT         JWT for the candidate/other website user
 *
 * Optional:
 *   REQUEST_TYPE           default coffee_chat
 *   REQUEST_CITY           default Shanghai
 *
 * Run:
 *   node --experimental-strip-types backend/scripts/smoke-agent-inbox-openclaw.ts
 */

const baseUrl = (process.env.FITMEET_API_BASE_URL ?? '').replace(/\/$/, '');
const agentToken = process.env.AGENT_TOKEN ?? process.env.FITMEET_AGENT_TOKEN;
const otherUserJwt = process.env.OTHER_USER_JWT ?? process.env.FITMEET_OTHER_USER_JWT;

if (!baseUrl || !agentToken || !otherUserJwt) {
  console.error(
    'Missing env: FITMEET_API_BASE_URL, AGENT_TOKEN, OTHER_USER_JWT are required.',
  );
  process.exit(1);
}

let step = 0;

async function main() {
  const requestType = process.env.REQUEST_TYPE ?? 'coffee_chat';
  const city = process.env.REQUEST_CITY ?? 'Shanghai';

  const created = await run('create social request', () =>
    api('/agent/social-requests', {
      method: 'POST',
      auth: 'agent',
      body: {
        requestType,
        description: `OpenClaw inbox smoke ${new Date().toISOString()}`,
        city,
        radiusKm: 50,
        interests: ['coffee', 'fitness'],
        limit: 5,
      },
    }),
  );

  const candidates = Array.isArray(created.candidates)
    ? created.candidates
    : [];
  assert(candidates.length > 0, 'social request returned no candidates');
  const requestId = Number(created.request?.id);
  const candidateUserId = Number(candidates[0]?.profile?.id);
  assert(Number.isFinite(requestId), 'missing request.id');
  assert(Number.isFinite(candidateUserId), 'missing candidate user id');

  const inboxAfterMatch = await run('inbox has match.completed', () =>
    api('/agent/inbox/conversations?limit=20', { auth: 'agent' }),
  );
  assert(
    hasEvent(inboxAfterMatch, 'match.completed', { requestId }),
    'match.completed event not found in inbox',
  );

  const decision = await run('send intro to candidate', () =>
    api(`/agent/social-requests/${requestId}/candidates/decision`, {
      method: 'POST',
      auth: 'agent',
      body: {
        candidateUserId,
        decision: 'approve',
        connectionAction: 'send_intro',
        ownerConfirmed: true,
        note: `Intro from OpenClaw smoke ${new Date().toISOString()}`,
      },
    }),
  );
  const conversationId = String(decision.conversationId ?? '');
  assert(conversationId, 'decision did not return conversationId');

  const websiteReply = await run('website user replies in same conversation', () =>
    api(`/messages/conversations/${conversationId}/send`, {
      method: 'POST',
      auth: 'other',
      body: {
        text: `Website reply smoke ${new Date().toISOString()}`,
      },
    }),
  );

  const inboxAfterReply = await run('inbox has message.received', () =>
    api('/agent/inbox/conversations?limit=20', { auth: 'agent' }),
  );
  assert(
    hasEvent(inboxAfterReply, 'message.received', {
      conversationId,
      messageId: websiteReply.id,
    }),
    'message.received event not found in inbox',
  );

  const thread = await run('agent reads real conversation messages', () =>
    api(`/agent/inbox/conversations/${conversationId}/messages?limit=50`, {
      auth: 'agent',
    }),
  );
  assert(
    Array.isArray(thread.messages) &&
      thread.messages.some((m: any) => String(m.id) === String(websiteReply.id)),
    'website reply not found in agent inbox messages',
  );

  const agentReply = await run('agent replies into same conversation', () =>
    api(`/agent/inbox/conversations/${conversationId}/reply`, {
      method: 'POST',
      auth: 'agent',
      body: {
        content: `Agent reply smoke ${new Date().toISOString()}`,
      },
    }),
  );
  assert(
    String(agentReply.conversationId) === conversationId,
    'agent reply did not stay in same conversation',
  );

  const activity = await run('activity log includes inbox events', () =>
    api('/agent/activity?limit=50', { auth: 'agent' }),
  );
  const rows = Array.isArray(activity.items) ? activity.items : [];
  assert(
    rows.some((row: any) => row.eventType === 'message.received'),
    'agent_activity_logs missing message.received',
  );
  assert(
    rows.some((row: any) => row.eventType === 'agent.inbox.updated'),
    'agent_activity_logs missing agent.inbox.updated',
  );

  console.log('\nAll OpenClaw inbox smoke steps passed.');
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

function hasEvent(
  payload: any,
  eventType: string,
  filters: { requestId?: number; conversationId?: string; messageId?: string },
) {
  const events = Array.isArray(payload.events) ? payload.events : [];
  return events.some((event: any) => {
    if (event.eventType !== eventType && event.event !== eventType) return false;
    if (
      filters.requestId != null &&
      Number(event.requestId ?? event.metadata?.requestId) !== filters.requestId
    ) {
      return false;
    }
    if (
      filters.conversationId &&
      String(event.conversationId ?? event.metadata?.conversationId) !==
        filters.conversationId
    ) {
      return false;
    }
    if (
      filters.messageId &&
      String(event.messageId ?? event.metadata?.messageId) !== filters.messageId
    ) {
      return false;
    }
    return true;
  });
}

async function api(
  path: string,
  opts: {
    method?: string;
    auth: 'agent' | 'other';
    body?: unknown;
  },
) {
  const token = opts.auth === 'agent' ? agentToken : otherUserJwt;
  const res = await fetch(`${baseUrl}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  const data = text ? safeJson(text) : {};
  if (!res.ok) {
    throw new Error(
      `${opts.method ?? 'GET'} ${path} failed ${res.status}: ${JSON.stringify(
        data,
      ).slice(0, 800)}`,
    );
  }
  return data as any;
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
