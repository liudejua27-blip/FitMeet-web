import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const DEFAULT_BASE_URL = 'https://www.ourfitmeet.cn';
const baseUrlArg = process.argv.find((arg) => arg.startsWith('--base-url='))?.replace('--base-url=', '');
const apiBaseUrlArg = process.argv.find((arg) => arg.startsWith('--api-base-url='))?.replace('--api-base-url=', '');
const baseUrl = (process.env.FITMEET_AGENT_BROWSER_QA_BASE_URL || process.env.BASE_URL || baseUrlArg || DEFAULT_BASE_URL).replace(/\/+$/, '');
const apiBaseUrl = (
  process.env.FITMEET_AGENT_BROWSER_QA_API_BASE_URL ||
  process.env.API_BASE_URL ||
  apiBaseUrlArg ||
  `${baseUrl}/api`
).replace(/\/+$/, '');
const email = process.env.FITMEET_AGENT_BROWSER_QA_EMAIL || '';
const password = process.env.FITMEET_AGENT_BROWSER_QA_PASSWORD || '';
const allowRemote = process.env.FITMEET_AGENT_BROWSER_QA_ALLOW_REMOTE === 'true';
const runConversation = process.env.FITMEET_AGENT_BROWSER_QA_RUN_CONVERSATION !== 'false';
const expectedReleaseCommit = process.env.EXPECTED_RELEASE_COMMIT || process.env.FITMEET_RELEASE_COMMIT || '';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');
const evidenceDir = path.resolve(
  rootDir,
  process.env.FITMEET_AGENT_BROWSER_QA_OUTPUT_DIR || 'artifacts/agent-browser-qa',
);
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const evidenceFile = path.join(evidenceDir, `agent-browser-qa-${timestamp}.md`);

const viewports = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1024', width: 1024, height: 768 },
  { name: 'desktop-1440', width: 1440, height: 960 },
];

const requiredSelectors = [
  '[data-testid="assistant-ui-shell"]',
  '[data-testid="assistant-ui-main"]',
  '[data-testid="assistant-ui-thread"]',
  '[data-testid="assistant-ui-thread-list"]',
  '[data-testid="assistant-ui-composer"]',
  '[data-testid="assistant-ui-composer-input"]',
];

const forbiddenSelectors = [
  '.agent-gpt-copy-shell',
  '.agent-workspace--gpt',
  '.agent-gpt-result-block',
  '.agent-workspace-ant-guide',
  '.codex-ant-pet',
  '.fitmeet-assistant-shell',
  '.fitmeet-composer',
  '.life-modal',
];

const forbiddenOrdinarySocialSelectors = [
  '[data-testid="opportunity-card"]',
  '[data-testid="activity-opportunity-card"]',
  '[data-testid="assistant-ui-approval-tool"]',
];

const forbiddenRecoveryCopy = [
  /原始目标/,
  /从已保存的步骤继续/,
  /从已保存的工具步骤/,
  /从已保存的 Agent 状态/,
  /继续刚才保存的 Agent 步骤/,
];

const forbiddenOrdinarySocialCopy = [
  /推荐给你的人/,
  /确认后发邀请/,
  /发送邀请前需要你确认/,
  /匹配整理/,
  /匹配前还差/,
  /需要补充人物画像/,
  /需要补充的信息/,
  /正在确认需要补充的信息/,
  /等待你确认/,
  /约练卡/,
  /候选人/,
  /发布到发现/,
];

const forbiddenOrdinaryThreadTitleCopy = [
  /搭子/,
  /约练/,
  /找人/,
  /推荐活动/,
  /候选人/,
  /公开发起/,
];

const forbiddenVisibleProcessInternals = [
  /tool_call/i,
  /traceId/i,
  /planner/i,
  /raw JSON/i,
  /payload/i,
  /runtime/i,
  /hydrate_context/i,
  /slot\.filled/i,
];

function isLocalTarget(url) {
  const parsed = new URL(url);
  return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
}

