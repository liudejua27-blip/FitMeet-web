import {
  SocialRequestType,
  SocialRequestVisibility,
  UserSocialRequest,
  UserSocialRequestStatus,
} from '../social-requests/social-request.entity';
import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentDraftPublicationService } from './social-agent-draft-publication.service';
import { SocialAgentToolName } from './social-agent-tool-executor.service';
import { MatchingJob, MatchingJobStatus } from './entities/matching-job.entity';
import { PublicSocialIntent } from './entities/public-social-intent.entity';

type HarnessOptions = {
  matchingJobRepo?: Partial<Record<keyof MatchingJob, unknown>>;
  sideEffectLedger?: {
    run: jest.Mock;
  } | null;
  taskManager?: Record<string, unknown>;
  userSocialRequest?: Partial<UserSocialRequest> | null;
  userSocialRequestRepo?: {
    findOne?: jest.Mock;
  };
};

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

function makeHarness(initialTask = makeTask(), options: HarnessOptions = {}) {
  const savedEvents: Array<Record<string, unknown>> = [];
  let task = initialTask;
  const defaultUserSocialRequest = {
    id: 301,
    userId: 7,
    status: UserSocialRequestStatus.Draft,
    visibility: SocialRequestVisibility.MatchedOnly,
    metadata: {},
    ...options.userSocialRequest,
  } as UserSocialRequest;
  const publishRequestQuery = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest
      .fn()
      .mockResolvedValue(
        options.userSocialRequest === null ? null : defaultUserSocialRequest,
      ),
  };
  const txUserSocialRequestRepo = {
    createQueryBuilder: jest.fn(() => publishRequestQuery),
  };
  const taskRepo = {
    findOne: jest.fn().mockImplementation(() => Promise.resolve(task)),
    save: jest.fn().mockImplementation((input: AgentTask) => {
      task = input;
      return Promise.resolve(input);
    }),
    manager: {},
  } as {
    findOne: jest.Mock;
    save: jest.Mock;
    manager: Record<string, unknown>;
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
  const publicIntentRepo = {
    findOne: jest.fn().mockResolvedValue({
      id: 'social_request_301',
      userId: 7,
      linkedSocialRequestId: 301,
      mode: 'public',
      status: 'searching',
      title: '今晚青岛轻松跑步',
      metadata: { sourceVersion: 'source-v1' },
    }),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: 'social_request_301',
        userId: 7,
        linkedSocialRequestId: 301,
        mode: 'public',
        status: 'searching',
        title: '今晚青岛轻松跑步',
        metadata: { sourceVersion: 'source-v1' },
      }),
    })),
  };
  const matchingJobs = {
    enqueue: jest.fn().mockResolvedValue({
      job: {
        id: 9001,
        publicIntentId: 'social_request_301',
        sourceVersion: 'source-v1',
        status: MatchingJobStatus.Queued,
        candidateCount: 0,
      },
      reused: false,
    }),
  };
  const defaultManager: Record<string, unknown> =
    options.taskManager ??
    ({
      query: jest.fn().mockResolvedValue([]),
      transaction: jest.fn(async (runner: (manager: never) => unknown) =>
        runner(defaultManager as never),
      ),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === AgentTask) return taskRepo;
        if (entity === UserSocialRequest) return txUserSocialRequestRepo;
        if (entity === AgentTaskEvent) return eventRepo;
        if (entity === PublicSocialIntent) return publicIntentRepo;
        return {};
      }),
    } as Record<string, unknown>);
  taskRepo.manager = defaultManager;
  const sideEffectLedger =
    options.sideEffectLedger === undefined
      ? {
          run: jest.fn(async (_input, operation) => ({
            result: await operation(),
            reused: false,
          })),
        }
      : options.sideEffectLedger;
  const service = new SocialAgentDraftPublicationService(
    taskRepo as never,
    eventRepo as never,
    executor as never,
    longTermMemory as never,
    publicIntentRepo as never,
    (sideEffectLedger ?? undefined) as never,
    matchingJobs as never,
    (options.userSocialRequestRepo ?? {
      findOne: jest.fn().mockResolvedValue(defaultUserSocialRequest),
    }) as never,
    (options.matchingJobRepo ?? {}) as never,
  );
  return {
    eventRepo,
    executor,
    longTermMemory,
    publicIntentRepo,
    matchingJobs,
    savedEvents,
    service,
    sideEffectLedger,
    taskRepo,
    txUserSocialRequestRepo,
    publishRequestQuery,
    get task() {
      return task;
    },
  };
}

