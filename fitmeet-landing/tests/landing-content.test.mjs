import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);

async function readSource(path) {
  return readFile(new URL(path, root), 'utf8');
}

function assertContainsAll(source, values, label) {
  for (const value of values) {
    assert.match(
      source,
      new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `${label} should include ${value}`,
    );
  }
}

function gatewayIdsFromSource(source) {
  return [
    ...new Set(
      [...source.matchAll(/id:\s*['"]([^'"]+)['"]/g)].map(
        (match) => match[1],
      ),
    ),
  ];
}

function gatewayHrefsFromSource(source) {
  return [...source.matchAll(/href:\s*['"](\/[^'"]+)['"]/g)].map(
    (match) => match[1],
  );
}

function agentHubTabsFromSource(source) {
  return [
    ...source.matchAll(/\{\s*id:\s*'([^']+)',\s*label:\s*'([^']+)'\s*\}/g),
  ].map((match) => ({ id: match[1], label: match[2] }));
}

function securityTitlesFromSource(source) {
  return [...source.matchAll(/title:\s*'([^']+)'/g)].map(
    (match) => match[1],
  );
}

function hrefsFromSource(source) {
  return [...source.matchAll(/href:\s*['"]([^'"]+)['"]/g)].map(
    (match) => match[1],
  );
}