function redact(value) {
  return String(value)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[redacted-email]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [redacted]')
    .replace(/(token|password|authorization)["'=:\s]+[A-Za-z0-9._~+/=-]+/gi, '$1=[redacted]');
}

async function login() {
  if (!email || !password) {
    throw new Error('Set FITMEET_AGENT_BROWSER_QA_EMAIL and FITMEET_AGENT_BROWSER_QA_PASSWORD.');
  }
  const response = await fetch(`${apiBaseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Login failed with ${response.status}: ${redact(body).slice(0, 240)}`);
  }
  const parsed = JSON.parse(body);
  if (!parsed.access_token) {
    throw new Error('Login response did not include access_token.');
  }
  return parsed;
}

function assertSessionDoesNotRestoreFailedTask(session) {
  const body = JSON.stringify(session);
  if (body.includes('task_conversation_unbound')) {
    throw new Error('Social Agent session restored a task_conversation_unbound legacy task.');
  }

  const stack = [session];
  while (stack.length > 0) {
    const item = stack.pop();
    if (!item || typeof item !== 'object') continue;
    const status = typeof item.status === 'string' ? item.status.toLowerCase() : '';
    const statusReason = typeof item.statusReason === 'string' ? item.statusReason : '';
    const hasActiveTask =
      item.activeTaskId !== undefined &&
      item.activeTaskId !== null &&
      String(item.activeTaskId).trim() !== '';
    if (hasActiveTask && status === 'failed') {
      throw new Error(`Social Agent session restored failed activeTaskId=${item.activeTaskId}.`);
    }
    if (hasActiveTask && statusReason === 'task_conversation_unbound') {
      throw new Error(`Social Agent session restored unbound activeTaskId=${item.activeTaskId}.`);
    }
    for (const value of Object.values(item)) {
      if (value && typeof value === 'object') stack.push(value);
    }
  }
}

async function assertAgentSessionApi(accessToken) {
  const response = await fetch(`${apiBaseUrl}/social-agent/chat/session`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'FitMeetAgentProductionBrowserQA/1.0',
    },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Social Agent session check failed with ${response.status}: ${redact(body).slice(0, 240)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`Social Agent session returned non-JSON response: ${redact(body).slice(0, 240)}`);
  }
  assertSessionDoesNotRestoreFailedTask(parsed);
  return parsed;
}

async function assertDeploymentRelease() {
  if (!expectedReleaseCommit) return { status: 'skipped', actual: 'not-required' };

  const response = await fetch(`${apiBaseUrl}/health`, {
    headers: { 'User-Agent': 'FitMeetAgentProductionBrowserQA/1.0' },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Release metadata check failed with ${response.status}: ${redact(body).slice(0, 240)}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`Release metadata check returned non-JSON health response: ${redact(body).slice(0, 240)}`);
  }

  const actual = parsed?.release?.commit || 'unknown';
  if (actual !== expectedReleaseCommit) {
    throw new Error(
      [
        `Backend release commit mismatch: got ${actual}, expected ${expectedReleaseCommit}.`,
        'Run this on the ECS host:',
        `cd /opt/FitMeet-web && EXPECTED_RELEASE_COMMIT=${expectedReleaseCommit} PUBLIC_API_BASE_URL=${apiBaseUrl} ./scripts/ecs-release-diagnose.sh`,
        'Do not use browser QA evidence until /api/health exposes the expected release.commit.',
      ].join('\n'),
    );
  }

  return {
    status: 'matched',
    actual,
    builtAt: parsed?.release?.builtAt || 'unknown',
    source: parsed?.release?.source || 'unknown',
  };
}

async function waitForApp(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#root').waitFor({ state: 'attached', timeout: 15_000 });
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(350);
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 2) {
    throw new Error(`${label}: horizontal overflow ${overflow}px`);
  }
}

async function assertShell(page, viewport) {
  for (const selector of requiredSelectors) {
    await page.locator(selector).first().waitFor({ state: 'visible', timeout: 15_000 });
  }
  for (const selector of forbiddenSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) throw new Error(`${viewport.name}: forbidden legacy selector rendered: ${selector}`);
  }
  await assertNoHorizontalOverflow(page, viewport.name);
  await assertNoStaleRecoveryCopy(page, `${viewport.name} shell`);
}

