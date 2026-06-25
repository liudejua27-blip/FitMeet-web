import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');
const baseUrl = (process.env.BASE_URL || process.env.FITMEET_STAGING_BASE_URL || '').replace(/\/+$/, '');
const apiBaseUrl = (
  process.env.API_BASE_URL ||
  process.env.FITMEET_STAGING_API_BASE_URL ||
  (baseUrl ? `${baseUrl}/api` : '')
).replace(/\/+$/, '');
const expectedReleaseCommit = process.env.EXPECTED_RELEASE_COMMIT || '';
const userA = {
  email: process.env.STAGING_USER_A_EMAIL || process.env.FITMEET_STAGING_USER_A_EMAIL || '',
  password: process.env.STAGING_USER_A_PASSWORD || process.env.FITMEET_STAGING_USER_A_PASSWORD || '',
  label: 'A',
};
const userB = {
  email: process.env.STAGING_USER_B_EMAIL || process.env.FITMEET_STAGING_USER_B_EMAIL || '',
  password: process.env.STAGING_USER_B_PASSWORD || process.env.FITMEET_STAGING_USER_B_PASSWORD || '',
  label: 'B',
};
const outputDir = path.resolve(rootDir, process.env.STAGING_E2E_OUTPUT_DIR || 'artifacts/staging-e2e');
const headless = process.env.STAGING_E2E_HEADLESS !== 'false';
const allowRemote = process.env.FITMEET_AGENT_BROWSER_QA_ALLOW_REMOTE === 'true';
const profileSetupMode = process.env.STAGING_E2E_PROFILE_SETUP || 'api';
const requireCandidate = process.env.STAGING_E2E_REQUIRE_CANDIDATE !== 'false';
const stopAfterPublish = process.env.STAGING_E2E_STOP_AFTER_PUBLISH === 'true';
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const evidenceFile = path.join(outputDir, `agent-public-loop-${timestamp}.json`);
const markdownFile = path.join(outputDir, `agent-public-loop-${timestamp}.md`);
const state = {
  startedAt: new Date().toISOString(),
  baseUrl,
  apiBaseUrl,
  expectedReleaseCommit,
  profileSetupMode,
  steps: [],
  ids: {},
  screenshots: [],
};

function redact(value) {
  return String(value)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[redacted-email]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [redacted]')
    .replace(/"(access_token|refresh_token|password|token)"\s*:\s*"[^"]+"/gi, '"$1":"[redacted]"');
}

function record(step, details = {}) {
  state.steps.push({ step, at: new Date().toISOString(), ...details });
  console.log(`[staging-e2e] ${step}`);
}

function fail(message) {
  const error = new Error(message);
  error.stagingEvidence = state;
  throw error;
}

function ensureNonProductionUrl(url, label) {
  if (!url) fail(`Set ${label}.`);
  const parsed = new URL(url);
  if (parsed.hostname === 'www.ourfitmeet.cn' || parsed.hostname === 'ourfitmeet.cn') {
    fail(`Refusing staging E2E against production ${label}: ${url}`);
  }
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'FitMeetStagingPublicLoopE2E/1.0',
  };
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${url} -> ${response.status}: ${redact(text).slice(0, 500)}`);
  }
  return body;
}

async function login(user) {
  const body = await requestJson(`${apiBaseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  if (!body?.access_token) fail(`Login ${user.label} did not return access_token.`);
  record(`login ${user.label}`, { user: '[redacted-email]' });
  return body;
}

async function assertRelease() {
  const health = await requestJson(`${apiBaseUrl}/health`);
  const actual = String(health?.release?.commit || 'unknown');
  if (expectedReleaseCommit && !actual.startsWith(expectedReleaseCommit) && !expectedReleaseCommit.startsWith(actual)) {
    fail(`release.commit mismatch: got ${actual}, expected ${expectedReleaseCommit}`);
  }
  state.release = health.release || {};
  record('release verified', { actual });
}

