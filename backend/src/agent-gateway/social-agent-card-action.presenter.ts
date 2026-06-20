import { cleanDisplayText } from '../common/display-text.util';
import type { CreateActivityDto } from '../activities/dto/activity.dto';
import {
  ActivityProofPolicy,
  ActivityType,
} from '../activities/entities/activity-template.entity';
import { AgentTask } from './entities/agent-task.entity';
import { readSocialAgentStoredCandidateSummaries } from './social-agent-chat-session.presenter';
import type {
  FitMeetAgentSchemaAction,
  FitMeetAlphaCard,
  FitMeetAlphaCardAction,
} from './fitmeet-alpha-agent.types';
import type {
  SocialAgentIntentRouteResult,
  SocialAgentPendingApprovalSnapshot,
} from './social-agent-chat.types';

export function buildSocialAgentCardActionRouteResult(input: {
  task: AgentTask;
  assistantMessage: string;
  cards: FitMeetAlphaCard[];
  emptyIntentEntities: SocialAgentIntentRouteResult['entities'];
  pendingApproval?: SocialAgentPendingApprovalSnapshot | null;
}): SocialAgentIntentRouteResult {
  return {
    intent: 'action_request',
    confidence: 1,
    entities: input.emptyIntentEntities,
    shouldSearch: false,
    shouldReplan: false,
    shouldUpdateProfile: false,
    shouldExecuteAction: true,
    replyStrategy: 'execute_action',
    source: 'rules',
    action: input.pendingApproval ? 'await_confirmation' : 'reply',
    taskId: input.task.id,
    assistantMessage: input.assistantMessage,
    savedContext: true,
    profileUpdated: false,
    shouldQueueRun: false,
    runMode: null,
    queuedRun: null,
    pendingApproval: input.pendingApproval ?? null,
    activityResults: [],
    profileUpdateProposal: null,
    cards: input.cards,
    permissionMode: input.task.permissionMode,
  };
}

export function buildSocialAgentOpenerApprovalCard(input: {
  taskId: number;
  targetUserId: number | null;
  approvalId: number;
  candidate: Record<string, unknown>;
  displayName: string;
  draft: string;
  regeneratePayload: Record<string, unknown>;
}): FitMeetAlphaCard {
  return {
    id: `opener_approval:${input.taskId}:${input.targetUserId ?? input.approvalId}`,
    type: 'opener_approval',
    schemaVersion: 'fitmeet.tool-ui.v1',
    schemaType: 'safety.approval',
    title: '这条消息会发送给对方。我先帮你写好了，你确认后我再发。',
    body: input.draft,
    status: 'waiting_confirmation',
    data: {
      taskId: input.taskId,
      schemaName: 'SafetyApprovalCard',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'safety.approval',
      targetUserId: input.targetUserId,
      displayName: input.displayName,
      message: input.draft,
      loopStage: 'opener_draft_created',
      riskLevel: 'medium',
      reasons: ['这一步会向真实用户发送消息', '发送前需要你确认语气和内容'],
      auditNote: '确认、拒绝和执行结果都会进入审批审计日志。',
      confirmationLabel: '确认后发送',
      checkpointLabel: '开场白已保存，可重新生成或取消',
      safetyBoundary: '确认前不会发送。建议先站内沟通，不急着交换联系方式。',
      approval: {
        title: '这条消息会发送给对方。我先帮你写好了，你确认后我再发。',
        boundary: '确认前不会发送。建议先站内沟通，不急着交换联系方式。',
        riskLevel: 'medium',
        reasons: ['这一步会向真实用户发送消息', '发送前需要你确认语气和内容'],
        auditNote: '确认、拒绝和执行结果都会进入审批审计日志。',
        confirmationLabel: '确认后发送',
        checkpointLabel: '开场白已保存，可重新生成或取消',
      },
    },
    actions: [
      {
        id: 'opener_confirm_send',
        label: '确认发送',
        action: 'send_message',
        schemaAction: 'opener.confirm_send',
        loopStage: 'opener_draft_created',
        requiresConfirmation: true,
        payload: {
          taskId: input.taskId,
          targetUserId: input.targetUserId,
          candidate: input.candidate,
          message: input.draft,
          approvalId: input.approvalId,
          safetyBoundary: '确认前不会发送。建议先站内沟通，不急着交换联系方式。',
          approvalRequired: true,
          checkpointRequired: true,
          resumeMode: 'resume_after_approval',
          idempotencyKey: `opener-send:${input.taskId}:${input.targetUserId ?? input.approvalId}`,
        },
      },
      {
        id: 'opener_regenerate',
        label: '重新生成',
        action: 'generate_opener',
        schemaAction: 'opener.regenerate',
        loopStage: 'opener_draft_created',
        requiresConfirmation: false,
        payload: {
          ...input.regeneratePayload,
          taskId: input.taskId,
          targetUserId: input.targetUserId,
          candidate: input.candidate,
          message: input.draft,
          approvalId: input.approvalId,
        },
      },
      {
        id: 'opener_reject_send',
        label: '取消发送',
        action: 'reject_opener',
        schemaAction: 'opener.reject',
        loopStage: 'opener_draft_created',
        requiresConfirmation: false,
        payload: {
          taskId: input.taskId,
          targetUserId: input.targetUserId,
          candidate: input.candidate,
          message: input.draft,
          approvalId: input.approvalId,
        },
      },
    ],
  };
}

