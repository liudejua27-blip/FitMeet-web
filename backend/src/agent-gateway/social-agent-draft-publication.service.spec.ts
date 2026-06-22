import {
  SocialRequestType,
  SocialRequestVisibility,
  UserSocialRequestStatus,
} from '../social-requests/social-request.entity';
import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentDraftPublicationService } from './social-agent-draft-publication.service';
import { SocialAgentToolName } from './social-agent-tool-executor.service';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    taskType: 'social_agent_chat',
    title: 'FitMeet Social Agent 聊天任务',
    goal: '今晚青岛轻松跑步',
    result: {},
    memory: {},
    status: AgentTaskStatus.AwaitingConfirmation,
    permissionMode: AgentTaskPermissionMode.Confirm,
    ...overrides,
  } as AgentTask;
}

function makeHarness(initialTask = makeTask()) {
  const savedEvents: Array<Record<string, unknown>> = [];
  let task = initialTask;
  const taskRepo = {
    findOne: jest.fn().mockImplementation(() => Promise.resolve(task)),
    save: jest.fn().mockImplementation((input: AgentTask) => {
      task = input;
      return Promise.resolve(input);
    }),
  };
  const eventRepo = {
    create: jest.fn((input: Record<string, unknown>) => input),
    save: jest.fn((input: Record<string, unknown>) => {
      savedEvents.push(input);
      return Promise.resolve(input);
    }),
  };
  const executor = {
    executeToolAction: jest.fn().mockResolvedValue({
      id: 'action_create_social_request_publish_1',
      toolName: SocialAgentToolName.CreateSocialRequest,
      status: 'succeeded',
      output: {
        id: 301,
        socialRequestId: 301,
        publicIntentId: 'social_request_301',
        synced: true,
        socialRequest: {
          id: 301,
          status: UserSocialRequestStatus.Matching,
        },
      },
      error: null,
    }),
  };
  const longTermMemory = {
    summarizeTask: jest.fn().mockResolvedValue(undefined),
  };
  const service = new SocialAgentDraftPublicationService(
    taskRepo as never,
    eventRepo as never,
    executor as never,
    longTermMemory as never,
  );
  return {
    eventRepo,
    executor,
    longTermMemory,
    savedEvents,
    service,
    taskRepo,
    get task() {
      return task;
    },
  };
}

