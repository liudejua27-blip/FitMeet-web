import {
  AgentTask,
  AgentTaskEventType,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentQueuedRunService } from './social-agent-queued-run.service';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    agentConnectionId: null,
    taskType: 'social_agent_chat',
    title: 'FitMeet Social Agent 聊天任务',
    goal: '今晚青岛轻松跑步',
    input: {},
    plan: [],
    toolCalls: [],
    result: {},
    memory: {},
    status: AgentTaskStatus.Pending,
    permissionMode: AgentTaskPermissionMode.Confirm,
    riskLevel: 'low' as never,
    idempotencyKey: null,
    statusReason: null,
    error: null,
    startedAt: null,
    awaitingConfirmationAt: null,
    completedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  } as AgentTask;
}

function makeHarness() {
  const savedEvents: Array<Record<string, unknown>> = [];
  const eventRepo = {
    create: jest.fn((input) => ({
      id: savedEvents.length + 1,
      stepId: null,
      toolCallId: null,
      createdAt: new Date(savedEvents.length),
      ...input,
    })),
    save: jest.fn((input) => {
      savedEvents.push(input);
      return Promise.resolve(input);
    }),
  };
  const service = new SocialAgentQueuedRunService(
    eventRepo as never,
    {} as never,
    {} as never,
  );

  return { eventRepo, savedEvents, service };
}

describe('SocialAgentQueuedRunService', () => {
  it('safe truncates long social agent timeline event summaries', async () => {
    const { eventRepo, savedEvents, service } = makeHarness();

    await (
      service as unknown as {
        writeEvent: (
          task: AgentTask,
          eventType: AgentTaskEventType,
          summary: string,
          payload: Record<string, unknown>,
        ) => Promise<void>;
      }
    ).writeEvent(
      makeTask(),
      AgentTaskEventType.SocialAgentMessageAssistant,
      'summary_'.repeat(100),
      { message: '完整内容放在 payload 里' },
    );

    expect(eventRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 101,
        ownerUserId: 7,
        eventType: AgentTaskEventType.SocialAgentMessageAssistant,
      }),
    );
    expect(String(savedEvents[0].summary).length).toBeLessThanOrEqual(500);
    expect(savedEvents[0].summary).toMatch(/…$/);
    expect(savedEvents[0].payload).toMatchObject({
      message: '完整内容放在 payload 里',
    });
  });
});