export function buildSocialAgentCandidateDetailCard(input: {
  taskId: number;
  candidate: Record<string, unknown>;
}): FitMeetAlphaCard {
  const candidate = input.candidate;
  const targetUserId = number(
    candidate.targetUserId ?? candidate.candidateUserId ?? candidate.userId,
  );
  const candidateRecordId = number(candidate.candidateRecordId);
  const socialRequestId = number(candidate.socialRequestId);
  const displayName =
    cleanDisplayText(
      candidate.displayName ?? candidate.nickname ?? candidate.name,
      '',
    ) || (targetUserId ? `候选人 #${targetUserId}` : '候选人');
  const area =
    cleanDisplayText(
      candidate.area ?? candidate.city ?? candidate.location ?? candidate.region,
      '',
    ) || null;
  const time =
    cleanDisplayText(
      candidate.time ??
        candidate.timePreference ??
        candidate.availableTime ??
        candidate.whyNow,
      '',
    ) || null;
  const summary =
    cleanDisplayText(
      candidate.summary ??
        candidate.recommendationLine ??
        candidate.candidateExplanation ??
        candidate.reason,
      '',
    ) || '我把这个候选人的公开资料、共同兴趣和安全边界整理成了更完整的详情。';
  const suggestedOpener =
    cleanDisplayText(
      candidate.suggestedOpener ??
        candidate.suggestedMessage ??
        candidate.opener ??
        candidate.message,
      '',
    ) || '你好，我看到我们有一些共同兴趣，想先轻松聊聊，看是否适合一起活动。';
  const interests = stringArray(
    candidate.interests ??
      candidate.tags ??
      candidate.sharedInterests ??
      candidate.commonInterests,
  );
  const reasons = stringArray(
    candidate.fitReasons ??
      candidate.matchReasons ??
      candidate.reasons ??
      candidate.explanationSteps,
  );
  const safetyBadges =
    stringArray(candidate.safetyBadges ?? candidate.safetySignals).length > 0
      ? stringArray(candidate.safetyBadges ?? candidate.safetySignals)
      : ['公开可发现', '确认后邀请', '先站内沟通'];
  const safetyBoundary =
    cleanDisplayText(candidate.safetyBoundary ?? candidate.boundary, '') ||
    '这只是公开可发现资料下的安全机会；发送邀请、加好友或线下见面前都需要你确认。';
  const reasoningQuality = candidateReasoningQuality(candidate);
  const opportunity = {
    id: `opportunity:${input.taskId}:candidate:${targetUserId ?? candidateRecordId ?? 'detail'}`,
    type: 'person',
    name: displayName,
    title: displayName,
    subtitle:
      cleanDisplayText(candidate.subtitle ?? candidate.contextLine, '') ||
      '候选详情已展开',
    avatarUrl: cleanDisplayText(candidate.avatarUrl ?? candidate.imageUrl, '') || null,
    score: number(candidate.score ?? candidate.matchScore) ?? null,
    summary,
    relationshipGoal:
      cleanDisplayText(candidate.relationshipGoal ?? candidate.relationGoal, '') ||
      null,
    idealType:
      cleanDisplayText(candidate.idealType ?? candidate.targetPreference, '') ||
      null,
    invitePolicy:
      cleanDisplayText(candidate.invitePolicy ?? candidate.contactPolicy, '') ||
      '生成开场白后，你确认才会发送邀请。',
    area,
    time,
    distanceLabel:
      cleanDisplayText(candidate.distanceLabel ?? candidate.distance, '') || null,
    interests,
    safetyBadges,
    reasons:
      reasons.length > 0
        ? reasons
        : [
            area ? `地点/区域接近：${area}` : null,
            interests[0] ? `共同兴趣：${interests.slice(0, 2).join('、')}` : null,
            '发送前会保留确认边界',
          ].filter(Boolean),
    explanationSteps: stringArray(candidate.explanationSteps).slice(0, 3),
    trustSignals: stringArray(candidate.trustSignals ?? candidate.consentSignals),
    coldStartSignals: stringArray(candidate.coldStartSignals),
    reasonerSource: reasoningQuality.reasonerSource,
    reasoningConfidence: reasoningQuality.reasoningConfidence,
    reasoningDegraded: reasoningQuality.reasoningDegraded,
    reasoningRetryable: reasoningQuality.reasoningRetryable,
    matchReasoner: reasoningQuality.matchReasoner,
    suggestedOpener,
    recommendedNextAction:
      '先查看详情和边界，再生成开场白；只有你确认后，我才会发送邀请。',
    safetyBoundary,
    confirmedContext: ['公开可发现资料', '低风险站内沟通', '发送前确认'],
  };
  const safeCandidate = candidateActionSnapshot(candidate);
  const basePayload = {
    taskId: input.taskId,
    targetUserId,
    candidateUserId: targetUserId,
    candidateRecordId,
    socialRequestId,
    candidate: safeCandidate,
    suggestedOpener,
    safetyBoundary,
  };
  return {
    id: `candidate_detail:${input.taskId}:${targetUserId ?? candidateRecordId ?? 'unknown'}`,
    type: 'candidate_card',
    schemaVersion: 'fitmeet.tool-ui.v1',
    schemaType: 'social_match.candidate',
    title: displayName,
    body: summary,
    status: 'ready',
    data: {
      taskId: input.taskId,
      schemaName: 'OpportunityCard',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.candidate',
      opportunityCard: true,
      detailExpanded: true,
      displayName,
      targetUserId,
      candidateUserId: targetUserId,
      candidateRecordId,
      socialRequestId,
      ...opportunity,
      opportunity,
    },
    actions: [
      {
        id: 'candidate_generate_opener',
        label: '生成开场白',
        action: 'generate_opener',
        schemaAction: 'candidate.generate_opener',
        requiresConfirmation: false,
        payload: basePayload,
      },
      {
        id: 'candidate_connect',
        label: '发送邀请',
        action: 'connect_candidate',
        schemaAction: 'candidate.connect',
        requiresConfirmation: true,
        payload: {
          ...basePayload,
          approvalRequired: true,
          checkpointRequired: true,
          resumeMode: 'resume_after_approval',
          idempotencyKey: `candidate-connect:${input.taskId}:${targetUserId ?? candidateRecordId ?? 'unknown'}`,
        },
      },
      {
        id: 'candidate_more_like_this',
        label: '找相似的人',
        action: 'candidate.more_like_this',
        schemaAction: 'candidate.more_like_this',
        requiresConfirmation: false,
        payload: basePayload,
      },
    ],
  };
}

