import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

async function readJson(path) {
  const source = await readFile(new URL(path, root), 'utf8');
  return JSON.parse(source);
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
