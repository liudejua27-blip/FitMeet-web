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
  };
  const metrics = { recordError: jest.fn() };
  const lifeGraph = {
    recordBehaviorEvent: jest.fn().mockResolvedValue({ id: 1 }),
  };
  const service = new SocialAgentMeetLoopService(
    taskRepo as never,
    eventRepo as never,
    approvals as never,
    metrics as never,
    undefined,
    lifeGraph as never,
    options.activities as never,
  );
  return {
    approvals,
    eventRepo,
    lifeGraph,
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
      }),
    );
    expect(draft).toMatchObject({
      action: 'await_confirmation',
      cards: [expect.objectContaining({ type: 'activity_plan' })],
    });

    const confirmed = await harness.service.performActivityAction(7, 101, {
      action: 'activity.confirm_create',
      payload: draft.cards?.[0]?.actions?.[0]?.payload ?? {},
    });
    expect(confirmed.cards?.[0]).toMatchObject({
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

    const checkedIn = await harness.service.performActivityAction(7, 101, {
      action: 'activity.check_in',
      payload: confirmed.cards?.[0]?.actions?.[0]?.payload ?? {},
    });
    expect(checkedIn.cards?.[0]).toMatchObject({
      type: 'checkin_card',
      data: expect.objectContaining({ loopStage: 'activity_checked_in' }),
    });

    const completed = await harness.service.performActivityAction(7, 101, {
      action: 'activity.complete',
      payload: checkedIn.cards?.[0]?.actions?.[0]?.payload ?? {},
    });
    expect(completed.cards?.[0]).toMatchObject({
      type: 'review_card',
      data: expect.objectContaining({ loopStage: 'activity_completed' }),
    });

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
    expect(harness.task.result).toMatchObject({
      meetLoop: expect.objectContaining({
        status: 'review_submitted',
        lifeGraphUpdated: true,
        trustScoreDelta: 2,
      }),
    });
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
    const confirmed = await harness.service.performActivityAction(7, 101, {
      action: 'activity.confirm_create',
      payload: draft.cards?.[0]?.actions?.[0]?.payload ?? {},
    });

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

    const checkedIn = await harness.service.performActivityAction(7, 101, {
      action: 'activity.check_in',
      payload: confirmed.cards?.[0]?.actions?.[0]?.payload ?? {},
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
});
