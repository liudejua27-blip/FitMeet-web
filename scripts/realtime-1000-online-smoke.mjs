#!/usr/bin/env node
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';

const requireFromFrontend = createRequire(
  new URL('../frontend/package.json', import.meta.url),
);
const { io } = requireFromFrontend('socket.io-client');

function usage() {
  console.log(`Usage: node scripts/realtime-1000-online-smoke.mjs

Socket.IO online-capacity smoke for App/Web realtime paths.

Environment:
  REALTIME_SMOKE_BASE_URL       Target origin, default LOAD_TEST_BASE_URL or http://localhost:3000
  REALTIME_SMOKE_CONNECTIONS    Simultaneous logical users, default 1000
  REALTIME_SMOKE_NAMESPACES     Socket.IO namespaces per user, default realtime,messages
  REALTIME_SMOKE_TOKEN          JWT access token to reuse for smoke connections
  REALTIME_SMOKE_EMAIL          Optional login email when token is not set
  REALTIME_SMOKE_PASSWORD       Optional login password when token is not set
  REALTIME_SMOKE_CONNECT_BATCH  Connections started per batch, default 100
  REALTIME_SMOKE_CONNECT_GAP_MS Delay between batches, default 25
  REALTIME_SMOKE_TIMEOUT_MS     Per-socket connect timeout, default 15000
  REALTIME_SMOKE_HOLD_MS        Time to keep all sockets online, default 5000
  REALTIME_SMOKE_P95_MS         Maximum connect p95, default 3000
  REALTIME_SMOKE_MAX_ERROR_RATE Maximum error rate percent, default 1
  REALTIME_SMOKE_ALLOW_REMOTE   Required as true for non-local targets

Example:
  REALTIME_SMOKE_BASE_URL=https://www.ourfitmeet.cn \\
  REALTIME_SMOKE_ALLOW_REMOTE=true \\
  REALTIME_SMOKE_EMAIL=test@example.com \\
  REALTIME_SMOKE_PASSWORD='***' \\
  node scripts/realtime-1000-online-smoke.mjs
`);
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  usage();
  process.exit(0);
}

const baseURL = new URL(
  process.env.REALTIME_SMOKE_BASE_URL ??
    process.env.LOAD_TEST_BASE_URL ??
    'http://localhost:3000',
);
const connections = positiveInt(process.env.REALTIME_SMOKE_CONNECTIONS, 1000);
const namespaces = namespaceList(process.env.REALTIME_SMOKE_NAMESPACES);
const batchSize = positiveInt(process.env.REALTIME_SMOKE_CONNECT_BATCH, 100);
const batchGapMs = positiveInt(process.env.REALTIME_SMOKE_CONNECT_GAP_MS, 25);
const timeoutMs = positiveInt(process.env.REALTIME_SMOKE_TIMEOUT_MS, 15_000);
const holdMs = positiveInt(process.env.REALTIME_SMOKE_HOLD_MS, 5000);
const p95LimitMs = positiveInt(process.env.REALTIME_SMOKE_P95_MS, 3000);
const maxErrorRate = positiveNumber(
  process.env.REALTIME_SMOKE_MAX_ERROR_RATE,
  1,
);
const allowRemote = process.env.REALTIME_SMOKE_ALLOW_REMOTE === 'true';

if (!isLocalTarget(baseURL) && !allowRemote) {
  throw new Error(
    `Refusing to open ${connections} realtime sockets against remote target ${baseURL.origin}. Set REALTIME_SMOKE_ALLOW_REMOTE=true for an intentional staging/production run.`,
  );
}

const token = await resolveAccessToken();
if (!token) {
  throw new Error(
    'Set REALTIME_SMOKE_TOKEN or REALTIME_SMOKE_EMAIL/REALTIME_SMOKE_PASSWORD.',
  );
}

const startedAt = performance.now();
const sockets = [];
const results = [];
const connectJobs = Array.from({ length: connections }, (_, userIndex) =>
  namespaces.map((namespace) => ({ userIndex, namespace })),
).flat();

