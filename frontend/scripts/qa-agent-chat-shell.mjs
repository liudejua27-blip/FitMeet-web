import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const DEFAULT_BASE_URL = 'http://127.0.0.1:5173';
const baseUrlArg = process.argv.find((arg) => arg.startsWith('--base-url='))?.replace('--base-url=', '');
const hasExplicitBaseUrl = Boolean(
  process.env.FITMEET_E2E_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || baseUrlArg,
);
let baseUrl = process.env.FITMEET_E2E_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || baseUrlArg || DEFAULT_BASE_URL;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const qaOutputDir = path.resolve(__dirname, '..', 'qa', 'agent-chat-shell');

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
  '[data-testid="assistant-ui-attachment-dropzone"]',
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

const internalToolTerms = [
  'tool_call',
  'toolCalls',
  'traceId',
  'planner',
  'raw JSON',
  'Life Graph Agent',
  'Social Match Agent',
  'Meet Loop Agent',
  'Agent Brain',
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

const isPortAvailable = async (port) =>
  await new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });

const findAvailablePort = async (preferredPort) => {
  for (let port = preferredPort; port < preferredPort + 50; port += 1) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`[agent-chat-qa] Could not find an available local port near ${preferredPort}`);
};

const assertNoInternalToolTerms = async (page, viewport, scope) => {
  const bodyText = await page.locator('body').innerText();
  for (const term of internalToolTerms) {
    if (bodyText.includes(term)) {
      throw new Error(`[agent-chat-qa] ${viewport.name}: ${scope} exposed internal tool term "${term}"`);
    }
  }

  const leakedAttributes = await page.evaluate((terms) => {
    const matches = [];
    const attributesToInspect = [
      'data-agent-name',
      'data-step-kind',
      'data-renderer',
      'data-schema-type',
      'aria-label',
      'title',
    ];
    for (const element of Array.from(document.querySelectorAll('[data-testid], [aria-label], [title]'))) {
      for (const attribute of attributesToInspect) {
        const value = element.getAttribute(attribute);
        if (!value) continue;
        const term = terms.find((item) => value.includes(item));
        if (term) {
          matches.push({
            attribute,
            value,
            term,
            testId: element.getAttribute('data-testid') ?? '',
          });
        }
      }
    }
    return matches;
  }, internalToolTerms);
  if (leakedAttributes.length > 0) {
    const first = leakedAttributes[0];
    throw new Error(
      `[agent-chat-qa] ${viewport.name}: ${scope} leaked "${first.term}" in ${first.attribute}="${first.value}"`,
    );
  }
};

const expectAttribute = async (locator, attribute, expected, viewport) => {
  const actual = await locator.getAttribute(attribute);
  if (actual !== expected) {
    throw new Error(
      `[agent-chat-qa] ${viewport.name}: expected ${attribute}="${expected}", received "${actual ?? 'null'}"`,
    );
  }
};

const qaUser = {
  id: 10001,
  name: 'QA User',
  avatar: '',
  color: '#18181b',
  gender: 'unknown',
  age: 28,
  city: 'Qingdao',
  gym: '',
  bio: '',
  singleCert: false,
  verified: true,
  interestTags: ['running'],
  trainingDays: 3,
  trainingCount: 12,
  caloriesBurned: 1200,
  bestRecords: [],
  isCoach: false,
  followers: 0,
  following: 0,
  posts: 0,
};

const realModeThreads = [
  {
    id: '202',
    threadId: 202,
    taskId: 202,
    title: '周末轻松跑步计划',
    preview: '青岛周末下午，轻松跑步，只在公共场所。',
    status: 'regular',
    goal: '我想找青岛本周末下午轻松跑步搭子',
    messageCount: 2,
    updatedAt: '2026-06-14T09:30:00.000Z',
    createdAt: '2026-06-14T09:00:00.000Z',
    branch: {
      activeBranchId: 'thread-202-a1',
      branchSelections: {},
      branchCount: 1,
      parentMessageId: 'thread-202-u1',
      updatedAt: '2026-06-14T09:30:00.000Z',
    },
    custom: { source: 'agent-chat-qa' },
  },
  {
    id: '203',
    threadId: 203,
    taskId: 203,
    title: '普通训练安排',
    preview: '只想普通聊天，帮我整理训练。',
    status: 'regular',
    goal: '只想普通聊天，帮我梳理今天训练安排',
    messageCount: 2,
    updatedAt: '2026-06-13T18:10:00.000Z',
    createdAt: '2026-06-13T18:00:00.000Z',
    branch: null,
    custom: { source: 'agent-chat-qa' },
  },
];

const makeSafeStatus = () => ({
  blocked: false,
  level: 'low',
  boundaryNotes: ['不会自动发送消息、加好友或发布约练'],
  requiredConfirmations: [],
});

const makeThreadSession = (taskId, userText, assistantText) => ({
  hasSession: true,
  activeTaskId: taskId,
  task: {
    id: taskId,
    goal: userText,
    permissionMode: 'limited_auto',
    status: 'completed',
    title: taskId === 202 ? '周末轻松跑步计划' : '普通训练安排',
    updatedAt: taskId === 202 ? '2026-06-14T09:30:00.000Z' : '2026-06-13T18:10:00.000Z',
    createdAt: taskId === 202 ? '2026-06-14T09:00:00.000Z' : '2026-06-13T18:00:00.000Z',
  },
  messages: [
    {
      id: `thread-${taskId}-u1`,
      role: 'user',
      content: userText,
      createdAt: taskId === 202 ? '2026-06-14T09:00:00.000Z' : '2026-06-13T18:00:00.000Z',
    },
    {
      id: `thread-${taskId}-a1`,
      role: 'assistant',
      content: assistantText,
      createdAt: taskId === 202 ? '2026-06-14T09:01:00.000Z' : '2026-06-13T18:01:00.000Z',
    },
  ],
  events: [],
  result: {
    assistantMessage: assistantText,
    lightStatus: '已整理回复',
    cards: [],
    safeStatus: makeSafeStatus(),
    pendingConfirmations: [],
    permissionMode: 'limited_auto',
    runtime: {
      threadId: String(taskId),
      checkpointId: null,
      canResume: false,
      canReplay: false,
      canFork: false,
    },
  },
  latestRun: null,
  pendingApprovals: [],
  restoredAt: '2026-06-14T10:00:00.000Z',
});

const realModeThreadDetails = {
  202: {
    thread: realModeThreads[0],
    session: makeThreadSession(
      202,
      '我想找青岛本周末下午轻松跑步搭子',
      '已恢复：周末轻松跑步计划会先确认城市、时间、强度和社交边界。',
    ),
  },
  203: {
    thread: realModeThreads[1],
    session: makeThreadSession(
      203,
      '只想普通聊天，帮我梳理今天训练安排',
      '已恢复：普通训练安排只保留自然对话，不会展示社交推荐卡片。',
    ),
  },
};

const checkpointStreamResponse = (action, checkpointId, stepId) => {
  const actionCopy =
    action === 'retry'
      ? '已重试这个步骤。'
      : action === 'fork'
        ? '已生成一个新版本。'
        : '已重新运行这一步。';
  const event = {
    type: 'assistant_delta',
    lifecycle: 'completed',
    delta: actionCopy,
    source: 'fallback',
  };
  const done = {
    type: 'assistant_done',
    lifecycle: 'completed',
    source: 'fallback',
  };
  const result = {
    type: 'result',
    lifecycle: 'completed',
    result: {
      assistantMessage: actionCopy,
      lightStatus: '已整理回复',
      permissionMode: 'limited_auto',
      safeStatus: {
        blocked: false,
        level: 'low',
        boundaryNotes: ['已沿当前进度继续，没有重复执行高风险动作。'],
        requiredConfirmations: [],
      },
      pendingConfirmations: [],
      cards: [],
      runtime: {
        checkpointId,
        checkpointType: 'step',
        canResume: false,
        canReplay: true,
        canFork: action !== 'retry',
        parentCheckpointId: checkpointId,
        threadId: 'mock-thread-checkpoint',
        checkpointAction: action,
        resumeCursor: {
          threadId: 'mock-thread-checkpoint',
          parentCheckpointId: checkpointId,
          action,
          stepId,
        },
      },
    },
  };
  return [event, done, result].map((item) => `data: ${JSON.stringify(item)}\n\n`).join('');
};

const startLocalViteServer = async ({
  port = 5173,
  adapter = 'mock',
  mockFlow = true,
} = {}) => {
  const viteBin = process.platform === 'win32' ? 'node_modules/.bin/vite.cmd' : 'node_modules/.bin/vite';
  const child = spawn(viteBin, ['--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      BROWSER: 'none',
      VITE_AGENT_ADAPTER: adapter,
      VITE_AGENT_MOCK_FLOW: mockFlow ? 'true' : 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return await new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      reject(new Error(`[agent-chat-qa] Timed out while starting local Vite server on port ${port}`));
    }, 20_000);

    const settleReady = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(child);
    };

    const settleFailed = (message) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Error(message));
    };

    child.stdout.on('data', (chunk) => {
      const output = String(chunk);
      if (output.includes('Local:') || output.includes('ready in')) {
        settleReady();
      }
    });

    child.stderr.on('data', (chunk) => {
      const output = String(chunk);
      if (output.includes('EADDRINUSE') || (output.includes('Port') && output.includes('is already in use'))) {
        settleFailed(
          `[agent-chat-qa] Port ${port} is already in use. Set PLAYWRIGHT_BASE_URL to test an existing server.`,
        );
      }
    });

    child.on('exit', (code) => {
      if (!settled) {
        settleFailed(`[agent-chat-qa] Local Vite server exited before ready, code=${code ?? 'unknown'}`);
      }
    });
  });
};

const waitForApp = async (page) => {
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#root').waitFor({ state: 'attached', timeout: 10_000 });
  await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => {});
  await page.waitForTimeout(200);
};

const clickNewChat = async (page) => {
  const threadList = page.locator('[data-testid="assistant-ui-thread-list"]');
  const threadListState = await threadList.getAttribute('data-state');
  if (threadListState !== 'open') {
    await page.getByRole('button', { name: '打开会话列表' }).click();
    await page.waitForFunction(() => {
      const node = document.querySelector('[data-testid="assistant-ui-thread-list"]');
      return node?.getAttribute('data-state') === 'open';
    });
  }
  await page.getByRole('button', { name: '新对话', exact: true }).click();
};

