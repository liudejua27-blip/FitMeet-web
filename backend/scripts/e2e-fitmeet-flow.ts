import * as fs from 'fs';
import * as path from 'path';

type Json = Record<string, unknown>;

type Actor = {
  id: number;
  email: string;
  name: string;
  token: string;
};

type RequestOptions = {
  actor?: Actor;
  body?: unknown;
  expectedStatus?: number | number[];
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
};

loadEnvFiles();

const API_BASE_URL = resolveApiBaseUrl();
const REQUEST_TIMEOUT_MS = Number(process.env.E2E_REQUEST_TIMEOUT_MS ?? 15000);
const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const password = `FitMeet-e2e-${runId}`;
const city = `E2E-${runId}`;
const locationName = `FitMeet E2E Gym ${runId}`;

async function main() {
  assertLocalApiBaseUrl();
  console.log(`FitMeet E2E API base: ${API_BASE_URL}`);

  const userA = await createActor('A');
  const userB = await createActor('B');

  await prepareProfile(userA);
  await prepareProfile(userB);

  await runMeetFlow(userA, userB);
  await runAiSocialFlow(userA, userB);

  console.log('[OK] All FitMeet e2e flows completed');
}

async function runMeetFlow(userA: Actor, userB: Actor) {
  console.log('\n=== Ordinary Meet Flow ===');

  const meet = await api<Json>('/meets', {
    actor: userA,
    body: {
      title: `E2E ordinary meet ${runId}`,
      type: 'gym',
      sport: '健身',
      time: futureLocalInput(2),
      startAt: futureIso(2),
      loc: locationName,
      address: `${city} public venue`,
      lat: 39.9042,
      lng: 116.4074,
      city,
      maxSlots: 2,
      level: 'all',
      desc: 'Automated ordinary meet e2e regression.',
      feeType: 'free',
      groupType: '1v1',
      creatorType: 'peer',
    },
  });
  const meetId = mustNumber(meet.id, 'meet.id');
  ok('Meet created');

  await api(`/meets/${meetId}/join`, { actor: userB, body: {} });
  ok('Participant joined');

  const meetAfterJoin = await api<Json>(`/meets/${meetId}`, { actor: userA });
  const participant = mustArray<Json>(
    meetAfterJoin.participantDetails,
    'meet.participantDetails',
  ).find((item) => item.userId === userB.id);
  if (!participant) {
    throw new Error(`Could not find B in participantDetails for meet ${meetId}`);
  }

  await api(
    `/meets/${meetId}/participants/${mustNumber(participant.participantId, 'participant.participantId')}/confirm`,
    { actor: userA, body: {} },
  );
  ok('Participant confirmed');

  const activityRef = await api<Json>(`/meets/${meetId}/create-activity`, {
    actor: userA,
    body: {},
  });
  const activityId = mustNumber(activityRef.activityId, 'activityId');
  ok('Activity created from Meet');

  await completeActivity(activityId, userA, userB);

  await api(`/activities/${activityId}/review`, {
    actor: userA,
    body: { rating: 5, comment: 'E2E ordinary meet review.' },
  });
  ok('Activity reviewed');

  const finalMeet = await api<Json>(`/meets/${meetId}`, { actor: userA });
  expectEqual(finalMeet.status, 'completed', 'Meet.status');
  ok('Meet.status = completed');

  const finalActivity = await getActivity(activityId, userA);
  expectEqual(finalActivity.status, 'completed', 'Activity.status');
  ok('Activity.status = completed');
}

