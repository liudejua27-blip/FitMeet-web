import * as fs from 'fs';
import * as path from 'path';

import { fitMeetCoreOpenApi } from '../src/openapi/fitmeet-core.openapi';

type JsonObject = Record<string, unknown>;
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type RequestOptions = {
  body?: unknown;
  expectedStatus?: number | number[];
  method?: HttpMethod;
  token?: string;
};

type SmokeActor = {
  accessToken: string;
  refreshToken?: string;
  userId?: number;
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

loadEnvFiles();

const API_BASE_URL = resolveApiBaseUrl();
const REQUEST_TIMEOUT_MS = Number(process.env.APP_SMOKE_TIMEOUT_MS ?? 15000);
const DRY_RUN = flagEnabled('APP_SMOKE_DRY_RUN');
const RUN_MUTATIONS = flagEnabled('APP_SMOKE_RUN_MUTATIONS');
const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

async function main() {
  assertRemoteIntent();
  assertCoreContract(fitMeetCoreOpenApi);

  console.log(`FitMeet App core smoke API base: ${API_BASE_URL}`);
  if (DRY_RUN) {
    ok('Dry run contract validation completed');
    return;
  }

  await api('/health');
  ok('Health endpoint is reachable');

  await api('/ready');
  ok('Readiness endpoint is reachable');

  const remoteContract = await api<JsonObject>('/openapi/fitmeet-core.json');
  assertCoreContract(remoteContract);
  ok('Runtime OpenAPI contract includes App core paths');

  await api('/feed?page=1&limit=5');
  ok('Public feed is reachable');

  const actor = await loginIfConfigured();
  if (!actor) {
    skip('Authenticated checks require APP_SMOKE_EMAIL and APP_SMOKE_PASSWORD');
    return;
  }

  const profile = await api<JsonObject>('/auth/profile', {
    token: actor.accessToken,
  });
  const profileId = optionalNumber(profile.id);
  if (actor.userId && profileId !== undefined) {
    expectEqual(
      profileId,
      actor.userId,
      'profile id should match login user id',
    );
  }
  ok('Profile restore succeeds');

  if (actor.refreshToken) {
    const refreshResult = await api<JsonObject>('/auth/refresh', {
      body: { refreshToken: actor.refreshToken },
      token: actor.accessToken,
    });
    mustString(refreshResult.access_token, 'refresh.access_token');
    ok('Refresh token restores an access token');
  } else {
    skip('Refresh check skipped because login did not return refresh_token');
  }

  await api('/feed/interactions', { token: actor.accessToken });
  ok('Feed interaction state is reachable');

  await api('/social-agent/chat/session', { token: actor.accessToken });
  ok('Social Agent session restore is reachable');

  await runMessageSmoke(actor);
  await runMutationSmoke(actor);

  ok('FitMeet App core smoke completed');
}

async function runMessageSmoke(actor: SmokeActor) {
  const targetUserId = Number(process.env.APP_SMOKE_TARGET_USER_ID ?? 0);
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    skip('Real message send requires APP_SMOKE_TARGET_USER_ID');
    return;
  }

  const conversation = await api<JsonObject>('/messages/start', {
    body: { otherUserId: targetUserId },
    token: actor.accessToken,
  });
  const conversationId = mustString(
    conversation.conversationId,
    'conversation.conversationId',
  );

  const messageText = `FitMeet App smoke message ${runId}`;
  const sentMessage = await api<JsonObject>(
    `/messages/conversations/${encodeURIComponent(conversationId)}/send`,
    {
      body: { text: messageText },
      token: actor.accessToken,
    },
  );
  expectStringContains(
    sentMessage.text,
    runId,
    'sent message text should include smoke run id',
  );

  const messages = await api<unknown>(
    `/messages/conversations/${encodeURIComponent(conversationId)}`,
    { token: actor.accessToken },
  );
  const history = mustArray(messages, 'conversation history');
  const foundMessage = history.some((item) =>
    optionalString(objectOrNull(item)?.text)?.includes(runId),
  );
  if (!foundMessage) {
    throw new Error('Sent smoke message was not found in conversation history');
  }
  ok('Real message start/send/read-back succeeds');
}

