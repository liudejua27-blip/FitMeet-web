import { AgentLoopService } from './agent-loop.service';
import { AgentObservabilityService } from './agent-observability.service';

describe('AgentLoopService', () => {
  it('records a plan/tool/observe/replan/answer loop', () => {
    const service = new AgentLoopService();
    let loop = service.start({
      taskId: 42,
      goal: '找低压力跑步搭子',
    });
    loop = service.plan(loop, {
      agent: 'Agent Brain',
      plan: { intent: 'social_search' },
    });
    loop = service.tool(loop, {
      agent: 'Match Agent',
      toolName: 'search_real_candidates',
      toolInput: { city: '青岛' },
    });
    loop = service.observe(loop, {
      agent: 'Match Agent',
      toolName: 'search_real_candidates',
      observation: { candidateCount: 2 },
    });
    loop = service.replan(loop, {
      reason: 'handoff_from_social_match',
    });
    loop = service.complete(loop);

    expect(loop.status).toBe('completed');
    expect(loop.traceId).toMatch(/^agent:/);
    expect(loop.steps.map((step) => step.phase)).toEqual([
      'plan',
      'plan',
      'tool',
      'observe',
      'replan',
      'answer',
    ]);
    expect(loop.finalObservation).toEqual({ candidateCount: 2 });
  });

  it('executes tools through one loop with retry, budget, and observations', async () => {
    const observability = new AgentObservabilityService();
    const service = new AgentLoopService(observability);
    const runner = jest
      .fn()
      .mockRejectedValueOnce(new Error('temporary outage'))
      .mockResolvedValueOnce({ candidateCount: 3, source: 'tool' });
    const events: string[] = [];

    const result = await service.execute({
      taskId: 9,
      goal: '找低压力跑步搭子',
      plan: {
        reason: 'need candidates',
        tools: [
          {
            agent: 'Match Agent',
            toolName: 'search_real_candidates',
            input: { city: '青岛' },
          },
        ],
      },
      runner,
      maxToolCalls: 1,
      maxRetries: 1,
      timeoutMs: 1000,
      emit: (event) => events.push(event.type),
    });

    expect(runner).toHaveBeenCalledTimes(2);
    expect(result.loop.status).toBe('completed');
    expect(result.loop.traceId).toMatch(/^agent:/);
    expect(runner.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        runId: result.loop.runId,
        traceId: result.loop.traceId,
      }),
    );
    expect(result.loop.toolBudget).toEqual(
      expect.objectContaining({ maxToolCalls: 1, usedToolCalls: 1 }),
    );
    expect(result.observations).toEqual([
      { candidateCount: 3, source: 'tool' },
    ]);
    expect(result.answerBoundary).toEqual({
      fromObservationsOnly: true,
      requiresApproval: false,
      canContinue: true,
      status: 'ready',
      userSafeMessage: null,
    });
    expect(events).toEqual(
      expect.arrayContaining(['agent_loop_step', 'tool_call', 'tool_result']),
    );
    expect(observability.snapshot().counters).toEqual(
      expect.objectContaining({
        'agent_run.started': 1,
        'agent_run.completed': 1,
        'tool.observed': 1,
      }),
    );
  });

  it('does not approval-block low-risk worker turns that mention confirmation boundaries', async () => {
    const observability = new AgentObservabilityService();
    const service = new AgentLoopService(observability);
    const runner = jest.fn().mockResolvedValue({
      candidateCount: 3,
      source: 'social_match_search_turn',
    });
    const events: string[] = [];

    const result = await service.execute({
      taskId: 95,
      goal: '青岛今天晚上轻松跑步',
      plan: {
        reason: 'search worker should remain read-only',
        tools: [
          {
            agent: 'Match Agent',
            toolName: 'social_match_search_turn',
            input: {
              message:
                '青岛今天晚上，轻松跑步，只在公共场所，先站内聊，发送前确认',
            },
            requiresApproval: false,
          },
        ],
      },
      runner,
      maxToolCalls: 1,
      maxRetries: 0,
      emit: (event) => events.push(event.type),
    });

    expect(runner).toHaveBeenCalledTimes(1);
    expect(result.answerBoundary).toEqual(
      expect.objectContaining({
        requiresApproval: false,
        status: 'ready',
      }),
    );
    expect(events).not.toContain('approval_required');
    expect(observability.snapshot().counters).not.toHaveProperty(
      'approval_blocked',
    );
  });

  it('does not approval-block main agent preparation when the user states confirmation preferences', async () => {
    const observability = new AgentObservabilityService();
    const service = new AgentLoopService(observability);
    const runner = jest.fn().mockResolvedValue({
      route: 'social_search',
      source: 'main_agent_prepare_turn',
    });

    const result = await service.execute({
      taskId: 96,
      goal: '青岛今天晚上轻松跑步',
      plan: {
        reason: 'main agent preparation is an internal read-only routing step',
        tools: [
          {
            agent: 'Agent Brain',
            toolName: 'main_agent_prepare_turn',
            input: {
              context: {
                message:
                  '青岛今天晚上，轻松跑步，只在公共场所，先站内聊，发送前确认',
              },
            },
            requiresApproval: false,
          },
        ],
      },
      runner,
      maxToolCalls: 1,
      maxRetries: 0,
    });

    expect(runner).toHaveBeenCalledTimes(1);
    expect(result.answerBoundary).toEqual(
      expect.objectContaining({
        requiresApproval: false,
        status: 'ready',
      }),
    );
    expect(observability.snapshot().counters).not.toHaveProperty(
      'approval_blocked',
    );
  });

  it('blocks approval-required tools before calling the runner', async () => {
    const observability = new AgentObservabilityService();
    const service = new AgentLoopService(observability);
    const runner = jest.fn();

    const result = await service.execute({
      taskId: 10,
      goal: '帮我直接发邀请',
      plan: {
        tools: [
          {
            agent: 'Match Agent',
            toolName: 'send_message_to_candidate',
            input: { candidateUserId: 2 },
            requiresApproval: true,
          },
        ],
      },
      runner,
    });

    expect(runner).not.toHaveBeenCalled();
    expect(result.answerBoundary.requiresApproval).toBe(true);
    expect(result.answerBoundary.status).toBe('approval_required');
    expect(result.answerBoundary.userSafeMessage).toContain('还没有发送消息');
    expect(result.loop.traceId).toMatch(/^agent:/);
    expect(result.loop.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          phase: 'observe',
          status: 'blocked',
          observation: expect.objectContaining({
            approvalRequired: true,
          }),
        }),
      ]),
    );
    expect(observability.snapshot().counters).toEqual(
      expect.objectContaining({
        'agent_run.approval_required': 1,
        'approval.blocked': 1,
        'tool.blocked': 1,
      }),
    );
  });

  it('blocks mandatory social side-effect tools even when the plan forgets approval', async () => {
    const service = new AgentLoopService(new AgentObservabilityService());
    const runner = jest.fn();

    const result = await service.execute({
      taskId: 11,
      goal: '帮我发消息给候选人',
      plan: {
        tools: [
          {
            agent: 'Match Agent',
            toolName: 'send_message_to_candidate',
            input: { candidateUserId: 2, body: '今晚一起跑步吗' },
          },
        ],
      },
      runner,
    });

    expect(runner).not.toHaveBeenCalled();
    expect(result.answerBoundary).toEqual(
      expect.objectContaining({
        requiresApproval: true,
        canContinue: false,
        status: 'approval_required',
      }),
    );
    expect(result.loop.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          phase: 'observe',
          status: 'blocked',
          observation: expect.objectContaining({
            approvalRequired: true,
          }),
        }),
      ]),
    );
  });

  it('returns a natural recovery boundary when a tool fails', async () => {
    const service = new AgentLoopService(new AgentObservabilityService());
    const runner = jest.fn().mockRejectedValue(new Error('tool unavailable'));

    const result = await service.execute({
      taskId: 12,
      goal: '找附近轻松活动',
      plan: {
        tools: [
          {
            agent: 'Match Agent',
            toolName: 'search_real_candidates',
            input: { city: '青岛' },
          },
        ],
      },
      runner,
      maxRetries: 0,
    });

    expect(result.answerBoundary).toEqual(
      expect.objectContaining({
        requiresApproval: false,
        canContinue: false,
        status: 'tool_failed',
      }),
    );
    expect(result.answerBoundary.userSafeMessage).toContain('调用工具时失败');
  });
});
