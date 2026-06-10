import { FitMeetSubagentWorkerRuntimeService } from './fitmeet-subagent-worker-runtime.service';

describe('FitMeetSubagentWorkerRuntimeService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('keeps same-agent jobs on a resident serial lane', async () => {
    const runtime = new FitMeetSubagentWorkerRuntimeService({
      getModel: jest.fn().mockReturnValue('deepseek-worker-test'),
    } as never);
    const order: string[] = [];
    let releaseFirst: () => void = () => undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = runtime.submit({
      agent: 'Social Match Agent',
      runId: 'run-a',
      job: async () => {
        order.push('a:start');
        await firstGate;
        order.push('a:end');
        return 'a';
      },
    });
    const second = runtime.submit({
      agent: 'Social Match Agent',
      runId: 'run-b',
      job: async () => {
        await Promise.resolve();
        order.push('b:start');
        order.push('b:end');
        return 'b';
      },
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['a:start']);

    releaseFirst();
    await expect(Promise.all([first, second])).resolves.toEqual(['a', 'b']);
    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
  });

  it('exposes worker lane model and heartbeat snapshots', async () => {
    const runtime = new FitMeetSubagentWorkerRuntimeService({
      getModel: jest.fn().mockReturnValue('deepseek-worker-test'),
    } as never);

    await runtime.submit({
      agent: 'Life Graph Agent',
      runId: 'run-life',
      job: async (context) => {
        await Promise.resolve();
        return context.modelUseCase;
      },
    });

    expect(runtime.snapshot('Life Graph Agent')).toEqual([
      expect.objectContaining({
        agent: 'Life Graph Agent',
        mode: 'resident_in_process',
        queueName: 'fitmeet.subagent.life-graph-agent',
        crashIsolation: false,
        scalable: false,
        timeoutMs: expect.any(Number),
        status: 'idle',
        modelUseCase: 'profile_extraction',
        model: 'deepseek-worker-test',
        activeRunId: null,
        totalRuns: 1,
        failedRuns: 0,
        lastHeartbeatAt: expect.any(String),
      }),
    ]);
  });

  it('supports queue worker mode with per-subagent model and timeout config', async () => {
    process.env.FITMEET_SOCIAL_MATCH_AGENT_WORKER_MODE = 'queue';
    process.env.FITMEET_SOCIAL_MATCH_AGENT_WORKER_MODEL =
      'deepseek-social-match-worker';
    process.env.FITMEET_SOCIAL_MATCH_AGENT_WORKER_TIMEOUT_MS = '2500';
    process.env.FITMEET_SOCIAL_MATCH_AGENT_WORKER_QUEUE =
      'fitmeet.queue.social-match';
    const runtime = new FitMeetSubagentWorkerRuntimeService({
      getModel: jest.fn().mockReturnValue('fallback-model'),
      getTimeout: jest.fn().mockReturnValue(1000),
    } as never);

    const context = await runtime.submit({
      agent: 'Social Match Agent',
      runId: 'run-queue',
      job: (jobContext) => Promise.resolve(jobContext),
    });

    expect(context).toEqual(
      expect.objectContaining({
        mode: 'queue_worker_ready',
        queueName: 'fitmeet.queue.social-match',
        timeoutMs: 2500,
        crashIsolation: true,
        scalable: true,
        modelUseCase: 'candidate_summary',
        model: 'deepseek-social-match-worker',
      }),
    );
    expect(runtime.snapshot('Social Match Agent')[0]).toEqual(
      expect.objectContaining({
        mode: 'queue_worker_ready',
        queueName: 'fitmeet.queue.social-match',
        timeoutMs: 2500,
        failedRuns: 0,
      }),
    );
  });

  it('uses DB queue result in queue mode instead of executing the local closure', async () => {
    process.env.FITMEET_SOCIAL_MATCH_AGENT_WORKER_MODE = 'db_queue';
    process.env.FITMEET_SUBAGENT_WORKER_RESULT_POLL_MS = '1';
    const dbQueue = {
      enqueue: jest.fn().mockResolvedValue({ id: 44 }),
      waitForCompletion: jest.fn().mockResolvedValue({
        loop: { runId: 'external-loop' },
        handoff: { agent: 'Social Match Agent' },
        workerOutput: { observation: { handled: true } },
      }),
    };
    const runtime = new FitMeetSubagentWorkerRuntimeService(
      {
        getModel: jest.fn().mockReturnValue('deepseek-worker-test'),
        getTimeout: jest.fn().mockReturnValue(1000),
      } as never,
      undefined,
      dbQueue as never,
    );
    const localJob = jest.fn().mockResolvedValue({ local: true });

    const result = await runtime.submit({
      agent: 'Social Match Agent',
      runId: 'run-db-queue',
      serializedPayload: {
        kind: 'route_branch',
        ownerUserId: 7,
        taskId: 101,
        agent: 'Social Match Agent',
        goal: 'find running partner',
        plannerInput: {
          route: { intent: 'find_partner' },
        },
        tools: [{ toolName: 'social_match_search_turn', input: {} }],
        route: { intent: 'find_partner' },
      },
      job: localJob,
    });

    expect(localJob).not.toHaveBeenCalled();
    expect(dbQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        agentName: 'Social Match Agent',
        queueName: 'fitmeet.subagent.social-match-agent',
        payload: expect.objectContaining({
          contract: 'fitmeet.subagent.worker.command',
          version: 1,
          commandType: 'route_branch.execute',
          runId: 'run-db-queue',
          owner: { userId: 7 },
          task: { taskId: 101 },
          execution: expect.objectContaining({
            goal: 'find running partner',
            workerRuntime: expect.objectContaining({
              mode: 'queue_worker_ready',
              crashIsolation: true,
              scalable: true,
            }),
          }),
          toolPlan: {
            tools: [{ toolName: 'social_match_search_turn', input: {} }],
          },
          safety: {
            highRiskToolsRequireApproval: true,
            answerFromObservationsOnly: true,
          },
        }),
      }),
    );
    expect(dbQueue.waitForCompletion).toHaveBeenCalledWith(
      44,
      expect.objectContaining({
        pollMs: 1,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        loop: { runId: 'external-loop' },
      }),
    );
  });

  it('marks worker lane failures when a subagent job times out', async () => {
    process.env.FITMEET_MEET_LOOP_AGENT_WORKER_TIMEOUT_MS = '1';
    const runtime = new FitMeetSubagentWorkerRuntimeService({
      getModel: jest.fn().mockReturnValue('deepseek-worker-test'),
      getTimeout: jest.fn().mockReturnValue(1000),
    } as never);

    await expect(
      runtime.submit({
        agent: 'Meet Loop Agent',
        runId: 'run-timeout',
        job: async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return 'late';
        },
      }),
    ).rejects.toThrow('Subagent worker timed out after 1ms.');

    expect(runtime.snapshot('Meet Loop Agent')[0]).toEqual(
      expect.objectContaining({
        status: 'failed',
        failedRuns: 1,
        activeRunId: null,
      }),
    );
  });
});