const assertShellStructure = async (page, viewport) => {
  await page.goto(new URL('/agent/chat', baseUrl).toString());
  await waitForApp(page);

  for (const selector of requiredSelectors) {
    const count = await page.locator(selector).count();
    if (count === 0) {
      throw new Error(`[agent-chat-qa] ${viewport.name}: missing required selector ${selector}`);
    }
  }

  const hasThreadViewport = (await page.locator('[data-testid="assistant-ui-thread-viewport"]').count()) > 0;
  const hasEmptyState = (await page.locator('[data-testid="assistant-ui-empty-state"]').count()) > 0;
  if (!hasThreadViewport && !hasEmptyState) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: missing both thread viewport and empty state`);
  }

  const shell = page.locator('[data-testid="assistant-ui-shell"]');
  const main = page.locator('[data-testid="assistant-ui-main"]');
  const expectedSidebarMode = viewport.width >= 1024 ? 'desktop' : 'mobile';
  const expectedSidebarState = expectedSidebarMode === 'desktop' ? 'open' : 'closed';
  if ((await shell.getAttribute('data-sidebar-mode')) !== expectedSidebarMode) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: shell did not expose ${expectedSidebarMode} sidebar mode`);
  }
  if ((await shell.getAttribute('data-sidebar-state')) !== expectedSidebarState) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: shell sidebar state did not match initial viewport state`);
  }
  const authState = await shell.getAttribute('data-auth-state');
  if (!['signed-out', 'signed-in'].includes(authState ?? '')) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: shell did not expose a valid auth state`);
  }
  if ((await shell.getAttribute('data-stream-state')) !== 'idle') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: shell did not start idle`);
  }
  if ((await shell.getAttribute('data-session-state')) !== 'ready') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: shell did not start ready`);
  }
  if ((await shell.getAttribute('data-message-count')) !== '0') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: shell did not expose empty message count`);
  }
  if ((await main.getAttribute('aria-label')) !== '聊天主区域') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: main chat area did not expose a clear landmark label`);
  }
  if ((await main.getAttribute('data-recovery-state')) !== 'none') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: main chat area should not start in recovery state`);
  }
  const thread = page.locator('[data-testid="assistant-ui-thread"]');
  if ((await thread.getAttribute('data-thread-model')) !== 'assistant-ui-thread') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: thread did not expose assistant-ui model`);
  }
  if ((await thread.getAttribute('data-thread-shell')) !== 'chatgpt-clone') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: thread shell drifted away from ChatGPT clone`);
  }
  if ((await thread.getAttribute('data-empty-state')) !== 'visible') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: empty thread did not expose visible empty state`);
  }
  if ((await thread.getAttribute('data-viewport-state')) !== 'hidden') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: empty thread should not expose the message viewport`);
  }
  const emptyState = page.locator('[data-testid="assistant-ui-empty-state"]');
  if ((await emptyState.getAttribute('data-empty-model')) !== 'assistant-ui-welcome') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: empty state did not use assistant-ui welcome model`);
  }
  if ((await emptyState.getAttribute('data-empty-layout')) !== 'centered-composer') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: empty state composer was not centered`);
  }
  if ((await emptyState.getAttribute('data-suggestion-chips')) !== 'none') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: empty state reintroduced prompt chips`);
  }
  if ((await page.locator('[data-testid="assistant-ui-empty-title"]').getAttribute('data-title-model')) !== 'chatgpt-welcome') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: empty title did not expose ChatGPT welcome model`);
  }
  if ((await page.locator('[data-testid="assistant-ui-empty-composer-slot"]').getAttribute('data-composer-placement')) !== 'centered-empty-state') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: empty composer slot placement drifted`);
  }
  const emptyMessages = page.locator('[data-testid="assistant-ui-messages"]').first();
  if ((await emptyMessages.getAttribute('data-messages-model')) !== 'assistant-ui-thread-messages') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: empty messages model drifted`);
  }
  if ((await emptyMessages.getAttribute('data-message-renderer')) !== 'assistant-ui-message-parts') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: empty messages renderer drifted`);
  }

  for (const selector of forbiddenSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      throw new Error(`[agent-chat-qa] ${viewport.name}: forbidden legacy selector rendered ${selector}`);
    }
  }

  const metrics = await page.evaluate(() => {
    const composer = document.querySelector('[data-testid="assistant-ui-composer"]')?.getBoundingClientRect();
    const thread = document.querySelector('[data-testid="assistant-ui-thread"]')?.getBoundingClientRect();

    return {
      innerWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body?.scrollWidth ?? 0,
      composer: composer
        ? {
            left: composer.left,
            right: composer.right,
            bottom: composer.bottom,
            height: composer.height,
          }
        : null,
      thread: thread
        ? {
            left: thread.left,
            right: thread.right,
            height: thread.height,
          }
        : null,
    };
  });

  const maxScrollWidth = Math.max(metrics.documentScrollWidth, metrics.bodyScrollWidth);
  if (maxScrollWidth > metrics.innerWidth + 1) {
    throw new Error(
      `[agent-chat-qa] ${viewport.name}: horizontal overflow detected (${maxScrollWidth}px > ${metrics.innerWidth}px)`,
    );
  }

  if (!metrics.composer) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: composer metrics unavailable`);
  }

  if (metrics.composer.left < -1 || metrics.composer.right > metrics.innerWidth + 1) {
    throw new Error(
      `[agent-chat-qa] ${viewport.name}: composer escapes viewport (${metrics.composer.left}-${metrics.composer.right})`,
    );
  }

  if (!metrics.thread || metrics.thread.height < 360) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: thread viewport is unexpectedly small`);
  }

  const screenshotPath = path.join(qaOutputDir, `agent-chat-${viewport.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`[agent-chat-qa] ${viewport.name}: PASS (${screenshotPath})`);
};

const seedAuthenticatedSession = async (page, options = { mockFeedback: true }) => {
  await page.route('**/api/auth/profile', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(qaUser),
    });
  });
  if (options.mockFeedback) {
    await page.route('**/api/social-agent/chat/messages/*/feedback', async (route) => {
      const request = route.request();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          messageId: request.url().split('/messages/').at(-1)?.split('/feedback')[0] ?? 'unknown',
          savedAt: new Date().toISOString(),
        }),
      });
    });
  }
  await page.route('**/api/agent/owner/approvals/*/approve', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        status: 'approved',
        dispatched: true,
        result: {
          openedConversation: true,
          conversationId: 9901,
          idempotencyKey: 'qa-agent-chat-approval-9901',
        },
      }),
    });
  });
  await page.route('**/api/agent/owner/approvals/*/reject', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        status: 'rejected',
      }),
    });
  });
  await page.addInitScript((user) => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value) => {
          window.__fitmeetAgentClipboardText = String(value);
        },
      },
    });
    window.localStorage.setItem('fitmeet-token', 'qa-agent-chat-token');
    window.localStorage.setItem(
      'fitmeet-auth',
      JSON.stringify({
        state: {
          isLoggedIn: true,
          user,
        },
        version: 0,
      }),
    );
  }, qaUser);
};

const seedRealModeThreadApi = async (page) => {
  const updateRequests = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) {
      await route.continue();
      return;
    }
    const pathname = url.pathname.replace(/^\/api/, '');
    const method = request.method().toUpperCase();

    if (pathname === '/auth/profile' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(qaUser),
      });
      return;
    }

    if (pathname === '/social-agent/chat/session' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          hasSession: false,
          activeTaskId: null,
          task: null,
          messages: [],
          events: [],
          result: null,
          latestRun: null,
          pendingApprovals: [],
          restoredAt: '2026-06-14T10:00:00.000Z',
        }),
      });
      return;
    }

    const taskSessionMatch = pathname.match(/^\/social-agent\/chat\/tasks\/(\d+)\/session$/);
    if (taskSessionMatch && method === 'GET') {
      const detail = realModeThreadDetails[taskSessionMatch[1]];
      await route.fulfill({
        status: detail ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(detail?.session ?? { message: 'not found' }),
      });
      return;
    }

    if (pathname === '/social-agent/chat/threads' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ threads: realModeThreads }),
      });
      return;
    }

    const threadMatch = pathname.match(/^\/social-agent\/chat\/threads\/([^/]+)$/);
    if (threadMatch && method === 'GET') {
      const detail = realModeThreadDetails[decodeURIComponent(threadMatch[1])];
      await route.fulfill({
        status: detail ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(detail ?? { message: 'not found' }),
      });
      return;
    }

    if (threadMatch && method === 'POST') {
      const threadId = decodeURIComponent(threadMatch[1]);
      const body = request.postDataJSON();
      updateRequests.push({ threadId, body });
      const detail = realModeThreadDetails[threadId];
      const fallbackThread = realModeThreads.find((thread) => thread.id === threadId) ?? realModeThreads[0];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          thread: {
            ...(detail?.thread ?? fallbackThread),
            title:
              typeof body?.title === 'string' && body.title.trim()
                ? body.title.trim()
                : (detail?.thread ?? fallbackThread).title,
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ message: `unhandled agent chat QA route: ${method} ${pathname}` }),
    });
  });

  await page.addInitScript((user) => {
    window.localStorage.setItem('fitmeet-token', 'qa-agent-chat-token');
    window.localStorage.setItem(
      'fitmeet-auth',
      JSON.stringify({
        state: {
          isLoggedIn: true,
          user,
        },
        version: 0,
      }),
    );
  }, qaUser);

  return updateRequests;
};

const assertConversationStructure = async (page, viewport) => {
  await seedAuthenticatedSession(page, { mockFeedback: false });
  await page.goto(new URL('/agent/chat', baseUrl).toString());
  await waitForApp(page);

  await submitComposer(page, '只想普通聊天，帮我梳理今天训练安排');

  await page.getByText('我理解了。关于').waitFor({ timeout: 12_000 });

  const assistantMessages = await page.locator('[data-testid="assistant-ui-message"][data-role="assistant"]').count();
  const userMessages = await page.locator('[data-testid="assistant-ui-message"][data-role="user"]').count();
  if (assistantMessages === 0 || userMessages === 0) {
    throw new Error(
      `[agent-chat-qa] ${viewport.name}: expected both user and assistant messages after a mock run`,
    );
  }
  const firstUserMessage = page.locator('[data-testid="assistant-ui-message"][data-role="user"]').first();
  if ((await firstUserMessage.getAttribute('role')) !== 'article') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: user message was not exposed as an article`);
  }
  if ((await firstUserMessage.getAttribute('aria-label')) !== '用户消息') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: user message did not expose a clear label`);
  }
  if ((await firstUserMessage.getAttribute('data-message-model')) !== 'assistant-ui-message') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: user message model drifted`);
  }
  if ((await firstUserMessage.getAttribute('data-message-parts-model')) !== 'assistant-ui-message-parts') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: user message parts model drifted`);
  }
  if ((await firstUserMessage.getAttribute('data-surface')) !== 'user-bubble') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: user message surface was not a bubble`);
  }
  const userParts = firstUserMessage.locator('[data-testid="assistant-ui-message-parts"]').first();
  await userParts.waitFor({ state: 'attached', timeout: 5_000 });
  if ((await userParts.getAttribute('data-supported-parts')) !== 'text,image,data,tools') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: user message supported parts drifted`);
  }
  const firstAssistantMessage = page.locator('[data-testid="assistant-ui-message"][data-role="assistant"]').first();
  if ((await firstAssistantMessage.getAttribute('role')) !== 'article') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: assistant message was not exposed as an article`);
  }
  if ((await firstAssistantMessage.getAttribute('aria-label')) !== '助手消息') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: assistant message did not expose a clear label`);
  }
  if ((await firstAssistantMessage.getAttribute('data-message-status')) !== 'complete') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: assistant message did not settle to complete`);
  }
  if ((await firstAssistantMessage.getAttribute('data-feedback-status')) !== 'idle') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: assistant message feedback state was not idle before feedback`);
  }
  if ((await firstAssistantMessage.getAttribute('data-message-model')) !== 'assistant-ui-message') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: assistant message model drifted`);
  }
  if ((await firstAssistantMessage.getAttribute('data-message-parts-model')) !== 'assistant-ui-message-parts') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: assistant message parts model drifted`);
  }
  if ((await firstAssistantMessage.getAttribute('data-surface')) !== 'assistant-prose') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: assistant message surface was not prose`);
  }
  if ((await firstAssistantMessage.getAttribute('data-actionbar-placement')) !== 'below-message') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: assistant action bar was not placed below the message`);
  }
  const assistantParts = firstAssistantMessage.locator('[data-testid="assistant-ui-message-parts"]').first();
  await assistantParts.waitFor({ state: 'attached', timeout: 5_000 });
  if ((await assistantParts.getAttribute('data-parts-model')) !== 'assistant-ui') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: assistant parts model drifted`);
  }
  const assistantActionsRow = firstAssistantMessage.locator('[data-testid="assistant-ui-message-actions-row"]').first();
  await assistantActionsRow.waitFor({ state: 'attached', timeout: 5_000 });
  if ((await assistantActionsRow.getAttribute('data-actionbar-placement')) !== 'below-message') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: assistant actions row placement drifted`);
  }
  const messageLog = page.getByRole('log', { name: '对话消息' });
  await messageLog.waitFor({ timeout: 5_000 });
  const thread = page.locator('[data-testid="assistant-ui-thread"]');
  if ((await thread.getAttribute('data-empty-state')) !== 'hidden') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: active thread still reported visible empty state`);
  }
  if ((await thread.getAttribute('data-viewport-state')) !== 'visible') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: active thread did not expose visible viewport`);
  }
  const viewportNode = page.locator('[data-testid="assistant-ui-thread-viewport"]');
  if ((await viewportNode.getAttribute('data-viewport-model')) !== 'assistant-ui-thread-viewport') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: thread viewport model drifted`);
  }
  if ((await viewportNode.getAttribute('data-scroll-model')) !== 'anchored-thread') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: thread scroll model drifted`);
  }
  if ((await viewportNode.getAttribute('data-footer-behavior')) !== 'sticky-composer') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: thread footer behavior drifted`);
  }
  const viewportFooter = page.locator('[data-testid="assistant-ui-viewport-footer"]');
  if ((await viewportFooter.getAttribute('data-footer-model')) !== 'assistant-ui-viewport-footer') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: viewport footer model drifted`);
  }
  if ((await viewportFooter.getAttribute('data-composer-placement')) !== 'sticky-bottom') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: viewport footer composer placement drifted`);
  }
  const messageCount = Number(await messageLog.getAttribute('data-message-count'));
  if (!Number.isFinite(messageCount) || messageCount < 2) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: message log did not expose the conversation count`);
  }
  if ((await messageLog.getAttribute('data-stream-state')) !== 'idle') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: message log did not settle back to idle`);
  }
  if (!['comfortable', 'compact'].includes((await messageLog.getAttribute('data-density')) ?? '')) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: message log did not expose density`);
  }

  const actionBar = page.locator('[data-testid="assistant-ui-action-bar"]').first();
  await actionBar.waitFor({ timeout: 5_000 });
  if ((await actionBar.getAttribute('role')) !== 'toolbar') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: assistant action bar was not exposed as a toolbar`);
  }
  if ((await actionBar.getAttribute('aria-label')) !== '助手消息操作') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: assistant action bar did not expose a clear label`);
  }
  if ((await actionBar.getAttribute('data-action-count')) !== '7') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: assistant action bar did not expose the expected action count`);
  }
  if ((await actionBar.getAttribute('data-feedback-pinned')) !== 'false') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: assistant action bar should not be pinned before feedback`);
  }
  const visibility = await actionBar.getAttribute('data-visibility');
  if (visibility !== 'hover-focus') {
    throw new Error(
      `[agent-chat-qa] ${viewport.name}: assistant action bar should use hover/focus visibility before feedback, got ${visibility}`,
    );
  }
  const autohideModel = await actionBar.getAttribute('data-autohide-model');
  if (autohideModel !== 'hover-focus') {
    throw new Error(
      `[agent-chat-qa] ${viewport.name}: assistant action bar should use the hover-focus autohide model, got ${autohideModel}`,
    );
  }
  const touchVisibility = await actionBar.getAttribute('data-touch-visibility');
  if (touchVisibility !== 'visible') {
    throw new Error(
      `[agent-chat-qa] ${viewport.name}: assistant action bar should stay discoverable on touch viewports, got ${touchVisibility}`,
    );
  }

  const forbiddenAfterRun = [
    '[data-testid="opportunity-card"]',
    '[data-testid="activity-opportunity-card"]',
    '[data-testid="assistant-ui-generative-cards"]',
    '[data-testid="assistant-ui-approval-tool"]',
    '.codex-ant-pet',
  ];
  for (const selector of forbiddenAfterRun) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      throw new Error(`[agent-chat-qa] ${viewport.name}: ordinary chat rendered ${selector}`);
    }
  }
  const ordinaryText = await page.locator('body').innerText();
  for (const pattern of forbiddenOrdinarySocialCopy) {
    if (pattern.test(ordinaryText)) {
      throw new Error(`[agent-chat-qa] ${viewport.name}: ordinary chat leaked social process copy matching ${pattern}`);
    }
  }

  const screenshotPath = path.join(qaOutputDir, `agent-chat-conversation-${viewport.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`[agent-chat-qa] ${viewport.name}: conversation PASS (${screenshotPath})`);
};