async function ensureProfileAndAuthorization(auth, userLabel) {
  if (profileSetupMode === 'skip') {
    record(`profile setup skipped ${userLabel}`);
    return;
  }
  const token = auth.access_token;
  const profilePayload =
    userLabel === 'A'
      ? {
          nickname: 'Staging A',
          city: '青岛',
          nearbyArea: '中山公园附近',
          fitnessGoals: ['散步', '羽毛球'],
          interestTags: ['散步', '低压力社交'],
          lifestyleTags: ['公共场所', '规律运动'],
          socialScenes: ['一起散步', '周末轻运动'],
          wantToMeet: ['散步搭子', '同城运动伙伴'],
          preferredTraits: ['守时', '尊重边界'],
          availableTimes: ['今晚', '周末下午'],
          weekdayAvailability: '工作日晚上',
          weekendAvailability: '周末下午',
          socialPreference: '低压力，先站内沟通',
          privacyBoundary: '只在公共场所，不交换联系方式，不公开精确位置',
        }
      : {
          nickname: 'Staging B',
          city: '青岛',
          nearbyArea: '中山公园附近',
          fitnessGoals: ['散步', '慢跑'],
          interestTags: ['散步', '羽毛球'],
          lifestyleTags: ['公共场所', '轻松聊天'],
          socialScenes: ['一起散步', '公园活动'],
          wantToMeet: ['同城散步伙伴', '低压力运动搭子'],
          preferredTraits: ['守时', '边界清晰'],
          availableTimes: ['今晚', '周末下午'],
          weekdayAvailability: '工作日晚上',
          weekendAvailability: '周末下午',
          socialPreference: '轻松、公开场所、先站内沟通',
          privacyBoundary: '只在公共场所，不交换联系方式，不公开精确位置',
        };
  await requestJson(`${apiBaseUrl}/users/me/social-profile`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify(profilePayload),
  });
  await requestJson(`${apiBaseUrl}/users/me/social-profile/privacy`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({
      profileDiscoverable: true,
      agentCanRecommendMe: true,
      agentCanStartChatAfterApproval: true,
      ownerConfirmed: true,
      matchingConsent: true,
      profileVisibilityConsent: true,
    }),
  });
  const completion = await requestJson(`${apiBaseUrl}/users/me/social-profile/completion`, {
    headers: authHeaders(token),
  });
  if (completion?.canEnterMatchPool !== true) {
    fail(`User ${userLabel} cannot enter match pool after profile setup: ${JSON.stringify(completion)}`);
  }
  record(`profile and matching authorization ready ${userLabel}`, {
    percent: completion.percent ?? null,
  });
}