export function buildSocialAgentActivityPlanCard(input: {
  taskId: number;
  approvalId: number;
  payload: Record<string, unknown>;
}): FitMeetAlphaCard {
  return {
    id: `activity_plan:${input.taskId}:${input.approvalId}`,
    type: 'activity_plan',
    schemaVersion: 'fitmeet.tool-ui.v1',
    schemaType: 'social_match.activity',
    title: '我可以帮你创建一个约练计划',
    body: '确认前不会创建活动。第一次见面建议选择公共场所，我不会共享你的精确位置。',
    status: 'waiting_confirmation',
    data: {
      taskId: input.taskId,
      schemaName: 'OpportunityCard',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.activity',
      opportunityCard: true,
      loopStage: 'activity_draft_created',
      publicPlaceOnly: true,
      noPreciseLocation: true,
      safetyBoundary: '公共场所见面，不共享精确位置。',
      checkinReminder: '活动开始前我会提醒你确认是否到达。',
      reviewPrompt: '活动结束后我会请你做一次简短评价，再决定是否写入画像。',
      lifeGraphUpdatePreview: '完成后会把这次活动结果用于更新你的 Life Graph。',
      trustScoreUpdatePreview:
        '完成与评价会写入 trust score，用来提升后续推荐可信度。',
      opportunity: {
        id: `opportunity:${input.taskId}:activity:${input.approvalId}`,
        type: 'activity',
        title: '约练计划',
        subtitle: '确认后创建',
        summary:
          '确认前不会创建活动。第一次见面建议选择公共场所，我不会共享你的精确位置。',
        safetyBadges: ['公共场所', '不共享精确位置', '确认后创建'],
        recommendedNextAction: '确认后我再创建约练，不会自动公开发布。',
        safetyBoundary: '公共场所见面，不共享精确位置。',
        checkinReminder: '活动开始前我会提醒你确认是否到达。',
        reviewPrompt: '活动结束后我会请你做一次简短评价，再决定是否写入画像。',
        confirmedContext: ['公共场所', '不共享精确位置', '确认后创建'],
      },
      opportunityType: 'activity',
      opportunityTitle: '约练计划',
      opportunitySubtitle: '确认后创建',
      confirmedContext: ['公共场所', '不共享精确位置', '确认后创建'],
    },
    actions: [
      {
        id: 'activity_confirm_create',
        label: '确认创建',
        action: 'create_activity',
        schemaAction: 'activity.confirm_create',
        loopStage: 'activity_draft_created',
        requiresConfirmation: true,
        payload: {
          taskId: input.taskId,
          approvalId: input.approvalId,
          publicPlaceOnly: true,
          noPreciseLocation: true,
          safetyBoundary: '公共场所见面，不共享精确位置。',
          checkinReminder: '活动开始前我会提醒你确认是否到达。',
          reviewPrompt: '活动结束后我会请你做一次简短评价，再决定是否写入画像。',
          ...input.payload,
        },
      },
      {
        id: 'activity_modify_time',
        label: '调整时间',
        action: 'reschedule_meet_loop',
        schemaAction: 'activity.modify_time',
        loopStage: 'activity_draft_created',
        requiresConfirmation: false,
        payload: {
          taskId: input.taskId,
          approvalId: input.approvalId,
          publicPlaceOnly: true,
          noPreciseLocation: true,
          safetyBoundary: '公共场所见面，不共享精确位置。',
          ...input.payload,
        },
      },
      {
        id: 'activity_modify_location',
        label: '调整地点',
        action: 'reschedule_meet_loop',
        schemaAction: 'activity.modify_location',
        loopStage: 'activity_draft_created',
        requiresConfirmation: false,
        payload: {
          taskId: input.taskId,
          approvalId: input.approvalId,
          publicPlaceOnly: true,
          noPreciseLocation: true,
          safetyBoundary: '公共场所见面，不共享精确位置。',
          ...input.payload,
        },
      },
    ],
  };
}

export function buildSocialAgentCheckinCard(input: {
  taskId: number;
  activityId: number | null;
  candidateUserId: number | null;
  realActivityPersisted: boolean;
}): FitMeetAlphaCard {
  return {
    id: `checkin_card:${input.taskId}:${input.activityId ?? 'draft'}`,
    type: 'checkin_card',
    schemaVersion: 'fitmeet.tool-ui.v1',
    schemaType: 'meet_loop.timeline',
    title: '约练计划已创建。开始前，我会提醒你确认是否到达。',
    body: '第一次见面仍建议选择校园操场、公园等公共场所。这里不会共享你的精确位置。',
    status: 'ready',
    data: {
      taskId: input.taskId,
      schemaName: 'MeetLoopTimelineCard',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'meet_loop.timeline',
      activityId: input.activityId,
      candidateUserId: input.candidateUserId,
      realActivityPersisted: input.realActivityPersisted,
      loopStage: 'activity_confirmed',
      timeline: {
        title: '约练进展',
        description: '活动计划已创建，开始前先确认到达和安全边界。',
        nextAction: '开始前确认是否到达；不会共享精确位置。',
        steps: socialAgentMeetLoopTimelineSteps('activity_confirmed', '确认到达后继续'),
      },
      publicPlaceOnly: true,
      noPreciseLocation: true,
      safetyBoundary: '公共场所见面，不共享精确位置。',
    },
    actions: [
      {
        id: 'activity_check_in',
        label: '我已到达，签到',
        action: 'check_in',
        schemaAction: 'activity.check_in',
        loopStage: 'activity_confirmed',
        requiresConfirmation: false,
        payload: {
          taskId: input.taskId,
          activityId: input.activityId,
          candidateUserId: input.candidateUserId,
        },
      },
    ],
  };
}

export function buildSocialAgentActivityCompletionCard(input: {
  taskId: number;
  activityId: number | null;
  candidateUserId: number | null;
  realActivityPersisted: boolean;
  checkedInAt: string;
}): FitMeetAlphaCard {
  return {
    id: `activity_complete:${input.taskId}:${input.activityId ?? 'draft'}`,
    type: 'checkin_card',
    schemaVersion: 'fitmeet.tool-ui.v1',
    schemaType: 'meet_loop.timeline',
    title: '已签到。活动结束后，告诉我是否完成。',
    body: '如果临时不舒服或现场环境不合适，可以直接取消，不需要勉强完成。',
    status: 'ready',
    data: {
      taskId: input.taskId,
      schemaName: 'MeetLoopTimelineCard',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'meet_loop.timeline',
      activityId: input.activityId,
      candidateUserId: input.candidateUserId,
      realActivityPersisted: input.realActivityPersisted,
      loopStage: 'activity_checked_in',
      timeline: {
        title: '约练进展',
        description: '已记录到达，活动结束后可确认完成并留下评价。',
        nextAction: '活动结束后确认是否完成。',
        steps: socialAgentMeetLoopTimelineSteps('activity_checked_in', '活动结束后确认完成'),
      },
      checkedInAt: input.checkedInAt,
    },
    actions: [
      {
        id: 'activity_complete',
        label: '活动已完成',
        action: 'submit_review',
        schemaAction: 'activity.complete',
        loopStage: 'activity_checked_in',
        requiresConfirmation: false,
        payload: {
          taskId: input.taskId,
          activityId: input.activityId,
          candidateUserId: input.candidateUserId,
        },
      },
    ],
  };
}