const assertComposerKeyboardFlow = async (page, viewport) => {
  await seedAuthenticatedSession(page);
  await page.goto(new URL('/agent/chat', baseUrl).toString());
  await waitForApp(page);

  const composer = page.locator('[data-testid="assistant-ui-composer"]');
  await composer.waitFor({ timeout: 5_000 });
  const expectedComposerAttrs = {
    'data-ui-model': 'assistant-ui-chatgpt-composer',
    'data-toolbar-model': 'minimal',
    'data-permission-entry': 'none',
    'data-attachment-model': 'message-part',
    'data-visual-density': 'compact',
    'data-keyboard-safe-area': 'enabled',
  };
  for (const [name, expected] of Object.entries(expectedComposerAttrs)) {
    const actual = await composer.getAttribute(name);
    if (actual !== expected) {
      throw new Error(`[agent-chat-qa] ${viewport.name}: composer ${name} expected ${expected}, got ${actual}`);
    }
  }
  const toolbar = page.locator('[data-testid="assistant-ui-composer-toolbar"]');
  await toolbar.waitFor({ timeout: 5_000 });
  if ((await toolbar.getAttribute('data-toolbar-model')) !== 'minimal') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: composer toolbar was not minimal`);
  }
  if ((await toolbar.getAttribute('data-permission-entry')) !== 'none') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: composer toolbar exposed a permission entry`);
  }
  const primaryActions = page.locator('[data-testid="assistant-ui-composer-primary-actions"]');
  await primaryActions.waitFor({ timeout: 5_000 });
  if ((await primaryActions.getAttribute('data-action-model')) !== 'send-cancel-dictate') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: composer primary action model drifted`);
  }
  const textarea = page.locator('[data-testid="assistant-ui-composer-input"]');
  await textarea.fill('第一行');
  await textarea.press(process.platform === 'darwin' ? 'Shift+Enter' : 'Shift+Enter');
  await textarea.type('第二行');
  const multilineValue = await textarea.inputValue();
  if (!multilineValue.includes('\n') || !multilineValue.includes('第二行')) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: shift enter did not keep a multiline draft`);
  }
  const prematureMessages = await page.locator('[data-testid="assistant-ui-message"]').count();
  if (prematureMessages > 0) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: shift enter submitted the composer unexpectedly`);
  }

  await textarea.press('Enter');
  await page.getByText('我理解了。关于').waitFor({ timeout: 12_000 });
  const composerValueAfterSubmit = await textarea.inputValue();
  if (composerValueAfterSubmit.trim().length > 0) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: enter submit did not clear the composer`);
  }
  await page.getByRole('button', { name: '停止生成' }).waitFor({
    state: 'detached',
    timeout: 12_000,
  });

  const screenshotPath = path.join(qaOutputDir, `agent-chat-keyboard-${viewport.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`[agent-chat-qa] ${viewport.name}: keyboard PASS (${screenshotPath})`);
};

const assertNewChatResetFlow = async (page, viewport) => {
  await seedAuthenticatedSession(page);
  await page.goto(new URL('/agent/chat', baseUrl).toString());
  await waitForApp(page);

  await submitComposer(page, '只想普通聊天，帮我梳理今天训练安排');
  await page.getByText('我理解了。关于').waitFor({ timeout: 12_000 });
  await page.getByRole('button', { name: '停止生成' }).waitFor({
    state: 'detached',
    timeout: 12_000,
  });
  const messagesBeforeReset = await page.locator('[data-testid="assistant-ui-message"]').count();
  if (messagesBeforeReset < 2) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: new chat setup did not create a conversation`);
  }

  await clickNewChat(page);
  await page.getByRole('heading', { name: '有什么我可以帮你？' }).waitFor({
    timeout: 5_000,
  });
  const messagesAfterReset = await page.locator('[data-testid="assistant-ui-message"]').count();
  if (messagesAfterReset !== 0) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: new chat kept old messages`);
  }
  const textarea = page.locator('[data-testid="assistant-ui-composer"] textarea');
  await textarea.waitFor({ timeout: 5_000 });
  if ((await textarea.inputValue()).trim().length > 0) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: new chat kept a composer draft`);
  }
  const focused = await textarea.evaluate((node) => document.activeElement === node);
  if (!focused) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: new chat did not focus the composer`);
  }

  const screenshotPath = path.join(qaOutputDir, `agent-chat-new-chat-${viewport.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`[agent-chat-qa] ${viewport.name}: new chat PASS (${screenshotPath})`);
};

const assertActionBarMicrointeractions = async (page, viewport) => {
  await seedAuthenticatedSession(page);
  await page.goto(new URL('/agent/chat', baseUrl).toString());
  await waitForApp(page);

  await submitComposer(page, '只想普通聊天，帮我梳理今天训练安排');
  await page.getByText('我理解了。关于').waitFor({ timeout: 12_000 });
  await page.getByRole('button', { name: '停止生成' }).waitFor({
    state: 'detached',
    timeout: 12_000,
  });

  const actionBar = page.locator('[data-testid="assistant-ui-action-bar"]').first();
  await actionBar.waitFor({ timeout: 5_000 });
  if ((await actionBar.getAttribute('role')) !== 'toolbar') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: action bar was not exposed as a toolbar`);
  }
  if ((await actionBar.getAttribute('data-action-count')) !== '7') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: action bar action count was not stable`);
  }
  const expectedActionBarAttrs = {
    'data-actionbar-model': 'assistant-ui-message-actions',
    'data-autohide-model': 'hover-focus',
    'data-run-visibility': 'hide-when-running',
    'data-feedback-model': 'persistent-per-message',
    'data-share-model': 'native-or-copy-link',
    'data-reload-model': 'assistant-ui-reload',
  };
  for (const [name, expected] of Object.entries(expectedActionBarAttrs)) {
    const actual = await actionBar.getAttribute(name);
    if (actual !== expected) {
      throw new Error(`[agent-chat-qa] ${viewport.name}: action bar ${name} expected ${expected}, got ${actual}`);
    }
  }
  if ((await actionBar.getAttribute('data-touch-visibility')) !== 'visible') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: action bar touch visibility was not stable`);
  }
  const expectedActions = [
    'copy',
    'feedback-positive',
    'feedback-negative',
    'speak',
    'share',
    'reload',
    'more',
  ];
  for (const actionId of expectedActions) {
    const button = actionBar.locator(`[data-action-id="${actionId}"]`);
    if ((await button.count()) !== 1) {
      throw new Error(`[agent-chat-qa] ${viewport.name}: action id "${actionId}" was not unique`);
    }
    const role = await button.first().getAttribute('role');
    const tagName = await button.first().evaluate((node) => node.tagName.toLowerCase());
    if (role !== 'button' && tagName !== 'button') {
      throw new Error(`[agent-chat-qa] ${viewport.name}: action id "${actionId}" was not a button`);
    }
  }
  await actionBar.getByRole('button', { name: '复制' }).click();
  await actionBar.getByRole('button', { name: '已复制' }).waitFor({ timeout: 5_000 });
  if ((await actionBar.getByRole('button', { name: '已复制' }).getAttribute('data-copy-state')) !== 'copied') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: copy action did not expose copied state`);
  }
  const copiedText = await page.evaluate(() => window.__fitmeetAgentClipboardText ?? '');
  if (!String(copiedText).includes('我理解了')) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: copy action did not write assistant text`);
  }

  await actionBar.getByRole('button', { name: '更多' }).click();
  await page.getByRole('menu').waitFor({ timeout: 5_000 });
  const moreMenu = page.locator('[data-testid="assistant-ui-action-more-menu"]');
  if ((await moreMenu.getAttribute('data-menu-model')) !== 'compact-message-actions') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: action more menu did not use compact model`);
  }
  await page.getByRole('menuitem', { name: '复制链接' }).waitFor({ timeout: 5_000 });
  await page.getByRole('menuitem', { name: '复制链接' }).click();
  await page.getByRole('menuitem', { name: '已复制' }).waitFor({ timeout: 5_000 });
  const copiedLink = await page.evaluate(() => window.__fitmeetAgentClipboardText ?? '');
  if (!String(copiedLink).includes('/agent/chat')) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: more menu copy link did not write the current thread URL`);
  }
  await page.getByRole('menu').waitFor({ state: 'detached', timeout: 5_000 });
  await actionBar.getByRole('button', { name: '更多' }).click();
  await page.getByRole('menu').waitFor({ timeout: 5_000 });
  await page.keyboard.press('Escape');
  await page.getByRole('menu').waitFor({ state: 'detached', timeout: 5_000 });

  const screenshotPath = path.join(qaOutputDir, `agent-chat-actionbar-${viewport.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`[agent-chat-qa] ${viewport.name}: action bar PASS (${screenshotPath})`);
};

