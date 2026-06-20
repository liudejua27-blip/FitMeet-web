import * as fs from 'fs';
import * as path from 'path';

function listProductionTypeScriptFiles(root: string): string[] {
  const result: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...listProductionTypeScriptFiles(absolute));
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;
    if (entry.name.endsWith('.spec.ts')) continue;
    if (entry.name.endsWith('.acceptance.ts')) continue;
    if (entry.name.endsWith('.acceptance.spec.ts')) continue;
    result.push(absolute);
  }
  return result;
}

function readGatewaySource(basename: string): string {
  return fs.readFileSync(path.join(__dirname, basename), 'utf8');
}

function methodBody(source: string, methodName: string): string {
  const methodStart = source.indexOf(`${methodName}(`);
  if (methodStart < 0) return '';
  const openBrace = source.indexOf('{', methodStart);
  if (openBrace < 0) return '';
  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openBrace, index + 1);
    }
  }
  return '';
}

function sourceSection(
  source: string,
  startNeedle: string,
  endNeedles: string[],
): string {
  const start = source.indexOf(startNeedle);
  if (start < 0) return '';
  const ends = endNeedles
    .map((needle) => source.indexOf(needle, start + startNeedle.length))
    .filter((index) => index > start);
  const end = ends.length > 0 ? Math.min(...ends) : source.length;
  return source.slice(start, end);
}

