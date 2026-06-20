import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const DEFAULT_BASE_URL = 'http://127.0.0.1:5173';
const baseUrlArg = process.argv.find((arg) => arg.startsWith('--base-url='))?.replace('--base-url=', '');
const hasExplicitBaseUrl = Boolean(
  process.env.FITMEET_E2E_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || baseUrlArg,
);
const baseUrl = process.env.FITMEET_E2E_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || baseUrlArg || DEFAULT_BASE_URL;

const entryRoutes = (process.env.FITMEET_DISCOVER_SMOKE_ROUTES || [
  '/',
  '/sports',
  '/cities',
  '/agent-connect',
].join(','))
  .split(',')
  .map((route) => route.trim())
  .filter(Boolean);
const requiredEntryRoutes = new Set(
  (process.env.FITMEET_DISCOVER_REQUIRED_ROUTES || entryRoutes.join(','))
    .split(',')
    .map((route) => route.trim())
    .filter(Boolean),
);

const aliasRoutes = [
  '/human?focusScene=run#top',
  '/nearby',
  '/meet?category=run',
  '/hall?tab=match',
  '/social-hall',
  '/agent-connect/social-hall',
];

const compatibilityAliasRoutes = [
  {
    route: '/legacy-home',
    expectedPathname: '/',
    label: 'legacy home alias',
  },
];

const toUrl = (route) => new URL(route, baseUrl).toString();

const startLocalViteServer = async () => {
  const viteBin = process.platform === 'win32' ? 'node_modules/.bin/vite.cmd' : 'node_modules/.bin/vite';
  const child = spawn(viteBin, ['--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      BROWSER: 'none',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return await new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      reject(new Error('[discover-smoke] Timed out while starting local Vite server'));
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
      if (output.includes('EADDRINUSE')) {
        settleFailed(
          '[discover-smoke] Port 5173 is already in use. Set PLAYWRIGHT_BASE_URL to test an existing server.',
        );
      }
    });

    child.on('exit', (code) => {
      if (!settled) {
        settleFailed(`[discover-smoke] Local Vite server exited before ready, code=${code ?? 'unknown'}`);
      }
    });
  });
};

const waitForApp = async (page) => {
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#root').waitFor({ state: 'attached', timeout: 10_000 });
  await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => {});
  await page.waitForTimeout(150);
};

const expectDiscoverUrl = async (page, expectedTarget) => {
  const expected = new URL(expectedTarget, baseUrl);
  await page.waitForURL(
    (url) => {
      const current = url instanceof URL ? url : new URL(String(url));
      if (current.pathname !== '/discover') return false;
      if (!expected.search) return true;
      return current.search === expected.search;
    },
    { timeout: 10_000 },
  );
};

const testDiscoverEntriesOnRoute = async (page, route) => {
  await page.goto(toUrl(route));
  await waitForApp(page);

  const entries = page.locator('[data-testid="discover-entry"]');
  const count = await entries.count();
  if (count === 0) {
    if (requiredEntryRoutes.has(route)) {
      throw new Error(`[discover-smoke] ${route}: expected at least one discover entry`);
    }
    console.log(`[discover-smoke] ${route}: no discover entries found`);
    return;
  }

  for (let index = 0; index < count; index += 1) {
    await page.goto(toUrl(route));
    await waitForApp(page);

    const entry = page.locator('[data-testid="discover-entry"]').nth(index);
    if (!(await entry.isVisible().catch(() => false))) {
      console.log(`[discover-smoke] ${route}: skipped hidden discover entry #${index + 1}`);
      continue;
    }

    const target = (await entry.getAttribute('data-discover-target')) || '/discover';
    await page.evaluate(() => window.scrollTo({ top: 720, left: 0, behavior: 'auto' }));
    await entry.click();
    await expectDiscoverUrl(page, target);
    await page.waitForTimeout(80);

    const scrollY = await page.evaluate(() => window.scrollY);
    if (scrollY > 8) {
      throw new Error(
        `[discover-smoke] ${route}: discover entry #${index + 1} navigated but did not reset scroll, scrollY=${scrollY}`,
      );
    }
  }

  console.log(`[discover-smoke] ${route}: verified ${count} discover entries`);
};

const testAliasRoute = async (page, route) => {
  await page.goto(toUrl(route));
  await waitForApp(page);
  await expectDiscoverUrl(page, route);
  const scrollY = await page.evaluate(() => window.scrollY);
  if (scrollY > 8) {
    throw new Error(`[discover-smoke] ${route}: alias route did not reset scroll, scrollY=${scrollY}`);
  }
  console.log(`[discover-smoke] ${route}: alias resolved to /discover`);
};

const testCompatibilityAliasRoute = async (page, { route, expectedPathname, label }) => {
  await page.goto(toUrl(route));
  await waitForApp(page);
  await page.waitForURL(
    (url) => {
      const current = url instanceof URL ? url : new URL(String(url));
      return current.pathname === expectedPathname;
    },
    { timeout: 10_000 },
  );
  const scrollY = await page.evaluate(() => window.scrollY);
  if (scrollY > 8) {
    throw new Error(
      `[discover-smoke] ${route}: ${label} did not reset scroll, scrollY=${scrollY}`,
    );
  }
  console.log(`[discover-smoke] ${route}: ${label} resolved to ${expectedPathname}`);
};

let serverProcess;
if (!hasExplicitBaseUrl) {
  serverProcess = await startLocalViteServer();
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

try {
  for (const route of entryRoutes) {
    await testDiscoverEntriesOnRoute(page, route);
  }

  for (const route of aliasRoutes) {
    await testAliasRoute(page, route);
  }

  for (const alias of compatibilityAliasRoutes) {
    await testCompatibilityAliasRoute(page, alias);
  }

  console.log(`[discover-smoke] PASS for ${baseUrl}`);
} finally {
  await browser.close();
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
}