const assertAttachmentUploadFailureRetry = async (page, viewport) => {
  await seedAuthenticatedSession(page);
  let uploadAttempts = 0;
  await page.route('**/api/uploads/image', async (route) => {
    uploadAttempts += 1;
    if (uploadAttempts === 1) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          message: '图片上传失败，请重试',
          error: { code: 'UPLOAD_FAILED', retryable: true },
          statusCode: 500,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        url: '/uploads/qa-agent-chat-attachment.png',
        width: 1,
        height: 1,
      }),
    });
  });

  await page.goto(new URL('/agent/chat', baseUrl).toString());
  await waitForApp(page);

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '添加图片或视频' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'qa-agent-chat.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
      'base64',
    ),
  });

  await page.locator('[data-testid="assistant-ui-attachment"]').waitFor({ timeout: 5_000 });
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-testid="assistant-ui-composer"]');
    return node?.getAttribute('data-upload-gate') === 'failed';
  });

  const composer = page.locator('[data-testid="assistant-ui-composer"]');
  if ((await composer.getAttribute('data-primary-action')) !== 'send-disabled') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: attachment failure did not disable sending`);
  }
  if ((await composer.getAttribute('data-composer-state')) !== 'upload-blocked') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: attachment failure did not expose upload-blocked composer state`);
  }
  if ((await composer.getAttribute('data-upload-blocked')) !== 'true') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: attachment failure did not expose upload blocked flag`);
  }
  if ((await composer.getAttribute('data-upload-failed')) !== '1') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: attachment failure count was not reflected`);
  }
  const textareaDuringFailure = page.locator('[data-testid="assistant-ui-composer"] textarea');
  if ((await textareaDuringFailure.getAttribute('aria-describedby')) !== 'assistant-ui-upload-status') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: failed upload status was not described by the composer input`);
  }
  const uploadStatus = page.locator('[data-testid="assistant-ui-upload-gate"]');
  if ((await uploadStatus.getAttribute('id')) !== 'assistant-ui-upload-status') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: upload status id was not stable for aria-describedby`);
  }
  if ((await uploadStatus.getAttribute('data-upload-status')) !== 'failed') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: upload status did not expose failed state`);
  }
  await page.getByRole('button', { name: '附件上传失败，请先在附件上重试' }).waitFor({
    timeout: 5_000,
  });
  await page.getByRole('button', { name: /重试上传附件 qa-agent-chat\.png/ }).click();
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-testid="assistant-ui-composer"]');
    return node?.getAttribute('data-upload-gate') === 'idle';
  });

  const textarea = page.locator('[data-testid="assistant-ui-composer"] textarea');
  if ((await textarea.getAttribute('aria-describedby')) !== null) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: upload aria description stayed after retry completed`);
  }
  await textarea.fill('只想普通聊天，帮我看看这张图的训练记录');
  if ((await composer.getAttribute('data-primary-action')) !== 'send') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: attachment retry did not return composer to send mode`);
  }
  if ((await composer.getAttribute('data-composer-state')) !== 'ready') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: attachment retry did not return composer to ready state`);
  }
  if ((await composer.getAttribute('data-upload-blocked')) !== 'false') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: attachment retry left upload blocked flag enabled`);
  }
  await composer.evaluate((node) => {
    const form = node.closest('form') ?? node.querySelector('form');
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await page.getByText('我理解了。关于').waitFor({ timeout: 12_000 });
  await page.getByRole('button', { name: '停止生成' }).waitFor({
    state: 'detached',
    timeout: 12_000,
  });
  if (uploadAttempts < 2) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: attachment retry did not upload again`);
  }
  const userAttachment = page
    .locator('[data-testid="assistant-ui-message"][data-role="user"] [data-testid="assistant-ui-attachment"]')
    .first();
  await userAttachment.waitFor({ timeout: 5_000 });
  const finalUploadGate = await composer.getAttribute('data-upload-gate');
  if (finalUploadGate !== 'idle') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: attachment retry did not complete the message send`);
  }

  const screenshotPath = path.join(qaOutputDir, `agent-chat-attachment-retry-${viewport.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`[agent-chat-qa] ${viewport.name}: attachment retry PASS (${screenshotPath})`);
};

const assertFeedbackSubmission = async (page, viewport) => {
  const feedbackRequests = [];
  await page.route('**/api/social-agent/chat/messages/*/feedback', async (route) => {
    feedbackRequests.push({
      url: route.request().url(),
      body: route.request().postDataJSON(),
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, savedAt: new Date().toISOString() }),
    });
  });
  await seedAuthenticatedSession(page, { mockFeedback: false });
  await page.goto(new URL('/agent/chat', baseUrl).toString());
  await waitForApp(page);

  await submitComposer(page, '只想普通聊天，帮我梳理今天训练安排');
  await page.getByText('我理解了。关于').waitFor({ timeout: 12_000 });

  const actionBar = page.locator('[data-testid="assistant-ui-action-bar"]').first();
  await actionBar.waitFor({ timeout: 5_000 });
  const positiveFeedbackButton = actionBar.locator('[data-feedback-target="positive"]');
  await positiveFeedbackButton.click();
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-testid="assistant-ui-action-bar"]');
    return node?.getAttribute('data-feedback-status') === 'submitted';
  });

  if ((await actionBar.getAttribute('data-visibility')) !== 'pinned') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: feedback action bar should pin after submit`);
  }
  if ((await positiveFeedbackButton.getAttribute('aria-pressed')) !== 'true') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: positive feedback button should be pressed`);
  }
  if (feedbackRequests.length !== 1) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: expected one feedback request, got ${feedbackRequests.length}`);
  }
  const requestBody = feedbackRequests[0]?.body ?? {};
  if (requestBody.value !== 'positive' || requestBody.source !== 'agent_web') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: feedback request body was not agent_web positive feedback`);
  }

  const screenshotPath = path.join(qaOutputDir, `agent-chat-feedback-${viewport.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`[agent-chat-qa] ${viewport.name}: feedback PASS (${screenshotPath})`);
};

const assertSocialIntentToolStructure = async (page, viewport) => {
  await seedAuthenticatedSession(page);
  await page.goto(new URL('/agent/chat', baseUrl).toString());
  await waitForApp(page);

  await submitComposer(page, '我想找青岛本周末下午轻松跑步搭子，公共场所先站内聊');

  await page.getByText('我找到了一些更自然、更容易开口的场景').waitFor({ timeout: 12_000 });
  await page.locator('[data-testid="assistant-ui-generative-cards"]').waitFor({ timeout: 5_000 });
  await page.locator('[data-testid="opportunity-card"]').waitFor({ timeout: 5_000 });
  await page.locator('[data-testid="activity-opportunity-card"]').waitFor({ timeout: 5_000 });

  const processTool = page.locator('[data-testid="assistant-ui-tool-ui"]').first();
  await processTool.waitFor({ timeout: 5_000 });
  await expectAttribute(processTool, 'data-process-surface', 'single-line-status', viewport);
  await expectAttribute(processTool, 'data-process-rendering', 'covering-status', viewport);
  await expectAttribute(processTool, 'data-process-mainline', 'latest-visible-summary', viewport);
  await expectAttribute(processTool, 'data-process-history-visibility', 'collapsed', viewport);
  await expectAttribute(processTool, 'data-process-step-count', '1', viewport);
  const processStatusLine = processTool.locator('[data-testid="assistant-ui-process-status-line"]');
  await processStatusLine.waitFor({ timeout: 5_000 });
  const processStatusText = await processStatusLine.innerText();
  if (!processStatusText.trim()) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: process status line was empty`);
  }
  for (const oldStatus of [
    '整理你的社交边界',
    '正在查找合适的人',
  ]) {
    if (processStatusText.includes(oldStatus)) {
      throw new Error(
        `[agent-chat-qa] ${viewport.name}: process status did not cover old state "${oldStatus}"`,
      );
    }
  }
  if ((await processTool.getAttribute('open')) !== null) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: process details should stay collapsed by default`);
  }
  if ((await page.locator('[data-testid="assistant-ui-process-step"]').count()) > 0) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: process rendered timeline steps before expansion`);
  }

  const opportunityCard = page.locator('[data-testid="opportunity-card"]').first();
  await expectAttribute(opportunityCard, 'data-card-model', 'assistant-ui-opportunity-card', viewport);
  await expectAttribute(opportunityCard, 'data-opportunity-type', 'person', viewport);
  await expectAttribute(opportunityCard, 'data-has-avatar', 'true', viewport);
  await expectAttribute(opportunityCard, 'data-has-distance', 'true', viewport);
  await expectAttribute(opportunityCard, 'data-has-interests', 'true', viewport);
  await expectAttribute(opportunityCard, 'data-has-opener', 'true', viewport);
  await expectAttribute(opportunityCard, 'data-action-path', 'safe-sequenced', viewport);
  await opportunityCard.getByText('查看推荐依据和安全边界').first().click();
  const cardText = await opportunityCard.innerText();
  for (const expected of [
    '推荐对象',
    '推荐依据',
    '推荐边界',
    '参考已确认偏好',
    '安全推进路径',
    '生成开场白',
    '发送邀请',
  ]) {
    if (!cardText.includes(expected)) {
      throw new Error(`[agent-chat-qa] ${viewport.name}: social card missing expected text "${expected}"`);
    }
  }
  const activityCard = page.locator('[data-testid="activity-opportunity-card"]').first();
  await expectAttribute(activityCard, 'data-card-model', 'assistant-ui-opportunity-card', viewport);
  await expectAttribute(activityCard, 'data-opportunity-type', 'activity', viewport);
  await expectAttribute(activityCard, 'data-has-detail', 'true', viewport);
  await expectAttribute(activityCard, 'data-action-path', 'safe-sequenced', viewport);
  await activityCard.getByText('查看发布边界和约练闭环').first().click();
  const candidatePath = page.locator(
    '[data-testid="assistant-ui-opportunity-path"][data-schema-type="social_match.candidate"]',
  );
  await candidatePath.waitFor({ timeout: 5_000 });
  const candidatePathText = await candidatePath.innerText();
  for (const expected of ['先看详情', '生成开场白', '发送邀请', '加好友并聊天']) {
    if (!candidatePathText.includes(expected)) {
      throw new Error(`[agent-chat-qa] ${viewport.name}: candidate path missing "${expected}"`);
    }
  }
  const activityPath = page.locator(
    '[data-testid="assistant-ui-opportunity-path"][data-schema-type="social_match.activity"]',
  );
  await activityPath.waitFor({ timeout: 5_000 });
  const activityPathText = await activityPath.innerText();
  for (const expected of ['发布到发现', '修改', '暂不发布']) {
    if (!activityPathText.includes(expected)) {
      throw new Error(`[agent-chat-qa] ${viewport.name}: activity path missing "${expected}"`);
    }
  }
  await page.getByText('查看记忆写入依据').first().click();
  const memoryChecklist = page.locator('[data-testid="life-graph-memory-checklist"]');
  await memoryChecklist.waitFor({ timeout: 5_000 });
  const memoryText = await memoryChecklist.innerText();
  for (const expected of ['记忆写入检查', '写入字段', '敏感等级', '依据来源', '写入边界']) {
    if (!memoryText.includes(expected)) {
      throw new Error(`[agent-chat-qa] ${viewport.name}: memory checklist missing "${expected}"`);
    }
  }
  await page.getByText('查看完整约练时间线').first().click();
  await page.locator('[data-testid="meet-loop-timeline"]').waitFor({ timeout: 5_000 });
  const meetLoopCard = page.locator('[data-testid="assistant-ui-meet-loop-card"]').first();
  await expectAttribute(meetLoopCard, 'data-card-model', 'assistant-ui-meet-loop-timeline', viewport);
  const meetLoopStepCount = Number(await meetLoopCard.getAttribute('data-step-count'));
  if (!Number.isFinite(meetLoopStepCount) || meetLoopStepCount < 6) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: meet loop timeline has too few product steps`);
  }
  const meetLoopText = await page.locator('[data-testid="meet-loop-timeline"]').innerText();
  for (const expected of ['发起', '等待回复', '改期', '确认', '见面', '评价', '回写画像']) {
    if (!meetLoopText.includes(expected)) {
      throw new Error(`[agent-chat-qa] ${viewport.name}: meet loop timeline missing "${expected}"`);
    }
  }

  await assertNoInternalToolTerms(page, viewport, 'social intent Tool UI');

  const forbiddenLegacy = ['.codex-ant-pet', '.agent-gpt-result-block', '.fitmeet-assistant-shell'];
  for (const selector of forbiddenLegacy) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      throw new Error(`[agent-chat-qa] ${viewport.name}: social intent rendered legacy selector ${selector}`);
    }
  }

  const screenshotPath = path.join(qaOutputDir, `agent-chat-social-intent-${viewport.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`[agent-chat-qa] ${viewport.name}: social intent PASS (${screenshotPath})`);
};

