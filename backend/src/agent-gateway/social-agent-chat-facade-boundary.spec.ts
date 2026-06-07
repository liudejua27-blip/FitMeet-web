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
  const runOrchestratorSource = fs.readFileSync(runOrchestratorPath, 'utf8');
  const runCompletionPresenterSource = fs.readFileSync(
    runCompletionPresenterPath,
    'utf8',
  );
  const routeTurnSource = fs.readFileSync(routeTurnPath, 'utf8');

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
    ).toBeLessThanOrEqual(45);
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
    expect(toolExecutorSource).not.toContain(
      "event: 'agent.task.tool_failed'",
    );
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
    expect(toolExecutorSource).toContain(
      'applySocialAgentPlanStepCallToTask',
    );
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
      60,
    );
  });

  it('keeps task execution failure and completion state split from tool flow', () => {
    expect(toolExecutorSource).toContain('socialAgentTaskFailureState');
    expect(toolExecutorSource).toContain('socialAgentTaskCompletionState');
    expect(toolExecutorSource).not.toContain(
      "'waiting_for_counterpart_reply'",
    );
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
    expect(toolExecutorSource).not.toContain(
      "'action_executed_waiting_reply'",
    );
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
    expect(adhocActionStateSource.trim().split('\n').length).toBeLessThanOrEqual(
      70,
    );
  });

  it('keeps risk gate approval payload assembly split from tool flow', () => {
    expect(toolExecutorSource).toContain('buildSocialAgentRiskGateDecision');
    expect(toolExecutorSource).toContain(
      'buildSocialAgentPendingApprovalOutput',
    );
    expect(toolExecutorSource).not.toContain(
      'policy.blockedActions.includes',
    );
    expect(toolExecutorSource).not.toContain(
      "status: 'pending_approval'",
    );
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
    expect(riskGatePresenterSource.trim().split('\n').length).toBeLessThanOrEqual(
      170,
    );
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
    expect(candidatePoolServiceSource).not.toContain(
      "source: 'activity',",
    );
    expect(candidatePoolServiceSource).not.toContain(
      'activityId: activity.id',
    );
    expect(candidatePoolServiceSource).not.toContain(
      'activity.startTime',
    );
    expect(candidatePoolServiceSource).not.toContain(
      'activity.locationName',
    );
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
    expect(candidateRowStateSource.trim().split('\n').length).toBeLessThanOrEqual(
      55,
    );
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
    expect(routeTurnSource.trim().split('\n').length).toBeLessThanOrEqual(180);
    expect(routeTurnSource).toContain('SocialAgentRouteConversationTurnService');
    expect(routeTurnSource).toContain('SocialAgentRouteProfileTurnService');
    expect(routeTurnSource).toContain('SocialAgentRouteSearchTurnService');
    expect(routeTurnSource).toContain('SocialAgentRouteActionTurnService');
    expect(routeTurnSource).not.toMatch(/from ['"]typeorm['"]/);
    expect(routeTurnSource).not.toMatch(/InjectRepository/);
    expect(routeTurnSource).not.toMatch(/Repository</);
  });
});