export function buildSocialAgentReviewCard(input: {
  taskId: number;
  activityId: number | null;
  candidateUserId: number | null;
  realActivityPersisted: boolean;
}): FitMeetAlphaCard {
  return {
    id: `review_card:${input.taskId}:${input.activityId ?? 'draft'}`,
    type: 'review_card',
    schemaVersion: 'fitmeet.tool-ui.v1',
    schemaType: 'meet_loop.timeline',
    title: '这次约练完成了吗？我可以帮你记录一个简短评价。',
    body: '评价会帮助我调整后续推荐，也会用于更新你的 Life Graph 和履约可信度。',
    status: 'ready',
    data: {
      taskId: input.taskId,
      schemaName: 'MeetLoopTimelineCard',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'meet_loop.timeline',
      activityId: input.activityId,
      candidateUserId: input.candidateUserId,
      realActivityPersisted: input.realActivityPersisted,
      loopStage: 'activity_completed',
      timeline: {
        title: '约练进展',
        description: '活动已进入评价阶段，确认后才会写入长期画像。',
        nextAction: '提交评价后，我会给出画像更新建议。',
        steps: socialAgentMeetLoopTimelineSteps('activity_completed', '提交评价后进入画像确认'),
      },
      defaultRating: 5,
      lifeGraphUpdatePreview:
        '会记录你完成了一次低压力运动社交，并提高类似时间、地点和运动强度的推荐权重。',
      trustScoreUpdatePreview:
        '完成记录会提升你的履约可信度；正向评价会让后续推荐更相信这类搭子适合你。',
    },
    actions: [
      {
        id: 'review_submit',
        label: '提交评价',
        action: 'submit_review',
        schemaAction: 'review.submit',
        loopStage: 'activity_completed',
        requiresConfirmation: false,
        payload: {
          taskId: input.taskId,
          activityId: input.activityId,
          candidateUserId: input.candidateUserId,
          rating: 5,
          comment: '这次约练顺利完成，节奏比较轻松。',
        },
      },
    ],
  };
}

export function buildSocialAgentMeetLoopTimelineCard(input: {
  taskId: number;
  activityId?: number | null;
  candidateUserId?: number | null;
  stage?: string | null;
  description?: string | null;
  nextAction?: string | null;
  payload?: Record<string, unknown> | null;
}): FitMeetAlphaCard {
  const stage = cleanDisplayText(input.stage, '') || 'activity_draft_created';
  const steps = socialAgentMeetLoopTimelineSteps(stage, input.nextAction);
  const payload = input.payload ?? {};
  const recoveryProtocol = meetLoopRecoveryProtocol(stage, payload);
  return {
    id: `meet_loop_timeline:${input.taskId}:${input.activityId ?? 'draft'}`,
    type: 'review_card',
    schemaVersion: 'fitmeet.tool-ui.v1',
    schemaType: 'meet_loop.timeline',
    title: '邀约进展',
    body:
      cleanDisplayText(input.description, '') ||
      '我会沿保存的进度继续推进；涉及发送、连接或创建活动时仍会等你确认。',
    status: 'ready',
    data: {
      taskId: input.taskId,
      schemaName: 'MeetLoopTimelineCard',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'meet_loop.timeline',
      activityId: input.activityId ?? null,
      candidateUserId: input.candidateUserId ?? null,
      loopStage: stage,
      timeline: {
        title: '约练进展',
        description:
          cleanDisplayText(input.description, '') ||
          '每一步都可以从保存的上下文继续。',
        nextAction:
          cleanDisplayText(input.nextAction, '') ||
          '确认后继续推进，不会自动触达对方。',
        recoveryProtocol,
        steps,
      },
      recoveryProtocol,
      safetyBoundary:
        '继续推进只会恢复上下文；真实发送、连接、创建活动或隐私写入仍需确认。',
      ...payload,
    },
    actions: meetLoopTimelineActions({
      taskId: input.taskId,
      activityId: input.activityId ?? null,
      candidateUserId: input.candidateUserId ?? null,
      payload,
    }),
  };
}

function meetLoopRecoveryProtocol(
  stage: string,
  payload: Record<string, unknown>,
): Array<{ key: string; label: string; detail: string }> {
  const waitingFor = cleanDisplayText(payload.waitingFor, '');
  const isWaitingReply =
    stage === 'message_sent' ||
    stage === 'invite_sent' ||
    waitingFor === 'counterpart_reply' ||
    cleanDisplayText(payload.connectionState, '') === 'waiting_reply';
  return [
    {
      key: 'checkpoint',
      label: '进度保存',
      detail: '当前邀约状态已保存，刷新或断线后可以回到这一步。',
    },
    {
      key: 'waiting_for',
      label: isWaitingReply ? '等待对象' : '下一步',
      detail: isWaitingReply ? '正在等待对方回复' : '继续前会先恢复上下文。',
    },
    {
      key: 'side_effect',
      label: '触达边界',
      detail: '不会自动追发、加好友、创建活动或公开发布。',
    },
    {
      key: 'resume',
      label: '恢复方式',
      detail: '继续聊天、改期或发起约练前都会再次确认。',
    },
  ];
}

function meetLoopTimelineActions(input: {
  taskId: number;
  activityId: number | null;
  candidateUserId: number | null;
  payload: Record<string, unknown>;
}): FitMeetAlphaCardAction[] {
  const counterpartIntent = cleanDisplayText(input.payload.counterpartIntent, '');
  const nextStepText = cleanDisplayText(
    input.payload.nextSafeStep ??
      input.payload.nextAction ??
      input.payload.toolName,
    '',
  ).toLowerCase();
  const basePayload = {
    taskId: input.taskId,
    activityId: input.activityId,
    candidateUserId: input.candidateUserId,
    ...input.payload,
  };
  if (counterpartIntent === 'declined') {
    return [
      {
        id: 'meet_loop_find_new_opportunities',
        label: '重新找机会',
        action: 'candidate.more_like_this',
        schemaAction: 'candidate.more_like_this',
        requiresConfirmation: false,
        payload: basePayload,
      },
    ];
  }
  if (counterpartIntent === 'reschedule_requested') {
    return [
      {
        id: 'meet_loop_reschedule',
        label: '生成改期草稿',
        action: 'reschedule_meet_loop',
        schemaAction: 'meet_loop.reschedule',
        loopStage: 'activity_draft_created',
        requiresConfirmation: true,
        payload: basePayload,
      },
    ];
  }
  if (
    counterpartIntent === 'accepted' &&
    /activity|invite_activity|create_activity|offline|约练|活动|创建/.test(nextStepText)
  ) {
    return [
      {
        id: 'meet_loop_prepare_activity',
        label: '准备约练草案',
        action: 'create_activity',
        schemaAction: 'activity.confirm_create',
        loopStage: 'activity_draft_created',
        requiresConfirmation: true,
        payload: {
          ...basePayload,
          approvalRequired: true,
          checkpointRequired: true,
        },
      },
      meetLoopResumeAction(basePayload),
      meetLoopRescheduleAction(basePayload),
    ];
  }
  return [meetLoopResumeAction(basePayload), meetLoopRescheduleAction(basePayload)];
}