const assertToolActionMicrointeraction = async (page, viewport) => {
  await seedAuthenticatedSession(page);
  await page.goto(new URL('/agent/chat', baseUrl).toString());
  await waitForApp(page);

  await submitComposer(page, '我想找青岛本周末下午轻松跑步搭子，公共场所先站内聊');

  await page.locator('[data-testid="opportunity-card"]').waitFor({ timeout: 12_000 });
  await page.getByRole('button', { name: '停止生成' }).waitFor({
    state: 'detached',
    timeout: 12_000,
  });
  const viewDetailButton = page
    .locator('[data-testid="assistant-ui-schema-action"][data-schema-action="candidate.view_detail"]')
    .first();
  await viewDetailButton.waitFor({ timeout: 5_000 });
  await viewDetailButton.click();

  await page.getByText('我把这个候选机会的详情整理好了').first().waitFor({ timeout: 12_000 });
  const inlineDetail = page.locator('[data-testid="assistant-ui-inline-outcome-preview"]').first();
  await inlineDetail.waitFor({ timeout: 5_000 });
  const inlineDetailText = await inlineDetail.innerText();
  for (const expected of ['候选详情', '我把这个候选机会的详情整理好了。']) {
    if (!inlineDetailText.includes(expected)) {
      throw new Error(
        `[agent-chat-qa] ${viewport.name}: inline candidate detail missing "${expected}"`,
      );
    }
  }

  const detailCard = page
    .locator('[data-testid="opportunity-card"][data-product-component="CandidateCards"]')
    .first();
  await detailCard.waitFor({ timeout: 5_000 });
  await expectAttribute(detailCard, 'data-card-model', 'assistant-ui-opportunity-card', viewport);
  await expectAttribute(detailCard, 'data-product-component', 'CandidateCards', viewport);
  await expectAttribute(detailCard, 'data-action-path', 'safe-sequenced', viewport);
  await expectAttribute(detailCard, 'data-has-distance', 'true', viewport);
  await expectAttribute(detailCard, 'data-has-interests', 'true', viewport);
  await detailCard
    .locator('[data-testid="assistant-ui-schema-action"][data-schema-action="candidate.generate_opener"]')
    .waitFor({ timeout: 5_000 });
  await detailCard
    .locator('[data-testid="assistant-ui-schema-action"][data-schema-action="opener.confirm_send"]')
    .waitFor({ timeout: 5_000 });

  await assertNoInternalToolTerms(page, viewport, 'tool action');

  const screenshotPath = path.join(qaOutputDir, `agent-chat-tool-action-${viewport.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`[agent-chat-qa] ${viewport.name}: tool action PASS (${screenshotPath})`);
};

const waitForInlineOpenerDraft = async (page, viewport) => {
  const draft = page.locator('[data-testid="assistant-ui-inline-draft-preview"]').last();
  await draft.waitFor({ timeout: 12_000 });
  const draftText = await draft.innerText();
  for (const expected of ['站内聊', '只有你继续点击发送邀请并确认后']) {
    if (!draftText.includes(expected)) {
      throw new Error(`[agent-chat-qa] ${viewport.name}: opener draft missing "${expected}"`);
    }
  }
  return draft;
};

const waitForInlineInviteApproval = async (page, viewport) => {
  const approval = page.locator('[data-testid="assistant-ui-inline-approval-panel"]').last();
  await approval.waitFor({ timeout: 12_000 });
  await expectAttribute(approval, 'data-component', 'ApprovalInlinePanel', viewport);
  const approvalText = await approval.innerText();
  for (const expected of ['确认发送', '确认前不会触达对方']) {
    if (!approvalText.includes(expected)) {
      throw new Error(`[agent-chat-qa] ${viewport.name}: inline approval missing "${expected}"`);
    }
  }
  return approval;
};

const assertSocialActionChain = async (page, viewport) => {
  await seedAuthenticatedSession(page);
  await page.goto(new URL('/agent/chat', baseUrl).toString());
  await waitForApp(page);

  await submitComposer(page, '我想找青岛本周末下午轻松跑步搭子，公共场所先站内聊');

  await page.locator('[data-testid="opportunity-card"]').waitFor({ timeout: 12_000 });
  await page.getByRole('button', { name: '生成开场白' }).first().click();
  await waitForInlineOpenerDraft(page, viewport);

  const sendInviteButtons = page.getByRole('button', { name: '发送邀请' });
  await sendInviteButtons.last().click();
  await waitForInlineInviteApproval(page, viewport);

  await page.getByRole('button', { name: '确认发送' }).last().click();
  await page.waitForFunction(
    () => {
      const text = document.body.innerText;
      return (
        text.includes('站内沟通入口') ||
        text.includes('等待对方') ||
        text.includes('后续回复') ||
        text.includes('下一步建议') ||
        text.includes('完成了。我已经为你准备好')
      );
    },
    null,
    { timeout: 12_000 },
  );
  await page
    .getByText('进度已保存')
    .first()
    .waitFor({ timeout: 1_000 })
    .catch(() => undefined);

  const bodyText = await page.locator('body').innerText();
  for (const expected of ['站内沟通', '公共场所']) {
    if (!bodyText.includes(expected)) {
      throw new Error(`[agent-chat-qa] ${viewport.name}: action chain missing "${expected}"`);
    }
  }
  if (!/(下一步建议|等待对方|后续回复|站内沟通入口)/.test(bodyText)) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: action chain did not explain the next step`);
  }

  await assertNoInternalToolTerms(page, viewport, 'action chain');
  const remainingEnabledConfirmButtons = await page
    .getByRole('button', { name: '确认发送' })
    .evaluateAll((buttons) =>
      buttons.filter((button) => button instanceof HTMLButtonElement && !button.disabled).length,
    );
  if (remainingEnabledConfirmButtons > 0) {
    throw new Error(
      `[agent-chat-qa] ${viewport.name}: completed action chain still shows enabled confirm buttons`,
    );
  }

  const screenshotPath = path.join(qaOutputDir, `agent-chat-social-action-chain-${viewport.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`[agent-chat-qa] ${viewport.name}: social action chain PASS (${screenshotPath})`);
};

const assertSocialActionRewriteDoesNotSend = async (page, viewport) => {
  await seedAuthenticatedSession(page);
  await page.goto(new URL('/agent/chat', baseUrl).toString());
  await waitForApp(page);

  await submitComposer(page, '我想找青岛本周末下午轻松跑步搭子，公共场所先站内聊');

  await page.locator('[data-testid="opportunity-card"]').waitFor({ timeout: 12_000 });
  await page.getByRole('button', { name: '生成开场白' }).first().click();
  await waitForInlineOpenerDraft(page, viewport);

  await page.getByRole('button', { name: '发送邀请' }).last().click();
  await waitForInlineInviteApproval(page, viewport);

  await page.getByRole('button', { name: '取消' }).last().click();
  await page.getByText('这个动作不会继续执行，也不会触达对方。').last().waitFor({
    timeout: 12_000,
  });

  const bodyText = await page.locator('body').innerText();
  if (bodyText.includes('完成了。我已经为你准备好下一步建议')) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: rewrite path unexpectedly completed invite sending`);
  }
  if (bodyText.includes('进度已保存')) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: rewrite path unexpectedly rendered completed progress`);
  }

  const remainingEnabledConfirmButtons = await page
    .getByRole('button', { name: '确认发送' })
    .evaluateAll((buttons) =>
      buttons.filter((button) => button instanceof HTMLButtonElement && !button.disabled).length,
    );
  if (remainingEnabledConfirmButtons > 0) {
    throw new Error(
      `[agent-chat-qa] ${viewport.name}: rewrite path still shows enabled stale confirm buttons`,
    );
  }

  const screenshotPath = path.join(qaOutputDir, `agent-chat-social-action-rewrite-${viewport.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`[agent-chat-qa] ${viewport.name}: social action rewrite PASS (${screenshotPath})`);
};