async function screenshot(page, name) {
  const file = path.join(outputDir, `${timestamp}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  state.screenshots.push(path.relative(rootDir, file));
  return file;
}

async function waitForApp(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#root').waitFor({ state: 'attached', timeout: 20_000 });
  await page.locator('[data-testid="assistant-ui-composer-input"]').waitFor({ state: 'visible', timeout: 30_000 });
}

async function submitMessage(page, text) {
  const input = page.locator('[data-testid="assistant-ui-composer-input"]').first();
  await input.waitFor({ state: 'visible', timeout: 15_000 });
  await input.fill(text);
  await input.press('Enter').catch(async () => {
    await page.getByRole('button', { name: '发送' }).click();
  });
}

async function waitForSelectorWithBody(page, selector, label, timeout = 90_000) {
  await page.locator(selector).first().waitFor({ state: 'visible', timeout }).catch(async () => {
    const body = await page.locator('body').innerText().catch(() => '');
    throw new Error(`${label} did not appear within ${timeout}ms. Body: ${body.slice(0, 1000)}`);
  });
}

async function clickSchemaAction(page, action, label, timeout = 30_000) {
  const selector = `[data-testid="assistant-ui-schema-action"][data-schema-action="${action}"][data-action-executable="true"]`;
  await waitForSelectorWithBody(page, selector, label, timeout);
  await page.locator(selector).last().click();
  record(`clicked ${action}`);
}

async function extractCurrentTaskId(page, token) {
  const fromPath = await page.evaluate(() => {
    const match = window.location.pathname.match(/\/agent\/chat\/(\d+)/);
    return match ? Number(match[1]) : null;
  });
  if (Number.isFinite(fromPath) && fromPath > 0) return fromPath;
  const session = await requestJson(`${apiBaseUrl}/social-agent/chat/session`, {
    headers: authHeaders(token),
  });
  const taskId = Number(session?.activeTaskId || session?.task?.id || 0);
  return Number.isFinite(taskId) && taskId > 0 ? taskId : null;
}

function findFirstStringByKey(value, keyPattern) {
  const seen = new Set();
  const stack = [{ value, path: '' }];
  while (stack.length) {
    const item = stack.pop();
    if (!item || item.value == null) continue;
    if (typeof item.value !== 'object') continue;
    if (seen.has(item.value)) continue;
    seen.add(item.value);
    if (Array.isArray(item.value)) {
      item.value.forEach((child, index) => stack.push({ value: child, path: `${item.path}[${index}]` }));
      continue;
    }
    for (const [key, child] of Object.entries(item.value)) {
      if (keyPattern.test(key) && typeof child === 'string' && child.trim()) return child.trim();
      if (keyPattern.test(key) && typeof child === 'number' && Number.isFinite(child)) return String(child);
      stack.push({ value: child, path: item.path ? `${item.path}.${key}` : key });
    }
  }
  return null;
}

function listFromPublicIntentResponse(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.results)) return value.results;
  if (Array.isArray(value?.data?.items)) return value.data.items;
  if (Array.isArray(value?.data?.data)) return value.data.data;
  return [];
}

async function readTaskSession(taskId, token) {
  return requestJson(`${apiBaseUrl}/social-agent/chat/tasks/${taskId}/session`, {
    headers: authHeaders(token),
  });
}

async function verifyDiscover(publicIntentId) {
  const detail = await requestJson(`${apiBaseUrl}/public/social-intents/${encodeURIComponent(publicIntentId)}`);
  const list = await requestJson(`${apiBaseUrl}/public/social-intents?page=1&limit=30&publicIntentId=${encodeURIComponent(publicIntentId)}`);
  const items = listFromPublicIntentResponse(list);
  const listHasIntent = JSON.stringify(items).includes(publicIntentId);
  if (!JSON.stringify(detail).includes(publicIntentId)) fail(`Public intent detail did not include ${publicIntentId}`);
  if (!listHasIntent) fail(`Public intent list did not include ${publicIntentId}`);
  record('discover detail and list read-back verified', { publicIntentId });
}

async function waitForCandidates(page, taskId, token) {
  const deadline = Date.now() + 150_000;
  let lastSession = null;
  while (Date.now() < deadline) {
    const candidateVisible = await page
      .locator('[data-testid="opportunity-card"], [data-testid="assistant-ui-candidate-empty-card"]')
      .first()
      .isVisible()
      .catch(() => false);
    lastSession = await readTaskSession(taskId, token).catch(() => null);
    const sessionBody = JSON.stringify(lastSession || {});
    const hasCandidate =
      candidateVisible ||
      /CANDIDATES_READY|candidates_recommended|social_match\.candidate|NO_CANDIDATES|no_candidates/i.test(sessionBody);
    if (hasCandidate) {
      if (!candidateVisible && process.env.STAGING_E2E_ALLOW_SESSION_ONLY !== 'true') {
        await page.waitForTimeout(3_000);
        continue;
      }
      if (requireCandidate && /NO_CANDIDATES|no_candidates/i.test(sessionBody) && !/social_match\.candidate/i.test(sessionBody)) {
        fail('Matching completed with no candidates while STAGING_E2E_REQUIRE_CANDIDATE=true.');
      }
      record('matching result reached current page/session', {
        candidateVisible,
        noCandidates: /NO_CANDIDATES|no_candidates/i.test(sessionBody),
      });
      return lastSession;
    }
    await page.waitForTimeout(3_000);
  }
  throw new Error(`Timed out waiting for candidates/no-candidates. Last session: ${redact(JSON.stringify(lastSession)).slice(0, 1200)}`);
}

async function verifyConversationCreated(authA, authB, publicIntentId) {
  const start = await requestJson(`${apiBaseUrl}/messages/public-intents/${encodeURIComponent(publicIntentId)}/start`, {
    method: 'POST',
    headers: authHeaders(authB.access_token),
    body: JSON.stringify({ text: '你好，我看到这张约练卡，想先站内聊一下。' }),
  });
  const conversationsA = await requestJson(`${apiBaseUrl}/messages/conversations`, {
    headers: authHeaders(authA.access_token),
  });
  const conversationsB = await requestJson(`${apiBaseUrl}/messages/conversations`, {
    headers: authHeaders(authB.access_token),
  });
  const serializedA = JSON.stringify(conversationsA);
  const serializedB = JSON.stringify(conversationsB);
  if (!serializedA.includes(String(start?.id ?? start?.conversationId ?? '')) && !serializedA.includes(publicIntentId)) {
    fail('A conversations did not include the public-intent conversation or intent context.');
  }
  if (!serializedB.includes(String(start?.id ?? start?.conversationId ?? '')) && !serializedB.includes(publicIntentId)) {
    fail('B conversations did not include the public-intent conversation or intent context.');
  }
  state.ids.conversationId = start?.id ?? start?.conversationId ?? null;
  record('conversation handoff verified from public intent', { conversationId: state.ids.conversationId });
}

async function main() {
  ensureNonProductionUrl(baseUrl, 'BASE_URL');
  ensureNonProductionUrl(apiBaseUrl, 'API_BASE_URL');
  if (!allowRemote) fail('Set FITMEET_AGENT_BROWSER_QA_ALLOW_REMOTE=true to run against staging.');
  if (!userA.email || !userA.password || !userB.email || !userB.password) {
    fail('Set STAGING_USER_A_EMAIL/PASSWORD and STAGING_USER_B_EMAIL/PASSWORD.');
  }
  await mkdir(outputDir, { recursive: true });
  await assertRelease();
  const authA = await login(userA);
  const authB = await login(userB);
  await ensureProfileAndAuthorization(authA, 'A');
  await ensureProfileAndAuthorization(authB, 'B');

  const browser = await chromium.launch({ headless });
  try {
    const context = await browser.newContext({
      baseURL: baseUrl,
      viewport: { width: 1440, height: 960 },
    });
    await context.addInitScript(({ accessToken, refreshToken }) => {
      localStorage.setItem('fitmeet-token', accessToken);
      if (refreshToken) localStorage.setItem('fitmeet-refresh-token', refreshToken);
    }, { accessToken: authA.access_token, refreshToken: authA.refresh_token ?? '' });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/agent/chat`, { waitUntil: 'domcontentloaded' });
    await waitForApp(page);
    await screenshot(page, '01-agent-shell');

    await submitMessage(page, '帮我发布约练卡片，8.27 下午六点青岛中山公园找一个散步的搭子');
    await waitForSelectorWithBody(
      page,
      '[data-card-schema-type="social_match.slot_completion"], [data-testid="assistant-ui-schema-action"][data-schema-action="slot_completion.use_default_safety"]',
      'slot completion card',
      120_000,
    );
    await screenshot(page, '02-slot-completion');
    const taskId = await extractCurrentTaskId(page, authA.access_token);
    if (!taskId) fail('Could not resolve taskId after slot completion.');
    state.ids.taskId = taskId;
    record('slot completion reached', { taskId });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);
    await waitForSelectorWithBody(
      page,
      '[data-card-schema-type="social_match.slot_completion"], [data-testid="assistant-ui-schema-action"][data-schema-action="slot_completion.use_default_safety"]',
      'restored slot completion card',
      45_000,
    );
    await screenshot(page, '03-slot-restored-after-refresh');

    await submitMessage(page, '按默认安全设置处理');
    await waitForSelectorWithBody(page, '[data-testid="activity-opportunity-card"]', 'activity card', 120_000);
    await screenshot(page, '04-activity-card');
    record('manual default safety follow-up generated activity card', { taskId });

    await clickSchemaAction(page, 'publish_to_discover', 'publish action');
    await waitForSelectorWithBody(page, '[data-testid="assistant-ui-card-action-result"], [data-testid="opportunity-card"], [data-testid="assistant-ui-candidate-empty-card"]', 'publish result', 120_000);
    await screenshot(page, '05-publish-result');

    const publishedSession = await readTaskSession(taskId, authA.access_token);
    const publicIntentId = findFirstStringByKey(publishedSession, /^publicIntentId$/i);
    const socialRequestId = findFirstStringByKey(publishedSession, /^socialRequestId$/i);
    if (!publicIntentId) {
      fail(`Could not find publicIntentId in task session after publish: ${redact(JSON.stringify(publishedSession)).slice(0, 1000)}`);
    }
    state.ids.publicIntentId = publicIntentId;
    state.ids.socialRequestId = socialRequestId;
    await verifyDiscover(publicIntentId);

    if (stopAfterPublish) {
      record('stopped after publish for fault-injection matching job seed', {
        taskId,
        publicIntentId,
        socialRequestId,
      });
      await context.close();
      state.finishedAt = new Date().toISOString();
      state.result = 'PASS';
      await writeEvidence();
      console.log(`[staging-e2e] PASS ${markdownFile}`);
      return;
    }

    await waitForCandidates(page, taskId, authA.access_token);
    await screenshot(page, '06-candidates-or-empty');
    if (requireCandidate) {
      await verifyConversationCreated(authA, authB, publicIntentId);
    }

    await context.close();
  } finally {
    await browser.close();
  }

  state.finishedAt = new Date().toISOString();
  state.result = 'PASS';
  await writeEvidence();
  console.log(`[staging-e2e] PASS ${markdownFile}`);
}

