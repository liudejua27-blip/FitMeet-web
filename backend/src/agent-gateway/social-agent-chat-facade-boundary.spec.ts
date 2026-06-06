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
const timelineEventsPath = path.resolve(
  __dirname,
  'social-agent-chat-timeline-events.presenter.ts',
);
const timelineActivityPath = path.resolve(
  __dirname,
  'social-agent-chat-timeline-activity.presenter.ts',
);
const timelineCandidatesPath = path.resolve(
  __dirname,
  'social-agent-chat-timeline-candidates.presenter.ts',
);
const chatLlmServicePath = path.resolve(
  __dirname,
  'social-agent-chat-llm.service.ts',
);
const chatLlmPromptsPath = path.resolve(
  __dirname,
  'social-agent-chat-llm-prompts.ts',
);
const chatFinalResponsePresenterPath = path.resolve(
  __dirname,
  'social-agent-chat-final-response.presenter.ts',
);
const runPresenterPath = path.resolve(
  __dirname,
  'social-agent-chat-run.presenter.ts',
);
const runStorePresenterPath = path.resolve(
  __dirname,
  'social-agent-chat-run-store.presenter.ts',
);
const agentGatewayServicePath = path.resolve(
  __dirname,
  'agent-gateway.service.ts',
);
const publicSocialCandidatePresenterPath = path.resolve(
  __dirname,
  'public-social-candidate.presenter.ts',
);
const publicSocialIntentPresenterPath = path.resolve(
  __dirname,
  'public-social-intent.presenter.ts',
);
const toolExecutorPath = path.resolve(
  __dirname,
  'social-agent-tool-executor.service.ts',
);
const toolStepEventsPresenterPath = path.resolve(
  __dirname,
  'social-agent-tool-step-events.presenter.ts',
);
const candidatePoolServicePath = path.resolve(
  __dirname,
  'social-agent-candidate-pool.service.ts',
);
const candidatePoolMergePath = path.resolve(
  __dirname,
  'social-agent-candidate-pool-merge.ts',
);
const runOrchestratorPath = path.resolve(
  __dirname,
  'social-agent-run-orchestrator.service.ts',
);
const runCompletionPresenterPath = path.resolve(
  __dirname,
  'social-agent-run-completion.presenter.ts',
);