async function runMutationSmoke(actor: SmokeActor) {
  if (!RUN_MUTATIONS) {
    skip('Avatar upload and feed publish require APP_SMOKE_RUN_MUTATIONS=true');
    return;
  }

  const upload = await uploadTinyAvatar(actor.accessToken);
  const uploadedUrl = mustString(upload.url, 'upload.url');
  const uploadedWidth = optionalNumber(upload.width) ?? 1;
  const uploadedHeight = optionalNumber(upload.height) ?? 1;
  ok('Avatar image upload succeeds');

  const updatedProfile = await api<JsonObject>('/users/profile', {
    body: { avatar: uploadedUrl },
    method: 'PUT',
    token: actor.accessToken,
  });
  expectEqual(
    optionalString(updatedProfile.avatar),
    uploadedUrl,
    'updated profile avatar should match upload URL',
  );
  ok('Uploaded avatar can be saved to profile');

  if (actor.refreshToken) {
    const refreshResult = await api<JsonObject>('/auth/refresh', {
      body: { refreshToken: actor.refreshToken },
    });
    const refreshedAccessToken = mustString(
      refreshResult.access_token,
      'refresh.access_token',
    );
    const restoredProfile = await api<JsonObject>('/auth/profile', {
      token: refreshedAccessToken,
    });
    if (actor.userId) {
      expectEqual(
        optionalNumber(restoredProfile.id),
        actor.userId,
        'restored profile id should match login user id',
      );
    }
    expectEqual(
      optionalString(restoredProfile.avatar),
      uploadedUrl,
      'restored profile avatar should match upload URL',
    );
    ok('Refresh token restores profile with uploaded avatar');
  } else {
    skip(
      'Refresh/profile restore skipped because login did not return refresh_token',
    );
  }

  const post = await api<JsonObject>('/feed', {
    body: {
      type: 'log',
      sport: 'fitness',
      text: `FitMeet App smoke moment ${runId}`,
      images: [
        {
          url: uploadedUrl,
          width: uploadedWidth,
          height: uploadedHeight,
        },
      ],
      tags: ['app-smoke'],
    },
    token: actor.accessToken,
  });
  const postId = optionalNumber(post.id);
  assertPostImageMetadata(post, {
    imageUrl: uploadedUrl,
    width: uploadedWidth,
    height: uploadedHeight,
    source: 'created feed post',
  });
  const feedPage = await api<JsonObject>('/feed?category=&page=1&limit=50');
  const feedData = mustArray(feedPage.data, 'feed.data');
  const foundPost = feedData.find((item) => {
    const post = objectOrNull(item);
    return (
      (postId !== undefined && optionalNumber(post?.id) === postId) ||
      optionalString(post?.text)?.includes(runId) ||
      optionalString(post?.title)?.includes(runId)
    );
  });
  if (!foundPost) {
    throw new Error(
      'Published smoke feed post was not found in /feed read-back',
    );
  }
  assertPostImageMetadata(mustObject(foundPost, 'feed post read-back'), {
    imageUrl: uploadedUrl,
    width: uploadedWidth,
    height: uploadedHeight,
    source: '/feed read-back',
  });
  ok('Feed moment publish/read-back preserves image metadata');

  await api('/social-agent/chat/route-message', {
    body: { message: `FitMeet App smoke route ${runId}` },
    token: actor.accessToken,
  });
  ok('Social Agent route-message accepts a real user message');
}

async function loginIfConfigured(): Promise<SmokeActor | null> {
  const email = process.env.APP_SMOKE_EMAIL;
  const password = process.env.APP_SMOKE_PASSWORD;
  if (!email || !password) return null;

  const result = await api<JsonObject>('/auth/login', {
    body: { email, password },
  });
  const accessToken = mustString(result.access_token, 'login.access_token');
  const user = objectOrNull(result.user);
  const userId =
    typeof user?.id === 'number' && Number.isFinite(user.id)
      ? user.id
      : undefined;
  ok(userId ? `Logged in smoke actor ${userId}` : 'Logged in smoke actor');

  const refreshToken =
    typeof result.refresh_token === 'string' ? result.refresh_token : undefined;
  return { accessToken, refreshToken, userId };
}

async function uploadTinyAvatar(token: string): Promise<JsonObject> {
  const form = new FormData();
  form.append(
    'file',
    new Blob([TINY_PNG], { type: 'image/png' }),
    `app-smoke-${runId}.png`,
  );

  const response = await fetch(`${API_BASE_URL}/uploads/image`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  const parsed = parseJson(text);
  if (response.status !== 200 && response.status !== 201) {
    throw new Error(
      [
        'Unexpected response for POST /uploads/image',
        'Expected status: 200 or 201',
        `Actual status: ${response.status}`,
        `Response: ${text || '<empty>'}`,
      ].join('\n'),
    );
  }
  return mustObject(parsed, 'upload response');
}

async function api<T = unknown>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const method =
    options.method ?? (options.body === undefined ? 'GET' : 'POST');
  const expected = Array.isArray(options.expectedStatus)
    ? options.expectedStatus
    : [options.expectedStatus ?? 200, options.expectedStatus ?? 201];
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(
      `Request failed before response: ${method} ${endpoint}\n${String(error)}`,
    );
  }

  const text = await response.text();
  const parsed = parseJson(text);

  if (!expected.includes(response.status)) {
    throw new Error(
      [
        `Unexpected response for ${method} ${endpoint}`,
        `Expected status: ${expected.join(' or ')}`,
        `Actual status: ${response.status}`,
        `Response: ${text || '<empty>'}`,
      ].join('\n'),
    );
  }

  return parsed as T;
}

