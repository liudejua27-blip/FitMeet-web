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
const chatTypesPath = path.resolve(__dirname, 'social-agent-chat.types.ts');
const actionTypesPath = path.resolve(__dirname, 'social-agent-action.types.ts');
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
const socialAgentTasksControllerPath = path.resolve(
  __dirname,
  'social-agent-tasks.controller.ts',
);
const publicSocialCandidatePresenterPath = path.resolve(
  __dirname,
  'public-social-candidate.presenter.ts',
);
const publicSocialIntentPresenterPath = path.resolve(
  __dirname,
  'public-social-intent.presenter.ts',
);
const publicSocialIntentListQueryPath = path.resolve(
  __dirname,
  'public-social-intent-list-query.ts',
);
const toolExecutorPath = path.resolve(
  __dirname,
  'social-agent-tool-executor.service.ts',
);
const toolStepEventsPresenterPath = path.resolve(
  __dirname,
  'social-agent-tool-step-events.presenter.ts',
);
const toolExecutorLogPresenterPath = path.resolve(
  __dirname,
  'social-agent-tool-executor-log.presenter.ts',
);
const taskEventRecordPresenterPath = path.resolve(
  __dirname,
  'social-agent-task-event-record.presenter.ts',
);
const toolExecutionStatePath = path.resolve(
  __dirname,
  'social-agent-tool-execution-state.ts',
);
const runNextStatePath = path.resolve(
  __dirname,
  'social-agent-run-next-state.ts',
);
const taskExecutionStatePath = path.resolve(
  __dirname,
  'social-agent-task-execution-state.ts',
);
const adhocActionStatePath = path.resolve(
  __dirname,
  'social-agent-adhoc-action-state.ts',
);
const riskGatePresenterPath = path.resolve(
  __dirname,
  'social-agent-risk-gate.presenter.ts',
);
const approvalToolPresenterPath = path.resolve(
  __dirname,
  'social-agent-approval-tool.presenter.ts',
);
const currentTaskSummaryPresenterPath = path.resolve(
  __dirname,
  'social-agent-current-task-summary.presenter.ts',
);
const draftOpenerPresenterPath = path.resolve(
  __dirname,
  'social-agent-draft-opener.presenter.ts',
);
const candidateMessageActionResultPath = path.resolve(
  __dirname,
  'social-agent-candidate-message-action-result.ts',
);
const socialRequestResultPresenterPath = path.resolve(
  __dirname,
  'social-agent-social-request-result.presenter.ts',
);
const directCandidateMessageResultPresenterPath = path.resolve(
  __dirname,
  'social-agent-direct-candidate-message-result.presenter.ts',
);
const candidateConnectResultPresenterPath = path.resolve(
  __dirname,
  'social-agent-candidate-connect-result.presenter.ts',
);
const openerDraftActionPresenterPath = path.resolve(
  __dirname,
  'social-agent-opener-draft-action.presenter.ts',
);
const confirmedCandidateMessagePresenterPath = path.resolve(
  __dirname,
  'social-agent-confirmed-candidate-message.presenter.ts',
);
const candidateActionApprovalPresenterPath = path.resolve(
  __dirname,
  'social-agent-candidate-action-approval.presenter.ts',
);
const candidateMessageDraftPresenterPath = path.resolve(
  __dirname,
  'social-agent-candidate-message-draft.presenter.ts',
);
const candidatePoolServicePath = path.resolve(
  __dirname,
  'social-agent-candidate-pool.service.ts',
);
const candidatePoolMergePath = path.resolve(
  __dirname,
  'social-agent-candidate-pool-merge.ts',
);
const candidatePoolActivityResultPath = path.resolve(
  __dirname,
  'social-agent-candidate-pool-activity-result.ts',
);
const candidateRowStatePath = path.resolve(
  __dirname,
  'social-agent-candidate-row-state.ts',
);
const candidatePoolResultPresenterPath = path.resolve(
  __dirname,
  'social-agent-candidate-pool-result.presenter.ts',
);
const candidateEmotionalInsightPath = path.resolve(
  __dirname,
  'social-agent-candidate-emotional-insight.ts',
);
const candidateReasonsPath = path.resolve(
  __dirname,
  'social-agent-candidate-reasons.ts',
);
const candidateRiskPath = path.resolve(
  __dirname,
  'social-agent-candidate-risk.ts',
);
const candidateDisplayFieldsPath = path.resolve(
  __dirname,
  'social-agent-candidate-display-fields.ts',
);
const candidateIdentityFieldsPath = path.resolve(
  __dirname,
  'social-agent-candidate-identity-fields.ts',
);
const candidateScoreBreakdownPath = path.resolve(
  __dirname,
  'social-agent-candidate-score-breakdown.ts',
);
const candidateCardPresenterPath = path.resolve(
  __dirname,
  'social-agent-candidate-card.presenter.ts',
);
const candidatePoolEligibilityPath = path.resolve(
  __dirname,
  'social-agent-candidate-pool-eligibility.ts',
);
const runOrchestratorPath = path.resolve(
  __dirname,
  'social-agent-run-orchestrator.service.ts',
);
const runCompletionPresenterPath = path.resolve(
  __dirname,
  'social-agent-run-completion.presenter.ts',
);
const routeTurnPath = path.resolve(
  __dirname,
  'social-agent-route-turn.service.ts',
);
const routeAgentLoopRunnerPath = path.resolve(
  __dirname,
  'social-agent-route-agent-loop-runner.service.ts',
);
const chatTurnFacadePath = path.resolve(
  __dirname,
  'social-agent-chat-turn-facade.service.ts',
);
const chatTurnCallbacksPath = path.resolve(
  __dirname,
  'social-agent-chat-turn-callbacks.service.ts',
);
const routeResponsePresenterPath = path.resolve(
  __dirname,
  'social-agent-route-response.presenter.ts',
);
const fitnessMathReplyPath = path.resolve(
  __dirname,
  'social-agent-fitness-math-reply.ts',
);
const intentRouterPath = path.resolve(
  __dirname,
  'social-agent-intent-router.service.ts',
);
const intentNormalizationPath = path.resolve(
  __dirname,
  'social-agent-intent-normalization.ts',
);
const brainServicePath = path.resolve(
  __dirname,
  'social-agent-brain.service.ts',
);
const brainPlannerNormalizationPath = path.resolve(
  __dirname,
  'social-agent-brain-planner-normalization.ts',
);
const profileSearchBoundaryPath = path.resolve(
  __dirname,
  'social-agent-profile-search-boundary.ts',
);
const profileNextStepReplyPath = path.resolve(
  __dirname,
  'social-agent-profile-next-step-reply.ts',
);
const routeProfileTurnPath = path.resolve(
  __dirname,
  'social-agent-route-profile-turn.service.ts',
);
const alphaAgentSdkPath = path.resolve(
  __dirname,
  'fitmeet-alpha-agent-sdk.service.ts',
);
const alphaStructuredIntentPath = path.resolve(
  __dirname,
  'fitmeet-alpha-structured-intent.ts',
);
const candidateActionServicePath = path.resolve(
  __dirname,
  'social-agent-candidate-action.service.ts',
);
const agentGatewayModulePath = path.resolve(
  __dirname,
  'agent-gateway.module.ts',
);

