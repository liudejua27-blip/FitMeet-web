import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

describe('Loop agent architecture boundaries', () => {
  const agentGatewayRoot = __dirname;
  const loopRoots = [
    'agent-entry',
    'workout-loop',
    'friend-loop',
    'travel-loop',
  ];
  const legacyMainlineImports = [
    'social-agent-route-search-turn',
    'social-agent-route-action-turn',
    'social-agent-main-agent-turn',
    'fitmeet-alpha-agent-sdk',
  ];

  it('keeps loop-owned code from importing legacy route/search/action mainlines', () => {
    const violations = loopRoots.flatMap((root) =>
      sourceFiles(join(agentGatewayRoot, root)).flatMap((file) => {
        const contents = readFileSync(file, 'utf8');
        return legacyMainlineImports
          .filter(
            (legacyImport) =>
              contents.includes(`'../${legacyImport}`) ||
              contents.includes(`'./${legacyImport}`) ||
              contents.includes(`"${legacyImport}`) ||
              contents.includes(`'${legacyImport}`),
          )
          .map(
            (legacyImport) =>
              `${relative(agentGatewayRoot, file)} imports ${legacyImport}`,
          );
      }),
    );

    expect(violations).toEqual([]);
  });

  it('marks old route and legacy adapters as deprecated fallback surfaces', () => {
    const legacyFiles = [
      'legacy-agent/legacy-agent-adapter.service.ts',
      'social-agent-route-search-turn.service.ts',
      'social-agent-route-action-turn.service.ts',
    ];

    for (const legacyFile of legacyFiles) {
      const contents = readFileSync(join(agentGatewayRoot, legacyFile), 'utf8');
      expect(contents).toContain('@deprecated');
      expect(contents.toLowerCase()).toMatch(/legacy|fallback/);
    }
  });
});

function sourceFiles(root: string): string[] {
  const entries = readdirSync(root);
  return entries.flatMap((entry) => {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return sourceFiles(path);
    if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) return [path];
    return [];
  });
}
