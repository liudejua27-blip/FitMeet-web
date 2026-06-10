type JsonRecord = Record<string, unknown>;

const apiBase = requiredEnv('FITMEET_API_BASE_URL').replace(/\/$/, '');
const adminJwt = requiredEnv('ADMIN_JWT');
const userJwt = process.env.USER_JWT ?? '';
const requireWorker = process.env.REQUIRE_SUBAGENT_WORKER !== 'false';
const allowLogOnlyAlerts = process.env.ALLOW_LOG_ONLY_ALERTS === 'true';
const runSelfImproveSandbox = process.env.RUN_SELF_IMPROVE_SANDBOX === 'true';
const maxHeartbeatAgeMs = positiveInt(
  process.env.WORKER_HEARTBEAT_MAX_AGE_MS,
  120_000,
);

async function main() {
  const results: Array<{ name: string; ok: boolean; detail?: string }> = [];
  const pass = (name: string, detail?: string) => {
    results.push({ name, ok: true, detail });
    console.log(`PASS ${name}${detail ? ` - ${detail}` : ''}`);
  };
  const fail = (name: string, detail?: string) => {
    results.push({ name, ok: false, detail });
    console.error(`FAIL ${name}${detail ? ` - ${detail}` : ''}`);
  };

  const dashboard = await getJson('/social-agent/l5/dashboard', adminJwt);
  if (!dashboard.ok) {
    fail('L5 dashboard reachable', dashboard.detail);
  } else {
    pass('L5 dashboard reachable');
    const data = asRecord(dashboard.data);
    checkWorkerHeartbeats(data, pass, fail);
    checkAlertSink(data, pass, fail);
  }

  const jobs = await getJson('/social-agent/l5/subagent-worker-jobs', adminJwt);
  if (jobs.ok) pass('subagent worker job API reachable');
  else fail('subagent worker job API reachable', jobs.detail);

  if (userJwt) {
    await checkHighRiskApprovalGate(pass, fail);
  } else {
    console.warn('SKIP high-risk approval HTTP smoke: USER_JWT is not set.');
  }

  if (runSelfImproveSandbox) {
    const runner = await postJson(
      '/social-agent/self-improve/runner/run-once',
      adminJwt,
      { source: 'staging_launch_gate', dryRun: false },
    );
    if (runner.ok) pass('self-improve sandbox runner executed');
    else fail('self-improve sandbox runner executed', runner.detail);

    const effects = await getJson('/social-agent/l5/patch-effects', adminJwt);
    if (effects.ok) pass('self-improve canary effects API reachable');
    else fail('self-improve canary effects API reachable', effects.detail);
  } else {
    console.warn(
      'SKIP self-improve sandbox cycle: RUN_SELF_IMPROVE_SANDBOX=true is not set.',
    );
  }

  const failed = results.filter((item) => !item.ok);
  if (failed.length > 0) {
    console.error(`\nAgent launch gate failed: ${failed.length} check(s).`);
    process.exit(1);
  }
  console.log(`\nAgent launch gate passed: ${results.length} check(s).`);
}

function checkWorkerHeartbeats(
  dashboard: JsonRecord,
  pass: (name: string, detail?: string) => void,
  fail: (name: string, detail?: string) => void,
) {
  const heartbeats = arrayFromDashboard(dashboard, 'workerHeartbeats');
  if (!requireWorker) {
    pass('independent subagent worker heartbeat optional');
    return;
  }
  if (heartbeats.length === 0) {
    fail('independent subagent worker heartbeat', 'no heartbeat rows');
    return;
  }
  const fresh = heartbeats.some((item) => {
    const row = asRecord(item);
    const lastSeenAt = dateValue(row.lastSeenAt);
    return lastSeenAt && Date.now() - lastSeenAt.getTime() <= maxHeartbeatAgeMs;
  });
  if (fresh) pass('independent subagent worker heartbeat');
  else fail('independent subagent worker heartbeat', 'heartbeat is stale');
}

function checkAlertSink(
  dashboard: JsonRecord,
  pass: (name: string, detail?: string) => void,
  fail: (name: string, detail?: string) => void,
) {
  const observability = asRecord(dashboard.observability);
  const alertSink = asRecord(observability.alertSink);
  if (alertSink.enabled === false) {
    pass('production alert sink disabled', 'first-launch mode');
    return;
  }
  if (alertSink.configured === true) {
    pass('production alert sink configured');
    return;
  }
  if (allowLogOnlyAlerts) {
    pass('production alert sink configured', 'log-only override enabled');
    return;
  }
  fail('production alert sink configured', 'alert webhook is not configured');
}