async function writeEvidence(error) {
  await mkdir(outputDir, { recursive: true });
  if (error) {
    state.finishedAt = new Date().toISOString();
    state.result = 'FAIL';
    state.error = redact(error?.stack || error?.message || error);
  }
  await writeFile(evidenceFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  const lines = [
    '# FitMeet Staging Agent Public Loop E2E',
    '',
    `- Result: \`${state.result}\``,
    `- Base URL: \`${baseUrl}\``,
    `- API Base URL: \`${apiBaseUrl}\``,
    `- Expected release commit: \`${expectedReleaseCommit || 'not-required'}\``,
    `- taskId: \`${state.ids.taskId ?? 'unknown'}\``,
    `- socialRequestId: \`${state.ids.socialRequestId ?? 'unknown'}\``,
    `- publicIntentId: \`${state.ids.publicIntentId ?? 'unknown'}\``,
    `- conversationId: \`${state.ids.conversationId ?? 'unknown'}\``,
    `- JSON evidence: \`${path.relative(rootDir, evidenceFile)}\``,
    '',
    '## Screenshots',
    '',
    ...state.screenshots.map((item) => `- \`${item}\``),
    '',
    '## Steps',
    '',
    ...state.steps.map((item) => `- ${item.at}: ${item.step}`),
    '',
  ];
  if (state.error) {
    lines.push('## Error', '', '```text', state.error, '```', '');
  }
  await writeFile(markdownFile, `${lines.join('\n')}\n`, 'utf8');
}

main().catch(async (error) => {
  console.error(`[staging-e2e][FAIL] ${redact(error?.message || error)}`);
  await writeEvidence(error).catch(() => {});
  console.error(`[staging-e2e] Evidence: ${markdownFile}`);
  process.exit(1);
});
