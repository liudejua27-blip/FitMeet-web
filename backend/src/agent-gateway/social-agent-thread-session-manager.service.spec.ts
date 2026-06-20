import { AgentTaskPermissionMode } from './entities/agent-task.entity';
import { SocialAgentThreadSessionManager } from './social-agent-thread-session-manager.service';
import { inferSocialAgentThreadTitle } from './social-agent-thread-title.util';

describe('SocialAgentThreadSessionManager', () => {
  function harness() {
    const taskLifecycle = {
      ensureConversationTask: jest.fn().mockResolvedValue({
        id: 202,
        title: '周末青岛大学散步搭子',
      }),
      createOrReuseTask: jest.fn().mockResolvedValue({
        id: 303,
        title: '新对话',
      }),
    };
    return {
      taskLifecycle,
      service: new SocialAgentThreadSessionManager(taskLifecycle as never),
    };
  }

  it('gets or creates the active thread through the conversation task path', async () => {
    const { service, taskLifecycle } = harness();

    await expect(service.getOrCreateActiveThread(7)).resolves.toMatchObject({
      id: 202,
    });

    expect(taskLifecycle.ensureConversationTask).toHaveBeenCalledWith(
      7,
      null,
      '新对话',
      null,
      null,
    );
    expect(taskLifecycle.createOrReuseTask).not.toHaveBeenCalled();
  });

  it('creates a new thread only through the explicit new chat action', async () => {
    const { service, taskLifecycle } = harness();

    await expect(
      service.createThreadOnlyWhenUserExplicitlyStartsNewChat(7),
    ).resolves.toMatchObject({ id: 303 });

    expect(taskLifecycle.createOrReuseTask).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        goal: '',
        permissionMode: AgentTaskPermissionMode.Confirm,
        idempotencyKey: expect.stringMatching(/^agent-thread:7:/),
      }),
    );
    expect(taskLifecycle.ensureConversationTask).not.toHaveBeenCalled();
  });

  it('resolves ordinary messages into the active thread instead of creating a new thread', async () => {
    const { service, taskLifecycle } = harness();

    await expect(
      service.resolveActiveThreadForMessage({
        userId: 7,
        taskId: null,
        threadId: 'agent-task:202',
        message: '可以，帮我继续找人',
        idempotencyKey: 'message-1',
      }),
    ).resolves.toMatchObject({ id: 202 });

    expect(taskLifecycle.ensureConversationTask).toHaveBeenCalledWith(
      7,
      null,
      '可以，帮我继续找人',
      'message-1',
      'agent-task:202',
    );
    expect(taskLifecycle.createOrReuseTask).not.toHaveBeenCalled();
  });

  it('accepts checkpoint-style thread ids from the frontend without explicit new chat creation', async () => {
    const { service, taskLifecycle } = harness();

    await expect(
      service.resolveActiveThreadForMessage({
        userId: 7,
        taskId: null,
        threadId: 'agent-task:202',
        message: '周末下午可以，继续帮我找青岛大学附近散步搭子',
        idempotencyKey: 'message-2',
      }),
    ).resolves.toMatchObject({ id: 202 });

    expect(taskLifecycle.ensureConversationTask).toHaveBeenCalledWith(
      7,
      null,
      '周末下午可以，继续帮我找青岛大学附近散步搭子',
      'message-2',
      'agent-task:202',
    );
    expect(taskLifecycle.createOrReuseTask).not.toHaveBeenCalled();
  });

  it('keeps task-bound follow-up messages in the same thread', async () => {
    const { service, taskLifecycle } = harness();

    await expect(
      service.resolveActiveThreadForMessage({
        userId: 7,
        taskId: 202,
        threadId: 'agent-task:202',
        message: '可以发布到发现',
        idempotencyKey: 'message-3',
      }),
    ).resolves.toMatchObject({ id: 202 });

    expect(taskLifecycle.ensureConversationTask).toHaveBeenCalledWith(
      7,
      202,
      '可以发布到发现',
      'message-3',
      'agent-task:202',
    );
    expect(taskLifecycle.createOrReuseTask).not.toHaveBeenCalled();
  });

  it('binds visible thread ids to the canonical task id', () => {
    const { service } = harness();

    expect(service.bindThreadToTask('agent-task:202', 202)).toEqual({
      threadId: 'agent-task:202',
      taskId: 202,
    });
    expect(service.bindThreadToTask(202, 202)).toEqual({
      threadId: 'agent-task:202',
      taskId: 202,
    });
  });

  it('generates product titles from the first social intent', () => {
    const { service } = harness();

    expect(
      service.generateThreadTitleFromIntent('周末下午，散步，崂山区青岛大学'),
    ).toBe('周末青岛大学散步搭子');
    expect(service.generateThreadTitleFromIntent('你有什么功能')).toBe(
      '普通聊天：功能咨询',
    );
    expect(
      service.generateThreadTitleFromIntent(
        '请用两句话帮我安排今天的训练恢复，不要帮我找人，也不要推荐活动。',
      ),
    ).toBe('普通聊天：训练恢复建议');
  });

  it('replaces timestamp-like legacy FitMeet titles with the first useful intent', () => {
    expect(
      inferSocialAgentThreadTitle({
        title: 'FitMeet Social Agent 聊天在 2026-06-17 09:55',
        firstMessage: '周末下午，羽毛球，青岛大学附近',
      }),
    ).toBe('周末青岛大学羽毛球搭子');
    expect(
      inferSocialAgentThreadTitle({
        title: 'FitMeet Social Agent chat at 2026-06-17 09:55',
        firstMessage: '你有什么功能',
      }),
    ).toBe('普通聊天：功能咨询');
  });
});