function meetLoopResumeAction(payload: Record<string, unknown>): FitMeetAlphaCardAction {
  return {
    id: 'meet_loop_resume',
    label: '继续推进',
    action: 'resume_meet_loop',
    schemaAction: 'meet_loop.resume',
    loopStage: 'activity_draft_created',
    requiresConfirmation: true,
    payload,
  };
}

function meetLoopRescheduleAction(payload: Record<string, unknown>): FitMeetAlphaCardAction {
  return {
    id: 'meet_loop_reschedule',
    label: '调整时间',
    action: 'reschedule_meet_loop',
    schemaAction: 'meet_loop.reschedule',
    loopStage: 'activity_draft_created',
    requiresConfirmation: true,
    payload,
  };
}

export function buildSocialAgentLifeGraphUpdateCard(input: {
  taskId: number;
  activityId: number | null;
  candidateUserId: number | null;
  realActivityPersisted: boolean;
  rating: number;
  comment: string;
  positive: boolean;
  trustScoreDelta: number;
  context?: 'activity' | 'counterpart_reply';
}): FitMeetAlphaCard {
  const isCounterpartReply = input.context === 'counterpart_reply';
  const loopStage = isCounterpartReply
    ? 'reply_received'
    : 'trust_score_updated';
  return {
    id: `life_graph_update:${input.taskId}:${input.activityId ?? 'draft'}`,
    type: 'audit_update',
    schemaVersion: 'fitmeet.tool-ui.v1',
    schemaType: 'life_graph.diff',
    title: isCounterpartReply
      ? '这次回应可以作为一条弱画像信号。'
      : '这次约练已经记录到你的 Life Graph。',
    body: isCounterpartReply
      ? '如果你愿意，我会把这次低压力开场的回应记录为脱敏互动信号，用来优化后续推荐。'
      : '我会用这次真实完成和评价，优化之后推荐给你的运动搭子和活动时间。',
    status: 'completed',
    data: {
      taskId: input.taskId,
      schemaName: 'LifeGraphDiffCard',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'life_graph.diff',
      activityId: input.activityId,
      candidateUserId: input.candidateUserId,
      realActivityPersisted: input.realActivityPersisted,
      source: isCounterpartReply ? 'counterpart_reply' : 'meet_loop_review',
      loopStage,
      review: { rating: input.rating, comment: input.comment },
      diff: {
        title: isCounterpartReply
          ? '低压力开场互动信号'
          : '约练偏好更新建议',
        description: isCounterpartReply
          ? '对方已经回复，说明这类低压力、先站内聊的开场方式对你当前目标有效。'
          : input.positive
            ? '这次完成记录会提高类似运动社交机会的推荐权重。'
            : '这次反馈会降低类似安排的推荐权重。',
        currentValue: isCounterpartReply
          ? '不把这次回复写入长期画像'
          : '沿用当前运动社交偏好',
        proposedValue: isCounterpartReply
          ? '提高低压力开场、公共场所和先站内聊候选的解释权重'
          : input.positive
            ? '提高公共场所、轻松强度和相近活动区域的权重'
            : '降低这类候选和活动安排的权重',
        fields: isCounterpartReply
          ? ['低压力开场', '站内聊天边界', '候选回应信号']
          : ['运动社交偏好', '约练节奏', '履约可信度'],
        conflicts: [],
        sensitivityLevel: 'medium',
        confirmationBoundary: '这只是画像更新建议；你可以保留、撤回或选择不用于推荐。',
        privacyBoundary: '不会写入精确位置或私聊内容。',
        revokeHint: '确认后仍可在 Life Graph 中撤回或纠正。',
        sourceSignals: isCounterpartReply
          ? ['对方已回复', '低压力开场有效', '先站内聊边界']
          : ['本次约练完成状态', '你的评价反馈'],
      },
      lifeGraphUpdatePreview: isCounterpartReply
        ? '后续我会更优先解释“先站内聊、低压力开场、公共边界清楚”的机会。'
        : input.positive
          ? '你近期更适合低压力运动社交；公共场所、轻松强度和相近活动区域的权重会提高。'
          : '我会降低这类候选和活动安排的权重，并优先寻找更合适的节奏。',
      trustScoreUpdatePreview: isCounterpartReply
        ? '这只是一条弱互动信号，不会直接改变你的公开资料或私聊内容。'
        : `本次完成记录会让履约可信度 +${input.trustScoreDelta}。`,
      canView: true,
      canCorrect: true,
      canRevoke: true,
    },
    actions: [
      {
        id: 'life_graph_accept_update',
        label: '保留这次更新',
        action: 'confirm_profile_update',
        schemaAction: 'life_graph.accept_update',
        loopStage: 'trust_score_updated',
        requiresConfirmation: false,
        payload: {
          taskId: input.taskId,
          activityId: input.activityId,
          candidateUserId: input.candidateUserId,
          loopStage,
          source: isCounterpartReply ? 'counterpart_reply' : 'meet_loop_review',
          canCorrect: true,
          canRevoke: true,
        },
      },
      {
        id: 'life_graph_reject_update',
        label: '不要用于推荐',
        action: 'confirm_profile_update',
        schemaAction: 'life_graph.reject_update',
        loopStage: 'trust_score_updated',
        requiresConfirmation: false,
        payload: {
          taskId: input.taskId,
          activityId: input.activityId,
          candidateUserId: input.candidateUserId,
          loopStage,
          source: isCounterpartReply ? 'counterpart_reply' : 'meet_loop_review',
          canCorrect: true,
          canRevoke: true,
        },
      },
    ],
  };
}