const assertIncompleteSocialIntentClarifies = async (page, viewport) => {
  await seedAuthenticatedSession(page);
  await page.goto(new URL('/agent/chat', baseUrl).toString());
  await waitForApp(page);

  await submitComposer(page, '我想找人一起跑步');

  await page.getByText('为了只推荐安全、合适的机会').waitFor({ timeout: 12_000 });
  const expectedClarificationTerms = ['城市/大致区域', '时间', '运动强度', '社交边界'];
  const bodyText = await page.locator('body').innerText();
  for (const term of expectedClarificationTerms) {
    if (!bodyText.includes(term)) {
      throw new Error(`[agent-chat-qa] ${viewport.name}: clarification missing "${term}"`);
    }
  }

  const forbiddenBeforeClarification = [
    '[data-testid="assistant-ui-generative-cards"]',
    '[data-testid="opportunity-card"]',
    '[data-testid="activity-opportunity-card"]',
    '[data-testid="assistant-ui-approval-tool"]',
  ];
  for (const selector of forbiddenBeforeClarification) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      throw new Error(`[agent-chat-qa] ${viewport.name}: incomplete social intent rendered ${selector}`);
    }
  }

  const screenshotPath = path.join(qaOutputDir, `agent-chat-social-clarify-${viewport.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`[agent-chat-qa] ${viewport.name}: social clarification PASS (${screenshotPath})`);
};

const assertSocialClarificationContinuation = async (page, viewport) => {
  await seedAuthenticatedSession(page);
  await page.goto(new URL('/agent/chat', baseUrl).toString());
  await waitForApp(page);

  await submitComposer(page, '我想找人一起跑步');
  await page.getByText('为了只推荐安全、合适的机会').waitFor({ timeout: 12_000 });
  const initialCards = await page.locator('[data-testid="opportunity-card"]').count();
  if (initialCards > 0) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: clarification turn rendered opportunity cards too early`);
  }

  await submitComposer(page, '青岛周末下午，轻松跑步，只在公共场所，先站内聊');
  await page.getByText('我找到了一些更自然、更容易开口的场景').waitFor({ timeout: 12_000 });
  await page.locator('[data-testid="opportunity-card"]').waitFor({ timeout: 5_000 });
  await page.getByRole('button', { name: '生成开场白' }).first().scrollIntoViewIfNeeded();
  if (!(await page.getByRole('button', { name: '生成开场白' }).first().isVisible())) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: opener action is not visible after clarification follow-up`);
  }
  if (!(await page.getByRole('button', { name: '发送邀请' }).first().isVisible())) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: invite action is not visible after clarification follow-up`);
  }

  await page.getByText('查看推荐依据和安全边界').first().click();
  const actionRhythm = page.locator('[data-testid="assistant-ui-candidate-action-rhythm"]').first();
  await actionRhythm.waitFor({ timeout: 5_000 });
  const actionRhythmText = await actionRhythm.innerText();
  for (const expected of ['为什么现在', '怎么开口']) {
    if (!actionRhythmText.includes(expected)) {
      throw new Error(`[agent-chat-qa] ${viewport.name}: clarification follow-up action rhythm missing "${expected}"`);
    }
  }

  const bodyText = await page.locator('body').innerText();
  for (const expected of ['推荐对象', '推荐依据', '推荐协议', '触达边界', '为什么现在', '怎么开口', '发送邀请']) {
    if (!bodyText.includes(expected)) {
      throw new Error(`[agent-chat-qa] ${viewport.name}: clarification follow-up missing "${expected}"`);
    }
  }

  const screenshotPath = path.join(qaOutputDir, `agent-chat-social-clarify-followup-${viewport.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`[agent-chat-qa] ${viewport.name}: social clarification follow-up PASS (${screenshotPath})`);
};

const assertEndToEndOpportunityJourney = async (page, viewport) => {
  await seedAuthenticatedSession(page);
  await page.goto(new URL('/agent/chat', baseUrl).toString());
  await waitForApp(page);

  await submitComposer(page, '只想普通聊天，帮我梳理今天训练安排');
  await page.getByText('我理解了。关于').waitFor({ timeout: 12_000 });
  const ordinaryBody = await page.locator('body').innerText();
  for (const pattern of forbiddenOrdinarySocialCopy) {
    if (pattern.test(ordinaryBody)) {
      throw new Error(`[agent-chat-qa] ${viewport.name}: ordinary chat triggered social opportunity UI matching ${pattern}`);
    }
  }
  if ((await page.locator('[data-testid="opportunity-card"]').count()) > 0) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: ordinary chat rendered opportunity cards`);
  }

  await clickNewChat(page);
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-testid="assistant-ui-messages"]');
    return node?.getAttribute('data-message-count') === '0';
  });

  await submitComposer(page, '我想找人一起跑步');
  await page.getByText('为了只推荐安全、合适的机会').waitFor({ timeout: 12_000 });
  const clarificationBody = await page.locator('body').innerText();
  for (const expected of ['城市/大致区域', '时间', '运动强度', '社交边界']) {
    if (!clarificationBody.includes(expected)) {
      throw new Error(`[agent-chat-qa] ${viewport.name}: e2e clarification missing "${expected}"`);
    }
  }
  if ((await page.locator('[data-testid="opportunity-card"]').count()) > 0) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: vague social request rendered cards before clarification`);
  }

  await submitComposer(page, '青岛周末下午，轻松跑步，接受陌生人，可以公开发起活动，发送前确认');
  await page.getByText('我找到了一些更自然、更容易开口的场景').waitFor({ timeout: 12_000 });
  await page.locator('[data-testid="opportunity-card"]').first().waitFor({ timeout: 5_000 });
  await page.locator('[data-testid="activity-opportunity-card"]').first().waitFor({ timeout: 5_000 });
  await page.getByText('查看推荐依据和安全边界').first().click();
  const actionRhythm = page.locator('[data-testid="assistant-ui-candidate-action-rhythm"]').first();
  await actionRhythm.waitFor({ timeout: 5_000 });
  const actionRhythmText = await actionRhythm.innerText();
  for (const expected of ['为什么现在', '怎么开口']) {
    if (!actionRhythmText.includes(expected)) {
      throw new Error(`[agent-chat-qa] ${viewport.name}: e2e opportunity action rhythm missing "${expected}"`);
    }
  }
  const opportunityText = await page.locator('body').innerText();
  for (const expected of ['推荐对象', '推荐依据', '推荐协议', '触达边界', '为什么现在', '怎么开口', '生成开场白', '发送邀请', '公共场所']) {
    if (!opportunityText.includes(expected)) {
      throw new Error(`[agent-chat-qa] ${viewport.name}: e2e opportunity step missing "${expected}"`);
    }
  }

  await page.getByRole('button', { name: '生成开场白' }).first().click();
  await waitForInlineOpenerDraft(page, viewport);

  await page.getByRole('button', { name: '发送邀请' }).last().click();
  await waitForInlineInviteApproval(page, viewport);

  await page.getByRole('button', { name: '确认发送' }).last().click();
  await page.waitForFunction(
    () => {
      const text = document.body.innerText;
      return (
        text.includes('站内沟通入口') ||
        text.includes('等待对方') ||
        text.includes('后续回复') ||
        text.includes('下一步建议') ||
        text.includes('完成了。我已经为你准备好')
      );
    },
    null,
    { timeout: 12_000 },
  );
  await page
    .getByText('进度已保存')
    .first()
    .waitFor({ timeout: 1_000 })
    .catch(() => undefined);
  const finalText = await page.locator('body').innerText();
  for (const expected of ['站内沟通', '公共场所']) {
    if (!finalText.includes(expected)) {
      throw new Error(`[agent-chat-qa] ${viewport.name}: e2e completion missing "${expected}"`);
    }
  }
  if (!/(下一步建议|等待对方|后续回复|站内沟通入口)/.test(finalText)) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: e2e completion did not explain the next step`);
  }
  await assertNoInternalToolTerms(page, viewport, 'e2e journey');

  const screenshotPath = path.join(qaOutputDir, `agent-chat-e2e-opportunity-${viewport.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`[agent-chat-qa] ${viewport.name}: e2e opportunity journey PASS (${screenshotPath})`);
};

const assertStopGeneration = async (page, viewport) => {
  await seedAuthenticatedSession(page);
  await page.goto(new URL('/agent/chat', baseUrl).toString());
  await waitForApp(page);

  await submitComposer(page, '我想找青岛本周末下午轻松跑步搭子，公共场所先站内聊');

  const stopButton = page.getByRole('button', { name: '停止生成' });
  await stopButton.waitFor({ timeout: 3_000 });
  await stopButton.click();
  await stopButton.waitFor({ state: 'detached', timeout: 5_000 });

  const composer = page.locator('[data-testid="assistant-ui-composer"]');
  await composer.waitFor({ timeout: 5_000 });
  const primaryAction = await composer.getAttribute('data-primary-action');
  if (primaryAction === 'cancel') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: composer stayed in cancel state after stop`);
  }
  if ((await composer.getAttribute('data-composer-state')) === 'generating') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: composer stayed in generating state after stop`);
  }
  const textarea = composer.locator('textarea');
  if (!(await textarea.isEnabled())) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: composer textarea disabled after stop`);
  }

  const socialCards = await page.locator('[data-testid="opportunity-card"]').count();
  if (socialCards > 0) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: stopped run still rendered opportunity cards`);
  }

  const screenshotPath = path.join(qaOutputDir, `agent-chat-stop-generation-${viewport.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`[agent-chat-qa] ${viewport.name}: stop generation PASS (${screenshotPath})`);
};

