import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);

async function readSource(path) {
  return readFile(new URL(path, root), 'utf8');
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
  const requiredPanels = ['AgentConnectPanel', 'PreferenceStudio'];

  for (const panel of requiredPanels) {
    assert.match(agentHub, new RegExp(`import .*${panel}`));
    assert.match(agentHub, new RegExp(`<${panel}\\b`));
  }

  assert.match(agentConnectPanel, /import .*PermissionCard/);
  assert.match(agentConnectPanel, /<PermissionCard\b/);
  assert.doesNotMatch(agentHub, /placeholder|stub|mock-only|coming soon/i);
});

test('primary navigation and CTAs keep gateway anchors reachable', async () => {
  const nav = await readSource('data/nav.ts');
  const hero = await readSource('components/HeroSection.tsx');
  const finalCta = await readSource('components/FinalCTA.tsx');

  for (const anchor of ['#gateways', '#gateway-human', '#gateway-pet', '#gateway-ai']) {
    assert.match(nav, new RegExp(`href:\\s*['"]${anchor}['"]`));
  }
  assert.match(hero, /href=["']#gateways["']/);
  assert.match(finalCta, /GATEWAYS\.map/);
});