function assertNoDeadHrefs(source, label) {
  assert.doesNotMatch(source, /href=["']#["']|href:\s*['"]#['"]/);
  for (const href of hrefsFromSource(source)) {
    assert.match(
      href,
      /^(\/[a-z0-9-]*|#[a-z][a-z0-9-]*|mailto:[^@\s]+@[^?\s]+(?:\?[^"\s]+)?)$/i,
      `${label} should expose deployable href ${href}`,
    );
  }
}

test('home route composes the public landing experience', async () => {
  const page = await readSource('app/page.tsx');
  const requiredSections = [
    'HeroSection',
    'BrandPhilosophy',
    'EcosystemGateways',
    'SymbiosisStory',
    'VisionSection',
    'FinalCTA',
  ];

  for (const section of requiredSections) {
    assert.match(page, new RegExp(`import .*${section}`));
    assert.match(page, new RegExp(`<${section}\\b`));
  }

  assert.doesNotMatch(page, /No landing tests configured|TODO|Coming soon/i);
});

test('layout exposes FitMeet metadata and global chrome', async () => {
  const layout = await readSource('app/layout.tsx');

  assert.match(layout, /title:\s*['"`][^'"`]*FitMeet/);
  assert.match(layout, /description:\s*['"`][^'"`]*AI/i);
  assert.match(layout, /<SmoothScroll\s*\/>/);
  assert.match(layout, /<Navbar\s*\/>/);
  assert.match(layout, /<Footer\s*\/>/);
});

test('agent hub route is a real product surface', async () => {
  const agentHub = await readSource('app/agent-hub/page.tsx');
  const agentConnectPanel = await readSource(
    'components/agent/AgentConnectPanel.tsx',
  );
  const permissionCard = await readSource('components/agent/PermissionCard.tsx');
  const preferenceStudio = await readSource(
    'components/agent/PreferenceStudio.tsx',
  );
  const requiredPanels = ['AgentConnectPanel', 'PreferenceStudio'];

  for (const panel of requiredPanels) {
    assert.match(agentHub, new RegExp(`import .*${panel}`));
    assert.match(agentHub, new RegExp(`<${panel}\\b`));
  }

  assert.match(agentConnectPanel, /import .*PermissionCard/);
  assert.match(agentConnectPanel, /<PermissionCard\b/);
  assertContainsAll(
    agentHub,
    ['接入 Agent', '偏好设置', '安全承诺', '双重确认不可绕过', 'Token 永不存储明文'],
    'agent hub',
  );
  assertContainsAll(
    agentConnectPanel,
    ['OpenClaw', 'Codex', 'Custom', '确认连接 Agent', 'X-Agent-Token'],
    'agent connect flow',
  );
  assertContainsAll(
    permissionCard,
    ['read_only', 'draft_mode', 'basic', 'standard', 'open', 'Recommended'],
    'permission cards',
  );
  assertContainsAll(
    preferenceStudio,
    ['理想型描述', '基础条件', '关系目标', '聊天风格偏好', '隐私边界', '保存偏好'],
    'preference studio',
  );
  assert.doesNotMatch(agentHub, /placeholder|stub|mock-only|coming soon/i);
});

test('agent hub tabs and security controls are wired as a stateful product flow', async () => {
  const agentHub = await readSource('app/agent-hub/page.tsx');

  assert.deepEqual(agentHubTabsFromSource(agentHub), [
    { id: 'connect', label: '接入 Agent' },
    { id: 'prefs', label: '偏好设置' },
    { id: 'security', label: '安全承诺' },
  ]);
  assert.match(agentHub, /useState<Tab>\('connect'\)/);
  assert.match(agentHub, /onClick=\{\(\) => setTab\(t\.id\)\}/);
  for (const tab of ['connect', 'prefs', 'security']) {
    assert.match(
      agentHub,
      new RegExp(`tab === '${tab}'`),
      `${tab} tab should render its own product panel`,
    );
  }

  assert.deepEqual(securityTitlesFromSource(agentHub), [
    '双重确认不可绕过',
    'Token 永不存储明文',
    '完整审计日志',
    '骚扰检测引擎',
    '随时断联',
    '每日配额硬上限',
  ]);
  assertContainsAll(
    agentHub,
    ['服务端强制执行', 'bcrypt', '审计日志', '语义分析', '401', '每日配额'],
    'agent hub security controls',
  );
});

test('primary navigation and CTAs keep gateway anchors reachable', async () => {
  const nav = await readSource('data/nav.ts');
  const hero = await readSource('components/HeroSection.tsx');
  const gatewaysData = await readSource('data/gateways.ts');
  const ecosystemGateways = await readSource('components/EcosystemGateways.tsx');
  const finalCta = await readSource('components/FinalCTA.tsx');
  const footer = await readSource('components/Footer.tsx');
  const gatewayRoute = await readSource('app/[gateway]/page.tsx');

  for (const anchor of ['#gateways', '#gateway-human', '#gateway-pet', '#gateway-ai']) {
    assert.match(nav, new RegExp(`href:\\s*['"]${anchor}['"]`));
  }
  for (const gateway of ['human', 'pet', 'ai']) {
    assert.match(gatewaysData, new RegExp(`id:\\s*['"]${gateway}['"]`));
    assert.match(
      ecosystemGateways,
      new RegExp("id=\\{`gateway-\\$\\{g\\.id\\}`\\}"),
      'gateway cards must expose ids matching navbar anchors',
    );
    assert.match(nav, new RegExp(`href:\\s*['"]#gateway-${gateway}['"]`));
  }
  assertContainsAll(
    gatewaysData,
    ['/human', '/pet', '/ai', 'Explore Human', 'Explore Pet & Animal', 'Explore AI & Robotics'],
    'gateway data',
  );
  assert.match(hero, /href=["']#gateways["']/);
  assert.match(hero, /href=["']#philosophy["']/);
  assert.match(finalCta, /GATEWAYS\.map/);
  assert.match(gatewayRoute, /generateStaticParams/);
  assert.match(gatewayRoute, /notFound\(\)/);

  const gatewayIds = gatewayIdsFromSource(gatewaysData);
  const gatewayHrefs = gatewayHrefsFromSource(gatewaysData);
  const footerHrefs = hrefsFromSource(footer);
  assert.deepEqual(gatewayIds, ['human', 'pet', 'ai']);
  assert.deepEqual(gatewayHrefs, ['/human', '/pet', '/ai']);
  for (const id of gatewayIds) {
    assert.match(
      gatewayRoute,
      new RegExp(`gateway:\\s*gateway\\.id`),
      'dynamic gateway route should generate params from GATEWAYS ids',
    );
    assert.ok(footerHrefs.includes(`/${id}`), `footer should link to /${id}`);
  }
});

test('footer links are deployable product paths, anchors, or email contacts', async () => {
  const footer = await readSource('components/Footer.tsx');

  assertNoDeadHrefs(footer, 'footer');
  assertContainsAll(
    footer,
    [
      'mailto:hello@ourfitmeet.cn',
      'mailto:press@ourfitmeet.cn',
      'mailto:privacy@ourfitmeet.cn',
      'mailto:legal@ourfitmeet.cn',
      '/agent-hub',
      '#gateways',
    ],
    'footer',
  );
});

test('gateway detail route covers every ecosystem CTA with real content', async () => {
  const gatewaysData = await readSource('data/gateways.ts');
  const gatewayRoute = await readSource('app/[gateway]/page.tsx');

  assertContainsAll(
    gatewayRoute,
    [
      'Connect Agent',
      'Back to ecosystem',
      'What it covers',
      'readGateway',
      'GATEWAYS.find',
    ],
    'gateway detail route',
  );

  for (const id of gatewayIdsFromSource(gatewaysData)) {
    assert.match(
      gatewayRoute,
      new RegExp(`${id}:\\s*\\{`),
      `gateway detail route should define detail copy for ${id}`,
    );
  }
  assert.doesNotMatch(gatewayRoute, /placeholder|stub|mock-only|coming soon/i);
});

test('root engineering handbook documents landing tests as real baseline', async () => {
  const readme = await readSource('../README.md');

  assert.match(readme, /fitmeet-landing：install、lint、build、test、test:rendered/);
  assert.doesNotMatch(readme, /fitmeet-landing.*no-op/i);
  assert.match(readme, /fitmeet-landing` 已有源码 smoke 和 build 后 rendered smoke 覆盖/);
});
