import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SocialAgentToolName } from './social-agent-tool.types';

describe('social agent tool dispatch contract', () => {
  const source = readFileSync(
    join(
      process.cwd(),
      'src/agent-gateway/social-agent-tool-executor.service.ts',
    ),
    'utf8',
  );

  it('keeps every tool enum value wired to a dispatch branch', () => {
    for (const toolKey of Object.keys(SocialAgentToolName)) {
      expect(source).toContain(`case SocialAgentToolName.${toolKey}:`);
    }
  });

  it('keeps a TypeScript exhaustiveness guard after the dispatch switch', () => {
    expect(source).toContain('assertUnreachableSocialAgentToolName(toolName)');
  });
});