async function assertNoStaleRecoveryCopy(page, label) {
  const text = await page.locator('body').innerText();
  for (const pattern of forbiddenRecoveryCopy) {
    if (pattern.test(text)) {
      throw new Error(`${label}: leaked stale checkpoint recovery copy matching ${pattern}`);
    }
  }
}

async function newChat(page) {
  const newChatButton = page.getByRole('button', { name: '新对话', exact: true }).first();
  if (await newChatButton.isVisible().catch(() => false)) {
    await newChatButton.click();
    await page.waitForTimeout(300);
  }
}

async function submitMessage(page, text, { waitAfter = true } = {}) {
  const input = page.locator('[data-testid="assistant-ui-composer-input"]').first();
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.fill(text);
  await input.press('Enter').catch(async () => {
    await page.getByRole('button', { name: '发送' }).click();
  });
  if (waitAfter) await page.waitForTimeout(500);
}

async function waitForCoveringProcessStatus(page, label) {
  await page
    .waitForFunction(
      () => {
        const inline = document.querySelector('[data-testid="assistant-ui-inline-thinking"]');
        const processLine = document.querySelector('[data-testid="assistant-ui-process-status-line"]');
        const tool = document.querySelector('[data-testid="assistant-ui-tool-ui"]');
        return Boolean(inline || processLine || tool);
      },
      null,
      { timeout: 10_000 },
    )
    .catch(async () => {
      const body = await page.locator('body').innerText().catch(() => '');
      throw new Error(`${label}: did not show a GPT-style visible process state within 10s. Body: ${body.slice(0, 700)}`);
    });

  const state = await page.evaluate(() => {
    const inline = document.querySelector('[data-testid="assistant-ui-inline-thinking"]');
    const processLine = document.querySelector('[data-testid="assistant-ui-process-status-line"]');
    const tool = document.querySelector('[data-testid="assistant-ui-tool-ui"]');
    const processSteps = Array.from(document.querySelectorAll('[data-testid="assistant-ui-process-step"]'));
    const toolOpen = tool ? tool.hasAttribute('open') : null;
    return {
      text: (inline?.textContent || processLine?.textContent || tool?.textContent || '').trim(),
      inline: inline
        ? {
            statusModel: inline.getAttribute('data-status-model'),
            updateModel: inline.getAttribute('data-update-model'),
            detailPolicy: inline.getAttribute('data-trace-detail-policy'),
            finalAnswer: inline.getAttribute('data-final-answer'),
          }
        : null,
      tool: tool
        ? {
            rendering: tool.getAttribute('data-process-rendering'),
            mainline: tool.getAttribute('data-process-mainline'),
            historyVisibility: tool.getAttribute('data-process-history-visibility'),
            stepCount: tool.getAttribute('data-process-step-count'),
            open: toolOpen,
          }
        : null,
      processStepCount: processSteps.length,
    };
  });

  if (!state.text) {
    throw new Error(`${label}: visible process state rendered but had no readable text.`);
  }

  if (state.inline) {
    if (state.inline.statusModel !== 'single-line-replaceable') {
      throw new Error(`${label}: inline thinking must be a single replaceable status, got ${state.inline.statusModel}.`);
    }
    if (state.inline.updateModel !== 'replace-previous-status') {
      throw new Error(`${label}: inline thinking must replace previous status, got ${state.inline.updateModel}.`);
    }
    if (state.inline.detailPolicy !== 'collapsed') {
      throw new Error(`${label}: inline thinking details should stay collapsed, got ${state.inline.detailPolicy}.`);
    }
    if (state.inline.finalAnswer !== 'false') {
      throw new Error(`${label}: visible process state should not be marked as final answer.`);
    }
  }

  if (state.tool) {
    if (state.tool.rendering !== 'covering-status') {
      throw new Error(`${label}: tool process must render as covering status, got ${state.tool.rendering}.`);
    }
    if (state.tool.mainline !== 'latest-visible-summary') {
      throw new Error(`${label}: tool process must use latest-visible-summary, got ${state.tool.mainline}.`);
    }
    if (state.tool.historyVisibility !== 'collapsed') {
      throw new Error(`${label}: tool process history must default collapsed, got ${state.tool.historyVisibility}.`);
    }
    if (state.tool.stepCount && Number(state.tool.stepCount) > 1) {
      throw new Error(`${label}: default process should expose only one latest status, got ${state.tool.stepCount}.`);
    }
  }

  if (state.tool?.open === false && state.processStepCount > 0) {
    throw new Error(`${label}: collapsed process leaked ${state.processStepCount} timeline steps.`);
  }

  for (const pattern of forbiddenVisibleProcessInternals) {
    if (pattern.test(state.text)) {
      throw new Error(`${label}: visible process leaked internal term matching ${pattern}.`);
    }
  }

  return state;
}

