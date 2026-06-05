import { AgentTaskPermissionMode } from './entities/agent-task.entity';
import type { AgentTask } from './entities/agent-task.entity';
import {
  buildSocialAgentActivityCompletionCard,
  buildSocialAgentActivityPlanCard,
  buildSocialAgentCardActionRouteResult,
  buildSocialAgentCheckinCard,
  buildSocialAgentLifeGraphUpdateCard,
  buildSocialAgentOpenerApprovalCard,
  buildSocialAgentReviewCard,
  createSocialAgentActivityDtoFromPayload,
  mergeSocialAgentActivityPayload,
  messageForSocialAgentSchemaAction,
  readSocialAgentCardActionCandidate,
} from './social-agent-card-action.presenter';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    permissionMode: AgentTaskPermissionMode.Confirm,
    result: {},
    memory: {},
    ...overrides,
  } as AgentTask;
}

describe('social agent card action presenter', () => {
  it('builds route results with pending approval semantics', () => {
    const task = makeTask();

    const result = buildSocialAgentCardActionRouteResult({
      task,
      assistantMessage: '等待确认',
      cards: [
        buildSocialAgentCheckinCard({
          taskId: task.id,
          activityId: 700,
          candidateUserId: 22,
          realActivityPersisted: true,
        }),
      ],
      emptyIntentEntities: {
        city: '',
        activityType: '',
        targetGender: '',
        timePreference: '',
        locationPreference: '',
      },
      pendingApproval: {
        id: 9001,
        type: 'create_activity' as never,
        actionType: 'create_activity',
        summary: '创建线下约练计划',
        riskLevel: 'medium' as never,
        payload: { taskId: task.id },
        expiresAt: null,
      },
    });

    expect(result).toMatchObject({
      intent: 'action_request',
      action: 'await_confirmation',
      taskId: 101,
      permissionMode: AgentTaskPermissionMode.Confirm,
      pendingApproval: expect.objectContaining({ id: 9001 }),
      cards: [expect.objectContaining({ type: 'checkin_card' })],
    });
  });

  it('normalizes activity DTO payloads for real ActivitiesService calls', () => {
    const dto = createSocialAgentActivityDtoFromPayload({
      payload: {
        activityType: 'coffee',
        title: '周末咖啡慢聊',
        city: '青岛',
        locationName: '大学路咖啡馆',
        startTime: '2026-06-06T15:00:00.000Z',
        durationMinutes: 60,
        socialRequestId: 301,
        candidateRecordId: 501,
      },
      candidateUserId: 22,
      number: (value) => {
        const num = Number(value);
        return Number.isFinite(num) && num > 0 ? num : null;
      },
    });

    expect(dto).toMatchObject({
      type: 'coffee_chat',
      title: '周末咖啡慢聊',
      city: '青岛',
      locationName: '大学路咖啡馆',
      startTime: '2026-06-06T15:00:00.000Z',
      durationMinutes: 60,
      socialRequestId: 301,
      matchedCandidateId: 501,
      invitedUserId: 22,
      proofRequired: true,
      proofPolicy: 'mutual_or_proof',
    });
  });

  it('keeps canonical meet-loop card stages and schema actions stable', () => {
    const opener = buildSocialAgentOpenerApprovalCard({
      taskId: 101,
      targetUserId: 22,
      approvalId: 9001,
      candidate: { userId: 22, nickname: '小林' },
      displayName: '小林',
      draft: '你好，周末要不要轻松慢跑一圈？',
      regeneratePayload: { taskId: 101 },
    });
    const plan = buildSocialAgentActivityPlanCard({
      taskId: 101,
      approvalId: 9002,
      payload: { candidateUserId: 22 },
    });
    const checkin = buildSocialAgentCheckinCard({
      taskId: 101,
      activityId: 700,
      candidateUserId: 22,
      realActivityPersisted: true,
    });
    const completion = buildSocialAgentActivityCompletionCard({
      taskId: 101,
      activityId: 700,
      candidateUserId: 22,
      realActivityPersisted: true,
      checkedInAt: '2026-06-06T15:05:00.000Z',
    });
    const review = buildSocialAgentReviewCard({
      taskId: 101,
      activityId: 700,
      candidateUserId: 22,
      realActivityPersisted: true,
    });
    const lifeGraph = buildSocialAgentLifeGraphUpdateCard({
      taskId: 101,
      activityId: 700,
      candidateUserId: 22,
      realActivityPersisted: true,
      rating: 5,
      comment: '真实活动顺利完成。',
      positive: true,
      trustScoreDelta: 2,
    });

    expect(opener.actions?.map((action) => action.schemaAction)).toEqual([
      'opener.confirm_send',
      'opener.regenerate',
    ]);
    expect(plan).toMatchObject({
      type: 'activity_plan',
      data: expect.objectContaining({ loopStage: 'activity_draft_created' }),
      actions: [
        expect.objectContaining({ schemaAction: 'activity.confirm_create' }),
      ],
    });
    expect(checkin.actions?.[0]).toMatchObject({
      schemaAction: 'activity.check_in',
      loopStage: 'activity_confirmed',
    });
    expect(completion.actions?.[0]).toMatchObject({
      schemaAction: 'activity.complete',
      loopStage: 'activity_checked_in',
    });
    expect(review.actions?.[0]).toMatchObject({
      schemaAction: 'review.submit',
      loopStage: 'activity_completed',
    });
    expect(lifeGraph.actions?.map((action) => action.schemaAction)).toEqual([
      'life_graph.accept_update',
      'life_graph.reject_update',
    ]);
    expect(lifeGraph.data).toMatchObject({
      loopStage: 'trust_score_updated',
      trustScoreUpdatePreview: expect.stringContaining('+2'),
      canView: true,
      canCorrect: true,
      canRevoke: true,
    });
  });

  it('merges activity payloads from draft, meet loop, and current payload', () => {
    const task = makeTask({
      result: {
        activityDraft: {
          title: '旧标题',
          city: '青岛',
          candidateUserId: 22,
        },
        meetLoop: {
          activityId: 700,
          status: 'activity_confirmed',
        },
      },
    });

    const merged = mergeSocialAgentActivityPayload({
      task,
      payload: { title: '新标题' },
      isRecord: (value): value is Record<string, unknown> =>
        typeof value === 'object' && value !== null && !Array.isArray(value),
    });

    expect(merged).toMatchObject({
      title: '新标题',
      city: '青岛',
      candidateUserId: 22,
      activityId: 700,
      status: 'activity_confirmed',
    });
  });

  it('reads explicit card candidates and schema action fallback messages', () => {
    const candidate = readSocialAgentCardActionCandidate({
      task: makeTask(),
      payload: { candidate: { userId: 22, nickname: '小林' } },
      isRecord: (value): value is Record<string, unknown> =>
        typeof value === 'object' && value !== null && !Array.isArray(value),
    });

    expect(candidate).toMatchObject({ userId: 22, nickname: '小林' });
    expect(messageForSocialAgentSchemaAction('activity.complete')).toBe(
      '活动已完成',
    );
    expect(messageForSocialAgentSchemaAction('opener.regenerate')).toBe(
      '重新生成开场白',
    );
  });
});
