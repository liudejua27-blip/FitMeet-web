import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const rootDir = path.resolve(import.meta.dirname, '..');
const baseUrl = process.env.WEBSITE_BASE_URL || 'http://127.0.0.1:5173';
const outputDir = process.env.WEBSITE_HERO_SCREENSHOT_DIR
  ? path.resolve(process.env.WEBSITE_HERO_SCREENSHOT_DIR)
  : path.join(rootDir, 'test-results', 'website-hero');

const pages = [
  ['home', '/'],
  ['features', '/features'],
  ['safety', '/safety'],
  ['download', '/download'],
  ['about', '/about'],
  ['demo', '/demo'],
];

const viewports = [
  ['desktop-1440', { width: 1440, height: 900 }],
  ['desktop-1280', { width: 1280, height: 800 }],
  ['tablet-1024', { width: 1024, height: 768 }],
  ['mobile-390', { width: 390, height: 844 }],
];

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch();
const failures = [];

try {
  for (const [viewportName, viewport] of viewports) {
    const context = await browser.newContext({ deviceScaleFactor: 1, viewport });
    const page = await context.newPage();

    for (const [pageName, route] of pages) {
      const url = new URL(route, baseUrl).toString();
      await page.goto(url, { waitUntil: 'networkidle' });
      const hero = page.locator('.fm-enterprise-hero-system').first();
      await hero.waitFor({ state: 'visible', timeout: 15_000 });

      const metrics = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        heroCount: document.querySelectorAll('.fm-enterprise-hero-system').length,
        oldBeamCount: document.querySelectorAll('.fm-cinematic-showcase__beams').length,
        oldHeroCount: document.querySelectorAll('.fm-enterprise-hero, .fm-page-hero').length,
        scrollWidth: document.documentElement.scrollWidth,
      }));

      if (metrics.heroCount !== 1) {
        failures.push(`${pageName}/${viewportName}: expected one EnterpriseHero, got ${metrics.heroCount}`);
      }
      if (metrics.oldBeamCount > 0 || metrics.oldHeroCount > 0) {
        failures.push(`${pageName}/${viewportName}: retired hero/cinematic DOM is still present`);
      }
      if (metrics.scrollWidth > metrics.clientWidth + 1) {
        failures.push(
          `${pageName}/${viewportName}: horizontal overflow ${metrics.scrollWidth} > ${metrics.clientWidth}`,
        );
      }

      await page.screenshot({
        fullPage: false,
        path: path.join(outputDir, `${viewportName}-${pageName}.png`),
      });
    }

    await context.close();
  }
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Website hero screenshots written to ${path.relative(rootDir, outputDir)}`);