function makeTransactionalHarness() {
  const task = makeTask({
    result: {
      chatRun: {
        socialRequestDraft: {
          socialRequestId: 301,
          publicIntentId: 'social_request_301',
          title: '今晚青岛轻松跑步',
        },
      },
    },
    memory: {
      socialAgentChat: {
        socialRequestDraft: {
          socialRequestId: 301,
          publicIntentId: 'social_request_301',
          title: '今晚青岛轻松跑步',
        },
      },
    },
  });
  const userSocialRequest = {
    id: 301,
    userId: 7,
    status: UserSocialRequestStatus.Draft,
    visibility: SocialRequestVisibility.MatchedOnly,
    agentAllowed: true,
    metadata: {},
  } as UserSocialRequest;
  const publicIntent = {
    id: 'social_request_301',
    userId: 7,
    linkedSocialRequestId: 301,
    mode: 'public',
    status: 'searching',
    candidateUserIds: [11, 12],
    matchedCount: 2,
    metadata: { sourceVersion: 'source-v1' },
  } as unknown as PublicSocialIntent;
  const txTaskRepo = {
    findOne: jest.fn().mockResolvedValue(task),
    save: jest.fn().mockImplementation((input: AgentTask) => {
      Object.assign(task, input);
      return Promise.resolve(input);
    }),
  };
  const txEventRepo = {
    create: jest.fn((input: Record<string, unknown>) => input),
    save: jest.fn((input: Record<string, unknown>) => Promise.resolve(input)),
  };
  const userRequestQuery = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(userSocialRequest),
  };
  const txUserSocialRequestRepo = {
    createQueryBuilder: jest.fn(() => userRequestQuery),
    save: jest.fn((input: UserSocialRequest) => Promise.resolve(input)),
  };
  const publicIntentQuery = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([publicIntent]),
  };
  const txPublicIntentRepo = {
    createQueryBuilder: jest.fn(() => publicIntentQuery),
    save: jest.fn((input: PublicSocialIntent) => Promise.resolve(input)),
  };
  const manager = {
    transaction: jest.fn(async (runner: (manager: never) => unknown) =>
      runner(manager as never),
    ),
    getRepository: jest.fn((entity: unknown) => {
      if (entity === AgentTask) return txTaskRepo;
      if (entity === UserSocialRequest) return txUserSocialRequestRepo;
      if (entity === PublicSocialIntent) return txPublicIntentRepo;
      if (entity === AgentTaskEvent) return txEventRepo;
      return {};
    }),
    query: jest.fn().mockResolvedValue([{ id: 9001 }, { id: 9002 }]),
  };
  const harness = makeHarness(task, {
    matchingJobRepo: {},
    taskManager: manager,
    userSocialRequestRepo: { findOne: jest.fn() },
  });
  return {
    ...harness,
    manager,
    publicIntent,
    publicIntentQuery,
    txEventRepo,
    txPublicIntentRepo,
    txTaskRepo,
    txUserSocialRequestRepo,
    userRequestQuery,
    userSocialRequest,
  };
}

