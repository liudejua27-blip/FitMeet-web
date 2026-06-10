import { AgentLoopService } from './agent-loop.service';
import { FitMeetSubagentRuntimeService } from './fitmeet-subagent-runtime.service';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';

function route(
  overrides: Partial<SocialAgentIntentRouterResult>,
): SocialAgentIntentRouterResult {
  return {
    intent: 'social_search',
    confidence: 0.94,
    entities: {},
    shouldSearch: true,
    shouldReplan: false,
    shouldUpdateProfile: false,
    shouldExecuteAction: false,
    replyStrategy: 'search_candidates',
    source: 'rules',
    ...overrides,
  } as SocialAgentIntentRouterResult;
}

describe('FitMeetSubagentRuntimeService', () => {
  it('creates an independent Social Match handoff with observation and critique', () => {
    const loopService = new AgentLoopService();
    const service = new FitMeetSubagentRuntimeService(loopService);
    const loop = loopService.start({
      taskId: 7,
      goal: '今晚找跑步搭子',
    });

    const result = service.run({
      loop,
      message: '今晚找跑步搭子',
      route: route({}),
      observation: { branch: 'search', queuedRun: 'run_1' },
    });

    expect(result.handoff).toEqual(
      expect.objectContaining({
        agent: 'Social Match Agent',
        memoryScope: 'matching.candidate_memory',
        critique: expect.stringContaining('Social Match Agent'),
        handoffOutput: expect.objectContaining({
          nextAgent: 'FitMeet Main Agent',
        }),
      }),
    );
    expect(result.handoff.toolCalls[0]).toEqual(
      expect.objectContaining({
        toolName: 'search_real_candidates',
        status: 'observed',
      }),
    );
    expect(result.handoff.plannerInput).toEqual(
      expect.objectContaining({
        toolBudget: expect.objectContaining({
          maxToolCalls: 3,
          maxRetries: 1,
        }),
        scratchpad: expect.objectContaining({
          policy: expect.stringContaining('score candidates'),
        }),
      }),
    );
    expect(result.handoff.evalHints).toEqual(
      expect.objectContaining({
        critiqueEvaluator: 'social_match_ranking_explanation_v1',
        needsRankingExperiment: true,
        needsRecallFailureReview: true,
      }),
    );
    expect(result.loop.steps.map((step) => step.phase)).toEqual([
      'plan',
      'tool',
      'observe',
      'replan',
    ]);
  });

  it('keeps Math Agent deterministic with one-tool budget and privacy boundary', () => {
    const loopService = new AgentLoopService();
    const service = new FitMeetSubagentRuntimeService(loopService);
    const loop = loopService.start({
      taskId: 8,
      goal: '5公里配速怎么算',
    });

    const result = service.run({
      loop,
      message: '5公里配速怎么算',
      route: route({
        intent: 'fitness_math',
        shouldSearch: false,
        replyStrategy: 'direct_reply',
      }),
      brainDecision: {
        conversationMode: 'chat',
        plannerSource: 'rules',
        reason: 'deterministic calculation',
        tools: [
          { name: 'fitness_math_calculator', arguments: { distanceKm: 5 } },
          { name: 'search_real_candidates', arguments: {} },
        ],
        needUserConfirmation: false,
      } as never,
      observation: { branch: 'math', handled: true },
    });

    expect(result.handoff.agent).toBe('Math Agent');
    expect(result.handoff.toolCalls).toEqual([
      expect.objectContaining({
        toolName: 'fitness_math_calculator',
        status: 'observed',
      }),
      expect.objectContaining({
        toolName: 'search_real_candidates',
        status: 'skipped',
      }),
    ]);
    expect(result.handoff.evalHints).toEqual(
      expect.objectContaining({
        deterministicOnly: true,
        forbidsPrivacyReadWrite: true,
        needsUnitConversionTests: true,
      }),
    );
  });
});