async function runAiSocialFlow(userA: Actor, userB: Actor) {
  console.log('\n=== AI Social Meet Flow ===');

  const socialRequest = await api<Json>('/social-requests', {
    actor: userA,
    body: {
      type: 'fitness_partner',
      title: `E2E AI social request ${runId}`,
      description: 'Find a nearby fitness partner for an e2e regression.',
      rawText: 'Find a nearby fitness partner for an e2e regression.',
      city,
      lat: 39.9042,
      lng: 116.4074,
      radiusKm: 10,
      interestTags: ['fitness'],
      activityType: 'fitness',
      agentAllowed: true,
      requireUserConfirmation: true,
    },
  });
  const requestId = mustNumber(socialRequest.id, 'socialRequest.id');
  ok('SocialRequest created');

  await api(`/social-requests/${requestId}/match`, {
    actor: userA,
    body: { limit: 5 },
  });
  ok('SocialRequest match triggered');

  const candidateList = await api<Json>(
    `/social-requests/${requestId}/candidates`,
    { actor: userA },
  );
  const candidates = mustArray<Json>(candidateList.candidates, 'candidates');
  const candidate =
    candidates.find((item) => item.userId === userB.id) ?? candidates[0];
  if (!candidate) {
    throw new Error(`No candidates returned for SocialRequest ${requestId}`);
  }
  const candidateRecordId = mustNumber(
    candidate.candidateRecordId,
    'candidate.candidateRecordId',
  );
  ok('SocialRequest candidates fetched');

  const conversation = await api<Json>('/messages/start', {
    actor: userA,
    body: { otherUserId: mustNumber(candidate.userId, 'candidate.userId') },
  });
  const conversationId = mustString(
    conversation.conversationId,
    'conversation.conversationId',
  );
  await api(`/messages/conversations/${conversationId}/send`, {
    actor: userA,
    body: {
      text:
        typeof candidate.suggestedMessage === 'string'
          ? candidate.suggestedMessage
          : '你好，我想邀请你一起完成一次 FitMeet 约练。',
    },
  });
  await api(
    `/social-requests/${requestId}/candidates/${candidateRecordId}/mark-messaged`,
    { actor: userA, body: {} },
  );
  ok('Invitation sent');

  const afterMessageCandidates = await api<Json>(
    `/social-requests/${requestId}/candidates`,
    { actor: userA },
  );
  const messagedCandidate = mustArray<Json>(
    afterMessageCandidates.candidates,
    'candidates',
  ).find((item) => item.candidateRecordId === candidateRecordId);
  expectEqual(messagedCandidate?.status, 'messaged', 'candidate.status');
  ok('candidate.status = messaged');

  const chattingRequest = await api<Json>(`/social-requests/${requestId}`, {
    actor: userA,
  });
  expectEqual(chattingRequest.status, 'chatting', 'SocialRequest.status');
  ok('SocialRequest.status = chatting');

  const activity = await api<Json>('/activities', {
    actor: userA,
    body: {
      type: 'fitness',
      title: `E2E AI activity ${runId}`,
      description: 'Activity created from AI social request e2e flow.',
      locationName,
      city,
      lat: 39.9042,
      lng: 116.4074,
      startTime: futureIso(3),
      socialRequestId: requestId,
      matchedCandidateId: candidateRecordId,
      invitedUserId: mustNumber(candidate.userId, 'candidate.userId'),
    },
  });
  const activityId = mustNumber(activity.id, 'activity.id');
  ok('Activity created from SocialRequest');

  const activityCreatedRequest = await api<Json>(
    `/social-requests/${requestId}`,
    { actor: userA },
  );
  expectEqual(
    activityCreatedRequest.status,
    'activity_created',
    'SocialRequest.status',
  );
  ok('SocialRequest.status = activity_created');

  await completeActivity(activityId, userA, userB);

  const completedRequest = await api<Json>(`/social-requests/${requestId}`, {
    actor: userA,
  });
  expectEqual(completedRequest.status, 'completed', 'SocialRequest.status');
  ok('SocialRequest.status = completed');
}