describe('SocialAgentChatService facade boundary', () => {
  const compatibilitySource = fs.readFileSync(compatibilityExportPath, 'utf8');
  const facadeSource = fs.readFileSync(facadePath, 'utf8');
  const chatTypesSource = fs.readFileSync(chatTypesPath, 'utf8');
  const actionTypesSource = fs.readFileSync(actionTypesPath, 'utf8');
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
  const socialAgentTasksControllerSource = fs.readFileSync(
    socialAgentTasksControllerPath,
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
  const publicSocialIntentListQuerySource = fs.readFileSync(
    publicSocialIntentListQueryPath,
    'utf8',
  );
  const toolExecutorSource = fs.readFileSync(toolExecutorPath, 'utf8');
  const toolStepEventsPresenterSource = fs.readFileSync(
    toolStepEventsPresenterPath,
    'utf8',
  );
  const toolExecutorLogPresenterSource = fs.readFileSync(
    toolExecutorLogPresenterPath,
    'utf8',
  );
  const taskEventRecordPresenterSource = fs.readFileSync(
    taskEventRecordPresenterPath,
    'utf8',
  );
  const toolExecutionStateSource = fs.readFileSync(
    toolExecutionStatePath,
    'utf8',
  );
  const runNextStateSource = fs.readFileSync(runNextStatePath, 'utf8');
  const taskExecutionStateSource = fs.readFileSync(
    taskExecutionStatePath,
    'utf8',
  );
  const adhocActionStateSource = fs.readFileSync(adhocActionStatePath, 'utf8');
  const riskGatePresenterSource = fs.readFileSync(
    riskGatePresenterPath,
    'utf8',
  );
  const approvalToolPresenterSource = fs.readFileSync(
    approvalToolPresenterPath,
    'utf8',
  );
  const currentTaskSummaryPresenterSource = fs.readFileSync(
    currentTaskSummaryPresenterPath,
    'utf8',
  );
  const draftOpenerPresenterSource = fs.readFileSync(
    draftOpenerPresenterPath,
    'utf8',
  );
  const candidateMessageActionResultSource = fs.readFileSync(
    candidateMessageActionResultPath,
    'utf8',
  );
  const socialRequestResultPresenterSource = fs.readFileSync(
    socialRequestResultPresenterPath,
    'utf8',
  );
  const directCandidateMessageResultPresenterSource = fs.readFileSync(
    directCandidateMessageResultPresenterPath,
    'utf8',
  );
  const candidateConnectResultPresenterSource = fs.readFileSync(
    candidateConnectResultPresenterPath,
    'utf8',
  );
  const openerDraftActionPresenterSource = fs.readFileSync(
    openerDraftActionPresenterPath,
    'utf8',
  );
  const confirmedCandidateMessagePresenterSource = fs.readFileSync(
    confirmedCandidateMessagePresenterPath,
    'utf8',
  );
  const candidateActionApprovalPresenterSource = fs.readFileSync(
    candidateActionApprovalPresenterPath,
    'utf8',
  );
  const candidateMessageDraftPresenterSource = fs.readFileSync(
    candidateMessageDraftPresenterPath,
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
  const candidatePoolActivityResultSource = fs.readFileSync(
    candidatePoolActivityResultPath,
    'utf8',
  );
  const candidateRowStateSource = fs.readFileSync(
    candidateRowStatePath,
    'utf8',
  );
  const candidatePoolResultPresenterSource = fs.readFileSync(
    candidatePoolResultPresenterPath,
    'utf8',
  );
  const candidateEmotionalInsightSource = fs.readFileSync(
    candidateEmotionalInsightPath,
    'utf8',
  );
  const candidateReasonsSource = fs.readFileSync(candidateReasonsPath, 'utf8');
  const candidateRiskSource = fs.readFileSync(candidateRiskPath, 'utf8');
  const candidateDisplayFieldsSource = fs.readFileSync(
    candidateDisplayFieldsPath,
    'utf8',
  );
  const candidateIdentityFieldsSource = fs.readFileSync(
    candidateIdentityFieldsPath,
    'utf8',
  );
  const candidateScoreBreakdownSource = fs.readFileSync(
    candidateScoreBreakdownPath,
    'utf8',
  );
  const candidateCardPresenterSource = fs.readFileSync(
    candidateCardPresenterPath,
    'utf8',
  );
  const candidatePoolEligibilitySource = fs.readFileSync(
    candidatePoolEligibilityPath,
    'utf8',
  );
  const runOrchestratorSource = fs.readFileSync(runOrchestratorPath, 'utf8');
  const runCompletionPresenterSource = fs.readFileSync(
    runCompletionPresenterPath,
    'utf8',
  );
  const routeTurnSource = fs.readFileSync(routeTurnPath, 'utf8');
  const routeAgentLoopRunnerSource = fs.readFileSync(
    routeAgentLoopRunnerPath,
    'utf8',
  );
  const chatTurnFacadeSource = fs.readFileSync(chatTurnFacadePath, 'utf8');
  const chatTurnCallbacksSource = fs.readFileSync(
    chatTurnCallbacksPath,
    'utf8',
  );
  const routeResponsePresenterSource = fs.readFileSync(
    routeResponsePresenterPath,
    'utf8',
  );
  const fitnessMathReplySource = fs.readFileSync(fitnessMathReplyPath, 'utf8');
  const intentRouterSource = fs.readFileSync(intentRouterPath, 'utf8');
  const intentNormalizationSource = fs.readFileSync(
    intentNormalizationPath,
    'utf8',
  );
  const brainServiceSource = fs.readFileSync(brainServicePath, 'utf8');
  const brainPlannerNormalizationSource = fs.readFileSync(
    brainPlannerNormalizationPath,
    'utf8',
  );
  const profileSearchBoundarySource = fs.readFileSync(
    profileSearchBoundaryPath,
    'utf8',
  );
  const profileNextStepReplySource = fs.readFileSync(
    profileNextStepReplyPath,
    'utf8',
  );
  const routeProfileTurnSource = fs.readFileSync(routeProfileTurnPath, 'utf8');
  const alphaAgentSdkSource = fs.readFileSync(alphaAgentSdkPath, 'utf8');
  const alphaStructuredIntentSource = fs.readFileSync(
    alphaStructuredIntentPath,
    'utf8',
  );
  const candidateActionServiceSource = fs.readFileSync(
    candidateActionServicePath,
    'utf8',
  );
  const agentGatewayModuleSource = fs.readFileSync(
    agentGatewayModulePath,
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

  it('keeps card and candidate action request bodies split from chat session types', () => {
    expect(chatTypesSource).not.toContain('CandidateTargetBody');
    expect(chatTypesSource).not.toContain('SocialAgentCardActionBody');
    expect(chatTypesSource).not.toContain('FitMeetAgentSchemaAction');
    expect(actionTypesSource).toContain('export type CandidateTargetBody');
    expect(actionTypesSource).toContain(
      'export type SocialAgentCardActionBody',
    );
    expect(actionTypesSource.trim().split('\n').length).toBeLessThanOrEqual(25);
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
    // L5 streaming adds AbortSignal propagation and model fallback wiring here;
    // keep the budget explicit while preserving prompt-assembly separation.
    expect(chatLlmServiceSource.trim().split('\n').length).toBeLessThanOrEqual(
      380,
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
    ).toBeLessThanOrEqual(130);
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
    ).toBeLessThanOrEqual(260);
  });

  it('keeps public social intent response serialization split from the gateway service', () => {
    expect(agentGatewayServiceSource).toContain('serializePublicSocialIntent');
    expect(agentGatewayServiceSource).not.toContain(
      'private serializePublicSocialIntent',
    );
    expect(publicSocialIntentPresenterSource).toContain(
      'function serializePublicSocialIntent',
    );
    expect(
      publicSocialIntentPresenterSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(65);
  });

  it('keeps public social intent list filter normalization split from the gateway service', () => {
    expect(agentGatewayServiceSource).toContain(
      'normalizePublicSocialIntentListFilters',
    );
    expect(agentGatewayServiceSource).not.toContain(
      'Math.min(Math.max(Number(filters.limit)',
    );
    expect(publicSocialIntentListQuerySource).toContain(
      'function normalizePublicSocialIntentListFilters',
    );
    expect(publicSocialIntentListQuerySource).toContain('sanitizeCity');
    expect(
      publicSocialIntentListQuerySource.trim().split('\n').length,
    ).toBeLessThanOrEqual(55);
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

  it('keeps tool executor failure log payloads split from execution flow', () => {
    expect(toolExecutorSource).toContain(
      'buildSocialAgentToolFailureLogPayload',
    );
    expect(toolExecutorSource).toContain(
      'buildSocialAgentTaskFailureLogPayload',
    );
    expect(toolExecutorSource).not.toContain("event: 'agent.task.tool_failed'");
    expect(toolExecutorSource).not.toContain("event: 'agent.task.failed'");
    expect(toolExecutorLogPresenterSource).toContain(
      'function buildSocialAgentToolFailureLogPayload',
    );
    expect(toolExecutorLogPresenterSource).toContain(
      'function buildSocialAgentTaskFailureLogPayload',
    );
    expect(
      toolExecutorLogPresenterSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(50);
  });

  it('keeps task event record assembly split from tool execution flow', () => {
    expect(toolExecutorSource).toContain('buildSocialAgentTaskEventRecord');
    expect(toolExecutorSource).not.toContain(
      'type === AgentTaskEventType.ToolReturned',
    );
    expect(toolExecutorSource).not.toContain('actor: this.toolCallFactory');
    expect(taskEventRecordPresenterSource).toContain(
      'function buildSocialAgentTaskEventRecord',
    );
    expect(taskEventRecordPresenterSource).toContain(
      'function socialAgentTaskEventActor',
    );
    expect(
      taskEventRecordPresenterSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(55);
  });

  it('keeps task tool-call state writes split from tool execution flow', () => {
    expect(toolExecutorSource).toContain('applySocialAgentPlanStepCallToTask');
    expect(toolExecutorSource).toContain('appendSocialAgentToolCallToTask');
    expect(toolExecutorSource).not.toContain(
      'lastToolCall: call,\\n        updatedAt: new Date().toISOString()',
    );
    expect(toolExecutionStateSource).toContain(
      'function appendSocialAgentToolCallToTask',
    );
    expect(toolExecutionStateSource).toContain(
      'function applySocialAgentPlanStepCallToTask',
    );
    expect(
      toolExecutionStateSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(40);
  });

  it('keeps run-next pollable state reasons split from tool execution flow', () => {
    expect(toolExecutorSource).toContain('socialAgentRunNextReadReplyState');
    expect(toolExecutorSource).toContain('socialAgentRunNextActionState');
    expect(toolExecutorSource).not.toContain("'no_new_reply'");
    expect(toolExecutorSource).not.toContain("'reply_summary_failed'");
    expect(toolExecutorSource).not.toContain(
      "'next_action_executed_waiting_reply'",
    );
    expect(runNextStateSource).toContain(
      'function socialAgentRunNextReadReplyState',
    );
    expect(runNextStateSource).toContain(
      'function socialAgentRunNextActionState',
    );
    expect(runNextStateSource).toContain('next_action_needs_attention');
    expect(runNextStateSource.trim().split('\n').length).toBeLessThanOrEqual(
      70,
    );
  });

  it('keeps public task run-next and adhoc tool endpoints behind the unified AgentLoop executor', () => {
    expect(socialAgentTasksControllerSource).toContain(
      'return this.executor.runNext(id, req.user.id)',
    );
    expect(socialAgentTasksControllerSource).toContain(
      'return this.executor.executeToolAction(',
    );
    expect(socialAgentTasksControllerSource).not.toContain('runNextInternal(');
    expect(socialAgentTasksControllerSource).not.toContain(
      'executeToolActionInternal(',
    );
    expect(toolExecutorSource).toMatch(
      /async runNext[\s\S]*?loopService\.execute\(/,
    );
    expect(toolExecutorSource).toMatch(
      /async executeToolAction[\s\S]*?loopService\.execute\(/,
    );
    expect(toolExecutorSource).toContain(
      'run-next must pass through the unified AgentLoop.',
    );
    expect(toolExecutorSource).toContain(
      'Adhoc task tool actions must enter the unified AgentLoop',
    );
  });

  it('keeps task execution failure and completion state split from tool flow', () => {
    expect(toolExecutorSource).toContain('socialAgentTaskFailureState');
    expect(toolExecutorSource).toContain('socialAgentTaskCompletionState');
    expect(toolExecutorSource).not.toContain("'waiting_for_counterpart_reply'");
    expect(taskExecutionStateSource).toContain(
      'function socialAgentTaskFailureState',
    );
    expect(taskExecutionStateSource).toContain(
      'function socialAgentTaskCompletionState',
    );
    expect(taskExecutionStateSource).toContain('waiting_for_counterpart_reply');
    expect(
      taskExecutionStateSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(55);
  });

  it('keeps adhoc action pollable state reasons split from tool flow', () => {
    expect(toolExecutorSource).toContain(
      'socialAgentAdhocActionCompletionState',
    );
    expect(toolExecutorSource).toContain(
      'socialAgentUnconfirmedAdhocActionState',
    );
    expect(toolExecutorSource).not.toContain("'action_executed_waiting_reply'");
    expect(toolExecutorSource).not.toContain(
      "'action_executed_waiting_result'",
    );
    expect(toolExecutorSource).not.toContain("'approval_required'");
    expect(adhocActionStateSource).toContain(
      'function socialAgentAdhocActionCompletionState',
    );
    expect(adhocActionStateSource).toContain(
      'function socialAgentUnconfirmedAdhocActionState',
    );
    expect(adhocActionStateSource).toContain('approval_required');
    expect(
      adhocActionStateSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(70);
  });

  it('keeps risk gate approval payload assembly split from tool flow', () => {
    expect(toolExecutorSource).toContain('buildSocialAgentRiskGateDecision');
    expect(toolExecutorSource).toContain(
      'buildSocialAgentPendingApprovalOutput',
    );
    expect(toolExecutorSource).not.toContain('policy.blockedActions.includes');
    expect(toolExecutorSource).not.toContain("status: 'pending_approval'");
    expect(toolExecutorSource).not.toContain(
      "message: '实验室模式只模拟，不会真实执行这个社交动作。'",
    );
    expect(riskGatePresenterSource).toContain(
      'function buildSocialAgentRiskGateDecision',
    );
    expect(riskGatePresenterSource).toContain(
      'function buildSocialAgentPendingApprovalOutput',
    );
    expect(riskGatePresenterSource).toContain('pending_approval');
    expect(
      riskGatePresenterSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(180);
  });

  it('keeps approval tool input/output normalization split from tool flow', () => {
    expect(toolExecutorSource).toContain('readSocialAgentApprovalToolId');
    expect(toolExecutorSource).toContain(
      'buildSocialAgentPendingApprovalsToolOutput',
    );
    expect(toolExecutorSource).not.toContain(
      "throw new BadRequestException('approvalId is required')",
    );
    expect(approvalToolPresenterSource).toContain(
      'function readSocialAgentApprovalToolId',
    );
    expect(approvalToolPresenterSource).toContain(
      'function buildSocialAgentPendingApprovalsToolOutput',
    );
    expect(
      approvalToolPresenterSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(25);
  });

  it('keeps current task summary output split from tool flow', () => {
    expect(toolExecutorSource).toContain('buildSocialAgentCurrentTaskSummary');
    expect(toolExecutorSource).toContain(
      'shouldPersistSocialAgentCurrentTaskSummary',
    );
    expect(toolExecutorSource).not.toContain('plan.slice(-10)');
    expect(toolExecutorSource).not.toContain('recentToolCalls:');
    expect(currentTaskSummaryPresenterSource).toContain(
      'function buildSocialAgentCurrentTaskSummary',
    );
    expect(currentTaskSummaryPresenterSource).toContain('recentToolCalls');
    expect(currentTaskSummaryPresenterSource).toContain(
      'function shouldPersistSocialAgentCurrentTaskSummary',
    );
    expect(
      currentTaskSummaryPresenterSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(45);
  });

  it('keeps draft-opener confirmation output split from tool flow', () => {
    expect(toolExecutorSource).toContain('buildSocialAgentDraftOpenerResult');
    expect(toolExecutorSource).not.toContain("meetLoopStage: 'opener_drafted'");
    expect(toolExecutorSource).not.toContain(
      '确认前不会发送、加好友或创建活动',
    );
    expect(draftOpenerPresenterSource).toContain(
      'function buildSocialAgentDraftOpenerResult',
    );
    expect(draftOpenerPresenterSource).toContain(
      "meetLoopStage: 'opener_drafted'",
    );
    expect(draftOpenerPresenterSource).toContain(
      '确认前不会发送、加好友或创建活动',
    );
    expect(
      draftOpenerPresenterSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(35);
  });

  it('keeps candidate message action output split from tool flow', () => {
    expect(toolExecutorSource).toContain(
      'buildSocialAgentCandidateMessageActionResult',
    );
    expect(toolExecutorSource).not.toContain('messageAction: {');
    expect(toolExecutorSource).not.toContain(
      "status: output.skipped ? 'skipped' : 'sent'",
    );
    expect(candidateMessageActionResultSource).toContain(
      'function buildSocialAgentCandidateMessageActionResult',
    );
    expect(candidateMessageActionResultSource).toContain('messageAction');
    expect(candidateMessageActionResultSource).toContain(
      "input.output.skipped ? 'skipped' : 'sent'",
    );
    expect(
      candidateMessageActionResultSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(45);
  });

  it('keeps social request result output split from tool flow', () => {
    expect(toolExecutorSource).toContain('buildSocialAgentSocialRequestResult');
    expect(toolExecutorSource).not.toContain('socialRequestId: request.id');
    expect(toolExecutorSource).not.toContain(
      'publicIntentStatus: publicIntent.status',
    );
    expect(toolExecutorSource).not.toContain('synced: true');
    expect(socialRequestResultPresenterSource).toContain(
      'function buildSocialAgentSocialRequestResult',
    );
    expect(socialRequestResultPresenterSource).toContain(
      'socialRequestId: input.request.id',
    );
    expect(socialRequestResultPresenterSource).toContain('synced: true');
    expect(
      socialRequestResultPresenterSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(35);
  });

  it('keeps direct candidate message result output split from candidate action flow', () => {
    expect(candidateActionServiceSource).toContain(
      'buildSocialAgentDirectCandidateMessageResult',
    );
    expect(candidateActionServiceSource).not.toContain('messageAction: {');
    expect(candidateActionServiceSource).not.toContain(
      'candidateStatus: cleanDisplayText',
    );
    expect(candidateActionServiceSource).not.toContain(
      "message: requiresApproval ? '发送消息需要你确认' : undefined",
    );
    expect(directCandidateMessageResultPresenterSource).toContain(
      'function buildSocialAgentDirectCandidateMessageResult',
    );
    expect(directCandidateMessageResultPresenterSource).toContain(
      'messageAction',
    );
    expect(directCandidateMessageResultPresenterSource).toContain(
      '发送消息需要你确认',
    );
    expect(
      directCandidateMessageResultPresenterSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(80);
  });

  it('keeps candidate connect result output split from candidate action flow', () => {
    expect(candidateActionServiceSource).toContain(
      'buildSocialAgentCandidateConnectResult',
    );
    expect(candidateActionServiceSource).not.toContain('friendAction: {');
    expect(candidateActionServiceSource).not.toContain(
      '加好友/连接候选人需要你确认',
    );
    expect(candidateActionServiceSource).not.toContain('friendRequestId ??');
    expect(candidateConnectResultPresenterSource).toContain(
      'function buildSocialAgentCandidateConnectResult',
    );
    expect(candidateConnectResultPresenterSource).toContain('friendAction');
    expect(candidateConnectResultPresenterSource).toContain(
      '加好友并聊天需要你确认',
    );
    expect(candidateConnectResultPresenterSource).toContain(
      'output.friendRequestId ?? output.followId ?? output.id',
    );
    expect(
      candidateConnectResultPresenterSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(100);
  });

  it('keeps opener draft approval state split from candidate action flow', () => {
    expect(candidateActionServiceSource).toContain(
      'buildSocialAgentOpenerDraftApprovalInput',
    );
    expect(candidateActionServiceSource).toContain(
      'buildSocialAgentOpenerDraftState',
    );
    expect(candidateActionServiceSource).not.toContain(
      "source: 'agent_card_action'",
    );
    expect(candidateActionServiceSource).not.toContain(
      "nextStep: '等待你确认是否发送开场白'",
    );
    expect(candidateActionServiceSource).not.toContain(
      '我先帮你写了一条低压力的开场白',
    );
    expect(openerDraftActionPresenterSource).toContain(
      'function buildSocialAgentOpenerDraftApprovalInput',
    );
    expect(openerDraftActionPresenterSource).toContain(
      'function buildSocialAgentOpenerDraftState',
    );
    expect(openerDraftActionPresenterSource).toContain(
      "source: 'agent_card_action'",
    );
    expect(openerDraftActionPresenterSource).toContain(
      '我先帮你写了一条低压力的开场白',
    );
    expect(
      openerDraftActionPresenterSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(130);
  });

  it('keeps confirmed candidate message state split from candidate action flow', () => {
    expect(candidateActionServiceSource).toContain(
      'buildSocialAgentConfirmedCandidateMessageState',
    );
    expect(candidateActionServiceSource).not.toContain(
      'output.id ?? output.messageId',
    );
    expect(candidateActionServiceSource).not.toContain(
      "nextStep: '等待候选人回复'",
    );
    expect(candidateActionServiceSource).not.toContain('已确认发送给');
    expect(confirmedCandidateMessagePresenterSource).toContain(
      'function buildSocialAgentConfirmedCandidateMessageState',
    );
    expect(confirmedCandidateMessagePresenterSource).toContain(
      'output.id ?? output.messageId',
    );
    expect(confirmedCandidateMessagePresenterSource).toContain(
      "nextStep: '等待候选人回复'",
    );
    expect(confirmedCandidateMessagePresenterSource).toContain('已确认发送给');
    expect(
      confirmedCandidateMessagePresenterSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(55);
  });

  it('keeps natural-language candidate action approval split from candidate action flow', () => {
    expect(candidateActionServiceSource).toContain(
      'buildSocialAgentCandidateActionApprovalInput',
    );
    expect(candidateActionServiceSource).toContain(
      'buildSocialAgentCandidateActionApprovalState',
    );
    expect(candidateActionServiceSource).not.toContain(
      "source: 'social_agent_chat'",
    );
    expect(candidateActionServiceSource).not.toContain(
      "waitingFor: 'action_confirmation'",
    );
    expect(candidateActionServiceSource).not.toContain(
      '/(加好友|关注|加微信|加联系方式)/',
    );
    expect(candidateActionApprovalPresenterSource).toContain(
      'function buildSocialAgentCandidateActionApprovalInput',
    );
    expect(candidateActionApprovalPresenterSource).toContain(
      'function buildSocialAgentCandidateActionApprovalState',
    );
    expect(candidateActionApprovalPresenterSource).toContain(
      "source: 'social_agent_chat'",
    );
    expect(candidateActionApprovalPresenterSource).toContain(
      "waitingFor: 'action_confirmation'",
    );
    expect(candidateActionApprovalPresenterSource).toContain(
      '/(加好友|关注|加微信|加联系方式)/',
    );
    // The presenter owns Social Codex runtime-context summaries; the action
    // service must stay free of approval copy and regex inference.
    expect(
      candidateActionApprovalPresenterSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(220);
  });

  it('keeps candidate message draft selection split from candidate action flow', () => {
    expect(candidateActionServiceSource).toContain(
      'buildSocialAgentCandidateMessageDraft',
    );
    expect(candidateActionServiceSource).toContain(
      'readSocialAgentCardActionDraftCandidate',
    );
    expect(candidateActionServiceSource).not.toContain('你好，看到你也在附近');
    expect(candidateActionServiceSource).not.toContain(
      'candidate?.suggestedMessage',
    );
    expect(candidateMessageDraftPresenterSource).toContain(
      'function buildSocialAgentCandidateMessageDraft',
    );
    expect(candidateMessageDraftPresenterSource).toContain(
      'function readSocialAgentCardActionDraftCandidate',
    );
    expect(candidateMessageDraftPresenterSource).toContain(
      '你好，看到你也在附近',
    );
    expect(candidateMessageDraftPresenterSource).toContain('suggestedMessage');
    expect(
      candidateMessageDraftPresenterSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(35);
  });

  it('keeps DeepSeek intent output normalization split from router transport', () => {
    expect(intentRouterSource).toContain('normalizeDeepSeekIntentRouterResult');
    expect(intentRouterSource).not.toContain(
      'function normalizeReplyStrategyForIntent',
    );
    expect(intentRouterSource).not.toContain('private normalizeDeepSeekResult');
    expect(intentRouterSource).not.toContain('const rawShouldSearch');
    expect(intentNormalizationSource).toContain(
      'function normalizeReplyStrategyForIntent',
    );
    expect(intentNormalizationSource).toContain('const rawShouldSearch');
    expect(
      intentNormalizationSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(170);
  });

  it('keeps brain planner output and tool normalization split from planner transport', () => {
    expect(brainServiceSource).toContain('normalizeSocialAgentBrainLlmPlan');
    expect(brainServiceSource).toContain(
      'normalizeSocialAgentBrainPlannedTools',
    );
    expect(brainServiceSource).not.toContain('private normalizeLlmPlan');
    expect(brainServiceSource).not.toContain('private normalizePlannedTools');
    expect(brainServiceSource).not.toContain('canonicalToolName');
    expect(brainPlannerNormalizationSource).toContain(
      'function canonicalBrainToolName',
    );
    expect(brainPlannerNormalizationSource).toContain(
      'function isToolAllowedForIntent',
    );
    expect(brainPlannerNormalizationSource).toContain(
      'const executableBrainToolNames',
    );
    expect(
      brainPlannerNormalizationSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(170);
  });

  it('keeps Life Graph versus Social Search command boundary split from router heuristics', () => {
    expect(intentRouterSource).toContain(
      'hasSocialAgentImmediateSearchRequest',
    );
    expect(brainServiceSource).toContain(
      'hasSocialAgentImmediateSearchRequest',
    );
    expect(profileSearchBoundarySource).toContain(
      'function hasSocialAgentImmediateSearchRequest',
    );
    expect(profileSearchBoundarySource).toContain('现在|马上|立即|直接|先');
    expect(profileSearchBoundarySource).toContain('真实用户|候选人|候选');
    expect(
      profileSearchBoundarySource.trim().split('\n').length,
    ).toBeLessThanOrEqual(30);
  });

  it('keeps profile-save next-step copy split from profile route persistence', () => {
    expect(routeProfileTurnSource).toContain(
      'buildSocialAgentProfileSavedNextStepReply',
    );
    expect(routeProfileTurnSource).not.toContain('我不会自动开始找人');
    expect(routeProfileTurnSource).not.toContain(
      '不会自动发送消息、加好友或创建活动',
    );
    expect(profileNextStepReplySource).toContain(
      'function buildSocialAgentProfileSavedNextStepReply',
    );
    expect(profileNextStepReplySource).toContain('我不会自动开始找人');
    expect(profileNextStepReplySource).toContain('现在开始搜索');
    expect(
      profileNextStepReplySource.trim().split('\n').length,
    ).toBeLessThanOrEqual(35);
  });

  it('keeps Alpha structured intent handoff clamps split from SDK transport', () => {
    expect(alphaAgentSdkSource).toContain(
      'normalizeFitMeetAlphaStructuredIntentOutput',
    );
    expect(alphaAgentSdkSource).toContain(
      'enforceFitMeetAlphaStructuredIntentHandoff',
    );
    expect(alphaAgentSdkSource).not.toContain(
      'private normalizeStructuredIntent',
    );
    expect(alphaAgentSdkSource).not.toContain(
      'function nextAgentForStructuredIntent',
    );
    expect(alphaStructuredIntentSource).toContain(
      'function nextAgentForStructuredIntent',
    );
    expect(alphaStructuredIntentSource).toContain(
      "intent.intent === 'fitness_math'",
    );
    expect(alphaStructuredIntentSource).toContain("return 'agent_brain'");
    expect(
      alphaStructuredIntentSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(170);
  });

  it('keeps deterministic Fitness Math replies split from route response flow', () => {
    expect(routeResponsePresenterSource).toContain(
      'socialAgentFitnessMathReply',
    );
    expect(routeResponsePresenterSource).not.toContain(
      'function readDistanceMinutes',
    );
    expect(routeResponsePresenterSource).not.toContain(
      'function readBmiEstimate',
    );
    expect(routeResponsePresenterSource).not.toContain(
      'function readHeartRateZones',
    );
    expect(routeResponsePresenterSource).not.toContain(
      'function readTrainingLoad',
    );
    expect(fitnessMathReplySource).toContain('function readDistanceMinutes');
    expect(fitnessMathReplySource).toContain('function readBmiEstimate');
    expect(fitnessMathReplySource).toContain('function readHeartRateZones');
    expect(fitnessMathReplySource).toContain('function readTrainingLoad');
    expect(
      fitnessMathReplySource.trim().split('\n').length,
    ).toBeLessThanOrEqual(230);
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

  it('keeps candidate pool activity card scoring split from repository orchestration', () => {
    expect(candidatePoolServiceSource).toContain(
      'buildCandidatePoolActivityResult',
    );
    expect(candidatePoolServiceSource).toContain(
      'buildCandidatePoolPublicIntentActivityResult',
    );
    expect(candidatePoolServiceSource).not.toContain(
      'const cityScore = candidateCityMatches(query.city',
    );
    expect(candidatePoolServiceSource).not.toContain("source: 'activity',");
    expect(candidatePoolServiceSource).not.toContain('activityId: activity.id');
    expect(candidatePoolServiceSource).not.toContain('activity.startTime');
    expect(candidatePoolServiceSource).not.toContain('activity.locationName');
    expect(candidatePoolActivityResultSource).toContain(
      'function buildCandidatePoolActivityResult',
    );
    expect(candidatePoolActivityResultSource).toContain(
      'function buildCandidatePoolPublicIntentActivityResult',
    );
    expect(candidatePoolActivityResultSource).toContain(
      'function buildCandidatePoolActivityReasons',
    );
    expect(
      candidatePoolActivityResultSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(230);
  });

  it('keeps candidate row persistence field mapping split from repository orchestration', () => {
    expect(candidatePoolServiceSource).toContain(
      'applySocialAgentCandidateRowState',
    );
    expect(candidatePoolServiceSource).toContain(
      'applySavedSocialAgentCandidateRow',
    );
    expect(candidatePoolServiceSource).not.toContain(
      'row.score = candidate.matchScore',
    );
    expect(candidatePoolServiceSource).not.toContain(
      'candidate.candidateRecordId = saved.id',
    );
    expect(candidateRowStateSource).toContain(
      'function applySocialAgentCandidateRowState',
    );
    expect(candidateRowStateSource).toContain(
      'function applySavedSocialAgentCandidateRow',
    );
    expect(candidateRowStateSource).toContain(
      'SocialRequestCandidateStatus.Suggested',
    );
    expect(
      candidateRowStateSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(55);
  });

  it('keeps candidate pool result envelope assembly split from repository orchestration', () => {
    expect(candidatePoolServiceSource).toContain(
      'buildCandidatePoolSearchResult',
    );
    expect(candidatePoolServiceSource).toContain(
      'buildCandidatePoolActivitySearchResult',
    );
    expect(candidatePoolServiceSource).not.toContain(
      'emptyReason: candidates.length === 0',
    );
    expect(candidatePoolServiceSource).not.toContain(
      'emptyReason: activityResults.length === 0',
    );
    expect(candidatePoolResultPresenterSource).toContain(
      'function buildCandidatePoolSearchResult',
    );
    expect(candidatePoolResultPresenterSource).toContain(
      'function buildCandidatePoolActivitySearchResult',
    );
    expect(
      candidatePoolResultPresenterSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(80);
  });

  it('keeps candidate emotional insight copy split from repository orchestration', () => {
    expect(candidateCardPresenterSource).toContain(
      'buildCandidateEmotionalInsight',
    );
    expect(candidatePoolServiceSource).not.toContain(
      'private emotionalInsightFromExplanation',
    );
    expect(candidatePoolServiceSource).not.toContain(
      'TA 和这次需求有可对齐的地方',
    );
    expect(candidateEmotionalInsightSource).toContain(
      'function buildCandidateEmotionalInsight',
    );
    expect(candidateEmotionalInsightSource).toContain(
      'TA 和这次需求有可对齐的地方',
    );
    expect(
      candidateEmotionalInsightSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(30);
  });

  it('keeps candidate match reason copy split from repository orchestration', () => {
    expect(candidatePoolServiceSource).toContain(
      'buildProfileCandidateReasons',
    );
    expect(candidatePoolServiceSource).toContain(
      'buildPublicIntentCandidateReasons',
    );
    expect(candidatePoolServiceSource).not.toContain('private profileReasons');
    expect(candidatePoolServiceSource).not.toContain(
      'private publicIntentReasons',
    );
    expect(candidatePoolServiceSource).not.toContain(
      '来自真实注册用户和社交画像',
    );
    expect(candidateReasonsSource).toContain(
      'function buildProfileCandidateReasons',
    );
    expect(candidateReasonsSource).toContain(
      'function buildPublicIntentCandidateReasons',
    );
    expect(candidateReasonsSource).toContain('来自真实注册用户和社交画像');
    expect(
      candidateReasonsSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(70);
  });

  it('keeps candidate risk copy and level mapping split from repository orchestration', () => {
    expect(candidateCardPresenterSource).toContain(
      'buildCandidateRiskSnapshot',
    );
    expect(candidateCardPresenterSource).toContain('firstCandidateRiskWarning');
    expect(candidatePoolServiceSource).not.toContain(
      'buildCandidateRiskSnapshot',
    );
    expect(candidatePoolServiceSource).not.toContain(
      'private candidateRiskLevel',
    );
    expect(candidatePoolServiceSource).not.toContain(
      '资料较少，建议先站内沟通确认',
    );
    expect(candidateRiskSource).toContain(
      'function buildCandidateRiskSnapshot',
    );
    expect(candidateRiskSource).toContain(
      'function candidateRiskLevelFromSceneRisk',
    );
    expect(candidateRiskSource).toContain('资料较少，建议先站内沟通确认');
    expect(candidateRiskSource.trim().split('\n').length).toBeLessThanOrEqual(
      60,
    );
  });

  it('keeps candidate matched-signal display fields split from repository orchestration', () => {
    expect(candidateCardPresenterSource).toContain(
      'buildCandidateMatchedSignals',
    );
    expect(candidatePoolServiceSource).not.toContain(
      'buildCandidateMatchedSignals',
    );
    expect(candidatePoolServiceSource).not.toContain(
      'matchedSignals: this.uniqueStrings',
    );
    expect(candidateDisplayFieldsSource).toContain(
      'function buildCandidateMatchedSignals',
    );
    expect(candidateDisplayFieldsSource).toContain('uniqueDisplayStrings');
    expect(
      candidateDisplayFieldsSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(30);
  });

  it('keeps candidate identity display fields split from repository orchestration', () => {
    expect(candidateCardPresenterSource).toContain(
      'buildCandidateIdentityFields',
    );
    expect(candidatePoolServiceSource).not.toContain(
      'buildCandidateIdentityFields',
    );
    expect(candidatePoolServiceSource).not.toContain(
      'targetUserId: input.user.id',
    );
    expect(candidatePoolServiceSource).not.toContain(
      'color: cleanDisplayText(input.user.color',
    );
    expect(candidateIdentityFieldsSource).toContain(
      'function buildCandidateIdentityFields',
    );
    expect(candidateIdentityFieldsSource).toContain('targetUserId');
    expect(
      candidateIdentityFieldsSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(40);
  });

  it('keeps candidate score breakdown split from repository orchestration', () => {
    expect(candidatePoolServiceSource).toContain(
      'buildProfileCandidateScoreBreakdown',
    );
    expect(candidatePoolServiceSource).toContain(
      'buildPublicIntentCandidateScoreBreakdown',
    );
    expect(candidatePoolServiceSource).not.toContain('private scoreProfile');
    expect(candidatePoolServiceSource).not.toContain(
      'private scorePublicIntent',
    );
    expect(candidatePoolServiceSource).not.toContain(
      'private relationshipGoalScore',
    );
    expect(candidateScoreBreakdownSource).toContain(
      'function buildProfileCandidateScoreBreakdown',
    );
    expect(candidateScoreBreakdownSource).toContain(
      'function buildPublicIntentCandidateScoreBreakdown',
    );
    expect(
      candidateScoreBreakdownSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(260);
  });

  it('keeps candidate card assembly split from repository orchestration', () => {
    expect(candidatePoolServiceSource).toContain('buildCandidatePoolCandidate');
    expect(candidatePoolServiceSource).not.toContain('private candidateBase');
    expect(candidatePoolServiceSource).not.toContain(
      'const dynamicExplanation = buildSocialMatchDynamicExplanation',
    );
    expect(candidatePoolServiceSource).not.toContain(
      'matchedSignals: buildCandidateMatchedSignals',
    );
    expect(candidateCardPresenterSource).toContain(
      'function buildCandidatePoolCandidate',
    );
    expect(candidateCardPresenterSource).toContain(
      'buildSocialMatchDynamicExplanation',
    );
    expect(candidateCardPresenterSource).toContain(
      'buildCandidateMatchedSignals',
    );
    expect(
      candidateCardPresenterSource.trim().split('\n').length,
    ).toBeLessThanOrEqual(360);
  });

  it('keeps candidate pool eligibility rules split from repository orchestration', () => {
    expect(candidatePoolServiceSource).toContain(
      'hasSocialAgentRecommendationBoundary',
    );
    expect(candidatePoolServiceSource).toContain(
      'isSocialAgentActivePublicIntent',
    );
    expect(candidatePoolServiceSource).toContain('isSocialAgentActiveActivity');
    expect(candidatePoolServiceSource).not.toContain(
      'const ACTIVE_PUBLIC_STATUSES',
    );
    expect(candidatePoolServiceSource).not.toContain(
      'const DISABLED_BOUNDARY_RE',
    );
    expect(candidatePoolServiceSource).not.toContain(
      'private isActivityLikePublicIntent',
    );
    expect(candidatePoolEligibilitySource).toContain(
      'function hasSocialAgentRecommendationBoundary',
    );
    expect(candidatePoolEligibilitySource).toContain(
      'function isSocialAgentActivePublicIntent',
    );
    expect(candidatePoolEligibilitySource).toContain(
      'function isSocialAgentActiveActivity',
    );
    expect(
      candidatePoolEligibilitySource.trim().split('\n').length,
    ).toBeLessThanOrEqual(140);
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

  it('keeps route-turn orchestration thin and repository-free', () => {
    // L5 route turns now coordinate streaming, AgentLoop, and subagent handoff;
    // the hard boundary is no repository access in this orchestration layer.
    expect(routeTurnSource.trim().split('\n').length).toBeLessThanOrEqual(350);
    expect(routeTurnSource).toContain('SocialAgentRouteAgentLoopRunnerService');
    expect(routeAgentLoopRunnerSource).toContain(
      'SocialAgentRouteConversationTurnService',
    );
    expect(routeAgentLoopRunnerSource).toContain(
      'SocialAgentRouteProfileTurnService',
    );
    expect(routeAgentLoopRunnerSource).toContain(
      'SocialAgentRouteSearchTurnService',
    );
    expect(routeAgentLoopRunnerSource).toContain(
      'SocialAgentRouteActionTurnService',
    );
    expect(routeTurnSource).not.toMatch(/from ['"]typeorm['"]/);
    expect(routeAgentLoopRunnerSource).not.toMatch(/from ['"]typeorm['"]/);
    expect(routeTurnSource).not.toMatch(/InjectRepository/);
    expect(routeAgentLoopRunnerSource).not.toMatch(/InjectRepository/);
    expect(routeTurnSource).not.toMatch(/Repository</);
    expect(routeAgentLoopRunnerSource).not.toMatch(/Repository</);
  });

  it('keeps production route branches wired to the subagent worker runtime', () => {
    expect(agentGatewayModuleSource).toContain(
      'FitMeetSubagentWorkerDispatcherService',
    );
    expect(agentGatewayModuleSource).toContain('FitMeetSubagentWorkerService');
    expect(agentGatewayModuleSource).toContain(
      'FitMeetSubagentWorkerRuntimeService',
    );
    expect(agentGatewayModuleSource).toContain('SubagentWorkerQueueService');
    expect(agentGatewayModuleSource).toContain(
      'SocialAgentRouteAgentLoopRunnerService',
    );
    expect(routeAgentLoopRunnerSource).toContain(
      'private readonly subagentWorker?: FitMeetSubagentWorkerService',
    );
    expect(routeAgentLoopRunnerSource).toContain('this.subagentWorker.run');
    expect(routeAgentLoopRunnerSource).toContain("agent: 'Life Graph Agent'");
    expect(routeAgentLoopRunnerSource).toContain("agent: 'Match Agent'");
    expect(routeAgentLoopRunnerSource).toContain("agent: 'Match Agent'");
  });

  it('keeps chat turn entrypoints split from route-turn callback wiring', () => {
    // Streaming options are threaded through the facade, but callback wiring
    // must stay delegated to SocialAgentChatTurnCallbacksService.
    expect(chatTurnFacadeSource.trim().split('\n').length).toBeLessThanOrEqual(
      80,
    );
    expect(chatTurnFacadeSource).toContain(
      'SocialAgentChatTurnCallbacksService',
    );
    expect(chatTurnFacadeSource).not.toContain(
      'SocialAgentReplanFacadeService',
    );
    expect(chatTurnFacadeSource).not.toContain(
      'SocialAgentInitialSearchQueueService',
    );
    expect(chatTurnCallbacksSource).toContain('forOwner(ownerUserId: number)');
    expect(chatTurnCallbacksSource).toContain('replanAndRefresh');
    expect(chatTurnCallbacksSource).toContain('queueInitialSearchForTask');
  });
});
