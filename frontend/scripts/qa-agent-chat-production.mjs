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
const email = process.env.FITMEET_AGENT_BROWSER_QA_EMAIL || process.env.AGENT_SMOKE_EMAIL || '';
const password = process.env.FITMEET_AGENT_BROWSER_QA_PASSWORD || process.env.AGENT_SMOKE_PASSWORD || '';
const allowRemote = process.env.FITMEET_AGENT_BROWSER_QA_ALLOW_REMOTE === 'true';
const runConversation = process.env.FITMEET_AGENT_BROWSER_QA_RUN_CONVERSATION !== 'false';
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
}

async function newChat(page) {
  const newChatButton = page.getByRole('button', { name: '新对话', exact: true }).first();
  if (await newChatButton.isVisible().catch(() => false)) {
    await newChatButton.click();
    await page.waitForTimeout(300);
  }
}

async function submitMessage(page, text) {
  const input = page.locator('[data-testid="assistant-ui-composer-input"]').first();
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.fill(text);
  await input.press('Enter').catch(async () => {
    await page.getByRole('button', { name: '发送' }).click();
  });
  await page.waitForTimeout(500);
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
  await submitMessage(page, '请用两句话帮我安排今天的训练恢复，不要帮我找人，也不要推荐活动。');
  await waitForAssistantResponse(page, 'ordinary chat');
  for (const selector of forbiddenOrdinarySocialSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) throw new Error(`ordinary chat unexpectedly rendered social UI: ${selector}`);
  }
  const text = await page.locator('body').innerText();
  if (/推荐给你的人|确认后发邀请|发送邀请前需要你确认/.test(text)) {
    throw new Error('ordinary chat leaked social recommendation copy.');
  }
}

async function assertSocialIntent(page) {
  await newChat(page);
  await submitMessage(
    page,
    '我想在青岛周末下午找一个轻松羽毛球搭子，只接受公开场所，先帮我看看合适机会。',
  );
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
  const auth = await login();
  const browser = await chromium.launch({ headless: true });
  const lines = [
    '# FitMeet Agent Production Browser QA',
    '',
    `- Generated at UTC: \`${new Date().toISOString()}\``,
    `- Base URL: \`${baseUrl}\``,
    `- API Base URL: \`${apiBaseUrl}\``,
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
        await assertOrdinaryChat(page);
        const ordinaryShot = await screenshot(page, `${viewport.name}-ordinary-chat`);
        lines.push(`- ordinary chat proof: \`${path.relative(rootDir, ordinaryShot)}\``);
        await assertSocialIntent(page);
        const socialShot = await screenshot(page, `${viewport.name}-social-intent`);
        lines.push(`- social intent proof: \`${path.relative(rootDir, socialShot)}\``);
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
