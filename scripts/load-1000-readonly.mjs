#!/usr/bin/env node
import { performance } from 'node:perf_hooks';

const DEFAULT_ENDPOINTS = [
  '/api/health',
  '/api/feed?page=1&limit=5',
  '/api/openapi/fitmeet-core.json',
];

function usage() {
  console.log(`Usage: node scripts/load-1000-readonly.mjs

Read-only concurrent smoke for production/staging capacity checks.

Environment:
  LOAD_TEST_BASE_URL       Target origin, default http://localhost:3000
  LOAD_TEST_CONCURRENCY    Simultaneous requests, default 1000
  LOAD_TEST_TIMEOUT_MS     Per-request timeout, default 10000
  LOAD_TEST_P95_MS         Maximum p95 latency, default 1000
  LOAD_TEST_P99_MS         Maximum p99 latency, default 2000
  LOAD_TEST_MAX_ERROR_RATE Maximum error rate percent, default 1
  LOAD_TEST_ALLOW_REMOTE   Required as true for non-local targets

Example:
  LOAD_TEST_BASE_URL=https://www.ourfitmeet.cn \\
  LOAD_TEST_ALLOW_REMOTE=true \\
  node scripts/load-1000-readonly.mjs
`);
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  usage();
  process.exit(0);
}

const baseURL = new URL(process.env.LOAD_TEST_BASE_URL ?? 'http://localhost:3000');
const concurrency = positiveInt(process.env.LOAD_TEST_CONCURRENCY, 1000);
const timeoutMs = positiveInt(process.env.LOAD_TEST_TIMEOUT_MS, 10_000);
const p95LimitMs = positiveInt(process.env.LOAD_TEST_P95_MS, 1000);
const p99LimitMs = positiveInt(process.env.LOAD_TEST_P99_MS, 2000);
const maxErrorRate = positiveNumber(process.env.LOAD_TEST_MAX_ERROR_RATE, 1);
const allowRemote = process.env.LOAD_TEST_ALLOW_REMOTE === 'true';

if (!isLocalTarget(baseURL) && !allowRemote) {
  throw new Error(
    `Refusing to run 1000-concurrency smoke against remote target ${baseURL.origin}. Set LOAD_TEST_ALLOW_REMOTE=true for an intentional staging/production run.`,
  );
}

const startedAt = performance.now();
const results = await Promise.all(
  Array.from({ length: concurrency }, (_, index) => requestOnce(index)),
);
const elapsedMs = performance.now() - startedAt;
const failures = results.filter((result) => result.ok === false);
const latencies = results.map((result) => result.durationMs).sort((a, b) => a - b);
const errorRate = (failures.length / results.length) * 100;
const p50 = percentile(latencies, 50);
const p95 = percentile(latencies, 95);
const p99 = percentile(latencies, 99);

console.log(
  JSON.stringify(
    {
      target: baseURL.origin,
      concurrency,
      elapsedMs: Math.round(elapsedMs),
      requestsPerSecond: round((results.length / elapsedMs) * 1000),
      errors: failures.length,
      errorRate: round(errorRate),
      p50Ms: Math.round(p50),
      p95Ms: Math.round(p95),
      p99Ms: Math.round(p99),
      endpoints: DEFAULT_ENDPOINTS,
    },
    null,
    2,
  ),
);

if (failures.length > 0) {
  console.error('First failures:');
  for (const failure of failures.slice(0, 5)) {
    console.error(
      `  ${failure.method} ${failure.path} status=${failure.status ?? 'ERR'} error=${failure.error ?? ''}`,
    );
  }
}

if (errorRate > maxErrorRate || p95 > p95LimitMs || p99 > p99LimitMs) {
  throw new Error(
    `Load smoke failed thresholds: errorRate=${round(errorRate)}%/${maxErrorRate}%, p95=${Math.round(p95)}ms/${p95LimitMs}ms, p99=${Math.round(p99)}ms/${p99LimitMs}ms.`,
  );
}

console.log('PASS: read-only 1000-concurrency smoke passed thresholds.');

async function requestOnce(index) {
  const path = DEFAULT_ENDPOINTS[index % DEFAULT_ENDPOINTS.length];
  const url = new URL(path, baseURL);
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json,text/html;q=0.8,*/*;q=0.5' },
      signal: controller.signal,
    });
    await response.arrayBuffer();
    return {
      ok: response.status >= 200 && response.status < 300,
      method: 'GET',
      path,
      status: response.status,
      durationMs: performance.now() - started,
    };
  } catch (error) {
    return {
      ok: false,
      method: 'GET',
      path,
      durationMs: performance.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
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

function round(value) {
  return Math.round(value * 100) / 100;
}
