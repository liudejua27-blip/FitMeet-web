import * as fs from 'fs';
import * as path from 'path';

const compatibilityExportPath = path.resolve(
  __dirname,
  'social-agent-chat.service.ts',
);
const facadePath = path.resolve(
  __dirname,
  'social-agent-chat-facade.service.ts',
);
const timelinePath = path.resolve(
  __dirname,
  'social-agent-chat-timeline.presenter.ts',
);
const timelineMessagesPath = path.resolve(
  __dirname,
  'social-agent-chat-timeline-messages.presenter.ts',
);
const timelineCandidatesPath = path.resolve(
  __dirname,
  'social-agent-chat-timeline-candidates.presenter.ts',
);

describe('SocialAgentChatService facade boundary', () => {
  const compatibilitySource = fs.readFileSync(compatibilityExportPath, 'utf8');
  const facadeSource = fs.readFileSync(facadePath, 'utf8');
  const timelineSource = fs.readFileSync(timelinePath, 'utf8');
  const timelineMessagesSource = fs.readFileSync(timelineMessagesPath, 'utf8');
  const timelineCandidatesSource = fs.readFileSync(
    timelineCandidatesPath,
    'utf8',
  );

  it('keeps the legacy service module as a compatibility export', () => {
    expect(compatibilitySource.trim()).toBe(
      "export { SocialAgentChatService } from './social-agent-chat-facade.service';",
    );
  });

  it('stays thin enough to delegate chat flows to focused facades', () => {
    const lineCount = facadeSource.trim().split('\n').length;

    expect(lineCount).toBeLessThanOrEqual(160);
    expect(facadeSource).toContain('SocialAgentChatRunFacadeService');
    expect(facadeSource).toContain('SocialAgentChatTurnFacadeService');
    expect(facadeSource).toContain('SocialAgentChatSessionFacadeService');
    expect(facadeSource).toContain('SocialAgentReplanFacadeService');
  });

  it('does not import low-level repositories or tool execution dependencies', () => {
    expect(facadeSource).not.toMatch(/from ['"]typeorm['"]/);
    expect(facadeSource).not.toMatch(/InjectRepository/);
    expect(facadeSource).not.toMatch(/SocialAgentSessionQueryService/);
    expect(facadeSource).not.toMatch(/SocialAgentToolExecutorService/);
    expect(facadeSource).not.toMatch(/Repository</);
  });

  it('keeps timeline snapshot assembly split from event and candidate normalization', () => {
    expect(timelineSource.trim().split('\n').length).toBeLessThanOrEqual(90);
    expect(timelineSource).toContain('buildSocialAgentTimelineMessages');
    expect(timelineSource).toContain('readSocialAgentTimelineCandidates');
    expect(timelineMessagesSource).toContain(
      'function timelineMessageFromEvent',
    );
    expect(timelineCandidatesSource).toContain(
      'function candidateFromStoredSummary',
    );
  });
});
