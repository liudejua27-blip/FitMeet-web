import { AgentTaskPermissionMode } from './entities/agent-task.entity';
import type { AgentTask } from './entities/agent-task.entity';
import {
  buildSocialAgentActivityCompletionCard,
  buildSocialAgentActivityDetailCard,
  buildSocialAgentActivityPlanCard,
  buildSocialAgentCandidateDetailCard,
  buildSocialAgentCardActionRouteResult,
  buildSocialAgentCheckinCard,
  buildSocialAgentLifeGraphUpdateCard,
  buildSocialAgentMeetLoopTimelineCard,
  buildSocialAgentProofSubmittedCard,
  buildSocialAgentProofUploadPromptCard,
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
    const timeline = buildSocialAgentMeetLoopTimelineCard({
      taskId: 101,
      activityId: 700,
      candidateUserId: 22,
      stage: 'message_sent',
      nextAction: '确认后继续推进',
      payload: { city: '青岛' },
    });

    expect(plan).toMatchObject({
      type: 'activity_plan',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.activity',
      data: expect.objectContaining({
        schemaName: 'OpportunityCard',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'social_match.activity',
        approvalId: 9002,
        opportunityCard: true,
        loopStage: 'activity_draft_created',
        opportunity: expect.objectContaining({
          approvalId: 9002,
          type: 'activity',
          title: '约练计划',
          safetyBadges: ['公共场所', '不共享精确位置', '确认后创建'],
          safetyBoundary: expect.stringContaining('公共场所'),
          checkinReminder: expect.stringContaining('确认是否到达'),
          reviewPrompt: expect.stringContaining('简短评价'),
          confirmedContext: ['公共场所', '不共享精确位置', '确认后创建'],
        }),
        reviewPrompt: expect.stringContaining('简短评价'),
        lifeGraphUpdatePreview: expect.stringContaining('Life Graph'),
        trustScoreUpdatePreview: expect.stringContaining('trust score'),
      }),
      actions: expect.arrayContaining([
        expect.objectContaining({ schemaAction: 'activity.confirm_create' }),
        expect.objectContaining({ schemaAction: 'activity.modify_time' }),
        expect.objectContaining({ schemaAction: 'activity.modify_location' }),
        expect.objectContaining({
          schemaAction: 'activity.skip_publish',
          requiresConfirmation: false,
        }),
      ]),
    });
    expect(checkin.actions?.[0]).toMatchObject({
      schemaAction: 'activity.check_in',
      loopStage: 'activity_confirmed',
    });
    expect(checkin).toMatchObject({
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'meet_loop.timeline',
      data: expect.objectContaining({
        schemaName: 'MeetLoopTimelineCard',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'meet_loop.timeline',
        timeline: expect.objectContaining({
          steps: expect.arrayContaining([
            expect.objectContaining({ key: 'confirmed', state: 'current' }),
          ]),
        }),
      }),
    });
    expect(completion.actions?.[0]).toMatchObject({
      schemaAction: 'activity.complete',
      loopStage: 'activity_checked_in',
    });
    expect(completion).toMatchObject({
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'meet_loop.timeline',
      data: expect.objectContaining({
        schemaName: 'MeetLoopTimelineCard',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'meet_loop.timeline',
        timeline: expect.objectContaining({
          steps: expect.arrayContaining([
            expect.objectContaining({ key: 'met', state: 'current' }),
          ]),
        }),
      }),
    });
    expect(review.actions?.[0]).toMatchObject({
      schemaAction: 'review.submit',
      loopStage: 'activity_completed',
    });
    expect(review).toMatchObject({
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'meet_loop.timeline',
      data: expect.objectContaining({
        schemaName: 'MeetLoopTimelineCard',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'meet_loop.timeline',
        timeline: expect.objectContaining({
          steps: expect.arrayContaining([
            expect.objectContaining({ key: 'completed', state: 'current' }),
          ]),
        }),
      }),
    });
    expect(lifeGraph.actions?.map((action) => action.schemaAction)).toEqual([
      'life_graph.accept_update',
      'life_graph.reject_update',
    ]);
    expect(lifeGraph.data).toMatchObject({
      schemaName: 'LifeGraphDiffCard',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'life_graph.diff',
      loopStage: 'trust_score_updated',
      diff: expect.objectContaining({
        fields: ['运动社交偏好', '约练节奏', '履约可信度'],
        confirmationBoundary: expect.stringContaining('画像更新建议'),
        privacyBoundary: expect.stringContaining('不会写入精确位置'),
        revokeHint: expect.stringContaining('撤回'),
      }),
      trustScoreUpdatePreview: expect.stringContaining('+2'),
      canView: true,
      canCorrect: true,
      canRevoke: true,
    });
    expect(timeline).toMatchObject({
      type: 'meet_loop_timeline',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'meet_loop.timeline',
      data: expect.objectContaining({
        schemaName: 'MeetLoopTimelineCard',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'meet_loop.timeline',
        taskId: 101,
        activityId: 700,
        candidateUserId: 22,
        loopStage: 'message_sent',
        timeline: expect.objectContaining({
          nextAction: '确认后继续推进',
          recoveryProtocol: expect.arrayContaining([
            expect.objectContaining({
              key: 'checkpoint',
              label: '可继续',
              detail: expect.stringContaining('回到当前邀约进度继续处理'),
            }),
            expect.objectContaining({
              key: 'waiting_for',
              label: '等待对象',
              detail: '正在等待对方回复',
            }),
            expect.objectContaining({
              key: 'side_effect',
              label: '触达边界',
              detail: expect.stringContaining('不会自动追发'),
            }),
          ]),
          steps: expect.arrayContaining([
            expect.objectContaining({
              key: 'sent',
              state: 'current',
              checkpointReady: true,
              resumeMode: 'resume',
            }),
          ]),
        }),
        recoveryProtocol: expect.arrayContaining([
          expect.objectContaining({ key: 'resume', label: '恢复方式' }),
        ]),
      }),
      actions: expect.arrayContaining([
        expect.objectContaining({
          action: 'resume_meet_loop',
          schemaAction: 'meet_loop.resume',
          requiresConfirmation: true,
        }),
        expect.objectContaining({
          action: 'reschedule_meet_loop',
          schemaAction: 'meet_loop.reschedule',
          requiresConfirmation: true,
        }),
      ]),
    });
    expect(
      (
        timeline.data.timeline as {
          steps: Array<Record<string, unknown>>;
        }
      ).steps.map((step) => [step.key, step.label, step.state]),
    ).toEqual([
      ['draft', '发起', 'done'],
      ['sent', '等待回复', 'current'],
      ['reschedule', '改期', 'next'],
      ['confirmed', '确认', 'next'],
      ['met', '见面', 'next'],
      ['completed', '评价', 'next'],
      ['life_graph', '回写画像', 'next'],
    ]);
    expect(
      buildSocialAgentMeetLoopTimelineCard({
        taskId: 101,
        activityId: 700,
        candidateUserId: 22,
        stage: 'met',
      }).data,
    ).toMatchObject({
      timeline: expect.objectContaining({
        steps: expect.arrayContaining([
          expect.objectContaining({
            key: 'met',
            label: '见面',
            state: 'current',
            actionLabel: '安全见面',
            checkpointReady: true,
            resumeMode: 'resume',
          }),
          expect.objectContaining({
            key: 'completed',
            state: 'next',
            resumeMode: 'review',
          }),
        ]),
      }),
    });
    expect(
      buildSocialAgentMeetLoopTimelineCard({
        taskId: 101,
        activityId: 700,
        candidateUserId: 22,
        stage: 'activity_checked_in',
      }).data,
    ).toMatchObject({
      timeline: expect.objectContaining({
        steps: expect.arrayContaining([
          expect.objectContaining({
            key: 'met',
            label: '见面',
            state: 'current',
            actionLabel: '安全见面',
            checkpointReady: true,
            resumeMode: 'resume',
          }),
          expect.objectContaining({
            key: 'completed',
            label: '评价',
            state: 'next',
            resumeMode: 'review',
          }),
        ]),
      }),
    });
    expect(
      buildSocialAgentMeetLoopTimelineCard({
        taskId: 101,
        activityId: 700,
        candidateUserId: 22,
        stage: 'trust_score_updated',
      }).data,
    ).toMatchObject({
      timeline: expect.objectContaining({
        steps: expect.arrayContaining([
          expect.objectContaining({
            key: 'life_graph',
            label: '回写画像',
            state: 'current',
            actionLabel: '确认后回写',
            checkpointReady: true,
            resumeMode: 'memory',
          }),
        ]),
      }),
    });
    expect(
      buildSocialAgentProofUploadPromptCard({
        taskId: 101,
        activityId: 700,
      }),
    ).toMatchObject({
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.activity',
      data: expect.objectContaining({
        schemaName: 'OpportunityCard',
        schemaType: 'social_match.activity',
        opportunity: expect.objectContaining({
          title: '补充活动证明',
          safetyBadges: expect.arrayContaining(['不强制露脸']),
        }),
      }),
      actions: [
        expect.objectContaining({
          schemaAction: 'activity.view_detail',
          action: 'view_activity',
        }),
      ],
    });
    expect(
      buildSocialAgentProofSubmittedCard({
        taskId: 101,
        activityId: 700,
        proofId: 800,
        proofType: 'scene_photo',
      }),
    ).toMatchObject({
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.activity',
      data: expect.objectContaining({
        schemaName: 'OpportunityCard',
        schemaType: 'social_match.activity',
        status: 'proof_submitted',
        proofStatus: '证明待对方确认',
        opportunity: expect.objectContaining({
          title: '活动证明已提交',
          meetLoopNextStep: expect.stringContaining('评价与画像更新'),
        }),
      }),
    });
    expect(
      buildSocialAgentActivityDetailCard({
        taskId: 101,
        activityId: 700,
        activity: {
          title: '周末慢跑',
          status: 'completed',
          city: '青岛',
          locationName: '青岛大学操场',
          proofRequired: true,
          proofPolicy: 'mutual_or_proof',
        },
        proofs: [{ id: 800, status: 'pending', proofType: 'scene_photo' }],
      }),
    ).toMatchObject({
      type: 'activity_status',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.activity',
      title: '周末慢跑',
      data: expect.objectContaining({
        schemaName: 'OpportunityCard',
        schemaType: 'social_match.activity',
        status: 'completed',
        proofCount: 1,
        proofStatus: '1 条证明待确认',
        opportunity: expect.objectContaining({
          title: '周末慢跑',
          safetyBoundary: expect.stringContaining('精确位置'),
          meetLoopNextStep: expect.stringContaining('评价和画像更新'),
        }),
      }),
      actions: [
        expect.objectContaining({
          schemaAction: 'activity.upload_proof',
          action: 'upload_proof',
        }),
      ],
    });
  });

  it('preserves candidate reasoning quality on detail cards without raw fallback leakage', () => {
    const card = buildSocialAgentCandidateDetailCard({
      taskId: 101,
      candidate: {
        userId: 22,
        displayName: '小林',
        city: '青岛',
        matchScore: 87,
        matchReasoner: {
          source: 'fallback',
          confidence: 0.43,
          degraded: true,
          retryable: true,
          degradationReason: 'upstream overloaded',
        },
      },
    });

    expect(card).toMatchObject({
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.candidate',
      actions: expect.arrayContaining([
        expect.objectContaining({
          id: 'candidate_view_detail:101:22',
          label: '查看详情',
          schemaAction: 'candidate.view_detail',
          requiresConfirmation: false,
        }),
        expect.objectContaining({
          id: 'candidate_like:101:22',
          label: '收藏',
          schemaAction: 'candidate.like',
          requiresConfirmation: false,
        }),
        expect.objectContaining({
          id: 'candidate_generate_opener:101:22',
          label: '生成开场白',
          schemaAction: 'candidate.generate_opener',
          requiresConfirmation: false,
        }),
        expect.objectContaining({
          id: 'candidate_send_invite:101:22',
          label: '发送邀请',
          schemaAction: 'opener.confirm_send',
          requiresConfirmation: true,
          payload: expect.objectContaining({
            approvalRequired: true,
            checkpointRequired: true,
            resumeMode: 'resume_after_approval',
            idempotencyKey: 'opener-send:101:22',
          }),
        }),
        expect.objectContaining({
          id: 'candidate_connect:101:22',
          label: '确认后邀请Ta',
          schemaAction: 'candidate.connect',
          requiresConfirmation: true,
          payload: expect.objectContaining({
            approvalRequired: true,
            checkpointRequired: true,
            resumeMode: 'resume_after_approval',
            idempotencyKey: 'candidate-connect:101:22',
          }),
        }),
        expect.objectContaining({
          id: 'candidate_more_like_this:101:22',
          schemaAction: 'candidate.more_like_this',
          requiresConfirmation: false,
        }),
      ]),
      data: expect.objectContaining({
        reasonerSource: 'fallback',
        reasoningConfidence: 0.43,
        reasoningDegraded: true,
        reasoningRetryable: true,
        matchReasoner: {
          source: 'fallback',
          confidence: 0.43,
          degraded: true,
          retryable: true,
          degradationReason: 'model_unavailable',
        },
        opportunity: expect.objectContaining({
          reasonerSource: 'fallback',
          reasoningConfidence: 0.43,
          reasoningDegraded: true,
          reasoningRetryable: true,
          matchReasoner: {
            source: 'fallback',
            confidence: 0.43,
            degraded: true,
            retryable: true,
            degradationReason: 'model_unavailable',
          },
        }),
      }),
    });
    expect(JSON.stringify(card)).not.toContain('upstream overloaded');
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
    expect(messageForSocialAgentSchemaAction('opener.reject')).toBe(
      '取消发送开场白',
    );
    expect(messageForSocialAgentSchemaAction('activity.upload_proof')).toBe(
      '上传活动证明',
    );
    expect(messageForSocialAgentSchemaAction('meet_loop.resume')).toBe(
      '继续推进邀约',
    );
    expect(messageForSocialAgentSchemaAction('meet_loop.reschedule')).toBe(
      '调整约练时间',
    );
  });

  it('offers private matching actions when a draft is kept private', () => {
    const timeline = buildSocialAgentMeetLoopTimelineCard({
      taskId: 101,
      activityId: 700,
      candidateUserId: 22,
      stage: 'activity_draft_private',
      nextAction:
        '你可以继续私密匹配公开可发现用户，也可以之后再确认发布到发现。',
      payload: { city: '青岛', visibility: 'private' },
    });

    expect(timeline.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: '继续私密匹配',
          schemaAction: 'candidate.more_like_this',
          requiresConfirmation: false,
          payload: expect.objectContaining({
            privateMatchMode: true,
            candidateSearchMode: 'private_match_without_discover_publish',
            publicDiscoverPublishSkipped: true,
          }),
        }),
        expect.objectContaining({
          label: '重新发布到发现',
          schemaAction: 'publish_to_discover',
          requiresConfirmation: true,
          payload: expect.objectContaining({
            checkpointRequired: true,
            resumeMode: 'resume_after_approval',
          }),
        }),
      ]),
    );
  });
});
