import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { LifeGraphBehaviorEventType } from '../life-graph/life-graph.enums';
import { SocialAgentMeetLoopService } from './social-agent-meet-loop.service';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    taskType: 'social_agent_chat',
    title: 'FitMeet Social Agent 聊天任务',
    goal: '周末慢跑',
    result: {},
    memory: {},
    status: AgentTaskStatus.Pending,
    permissionMode: AgentTaskPermissionMode.Confirm,
    ...overrides,
  } as AgentTask;
}

function makeHarness(options: { activities?: unknown } = {}) {
  const savedEvents: Array<Record<string, unknown>> = [];
  let task = makeTask();
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
  const approvals = {
    create: jest.fn().mockResolvedValue({
      id: 9001,
      type: 'create_activity',
      actionType: 'create_activity',
      summary: '创建线下约练计划',
      riskLevel: 'medium',
      payload: {},
      expiresAt: new Date('2026-06-06T00:00:00.000Z'),
    }),
    approve: jest.fn().mockResolvedValue({
      id: 9001,
      status: 'approved',
    }),
  };
  const metrics = { recordError: jest.fn() };
  const lifeGraph = {
    recordBehaviorEvent: jest.fn().mockResolvedValue({ id: 1 }),
  };
  const interestEvents = {
    recordEvent: jest.fn().mockResolvedValue({ id: 11 }),
  };
  const l5Runtime = {
    transitionMeetLoop: jest.fn().mockResolvedValue(undefined),
  };
  const service = new SocialAgentMeetLoopService(
    taskRepo as never,
    eventRepo as never,
    approvals as never,
    metrics as never,
    undefined,
    lifeGraph as never,
    options.activities as never,
    l5Runtime as never,
    interestEvents as never,
  );
  return {
    approvals,
    eventRepo,
    lifeGraph,
    interestEvents,
    l5Runtime,
    metrics,
    savedEvents,
    service,
    taskRepo,
    get task() {
      return task;
    },
  };
}