export function buildSocialAgentProofUploadPromptCard(input: {
  taskId: number;
  activityId: number | null;
  proofStatus?: string;
}): FitMeetAlphaCard {
  return {
    id: `activity_proof_prompt:${input.taskId}:${input.activityId ?? 'draft'}`,
    type: 'activity_status',
    schemaVersion: 'fitmeet.tool-ui.v1',
    schemaType: 'social_match.activity',
    title: '需要补充活动完成证明',
    body: '请在活动详情里上传场景照、签到或其他完成证明。证明只用于活动履约确认，不要求露脸。',
    status: 'ready',
    data: {
      taskId: input.taskId,
      schemaName: 'OpportunityCard',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.activity',
      opportunityCard: true,
      activityId: input.activityId,
      status: 'proof_required',
      proofStatus: input.proofStatus ?? '待上传证明',
      proofPolicy: 'mutual_or_proof',
      safetyBoundary: '证明仅用于活动履约确认，不公开精确位置，不强制露脸。',
      opportunity: {
        id: `opportunity:${input.taskId}:activity-proof:${input.activityId ?? 'draft'}`,
        type: 'activity',
        title: '补充活动证明',
        subtitle: input.proofStatus ?? '待上传证明',
        summary: '证明只用于活动履约确认，不要求露脸。',
        safetyBadges: ['不公开精确位置', '不强制露脸', '仅用于履约确认'],
        safetyBoundary: '证明仅用于活动履约确认，不公开精确位置，不强制露脸。',
        meetLoopNextStep: '证明确认后继续推进评价和画像更新。',
        confirmedContext: ['活动履约确认', '隐私保护', '可补充证明'],
      },
    },
    actions: [
      {
        id: 'activity_view_detail',
        label: '打开活动详情',
        action: 'view_activity',
        schemaAction: 'activity.view_detail',
        loopStage: 'activity_completed',
        requiresConfirmation: false,
        payload: {
          taskId: input.taskId,
          activityId: input.activityId,
        },
      },
    ],
  };
}

export function buildSocialAgentProofSubmittedCard(input: {
  taskId: number;
  activityId: number | null;
  proofId: number | null;
  proofType: string;
}): FitMeetAlphaCard {
  return {
    id: `activity_proof_submitted:${input.taskId}:${input.proofId ?? 'draft'}`,
    type: 'activity_status',
    schemaVersion: 'fitmeet.tool-ui.v1',
    schemaType: 'social_match.activity',
    title: '活动证明已提交',
    body: '证明已进入待确认状态。对方确认后，我会继续更新活动履约状态和 Life Graph 信号。',
    status: 'ready',
    data: {
      taskId: input.taskId,
      schemaName: 'OpportunityCard',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.activity',
      opportunityCard: true,
      activityId: input.activityId,
      proofId: input.proofId,
      status: 'proof_submitted',
      proofStatus: '证明待对方确认',
      proofType: input.proofType,
      opportunity: {
        id: `opportunity:${input.taskId}:activity-proof:${input.proofId ?? 'draft'}`,
        type: 'activity',
        title: '活动证明已提交',
        subtitle: '等待确认',
        summary: '证明已进入待确认状态，确认后继续更新履约状态。',
        safetyBadges: ['待确认', '隐私保护', '履约状态更新'],
        safetyBoundary: '证明只用于履约确认，不公开精确位置。',
        meetLoopNextStep: '对方确认后继续评价与画像更新。',
        confirmedContext: ['证明待确认', '活动履约', '后续回写画像'],
      },
    },
    actions: [
      {
        id: 'activity_view_detail',
        label: '查看证明状态',
        action: 'view_activity',
        schemaAction: 'activity.view_detail',
        loopStage: 'activity_completed',
        requiresConfirmation: false,
        payload: {
          taskId: input.taskId,
          activityId: input.activityId,
        },
      },
    ],
  };
}

export function buildSocialAgentActivityDetailCard(input: {
  taskId: number;
  activityId: number | null;
  activity?: Record<string, unknown> | null;
  proofs?: Record<string, unknown>[];
  unavailableReason?: string;
}): FitMeetAlphaCard {
  const activity = input.activity ?? {};
  const proofs = input.proofs ?? [];
  const status = cleanDisplayText(activity.status, '') || 'detail_unavailable';
  const proofStatus = socialAgentProofStatusText(proofs);
  return {
    id: `activity_detail:${input.taskId}:${input.activityId ?? 'draft'}`,
    type: 'activity_status',
    schemaVersion: 'fitmeet.tool-ui.v1',
    schemaType: 'social_match.activity',
    title:
      cleanDisplayText(activity.title, '') ||
      (input.unavailableReason ? '活动详情暂不可用' : '活动详情'),
    body:
      cleanDisplayText(activity.description, '') ||
      input.unavailableReason ||
      '这里会显示活动时间、地点、证明和履约进度。',
    status: status === 'detail_unavailable' ? 'blocked' : 'ready',
    data: {
      taskId: input.taskId,
      schemaName: 'OpportunityCard',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.activity',
      opportunityCard: true,
      activityId: input.activityId,
      status,
      city: cleanDisplayText(activity.city, ''),
      locationName: cleanDisplayText(activity.locationName, ''),
      startTime: cleanDisplayText(activity.startTime, ''),
      endTime: cleanDisplayText(activity.endTime, ''),
      proofRequired: Boolean(activity.proofRequired),
      proofPolicy: cleanDisplayText(activity.proofPolicy, ''),
      proofStatus,
      proofCount: proofs.length,
      proofs: proofs.slice(0, 5),
      safetyBoundary:
        '活动详情只展示当前任务关联活动；精确位置由客户端隐私开关控制。',
      opportunity: {
        id: `opportunity:${input.taskId}:activity-detail:${input.activityId ?? 'draft'}`,
        type: 'activity',
        title:
          cleanDisplayText(activity.title, '') ||
          (input.unavailableReason ? '活动详情暂不可用' : '活动详情'),
        subtitle: proofStatus,
        summary:
          cleanDisplayText(activity.description, '') ||
          input.unavailableReason ||
          '这里会显示活动时间、地点、证明和履约进度。',
        city: cleanDisplayText(activity.city, ''),
        location: cleanDisplayText(activity.locationName, ''),
        time: cleanDisplayText(activity.startTime, ''),
        safetyBadges: [
          Boolean(activity.proofRequired) ? '需要履约证明' : '无需额外证明',
          proofStatus,
        ],
        safetyBoundary:
          '活动详情只展示当前任务关联活动；精确位置由客户端隐私开关控制。',
        meetLoopNextStep: '根据证明状态继续推进评价和画像更新。',
        confirmedContext: ['活动详情', '履约证明', '隐私边界'],
      },
    },
    actions: input.activityId
      ? [
          {
            id: 'activity_upload_proof',
            label: proofStatus === '还没有上传证明' ? '上传证明' : '补充证明',
            action: 'upload_proof',
            schemaAction: 'activity.upload_proof',
            loopStage: 'activity_completed',
            requiresConfirmation: false,
            payload: {
              taskId: input.taskId,
              activityId: input.activityId,
            },
          },
        ]
      : [],
  };
}