async function checkHighRiskApprovalGate(
  pass: (name: string, detail?: string) => void,
  fail: (name: string, detail?: string) => void,
) {
  const task = await postJson('/social-agent/tasks', userJwt, {
    goal: 'staging launch gate: approval smoke task',
    permissionMode: 'limited_auto',
    idempotencyKey: `launch-gate-task-${Date.now()}`,
  });
  const taskId = numericTaskId(task.data);
  if (!task.ok || !taskId) {
    fail('high-risk approval smoke task created', task.detail);
    return;
  }
  pass('high-risk approval smoke task created', `task ${taskId}`);

  const probes: Array<{
    label: string;
    path: string;
    body: JsonRecord;
  }> = [
    {
      label: 'send message',
      path: `/social-agent/tasks/${taskId}/tools/send_message_to_candidate`,
      body: {
        candidateUserId: 999999,
        message: 'staging approval gate smoke',
      },
    },
    {
      label: 'connect candidate',
      path: `/social-agent/tasks/${taskId}/tools/connect_candidate`,
      body: { candidateUserId: 999999 },
    },
    {
      label: 'create activity',
      path: `/social-agent/tasks/${taskId}/tools/create_activity`,
      body: { title: 'staging approval gate smoke', visibility: 'public' },
    },
    {
      label: 'publish social request',
      path: `/social-agent/tasks/${taskId}/tools/publish_social_request`,
      body: { text: 'staging approval gate smoke', publish: true },
    },
    {
      label: 'privacy profile change',
      path: `/social-agent/tasks/${taskId}/tools/update_profile_from_agent_context`,
      body: { patch: { phone: '15253005312' } },
    },
    {
      label: 'payment',
      path: `/social-agent/tasks/${taskId}/tools/payment`,
      body: { amount: 1, currency: 'CNY' },
    },
  ];

  for (const probe of probes) {
    const response = await postJson(probe.path, userJwt, {
      ...probe.body,
      idempotencyKey: `launch-gate-${slug(probe.label)}-${Date.now()}`,
    });
    if (hasApprovalSignal(response.data)) {
      pass(`high-risk approval gate: ${probe.label}`);
      continue;
    }
    if (!response.ok) {
      fail(
        `high-risk approval gate: ${probe.label}`,
        `request failed before approval signal: ${response.detail}`,
      );
      continue;
    }
    fail(
      `high-risk approval gate: ${probe.label}`,
      'response did not expose approval_required or pending_approval',
    );
  }
}

async function getJson(path: string, jwt: string) {
  return requestJson(path, jwt, 'GET');
}

async function postJson(path: string, jwt: string, body: JsonRecord) {
  return requestJson(path, jwt, 'POST', body);
}

async function requestJson(
  path: string,
  jwt: string,
  method: 'GET' | 'POST',
  body?: JsonRecord,
): Promise<{ ok: boolean; status: number; data: unknown; detail?: string }> {
  try {
    const response = await fetch(`${apiBase}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    const data = text ? safeJson(text) : null;
    return {
      ok: response.ok,
      status: response.status,
      data,
      detail: response.ok
        ? undefined
        : `${response.status} ${text.slice(0, 300)}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function hasApprovalSignal(value: unknown): boolean {
  const text = JSON.stringify(value ?? {}).toLowerCase();
  return (
    text.includes('approval_required') ||
    text.includes('pending_approval') ||
    text.includes('approvalid') ||
    text.includes('pendingconfirmations') ||
    text.includes('requiresconfirmation')
  );
}

function numericTaskId(value: unknown): number | null {
  const record = asRecord(value);
  const candidates = [
    record.id,
    record.taskId,
    asRecord(record.task).id,
    asRecord(record.data).id,
    asRecord(record.data).taskId,
  ];
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function arrayFromDashboard(dashboard: JsonRecord, key: string): unknown[] {
  const direct = dashboard[key];
  if (Array.isArray(direct)) return direct;
  const runtime = asRecord(dashboard.runtime);
  if (Array.isArray(runtime[key])) return runtime[key] as unknown[];
  const data = asRecord(dashboard.data);
  if (Array.isArray(data[key])) return data[key] as unknown[];
  return [];
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function requiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`${key} is required.`);
    process.exit(1);
  }
  return value;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

void main();
