import {
  processSubagentWorkerJob,
  subagentWorkerContextForJob,
} from './subagent-worker.cli';
import { buildFitMeetSubagentWorkerCommand } from './fitmeet-subagent-worker-command.contract';
import type { SubagentWorkerJob } from './entities/agent-l5-runtime.entity';

function buildCommand(overrides: Record<string, unknown> = {}) {
  return buildFitMeetSubagentWorkerCommand({
    runId: 'run-worker-cli-1',
    traceId: 'trace-worker-cli-1',
    agentName: 'Match Agent',
    queueName: 'fitmeet.subagent.match-agent',
    ownerUserId: 7,
    taskId: 101,
    threadId: 'agent-task:101',
    goal: '找周末跑步搭子',
    plannerInput: { route: { intent: 'find_partner' } },
    tools: [
      {
        toolName: 'social_match_search_turn',
        input: { city: '青岛' },
      },
    ],
    memoryScope: 'matching.worker_memory',
    maxToolCalls: 1,
    maxRetries: 0,
    timeoutMs: 17000,
    route: { intent: 'find_partner' } as never,
    workerRuntime: {
      mode: 'queue_worker_ready',
      queueName: 'fitmeet.subagent.match-agent',
      timeoutMs: 17000,
      modelUseCase: 'candidate_summary',
      model: 'deepseek-worker-cli-test',
    },
    ...overrides,
  });
}