function assertCoreContract(contract: unknown) {
  const root = mustObject(contract, 'OpenAPI contract');
  const paths = mustObject(root.paths, 'OpenAPI paths');
  const requiredPaths: Record<string, string[]> = {
    '/auth/login': ['post'],
    '/auth/refresh': ['post'],
    '/auth/profile': ['get'],
    '/users/profile': ['put'],
    '/uploads/image': ['post'],
    '/uploads/video': ['post'],
    '/feed': ['get', 'post'],
    '/feed/interactions': ['get'],
    '/feed/{id}/like': ['post'],
    '/feed/{id}/save': ['post'],
    '/feed/{postId}/comments': ['get', 'post'],
    '/feed/comments/{commentId}/like': ['post'],
    '/messages/start': ['post'],
    '/messages/public-intents/{id}/start': ['post'],
    '/messages/conversations': ['get'],
    '/messages/conversations/{conversationId}': ['get'],
    '/messages/conversations/{conversationId}/send': ['post'],
    '/messages/unread': ['get'],
    '/social-agent/chat/run': ['post'],
    '/social-agent/chat/run-async': ['post'],
    '/social-agent/chat/session': ['get'],
    '/social-agent/chat/messages': ['post'],
    '/social-agent/chat/route-message': ['post'],
    '/social-agent/chat/stream': ['post'],
    '/social-agent/chat/stream-user': ['post'],
    '/social-agent/chat/tasks/{taskId}/session': ['get'],
    '/social-agent/chat/tasks/{taskId}/runs/{runId}': ['get'],
    '/social-agent/chat/tasks/{taskId}/messages': ['post'],
    '/social-agent/chat/tasks/{taskId}/publish-social-request': ['post'],
    '/social-agent/chat/tasks/{taskId}/replan-run': ['post'],
    '/social-agent/chat/tasks/{taskId}/append-context': ['post'],
    '/social-agent/chat/tasks/{taskId}/actions': ['post'],
    '/social-agent/chat/tasks/{taskId}/save-candidate': ['post'],
    '/social-agent/chat/tasks/{taskId}/send-message': ['post'],
    '/social-agent/chat/tasks/{taskId}/connect-candidate': ['post'],
    '/social-agent/tasks/current': ['get'],
    '/social-agent/tasks/{taskId}/timeline': ['get'],
    '/social-agent/tasks/{taskId}/events': ['get'],
    '/social-agent/tasks/{taskId}/replan': ['post'],
  };

  for (const [route, methods] of Object.entries(requiredPaths)) {
    const pathSpec = mustObject(paths[route], `OpenAPI path ${route}`);
    for (const method of methods) {
      if (!pathSpec[method]) {
        throw new Error(`OpenAPI path ${route} is missing ${method}`);
      }
    }
  }
}

function resolveApiBaseUrl() {
  const fromEnv =
    process.env.APP_SMOKE_API_BASE_URL ||
    process.env.API_BASE_URL ||
    (process.env.BASE_URL
      ? `${process.env.BASE_URL.replace(/\/$/, '')}/api`
      : '');
  return (fromEnv || 'http://localhost:3000/api').replace(/\/$/, '');
}

function assertRemoteIntent() {
  if (
    flagEnabled('APP_SMOKE_ALLOW_REMOTE') ||
    flagEnabled('E2E_ALLOW_REMOTE')
  ) {
    return;
  }
  const url = new URL(API_BASE_URL);
  if (LOCAL_HOSTS.has(url.hostname)) return;
  throw new Error(
    `Refusing to run App smoke against non-local API base "${API_BASE_URL}". Set APP_SMOKE_ALLOW_REMOTE=true only for an explicit staging run.`,
  );
}

function loadEnvFiles() {
  const files = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '..', '.env'),
    path.resolve(process.cwd(), '..', '.env.local'),
  ];

  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

function flagEnabled(name: string) {
  return /^(1|true|yes)$/i.test(process.env[name] ?? '');
}

function parseJson(text: string): unknown {
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function objectOrNull(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function mustObject(value: unknown, label: string): JsonObject {
  const object = objectOrNull(value);
  if (!object) throw new Error(`${label} must be an object`);
  return object;
}

function mustArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function mustString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, actual ${String(actual)}`,
    );
  }
}

function expectStringContains(
  actual: unknown,
  expected: string,
  label: string,
) {
  if (typeof actual !== 'string' || !actual.includes(expected)) {
    throw new Error(
      `${label}: expected "${String(actual)}" to include "${expected}"`,
    );
  }
}

function assertPostImageMetadata(
  post: JsonObject,
  expected: { imageUrl: string; width: number; height: number; source: string },
) {
  const images = mustArray(post.images, `${expected.source}.images`);
  const image = images
    .map((item) => objectOrNull(item))
    .find((item) => optionalString(item?.url) === expected.imageUrl);
  if (!image) {
    throw new Error(
      `${expected.source} should include uploaded image URL ${expected.imageUrl}`,
    );
  }
  expectEqual(
    optionalNumber(image.width),
    expected.width,
    `${expected.source} image width should match upload width`,
  );
  expectEqual(
    optionalNumber(image.height),
    expected.height,
    `${expected.source} image height should match upload height`,
  );
}

function ok(message: string) {
  console.log(`[OK] ${message}`);
}

function skip(message: string) {
  console.log(`[SKIP] ${message}`);
}

main().catch((error) => {
  console.error('\n[FAIL] FitMeet App core smoke failed');
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