describe('SocialAgentChatService facade boundary', () => {
  const compatibilitySource = fs.readFileSync(compatibilityExportPath, 'utf8');
  const facadeSource = fs.readFileSync(facadePath, 'utf8');
  const timelineSource = fs.readFileSync(timelinePath, 'utf8');
  const timelineMessagesSource = fs.readFileSync(timelineMessagesPath, 'utf8');
  const timelineEventsSource = fs.readFileSync(timelineEventsPath, 'utf8');
  const timelineActivitySource = fs.readFileSync(timelineActivityPath, 'utf8');
  const timelineCandidatesSource = fs.readFileSync(
    timelineCandidatesPath,
    'utf8',
  );
  const chatLlmServiceSource = fs.readFileSync(chatLlmServicePath, 'utf8');
  const chatLlmPromptsSource = fs.readFileSync(chatLlmPromptsPath, 'utf8');
  const chatFinalResponsePresenterSource = fs.readFileSync(
    chatFinalResponsePresenterPath,
    'utf8',
  );
  const runPresenterSource = fs.readFileSync(runPresenterPath, 'utf8');
  const runStorePresenterSource = fs.readFileSync(
    runStorePresenterPath,
    'utf8',
  );
  const agentGatewayServiceSource = fs.readFileSync(
    agentGatewayServicePath,
    'utf8',
  );
  const publicSocialCandidatePresenterSource = fs.readFileSync(
    publicSocialCandidatePresenterPath,
    'utf8',
  );
  const publicSocialIntentPresenterSource = fs.readFileSync(
    publicSocialIntentPresenterPath,
    'utf8',
  );
  const toolExecutorSource = fs.readFileSync(toolExecutorPath, 'utf8');
  const toolStepEventsPresenterSource = fs.readFileSync(
    toolStepEventsPresenterPath,
    'utf8',
  );
  const candidatePoolServiceSource = fs.readFileSync(
    candidatePoolServicePath,
    'utf8',
  );
  const candidatePoolMergeSource = fs.readFileSync(
    candidatePoolMergePath,
    'utf8',
  );
  const runOrchestratorSource = fs.readFileSync(runOrchestratorPath, 'utf8');
  const runCompletionPresenterSource = fs.readFileSync(
    runCompletionPresenterPath,
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
    expect(
      timelineMessagesSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(90);
    expect(timelineEventsSource.trim().split('\n').length).toBeLessThanOrEqual(
      180,
    );
    expect(timelineSource).toContain('buildSocialAgentTimelineMessages');
    expect(timelineSource).toContain('readSocialAgentTimelineCandidates');
    expect(timelineMessagesSource).toContain('timelineMessageFromEvent');
    expect(timelineMessagesSource).not.toContain(
      'function timelineMessageFromEvent',
    );
    expect(timelineEventsSource).toContain('function timelineMessageFromEvent');
    expect(timelineEventsSource).toContain('readSocialAgentActivityResults');
    expect(timelineActivitySource).toContain(
      'function normalizePendingApprovalSnapshot',
    );
    expect(timelineCandidatesSource).toContain(
      'function candidateFromStoredSummary',
    );
  });

  it('keeps LLM orchestration split from prompt assembly', () => {
    expect(chatLlmServiceSource.trim().split('\n').length).toBeLessThanOrEqual(
      190,
    );
    expect(chatLlmServiceSource).toContain(
      'buildSocialAgentDirectReplyMessages',
    );
    expect(chatLlmServiceSource).toContain(
      'buildSocialAgentAgentBrainMessages',
    );
    expect(chatLlmServiceSource).not.toContain('availableTools: [');
    expect(chatLlmPromptsSource).toContain(
      'function buildSocialAgentDirectReplyMessages',
    );
    expect(chatLlmPromptsSource).toContain(
      'function buildSocialAgentAgentBrainMessages',
    );
    expect(chatLlmPromptsSource).toContain(
      'readSocialAgentConversationBrainPlannedTools',
    );
  });

  it('keeps Final Response input assembly split from LLM transport', () => {
    expect(chatLlmServiceSource).toContain(
      'buildSocialAgentDirectReplyFinalResponseInput',
    );
    expect(chatLlmServiceSource).toContain(
      'buildSocialAgentAgentBrainFinalResponseInput',
    );
    expect(chatLlmServiceSource).not.toContain(
      'socialAgentFinalResponseSafetyRules',
    );
    expect(chatLlmServiceSource).not.toContain(
      'readSocialAgentCurrentAgentState',
    );
    expect(
      chatFinalResponsePresenterSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(120);
    expect(chatFinalResponsePresenterSource).toContain(
      'buildSocialAgentDirectReplyFinalResponseInput',
    );
    expect(chatFinalResponsePresenterSource).toContain(
      'buildSocialAgentAgentBrainFinalResponseInput',
    );
  });

  it('keeps async run storage normalization split from run result presentation', () => {
    expect(runPresenterSource.trim().split('\n').length).toBeLessThanOrEqual(
      100,
    );
    expect(
      runStorePresenterSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(160);
    expect(runPresenterSource).toContain(
      "from './social-agent-chat-run-store.presenter'",
    );
    expect(runPresenterSource).not.toContain(
      'function socialAgentStoredRunMap',
    );
    expect(runStorePresenterSource).toContain(
      'function socialAgentStoredRunMap',
    );
    expect(runStorePresenterSource).toContain(
      'function readSocialAgentVisibleSteps',
    );
  });

  it('keeps public social candidate scoring split from the gateway service', () => {
    expect(agentGatewayServiceSource).toContain('buildPublicSocialCandidates');
    expect(agentGatewayServiceSource).not.toContain('function haversineKm');
    expect(agentGatewayServiceSource).not.toContain(
      'parsePublicSocialTimeWindow',
    );
    expect(publicSocialCandidatePresenterSource).toContain(
      'function buildPublicSocialCandidates',
    );
    expect(
      publicSocialCandidatePresenterSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(190);
  });

  it('keeps public social intent response serialization split from the gateway service', () => {
    expect(agentGatewayServiceSource).toContain('serializePublicSocialIntent');
    expect(agentGatewayServiceSource).not.toContain(
      'private serializePublicSocialIntent',
    );
    expect(publicSocialIntentPresenterSource).toContain(
      'function serializePublicSocialIntent',
    );
    expect(publicSocialIntentPresenterSource).toContain(
      'buildPublicIntentMatchSignal',
    );
    expect(
      publicSocialIntentPresenterSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(40);
  });

  it('keeps tool step event payload assembly split from the executor', () => {
    expect(toolExecutorSource).toContain('buildSocialAgentToolReturnedEvent');
    expect(toolExecutorSource).toContain('buildSocialAgentToolFailedEvent');
    expect(toolExecutorSource).not.toContain('summary: `Called ${toolName}`');
    expect(toolExecutorSource).not.toContain(
      'summary: `${toolName} succeeded`',
    );
    expect(toolStepEventsPresenterSource).toContain(
      'function buildSocialAgentToolReturnedEvent',
    );
    expect(toolStepEventsPresenterSource).toContain(
      'function buildSocialAgentToolFailedEvent',
    );
    expect(
      toolStepEventsPresenterSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(140);
  });

  it('keeps candidate pool merge semantics split from repository orchestration', () => {
    expect(candidatePoolServiceSource).toContain(
      'mergeSocialAgentCandidatePool',
    );
    expect(candidatePoolServiceSource).not.toContain(
      'private mergeSocialCandidates',
    );
    expect(candidatePoolMergeSource).toContain(
      'function mergeSocialAgentCandidatePool',
    );
    expect(candidatePoolMergeSource).toContain('uniqueCandidatePoolStrings');
    expect(
      candidatePoolMergeSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(70);
  });

  it('keeps runtime completion status assembly split from run orchestration', () => {
    expect(runOrchestratorSource).toContain(
      'buildSocialAgentRunCompletionSnapshot',
    );
    expect(runOrchestratorSource).not.toContain(
      'result.approvalRequiredActions.length > 0',
    );
    expect(runOrchestratorSource).not.toContain('result.candidates.length > 0');
    expect(runCompletionPresenterSource).toContain(
      'function buildSocialAgentRunCompletionSnapshot',
    );
    expect(
      runCompletionPresenterSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(40);
  });
});