async function completeActivity(activityId: number, userA: Actor, userB: Actor) {
  await api(`/activities/${activityId}/confirm`, { actor: userA, body: {} });
  await api(`/activities/${activityId}/confirm`, { actor: userB, body: {} });
  ok(`Activity ${activityId} confirmed by both users`);

  await api(`/activities/${activityId}/checkin`, {
    actor: userA,
    body: { locationApprox: `${city} public venue` },
  });
  await api(`/activities/${activityId}/checkin`, {
    actor: userB,
    body: { locationApprox: `${city} public venue` },
  });
  ok(`Activity ${activityId} checked in by both users`);

  const proof = await api<Json>(`/activities/${activityId}/proof`, {
    actor: userB,
    body: {
      proofType: 'scene_photo',
      note: 'E2E proof without photo URL.',
      locationApprox: `${city} public venue`,
      privacyMode: 'scene_only',
    },
  });
  const proofId = mustNumber(proof.id, 'proof.id');
  ok(`Activity ${activityId} proof uploaded`);

  await api(`/activities/${activityId}/proofs/${proofId}/respond`, {
    actor: userA,
    body: { accept: true },
  });
  ok(`Activity ${activityId} proof accepted`);

  const current = await getActivity(activityId, userA);
  if (current.status !== 'completed') {
    await api(`/activities/${activityId}/complete`, {
      actor: userA,
      body: {},
    });
  }
  const completed = await getActivity(activityId, userA);
  expectEqual(completed.status, 'completed', `Activity ${activityId}.status`);
  ok(`Activity ${activityId} completed`);
}

async function getActivity(activityId: number, actor: Actor) {
  const response = await api<Json>(`/activities/${activityId}`, { actor });
  return mustObject(response.activity, 'activity');
}

async function createActor(label: 'A' | 'B'): Promise<Actor> {
  const email = `e2e-${label.toLowerCase()}-${runId}@fitmeet.local`;
  const name = `E2E User ${label}`;
  const result = await api<Json>('/auth/register', {
    body: { email, password, name },
  });
  const token = mustString(result.access_token, 'access_token');
  const user = mustObject(result.user, 'user');
  const actor = {
    id: mustNumber(user.id, 'user.id'),
    email,
    name,
    token,
  };
  ok(`User ${label} ready (${actor.id})`);
  return actor;
}

async function prepareProfile(actor: Actor) {
  await api('/users/profile', {
    actor,
    method: 'PUT',
    body: {
      name: actor.name,
      city,
      bio: 'FitMeet e2e regression account.',
    },
    expectedStatus: [200, 201],
  });
  await api('/users/me/location', {
    actor,
    method: 'PUT',
    body: {
      lat: actor.name.endsWith('A') ? 39.9042 : 39.905,
      lng: actor.name.endsWith('A') ? 116.4074 : 116.408,
      acceptNearbyMatch: true,
    },
    expectedStatus: [200, 201],
  });
  ok(`Profile prepared for ${actor.name}`);
}

async function api<T = unknown>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const method = options.method ?? (options.body === undefined ? 'GET' : 'POST');
  const expected = Array.isArray(options.expectedStatus)
    ? options.expectedStatus
    : [options.expectedStatus ?? 200, options.expectedStatus ?? 201];
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.actor) headers.Authorization = `Bearer ${options.actor.token}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
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

function resolveApiBaseUrl() {
  const fromEnv =
    process.env.API_BASE_URL ||
    (process.env.BASE_URL ? `${process.env.BASE_URL.replace(/\/$/, '')}/api` : '');
  return (fromEnv || 'http://localhost:3000/api').replace(/\/$/, '');
}

function assertLocalApiBaseUrl() {
  if (process.env.E2E_ALLOW_REMOTE === 'true') return;
  const url = new URL(API_BASE_URL);
  const allowedHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
  if (!allowedHosts.has(url.hostname)) {
    throw new Error(
      `Refusing to run local e2e against non-local API_BASE_URL="${API_BASE_URL}". Set E2E_ALLOW_REMOTE=true only for an explicit staging run.`,
    );
  }
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
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

function parseJson(text: string): unknown {
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function ok(message: string) {
  console.log(`[OK] ${message}`);
}

function expectEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label} expected "${expected}", got "${String(actual)}"`);
  }
}

function mustObject(value: unknown, label: string): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Json;
}

function mustArray<T = unknown>(value: unknown, label: string): T[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value as T[];
}

function mustNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number, got ${String(value)}`);
  }
  return value;
}

function mustString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function futureIso(hoursFromNow: number) {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

function futureLocalInput(hoursFromNow: number) {
  const date = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

main().catch((error) => {
  console.error('\n[FAIL] FitMeet e2e flow failed');
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
