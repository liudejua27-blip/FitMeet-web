/// <reference types="node" />

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const srcRoot = join(process.cwd(), 'src');

describe('Agent user route isolation', () => {
  it('keeps legacy social agent workbench code out of public routes', () => {
    const appSource = readSource('App.tsx');

    expect(appSource).not.toMatch(/SocialAgentConsolePage|agent-workbench|AgentRunTrace/);
    expect(appSource).not.toMatch(/\.\/debug|src\/debug/);
    expect(appSource).toMatch(
      /path="\/social-agent"[\s\S]*element=\{<Navigate to="\/agent" replace \/>}/,
    );
  });

  it('removes the old user-facing workbench files while keeping debug copies isolated', () => {
    expect(existsSync(join(srcRoot, 'components', 'agent-workbench'))).toBe(false);
    expect(existsSync(join(srcRoot, 'pages', 'SocialAgentConsolePage.tsx'))).toBe(false);
    expect(existsSync(join(srcRoot, 'debug', 'agent-workbench', 'AgentRunTrace.tsx'))).toBe(true);
    expect(existsSync(join(srcRoot, 'debug', 'SocialAgentConsolePage.tsx'))).toBe(true);
  });

  it('allows debug API imports only inside the debug source tree', () => {
    const offenders = collectSourceFiles(srcRoot)
      .filter((file) => !file.endsWith(join('api', 'socialAgentDebugApi.ts')))
      .filter((file) => !relative(srcRoot, file).replace(/\\/g, '/').startsWith('test/'))
      .filter((file) => readFileSync(file, 'utf8').includes('socialAgentDebugApi'))
      .map((file) => relative(srcRoot, file).replace(/\\/g, '/'))
      .filter((path) => !path.startsWith('debug/'));

    expect(offenders).toEqual([]);
  });

  it('keeps the agent workspace on the user-facing API contract', () => {
    const userPathSources = [
      join(srcRoot, 'pages', 'AgentWorkspacePage.tsx'),
      ...collectSourceFiles(join(srcRoot, 'components', 'agent-workspace')),
    ];

    const userPathText = userPathSources.map((file) => readFileSync(file, 'utf8')).join('\n');
    expect(userPathText).not.toMatch(
      /socialAgentDebugApi|AgentRunTrace|SocialAgentConsolePage|agent-workbench/,
    );
  });

  it('does not introduce AI SDK chat architecture dependencies into the app shell', () => {
    const packageJson = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
    const allSourceText = collectSourceFiles(srcRoot)
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');

    expect(packageJson).not.toContain('@ai-sdk/react');
    expect(allSourceText).not.toMatch(/useChat\s*\(/);
  });
});

function readSource(path: string) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

function collectSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) return collectSourceFiles(fullPath);
    if (!/\.(ts|tsx)$/.test(entry)) return [];
    return [fullPath];
  });
}