function socialAgentProofStatusText(proofs: Record<string, unknown>[]): string {
  if (proofs.length === 0) return '还没有上传证明';
  const accepted = proofs.filter((proof) => proof.status === 'accepted').length;
  if (accepted > 0) return `${accepted} 条证明已确认`;
  const pending = proofs.filter((proof) => proof.status === 'pending').length;
  if (pending > 0) return `${pending} 条证明待确认`;
  return `${proofs.length} 条证明需重新确认`;
}

function socialAgentMeetLoopTimelineSteps(
  stage: string,
  nextAction?: string | null,
) {
  const order = [
    {
      key: 'draft',
      label: '发起',
      description: '整理对象、时间、地点和安全边界。',
    },
    {
      key: 'sent',
      label: '等待回复',
      description: '确认后发送，不重复打扰。',
    },
    {
      key: 'reschedule',
      label: '改期',
      description: '双方时间不合适时，先征得你同意再调整。',
    },
    {
      key: 'confirmed',
      label: '确认',
      description: '确认地点、时间和公共场所边界。',
    },
    {
      key: 'met',
      label: '见面',
      description: '按确认后的公共场所和时间见面，必要时保留签到或证明。',
    },
    {
      key: 'completed',
      label: '评价',
      description: '见面后记录体验反馈。',
    },
    {
      key: 'life_graph',
      label: '回写画像',
      description: '只把你确认的信息写回 Life Graph。',
    },
  ];
  const activeIndex = socialAgentMeetLoopStageIndex(stage);
  return order.map((step, index) => {
    const state =
      index < activeIndex ? 'done' : index === activeIndex ? 'current' : 'next';
    return {
      ...step,
      state,
      actionLabel:
        state === 'done'
          ? '已保存'
          : state === 'current'
            ? cleanDisplayText(nextAction, '') ||
              socialAgentMeetLoopActionLabel(step.key)
            : '等待前序步骤',
      checkpointReady: state === 'current',
      resumeMode: socialAgentMeetLoopResumeMode(step.key),
    };
  });
}

function socialAgentMeetLoopStageIndex(stage: string) {
  const text = stage.toLowerCase();
  if (/life|trust/.test(text)) return 6;
  if (/review|complete|completed/.test(text)) return 5;
  if (/met|meet|offline|checkin|check_in|checked_in|arrived|到达|签到|见面/.test(text))
    return 4;
  if (/confirm/.test(text)) return 3;
  if (/reschedule|modify/.test(text)) return 2;
  if (/sent|reply|waiting|message/.test(text)) return 1;
  return 0;
}

function socialAgentMeetLoopActionLabel(key: string) {
  if (key === 'draft') return '确认后发起';
  if (key === 'sent') return '等待回复';
  if (key === 'reschedule') return '可改期';
  if (key === 'confirmed') return '确认细节';
  if (key === 'met') return '安全见面';
  if (key === 'completed') return '见面后评价';
  if (key === 'life_graph') return '确认后回写';
  return '可继续';
}

function socialAgentMeetLoopResumeMode(key: string) {
  if (key === 'reschedule') return 'reschedule';
  if (key === 'met') return 'resume';
  if (key === 'completed') return 'review';
  if (key === 'life_graph') return 'memory';
  return 'resume';
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanDisplayText(item, ''))
    .filter(Boolean)
    .slice(0, 6);
}

function number(value: unknown): number | null {
  const next =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : NaN;
  return Number.isFinite(next) && next > 0 ? next : null;
}

function candidateReasoningQuality(candidate: Record<string, unknown>): {
  reasonerSource?: 'deepseek' | 'fallback';
  reasoningConfidence?: number;
  reasoningDegraded?: boolean;
  reasoningRetryable?: boolean;
  matchReasoner?: {
    source?: 'deepseek' | 'fallback';
    confidence?: number;
    degraded?: boolean;
    retryable?: boolean;
    degradationReason?: 'empty_response' | 'model_unavailable';
  };
} {
  const nested = record(candidate.matchReasoner ?? candidate.candidateExplanation);
  const reasonerSource = reasonerSourceValue(
    candidate.reasonerSource ??
      candidate.explanationSource ??
      nested.source ??
      nested.reasonerSource,
  );
  const reasoningConfidence =
    optionalNumber(candidate.reasoningConfidence) ??
    optionalNumber(nested.confidence);
  const reasoningDegraded =
    optionalBoolean(candidate.reasoningDegraded) ??
    optionalBoolean(candidate.degraded) ??
    optionalBoolean(nested.degraded);
  const reasoningRetryable =
    optionalBoolean(candidate.reasoningRetryable) ??
    optionalBoolean(candidate.retryable) ??
    optionalBoolean(nested.retryable);
  const degradationReason = publicDegradationReason(
    candidate.degradationReason ?? nested.degradationReason,
  );
  const hasReasoner =
    reasonerSource ||
    reasoningConfidence !== undefined ||
    reasoningDegraded !== undefined ||
    reasoningRetryable !== undefined ||
    degradationReason;
  return {
    reasonerSource,
    reasoningConfidence,
    reasoningDegraded,
    reasoningRetryable,
    matchReasoner: hasReasoner
      ? {
          source: reasonerSource,
          confidence: reasoningConfidence,
          degraded: reasoningDegraded,
          retryable: reasoningRetryable,
          degradationReason,
        }
      : undefined,
  };
}

