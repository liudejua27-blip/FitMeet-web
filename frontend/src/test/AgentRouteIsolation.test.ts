/// <reference types="node" />

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const srcRoot = join(process.cwd(), 'src');

describe('Agent user route isolation', () => {
  it('keeps legacy social agent workbench code out of public routes', () => {
    const appSource = readSource('App.tsx');
    const routeSource = readSource(join('routes', 'AppRoutes.tsx'));

    expect(appSource).not.toMatch(/SocialAgentConsolePage|agent-workbench|AgentRunTrace/);
    expect(appSource).not.toMatch(/\.\/debug|src\/debug/);
    expect(routeSource).not.toMatch(/SocialAgentConsolePage|agent-workbench|AgentRunTrace/);
    expect(routeSource).not.toMatch(/\.\/debug|src\/debug/);
    expect(routeSource).toMatch(
      /path="\/social-agent"[\s\S]*element=\{<Navigate to="\/agent" replace \/>}/,
    );
  });

  it('removes the old user-facing and debug workbench files', () => {
    expect(existsSync(join(srcRoot, 'components', 'agent-workbench'))).toBe(false);
    expect(existsSync(join(srcRoot, 'pages', 'SocialAgentConsolePage.tsx'))).toBe(false);
    expect(existsSync(join(srcRoot, 'debug', 'agent-workbench'))).toBe(false);
    expect(existsSync(join(srcRoot, 'debug', 'SocialAgentConsolePage.tsx'))).toBe(false);
    expect(existsSync(join(srcRoot, 'debug', 'agentTaskEvents.ts'))).toBe(false);
    expect(existsSync(join(srcRoot, 'debug', 'agentPageModuleAudit.ts'))).toBe(true);
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

  it('keeps retired agent copy and shell selectors out of production source', () => {
    const forbiddenPatterns = [
      /今天想认识什么样的人？/,
      /开始低压力社交/,
      /开始一个低压力任务/,
      /找个跑步搭子/,
      /正在调用工具/,
      /工具已完成/,
      /工具整理结果/,
      /关联步骤/,
      /return ['"]工具['"]/,
      /agent-gpt-copy-shell/,
      /agent-workspace--gpt/,
      /agent-gpt-result-block/,
      /\bagent-gpt-/,
      /agent-workspace__/,
      /agent-workspace--/,
      /agent-center-input/,
      /agent-quick-actions/,
      /agent-context-pills/,
      /agent-progressive-results/,
      /\bagent-flow-/,
      /\bagent-permission-select\b/,
      /agent-workspace-ant-guide/,
    ];
    const offenders = collectSourceFiles(srcRoot)
      .filter((file) => !relative(srcRoot, file).replace(/\\/g, '/').startsWith('test/'))
      .flatMap((file) => {
        const source = readFileSync(file, 'utf8');
        return forbiddenPatterns
          .filter((pattern) => pattern.test(source))
          .map((pattern) => `${relative(srcRoot, file).replace(/\\/g, '/')}: ${pattern}`);
      });

    expect(offenders).toEqual([]);
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
    if (!/\.(ts|tsx|css)$/.test(entry)) return [];
    return [fullPath];
  });
}
