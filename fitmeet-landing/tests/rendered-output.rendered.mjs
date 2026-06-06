import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);

async function readBuilt(path) {
  try {
    return await readFile(new URL(`.next/server/app/${path}`, root), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(
        `Missing rendered build artifact .next/server/app/${path}. Run pnpm build before pnpm test:rendered.`,
      );
    }
    throw error;
  }
}

async function readSource(path) {
  return readFile(new URL(path, root), 'utf8');
}

async function readJson(path) {
  const source = await readFile(new URL(path, root), 'utf8');
  return JSON.parse(source);
}

async function assertBuildAssetReferencesExist(route, htmlPath) {
  const html = await readBuilt(htmlPath);
  const assetUrls = [
    ...html.matchAll(/\b(?:href|src)="([^"]+)"/g),
  ]
    .map((match) => decodeHtml(match[1]))
    .filter((value) => value.startsWith('/_next/static/'));

  assert.ok(assetUrls.length > 0, `${route} should reference Next static assets`);

  for (const assetUrl of new Set(assetUrls)) {
    const { pathname } = new URL(assetUrl, 'https://ourfitmeet.cn');
    const assetPath = `.next${pathname.replace('/_next', '')}`;
    await assert.doesNotReject(
      () => access(new URL(assetPath, root)),
      `${route} should reference an existing build asset: ${assetUrl}`,
    );
  }
}

function gatewayRecordsFromSource(source) {
  return [
    ...source.matchAll(
      /\{\s*id:\s*'([^']+)'[\s\S]*?titleEn:\s*'([^']+)'[\s\S]*?cta:\s*'([^']+)'[\s\S]*?href:\s*'([^']+)'/g,
    ),
  ].map((match) => ({
    id: match[1],
    titleEn: match[2],
    cta: match[3],
    href: match[4],
  }));
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function assertContainsAll(source, values, label) {
  const readable = decodeHtml(source);
  for (const value of values) {
    assert.match(
      readable,
      new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `${label} rendered HTML should include ${value}`,
    );
  }
}

test('rendered home page exposes the full public landing surface', async () => {
  const html = await readBuilt('index.html');

  assertContainsAll(
    html,
    [
      'FitMeet',
      'Explore Ecosystem',
      'Our Philosophy',
      'Three gateways. One ecosystem.',
      'Human',
      'Pet & Animal',
      'AI & Robotics',
      'Explore Human',
      'Explore Pet & Animal',
      'Explore AI & Robotics',
    ],
    'home page',
  );
  assert.doesNotMatch(html, /No landing tests configured|placeholder|coming soon/i);
});

test('rendered agent hub is a concrete product entry, not a shell', async () => {
  const html = await readBuilt('agent-hub.html');

  assertContainsAll(
    html,
    [
      'Agent-Native Social Matching',
      'Your AI',
      'Your Rules',
      '接入 Agent',
      '偏好设置',
      '安全承诺',
      'OpenClaw',
      'Codex',
      'Custom',
      'FitMeet Agent Gateway',
    ],
    'agent hub',
  );
  assert.doesNotMatch(html, /No landing tests configured|placeholder|mock-only/i);
});

test('rendered gateway pages cover every static ecosystem route', async () => {
  const expected = {
    human: ['Human', 'Training companion', 'Recovery rhythm', 'Social matching'],
    pet: ['Pet & Animal', 'Care routines', 'Companion insights', 'Health monitoring'],
    ai: ['AI & Robotics', 'Agent permissions', 'Robotics companion', 'Personalized guidance'],
  };

  for (const [route, values] of Object.entries(expected)) {
    const html = await readBuilt(`${route}.html`);
    assertContainsAll(
      html,
      ['FitMeet', 'Connect Agent', 'Back to ecosystem', 'What it covers', ...values],
      `${route} gateway`,
    );
    assert.doesNotMatch(html, /placeholder|mock-only|coming soon/i);
  }
});

test('rendered footer and gateway CTAs do not ship dead links', async () => {
  const html = decodeHtml(await readBuilt('index.html'));
  const gateways = gatewayRecordsFromSource(await readSource('data/gateways.ts'));

  assert.doesNotMatch(html, /href="#"/);
  assertContainsAll(
    html,
    [
      'mailto:hello@ourfitmeet.cn',
      'mailto:press@ourfitmeet.cn',
      'mailto:privacy@ourfitmeet.cn',
      'mailto:legal@ourfitmeet.cn',
      '/agent-hub',
      '#gateways',
    ],
    'home footer links',
  );

  for (const gateway of gateways) {
    assertContainsAll(
      html,
      [
        `id="gateway-${gateway.id}"`,
        `href="${gateway.href}"`,
        gateway.titleEn,
        gateway.cta,
      ],
      `${gateway.id} rendered gateway CTA`,
    );
  }
});

test('next build manifest keeps all deployment-critical landing routes static', async () => {
  const routes = await readJson('.next/app-path-routes-manifest.json');
  const prerender = await readJson('.next/prerender-manifest.json');

  assert.deepEqual(routes['/page'], '/');
  assert.deepEqual(routes['/agent-hub/page'], '/agent-hub');
  assert.deepEqual(routes['/[gateway]/page'], '/[gateway]');

  for (const route of ['/', '/agent-hub', '/human', '/pet', '/ai']) {
    assert.ok(prerender.routes[route], `${route} should be prerendered`);
    assert.equal(
      prerender.routes[route].initialRevalidateSeconds,
      false,
      `${route} should be static without ISR timing`,
    );
  }
});

test('rendered pages reference only deployable Next static assets', async () => {
  const pages = {
    '/': 'index.html',
    '/agent-hub': 'agent-hub.html',
    '/human': 'human.html',
    '/pet': 'pet.html',
    '/ai': 'ai.html',
  };

  for (const [route, htmlPath] of Object.entries(pages)) {
    await assertBuildAssetReferencesExist(route, htmlPath);
  }
});