function candidateActionSnapshot(candidate: Record<string, unknown>) {
  const reasoningQuality = candidateReasoningQuality(candidate);
  return {
    targetUserId: candidate.targetUserId ?? candidate.candidateUserId ?? candidate.userId,
    candidateUserId: candidate.candidateUserId ?? candidate.userId,
    userId: candidate.userId,
    candidateRecordId: candidate.candidateRecordId ?? null,
    socialRequestId: candidate.socialRequestId ?? null,
    publicIntentId: candidate.publicIntentId ?? null,
    activityId: candidate.activityId ?? null,
    displayName:
      cleanDisplayText(candidate.displayName, '') ||
      cleanDisplayText(candidate.nickname, '') ||
      cleanDisplayText(candidate.name, '') ||
      '候选人',
    avatarUrl: cleanDisplayText(candidate.avatarUrl ?? candidate.imageUrl, '') || null,
    city: cleanDisplayText(candidate.city, '') || null,
    score: candidate.score ?? candidate.matchScore ?? null,
    matchScore: candidate.matchScore ?? candidate.score ?? null,
    commonTags: stringArray(candidate.commonTags).slice(0, 6),
    matchReasons: stringArray(candidate.matchReasons ?? candidate.reasons).slice(0, 6),
    suggestedOpener:
      cleanDisplayText(
        candidate.suggestedOpener ??
          candidate.suggestedMessage ??
          candidate.opener ??
          candidate.message,
        '',
      ) || null,
    recommendationConsent:
      Object.keys(record(candidate.recommendationConsent)).length > 0
        ? record(candidate.recommendationConsent)
        : null,
    reasonerSource: reasoningQuality.reasonerSource,
    reasoningConfidence: reasoningQuality.reasoningConfidence,
    reasoningDegraded: reasoningQuality.reasoningDegraded,
    reasoningRetryable: reasoningQuality.reasoningRetryable,
    matchReasoner: reasoningQuality.matchReasoner,
  };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function reasonerSourceValue(value: unknown): 'deepseek' | 'fallback' | undefined {
  return value === 'deepseek' || value === 'fallback' ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === true) return true;
  if (value === false) return false;
  return undefined;
}

function optionalNumber(value: unknown): number | undefined {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : NaN;
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : undefined;
}

function publicDegradationReason(
  value: unknown,
): 'empty_response' | 'model_unavailable' | undefined {
  if (value === 'empty_response') return 'empty_response';
  return value ? 'model_unavailable' : undefined;
}

export function createSocialAgentActivityDtoFromPayload(input: {
  payload: Record<string, unknown>;
  candidateUserId?: number | null;
  number: (value: unknown) => number | null;
}): CreateActivityDto {
  const { payload, candidateUserId, number } = input;
  const title =
    cleanDisplayText(payload.title, '') ||
    cleanDisplayText(payload.activityTitle, '') ||
    '轻松约练';
  const locationName =
    cleanDisplayText(
      payload.locationName ?? payload.location ?? payload.loc,
      '',
    ) || '公共场所';
  const city = cleanDisplayText(payload.city, '') || '青岛';
  const startTime = readSocialAgentActivityStartTime(payload);
  const durationMinutes =
    number(payload.durationMinutes) ?? number(payload.duration) ?? 45;
  const socialRequestId = number(payload.socialRequestId);
  const meetId = number(payload.meetId);
  const matchedCandidateId = number(
    payload.matchedCandidateId ?? payload.candidateRecordId,
  );
  return {
    type: socialAgentActivityTypeFromPayload(payload),
    title,
    description:
      cleanDisplayText(payload.description, '') ||
      '公共场所、低压力、先站内沟通的 FitMeet 约练。',
    locationName,
    city,
    ...(startTime ? { startTime } : {}),
    durationMinutes,
    ...(socialRequestId ? { socialRequestId } : {}),
    ...(meetId ? { meetId } : {}),
    ...(matchedCandidateId ? { matchedCandidateId } : {}),
    ...(candidateUserId ? { invitedUserId: candidateUserId } : {}),
    proofRequired: true,
    proofPolicy: ActivityProofPolicy.MutualOrProof,
  };
}

export function socialAgentActivityTypeFromPayload(
  payload: Record<string, unknown>,
): ActivityType {
  const raw = cleanDisplayText(
    payload.activityType ?? payload.type ?? payload.requestType,
    '',
  ).toLowerCase();
  if (/running|run|跑步|慢跑/.test(raw)) return ActivityType.Running;
  if (/fitness|gym|健身|训练/.test(raw)) return ActivityType.Fitness;
  if (/dog|遛狗/.test(raw)) return ActivityType.DogWalking;
  if (/coffee|咖啡/.test(raw)) return ActivityType.CoffeeChat;
  if (/walk|散步|city/.test(raw)) return ActivityType.CityWalk;
  return ActivityType.Running;
}

export function readSocialAgentActivityStartTime(
  payload: Record<string, unknown>,
): string | undefined {
  const raw = cleanDisplayText(
    payload.startTime ?? payload.startsAt ?? payload.dateTime,
    '',
  );
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function mergeSocialAgentActivityPayload(input: {
  task: AgentTask;
  payload: Record<string, unknown>;
  isRecord: (value: unknown) => value is Record<string, unknown>;
}): Record<string, unknown> {
  return {
    ...readSocialAgentActivityDraft(input.task, input.isRecord),
    ...readSocialAgentMeetLoopState(input.task, input.isRecord),
    ...input.payload,
  };
}

export function readSocialAgentActivityDraft(
  task: AgentTask,
  isRecord: (value: unknown) => value is Record<string, unknown>,
): Record<string, unknown> {
  const result = isRecord(task.result) ? task.result : {};
  return isRecord(result.activityDraft) ? result.activityDraft : {};
}

export function readSocialAgentMeetLoopState(
  task: AgentTask,
  isRecord: (value: unknown) => value is Record<string, unknown>,
): Record<string, unknown> {
  const result = isRecord(task.result) ? task.result : {};
  return isRecord(result.meetLoop) ? result.meetLoop : {};
}

export function readSocialAgentCardActionCandidate(input: {
  payload: Record<string, unknown>;
  task: AgentTask;
  isRecord: (value: unknown) => value is Record<string, unknown>;
}): Record<string, unknown> {
  const nested = input.isRecord(input.payload.candidate)
    ? input.payload.candidate
    : null;
  if (nested) return nested;
  return readSocialAgentStoredCandidateSummaries(input.task)[0] ?? {};
}

export function messageForSocialAgentSchemaAction(
  action: FitMeetAgentSchemaAction,
): string {
  switch (action) {
    case 'opener.regenerate':
      return '重新生成开场白';
    case 'opener.reject':
      return '取消发送开场白';
    case 'activity.modify_time':
      return '修改约练时间';
    case 'activity.modify_location':
      return '修改约练地点';
    case 'activity.check_in':
      return '我已到达，签到';
    case 'activity.complete':
      return '活动已完成';
    case 'activity.upload_proof':
      return '上传活动证明';
    case 'activity.view_detail':
      return '查看活动详情';
    case 'candidate.view_detail':
      return '详细解释这个候选人的匹配理由、安全边界和推荐下一步';
    case 'review.submit':
      return '提交活动评价';
    case 'life_graph.accept_update':
      return '确认更新 Life Graph';
    case 'life_graph.reject_update':
      return '不要更新 Life Graph';
    case 'meet_loop.resume':
      return '继续推进邀约';
    case 'meet_loop.reschedule':
      return '调整约练时间';
    default:
      return action;
  }
}
