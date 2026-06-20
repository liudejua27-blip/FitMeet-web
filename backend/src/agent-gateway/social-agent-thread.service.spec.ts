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

  it('derives legacy thread titles and counts from persisted Social Codex conversation memory', async () => {
    const task = createTask({
      title: 'FitMeet Social Agent 聊天在 2026-06-17 09:55',
      goal: '我已经保留当前对话。你可以稍后再试一次。',
      memory: {
        socialAgentConversation: {
          turns: [
            {
              role: 'user',
              text: '我想今晚在青岛大学附近散步，最好找舞蹈相关的女生',
              at: '2026-06-17T09:55:00.000Z',
            },
            {
              role: 'assistant',
              text: '我会按这个方向继续找。',
              at: '2026-06-17T09:55:02.000Z',
            },
          ],
        },
      },
    });
    const service = new SocialAgentThreadService(
      { find: jest.fn().mockResolvedValue([task]) } as never,
      { getTaskSession: jest.fn() } as never,
      { assertTaskOwner: jest.fn(), createOrReuseTask: jest.fn() } as never,
    );

    await expect(service.list(7)).resolves.toEqual({
      threads: [
        expect.objectContaining({
          title: '今晚青岛大学散步搭子',
          preview: '我想今晚在青岛大学附近散步，最好找舞蹈相关的女生',
          messageCount: 2,
        }),
      ],
    });
  });

  it('does not query demo task types for the production ThreadList', async () => {
    const task = createTask({
      title: '普通聊天：功能咨询',
      goal: '你有什么功能',
    });
    const taskRepo = { find: jest.fn().mockResolvedValue([task]) };
    const service = new SocialAgentThreadService(
      taskRepo as never,
      { getTaskSession: jest.fn() } as never,
      { assertTaskOwner: jest.fn(), createOrReuseTask: jest.fn() } as never,
    );

    await service.list(7);

    const query = taskRepo.find.mock.calls[0]?.[0] as {
      where?: { taskType?: { _value?: string[] } };
    };
    expect(query.where?.taskType?._value).toEqual(
      expect.arrayContaining(['social_agent_chat', 'social_search']),
    );
    expect(query.where?.taskType?._value).not.toEqual(
      expect.arrayContaining(['social_agent_demo']),
    );
  });

  it('hides failed unbound legacy tasks from the thread list', async () => {
    const goodTask = createTask({
      id: 42,
      title: '普通聊天：功能咨询',
      goal: '你有什么功能',
    });
    const failedUnboundTask = createTask({
      id: 68,
      title: 'FitMeet Social Agent 聊天',
      goal: '你真笨',
      status: AgentTaskStatus.Failed,
      statusReason: 'task_conversation_unbound',
    });
    const service = new SocialAgentThreadService(
      { find: jest.fn().mockResolvedValue([failedUnboundTask, goodTask]) } as never,
      { getTaskSession: jest.fn() } as never,
      { assertTaskOwner: jest.fn(), createOrReuseTask: jest.fn() } as never,
    );

    await expect(service.list(7)).resolves.toEqual({
      threads: [
        expect.objectContaining({
          id: 'agent-task:42',
          threadId: 'agent-task:42',
          taskId: 42,
          title: '普通聊天：功能咨询',
        }),
      ],
    });
  });

  it('treats failed unbound legacy task threads as not found', async () => {
    const failedUnboundTask = createTask({
      id: 68,
      status: AgentTaskStatus.Failed,
      statusReason: 'task_conversation_unbound',
    });
    const service = new SocialAgentThreadService(
      { find: jest.fn(), save: jest.fn() } as never,
      { getTaskSession: jest.fn() } as never,
      {
        assertTaskOwner: jest.fn().mockResolvedValue(failedUnboundTask),
        createOrReuseTask: jest.fn(),
      } as never,
    );

    await expect(service.get(7, 68)).rejects.toThrow(
      'Social agent thread 68 not found',
    );
  });
});

describe('inferSocialAgentThreadTitle', () => {
  it('turns generic prompts into useful chat titles', () => {
    expect(inferSocialAgentThreadTitle({ goal: '你有什么功能' })).toBe('普通聊天：功能咨询');
    expect(inferSocialAgentThreadTitle({ goal: '今晚青岛轻松跑步' })).toBe('今晚青岛跑步搭子');
    expect(
      inferSocialAgentThreadTitle({
        goal: '请用两句话帮我安排今天的训练恢复，不要帮我找人，也不要推荐活动。',
      }),
    ).toBe('普通聊天：训练恢复建议');
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