async function waitForAssistantResponse(page, label) {
  await page
    .waitForFunction(
      () => {
        const messages = Array.from(document.querySelectorAll('[data-testid="assistant-ui-message"]'));
        const assistantMessages = messages.filter((item) => item.getAttribute('data-role') === 'assistant');
        return assistantMessages.some((item) => (item.textContent || '').trim().length >= 8);
      },
      null,
      { timeout: 60_000 },
    )
    .catch(async () => {
      const body = await page.locator('body').innerText().catch(() => '');
      throw new Error(`${label}: timed out waiting for assistant response. Body: ${body.slice(0, 600)}`);
    });
}

async function assertOrdinaryChat(page) {
  await newChat(page);
  await submitMessage(page, '请用两句话帮我安排今天的训练恢复，不要帮我找人，也不要推荐活动。', {
    waitAfter: false,
  });
  await waitForCoveringProcessStatus(page, 'ordinary chat early process');
  await waitForAssistantResponse(page, 'ordinary chat');
  for (const selector of forbiddenOrdinarySocialSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) throw new Error(`ordinary chat unexpectedly rendered social UI: ${selector}`);
  }
  const text = await page.locator('body').innerText();
  for (const pattern of forbiddenOrdinarySocialCopy) {
    if (pattern.test(text)) {
      throw new Error(`ordinary chat leaked social process/profile copy matching ${pattern}.`);
    }
  }
  await assertNoStaleRecoveryCopy(page, 'ordinary chat');
  await assertOrdinaryThreadTitle(page);
}

async function assertSocialIntent(page) {
  await newChat(page);
  await submitMessage(
    page,
    '我想在青岛周末下午找一个轻松羽毛球搭子，只接受公开场所，先帮我看看合适机会。',
    { waitAfter: false },
  );
  await waitForCoveringProcessStatus(page, 'social intent early process');
  await page
    .waitForFunction(
      () => {
        const text = document.body.innerText || '';
        const hasOpportunity =
          document.querySelectorAll('[data-testid="opportunity-card"], [data-testid="activity-opportunity-card"]').length > 0;
        const clarifying = /城市|时间|强度|边界|陌生人|公开场所|公开发起|确认/.test(text);
        return hasOpportunity || clarifying;
      },
      null,
      { timeout: 75_000 },
    )
    .catch(async () => {
      const body = await page.locator('body').innerText().catch(() => '');
      throw new Error(`social intent did not clarify or render opportunities. Body: ${body.slice(0, 800)}`);
    });
}

async function assertOrdinaryThreadTitle(page) {
  const activeThread = page
    .locator('[data-testid="assistant-ui-thread-list-items"] button[aria-current="page"]')
    .first();
  const activeVisible = await activeThread.isVisible().catch(() => false);
  if (!activeVisible) return;

  await page.waitForTimeout(1_000);
  const rawText = (await activeThread.innerText().catch(() => '')).trim();
  const title = rawText
    .split('\n')
    .map((part) => part.trim())
    .find(Boolean);
  if (!title || title === '新对话') return;

  for (const pattern of forbiddenOrdinaryThreadTitleCopy) {
    if (pattern.test(title)) {
      throw new Error(`ordinary chat thread title was socialized: "${title}" matched ${pattern}.`);
    }
  }
}