describe('SocialAgentDraftPublicationService', () => {
  it('fails closed when persistence dependencies are unavailable', async () => {
    const { executor, service } = makeHarness(makeTask(), {
      sideEffectLedger: null,
    });

    await expect(
      service.dismissDraft(7, 101, {
        action: 'social_intent.decline_publish',
        socialRequestId: 301,
      }),
    ).rejects.toThrow('side_effect_ledger');
    await expect(
      service.publishDraft(7, 101, {
        socialRequestId: 301,
        type: SocialRequestType.RunningPartner,
        rawText: '今晚青岛轻松跑步',
        title: '今晚青岛轻松跑步',
        visibility: SocialRequestVisibility.Private,
        status: UserSocialRequestStatus.Draft,
      }),
    ).rejects.toThrow('side_effect_ledger');
    expect(executor.executeToolAction).not.toHaveBeenCalled();
  });

  it('dismisses a publish draft through one deterministic transaction', async () => {
    const {
      manager,
      publicIntent,
      service,
      task,
      txPublicIntentRepo,
      txTaskRepo,
      txUserSocialRequestRepo,
      userSocialRequest,
    } = makeTransactionalHarness();

    const result = await service.dismissDraft(7, 101, {
      action: 'social_intent.decline_publish',
      socialRequestId: 301,
      publicIntentId: 'social_request_301',
    });

    expect(manager.transaction).toHaveBeenCalledTimes(1);
    expect(userSocialRequest).toMatchObject({
      status: UserSocialRequestStatus.Cancelled,
      visibility: SocialRequestVisibility.Private,
      agentAllowed: false,
      metadata: expect.objectContaining({
        dismissed: true,
        publishStatus: 'dismissed',
        visibility: 'hidden',
        publicDiscoverPublishSkipped: true,
      }),
    });
    expect(txUserSocialRequestRepo.save).toHaveBeenCalledWith(
      userSocialRequest,
    );
    expect(publicIntent).toMatchObject({
      status: 'inactive',
      candidateUserIds: [],
      matchedCount: 0,
      metadata: expect.objectContaining({
        tombstoned: true,
        tombstoneReason: 'social_intent_publish_dismissed',
        publishStatus: 'dismissed',
      }),
    });
    expect(txPublicIntentRepo.save).toHaveBeenCalledWith(publicIntent);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "matching_jobs"'),
      expect.arrayContaining([
        MatchingJobStatus.Cancelled,
        expect.any(Date),
        'cancelled_by_user',
        expect.stringContaining('social_intent_publish_dismissed'),
        301,
        ['social_request_301'],
        7,
        MatchingJobStatus.Queued,
        MatchingJobStatus.Running,
      ]),
    );
    expect(txTaskRepo.save).toHaveBeenCalledWith(task);
    expect(task.status).toBe(AgentTaskStatus.Cancelled);
    expect(task.statusReason).toBe('social_intent_publish_dismissed');
    expect(task.result).toMatchObject({
      activityDraft: null,
      publishSocialRequest: {
        socialRequestId: 301,
        publicIntentIds: ['social_request_301'],
        status: 'dismissed',
        publicIntentId: null,
        discoverHref: null,
        publicIntentHref: null,
        cancelledMatchingJobIds: [9001, 9002],
        publicIntentsTombstoned: 1,
        socialRequestDismissed: true,
      },
    });
    expect(result).toMatchObject({
      success: true,
      socialRequestId: 301,
      status: 'dismissed',
      publicIntentId: null,
      matchingStopped: true,
      cancelledMatchingJobIds: [9001, 9002],
      publicIntentIds: ['social_request_301'],
      publicIntentsTombstoned: 1,
      socialRequestDismissed: true,
    });
  });

  it('uses a stable idempotency key for repeated publish dismiss clicks', async () => {
    const sideEffectLedger = {
      run: jest.fn(async () => ({
        result: {
          status: 'dismissed',
        },
        reused: false,
      })),
    };
    const { service } = makeHarness(
      makeTask({
        result: {
          chatRun: {
            socialRequestDraft: {
              socialRequestId: 301,
              title: '今晚青岛轻松跑步',
            },
          },
        },
      }),
      { sideEffectLedger },
    );

    await service.dismissDraft(7, 101, {
      action: 'social_intent.dismiss',
    });

    expect(sideEffectLedger.run).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'dismiss_social_request_publish',
        idempotencyKey: 'dismiss-social-request:101:social-request:301',
        resourceType: 'social_request',
        resourceId: 301,
      }),
      expect.any(Function),
    );
  });

  it('rejects publish when the underlying social request was dismissed', async () => {
    const { executor, service } = makeHarness(makeTask(), {
      userSocialRequest: {
        id: 301,
        userId: 7,
        status: UserSocialRequestStatus.Cancelled,
        visibility: SocialRequestVisibility.Private,
        metadata: { publishStatus: 'dismissed' },
      },
    });

    await expect(
      service.publishDraft(7, 101, {
        socialRequestId: 301,
        type: SocialRequestType.RunningPartner,
        rawText: '今晚青岛轻松跑步',
        title: '今晚青岛轻松跑步',
        visibility: SocialRequestVisibility.Private,
        status: UserSocialRequestStatus.Draft,
      }),
    ).rejects.toThrow('这张约练卡已取消发布，不能再次发布。');
    expect(executor.executeToolAction).not.toHaveBeenCalled();
  });

  it('publishes a staged social request only after explicit confirmation', async () => {
    const {
      executor,
      longTermMemory,
      matchingJobs,
      publicIntentRepo,
      savedEvents,
      service,
      task,
    } = makeHarness();

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
      discoverHref: '/discover?publicIntentId=social_request_301',
      publicIntentHref: '/public-intent/social_request_301',
      status: 'published',
      taskStatus: AgentTaskStatus.Succeeded,
      synced: true,
      sourceVersion: 'source-v1',
      matchingJob: {
        id: 9001,
        status: MatchingJobStatus.Queued,
        publicIntentId: 'social_request_301',
        sourceVersion: 'source-v1',
        candidateCount: 0,
      },
      toolCallId: 'action_create_social_request_publish_1',
      socialRequest: { id: 301, status: UserSocialRequestStatus.Matching },
      publicIntent: {
        id: 'social_request_301',
        status: 'searching',
        mode: 'public',
        title: '今晚青岛轻松跑步',
        sourceVersion: 'source-v1',
      },
    });
    expect(matchingJobs.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        linkedSocialRequestId: 301,
        publicIntentId: 'social_request_301',
        sourceVersion: 'source-v1',
        idempotencyKey: 'matching-job:social_request_301:source-v1',
      }),
    );
    expect(publicIntentRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'social_request_301' },
    });
    expect(task.status).toBe(AgentTaskStatus.Succeeded);
    expect(task.result).toMatchObject({
      chatRun: {
        socialRequestId: 301,
        publicIntentId: 'social_request_301',
        discoverHref: '/discover?publicIntentId=social_request_301',
        publicIntentHref: '/public-intent/social_request_301',
        publishStatus: 'published',
        matchingJobId: 9001,
        matchingJobStatus: MatchingJobStatus.Queued,
        sourceVersion: 'source-v1',
      },
      activityDraft: {
        socialRequestId: 301,
        publicIntentId: 'social_request_301',
        discoverHref: '/discover?publicIntentId=social_request_301',
        publicIntentHref: '/public-intent/social_request_301',
        publishStatus: 'published',
        visibility: 'public',
        autoPublished: true,
        matchingJobId: 9001,
        matchingJobStatus: MatchingJobStatus.Queued,
        sourceVersion: 'source-v1',
      },
      publishSocialRequest: {
        socialRequestId: 301,
        publicIntentId: 'social_request_301',
        discoverHref: '/discover?publicIntentId=social_request_301',
        publicIntentHref: '/public-intent/social_request_301',
        status: 'published',
        synced: true,
        matchingJob: {
          id: 9001,
          status: MatchingJobStatus.Queued,
          publicIntentId: 'social_request_301',
          sourceVersion: 'source-v1',
          candidateCount: 0,
        },
        sourceVersion: 'source-v1',
      },
    });
    expect(task.memory).toMatchObject({
      socialAgentChat: {
        socialRequestId: 301,
        publicIntentId: 'social_request_301',
        discoverHref: '/discover?publicIntentId=social_request_301',
        publicIntentHref: '/public-intent/social_request_301',
        publishStatus: 'published',
        matchingJobId: 9001,
        matchingJobStatus: MatchingJobStatus.Queued,
        sourceVersion: 'source-v1',
      },
      taskMemory: {
        currentTask: {
          waitingFor: 'matching_job',
          lastCompletedStep: 'published_to_discover',
        },
      },
      shortTerm: {
        publishedSocialRequestId: 301,
        socialRequestId: 301,
        publicIntentId: 'social_request_301',
        discoverHref: '/discover?publicIntentId=social_request_301',
        publicIntentHref: '/public-intent/social_request_301',
        publishStatus: 'published',
        matchingJobId: 9001,
        matchingJobStatus: MatchingJobStatus.Queued,
        sourceVersion: 'source-v1',
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

  it('fails publish when the public intent cannot be read back from Discover', async () => {
    const { publicIntentRepo, service } = makeHarness();
    publicIntentRepo.findOne.mockResolvedValueOnce(null);

    await expect(
      service.publishDraft(7, 101, {
        socialRequestId: 301,
        type: SocialRequestType.RunningPartner,
        rawText: '今晚青岛轻松跑步',
        title: '今晚青岛轻松跑步',
        visibility: SocialRequestVisibility.Private,
        status: UserSocialRequestStatus.Draft,
      }),
    ).rejects.toThrow('发布约练后未能在发现页读回公开卡片');
  });

  it('fails publish when the public intent read-back is not public', async () => {
    const { publicIntentRepo, service } = makeHarness();
    publicIntentRepo.findOne.mockResolvedValueOnce({
      id: 'social_request_301',
      userId: 7,
      linkedSocialRequestId: 301,
      mode: 'private',
      status: 'searching',
      title: '今晚青岛轻松跑步',
      metadata: { sourceVersion: 'source-v1' },
    });

    await expect(
      service.publishDraft(7, 101, {
        socialRequestId: 301,
        type: SocialRequestType.RunningPartner,
        rawText: '今晚青岛轻松跑步',
        title: '今晚青岛轻松跑步',
        visibility: SocialRequestVisibility.Private,
        status: UserSocialRequestStatus.Draft,
      }),
    ).rejects.toThrow('发布约练读回的公开卡片不可见');
  });

  it('fails publish when the public intent read-back points to a different card title', async () => {
    const { publicIntentRepo, service } = makeHarness();
    publicIntentRepo.findOne.mockResolvedValueOnce({
      id: 'social_request_301',
      userId: 7,
      linkedSocialRequestId: 301,
      mode: 'public',
      status: 'searching',
      title: '明天北京篮球搭子',
      metadata: { sourceVersion: 'source-v1' },
    });

    await expect(
      service.publishDraft(7, 101, {
        socialRequestId: 301,
        type: SocialRequestType.RunningPartner,
        rawText: '今晚青岛轻松跑步',
        title: '今晚青岛轻松跑步',
        visibility: SocialRequestVisibility.Private,
        status: UserSocialRequestStatus.Draft,
      }),
    ).rejects.toThrow('发布约练读回的公开卡片标题不一致');
  });

  it('fails publish when the public intent read-back links to another social request', async () => {
    const { publicIntentRepo, service } = makeHarness();
    publicIntentRepo.findOne.mockResolvedValueOnce({
      id: 'social_request_301',
      userId: 7,
      linkedSocialRequestId: 999,
      mode: 'public',
      status: 'searching',
      title: '今晚青岛轻松跑步',
      metadata: { sourceVersion: 'source-v1' },
    });

    await expect(
      service.publishDraft(7, 101, {
        socialRequestId: 301,
        type: SocialRequestType.RunningPartner,
        rawText: '今晚青岛轻松跑步',
        title: '今晚青岛轻松跑步',
        visibility: SocialRequestVisibility.Private,
        status: UserSocialRequestStatus.Draft,
      }),
    ).rejects.toThrow('发布约练读回的公开卡片关联需求不一致');
  });
});
