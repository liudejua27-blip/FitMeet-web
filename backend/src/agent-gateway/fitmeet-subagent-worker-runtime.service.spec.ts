import { FitMeetSubagentWorkerRuntimeService } from './fitmeet-subagent-worker-runtime.service';
import { buildFitMeetSubagentWorkerCommand } from './fitmeet-subagent-worker-command.contract';

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
      agent: 'Match Agent',
      runId: 'run-a',
      job: async () => {
        order.push('a:start');
        await firstGate;
        order.push('a:end');
        return 'a';
      },
    });
    const second = runtime.submit({
      agent: 'Match Agent',
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
        timeoutMs: 30000,
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

  it('defaults subagent lanes to the reasoning model when no router is injected', async () => {
    const runtime = new FitMeetSubagentWorkerRuntimeService();

    const model = await runtime.submit({
      agent: 'Match Agent',
      runId: 'run-quality-default',
      job: async (context) => {
        await Promise.resolve();
        return context.model;
      },
    });

    expect(model).toBe('deepseek-v4-pro');
    expect(runtime.snapshot('Match Agent')[0]).toEqual(
      expect.objectContaining({
        agent: 'Match Agent',
        modelUseCase: 'candidate_summary',
        model: 'deepseek-v4-pro',
      }),
    );
  });

  it('does not let per-agent worker model env silently downgrade quality lanes to fast models', async () => {
    process.env.FITMEET_MATCH_AGENT_WORKER_MODEL = 'deepseek-v4-flash';
    const runtime = new FitMeetSubagentWorkerRuntimeService({
      getModel: jest.fn().mockReturnValue('deepseek-v4-pro'),
      getTimeout: jest.fn().mockReturnValue(12000),
    } as never);

    const model = await runtime.submit({
      agent: 'Match Agent',
      runId: 'run-fast-model-env',
      job: async (context) => context.model,
    });

    expect(model).toBe('deepseek-v4-pro');
    expect(runtime.snapshot('Match Agent')[0]).toEqual(
      expect.objectContaining({
        modelUseCase: 'candidate_summary',
        model: 'deepseek-v4-pro',
      }),
    );
  });

  it('does not let global fast routing mode downgrade subagent worker reasoning', async () => {
    process.env.SOCIAL_AGENT_MODEL_ROUTING_MODE = 'fast';
    process.env.FITMEET_MATCH_AGENT_WORKER_MODEL = 'deepseek-v4-flash';
    const runtime = new FitMeetSubagentWorkerRuntimeService({
      getModel: jest.fn().mockReturnValue('deepseek-v4-pro'),
      getTimeout: jest.fn().mockReturnValue(12000),
    } as never);

    const model = await runtime.submit({
      agent: 'Match Agent',
      runId: 'run-global-fast-mode',
      job: async (context) => context.model,
    });

    expect(model).toBe('deepseek-v4-pro');
    expect(runtime.snapshot('Match Agent')[0]).toEqual(
      expect.objectContaining({
        modelUseCase: 'candidate_summary',
        model: 'deepseek-v4-pro',
      }),
    );
  });

  it('ignores explicit fast worker overrides so subagent lanes keep quality reasoning', async () => {
    process.env.FITMEET_MATCH_AGENT_WORKER_MODEL = 'deepseek-v4-flash';
    process.env.FITMEET_MATCH_AGENT_WORKER_ALLOW_FAST_MODEL = 'true';
    process.env.FITMEET_SUBAGENT_WORKER_ALLOW_FAST_MODEL = 'true';
    const runtime = new FitMeetSubagentWorkerRuntimeService({
      getModel: jest.fn().mockReturnValue('deepseek-v4-pro'),
      getTimeout: jest.fn().mockReturnValue(12000),
    } as never);

    const model = await runtime.submit({
      agent: 'Match Agent',
      runId: 'run-explicit-fast-model-env',
      job: async (context) => context.model,
    });

    expect(model).toBe('deepseek-v4-pro');
  });

  it('ignores legacy DeepSeek aliases in per-agent worker model env', async () => {
    process.env.FITMEET_MATCH_AGENT_WORKER_MODEL = 'deepseek-chat';
    const runtime = new FitMeetSubagentWorkerRuntimeService({
      getModel: jest.fn().mockReturnValue('deepseek-v4-pro'),
      getTimeout: jest.fn().mockReturnValue(12000),
    } as never);

    const model = await runtime.submit({
      agent: 'Match Agent',
      runId: 'run-legacy-worker-alias',
      job: async (context) => context.model,
    });

    expect(model).toBe('deepseek-v4-pro');
  });

  it('does not silently fallback to local execution when queue mode has no DB queue', async () => {
    process.env.FITMEET_MATCH_AGENT_WORKER_MODE = 'queue';
    process.env.FITMEET_MATCH_AGENT_WORKER_MODEL = 'deepseek-match-worker';
    process.env.FITMEET_MATCH_AGENT_WORKER_TIMEOUT_MS = '2500';
    process.env.FITMEET_MATCH_AGENT_WORKER_QUEUE = 'fitmeet.queue.match-agent';
    const runtime = new FitMeetSubagentWorkerRuntimeService({
      getModel: jest.fn().mockReturnValue('fallback-model'),
      getTimeout: jest.fn().mockReturnValue(9000),
    } as never);
    const localJob = jest.fn().mockResolvedValue({ local: true });

    await expect(
      runtime.submit({
        agent: 'Match Agent',
        runId: 'run-queue',
        job: localJob,
      }),
    ).rejects.toThrow(
      'Subagent DB queue mode is enabled, but SubagentWorkerQueueService is not available.',
    );

    expect(localJob).not.toHaveBeenCalled();
    expect(runtime.snapshot('Match Agent')[0]).toEqual(
      expect.objectContaining({
        mode: 'queue_worker_ready',
        queueName: 'fitmeet.queue.match-agent',
        timeoutMs: 9000,
        crashIsolation: true,
        scalable: true,
        modelUseCase: 'candidate_summary',
        model: 'deepseek-match-worker',
        status: 'failed',
        failedRuns: 1,
        activeRunId: null,
      }),
    );
  });

  it('uses DB queue result in queue mode instead of executing the local closure', async () => {
    process.env.FITMEET_MATCH_AGENT_WORKER_MODE = 'db_queue';
    process.env.FITMEET_SUBAGENT_WORKER_RESULT_POLL_MS = '1';
    const dbQueue = {
      enqueue: jest.fn().mockResolvedValue({ id: 44 }),
      waitForCompletion: jest.fn().mockResolvedValue({
        loop: { runId: 'external-loop' },
        handoff: { agent: 'Match Agent' },
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
      agent: 'Match Agent',
      runId: 'run-db-queue',
      serializedPayload: {
        kind: 'route_branch',
        ownerUserId: 7,
        taskId: 101,
        agent: 'Match Agent',
        goal: 'find running partner',
        plannerInput: {
          route: { intent: 'find_partner' },
          taskContext: {
            taskSlots: {
              time_window: { value: '周末下午', state: 'completed' },
              geo_area: { value: '崂山区', state: 'inferred' },
              intensity: { value: '低强度', state: 'inferred' },
            },
            pendingApprovals: [
              {
                approvalId: 'approval-publish-101',
                action: 'publish_social_request',
              },
            ],
            candidateActions: {
              savedIds: [22],
              skippedIds: [29],
            },
          },
        },
        tools: [
          {
            toolName: 'social_match_search_turn',
            input: {
              taskContext: {
                taskSlots: {
                  time_window: { value: '周末下午', state: 'completed' },
                  geo_area: { value: '崂山区', state: 'inferred' },
                  intensity: { value: '低强度', state: 'inferred' },
                },
              },
            },
          },
        ],
        route: { intent: 'find_partner' },
        taskContext: {
          taskSlots: {
            time_window: { value: '周末下午', state: 'completed' },
          },
        },
      },
      job: localJob,
    });

    expect(localJob).not.toHaveBeenCalled();
    expect(dbQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        agentName: 'Match Agent',
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
          plannerInput: expect.objectContaining({
            taskContext: expect.objectContaining({
              taskSlots: expect.objectContaining({
                time_window: expect.objectContaining({
                  value: '周末下午',
                  state: 'completed',
                }),
              }),
              pendingApprovals: [
                {
                  approvalId: 'approval-publish-101',
                  action: 'publish_social_request',
                },
              ],
              candidateActions: {
                savedIds: [22],
                skippedIds: [29],
              },
            }),
          }),
          toolPlan: expect.objectContaining({
            tools: [
              expect.objectContaining({
                toolName: 'social_match_search_turn',
                input: expect.objectContaining({
                  taskContext: expect.objectContaining({
                    taskSlots: expect.objectContaining({
                      time_window: expect.objectContaining({
                        value: '周末下午',
                        state: 'completed',
                      }),
                      geo_area: expect.objectContaining({
                        value: '崂山区',
                        state: 'inferred',
                      }),
                      intensity: expect.objectContaining({
                        value: '低强度',
                        state: 'inferred',
                      }),
                    }),
                  }),
                }),
              }),
            ],
          }),
          routeBranch: expect.objectContaining({
            taskContext: expect.objectContaining({
              taskSlots: expect.objectContaining({
                time_window: expect.objectContaining({
                  value: '周末下午',
                  state: 'completed',
                }),
                geo_area: expect.objectContaining({
                  value: '崂山区',
                  state: 'inferred',
                }),
                intensity: expect.objectContaining({
                  value: '低强度',
                  state: 'inferred',
                }),
              }),
              pendingApprovals: [
                {
                  approvalId: 'approval-publish-101',
                  action: 'publish_social_request',
                },
              ],
              candidateActions: {
                savedIds: [22],
                skippedIds: [29],
              },
            }),
            contextSnapshot: expect.objectContaining({
              pendingApprovals: [
                {
                  approvalId: 'approval-publish-101',
                  action: 'publish_social_request',
                },
              ],
              candidateActions: {
                savedIds: [22],
                skippedIds: [29],
              },
              knownTaskSlotConstraints: expect.objectContaining({
                doNotAskAgainFor: expect.arrayContaining(['time_window']),
                knownSlots: expect.arrayContaining([
                  expect.objectContaining({
                    key: 'geo_area',
                    confirmation: 'inferred_context',
                  }),
                  expect.objectContaining({
                    key: 'intensity',
                    confirmation: 'inferred_context',
                  }),
                ]),
              }),
            }),
          }),
          safety: {
            highRiskToolsRequireApproval: true,
            answerFromObservationsOnly: true,
          },
        }),
      }),
    );
    const enqueuedPayload = dbQueue.enqueue.mock.calls[0]?.[0]?.payload as {
      routeBranch?: {
        contextSnapshot?: {
          knownTaskSlotConstraints?: { doNotAskAgainFor?: string[] };
        };
      };
    };
    expect(
      enqueuedPayload.routeBranch?.contextSnapshot?.knownTaskSlotConstraints
        ?.doNotAskAgainFor,
    ).toEqual(expect.not.arrayContaining(['geo_area', 'intensity']));
    const enqueuedTaskContext = enqueuedPayload.routeBranch
      ?.contextSnapshot as {
      taskSlots?: Record<string, unknown>;
      knownTaskSlotConstraints?: {
        knownSlots?: Array<{ key: string; confirmation: string }>;
      };
    };
    expect(enqueuedTaskContext.taskSlots).toEqual(
      expect.objectContaining({
        geo_area: expect.objectContaining({ state: 'inferred' }),
        intensity: expect.objectContaining({ state: 'inferred' }),
      }),
    );
    expect(enqueuedTaskContext.knownTaskSlotConstraints).toEqual(
      expect.objectContaining({
        knownSlots: expect.arrayContaining([
          expect.objectContaining({
            key: 'geo_area',
            confirmation: 'inferred_context',
          }),
          expect.objectContaining({
            key: 'intensity',
            confirmation: 'inferred_context',
          }),
        ]),
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

  it('accepts a versioned worker command in DB queue mode without repacking through legacy payloads', async () => {
    process.env.FITMEET_MATCH_AGENT_WORKER_MODE = 'db_queue';
    process.env.FITMEET_SUBAGENT_WORKER_RESULT_POLL_MS = '1';
    const command = buildFitMeetSubagentWorkerCommand({
      runId: 'run-versioned-command',
      traceId: 'trace-versioned-command',
      commandId: 'cmd-versioned-command',
      submittedAt: '2026-06-17T00:00:00.000Z',
      agentName: 'Match Agent',
      queueName: 'fitmeet.subagent.social-match-agent',
      ownerUserId: 7,
      taskId: 101,
      threadId: 'agent-task:101',
      goal: 'find a walking partner near Qingdao University',
      plannerInput: {
        route: { intent: 'find_partner' },
        taskContext: {
          taskSlots: {
            time_window: { value: '今天晚上', state: 'completed' },
            location_text: { value: '青岛大学附近', state: 'completed' },
            activity: { value: '散步', state: 'completed' },
          },
        },
      },
      tools: [
        {
          toolName: 'social_match_search_turn',
          input: {
            taskContext: {
              taskSlots: {
                time_window: { value: '今天晚上', state: 'completed' },
              },
            },
          },
        },
      ],
      memoryScope: 'matching.worker_memory',
      maxToolCalls: 1,
      maxRetries: 0,
      timeoutMs: 15000,
      route: { intent: 'find_partner' } as never,
      workerRuntime: {
        mode: 'queue_worker_ready',
        queueName: 'fitmeet.subagent.social-match-agent',
        timeoutMs: 15000,
        crashIsolation: true,
        scalable: true,
        modelUseCase: 'candidate_summary',
        model: 'deepseek-worker-test',
        runId: 'run-versioned-command',
      },
    });
    const dbQueue = {
      enqueue: jest.fn().mockResolvedValue({ id: 45 }),
      waitForCompletion: jest.fn().mockResolvedValue({
        loop: { runId: 'external-loop-versioned' },
        handoff: { agent: 'Match Agent' },
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
      agent: 'Match Agent',
      runId: 'run-versioned-command',
      serializedPayload: command,
      job: localJob,
    });

    expect(localJob).not.toHaveBeenCalled();
    expect(dbQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        agentName: 'Match Agent',
        queueName: 'fitmeet.subagent.social-match-agent',
        payload: command,
        runId: 'run-versioned-command',
        traceId: 'run-versioned-command',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        loop: { runId: 'external-loop-versioned' },
      }),
    );
  });

  it('does not let short result wait env make DB queue subagents fail before the worker budget', async () => {
    process.env.FITMEET_MATCH_AGENT_WORKER_MODE = 'db_queue';
    process.env.FITMEET_SUBAGENT_WORKER_RESULT_TIMEOUT_MS = '1';
    const dbQueue = {
      enqueue: jest.fn().mockResolvedValue({ id: 46 }),
      waitForCompletion: jest.fn().mockResolvedValue({
        loop: { runId: 'external-loop-quality-timeout' },
      }),
    };
    const runtime = new FitMeetSubagentWorkerRuntimeService(
      {
        getModel: jest.fn().mockReturnValue('deepseek-v4-pro'),
        getTimeout: jest.fn().mockReturnValue(25_000),
      } as never,
      undefined,
      dbQueue as never,
    );

    await runtime.submit({
      agent: 'Match Agent',
      runId: 'run-result-timeout-floor',
      serializedPayload: {
        kind: 'route_branch',
        ownerUserId: 7,
        taskId: 101,
        agent: 'Match Agent',
        goal: 'find a walking partner',
        plannerInput: { route: { intent: 'find_partner' } },
        tools: [{ toolName: 'social_match_search_turn', input: {} }],
        route: { intent: 'find_partner' },
      },
      job: jest.fn().mockResolvedValue({ local: true }),
    });

    expect(dbQueue.waitForCompletion).toHaveBeenCalledWith(
      46,
      expect.objectContaining({
        timeoutMs: 50_000,
      }),
    );
  });

  it('rejects versioned worker commands that target a different queue lane', async () => {
    process.env.FITMEET_MATCH_AGENT_WORKER_MODE = 'db_queue';
    const command = buildFitMeetSubagentWorkerCommand({
      runId: 'run-wrong-lane',
      agentName: 'Match Agent',
      queueName: 'fitmeet.subagent.other-lane',
      ownerUserId: 7,
      taskId: 101,
      goal: 'find a walking partner',
      plannerInput: { route: { intent: 'find_partner' } },
      tools: [{ toolName: 'social_match_search_turn', input: {} }],
      route: { intent: 'find_partner' } as never,
      workerRuntime: {
        mode: 'queue_worker_ready',
        queueName: 'fitmeet.subagent.other-lane',
      },
    });
    const dbQueue = {
      enqueue: jest.fn(),
      waitForCompletion: jest.fn(),
    };
    const runtime = new FitMeetSubagentWorkerRuntimeService(
      {
        getModel: jest.fn().mockReturnValue('deepseek-worker-test'),
        getTimeout: jest.fn().mockReturnValue(1000),
      } as never,
      undefined,
      dbQueue as never,
    );

    await expect(
      runtime.submit({
        agent: 'Match Agent',
        runId: 'run-wrong-lane',
        serializedPayload: command,
        job: jest.fn(),
      }),
    ).rejects.toThrow(
      'Subagent DB queue command does not match the requested worker lane.',
    );
    expect(dbQueue.enqueue).not.toHaveBeenCalled();
  });

  it('rejects malformed DB queue payloads before enqueueing worker jobs', async () => {
    process.env.FITMEET_MATCH_AGENT_WORKER_MODE = 'db_queue';
    const dbQueue = {
      enqueue: jest.fn(),
      waitForCompletion: jest.fn(),
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

    await expect(
      runtime.submit({
        agent: 'Match Agent',
        runId: 'run-malformed-payload',
        serializedPayload: { malformed: true },
        job: localJob,
      }),
    ).rejects.toThrow(
      'Subagent DB queue mode requires a serializable route branch command payload.',
    );

    expect(dbQueue.enqueue).not.toHaveBeenCalled();
    expect(localJob).not.toHaveBeenCalled();
  });

  it('marks worker lane failures when a subagent job times out', async () => {
    process.env.FITMEET_MATCH_AGENT_WORKER_TIMEOUT_MS = '1';
    const runtime = new FitMeetSubagentWorkerRuntimeService({
      getModel: jest.fn().mockReturnValue('deepseek-worker-test'),
      getTimeout: jest.fn().mockReturnValue(1),
    } as never);
    const jobSignalRef: { current: AbortSignal | null } = { current: null };
    let timeoutAbortObserved = false;

    await expect(
      runtime.submit({
        agent: 'Match Agent',
        runId: 'run-timeout',
        job: async (context) => {
          jobSignalRef.current = context.signal ?? null;
          context.signal?.addEventListener('abort', () => {
            timeoutAbortObserved = true;
          });
          await new Promise((resolve) => setTimeout(resolve, 20));
          return 'late';
        },
      }),
    ).rejects.toThrow('Subagent worker timed out after 1ms.');

    expect(timeoutAbortObserved).toBe(true);
    expect(jobSignalRef.current?.aborted).toBe(true);
    expect((jobSignalRef.current?.reason as Error | undefined)?.message).toBe(
      'Subagent worker timed out after 1ms.',
    );
    expect(runtime.snapshot('Match Agent')[0]).toEqual(
      expect.objectContaining({
        status: 'failed',
        failedRuns: 1,
        activeRunId: null,
      }),
    );
  });

  it('links caller abort into the resident worker job signal', async () => {
    const runtime = new FitMeetSubagentWorkerRuntimeService({
      getModel: jest.fn().mockReturnValue('deepseek-worker-test'),
    } as never);
    const controller = new AbortController();
    const jobSignalRef: { current: AbortSignal | null } = { current: null };
    let started: () => void = () => undefined;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });

    const run = runtime.submit({
      agent: 'Match Agent',
      runId: 'run-client-abort',
      signal: controller.signal,
      job: async (context) => {
        jobSignalRef.current = context.signal ?? null;
        started();
        await new Promise<never>((_, reject) => {
          context.signal?.addEventListener('abort', () => {
            const reason: unknown = context.signal?.reason;
            reject(reason instanceof Error ? reason : new Error('aborted'));
          });
        });
      },
    });

    await startedPromise;
    controller.abort(new Error('client_aborted'));

    await expect(run).rejects.toThrow('client_aborted');
    expect(jobSignalRef.current?.aborted).toBe(true);
    expect((jobSignalRef.current?.reason as Error | undefined)?.message).toBe(
      'client_aborted',
    );
    expect(runtime.snapshot('Match Agent')[0]).toEqual(
      expect.objectContaining({
        status: 'failed',
        failedRuns: 1,
        activeRunId: null,
      }),
    );
  });
});