describe('Social Agent route branch production boundary', () => {
  it('keeps the route turn entrypoint thin and delegated to the AgentLoop runner', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'social-agent-route-turn.service.ts'),
      'utf8',
    );
    const forbiddenBranchSymbols = [
      'SocialAgentRouteConversationTurnService',
      'SocialAgentRouteProfileTurnService',
      'SocialAgentRouteSearchTurnService',
      'SocialAgentRouteActionTurnService',
      'conversationTurns.handle',
      'profileTurns.handle',
      'searchTurns.handle',
      'actionTurns.handle',
    ];

    expect(source).toContain('SocialAgentRouteAgentLoopRunnerService');
    expect(source).toContain('this.routeLoopRunner.run');
    for (const symbol of forbiddenBranchSymbols) {
      expect(source).not.toContain(symbol);
    }
  });

  it('keeps route branch execution wrapped by AgentLoop runner with bounded tool budget', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'social-agent-route-agent-loop-runner.service.ts'),
      'utf8',
    );

    expect(source).toContain('const execution = await loopService.execute');
    expect(source).toContain(
      'Route turn branches are executed through AgentLoop.',
    );
    expect(source).toContain('maxToolCalls: 4');
    expect(source).toContain('maxRetries: 0');
    expect(source).toContain('runner: async ({ toolName, traceId }) =>');
    expect(source).toContain('this.runRouteBranchTool');
    expect(source.indexOf('loopService.execute')).toBeLessThan(
      source.indexOf('this.runRouteBranchTool'),
    );
  });

  it('keeps serialized subagent worker branch execution wrapped by AgentLoop', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'fitmeet-subagent-worker-dispatcher.service.ts'),
      'utf8',
    );

    expect(source).toContain('this.loopRuntime().execute');
    expect(source).toContain(
      'Serialized subagent worker branch executes through the unified AgentLoop.',
    );
    expect(source).toContain('maxToolCalls: 1');
    expect(source).toContain('maxRetries: 0');
    expect(source).toContain("return 'route_conversation_turn'");
    expect(source).toContain("return 'route_profile_turn'");
    expect(source).toContain("return 'route_search_turn'");
    expect(source).toContain("return 'route_action_turn'");
    expect(source.indexOf('this.loopRuntime().execute')).toBeLessThan(
      source.indexOf('this.runBranchDirect'),
    );
  });

  it('keeps route branch services behind AgentLoop runner or worker dispatcher', () => {
    const branchClasses = [
      'SocialAgentRouteConversationTurnService',
      'SocialAgentRouteProfileTurnService',
      'SocialAgentRouteSearchTurnService',
      'SocialAgentRouteActionTurnService',
    ];
    const allowedFiles = new Set([
      'agent-gateway.module.ts',
      'social-agent-route-agent-loop-runner.service.ts',
      'fitmeet-subagent-worker-dispatcher.service.ts',
      'social-agent-route-conversation-turn.service.ts',
      'social-agent-route-profile-turn.service.ts',
      'social-agent-route-search-turn.service.ts',
      'social-agent-route-action-turn.service.ts',
    ]);
    const violations: Array<{ file: string; className: string }> = [];

    for (const file of listProductionTypeScriptFiles(__dirname)) {
      const basename = path.basename(file);
      if (allowedFiles.has(basename)) continue;
      const source = fs.readFileSync(file, 'utf8');
      for (const className of branchClasses) {
        if (source.includes(className)) {
          violations.push({ file: basename, className });
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps legacy route branch handle calls inside controlled loop or worker adapters', () => {
    const allowedCallSites = new Set([
      'social-agent-route-agent-loop-runner.service.ts',
      'fitmeet-subagent-worker-dispatcher.service.ts',
    ]);
    const branchHandleCalls = [
      'conversationTurns.handle',
      'profileTurns.handle',
      'searchTurns.handle',
      'actionTurns.handle',
    ];
    const violations: Array<{ file: string; call: string }> = [];

    for (const file of listProductionTypeScriptFiles(__dirname)) {
      const basename = path.basename(file);
      const source = fs.readFileSync(file, 'utf8');
      for (const call of branchHandleCalls) {
        if (!source.includes(`${call}(`)) continue;
        if (!allowedCallSites.has(basename)) {
          violations.push({ file: basename, call });
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps route branch services from owning tool execution or run orchestration', () => {
    const branchFiles = [
      'social-agent-route-conversation-turn.service.ts',
      'social-agent-route-profile-turn.service.ts',
      'social-agent-route-search-turn.service.ts',
      'social-agent-route-action-turn.service.ts',
    ];
    const forbiddenRuntimeSymbols = [
      'SocialAgentToolExecutorService',
      'SocialAgentRunOrchestratorService',
      'SocialAgentRunRecommendationService',
      'SocialAgentRouteAgentLoopRunnerService',
      'FitMeetSubagentRuntimeService',
      'FitMeetSubagentWorkerService',
      'AgentLoopService',
    ];
    const violations: Array<{ file: string; symbol: string }> = [];

    for (const basename of branchFiles) {
      const source = fs.readFileSync(path.join(__dirname, basename), 'utf8');
      for (const symbol of forbiddenRuntimeSymbols) {
        if (source.includes(symbol)) violations.push({ file: basename, symbol });
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps direct tool executor calls inside approved runtime and action gateways', () => {
    const allowedExecutorCallSites = new Set([
      'social-agent-tool-executor.service.ts',
      'social-agent-tasks.controller.ts',
      'social-agent-candidate-action.service.ts',
      'social-agent-profile-enrichment.service.ts',
      'social-agent-draft-search.service.ts',
      'social-agent-draft-publication.service.ts',
    ]);
    const violations: Array<{ file: string; callCount: number }> = [];

    for (const file of listProductionTypeScriptFiles(__dirname)) {
      const basename = path.basename(file);
      const source = fs.readFileSync(file, 'utf8');
      const callCount = (source.match(/\.executeToolAction\(/g) ?? []).length;
      if (callCount === 0) continue;
      if (!allowedExecutorCallSites.has(basename)) {
        violations.push({ file: basename, callCount });
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps route and branch helpers from importing the executor directly', () => {
    const routeLikeFiles = listProductionTypeScriptFiles(__dirname).filter(
      (file) => {
        const basename = path.basename(file);
        return (
          basename.startsWith('social-agent-route-') ||
          basename.includes('route-agent-loop') ||
          basename.includes('route-turn')
        );
      },
    );
    const allowedFiles = new Set(['social-agent-route-branch-boundary.spec.ts']);
    const violations: Array<{ file: string; symbol: string }> = [];

    for (const file of routeLikeFiles) {
      const basename = path.basename(file);
      if (allowedFiles.has(basename)) continue;
      const source = fs.readFileSync(file, 'utf8');
      for (const symbol of [
        'SocialAgentToolExecutorService',
        '.executeToolAction(',
      ]) {
        if (source.includes(symbol)) violations.push({ file: basename, symbol });
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps profile enrichment direct execution scoped to profile memory writes', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'social-agent-profile-enrichment.service.ts'),
      'utf8',
    );
    const forbiddenTools = [
      'SendMessage',
      'SendMessageToCandidate',
      'ReplyMessage',
      'ConnectCandidate',
      'AddFriend',
      'CreateActivity',
      'InviteActivity',
      'JoinActivity',
      'OfflineMeeting',
      'ShareLocation',
      'Payment',
      'PublishSocialRequest',
      'SearchMatches',
      'SearchActivities',
      'SearchPublicIntents',
    ];
    const violations = forbiddenTools.filter((tool) =>
      source.includes(`SocialAgentToolName.${tool}`),
    );

    expect(source).toContain(
      'SocialAgentToolName.UpdateProfileFromAgentContext',
    );
    expect(violations).toEqual([]);
  });

  it('keeps draft search and publication gateways scoped to draft/search/publish tools', () => {
    const allowedToolsByFile: Record<string, string[]> = {
      'social-agent-draft-search.service.ts': [
        'CreateSocialRequest',
        'SearchMatches',
      ],
      'social-agent-draft-publication.service.ts': ['CreateSocialRequest'],
    };
    const forbiddenHighRiskTools = [
      'SendMessage',
      'SendMessageToCandidate',
      'ReplyMessage',
      'ConnectCandidate',
      'AddFriend',
      'CreateActivity',
      'InviteActivity',
      'JoinActivity',
      'OfflineMeeting',
      'ShareLocation',
      'Payment',
    ];
    const violations: Array<{ file: string; tool: string }> = [];

    for (const [basename, allowedTools] of Object.entries(allowedToolsByFile)) {
      const source = fs.readFileSync(path.join(__dirname, basename), 'utf8');
      for (const tool of forbiddenHighRiskTools) {
        if (source.includes(`SocialAgentToolName.${tool}`)) {
          violations.push({ file: basename, tool });
        }
      }
      for (const tool of allowedTools) {
        expect(source).toContain(`SocialAgentToolName.${tool}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps candidate command endpoints as confirmed-action AgentLoop wrappers', () => {
    const source = readGatewaySource(
      'social-agent-candidate-command.service.ts',
    );
    const commandMethods = [
      'async publishDraft(',
      'saveCandidate(',
      'sendCandidateMessage(',
      'connectCandidate(',
    ];

    for (const methodName of commandMethods) {
      const body = sourceSection(
        source,
        methodName,
        commandMethods
          .filter((candidate) => candidate !== methodName)
          .concat(['private async executeCandidateCommand']),
      );
      expect(body).toContain('this.executeCandidateCommand');
      expect(body).not.toContain('await this.candidateActions.');
      expect(body).not.toContain('await this.draftPublication.');
    }

    const executorBody = sourceSection(
      source,
      'private async executeCandidateCommand',
      ['private commandInput'],
    );
    expect(executorBody).toContain('confirmedActionLoopToolForSocialExecution');
    expect(executorBody).toContain('loopService.execute');
    expect(executorBody).toContain(
      'Candidate command endpoints execute only through AgentLoop.',
    );
    expect(executorBody).toContain('maxToolCalls: 1');
    expect(executorBody).toContain('maxRetries: 0');
  });

  it('hydrates recommendation memory before the recommendation AgentLoop runs', () => {
    const source = readGatewaySource(
      'social-agent-run-recommendation.service.ts',
    );
    const loopIndex = source.indexOf(
      'const loopExecution = await loopService.execute',
    );

    expect(source).toContain('recommendationLoopToolsForSocialExecution');
    expect(source).toContain('hydrateRecommendationContext');
    expect(source).toContain('applyHydratedContextToTaskMemory');
    expect(loopIndex).toBeGreaterThan(0);
    expect(
      source.indexOf('const longTermSnapshot = await this.readLongTermSnapshot'),
    ).toBeGreaterThan(0);
    expect(
      source.indexOf(
        'const hydratedContext = await this.hydrateRecommendationContext',
      ),
    ).toBeGreaterThan(0);
    expect(
      source.indexOf('this.applyHydratedContextToTaskMemory'),
    ).toBeGreaterThan(0);
    expect(
      source.indexOf('const longTermSnapshot = await this.readLongTermSnapshot'),
    ).toBeLessThan(loopIndex);
    expect(
      source.indexOf(
        'const hydratedContext = await this.hydrateRecommendationContext',
      ),
    ).toBeLessThan(loopIndex);
    expect(source.indexOf('this.applyHydratedContextToTaskMemory')).toBeLessThan(
      loopIndex,
    );
    expect(source).toContain(
      'Initial recommendation run executes only through AgentLoop tools.',
    );
  });

  it('keeps follow-up replan runs inside AgentLoop with bounded execution', () => {
    const source = readGatewaySource('social-agent-replan-run.service.ts');

    expect(source).toContain('const loopExecution = await loopService.execute');
    expect(source).toContain(
      'Follow-up route/search/recommendation refresh must run through the unified AgentLoop.',
    );
    expect(source).toContain('maxToolCalls: 5');
    expect(source).toContain('timeoutMs: 30_000');
    expect(source).toContain('this.readLongTermSnapshot');
    expect(source).toContain('this.routeContext.buildMemoryContext');
  });

  it('keeps manual task planning endpoints behind AgentLoop', () => {
    const source = readGatewaySource('social-agent-tasks.controller.ts');
    const planBody = methodBody(source, 'planTask');
    const replanBody = methodBody(source, 'replanTask');

    expect(planBody).toContain('loopService.execute');
    expect(planBody).toContain(
      'Manual task planning must pass through the unified AgentLoop.',
    );
    expect(planBody).toContain('this.planner.planTask');
    expect(planBody).toContain('maxToolCalls: 1');

    expect(replanBody).toContain('loopService.execute');
    expect(replanBody).toContain(
      'Manual task replan must pass through the unified AgentLoop.',
    );
    expect(replanBody).toContain('this.planner.replanTask');
    expect(replanBody).toContain('maxToolCalls: 1');
  });

  it('keeps adhoc tool execution behind AgentLoop before executor internals run', () => {
    const source = readGatewaySource('social-agent-tool-executor.service.ts');
    const publicBody = sourceSection(source, 'async executeToolAction(', [
      'private async executeToolActionInternal',
    ]);
    const internalBody = sourceSection(
      source,
      'private async executeToolActionInternal',
      ['private agentForToolAction'],
    );

    expect(publicBody).toContain('loopService.execute');
    expect(publicBody).toContain(
      'Adhoc task tool actions must enter the unified AgentLoop; the executor enforces approval gates.',
    );
    expect(publicBody).toContain('maxToolCalls: 1');
    expect(publicBody).toContain('maxRetries: 0');
    expect(publicBody).toContain('executeToolActionInternal');

    expect(internalBody).toContain('withAdhocConfirmationMetadata');
    expect(internalBody).toContain('requiresMandatorySocialAgentApproval');
    expect(internalBody).toContain('rejectUnconfirmedAdhocDangerousAction');
    expect(internalBody).toContain('executeAdhocStep');
    expect(
      internalBody.indexOf('requiresMandatorySocialAgentApproval'),
    ).toBeLessThan(internalBody.indexOf('executeAdhocStep'));
    expect(
      internalBody.indexOf('rejectUnconfirmedAdhocDangerousAction'),
    ).toBeLessThan(internalBody.indexOf('executeAdhocStep'));
  });

  it('keeps plan step side effects behind sandbox, risk gate, approval credentials, and reliability', () => {
    const source = readGatewaySource('social-agent-tool-executor.service.ts');
    const body = sourceSection(source, 'private async executePlanStep', [
      'private buildSocialCodexBlockedCall',
    ]);

    const reliabilityIndex = body.indexOf('buildToolReliabilityContract');
    const sandboxIndex = body.indexOf('buildSocialCodexBlockedCall');
    const frequencyIndex = body.indexOf('assertHighRiskFrequencyLimit');
    const credentialIndex = body.indexOf('hasApprovedToolActionCredential');
    const approvalGateIndex = body.indexOf('maybeGateActionByRisk');
    const dispatchIndex = body.indexOf(
      'const output = await this.dispatchToolWithReliability',
    );
    const successSideEffectIndex = body.indexOf(
      'await this.recordActionSideEffects(task, toolName, executionInput, call);',
      dispatchIndex,
    );

    expect(reliabilityIndex).toBeGreaterThan(0);
    expect(sandboxIndex).toBeGreaterThan(0);
    expect(frequencyIndex).toBeGreaterThan(0);
    expect(credentialIndex).toBeGreaterThan(0);
    expect(approvalGateIndex).toBeGreaterThan(0);
    expect(dispatchIndex).toBeGreaterThan(0);
    expect(successSideEffectIndex).toBeGreaterThan(0);
    expect(reliabilityIndex).toBeLessThan(dispatchIndex);
    expect(sandboxIndex).toBeLessThan(dispatchIndex);
    expect(frequencyIndex).toBeLessThan(dispatchIndex);
    expect(credentialIndex).toBeLessThan(dispatchIndex);
    expect(approvalGateIndex).toBeLessThan(dispatchIndex);
    expect(successSideEffectIndex).toBeGreaterThan(dispatchIndex);
  });

  it('keeps card actions as AgentLoop dispatches instead of direct UI side effects', () => {
    const source = readGatewaySource(
      'social-agent-card-action-router.service.ts',
    );
    const performBody = sourceSection(source, 'async perform(', [
      'private async performActionTool',
    ]);
    const toolBody = sourceSection(source, 'private async performActionTool', [
      'private isActivityAction',
    ]);

    expect(performBody).toContain('loopService.execute');
    expect(performBody).toContain('Card actions dispatch only through AgentLoop.');
    expect(performBody).toContain('card_action_dispatch');
    expect(performBody).toContain('maxToolCalls: 1');
    expect(performBody).toContain('maxRetries: 0');
    expect(performBody).toContain('this.performActionTool');

    for (const directHandler of [
      'candidateActions.confirmOpenerSendFromCardAction',
      'candidateActions.connectCandidateFromCardAction',
      'meetLoop.performActivityAction',
      'lifeGraphActions.performUpdateAction',
      'handleMessage(',
    ]) {
      expect(performBody).not.toContain(directHandler);
      expect(toolBody).toContain(directHandler);
    }
  });

  it('keeps approval checkpoints resumable, serializable, and side-effect safe', () => {
    const source = readGatewaySource('agent-run-checkpoint.service.ts');
    const saveResultBody = sourceSection(source, 'async saveResult(', [
      'async markDecision',
    ]);
    const interruptBody = sourceSection(
      source,
      'private buildApprovalInterruptPayload',
      ['private recoveryActionsForInterrupt'],
    );
    const markDecisionBody = sourceSection(source, 'async markDecision', [
      'async prepareAction',
    ]);

    expect(saveResultBody).toContain('AgentRunCheckpointType.Interrupt');
    expect(saveResultBody).toContain('approvalIds');
    expect(saveResultBody).toContain('buildApprovalInterruptPayload');
    expect(interruptBody).toContain("protocol: 'fitmeet.agent.interrupt.v1'");
    expect(interruptBody).toContain("checkpointer: 'database_durable'");
    expect(interruptBody).toContain(
      "sideEffectsBeforeInterrupt: 'idempotent_only'",
    );
    expect(interruptBody).toContain(
      "resumeCursor: 'thread_id_and_checkpoint_id'",
    );
    expect(interruptBody).toContain('recoveryActions');
    expect(interruptBody).toContain('stepActions');
    expect(markDecisionBody).toContain('appendApprovalResolvedEvent');
    expect(markDecisionBody).toContain("protocol: 'fitmeet.agent.resume.v1'");
    expect(markDecisionBody).toContain("return this.toResumePlan(saved, 'resume')");
  });

  it('keeps serialized subagent worker dispatch contextual and cancellable', () => {
    const source = readGatewaySource(
      'fitmeet-subagent-worker-dispatcher.service.ts',
    );
    const dispatchBody = sourceSection(source, 'async dispatch(', [
      'private async runConversationBranch',
    ]);
    const searchBody = sourceSection(source, 'private async runSearchBranch', [
      'private async runActionBranch',
    ]);
    const actionBody = sourceSection(source, 'private async runActionBranch', [
      'private async loadTask',
    ]);
    const memoryBody = sourceSection(
      source,
      'private buildMemoryContextFromPayload',
      ['private hydratedContextFromPayload'],
    );
    const hydrateBody = sourceSection(
      source,
      'private hydratedContextFromPayload',
      ['private recordOrEmpty'],
    );

    expect(dispatchBody).toContain('this.assertNotAborted(input.signal)');
    expect(dispatchBody).toContain('this.loadTask');
    expect(searchBody).toContain('signal: signal ?? null');
    expect(searchBody).toContain('buildMemoryContextFromPayload');
    expect(searchBody).toContain('queueInitialSearchForTask');
    expect(searchBody).toContain('replanAndRefresh');
    expect(actionBody).toContain('runtimeContext');
    expect(actionBody).toContain('resumeContext: null');
    expect(memoryBody).toContain('this.routeContext.buildMemoryContext');
    expect(memoryBody).toContain('payload.longTermSnapshot ?? null');
    expect(hydrateBody).toContain('recentMessages');
    expect(hydrateBody).toContain('taskSlots');
    expect(hydrateBody).toContain('pendingApprovals');
    expect(hydrateBody).toContain('candidateActions');
  });
});