const assertBranchRegeneration = async (page, viewport) => {
  await seedAuthenticatedSession(page);
  await page.goto(new URL('/agent/chat', baseUrl).toString());
  await waitForApp(page);

  await submitComposer(page, '只想普通聊天，帮我给今天训练做一个轻量计划');
  await page.getByText('我理解了。关于').waitFor({ timeout: 12_000 });

  const reloadButton = page.getByRole('button', { name: '重新生成' }).last();
  await reloadButton.waitFor({ timeout: 5_000 });
  await reloadButton.click();
  const branchPickerLocator = page.locator('[data-testid="assistant-ui-branch-picker"]');
  const branchPickerAppeared = await branchPickerLocator
    .waitFor({ timeout: 4_000 })
    .then(() => true)
    .catch(() => false);
  if (!branchPickerAppeared) {
    const latestAssistant = page
      .locator('[data-testid="assistant-ui-message"][data-role="assistant"]')
      .last();
    const source = await latestAssistant.getAttribute('data-message-source');
    if (source === 'llm') {
      throw new Error(
        `[agent-chat-qa] ${viewport.name}: branch picker missing for llm regeneration source`,
      );
    }
    if ((await page.locator('[data-testid="assistant-ui-branch-status"]').count()) > 0) {
      throw new Error(
        `[agent-chat-qa] ${viewport.name}: fallback regeneration rendered a branch status`,
      );
    }
    const screenshotPath = path.join(
      qaOutputDir,
      `agent-chat-branch-regeneration-fallback-${viewport.name}.png`,
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(
      `[agent-chat-qa] ${viewport.name}: branch regeneration fallback PASS (${screenshotPath})`,
    );
    return;
  }
  const branchPicker = page.locator('[data-testid="assistant-ui-branch-picker"]').last();
  await page.locator('[data-testid="assistant-ui-branch-status"]').waitFor({ timeout: 5_000 });
  const branchStatus = await page.locator('[data-testid="assistant-ui-branch-status"]').last().innerText();
  if (!branchStatus.includes('2/2')) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: branch picker did not show regenerated branch, got "${branchStatus}"`);
  }
  if ((await branchPicker.getAttribute('role')) !== 'toolbar') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: branch picker was not exposed as a toolbar`);
  }
  if ((await branchPicker.getAttribute('data-action-count')) !== '2') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: branch picker did not expose its two navigation actions`);
  }
  if ((await branchPicker.getAttribute('data-branch-picker-model')) !== 'assistant-ui-branch-picker') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: branch picker model drifted`);
  }
  if ((await branchPicker.getAttribute('data-persistence')) !== 'fitmeet-thread-metadata') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: branch picker did not expose FitMeet metadata persistence`);
  }
  if ((await branchPicker.getAttribute('data-branch-source')) !== 'runtime') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: branch picker did not use runtime source after regeneration`);
  }
  if ((await branchPicker.getAttribute('data-current-index')) !== '2') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: branch picker current index was not 2 after regeneration`);
  }
  const branchStatusNode = page.locator('[data-testid="assistant-ui-branch-status"]').last();
  if ((await branchStatusNode.getAttribute('data-current-index')) !== '2') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: branch status did not expose current index 2`);
  }
  if ((await branchStatusNode.getAttribute('data-branch-count')) !== '2') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: branch status did not expose branch count 2`);
  }
  const previousBranchButton = page.getByRole('button', { name: '上一个回答' }).last();
  const nextBranchButton = page.getByRole('button', { name: '下一个回答' }).last();
  if ((await previousBranchButton.getAttribute('data-action-id')) !== 'branch-previous') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: previous branch action id drifted`);
  }
  if ((await nextBranchButton.getAttribute('data-action-id')) !== 'branch-next') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: next branch action id drifted`);
  }
  if ((await previousBranchButton.getAttribute('data-enabled')) !== 'true') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: previous branch button should be enabled at latest answer`);
  }
  if ((await nextBranchButton.getAttribute('data-enabled')) !== 'false') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: next branch button should be disabled at latest answer`);
  }
  if ((await branchPicker.getAttribute('data-can-next')) !== 'false') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: branch picker should disable next on the latest answer`);
  }
  if ((await branchPicker.getAttribute('data-branch-position')) !== 'last') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: branch picker did not expose the latest-answer boundary`);
  }

  await previousBranchButton.click();
  await page.locator('[data-testid="assistant-ui-branch-status"]').last().waitFor({ timeout: 5_000 });
  const previousStatus = await page.locator('[data-testid="assistant-ui-branch-status"]').last().innerText();
  if (!previousStatus.includes('1/2')) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: branch picker did not switch to previous answer, got "${previousStatus}"`);
  }
  if ((await branchPicker.getAttribute('data-current-index')) !== '1') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: branch picker current index was not 1 after switching`);
  }
  if ((await branchPicker.getAttribute('data-can-previous')) !== 'false') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: branch picker should disable previous on the first answer`);
  }
  if ((await branchPicker.getAttribute('data-branch-position')) !== 'first') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: branch picker did not expose the first-answer boundary`);
  }
  if ((await previousBranchButton.getAttribute('data-enabled')) !== 'false') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: previous branch button should be disabled on first answer`);
  }
  if ((await nextBranchButton.getAttribute('data-enabled')) !== 'true') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: next branch button should be enabled on first answer`);
  }

  const socialCards = await page.locator('[data-testid="opportunity-card"]').count();
  if (socialCards > 0) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: ordinary branch regeneration rendered social cards`);
  }

  const screenshotPath = path.join(qaOutputDir, `agent-chat-branch-regeneration-${viewport.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`[agent-chat-qa] ${viewport.name}: branch regeneration PASS (${screenshotPath})`);
};

const assertCheckpointStepActions = async (page, viewport) => {
  const checkpointRequests = [];
  await seedAuthenticatedSession(page);
  await page.route('**/api/social-agent/chat/checkpoints/**/stream', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const action = pathname.includes('/retry/stream')
      ? 'retry'
      : pathname.includes('/fork/stream')
        ? 'fork'
        : 'replay';
    const checkpointId = pathname.includes('/321/') ? 321 : 123;
    const stepId = pathname.includes('/steps/rank/') ? 'rank' : null;
    checkpointRequests.push({ action, checkpointId, stepId, body: request.postDataJSON() });
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: checkpointStreamResponse(action, checkpointId, stepId),
    });
  });

  await page.goto(new URL('/agent/chat', baseUrl).toString());
  await waitForApp(page);

  await submitComposer(page, 'checkpoint qa 失败，请展示可重试步骤');
  const latestFailedTool = page
    .locator('[data-testid="assistant-ui-tool-ui"][data-checkpoint-state="retryable"]')
    .last();
  await latestFailedTool.waitFor({ timeout: 5_000 });
  if ((await latestFailedTool.getAttribute('data-checkpoint-state')) !== 'retryable') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: failed checkpoint tool was not marked retryable`);
  }
  if ((await latestFailedTool.getAttribute('role')) !== 'group') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: failed checkpoint tool was not exposed as a process group`);
  }
  if ((await latestFailedTool.getAttribute('data-render-mode')) !== 'tool-ui') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: failed checkpoint tool did not use Tool UI render mode`);
  }
  if ((await latestFailedTool.getAttribute('data-process-status')) !== 'error') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: failed checkpoint tool did not expose error process status`);
  }
  if ((await latestFailedTool.getAttribute('data-retryable')) !== 'true') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: failed checkpoint tool did not expose retryable state`);
  }
  if ((await latestFailedTool.getAttribute('data-step-id')) !== 'rank') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: failed checkpoint tool did not expose the failed step id`);
  }
  if ((await latestFailedTool.getAttribute('data-process-update-model')) !== 'latest-state') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: failed checkpoint tool should expose latest-state process updates`);
  }
  if ((await latestFailedTool.getAttribute('data-process-detail-policy')) !== 'collapsed-until-open') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: failed checkpoint tool should keep detailed process collapsed`);
  }
  if ((await latestFailedTool.getAttribute('data-process-surface')) !== 'single-line-status') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: failed checkpoint tool should render as a single-line status`);
  }
  if ((await latestFailedTool.getAttribute('data-process-audit-policy')) !== 'expandable-summary') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: failed checkpoint tool should keep audit detail behind expansion`);
  }
  if ((await latestFailedTool.getAttribute('data-default-expanded')) !== 'false') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: failed checkpoint tool should be collapsed by default`);
  }
  if ((await latestFailedTool.getAttribute('data-raw-trace-policy')) !== 'hidden') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: failed checkpoint tool should hide raw trace details`);
  }
  if ((await latestFailedTool.getAttribute('data-process-node-policy')) !== 'max-1-evidence') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: failed checkpoint tool should limit visible evidence nodes`);
  }
  if (await latestFailedTool.getAttribute('open')) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: failed checkpoint tool should not be expanded by default`);
  }
  if ((await latestFailedTool.getAttribute('data-process-display')) !== 'compact') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: failed checkpoint tool should use compact process display`);
  }
  await latestFailedTool.locator('summary').click();
  const failedStep = latestFailedTool.locator('[data-testid="assistant-ui-process-step"][data-step-id="rank"]').last();
  const expandedStepVisible = await failedStep
    .waitFor({ timeout: 1_500 })
    .then(() => true)
    .catch(() => false);
  if (expandedStepVisible) {
    if ((await failedStep.getAttribute('data-step-status')) !== 'error') {
      throw new Error(`[agent-chat-qa] ${viewport.name}: failed process step was not marked error`);
    }
    if ((await failedStep.getAttribute('aria-current')) !== 'step') {
      throw new Error(`[agent-chat-qa] ${viewport.name}: failed process step was not exposed as current`);
    }
  }
  const retryButton = page
    .locator('[data-testid="assistant-ui-checkpoint-action"][data-checkpoint-action="retry"]')
    .last();
  await retryButton.waitFor({ timeout: 5_000 });
  if ((await retryButton.getAttribute('data-checkpoint-id')) !== '321') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: retry checkpoint id was not preserved`);
  }
  if ((await retryButton.getAttribute('data-step-id')) !== 'rank') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: retry step id was not preserved`);
  }
  await retryButton.click();
  await page.getByText('已重试这个步骤。').waitFor({ timeout: 12_000 });

  await submitComposer(page, 'checkpoint qa 完成，请展示 replay fork');
  const latestCompleteTool = page
    .locator('[data-testid="assistant-ui-tool-ui"][data-checkpoint-state="replayable-forkable"]')
    .last();
  await latestCompleteTool.waitFor({ timeout: 5_000 });
  if ((await latestCompleteTool.getAttribute('data-checkpoint-state')) !== 'replayable-forkable') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: completed checkpoint tool was not marked replayable-forkable`);
  }
  if ((await latestCompleteTool.getAttribute('role')) !== 'group') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: completed checkpoint tool was not exposed as a process group`);
  }
  if ((await latestCompleteTool.getAttribute('data-process-status')) !== 'complete') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: completed checkpoint tool did not expose complete process status`);
  }
  if ((await latestCompleteTool.getAttribute('data-replayable')) !== 'true') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: completed checkpoint tool did not expose replayable state`);
  }
  if ((await latestCompleteTool.getAttribute('data-forkable')) !== 'true') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: completed checkpoint tool did not expose forkable state`);
  }
  if ((await latestCompleteTool.getAttribute('data-has-checkpoint')) !== 'true') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: completed checkpoint tool did not expose checkpoint availability`);
  }
  if ((await latestCompleteTool.getAttribute('data-process-update-model')) !== 'latest-state') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: completed checkpoint tool should expose latest-state process updates`);
  }
  if ((await latestCompleteTool.getAttribute('data-process-detail-policy')) !== 'collapsed-until-open') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: completed checkpoint tool should keep detailed process collapsed`);
  }
  if ((await latestCompleteTool.getAttribute('data-process-surface')) !== 'single-line-status') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: completed checkpoint tool should render as a single-line status`);
  }
  if ((await latestCompleteTool.getAttribute('data-process-audit-policy')) !== 'expandable-summary') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: completed checkpoint tool should keep audit detail behind expansion`);
  }
  if ((await latestCompleteTool.getAttribute('data-default-expanded')) !== 'false') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: completed checkpoint tool should be collapsed by default`);
  }
  if ((await latestCompleteTool.getAttribute('data-raw-trace-policy')) !== 'hidden') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: completed checkpoint tool should hide raw trace details`);
  }
  if ((await latestCompleteTool.getAttribute('data-process-node-policy')) !== 'max-1-evidence') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: completed checkpoint tool should limit visible evidence nodes`);
  }
  if (await latestCompleteTool.getAttribute('open')) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: completed checkpoint tool should not be expanded by default`);
  }
  const completeToolGroups = await latestCompleteTool.locator('[data-testid="assistant-ui-tool-group"]').count();
  if (completeToolGroups > 0) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: completed checkpoint tool rendered the old debug tool group`);
  }
  if ((await latestCompleteTool.evaluate((node) => (node instanceof HTMLDetailsElement ? node.open : true))) === false) {
    await latestCompleteTool.locator('summary').click();
  }
  const completeEvidence = latestCompleteTool.locator('[data-testid="assistant-ui-process-evidence"]').first();
  const hasCompleteEvidence = await completeEvidence
    .waitFor({ state: 'attached', timeout: 1_500 })
    .then(() => true)
    .catch(() => false);
  if (hasCompleteEvidence) {
    const evidenceCount = Number(await completeEvidence.getAttribute('data-evidence-count'));
    if (!Number.isFinite(evidenceCount) || evidenceCount > 2) {
      throw new Error(`[agent-chat-qa] ${viewport.name}: completed checkpoint tool evidence was not compact`);
    }
  }
  const replayButton = page
    .locator('[data-testid="assistant-ui-checkpoint-action"][data-checkpoint-action="replay"]')
    .last();
  await replayButton.waitFor({ timeout: 5_000 });
  const forkButton = page
    .locator('[data-testid="assistant-ui-checkpoint-action"][data-checkpoint-action="fork"]')
    .last();
  await forkButton.waitFor({ timeout: 5_000 });
  if ((await replayButton.getAttribute('data-checkpoint-id')) !== '123') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: replay checkpoint id was not preserved`);
  }
  await replayButton.click();
  await page.getByText('已重新运行这一步。').waitFor({ timeout: 12_000 });
  const replayedCompleteTool = page
    .locator('[data-testid="assistant-ui-tool-ui"][data-checkpoint-state="replayable-forkable"]')
    .last();
  await replayedCompleteTool.waitFor({ timeout: 12_000 });
  await page
    .locator(
      '[data-testid="assistant-ui-tool-ui"][data-checkpoint-state="replayable-forkable"] summary',
    )
    .last()
    .click({ timeout: 5_000 });

  const forkButtonForLatestTool = page
    .locator(
      '[data-testid="assistant-ui-checkpoint-action"][data-checkpoint-action="fork"][data-checkpoint-id="123"][data-step-id="rank"]',
    )
    .last();
  await forkButtonForLatestTool.waitFor({ timeout: 5_000 });
  if ((await forkButtonForLatestTool.getAttribute('data-checkpoint-id')) !== '123') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: fork checkpoint id was not preserved`);
  }
  if ((await forkButtonForLatestTool.getAttribute('data-step-id')) !== 'rank') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: fork checkpoint step was not preserved`);
  }
  await forkButtonForLatestTool.click();
  await page.getByText('已生成一个新版本。').waitFor({ timeout: 12_000 });

  for (const expected of ['retry', 'replay', 'fork']) {
    if (!checkpointRequests.some((request) => request.action === expected)) {
      throw new Error(`[agent-chat-qa] ${viewport.name}: ${expected} checkpoint stream was not called`);
    }
  }
  if (!checkpointRequests.some((request) => request.action === 'fork')) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: fork checkpoint stream was not called`);
  }
  const retryRequest = checkpointRequests.find((request) => request.action === 'retry');
  if (retryRequest?.stepId !== 'rank' || retryRequest?.body?.decision !== null) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: retry checkpoint request did not preserve step context`);
  }
  const bodyText = await page.locator('body').innerText();
  for (const term of ['raw JSON', 'traceId', 'planner', 'tool_call']) {
    if (bodyText.includes(term)) {
      throw new Error(`[agent-chat-qa] ${viewport.name}: checkpoint actions exposed "${term}"`);
    }
  }

  const screenshotPath = path.join(qaOutputDir, `agent-chat-checkpoint-actions-${viewport.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`[agent-chat-qa] ${viewport.name}: checkpoint actions PASS (${screenshotPath})`);
};

const assertMobileSidebarDrawer = async (page, viewport) => {
  await page.goto(new URL('/agent/chat', baseUrl).toString());
  await waitForApp(page);

  const threadList = page.locator('[data-testid="assistant-ui-thread-list"]');
  await threadList.waitFor({ state: 'attached', timeout: 5_000 });
  const initialState = await threadList.getAttribute('data-state');
  if (initialState !== 'closed') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: mobile sidebar should start closed, got ${initialState}`);
  }
  if ((await threadList.getAttribute('aria-hidden')) !== 'true') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: closed mobile sidebar should be aria-hidden`);
  }

  await page.getByRole('button', { name: '打开会话列表' }).click();
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-testid="assistant-ui-thread-list"]');
    return node?.getAttribute('data-state') === 'open';
  });
  if ((await threadList.getAttribute('aria-hidden')) !== 'false') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: open mobile sidebar should be visible to assistive tech`);
  }
  if ((await threadList.getAttribute('inert')) !== null) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: open mobile sidebar should not be inert`);
  }

  const openMetrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    maxScrollWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0),
    bodyOverflow: document.body.style.overflow,
  }));
  if (openMetrics.maxScrollWidth > openMetrics.innerWidth + 1) {
    throw new Error(
      `[agent-chat-qa] ${viewport.name}: mobile sidebar caused horizontal overflow (${openMetrics.maxScrollWidth}px > ${openMetrics.innerWidth}px)`,
    );
  }
  if (openMetrics.bodyOverflow !== 'hidden') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: mobile sidebar did not lock body scroll`);
  }

  const backdrop = page.locator('[data-testid="assistant-ui-mobile-sidebar-backdrop"]');
  await backdrop.waitFor({ timeout: 5_000 });
  if ((await backdrop.getAttribute('data-state')) !== 'open') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: mobile sidebar backdrop did not expose open state`);
  }
  await backdrop.click({ position: { x: viewport.width - 12, y: 24 } });
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-testid="assistant-ui-thread-list"]');
    return node?.getAttribute('data-state') === 'closed';
  });
  if ((await backdrop.count()) > 0) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: mobile sidebar backdrop stayed mounted after close`);
  }
  if ((await threadList.getAttribute('aria-hidden')) !== 'true') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: closed mobile sidebar should restore aria-hidden`);
  }
  if ((await threadList.getAttribute('inert')) === null) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: closed mobile sidebar should restore inert`);
  }

  const screenshotPath = path.join(qaOutputDir, `agent-chat-mobile-sidebar-${viewport.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`[agent-chat-qa] ${viewport.name}: mobile sidebar PASS (${screenshotPath})`);
};

const assertRealModeThreadListPersistence = async (page, viewport, realBaseUrl) => {
  const updateRequests = await seedRealModeThreadApi(page);
  await page.goto(new URL('/agent/chat', realBaseUrl).toString());
  await waitForApp(page);

  const threadList = page.locator('[data-testid="assistant-ui-thread-list"]');
  await threadList.waitFor({ state: 'attached', timeout: 10_000 });
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-testid="assistant-ui-thread-list"]');
    return node?.getAttribute('data-sync-state') === 'synced';
  });

  const threadCount = await threadList.getAttribute('data-thread-count');
  if (threadCount !== '2') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: real ThreadList expected 2 threads, got ${threadCount}`);
  }
  const syncState = await threadList.getAttribute('data-sync-state');
  if (syncState !== 'synced') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: real ThreadList not synced, got ${syncState}`);
  }
  if ((await threadList.getAttribute('role')) !== 'navigation') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: ThreadList was not exposed as navigation`);
  }
  if ((await threadList.getAttribute('data-persistence')) !== 'fitmeet-native') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: ThreadList did not expose native persistence`);
  }
  if ((await threadList.getAttribute('data-interaction-model')) !== 'assistant-ui-thread-list') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: ThreadList did not expose assistant-ui interaction model`);
  }
  if ((await threadList.getAttribute('data-empty-state')) !== 'false') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: populated ThreadList was marked empty`);
  }
  const threadItemsList = page.locator('[data-testid="assistant-ui-thread-list-items"]');
  await threadItemsList.waitFor({ timeout: 5_000 });
  if ((await threadItemsList.getAttribute('role')) !== 'list') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: ThreadList items were not exposed as a list`);
  }
  if ((await threadItemsList.getAttribute('aria-label')) !== '最近对话') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: ThreadList items did not expose a clear list label`);
  }
  if ((await threadItemsList.getAttribute('data-visible-thread-count')) !== '2') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: ThreadList visible count did not match seeded threads`);
  }
  const firstThreadItem = threadItemsList.locator('[role="listitem"]').first();
  await firstThreadItem.waitFor({ timeout: 5_000 });
  if ((await firstThreadItem.getAttribute('data-thread-id')) !== '202') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: first ThreadList item did not expose its thread id`);
  }
  if ((await firstThreadItem.getAttribute('aria-posinset')) !== '1') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: first ThreadList item did not expose its position`);
  }
  if ((await firstThreadItem.getAttribute('aria-setsize')) !== '2') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: ThreadList items did not expose the list size`);
  }
  if ((await firstThreadItem.getAttribute('data-hover-menu')) !== 'available') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: ThreadList item hover menu was not available`);
  }
  if ((await firstThreadItem.getAttribute('data-menu-state')) !== 'closed') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: ThreadList item menu did not start closed`);
  }
  if ((await firstThreadItem.getAttribute('data-operation-state')) !== 'idle') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: ThreadList item operation state did not start idle`);
  }
  const syncStatus = page.locator('[data-testid="assistant-ui-thread-sync-status"]').first();
  await syncStatus.waitFor({ timeout: 5_000 });
  if ((await syncStatus.getAttribute('data-sync-state')) !== 'synced') {
    throw new Error(`[agent-chat-qa] ${viewport.name}: real ThreadList sync status was not synced`);
  }
  const syncStatusText = await syncStatus.innerText();
  if (!syncStatusText.includes('已同步到所有设备')) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: real ThreadList sync status copy was not cloud-like`);
  }

  await page.getByRole('button', { name: /^周末轻松跑步计划/ }).first().click();
  await page.getByText('已恢复：周末轻松跑步计划会先确认城市、时间、强度和社交边界。').waitFor({
    timeout: 10_000,
  });
  await page.waitForURL(/\/agent\/chat\/202$/);
  const firstThreadMessages = await page.locator('[data-testid="assistant-ui-message"]').allInnerTexts();
  if (!firstThreadMessages.join('\n').includes('我想找青岛本周末下午轻松跑步搭子')) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: restored first thread user message missing`);
  }
  const activeAfterFirstLocator = page
    .locator('[data-thread-id][data-active="true"], [aria-current="page"]')
    .first();
  await activeAfterFirstLocator.waitFor({ timeout: 10_000 });
  const activeAfterFirst = await activeAfterFirstLocator.innerText();
  if (!activeAfterFirst.includes('周末轻松跑步计划')) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: first selected thread was not marked active`);
  }

  await page.getByRole('button', { name: /^普通训练安排/ }).first().click();
  await page.getByText('已恢复：普通训练安排只保留自然对话，不会展示社交推荐卡片。').waitFor({
    timeout: 10_000,
  });
  await page.waitForURL(/\/agent\/chat\/203$/);
  const secondThreadMessages = await page.locator('[data-testid="assistant-ui-message"]').allInnerTexts();
  const secondThreadText = secondThreadMessages.join('\n');
  if (!secondThreadText.includes('只想普通聊天，帮我梳理今天训练安排')) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: restored second thread user message missing`);
  }
  if (secondThreadText.includes('已恢复：周末轻松跑步计划')) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: switching threads left the previous thread in the message stream`);
  }
  const activeAfterSecondLocator = page
    .locator('[data-thread-id][data-active="true"], [aria-current="page"]')
    .first();
  await activeAfterSecondLocator.waitFor({ timeout: 10_000 });
  const activeAfterSecond = await activeAfterSecondLocator.innerText();
  if (!activeAfterSecond.includes('普通训练安排')) {
    throw new Error(`[agent-chat-qa] ${viewport.name}: second selected thread was not marked active`);
  }

  const restoreUpdates = updateRequests.filter(
    (request) => request.body?.metadata?.restoreSource === 'thread_list',
  );
  if (restoreUpdates.length < 2) {
    throw new Error(
      `[agent-chat-qa] ${viewport.name}: thread switching did not persist restore metadata`,
    );
  }

  const screenshotPath = path.join(qaOutputDir, `agent-chat-real-thread-list-${viewport.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`[agent-chat-qa] ${viewport.name}: real ThreadList PASS (${screenshotPath})`);
};

