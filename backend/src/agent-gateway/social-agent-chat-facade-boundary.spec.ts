import * as fs from 'fs';
import * as path from 'path';

const servicePath = path.resolve(__dirname, 'social-agent-chat.service.ts');

describe('SocialAgentChatService facade boundary', () => {
  const source = fs.readFileSync(servicePath, 'utf8');

  it('stays thin enough to delegate chat flows to focused facades', () => {
    const lineCount = source.trim().split('\n').length;

    expect(lineCount).toBeLessThanOrEqual(160);
    expect(source).toContain('SocialAgentChatRunFacadeService');
    expect(source).toContain('SocialAgentChatTurnFacadeService');
    expect(source).toContain('SocialAgentChatSessionFacadeService');
    expect(source).toContain('SocialAgentReplanFacadeService');
  });

  it('does not import low-level repositories or tool execution dependencies', () => {
    expect(source).not.toMatch(/from ['"]typeorm['"]/);
    expect(source).not.toMatch(/InjectRepository/);
    expect(source).not.toMatch(/SocialAgentSessionQueryService/);
    expect(source).not.toMatch(/SocialAgentToolExecutorService/);
    expect(source).not.toMatch(/Repository</);
  });
});