describe('SocialAgentDraftPublicationService', () => {
  it('publishes a staged social request only after explicit confirmation', async () => {
    const { executor, longTermMemory, savedEvents, service, task } =
      makeHarness();

    const result = await service.publishDraft(7, 101, {
      socialRequestId: 301,
      type: SocialRequestType.RunningPartner,
      rawText: '今晚青岛轻松跑步',
      title: '今晚青岛轻松跑步',
      visibility: SocialRequestVisibility.Private,
      status: UserSocialRequestStatus.Draft,
    });

    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.CreateSocialRequest,
      expect.objectContaining({
        socialRequestId: 301,
        mode: 'publish',
        publish: true,
        visibility: SocialRequestVisibility.Public,
        status: UserSocialRequestStatus.Matching,
        requireUserConfirmation: true,
        syncPublicIntent: true,
        metadata: expect.objectContaining({
          agentTaskId: 101,
          confirmationSource: 'social_agent_chat',
        }),
      }),
      7,
    );
    expect(result).toMatchObject({
      success: true,
      taskId: 101,
      socialRequestId: 301,
      publicIntentId: 'social_request_301',
      discoverHref: '/public-intent/social_request_301',
      status: 'published',
      taskStatus: AgentTaskStatus.Succeeded,
      synced: true,
      toolCallId: 'action_create_social_request_publish_1',
      socialRequest: { id: 301, status: UserSocialRequestStatus.Matching },
    });
    expect(task.status).toBe(AgentTaskStatus.Succeeded);
    expect(task.result).toMatchObject({
      publishSocialRequest: {
        socialRequestId: 301,
        publicIntentId: 'social_request_301',
        discoverHref: '/public-intent/social_request_301',
        status: 'published',
        synced: true,
      },
    });
    expect(task.memory).toMatchObject({
      shortTerm: {
        publishedSocialRequestId: 301,
        socialRequestId: 301,
        publicIntentId: 'social_request_301',
        discoverHref: '/public-intent/social_request_301',
        publishStatus: 'published',
      },
    });
    expect(savedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'confirmation.received',
          summary: '用户确认发布约练',
        }),
      ]),
    );
    expect(longTermMemory.summarizeTask).toHaveBeenCalledWith(task);
  });

  it('surfaces publish tool failures', async () => {
    const { executor, service } = makeHarness();
    executor.executeToolAction.mockResolvedValueOnce({
      id: 'action_create_social_request_publish_1',
      toolName: SocialAgentToolName.CreateSocialRequest,
      status: 'failed',
      output: null,
      error: { message: 'public intent sync failed' },
    } as never);

    await expect(
      service.publishDraft(7, 101, {
        socialRequestId: 301,
        type: SocialRequestType.RunningPartner,
        rawText: '今晚青岛轻松跑步',
        title: '今晚青岛轻松跑步',
        visibility: SocialRequestVisibility.Private,
        status: UserSocialRequestStatus.Draft,
      }),
    ).rejects.toThrow('public intent sync failed');
  });

  it('keeps publish requests pending when the tool requires approval', async () => {
    const { executor, savedEvents, service, task } = makeHarness();
    executor.executeToolAction.mockResolvedValueOnce({
      id: 'action_create_social_request_publish_approval',
      toolName: SocialAgentToolName.CreateSocialRequest,
      status: 'succeeded',
      output: {
        success: false,
        status: 'pending_approval',
        pendingApproval: true,
        approvalId: 501,
        approval: {
          id: 501,
          type: 'post_publish',
          actionType: 'create_social_request',
          summary: '创建社交需求属于高风险动作，需要确认后再执行。',
          riskLevel: 'high',
          payload: { socialRequestId: 301 },
          expiresAt: null,
        },
      },
      error: null,
    } as never);

    const result = await service.publishDraft(7, 101, {
      socialRequestId: 301,
      type: SocialRequestType.RunningPartner,
      rawText: '今晚青岛轻松跑步',
      title: '今晚青岛轻松跑步',
      visibility: SocialRequestVisibility.Private,
      status: UserSocialRequestStatus.Draft,
    });

    expect(result).toMatchObject({
      success: false,
      taskId: 101,
      approvalId: 501,
      status: 'pending_approval',
      taskStatus: AgentTaskStatus.AwaitingConfirmation,
      synced: false,
      toolCallId: 'action_create_social_request_publish_approval',
    });
    expect(task.status).toBe(AgentTaskStatus.AwaitingConfirmation);
    expect(task.statusReason).toBe('publish_social_request_requires_approval');
    expect(task.result).toMatchObject({
      publishSocialRequest: {
        approvalId: 501,
        status: 'pending_approval',
        synced: false,
      },
    });
    expect(task.memory).toMatchObject({
      shortTerm: {
        publishStatus: 'pending_approval',
        pendingPublishApprovalId: 501,
      },
    });
    expect(savedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'confirmation.requested',
          summary: '发布约练等待用户确认',
        }),
      ]),
    );
  });

  it('requires a socialRequestId from the publish output or draft metadata', async () => {
    const { executor, service } = makeHarness();
    executor.executeToolAction.mockResolvedValueOnce({
      id: 'action_create_social_request_publish_1',
      toolName: SocialAgentToolName.CreateSocialRequest,
      status: 'succeeded',
      output: { synced: true },
      error: null,
    } as never);

    await expect(
      service.publishDraft(7, 101, {
        type: SocialRequestType.RunningPartner,
        rawText: '今晚青岛轻松跑步',
        title: '今晚青岛轻松跑步',
        visibility: SocialRequestVisibility.Private,
        status: UserSocialRequestStatus.Draft,
      }),
    ).rejects.toThrow('发布约练缺少 socialRequestId');
  });
});