function buildJob(
  payload: Record<string, unknown> = buildCommand(),
): SubagentWorkerJob {
  return {
    id: 77,
    agentName: 'Match Agent',
    queueName: 'fitmeet.subagent.match-agent',
    status: 'running',
    priority: 0,
    payload,
    result: null,
    attempts: 1,
    maxAttempts: 3,
    lockedBy: 'worker-cli-test',
    lockedUntil: new Date(Date.now() + 30000),
    runId: 'run-worker-cli-1',
    traceId: 'trace-worker-cli-1',
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createQueueMock(status: SubagentWorkerJob['status'] = 'running') {
  return {
    getJob: jest.fn().mockResolvedValue({ status }),
    heartbeat: jest.fn().mockResolvedValue(undefined),
    complete: jest.fn().mockResolvedValue(undefined),
    fail: jest.fn().mockResolvedValue(undefined),
  };
}

describe('subagent-worker.cli', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it('builds queue-worker-ready context from the serialized command payload without accepting short timeouts', () => {
    const abort = new AbortController();
    const context = subagentWorkerContextForJob(
      buildJob(),
      'worker-cli-test',
      30000,
      abort.signal,
    );

    expect(context).toEqual(
      expect.objectContaining({
        workerId: 'worker-cli-test',
        agent: 'Match Agent',
        mode: 'queue_worker_ready',
        queueName: 'fitmeet.subagent.match-agent',
        timeoutMs: 30000,
        crashIsolation: true,
        scalable: true,
        modelUseCase: 'candidate_summary',
        model: 'deepseek-worker-cli-test',
        runId: 'run-worker-cli-1',
        signal: abort.signal,
      }),
    );
  });

  it('protects independently queued legacy payloads from sub-DeepSeek timeout budgets', () => {
    const command = buildCommand({
      workerRuntime: {
        mode: 'queue_worker_ready',
        queueName: 'fitmeet.subagent.match-agent',
        timeoutMs: 2500,
        modelUseCase: 'candidate_summary',
        model: 'deepseek-worker-cli-test',
      },
    });

    const context = subagentWorkerContextForJob(
      buildJob(command),
      'worker-cli-test',
      5000,
    );

    expect(context).toEqual(
      expect.objectContaining({
        modelUseCase: 'candidate_summary',
        model: 'deepseek-worker-cli-test',
        timeoutMs: 25000,
      }),
    );
  });

  it('keeps independently submitted worker payloads from downgrading runtime context to fast models', () => {
    const command = buildCommand({
      workerRuntime: {
        mode: 'queue_worker_ready',
        queueName: 'fitmeet.subagent.match-agent',
        timeoutMs: 17000,
        modelUseCase: 'candidate_summary',
        model: 'deepseek-v4-flash',
      },
    });

    const context = subagentWorkerContextForJob(
      buildJob(command),
      'worker-cli-test',
      30000,
    );

    expect(context).toEqual(
      expect.objectContaining({
        modelUseCase: 'candidate_summary',
        model: 'deepseek-v4-pro',
      }),
    );
  });

  it('keeps independently submitted worker payloads from using legacy DeepSeek aliases', () => {
    const legacyAlias = buildCommand({
      workerRuntime: {
        mode: 'queue_worker_ready',
        queueName: 'fitmeet.subagent.match-agent',
        timeoutMs: 17000,
        modelUseCase: 'candidate_summary',
        model: 'deepseek-chat',
      },
    });
    const bareAlias = buildCommand({
      workerRuntime: {
        mode: 'queue_worker_ready',
        queueName: 'fitmeet.subagent.match-agent',
        timeoutMs: 17000,
        modelUseCase: 'candidate_summary',
        model: 'deepseek-v4',
      },
    });

    expect(
      subagentWorkerContextForJob(
        buildJob(legacyAlias),
        'worker-cli-test',
        30000,
      ),
    ).toEqual(
      expect.objectContaining({
        modelUseCase: 'candidate_summary',
        model: 'deepseek-v4-pro',
      }),
    );
    expect(
      subagentWorkerContextForJob(
        buildJob(bareAlias),
        'worker-cli-test',
        30000,
      ),
    ).toEqual(
      expect.objectContaining({
        modelUseCase: 'candidate_summary',
        model: 'deepseek-v4-pro',
      }),
    );
  });

  it('does not let global fast routing mode downgrade independent worker payloads', () => {
    process.env.SOCIAL_AGENT_MODEL_ROUTING_MODE = 'fast';
    const command = buildCommand({
      workerRuntime: {
        mode: 'queue_worker_ready',
        queueName: 'fitmeet.subagent.match-agent',
        timeoutMs: 17000,
        modelUseCase: 'candidate_summary',
        model: 'deepseek-v4-flash',
      },
    });

    const context = subagentWorkerContextForJob(
      buildJob(command),
      'worker-cli-test',
      30000,
    );

    expect(context).toEqual(
      expect.objectContaining({
        modelUseCase: 'candidate_summary',
        model: 'deepseek-v4-pro',
      }),
    );
  });

  it('ignores explicit fast worker payload models even when the legacy allow-fast env is set', () => {
    process.env.FITMEET_SUBAGENT_WORKER_ALLOW_FAST_MODEL = 'true';
    const command = buildCommand({
      workerRuntime: {
        mode: 'queue_worker_ready',
        queueName: 'fitmeet.subagent.match-agent',
        timeoutMs: 17000,
        modelUseCase: 'candidate_summary',
        model: 'deepseek-v4-flash',
      },
    });

    const context = subagentWorkerContextForJob(
      buildJob(command),
      'worker-cli-test',
      30000,
    );

    expect(context).toEqual(
      expect.objectContaining({
        modelUseCase: 'candidate_summary',
        model: 'deepseek-v4-pro',
      }),
    );
  });

  it('executes a claimed DB job and acks it with a healthy idle heartbeat', async () => {
    const queue = createQueueMock();
    const workerResult = {
      handoff: { assistantMessage: '已完成候选搜索' },
      loop: { status: 'completed' },
    };
    const worker = {
      executeQueuedJob: jest.fn().mockResolvedValue(workerResult),
    };

    await processSubagentWorkerJob({
      queue: queue as never,
      worker: worker as never,
      workerId: 'worker-cli-test',
      timeoutMs: 30000,
      job: buildJob(),
    });

    expect(worker.executeQueuedJob).toHaveBeenCalledWith({
      job: expect.objectContaining({
        id: 77,
        agentName: 'Match Agent',
        queueName: 'fitmeet.subagent.match-agent',
      }),
      context: expect.objectContaining({
        mode: 'queue_worker_ready',
        crashIsolation: true,
        scalable: true,
        modelUseCase: 'candidate_summary',
        model: 'deepseek-worker-cli-test',
      }),
    });
    expect(queue.complete).toHaveBeenCalledWith(77, workerResult);
    expect(queue.fail).not.toHaveBeenCalled();
    expect(queue.heartbeat).toHaveBeenCalledWith(
      expect.objectContaining({
        workerId: 'worker-cli-test',
        queueName: 'fitmeet.subagent.match-agent',
        status: 'running',
        activeJobId: 77,
      }),
    );
    expect(queue.heartbeat).toHaveBeenCalledWith(
      expect.objectContaining({
        workerId: 'worker-cli-test',
        queueName: 'fitmeet.subagent.match-agent',
        status: 'idle',
        activeJobId: null,
      }),
    );
  });

  it('fails a claimed DB job and emits a failed heartbeat instead of crashing the worker loop', async () => {
    const queue = createQueueMock();
    const workerError = new Error('dispatcher unavailable');
    const worker = {
      executeQueuedJob: jest.fn().mockRejectedValue(workerError),
    };

    await processSubagentWorkerJob({
      queue: queue as never,
      worker: worker as never,
      workerId: 'worker-cli-test',
      timeoutMs: 30000,
      job: buildJob(),
    });

    expect(queue.complete).not.toHaveBeenCalled();
    expect(queue.fail).toHaveBeenCalledWith({
      jobId: 77,
      workerId: 'worker-cli-test',
      error: workerError,
      retryable: true,
      context: {
        processId: process.pid,
        queueName: 'fitmeet.subagent.match-agent',
      },
    });
    expect(queue.heartbeat).toHaveBeenCalledWith(
      expect.objectContaining({
        workerId: 'worker-cli-test',
        queueName: 'fitmeet.subagent.match-agent',
        status: 'failed',
        activeJobId: null,
        metadata: expect.objectContaining({
          mode: 'db_queue',
          agent: 'Match Agent',
          error: 'dispatcher unavailable',
        }),
      }),
    );
  });

  it('marks malformed worker payload failures as non-retryable', async () => {
    const queue = createQueueMock();
    const worker = {
      executeQueuedJob: jest.fn().mockRejectedValue(
        Object.assign(new Error('Unsupported subagent worker payload.'), {
          retryable: false,
        }),
      ),
    };

    await processSubagentWorkerJob({
      queue: queue as never,
      worker: worker as never,
      workerId: 'worker-cli-test',
      timeoutMs: 30000,
      job: buildJob({ malformed: true }),
    });

    expect(queue.complete).not.toHaveBeenCalled();
    expect(queue.fail).toHaveBeenCalledWith({
      jobId: 77,
      workerId: 'worker-cli-test',
      error: expect.objectContaining({
        message: 'Unsupported subagent worker payload.',
        retryable: false,
      }),
      retryable: false,
      context: {
        processId: process.pid,
        queueName: 'fitmeet.subagent.match-agent',
      },
    });
  });
});