const submitComposer = async (page, prompt) => {
  await page.locator('[data-testid="assistant-ui-composer"] textarea').fill(prompt);
  await page.locator('[data-testid="assistant-ui-composer"]').evaluate((node) => {
    const form = node.closest('form') ?? node.querySelector('form');
    if (form) {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      return;
    }
    const textarea = node.querySelector('textarea');
    textarea?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
};

const runWithViewport = async (browser, viewport, assertion) => {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  try {
    await assertion(page, viewport);
  } finally {
    await page.close();
  }
};

let serverProcess;
let realModeServerProcess;
if (!hasExplicitBaseUrl) {
  const localPort = await findAvailablePort(5173);
  baseUrl = `http://127.0.0.1:${localPort}`;
  serverProcess = await startLocalViteServer({ port: localPort });
}

await mkdir(qaOutputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    try {
      await assertShellStructure(page, viewport);
    } finally {
      await page.close();
    }
  }

  if (!hasExplicitBaseUrl) {
    for (const viewport of [viewports[0], viewports[1]]) {
      await runWithViewport(browser, viewport, assertMobileSidebarDrawer);
    }
    for (const viewport of viewports) {
      await runWithViewport(browser, viewport, assertConversationStructure);
      await runWithViewport(browser, viewport, assertComposerKeyboardFlow);
      await runWithViewport(browser, viewport, assertNewChatResetFlow);
      await runWithViewport(browser, viewport, assertActionBarMicrointeractions);
      await runWithViewport(browser, viewport, assertAttachmentUploadFailureRetry);
      await runWithViewport(browser, viewport, assertFeedbackSubmission);
      await runWithViewport(browser, viewport, assertStopGeneration);
      await runWithViewport(browser, viewport, assertBranchRegeneration);
      await runWithViewport(browser, viewport, assertCheckpointStepActions);
    }
    for (const viewport of viewports) {
      await runWithViewport(browser, viewport, assertIncompleteSocialIntentClarifies);
      await runWithViewport(browser, viewport, assertSocialClarificationContinuation);
      await runWithViewport(browser, viewport, assertSocialIntentToolStructure);
      await runWithViewport(browser, viewport, assertToolActionMicrointeraction);
      await runWithViewport(browser, viewport, assertSocialActionChain);
      await runWithViewport(browser, viewport, assertSocialActionRewriteDoesNotSend);
    }
    for (const viewport of viewports) {
      await runWithViewport(browser, viewport, assertEndToEndOpportunityJourney);
    }

    const realModePort = await findAvailablePort(5174);
    realModeServerProcess = await startLocalViteServer({
      port: realModePort,
      adapter: 'real',
      mockFlow: false,
    });
    const realModeBaseUrl = `http://127.0.0.1:${realModePort}`;
    await runWithViewport(browser, viewports[3], (page, viewport) =>
      assertRealModeThreadListPersistence(page, viewport, realModeBaseUrl),
    );
  } else {
    console.log('[agent-chat-qa] skip authenticated conversation and social intent checks for explicit base URL');
  }

  console.log(`[agent-chat-qa] PASS for ${baseUrl}`);
} finally {
  await browser.close();
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
  if (realModeServerProcess) {
    realModeServerProcess.kill('SIGTERM');
  }
}
