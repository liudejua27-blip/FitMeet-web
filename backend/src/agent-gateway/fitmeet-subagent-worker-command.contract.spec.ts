import {
  buildFitMeetSubagentWorkerCommand,
  FITMEET_SUBAGENT_WORKER_COMMAND_CONTRACT,
  isFitMeetSubagentWorkerCommand,
  normalizeSubagentWorkerPayload,
  workerRuntimeFromSubagentPayload,
} from './fitmeet-subagent-worker-command.contract';

describe('fitmeet subagent worker command contract', () => {
  it('builds a versioned command that a worker process can normalize and execute', () => {
    const command = buildFitMeetSubagentWorkerCommand({
      runId: 'run-1',
      traceId: 'trace-1',
      agentName: 'Social Match Agent',
      queueName: 'fitmeet.subagent.social-match-agent',
      ownerUserId: 7,
      taskId: 101,
      goal: '找周末跑步搭子',
      plannerInput: { route: { intent: 'find_partner' } },
      tools: [
        { toolName: 'social_match_search_turn', input: { city: '青岛' } },
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
        modelUseCase: 'candidate_summary',
        model: 'deepseek-worker-test',
      },
    });

    expect(command).toEqual(
      expect.objectContaining({
        contract: FITMEET_SUBAGENT_WORKER_COMMAND_CONTRACT,
        version: 1,
        commandType: 'route_branch.execute',
        owner: { userId: 7 },
        task: { taskId: 101 },
        safety: {
          highRiskToolsRequireApproval: true,
          answerFromObservationsOnly: true,
        },
      }),
    );
    expect(isFitMeetSubagentWorkerCommand(command)).toBe(true);
    expect(normalizeSubagentWorkerPayload(command)).toEqual(
      expect.objectContaining({
        kind: 'route_branch',
        ownerUserId: 7,
        taskId: 101,
        agent: 'Social Match Agent',
        goal: '找周末跑步搭子',
        tools: [
          { toolName: 'social_match_search_turn', input: { city: '青岛' } },
        ],
      }),
    );
    expect(workerRuntimeFromSubagentPayload(command)).toEqual(
      expect.objectContaining({
        mode: 'queue_worker_ready',
        modelUseCase: 'candidate_summary',
        model: 'deepseek-worker-test',
      }),
    );
  });
});