try {
  for (let index = 0; index < connectJobs.length; index += batchSize) {
    const batch = connectJobs
      .slice(index, index + batchSize)
      .map((job) => connectSocket(job, token));
    results.push(...(await Promise.all(batch)));
    if (index + batchSize < connectJobs.length) await sleep(batchGapMs);
  }

  const failures = results.filter((result) => result.ok === false);
  const latencies = results
    .filter((result) => result.ok)
    .map((result) => result.durationMs)
    .sort((a, b) => a - b);
  const connected = sockets.filter((socket) => socket.connected).length;
  await sleep(holdMs);
  const stillOnline = sockets.filter((socket) => socket.connected).length;
  const errorRate = (failures.length / results.length) * 100;
  const p95 = percentile(latencies, 95);
  const elapsedMs = performance.now() - startedAt;

  console.log(
    JSON.stringify(
      {
        target: baseURL.origin,
        namespaces,
        requestedUsers: connections,
        requestedSockets: connectJobs.length,
        connected,
        stillOnline,
        elapsedMs: Math.round(elapsedMs),
        errors: failures.length,
        errorRate: round(errorRate),
        p95ConnectMs: Math.round(p95),
        holdMs,
      },
      null,
      2,
    ),
  );

  if (failures.length > 0) {
    console.error('First connection failures:');
    for (const failure of failures.slice(0, 5)) {
      console.error(
        `  user=${failure.userIndex} namespace=${failure.namespace}: ${failure.error}`,
      );
    }
  }

  if (
    errorRate > maxErrorRate ||
    p95 > p95LimitMs ||
    stillOnline < connectJobs.length - failures.length
  ) {
    throw new Error(
      `Realtime online smoke failed thresholds: errorRate=${round(errorRate)}%/${maxErrorRate}%, p95=${Math.round(p95)}ms/${p95LimitMs}ms, stillOnline=${stillOnline}/${connectJobs.length - failures.length}.`,
    );
  }

  console.log('PASS: realtime online-capacity smoke passed thresholds.');
} finally {
  for (const socket of sockets) socket.disconnect();
}

async function resolveAccessToken() {
  const token = process.env.REALTIME_SMOKE_TOKEN?.trim();
  if (token) return token;
  const email = process.env.REALTIME_SMOKE_EMAIL?.trim();
  const password = process.env.REALTIME_SMOKE_PASSWORD;
  if (!email || !password) return null;

  const response = await fetch(new URL('/api/auth/login', baseURL), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(`Login failed with HTTP ${response.status}`);
  }
  const payload = await response.json();
  return (
    string(payload.access_token) ??
    string(payload.accessToken) ??
    string(payload.token)
  );
}

function connectSocket(job, token) {
  const started = performance.now();
  return new Promise((resolve) => {
    const socket = io(`${baseURL.origin}/${job.namespace}`, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { token },
      query: { token },
      reconnection: false,
      timeout: timeoutMs,
      forceNew: true,
    });
    sockets.push(socket);

    const timer = setTimeout(() => {
      cleanup();
      socket.disconnect();
      resolve({
        ok: false,
        userIndex: job.userIndex,
        namespace: job.namespace,
        durationMs: performance.now() - started,
        error: `connect timeout after ${timeoutMs}ms`,
      });
    }, timeoutMs + 500);

    const cleanup = () => {
      clearTimeout(timer);
      socket.off('realtime:connected', onConnected);
      socket.off('connect', onSocketConnect);
      socket.off('connect_error', onError);
      socket.off('disconnect', onDisconnectBeforeReady);
    };

    const onConnected = () => {
      cleanup();
      resolve({
        ok: true,
        userIndex: job.userIndex,
        namespace: job.namespace,
        durationMs: performance.now() - started,
      });
    };
    const onSocketConnect = () => {
      if (job.namespace === 'realtime') return;
      onConnected();
    };
    const onError = (error) => {
      cleanup();
      socket.disconnect();
      resolve({
        ok: false,
        userIndex: job.userIndex,
        namespace: job.namespace,
        durationMs: performance.now() - started,
        error: error?.message ?? String(error),
      });
    };
    const onDisconnectBeforeReady = (reason) => {
      cleanup();
      resolve({
        ok: false,
        userIndex: job.userIndex,
        namespace: job.namespace,
        durationMs: performance.now() - started,
        error: `disconnected before ready: ${reason}`,
      });
    };

    socket.once('realtime:connected', onConnected);
    socket.once('connect', onSocketConnect);
    socket.once('connect_error', onError);
    socket.once('disconnect', onDisconnectBeforeReady);
  });
}

function percentile(sortedValues, percent) {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((percent / 100) * sortedValues.length) - 1;
  return sortedValues[Math.min(Math.max(index, 0), sortedValues.length - 1)];
}

function isLocalTarget(url) {
  return ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function namespaceList(value) {
  const namespaces = (value ?? 'realtime,messages')
    .split(',')
    .map((item) => item.trim().replace(/^\/+/, ''))
    .filter(Boolean);
  const allowed = new Set(['realtime', 'messages']);
  const normalized = namespaces.filter((item) => allowed.has(item));
  return normalized.length ? [...new Set(normalized)] : ['realtime', 'messages'];
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function string(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
