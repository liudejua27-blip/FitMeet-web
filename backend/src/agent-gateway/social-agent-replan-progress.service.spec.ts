import {
  AgentTask,
  AgentTaskEventType,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentReplanProgressService } from './social-agent-replan-progress.service';
import type { SocialAgentVisibleStep } from './social-agent-chat.types';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    result: {},
    memory: {},
    status: AgentTaskStatus.Planning,
    ...overrides,
  } as AgentTask;
}

function makeHarness(nextTask = makeTask()) {
  const savedEvents: Array<Record<string, unknown>> = [];
  const eventRepo = {
    create: jest.fn((input: Record<string, unknown>) => input),
    save: jest.fn((input: Record<string, unknown>) => {
      savedEvents.push(input);
      return Promise.resolve(input);
    }),
  };
  const runState = {
    updateRunSnapshot: jest.fn().mockResolvedValue(nextTask),
  };
  const service = new SocialAgentReplanProgressService(
    eventRepo as never,
    runState as never,
  );
  return { eventRepo, runState, savedEvents, service };
}

describe('SocialAgentReplanProgressService', () => {
  it('records replan progress steps, timeline events, and run snapshots', async () => {
    const task = makeTask();
    const nextTask = makeTask({ id: 101, memory: { preserved: true } });
    const { runState, savedEvents, service } = makeHarness(nextTask);
    const visibleSteps: SocialAgentVisibleStep[] = [
      {
        id: 'follow_up_understand',
        label: '正在理解你的补充要求',
        status: 'done',
      },
    ];

    const result = await service.completeStep({
      task,
      ownerUserId: 7,
      taskId: 101,
      runId: 'sar_replan_1',
      visibleSteps,
      id: 'search',
      label: '已重新检索附近候选人',
      eventType: AgentTaskEventType.ToolReturned,
      payload: { candidateCount: 3 },
    });

    expect(result).toEqual({
      task: nextTask,
      visibleSteps: [
        ...visibleSteps,
        { id: 'search', label: '已重新检索附近候选人', status: 'done' },
      ],
    });
    expect(task.memory?.shortTerm).toMatchObject({
      currentStep: {
        id: 'search',
        label: '已重新检索附近候选人',
        status: 'done',
      },
      steps: expect.arrayContaining([
        expect.objectContaining({ id: 'search', status: 'done' }),
      ]),
    });
    expect(savedEvents).toEqual([
      expect.objectContaining({
        eventType: AgentTaskEventType.ToolReturned,
        ownerUserId: 7,
        payload: { candidateCount: 3 },
        summary: '已重新检索附近候选人',
        taskId: 101,
      }),
    ]);
    expect(runState.updateRunSnapshot).toHaveBeenCalledWith(
      7,
      101,
      'sar_replan_1',
      {
        status: 'running',
        phase: 'search',
        message: '已重新检索附近候选人',
        visibleSteps: [
          ...visibleSteps,
          { id: 'search', label: '已重新检索附近候选人', status: 'done' },
        ],
      },
      expect.any(Function),
    );
  });
});