async function assertAccountMenu(page, viewportName) {
  const accountButton = page.locator('[data-testid="assistant-ui-sidebar-account"]').first();
  await accountButton.waitFor({ state: 'visible', timeout: 10_000 });
  await accountButton.click();

  const menu = page.locator('[data-testid="assistant-ui-sidebar-account-menu"]').first();
  await menu.waitFor({ state: 'visible', timeout: 5_000 });

  const requiredItems = ['个人信息'];
  for (const item of requiredItems) {
    await page.getByRole('menuitem', { name: new RegExp(item) }).waitFor({
      state: 'visible',
      timeout: 5_000,
    });
  }

  const reminderVisible = await page
    .locator('[data-testid="assistant-ui-reminder-toggle"]')
    .isVisible()
    .catch(() => false);
  if (reminderVisible) {
    throw new Error('account menu is open but reminder toggle is still visible and may cover account actions.');
  }

  const shot = await screenshot(page, `${viewportName}-account-menu`);
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'hidden', timeout: 5_000 });
  return shot;
}

async function screenshot(page, name) {
  const file = path.join(evidenceDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function main() {
  if (!isLocalTarget(baseUrl) && !allowRemote) {
    throw new Error('Refusing remote browser QA. Set FITMEET_AGENT_BROWSER_QA_ALLOW_REMOTE=true for an intentional run.');
  }
  await mkdir(evidenceDir, { recursive: true });
  const release = await assertDeploymentRelease();
  const auth = await login();
  await assertAgentSessionApi(auth.access_token);
  const browser = await chromium.launch({ headless: true });
  const lines = [
    '# FitMeet Agent Production Browser QA',
    '',
    `- Generated at UTC: \`${new Date().toISOString()}\``,
    `- Base URL: \`${baseUrl}\``,
    `- API Base URL: \`${apiBaseUrl}\``,
    `- Expected release commit: \`${expectedReleaseCommit || 'not-required'}\``,
    `- Release check: \`${release.status}\``,
    `- Release actual commit: \`${release.actual}\``,
    '- Session API: `no failed or unbound active task`',
    `- Conversation checks: \`${runConversation}\``,
    '- Account: `[redacted-email]`',
    '',
  ];

  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        baseURL: baseUrl,
      });
      await context.addInitScript(({ accessToken, refreshToken }) => {
        localStorage.setItem('fitmeet-token', accessToken);
        if (refreshToken) localStorage.setItem('fitmeet-refresh-token', refreshToken);
      }, { accessToken: auth.access_token, refreshToken: auth.refresh_token ?? '' });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/agent/chat`, { waitUntil: 'domcontentloaded' });
      await waitForApp(page);
      await assertShell(page, viewport);
      const shot = await screenshot(page, `${viewport.name}-shell`);
      lines.push(`- ${viewport.name} shell: \`${path.relative(rootDir, shot)}\``);

      if (runConversation && viewport.name === 'desktop-1440') {
        const accountMenuShot = await assertAccountMenu(page, viewport.name);
        lines.push(`- account menu proof: \`${path.relative(rootDir, accountMenuShot)}\``);
        await assertOrdinaryChat(page);
        const ordinaryShot = await screenshot(page, `${viewport.name}-ordinary-chat`);
        lines.push(`- ordinary chat proof: \`${path.relative(rootDir, ordinaryShot)}\``);
        await assertSocialIntent(page);
        const socialShot = await screenshot(page, `${viewport.name}-social-intent`);
        lines.push(`- social intent proof: \`${path.relative(rootDir, socialShot)}\``);
        await assertNoStaleRecoveryCopy(page, 'social intent');
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }

  lines.push('', 'Result: `PASS`', '');
  await writeFile(evidenceFile, `${lines.join('\n')}\n`, 'utf8');
  console.log(`[agent-production-browser-qa] PASS ${evidenceFile}`);
}

main().catch(async (error) => {
  await mkdir(evidenceDir, { recursive: true }).catch(() => {});
  await writeFile(
    evidenceFile,
    `# FitMeet Agent Production Browser QA\n\nResult: \`FAIL\`\n\n\`\`\`text\n${redact(error?.stack || error)}\n\`\`\`\n`,
    'utf8',
  ).catch(() => {});
  console.error(`[agent-production-browser-qa][FAIL] ${redact(error?.message || error)}`);
  console.error(`[agent-production-browser-qa] Evidence: ${evidenceFile}`);
  process.exit(1);
});
