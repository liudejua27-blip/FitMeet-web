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

test('primary navigation and CTAs keep gateway anchors reachable', async () => {
  const nav = await readSource('data/nav.ts');
  const hero = await readSource('components/HeroSection.tsx');
  const gatewaysData = await readSource('data/gateways.ts');
  const ecosystemGateways = await readSource('components/EcosystemGateways.tsx');
  const finalCta = await readSource('components/FinalCTA.tsx');

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
});

test('root engineering handbook documents landing tests as real baseline', async () => {
  const readme = await readSource('../README.md');

  assert.match(readme, /fitmeet-landing：install、lint、build、test/);
  assert.doesNotMatch(readme, /fitmeet-landing.*no-op/i);
  assert.match(readme, /fitmeet-landing` 已有真实 smoke 覆盖/);
});
