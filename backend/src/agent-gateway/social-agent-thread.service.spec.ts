import { SocialAgentThreadService } from './social-agent-thread.service';
import { inferSocialAgentThreadTitle } from './social-agent-thread-title.util';
import {
  AgentTaskPermissionMode,
  AgentTaskStatus,
  type AgentTask,
} from './entities/agent-task.entity';

describe('SocialAgentThreadService', () => {
  it('merges assistant thread metadata across branch and message syncs', async () => {
    const task = createTask();
    const taskRepo = {
      find: jest.fn(),
      save: jest.fn((nextTask: AgentTask) => {
        Object.assign(task, nextTask);
        task.updatedAt = new Date('2026-06-13T08:00:00.000Z');
        return Promise.resolve(task);
      }),
    };
    const taskLifecycle = {
      assertTaskOwner: jest.fn().mockResolvedValue(task),
      createOrReuseTask: jest.fn(),
    };
    const service = new SocialAgentThreadService(
      taskRepo as never,
      { getTaskSession: jest.fn() } as never,
      taskLifecycle as never,
    );

    await service.update(
      7,
      42,
      undefined,
      {
        activeBranchId: 'assistant-v1',
        branchSelections: { 'branch-user-1': 1 },
        branchCount: 2,
        parentMessageId: 'branch-user-1',
        updatedAt: '2026-06-13T07:00:00.000Z',
      },
      {
        branchSync: {
          action: 'previous',
          groupId: 'branch-user-1',
          activeIndex: 1,
        },
        client: 'fitmeet-web',
      },
    );

    await service.update(7, 42, undefined, undefined, {
      messageCount: 4,
      latestMessageId: 'assistant-v1',
      client: 'fitmeet-web',
    });

    expect(task.memory?.assistantThread).toMatchObject({
      activeBranchId: 'assistant-v1',
      branchSelections: { 'branch-user-1': 1 },
      branchCount: 2,
      parentMessageId: 'branch-user-1',
      metadata: {
        branchSync: {
          action: 'previous',
          groupId: 'branch-user-1',
          activeIndex: 1,
        },
        client: 'fitmeet-web',
        messageCount: 4,
        latestMessageId: 'assistant-v1',
      },
    });
  });

  it('uses human-readable titles for generic legacy thread names', async () => {
    const task = createTask({
      title: 'FitMeet Social Agent 聊天',
      goal: '我想找周末上海羽毛球搭子',
    });
    const service = new SocialAgentThreadService(
      { find: jest.fn().mockResolvedValue([task]) } as never,
      { getTaskSession: jest.fn() } as never,
      { assertTaskOwner: jest.fn(), createOrReuseTask: jest.fn() } as never,
    );

    await expect(service.list(7)).resolves.toEqual({
      threads: [
        expect.objectContaining({
          title: '周末上海羽毛球搭子',
        }),
      ],
    });
  });
});

describe('inferSocialAgentThreadTitle', () => {
  it('turns generic prompts into useful chat titles', () => {
    expect(inferSocialAgentThreadTitle({ goal: '你有什么功能' })).toBe('普通聊天：功能咨询');
    expect(inferSocialAgentThreadTitle({ goal: '今晚青岛轻松跑步' })).toBe('今晚青岛跑步搭子');
  });
});

function createTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 42,
    ownerUserId: 7,
    title: '分支对话',
    goal: '给我两个回答版本',
    taskType: 'social_agent_chat',
    status: AgentTaskStatus.AwaitingFeedback,
    permissionMode: AgentTaskPermissionMode.Confirm,
    memory: {},
    result: {},
    createdAt: new Date('2026-06-13T07:00:00.000Z'),
    updatedAt: new Date('2026-06-13T07:00:00.000Z'),
    ...overrides,
  } as unknown as AgentTask;
}