describe('SocialAgentMeetLoopService', () => {
  it('runs the canonical card-action meet loop without ActivitiesService', async () => {
    const harness = makeHarness();

    const draft = await harness.service.performActivityAction(7, 101, {
      action: 'activity.confirm_create',
      payload: {
        taskId: 101,
        candidateUserId: 22,
        socialRequestId: 301,
        activityType: 'running',
        locationName: '青岛大学附近公共场所',
      },
    });

    expect(harness.approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        agentTaskId: 101,
        type: 'create_activity',
        actionType: 'create_activity',
        payload: expect.objectContaining({
          taskId: 101,
          agentTaskId: 101,
          targetUserId: 22,
          candidateUserId: 22,
          socialRequestId: 301,
        }),
      }),
    );
    expect(draft).toMatchObject({
      action: 'await_confirmation',
      cards: [expect.objectContaining({ type: 'activity_plan' })],
    });
    expect(harness.l5Runtime.transitionMeetLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        agentTaskId: 101,
        candidateUserId: 22,
        stage: 'activity_draft_created',
        waitingFor: 'activity_confirmation',
        state: expect.objectContaining({
          candidateUserId: 22,
          socialRequestId: 301,
          activityType: 'running',
          locationName: '青岛大学附近公共场所',
        }),
      }),
    );
    const duplicateDraft = await harness.service.performActivityAction(7, 101, {
      action: 'activity.confirm_create',
      payload: {
        taskId: 101,
        candidateUserId: 22,
        socialRequestId: 301,
        activityType: 'running',
        locationName: '青岛大学附近公共场所',
      },
    });
    expect(harness.approvals.create).toHaveBeenCalledTimes(1);
    const duplicateActivityAction = duplicateDraft.cards?.[0]?.actions?.find(
      (action) => action.schemaAction === 'activity.confirm_create',
    );
    expect(duplicateDraft.cards).toHaveLength(1);
    expect(duplicateDraft).toMatchObject({
      action: 'await_confirmation',
      pendingApproval: expect.objectContaining({
        id: 9001,
        type: 'create_activity',
        actionType: 'create_activity',
      }),
    });
    expect(duplicateDraft.cards?.[0]).toMatchObject({
      type: 'activity_plan',
      data: expect.objectContaining({
        approvalId: 9001,
        publicPlaceOnly: true,
        noPreciseLocation: true,
      }),
    });
    expect(duplicateActivityAction).toMatchObject({
      payload: expect.objectContaining({
        approvalId: 9001,
        idempotentReuse: true,
        publicPlaceOnly: true,
        noPreciseLocation: true,
      }),
    });

    const confirmed = await harness.service.performActivityAction(7, 101, {
      action: 'activity.confirm_create',
      payload: draft.cards?.[0]?.actions?.[0]?.payload ?? {},
    });
    expect(harness.approvals.approve).toHaveBeenCalledWith(9001, 7);
    expect(confirmed.cards?.[0]).toMatchObject({
      type: 'meet_loop_timeline',
      schemaType: 'meet_loop.timeline',
      data: expect.objectContaining({
        schemaType: 'meet_loop.timeline',
        loopStage: 'activity_confirmed',
      }),
    });
    const checkinCard = confirmed.cards?.find(
      (card) => card.type === 'checkin_card',
    );
    expect(checkinCard).toMatchObject({
      type: 'checkin_card',
      data: expect.objectContaining({ loopStage: 'activity_confirmed' }),
    });
    expect(harness.lifeGraph.recordBehaviorEvent).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        eventType: LifeGraphBehaviorEventType.ActivityCreated,
        candidateUserId: 22,
      }),
    );
    expect(harness.l5Runtime.transitionMeetLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        agentTaskId: 101,
        candidateUserId: 22,
        stage: 'activity_confirmed',
        waitingFor: 'activity_check_in',
        state: expect.objectContaining({
          candidateUserId: 22,
          status: 'activity_confirmed',
          loopStage: 'activity_confirmed',
          publicPlaceOnly: true,
          noPreciseLocation: true,
        }),
      }),
    );

    const checkedIn = await harness.service.performActivityAction(7, 101, {
      action: 'activity.check_in',
      payload: checkinCard?.actions?.[0]?.payload ?? {},
    });
    expect(checkedIn.cards?.[0]).toMatchObject({
      type: 'checkin_card',
      data: expect.objectContaining({ loopStage: 'activity_checked_in' }),
    });
    expect(harness.l5Runtime.transitionMeetLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        agentTaskId: 101,
        candidateUserId: 22,
        stage: 'activity_checked_in',
        waitingFor: 'activity_completion',
        state: expect.objectContaining({
          status: 'activity_checked_in',
          loopStage: 'activity_checked_in',
        }),
      }),
    );

    const completed = await harness.service.performActivityAction(7, 101, {
      action: 'activity.complete',
      payload: checkedIn.cards?.[0]?.actions?.[0]?.payload ?? {},
    });
    expect(completed.cards?.[0]).toMatchObject({
      type: 'meet_loop_timeline',
      data: expect.objectContaining({ loopStage: 'activity_completed' }),
    });
    expect(harness.l5Runtime.transitionMeetLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        agentTaskId: 101,
        candidateUserId: 22,
        stage: 'activity_completed',
        waitingFor: 'review',
        state: expect.objectContaining({
          status: 'activity_completed',
          loopStage: 'activity_completed',
        }),
      }),
    );
    expect(harness.interestEvents.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        agentTaskId: 101,
        eventType: 'activity_complete',
        targetUserId: 22,
        activityTags: expect.arrayContaining(['running']),
        locationText: '青岛大学附近公共场所',
        source: 'meet_loop',
      }),
    );

    const reviewed = await harness.service.performActivityAction(7, 101, {
      action: 'review.submit',
      payload: {
        ...(completed.cards?.[0]?.actions?.[0]?.payload ?? {}),
        rating: 5,
        comment: '这次约练顺利完成。',
      },
    });

    expect(reviewed.cards?.[0]).toMatchObject({
      type: 'audit_update',
      data: expect.objectContaining({
        loopStage: 'trust_score_updated',
        trustScoreUpdatePreview: expect.stringContaining('+2'),
      }),
    });
    expect(harness.lifeGraph.recordBehaviorEvent).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        eventType: LifeGraphBehaviorEventType.ActivityReviewedPositive,
        metadata: expect.objectContaining({ rating: 5 }),
      }),
    );
    expect(harness.interestEvents.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        agentTaskId: 101,
        eventType: 'review_positive',
        targetUserId: 22,
        activityTags: expect.arrayContaining(['running']),
        metadata: expect.objectContaining({ rating: 5, positive: true }),
        source: 'meet_loop',
      }),
    );
    expect(harness.task.result).toMatchObject({
      meetLoop: expect.objectContaining({
        status: 'review_submitted',
        lifeGraphUpdated: true,
        trustScoreDelta: 2,
      }),
    });
    expect(harness.l5Runtime.transitionMeetLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        agentTaskId: 101,
        candidateUserId: 22,
        stage: 'trust_score_updated',
        waitingFor: '',
        state: expect.objectContaining({
          status: 'review_submitted',
          loopStage: 'trust_score_updated',
        }),
        review: expect.objectContaining({
          rating: 5,
        }),
      }),
    );
    expect(harness.savedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'social_agent.message.assistant',
        }),
      ]),
    );
  });

  it('uses ActivitiesService for persisted activity create/checkin/complete/review', async () => {
    const activities = {
      create: jest.fn().mockResolvedValue({ id: 700 }),
      confirm: jest.fn().mockResolvedValue({ id: 700, invitedUserId: 22 }),
      checkin: jest.fn().mockResolvedValue({ activity: { id: 700 } }),
      complete: jest.fn().mockResolvedValue({ id: 700 }),
      review: jest.fn().mockResolvedValue({ ok: true }),
    };
    const harness = makeHarness({ activities });

    const draft = await harness.service.performActivityAction(7, 101, {
      action: 'activity.confirm_create',
      payload: {
        taskId: 101,
        candidateUserId: 22,
        socialRequestId: 301,
        candidateRecordId: 501,
        activityType: 'running',
        title: '周末慢跑',
        city: '青岛',
        locationName: '青岛大学附近公共场所',
      },
    });

    expect(activities.create).not.toHaveBeenCalled();
    expect(activities.confirm).not.toHaveBeenCalled();
    expect(draft).toMatchObject({
      action: 'await_confirmation',
      pendingApproval: expect.objectContaining({
        type: 'create_activity',
        actionType: 'create_activity',
      }),
    });
    expect(harness.approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        relatedSocialRequestId: 301,
        relatedCandidateId: 501,
        payload: expect.objectContaining({
          taskId: 101,
          agentTaskId: 101,
          targetUserId: 22,
          candidateUserId: 22,
          candidateRecordId: 501,
          socialRequestCandidateId: 501,
          socialRequestId: 301,
        }),
      }),
    );
    expect(draft.cards?.[0]).toMatchObject({
      schemaType: 'social_match.activity',
      data: expect.objectContaining({
        publicPlaceOnly: true,
        noPreciseLocation: true,
        reviewPrompt: expect.stringContaining('简短评价'),
      }),
      actions: expect.arrayContaining([
        expect.objectContaining({
          schemaAction: 'activity.confirm_create',
          requiresConfirmation: true,
          payload: expect.objectContaining({
            approvalId: expect.any(Number),
            publicPlaceOnly: true,
            noPreciseLocation: true,
          }),
        }),
      ]),
    });
    const confirmed = await harness.service.performActivityAction(7, 101, {
      action: 'activity.confirm_create',
      payload: draft.cards?.[0]?.actions?.[0]?.payload ?? {},
    });

    expect(harness.approvals.approve).toHaveBeenCalledWith(9001, 7);
    expect(harness.approvals.approve.mock.invocationCallOrder[0]).toBeLessThan(
      activities.create.mock.invocationCallOrder[0],
    );
    expect(activities.create).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        title: '周末慢跑',
        socialRequestId: 301,
        matchedCandidateId: 501,
        invitedUserId: 22,
      }),
    );
    expect(activities.confirm).toHaveBeenCalledWith(700, 7);
    expect(confirmed.cards?.[0]).toMatchObject({
      type: 'meet_loop_timeline',
      schemaType: 'meet_loop.timeline',
      data: expect.objectContaining({
        schemaType: 'meet_loop.timeline',
        loopStage: 'activity_confirmed',
        safetyBoundary: expect.stringContaining('仍需确认'),
        timeline: expect.objectContaining({
          nextAction: expect.stringContaining('等待你确认到达'),
        }),
      }),
      actions: expect.arrayContaining([
        expect.objectContaining({
          schemaAction: 'meet_loop.resume',
          requiresConfirmation: true,
        }),
      ]),
    });
    const checkinCard = confirmed.cards?.find(
      (card) => card.type === 'checkin_card',
    );
    expect(checkinCard).toMatchObject({
      data: expect.objectContaining({
        publicPlaceOnly: true,
        noPreciseLocation: true,
      }),
    });

    const checkedIn = await harness.service.performActivityAction(7, 101, {
      action: 'activity.check_in',
      payload: checkinCard?.actions?.[0]?.payload ?? {},
    });
    expect(activities.checkin).toHaveBeenCalledWith(
      700,
      7,
      expect.objectContaining({ locationApprox: expect.any(String) }),
    );

    const completed = await harness.service.performActivityAction(7, 101, {
      action: 'activity.complete',
      payload: checkedIn.cards?.[0]?.actions?.[0]?.payload ?? {},
    });
    expect(activities.complete).toHaveBeenCalledWith(700, 7);

    await harness.service.performActivityAction(7, 101, {
      action: 'review.submit',
      payload: {
        ...(completed.cards?.[0]?.actions?.[0]?.payload ?? {}),
        rating: 5,
        comment: '真实活动顺利完成。',
      },
    });
    expect(activities.review).toHaveBeenCalledWith(
      700,
      7,
      5,
      '真实活动顺利完成。',
    );
    expect(harness.lifeGraph.recordBehaviorEvent).toHaveBeenCalledTimes(1);
  });

  it('returns a proof-upload guidance card when proof content is not provided', async () => {
    const harness = makeHarness();

    const result = await harness.service.performActivityAction(7, 101, {
      action: 'activity.upload_proof',
      payload: {
        taskId: 101,
        activityId: 700,
      },
    });

    expect(result).toMatchObject({
      action: 'reply',
      assistantMessage: expect.stringContaining('打开活动详情上传'),
      cards: [
        expect.objectContaining({
          type: 'activity_status',
          data: expect.objectContaining({
            activityId: 700,
            proofStatus: '待上传证明',
          }),
          actions: [
            expect.objectContaining({
              schemaAction: 'activity.view_detail',
              action: 'view_activity',
            }),
          ],
        }),
      ],
    });
    expect(harness.task.memory).toMatchObject({
      taskMemory: {
        currentTask: expect.objectContaining({
          waitingFor: 'activity_proof_upload',
          lastCompletedStep: 'activity_proof_requested',
        }),
      },
    });
  });

  it('returns real activity detail and proof status for linked task activity', async () => {
    const activities = {
      findOne: jest.fn().mockResolvedValue({
        id: 700,
        title: '周末慢跑',
        description: '公共场所慢跑',
        status: 'completed',
        city: '青岛',
        locationName: '青岛大学操场',
        proofRequired: true,
        proofPolicy: 'mutual_or_proof',
      }),
      listProofs: jest
        .fn()
        .mockResolvedValue([
          { id: 800, proofType: 'scene_photo', status: 'pending' },
        ]),
    };
    const harness = makeHarness({ activities });
    await harness.taskRepo.save(
      makeTask({
        result: {
          meetLoop: {
            activityId: 700,
          },
        },
      }),
    );

    const result = await harness.service.performActivityAction(7, 101, {
      action: 'activity.view_detail',
      payload: {
        taskId: 101,
        activityId: 700,
      },
    });

    expect(activities.findOne).toHaveBeenCalledWith(700);
    expect(activities.listProofs).toHaveBeenCalledWith(700);
    expect(result).toMatchObject({
      assistantMessage: expect.stringContaining('当前活动详情和证明状态'),
      cards: [
        expect.objectContaining({
          type: 'activity_status',
          title: '周末慢跑',
          data: expect.objectContaining({
            activityId: 700,
            proofStatus: '1 条证明待确认',
            proofCount: 1,
          }),
        }),
      ],
    });
    expect(harness.task.memory).toMatchObject({
      taskMemory: {
        currentTask: expect.objectContaining({
          waitingFor: 'activity_detail_or_proof',
          lastCompletedStep: 'activity_detail_viewed',
        }),
      },
    });
  });

  it('submits real activity proof when proof content is provided', async () => {
    const activities = {
      submitProof: jest.fn().mockResolvedValue({
        id: 800,
        proofType: 'scene_photo',
        status: 'pending',
      }),
    };
    const harness = makeHarness({ activities });

    const result = await harness.service.performActivityAction(7, 101, {
      action: 'activity.upload_proof',
      payload: {
        taskId: 101,
        activityId: 700,
        proofType: 'scene_photo',
        note: '操场完成慢跑',
        locationApprox: '青岛大学操场附近',
      },
    });

    expect(activities.submitProof).toHaveBeenCalledWith(
      700,
      7,
      expect.objectContaining({
        proofType: 'scene_photo',
        note: '操场完成慢跑',
        locationApprox: '青岛大学操场附近',
        privacyMode: 'scene_only',
      }),
    );
    expect(result.cards?.[0]).toMatchObject({
      type: 'activity_status',
      title: '活动证明已提交',
      data: expect.objectContaining({
        proofId: 800,
        proofStatus: '证明待对方确认',
      }),
    });
    expect(harness.task.result).toMatchObject({
      meetLoop: expect.objectContaining({
        proofId: 800,
        proofStatus: 'pending',
        status: 'proof_submitted',
      }),
    });
  });

  it('resumes meet-loop progress without performing high-risk side effects', async () => {
    const harness = makeHarness();
    await harness.taskRepo.save(
      makeTask({
        result: {
          meetLoop: {
            loopStage: 'message_sent',
            activityId: 700,
            candidateUserId: 22,
          },
        },
      }),
    );

    const result = await harness.service.performActivityAction(7, 101, {
      action: 'meet_loop.resume',
      payload: {
        taskId: 101,
        activityId: 700,
        candidateUserId: 22,
        loopStage: 'message_sent',
      },
    });

    expect(result).toMatchObject({
      action: 'reply',
      assistantMessage: expect.stringContaining('恢复到上次保存的邀约进度'),
      cards: [
        expect.objectContaining({
          type: 'meet_loop_timeline',
          data: expect.objectContaining({
            loopStage: 'message_sent',
            timeline: expect.objectContaining({
              steps: expect.arrayContaining([
                expect.objectContaining({
                  key: 'sent',
                  state: 'current',
                  checkpointReady: true,
                }),
              ]),
            }),
          }),
          actions: expect.arrayContaining([
            expect.objectContaining({
              schemaAction: 'meet_loop.resume',
              requiresConfirmation: true,
            }),
          ]),
        }),
      ],
    });
    expect(harness.approvals.create).not.toHaveBeenCalled();
    expect(harness.task.memory).toMatchObject({
      taskMemory: {
        currentTask: expect.objectContaining({
          waitingFor: 'meet_loop_resume_confirmation',
          lastCompletedStep: 'message_sent',
        }),
      },
    });
  });

  it('resumes counterpart replies into continue-chat state without side effects or direct Life Graph writes', async () => {
    const harness = makeHarness();
    await harness.taskRepo.save(
      makeTask({
        result: {
          meetLoop: {
            loopStage: 'message_sent',
            activityId: 700,
            candidateUserId: 22,
            messagePreview: '周末下午可以先在公共路线轻松跑一圈。',
          },
        },
      }),
    );

    const result = await harness.service.performActivityAction(7, 101, {
      action: 'meet_loop.resume',
      payload: {
        taskId: 101,
        activityId: 700,
        candidateUserId: 22,
        source: 'counterpart_reply',
        replyIntent: 'accepted',
        replyPreview: '可以呀，周六下午在公共操场附近见可以吗？',
      },
    });

    expect(result).toMatchObject({
      action: 'reply',
      assistantMessage: expect.stringContaining('不会自动继续发消息或创建约练'),
    });
    const timelineCard = result.cards?.find(
      (card) => card.schemaType === 'meet_loop.timeline',
    );
    const lifeGraphCard = result.cards?.find(
      (card) => card.schemaType === 'life_graph.diff',
    );
    expect(timelineCard).toMatchObject({
      type: 'meet_loop_timeline',
      data: expect.objectContaining({
        candidateUserId: 22,
        loopStage: 'reply_received',
        timeline: expect.objectContaining({
          nextAction: expect.stringContaining('继续'),
        }),
      }),
    });
    expect(lifeGraphCard).toMatchObject({
      type: 'audit_update',
      data: expect.objectContaining({
        schemaName: 'LifeGraphDiffCard',
        source: 'counterpart_reply',
        candidateUserId: 22,
        realActivityPersisted: false,
      }),
    });
    expect(harness.approvals.create).not.toHaveBeenCalled();
    expect(harness.lifeGraph.recordBehaviorEvent).not.toHaveBeenCalled();
    expect(harness.task.result).toMatchObject({
      meetLoop: expect.objectContaining({
        source: 'counterpart_reply',
        status: 'reply_received',
        loopStage: 'reply_received',
        connectionState: 'reply_received',
        lifeGraphUpdatePending: true,
        publicPlaceOnly: true,
        noPreciseLocation: true,
      }),
    });
    expect(harness.task.memory).toMatchObject({
      taskMemory: {
        currentTask: expect.objectContaining({
          objective: 'candidate_messaging',
          state: 'messaging_candidate',
          waitingFor: 'continue_conversation',
          lastCompletedStep: 'counterpart_reply_received',
        }),
      },
    });
    expect(harness.l5Runtime.transitionMeetLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        agentTaskId: 101,
        activityId: 700,
        candidateUserId: 22,
        stage: 'reply_received',
        waitingFor: 'continue_conversation',
        state: expect.objectContaining({
          source: 'counterpart_reply',
          status: 'reply_received',
          loopStage: 'reply_received',
          lifeGraphUpdatePending: true,
        }),
      }),
    );
    expect(harness.interestEvents.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        agentTaskId: 101,
        eventType: 'invite_accepted',
        targetUserId: 22,
        activityId: 700,
        source: 'meet_loop',
        metadata: expect.objectContaining({
          counterpartIntent: 'accepted',
          replyPreview: '可以呀，周六下午在公共操场附近见可以吗？',
        }),
      }),
    );
    expect(harness.savedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'note',
          summary: 'Agent meet loop counterpart reply received',
        }),
        expect.objectContaining({
          eventType: 'social_agent.message.assistant',
        }),
      ]),
    );
  });

  it.each([
    'meet_loop.reschedule',
    'activity.modify_time',
    'activity.modify_location',
  ] as const)(
    'creates a reschedule checkpoint prompt for %s without notifying the other user',
    async (action) => {
      const harness = makeHarness();

      const result = await harness.service.performActivityAction(7, 101, {
        action,
        payload: {
          taskId: 101,
          activityId: 700,
          candidateUserId: 22,
        },
      });

      expect(result).toMatchObject({
        action: 'reply',
        assistantMessage: expect.stringContaining('不会自动通知对方'),
        cards: [
          expect.objectContaining({
            type: 'meet_loop_timeline',
            data: expect.objectContaining({
              loopStage: 'reschedule_requested',
              timeline: expect.objectContaining({
                nextAction: '告诉我新的时间范围，我会生成改期草稿。',
                steps: expect.arrayContaining([
                  expect.objectContaining({
                    key: 'reschedule',
                    state: 'current',
                    resumeMode: 'reschedule',
                  }),
                ]),
              }),
            }),
          }),
        ],
      });
      expect(harness.approvals.create).not.toHaveBeenCalled();
      expect(harness.task.result).toMatchObject({
        meetLoop: expect.objectContaining({
          status: 'reschedule_requested',
          loopStage: 'reschedule_requested',
        }),
      });
      expect(harness.task.memory).toMatchObject({
        taskMemory: {
          currentTask: expect.objectContaining({
            waitingFor: 'reschedule_time_window',
            lastCompletedStep: 'reschedule_requested',
          }),
        },
      });
    },
  );

  it('cancels and hides an opportunity card when the user skips publishing', async () => {
    const harness = makeHarness();

    const result = await harness.service.performActivityAction(7, 101, {
      action: 'activity.skip_publish',
      payload: {
        taskId: 101,
        activityId: 700,
        candidateUserId: 22,
        title: '青岛大学轻松散步',
      },
    });

    expect(harness.approvals.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      action: 'reply',
      assistantMessage: expect.stringContaining('已取消发布'),
      cards: [],
    });
    expect(harness.task.result).toMatchObject({
      chatRun: expect.objectContaining({
        socialRequestDraft: null,
        publishStatus: 'cancelled',
        publicIntentId: null,
        discoverHref: null,
        publicIntentHref: null,
      }),
      activityDraft: expect.objectContaining({
        visibility: 'hidden',
        autoPublished: false,
        dismissed: true,
        publishStatus: 'cancelled',
      }),
      meetLoop: expect.objectContaining({
        status: 'draft_cancelled',
        loopStage: 'activity_publish_cancelled',
        visibility: 'hidden',
        waitingFor: 'user_next_message',
      }),
    });
    expect(harness.task.memory).toMatchObject({
      shortTerm: expect.objectContaining({
        socialRequestDraft: null,
        publishStatus: 'cancelled',
        hasSearched: false,
        lastSearchCandidateCount: 0,
      }),
      socialAgentChat: expect.objectContaining({
        socialRequestDraft: null,
        publishStatus: 'cancelled',
        publicIntentId: null,
        discoverHref: null,
        publicIntentHref: null,
      }),
      taskMemory: {
        currentTask: expect.objectContaining({
          waitingFor: 'user_next_message',
          lastCompletedStep: 'activity_publish_cancelled',
        }),
      },
    });
    expect(harness.l5Runtime.transitionMeetLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        agentTaskId: 101,
        activityId: 700,
        candidateUserId: 22,
        stage: 'activity_publish_cancelled',
        waitingFor: 'user_next_message',
        state: expect.objectContaining({
          loopStage: 'activity_publish_cancelled',
          visibility: 'hidden',
        }),
      }),
    );
  });
});
