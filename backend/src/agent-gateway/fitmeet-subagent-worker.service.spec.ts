import { AgentLoopService } from './agent-loop.service';
import { FitMeetSubagentWorkerService } from './fitmeet-subagent-worker.service';
import { buildFitMeetSubagentWorkerCommand } from './fitmeet-subagent-worker-command.contract';

describe('FitMeetSubagentWorkerService', () => {
  it('runs a subagent as an independent worker with tool budget and handoff memory', async () => {
    const l5Runtime = {
      recordSubagentMemory: jest.fn().mockResolvedValue(undefined),
    };
    const service = new FitMeetSubagentWorkerService(
      new AgentLoopService(),
      l5Runtime as never,
    );
    const runner = jest.fn().mockResolvedValue({
      candidateCount: 2,
      explanation: 'same city and low-pressure running',
    });

    const result = await service.run({
      ownerUserId: 7,
      taskId: 101,
      agent: 'Social Match Agent',
      goal: '找低压力跑步搭子',
      plannerInput: { city: '青岛', activityType: '跑步' },
      memoryScope: 'matching.worker_memory',
      maxToolCalls: 1,
      maxRetries: 0,
      tools: [
        {
          toolName: 'search_real_candidates',
          input: { city: '青岛' },
        },
      ],
      runner,
    });

    expect(runner).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'Social Match Agent',
        toolName: 'search_real_candidates',
        input: { city: '青岛' },
        attempt: 0,
      }),
    );
    expect(result.loop.toolBudget).toEqual(
      expect.objectContaining({
        maxToolCalls: 1,
        usedToolCalls: 1,
      }),
    );
    expect(result.handoff).toEqual(
      expect.objectContaining({
        agent: 'Social Match Agent',
        memoryScope: 'matching.worker_memory',
        evalHints: expect.objectContaining({
          independentWorker: true,
          usedToolCalls: 1,
          evalRunner: 'social_match_recall_ranking_eval_v1',
          failureReviewPolicy: 'cluster_recall_or_ranking_failures',
          workerRuntime: expect.objectContaining({
            queueName: 'fitmeet.subagent.social-match-agent',
            crashIsolation: false,
            scalable: false,
          }),
        }),
      }),
    );
    expect(l5Runtime.recordSubagentMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        agentTaskId: 101,
        agentName: 'Social Match Agent',
        memoryScope: 'matching.worker_memory',
        evalHints: expect.objectContaining({
          evalRunner: 'social_match_recall_ranking_eval_v1',
          failureReview: expect.objectContaining({
            nextStep: 'store_as_successful_subagent_trace',
          }),
        }),
      }),
    );
  });

  it('keeps high-risk subagent tools behind approval boundaries', async () => {
    const service = new FitMeetSubagentWorkerService(new AgentLoopService());
    const runner = jest.fn();

    const result = await service.run({
      agent: 'Meet Loop Agent',
      goal: '直接发送邀请',
      plannerInput: { candidateUserId: 22 },
      tools: [
        {
          toolName: 'send_message_to_candidate',
          input: { candidateUserId: 22 },
          requiresApproval: true,
        },
      ],
      runner,
    });

    expect(runner).not.toHaveBeenCalled();
    expect(result.handoff.evalHints).toEqual(
      expect.objectContaining({
        independentWorker: true,
        requiresApproval: true,
      }),
    );
    expect(result.loop.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'blocked',
          observation: expect.objectContaining({
            approvalRequired: true,
          }),
        }),
      ]),
    );
  });

  it('runs through the resident worker runtime when available', async () => {
    const workerRuntime = {
      submit: jest.fn(({ agent, runId, signal, job }) =>
        job({
          workerId: 'subagent:social-match-agent:resident',
          agent,
          mode: 'resident_in_process',
          queueName: 'fitmeet.subagent.social-match-agent',
          timeoutMs: 15000,
          crashIsolation: false,
          scalable: false,
          modelUseCase: 'candidate_summary',
          model: 'deepseek-worker-test',
          runId,
          signal,
        }),
      ),
    };
    const service = new FitMeetSubagentWorkerService(
      new AgentLoopService(),
      undefined,
      workerRuntime as never,
    );

    const result = await service.run({
      agent: 'Social Match Agent',
      goal: '找一个周末咖啡搭子',
      plannerInput: { city: '上海', activityType: '咖啡' },
      tools: [
        {
          toolName: 'rank_candidates',
          input: { city: '上海' },
        },
      ],
      runner: jest.fn().mockResolvedValue({ candidateCount: 3 }),
    });

    expect(workerRuntime.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'Social Match Agent',
        runId: expect.stringContaining('subagent:social-match-agent'),
      }),
    );
    expect(result.handoff.evalHints).toEqual(
      expect.objectContaining({
        residentWorker: true,
        workerRuntime: expect.objectContaining({
          workerId: 'subagent:social-match-agent:resident',
          mode: 'resident_in_process',
          queueName: 'fitmeet.subagent.social-match-agent',
          crashIsolation: false,
          scalable: false,
          modelUseCase: 'candidate_summary',
          model: 'deepseek-worker-test',
        }),
      }),
    );
    expect(result.handoff.handoffOutput).toEqual(
      expect.objectContaining({
        workerRuntime: expect.objectContaining({
          workerId: 'subagent:social-match-agent:resident',
        }),
      }),
    );
  });

  it('executes a versioned DB worker command without a main-process closure', async () => {
    const dispatcher = {
      normalizePayload: jest.fn((payload) => ({
        kind: 'route_branch',
        ownerUserId: 7,
        taskId: 101,
        agent: 'Social Match Agent',
        goal: '找跑步搭子',
        plannerInput: { route: { intent: 'find_partner' } },
        tools: [{ toolName: 'social_match_search_turn', input: {} }],
        memoryScope: 'matching.worker_memory',
        maxToolCalls: 1,
        maxRetries: 0,
        timeoutMs: 15000,
        route: { intent: 'find_partner' },
        ...(payload as Record<string, unknown>),
      })),
      dispatch: jest.fn().mockResolvedValue({
        task: { id: 101 },
        state: { assistantMessage: '已完成搜索' },
        observation: {
          branch: 'search',
          handled: true,
          candidateCount: 2,
        },
      }),
    };
    const service = new FitMeetSubagentWorkerService(
      new AgentLoopService(),
      undefined,
      undefined,
      dispatcher as never,
    );
    const payload = buildFitMeetSubagentWorkerCommand({
      runId: 'run-command-1',
      agentName: 'Social Match Agent',
      queueName: 'fitmeet.subagent.social-match-agent',
      ownerUserId: 7,
      taskId: 101,
      goal: '找跑步搭子',
      plannerInput: { route: { intent: 'find_partner' } },
      tools: [{ toolName: 'social_match_search_turn', input: {} }],
      memoryScope: 'matching.worker_memory',
      maxToolCalls: 1,
      maxRetries: 0,
      timeoutMs: 15000,
      route: { intent: 'find_partner' } as never,
      workerRuntime: {
        mode: 'queue_worker_ready',
        queueName: 'fitmeet.subagent.social-match-agent',
        timeoutMs: 15000,
        modelUseCase: 'candidate_summary',
        model: 'deepseek-worker-test',
      },
    });

    const result = await service.executeQueuedJob({
      job: {
        id: 55,
        agentName: 'Social Match Agent',
        queueName: 'fitmeet.subagent.social-match-agent',
        payload,
        runId: 'run-command-1',
        traceId: 'run-command-1',
      } as never,
      context: {
        workerId: 'worker:process:1',
        agent: 'Social Match Agent',
        mode: 'queue_worker_ready',
        queueName: 'fitmeet.subagent.social-match-agent',
        timeoutMs: 15000,
        crashIsolation: true,
        scalable: true,
        modelUseCase: 'candidate_summary',
        model: 'deepseek-worker-test',
        runId: 'run-command-1',
      },
    });

    expect(dispatcher.normalizePayload).toHaveBeenCalledWith(payload);
    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'social_match_search_turn',
      }),
    );
    expect(result.workerOutput).toEqual(
      expect.objectContaining({
        taskId: 101,
        observation: expect.objectContaining({
          handled: true,
          candidateCount: 2,
        }),
      }),
    );
    expect(result.handoff.evalHints).toEqual(
      expect.objectContaining({
        queueWorkerReady: true,
        externalProcessReady: false,
        workerRuntime: expect.objectContaining({
          workerId: 'worker:process:1',
          mode: 'queue_worker_ready',
        }),
      }),
    );
  });
});
