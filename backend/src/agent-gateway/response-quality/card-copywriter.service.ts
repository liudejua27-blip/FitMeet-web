import { Injectable } from '@nestjs/common';

import { cleanDisplayText } from '../../common/display-text.util';
import type {
  FitMeetAgentSafety,
  FitMeetAlphaCard,
  FitMeetAlphaCardAction,
} from '../fitmeet-alpha-agent.types';
import { ConfirmationCopyService } from './confirmation-copy.service';
import { PersonalizationService } from './personalization.service';
import { SafetyCopyService } from './safety-copy.service';
import { TonePolicyService } from './tone-policy.service';

@Injectable()
export class CardCopywriterService {
  constructor(
    private readonly tone: TonePolicyService,
    private readonly confirmation: ConfirmationCopyService,
    private readonly safety: SafetyCopyService,
    private readonly personalization: PersonalizationService,
  ) {}

  activityPlan(input: {
    taskId: number;
    draft: Record<string, unknown>;
    traceId?: string | null;
    lifeGraphSignals?: Record<string, unknown> | null;
  }): FitMeetAlphaCard {
    const draft = input.draft;
    const activityType = cleanDisplayText(draft.activityType, '活动');
    const time = cleanDisplayText(
      draft.timePreference ?? draft.preferredTime,
      '待确认时间',
    );
    const city = cleanDisplayText(draft.city, '同城');
    const locationName = cleanDisplayText(
      draft.locationName ?? draft.location,
      `${city}的公共场所`,
    );
    const candidateName =
      cleanDisplayText(
        draft.candidateDisplayName ?? draft.displayName ?? draft.nickname,
        '',
      ) || '确认后的候选人';
    const participants = this.stringList(draft.participants);
    const participantText = participants.length
      ? participants.join('、')
      : `你和${candidateName}`;
    const safetyBoundary = this.safety.activityBoundary();
    const checkinReminder = '活动开始前我会提醒你确认是否到达。';
    const reviewPrompt = '活动结束后我会提醒你评价体验，帮助后续推荐更贴近你。';
    const autoPublished = draft.autoPublished === true;
    const discoverHref = cleanDisplayText(draft.discoverHref, '');
    const publicIntentId = cleanDisplayText(draft.publicIntentId, '');
    const publishPolicy = autoPublished
      ? '已根据你的首次公开授权同步到发现页；邀请、加好友或发送消息仍需你确认。'
      : '默认不公开发布；如果需要公开发起，我会单独征得你确认。';
    const approvalPolicy = '创建约练前必须由你确认时间、地点和参与边界。';
    const meetLoopNextStep = '确认后进入“等待回复/确认到达/评价回写”的约练闭环。';
    const activityProtocol = this.activityProtocol({
      locationName,
      publishPolicy,
      approvalPolicy,
      meetLoopNextStep,
    });
    const lifeGraphUpdatePreview =
      this.personalization.lifeGraphUpdatePreview(activityType);
    const trustScoreUpdatePreview =
      '如果活动完成并完成评价，我会把履约结果写入 trust score。';
    const description =
      this.tone.cleanUserText(draft.description, '') ||
      this.tone.cleanUserText(draft.rawText, '') ||
      `我会先把这次${activityType}整理成一个可确认计划。`;
    const confirmedContext = this.confirmedContext([
      city,
      time,
      activityType,
      locationName,
      safetyBoundary,
    ]);
    const explanationSteps = this.activityExplanationSteps({
      city,
      time,
      activityType,
      locationName,
      safetyBoundary,
      participantText,
      publishPolicy,
      approvalPolicy,
    });
    return {
      id: `activity_plan:${input.taskId}`,
      type: 'activity_plan',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.activity',
      title: '约练计划待确认',
      body: `${description} 时间：${time}。地点：${locationName}。活动：${activityType}。参与人：${participantText}。我不会共享你的精确位置。${safetyBoundary} ${checkinReminder} ${reviewPrompt}`,
      status: 'waiting_confirmation',
      data: {
        taskId: input.taskId,
        schemaName: 'OpportunityCard',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'social_match.activity',
        socialRequestId: draft.socialRequestId ?? null,
        opportunityCard: true,
        opportunity: {
          id: `opportunity:${input.taskId}:activity`,
          type: 'activity',
          title: `${activityType}约练`,
          subtitle: `${city} · ${time}`,
          summary: description,
          city,
          location: locationName,
          time,
          activityType,
          participants: participantText,
          safetyBadges: ['公共场所', '不共享精确位置', '确认后创建'],
          reasons: explanationSteps.slice(0, 4),
          explanationSteps,
          activityProtocol,
          publishPolicy,
          approvalPolicy,
          meetLoopNextStep,
          checkinReminder,
          reviewPrompt,
          lifeGraphUpdatePreview,
          trustScoreUpdatePreview,
          autoPublished,
          publicIntentId: publicIntentId || null,
          discoverHref: discoverHref || null,
          recommendedNextAction: autoPublished
            ? '约练卡已进入发现页，下一步可以查看详情或选择候选人。'
            : '确认后我再创建约练，不会自动公开发布。',
          safetyBoundary,
          confirmedContext,
        },
        opportunityType: 'activity',
        opportunityTitle: `${activityType}约练`,
        opportunitySubtitle: `${city} · ${time}`,
        confirmedContext,
        explanationSteps,
        fitReasons: explanationSteps.slice(0, 6),
        city,
        locationName,
        activityType,
        time,
        participants: participantText,
        publicPlaceOnly: true,
        noPreciseLocation: true,
        publishPolicy,
        autoPublished,
        publicIntentId: publicIntentId || null,
        discoverHref: discoverHref || null,
        approvalPolicy,
        meetLoopNextStep,
        activityProtocol,
        checkinReminder,
        reviewPrompt,
        meetLoopStage: 'activity_confirmation',
        safetyBoundary,
        trustScoreUpdatePreview,
        lifeGraphSummary: this.personalization.lifeGraphSummary(
          input.lifeGraphSignals,
        ),
        lifeGraphUpdatePreview,
      },
      actions: [
        {
          id: 'confirm_create_activity',
          label: '确认创建约练',
          action: 'activity.confirm_create',
          schemaAction: 'activity.confirm_create',
          loopStage: 'activity_draft_created',
          requiresConfirmation: true,
          payload: {
            taskId: input.taskId,
            socialRequestDraft: {
              ...draft,
              locationName,
              publicPlaceOnly: true,
              noPreciseLocation: true,
              publishPolicy,
              approvalPolicy,
              meetLoopNextStep,
              meetLoopStage: 'activity_confirmation',
            },
            actionType: 'create_activity',
            sideEffect: 'create_activity',
            approvalRequired: true,
            checkpointRequired: true,
            resumeMode: 'resume_after_approval',
            idempotencyKey: `activity-create:${input.taskId}`,
            riskLevel: 'medium',
            riskReasons: [
              '这一步会创建真实约练',
              '公开发布或邀请他人前必须由你确认',
              '不会共享精确位置',
            ],
          },
        },
      ],
    };
  }

  candidate(input: {
    taskId: number;
    candidate: Record<string, unknown>;
    draft?: Record<string, unknown> | null;
    lifeGraphSignals?: Record<string, unknown> | null;
  }): FitMeetAlphaCard {
    const candidate = input.candidate;
    const displayName =
      cleanDisplayText(candidate.displayName, '') ||
      cleanDisplayText(candidate.nickname, '') ||
      '这位候选人';
    const score = Number(candidate.matchScore ?? candidate.score ?? 0);
    const explanation = this.record(candidate.candidateExplanation);
    const matchPoints = this.stringList(candidate.matchPoints);
    const boundaryNotes = this.stringList(candidate.boundaryNotes);
    const dynamicSignalReasons = this.stringList(
      candidate.dynamicSignalReasons,
    );
    const preferenceHistorySignals = this.stringList(
      candidate.preferenceHistorySignals,
    );
    const recentPublicActivity = this.stringList(candidate.recentPublicActivity);
    const interestTags = this.candidateInterests(candidate, input.draft).slice(
      0,
      5,
    );
    const reasons = this.uniqueStrings([
      ...matchPoints,
      ...this.stringList(
        explanation.fitReasons ?? candidate.matchReasons ?? candidate.reasons,
      ),
    ]);
    const activityType =
      cleanDisplayText(input.draft?.activityType, '') ||
      this.inferActivity(candidate);
    const explicitOpener =
      cleanDisplayText(explanation.suggestedOpener, '') ||
      cleanDisplayText(candidate.suggestedOpener, '') ||
      cleanDisplayText(candidate.suggestedMessage, '');
    const targetUserId =
      candidate.targetUserId ?? candidate.candidateUserId ?? candidate.userId;
    const recommendationLine =
      cleanDisplayText(candidate.whyYouMayLike, '') ||
      cleanDisplayText(candidate.publicReason, '') ||
      this.personalization.candidateRecommendationLine({
        displayName,
        activityType: activityType || '见面',
        reasons,
      });
    const safetyBoundary =
      boundaryNotes[0] ||
      this.stringList(
        candidate.riskWarnings ?? this.record(candidate.risk).warnings,
      )[0] ||
      '第一次建议选择公共场所，先站内沟通，不共享精确位置。';
    const explicitRecommendationConsent = this.record(candidate.recommendationConsent);
    const recommendationConsent =
      Object.keys(explicitRecommendationConsent).length > 0
        ? explicitRecommendationConsent
        : this.defaultCandidateRecommendationConsent(candidate);
    const coldStartSignals = this.stringList(candidate.coldStartSignals);
    const discoverySafetySignals = this.discoverySafetySignals(
      candidate,
      recommendationConsent,
      safetyBoundary,
    );
    const recommendationProtocol = this.recommendationProtocol({
      candidate,
      recommendationConsent,
      discoverySafetySignals,
      safetyBoundary,
    });
    const safetyBadges = this.safetyBadges(candidate, safetyBoundary);
    const whyNow =
      cleanDisplayText(candidate.whyNow, '') ||
      this.personalization.whyNow({
        timePreference: input.draft?.timePreference,
        locationText: input.draft?.city ?? input.draft?.locationText,
        candidateCity: candidate.city,
        distanceKm: candidate.distanceKm,
      });
    const area =
      cleanDisplayText(candidate.area, '') ||
      cleanDisplayText(candidate.city, '') ||
      cleanDisplayText(input.draft?.city, '同城');
    const timePreference = cleanDisplayText(
      input.draft?.timePreference ?? candidate.timePreference,
      '时间待确认',
    );
    const intensity = cleanDisplayText(
      input.draft?.intensity ??
        input.draft?.trainingIntensity ??
        candidate.intensity ??
        candidate.trainingIntensity,
      '低压力',
    );
    const relationshipGoal = this.candidateRelationshipGoal(candidate);
    const idealType = this.candidateIdealType(candidate);
    const invitePolicy = this.candidateInvitePolicy(candidate);
    const opener =
      explicitOpener ||
      this.defaultCandidateOpener({
        displayName,
        activityType: activityType || '活动',
        area,
        timePreference,
      });
    const opportunityTitle = `和 ${displayName} 低压力认识`;
    const opportunitySubtitle = `${area} · ${activityType || '轻活动'} · ${timePreference}`;
    const cardIdentity = cleanDisplayText(targetUserId, displayName);
    const explanationSteps = this.candidateExplanationSteps({
      candidate,
      area,
      timePreference,
      activityType,
      intensity,
      reasons,
      preferenceHistorySignals,
      safetyBoundary,
    });
    const rankingBreakdown = this.candidateRankingBreakdown({
      candidate,
      area,
      timePreference,
      activityType,
      intensity,
      interestTags,
      relationshipGoal,
      preferenceHistorySignals,
      safetyBoundary,
    });
    const confirmedContext = this.confirmedContext([
      area,
      timePreference,
      activityType,
      intensity,
      safetyBoundary,
    ]);
    return {
      id: `candidate_card:${input.taskId}:${cardIdentity}`,
      type: 'candidate_card',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.candidate',
      title: opportunityTitle,
      body: `${recommendationLine} ${whyNow}`,
      status: 'waiting_confirmation',
      data: {
        taskId: input.taskId,
        schemaName: 'OpportunityCard',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'social_match.candidate',
        opportunityCard: true,
        opportunity: {
          id: `opportunity:${input.taskId}:${cardIdentity}`,
          type: 'person',
          name: displayName,
          title: opportunityTitle,
          subtitle: opportunitySubtitle,
          avatarUrl:
            cleanDisplayText(candidate.avatarUrl ?? candidate.avatar, '') ||
            null,
          score: Math.round(score),
          matchScore: Math.round(score),
          confidence: this.matchConfidence(score),
          summary: recommendationLine,
          area,
          time: timePreference,
          distanceLabel: this.candidateDistanceLabel(candidate),
          interests: interestTags,
          relationshipGoal,
          idealType,
          invitePolicy,
          reasons: reasons.slice(0, 4),
          explanationSteps,
          rankingBreakdown,
          safetyBadges,
          recommendationConsent:
            Object.keys(recommendationConsent).length > 0
              ? recommendationConsent
              : null,
          coldStartSignals,
          discoverySafetySignals,
          recommendationProtocol,
          preferenceHistorySignals,
          recentPublicActivity,
          frictionLevel: this.frictionLevel(score, candidate),
          whyNow,
          openerStrategy: cleanDisplayText(candidate.openerStrategy, ''),
          suggestedOpener: opener || null,
          recommendedNextAction: '先生成开场白，确认后再发送。',
          safetyBoundary,
          confirmedContext,
        },
        opportunityType: 'person',
        opportunityTitle,
        opportunitySubtitle,
        confirmedContext,
        confidence: this.matchConfidence(score),
        frictionLevel: this.frictionLevel(score, candidate),
        recommendedNextAction: '先生成开场白，确认后再发送。',
        relationshipGoal,
        idealType,
        invitePolicy,
        safetyBadges,
        recommendationConsent:
          Object.keys(recommendationConsent).length > 0
            ? recommendationConsent
            : null,
        coldStartSignals,
        discoverySafetySignals,
        recommendationProtocol,
        preferenceHistorySignals,
        recentPublicActivity,
        sharedInterests: interestTags,
        explanationSteps,
        rankingBreakdown,
        distanceLabel: this.candidateDistanceLabel(candidate),
        loopStage: 'candidate_recommendation',
        targetUserId,
        candidateRecordId: candidate.candidateRecordId ?? null,
        publicIntentId: candidate.publicIntentId ?? null,
        socialRequestId: candidate.socialRequestId ?? null,
        matchScore: Math.round(score),
        displayName,
        area,
        activityType,
        sport: activityType,
        intensity,
        timePreference,
        recommendationLine,
        fitReasons: reasons.slice(0, 6),
        whyNow,
        safetyBoundary,
        suggestedOpener: opener,
        whyYouMayLike: recommendationLine,
        matchPoints: matchPoints.slice(0, 6),
        boundaryNotes: boundaryNotes.slice(0, 4),
        openerStrategy: cleanDisplayText(candidate.openerStrategy, ''),
        dynamicSignalReasons,
        continuousFilterHints: this.stringList(candidate.continuousFilterHints),
        nextActions: [
          '查看详情',
          '生成开场白',
          '先收藏',
          '确认后发邀请',
          '更多类似的人',
          '不感兴趣',
        ],
        lifeGraphSummary: this.personalization.lifeGraphSummary(
          input.lifeGraphSignals,
        ),
        lifeGraphUpdatePreview:
          this.personalization.lifeGraphUpdatePreview(activityType),
      },
      actions: this.candidateActions(input.taskId, targetUserId, candidate, {
        safetyBoundary,
        suggestedOpener: opener,
        displayName,
        opportunityId: `opportunity:${input.taskId}:${cardIdentity}`,
      }),
    };
  }

  openerApproval(input: {
    taskId: number;
    candidate: Record<string, unknown>;
    message: string;
  }): FitMeetAlphaCard {
    const displayName =
      cleanDisplayText(input.candidate.displayName, '') ||
      cleanDisplayText(input.candidate.nickname, '') ||
      '对方';
    const candidateIdentity = cleanDisplayText(
      input.candidate.targetUserId ?? input.candidate.userId,
      'draft',
    );
    return {
      id: `opener_approval:${input.taskId}:${candidateIdentity}`,
      type: 'opener_approval',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'safety.approval',
      title: this.confirmation.title('send_message'),
      body: this.confirmation.body('send_message', {
        ...input.candidate,
        message: input.message,
      }),
      status: 'waiting_confirmation',
      data: {
        taskId: input.taskId,
        schemaName: 'SafetyApprovalCard',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'safety.approval',
        approval: {
          title: this.confirmation.title('send_message'),
          boundary: '确认前不会发送。建议先站内沟通，不急着交换联系方式。',
          riskLevel: 'medium',
          reasons: ['这一步会向真实用户发送消息', '发送前需要你确认语气和内容'],
          auditNote: '确认或拒绝都会写入审批日志，便于之后追溯。',
          confirmationLabel: '确认后发送',
          checkpointLabel: '开场白已保存，可重新生成或取消',
        },
        displayName,
        message: input.message,
        riskLevel: 'medium',
        reasons: ['这一步会向真实用户发送消息', '发送前需要你确认语气和内容'],
        auditNote: '确认或拒绝都会写入审批日志，便于之后追溯。',
        confirmationLabel: '确认后发送',
        checkpointLabel: '开场白已保存，可重新生成或取消',
        safetyBoundary: '确认前不会发送。建议先站内沟通，不急着交换联系方式。',
        nextStep: '你确认后，我才会把这条消息发送出去。',
        secondaryActions: ['语气更自然', '更简短', '重新生成', '取消'],
        meetLoopStage: 'opener_confirmation',
      },
      actions: [
        {
          id: 'send_message',
          label: '确认发送',
          action: 'send_message',
          schemaAction: 'opener.confirm_send',
          loopStage: 'opener_draft_created',
          requiresConfirmation: true,
          payload: {
            taskId: input.taskId,
            candidate: input.candidate,
            message: input.message,
          },
        },
        {
          id: 'reject_opener',
          label: '取消发送',
          action: 'reject_opener',
          schemaAction: 'opener.reject',
          loopStage: 'opener_draft_created',
          requiresConfirmation: false,
          payload: {
            taskId: input.taskId,
            candidate: input.candidate,
            message: input.message,
          },
        },
      ],
    };
  }

  safetyCard(id: string, safety: FitMeetAgentSafety): FitMeetAlphaCard {
    return {
      id: `safety_boundary:${id}`,
      type: 'safety_boundary',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'safety.approval',
      title: safety.blocked ? '我不能继续这个请求' : '本次匹配的安全边界',
      body: safety.blocked
        ? this.safety.refusal(safety)
        : this.safety.boundaryIntro(),
      status: safety.blocked ? 'blocked' : 'ready',
      data: {
        schemaName: 'SafetyApprovalCard',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'safety.approval',
        blocked: safety.blocked,
        level: safety.level,
        reasons: safety.reasons,
        boundaryNotes: this.safety.boundaryNotes(safety),
        requiredConfirmations: safety.requiredConfirmations,
        approval: {
          title: safety.blocked ? '我不能继续这个请求' : '本次匹配的安全边界',
          boundary: safety.blocked
            ? this.safety.refusal(safety)
            : this.safety.boundaryIntro(),
          riskLevel: safety.level,
          reasons: safety.reasons,
          auditNote: safety.blocked
            ? '已阻断，不会执行任何搜索、联系或发布动作。'
            : '后续真实动作仍会要求你确认，并写入审计日志。',
          confirmationLabel: safety.blocked ? '已阻断' : '后续动作需确认',
          checkpointLabel: safety.blocked ? '未创建执行步骤' : '安全边界已保存',
        },
      },
      actions: [],
    };
  }

  auditUpdate(input: {
    taskId: number;
    approvalRequiredActions: Array<Record<string, unknown>>;
  }): FitMeetAlphaCard {
    return {
      id: `audit_update:${input.taskId}:approval`,
      type: 'audit_update',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'safety.approval',
      title: '有动作需要你确认',
      body: `当前有 ${input.approvalRequiredActions.length} 个动作需要你确认后才会继续。`,
      status: 'waiting_confirmation',
      data: {
        taskId: input.taskId,
        schemaName: 'SafetyApprovalCard',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'safety.approval',
        approvalRequiredActions: input.approvalRequiredActions,
        approval: {
          title: '有动作需要你确认',
          boundary: `当前有 ${input.approvalRequiredActions.length} 个动作需要你确认后才会继续。`,
          riskLevel: this.maxApprovalRiskLevel(input.approvalRequiredActions),
          reasons: this.approvalReasons(input.approvalRequiredActions),
          auditNote: '确认、拒绝和执行结果都会进入审批审计日志。',
          confirmationLabel: '确认后才执行',
          checkpointLabel: '审批中断点已保存',
        },
        riskLevel: this.maxApprovalRiskLevel(input.approvalRequiredActions),
        reasons: this.approvalReasons(input.approvalRequiredActions),
        auditNote: '确认、拒绝和执行结果都会进入审批审计日志。',
        confirmationLabel: '确认后才执行',
        checkpointLabel: '审批中断点已保存',
      },
      actions: [],
    };
  }

  private maxApprovalRiskLevel(
    actions: Array<Record<string, unknown>>,
  ): string {
    const levels = actions.map((action) =>
      cleanDisplayText(action.riskLevel, '').toLowerCase(),
    );
    if (levels.includes('blocked')) return 'blocked';
    if (levels.includes('high')) return 'high';
    if (levels.includes('medium')) return 'medium';
    return levels.includes('low') ? 'low' : 'medium';
  }

  private approvalReasons(actions: Array<Record<string, unknown>>): string[] {
    const labels = actions
      .map((action) =>
        cleanDisplayText(
          action.summary ?? action.label ?? action.actionType ?? action.type,
          '',
        ),
      )
      .filter(Boolean);
    return this.uniqueStrings([
      ...labels,
      '涉及真实社交动作，执行前需要用户确认',
    ]).slice(0, 4);
  }

  private candidateActions(
    taskId: number,
    targetUserId: unknown,
    candidate: Record<string, unknown>,
    context: {
      safetyBoundary: string;
      suggestedOpener: string;
      displayName: string;
      opportunityId: string;
    },
  ): FitMeetAlphaCardAction[] {
    const basePayload = {
      taskId,
      targetUserId,
      candidate,
      opportunityId: context.opportunityId,
      displayName: context.displayName,
      safetyBoundary: context.safetyBoundary,
    };
    return [
      {
        id: 'view_detail',
        label: '查看详情',
        action: 'see_more',
        schemaAction: 'candidate.view_detail',
        loopStage: 'candidate_recommendation',
        requiresConfirmation: false,
        payload: {
          ...basePayload,
          sideEffect: 'none',
        },
      },
      {
        id: 'generate_invite_opener',
        label: '生成开场白',
        action: 'candidate.generate_opener',
        schemaAction: 'candidate.generate_opener',
        loopStage: 'candidate_selected',
        requiresConfirmation: false,
        payload: {
          ...basePayload,
          sideEffect: 'draft_only',
          suggestedOpener: context.suggestedOpener,
        },
      },
      {
        id: 'save_candidate',
        label: '先收藏',
        action: 'save_candidate',
        schemaAction: 'candidate.like',
        loopStage: 'candidate_recommendation',
        requiresConfirmation: false,
        payload: {
          ...basePayload,
          sideEffect: 'save_preference',
        },
      },
      {
        id: 'invite_candidate',
        label: '确认后发邀请',
        action: 'candidate.connect',
        schemaAction: 'candidate.connect',
        loopStage: 'candidate_selected',
        requiresConfirmation: true,
        payload: {
          ...basePayload,
          actionType: 'send_invite',
          sideEffect: 'send_message_or_connect',
          approvalRequired: true,
          checkpointRequired: true,
          resumeMode: 'resume_after_approval',
          idempotencyKey: `candidate-connect:${taskId}:${String(
            targetUserId ?? context.opportunityId,
          )}`,
          suggestedOpener: context.suggestedOpener,
          riskLevel: 'medium',
          riskReasons: [
            '这一步会联系真实用户',
            '发送邀请前必须由你确认',
            '不会自动交换联系方式或精确位置',
          ],
          auditEvent: 'social_agent.candidate.connect.approval_required',
        },
      },
      {
        id: 'see_more_similar',
        label: '更多类似的人',
        action: 'see_more',
        schemaAction: 'candidate.more_like_this',
        loopStage: 'candidate_recommendation',
        requiresConfirmation: false,
        payload: { taskId },
      },
      {
        id: 'dislike_candidate',
        label: '不感兴趣',
        action: 'dislike_candidate',
        schemaAction: 'candidate.skip',
        loopStage: 'candidate_recommendation',
        requiresConfirmation: false,
        payload: {
          ...basePayload,
          sideEffect: 'negative_preference',
        },
      },
    ];
  }

  private inferActivity(candidate: Record<string, unknown>): string {
    const tags = this.stringList(
      candidate.commonTags ?? candidate.interestTags,
    );
    return tags[0] || '轻松见面';
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private stringList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map((item) => cleanDisplayText(item, '')).filter(Boolean);
  }

  private uniqueStrings(values: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const value of values) {
      const text = cleanDisplayText(value, '').trim();
      if (!text) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(text);
    }
    return out;
  }

  private matchConfidence(score: number): 'low' | 'medium' | 'high' {
    if (score >= 82) return 'high';
    if (score >= 60) return 'medium';
    return 'low';
  }

  private frictionLevel(
    score: number,
    candidate: Record<string, unknown>,
  ): 'low' | 'medium' | 'high' {
    const warnings = this.stringList(
      candidate.riskWarnings ?? this.record(candidate.risk).warnings,
    );
    if (warnings.length > 1 || score < 45) return 'high';
    if (warnings.length > 0 || score < 70) return 'medium';
    return 'low';
  }

  private safetyBadges(
    candidate: Record<string, unknown>,
    safetyBoundary: string,
  ): string[] {
    return this.uniqueStrings([
      cleanDisplayText(this.record(candidate.recommendationConsent).sourceLabel, ''),
      cleanDisplayText(this.record(candidate.recommendationConsent).privacyLabel, ''),
      cleanDisplayText(this.record(candidate.recommendationConsent).strangerPolicyLabel, ''),
      candidate.isRealData === true ? '真实资料优先' : '',
      cleanDisplayText(candidate.dataQuality, '') ? '资料已校验' : '',
      '位置已模糊',
      safetyBoundary ? '建议公共场所' : '',
      '发送前需确认',
    ]).slice(0, 4);
  }

  private defaultCandidateOpener(input: {
    displayName: string;
    activityType: string;
    area: string;
    timePreference: string;
  }): string {
    const activity = cleanDisplayText(input.activityType, '活动');
    const area = cleanDisplayText(input.area, '同城');
    const time = cleanDisplayText(input.timePreference, '方便的时候');
    return `你好，我看到你也对${activity}感兴趣。如果${time}方便，我们可以先在${area}的公共场所轻松了解一下。`;
  }

  private defaultCandidateRecommendationConsent(
    candidate: Record<string, unknown>,
  ): Record<string, unknown> {
    const source = cleanDisplayText(candidate.source, '');
    return {
      profileDiscoverable: true,
      agentCanRecommendMe: true,
      sourceLabel:
        source === 'public_intent' || source === 'legacy_request'
          ? '来自公开社交意图，且已通过推荐权限筛选'
          : '公开可发现且已允许 Agent 推荐',
      privacyLabel: '资料已脱敏，不展示手机号、精确位置或私聊内容',
      strangerPolicyLabel: '仅展示公开可发现且已授权推荐的资料',
    };
  }

  private discoverySafetySignals(
    candidate: Record<string, unknown>,
    recommendationConsent: Record<string, unknown>,
    safetyBoundary: string,
  ): string[] {
    const explicitSignals = this.stringList(candidate.discoverySafetySignals);
    if (explicitSignals.length > 0) return explicitSignals.slice(0, 5);

    const blockedSignals = this.stringList(
      candidate.blockedSignals ?? candidate.complaintSignals ?? candidate.riskWarnings,
    );
    return this.uniqueStrings([
      recommendationConsent.profileDiscoverable === true ||
      candidate.discoverable === true ||
      candidate.profileDiscoverable === true
        ? '公开可发现'
        : '仅展示已允许推荐的公开信息',
      recommendationConsent.agentCanRecommendMe === true ||
      candidate.agentMatchingEnabled === true ||
      candidate.agentCanRecommendMe === true
        ? '已开启 Agent 匹配'
        : '匹配权限需继续确认',
      recommendationConsent.privacyLabel
        ? cleanDisplayText(recommendationConsent.privacyLabel, '')
        : '资料已脱敏',
      blockedSignals.length === 0 ? '无拉黑/投诉风险信号' : '存在风险信号，需降低触达强度',
      safetyBoundary ? '邀请前保留确认边界' : '',
    ]).slice(0, 5);
  }

  private recommendationProtocol(input: {
    candidate: Record<string, unknown>;
    recommendationConsent: Record<string, unknown>;
    discoverySafetySignals: string[];
    safetyBoundary: string;
  }): Array<{ key: string; label: string; detail: string }> {
    const sourceLabel =
      cleanDisplayText(input.recommendationConsent.sourceLabel, '') ||
      (input.candidate.source === 'profile_candidate'
        ? '公开可发现且已允许 Agent 推荐'
        : '来自公开社交意图');
    const privacyLabel =
      cleanDisplayText(input.recommendationConsent.privacyLabel, '') ||
      '资料已脱敏，不展示手机号、精确位置或私聊内容';
    const strangerPolicyLabel =
      cleanDisplayText(input.recommendationConsent.strangerPolicyLabel, '') ||
      '仅展示公开可发现且已授权推荐的资料';
    const safetySignal =
      input.discoverySafetySignals.find((signal) =>
        /无拉黑|无投诉|风险信号|投诉|拉黑/.test(signal),
      ) ?? '无拉黑/投诉风险信号';
    return [
      {
        key: 'discoverability',
        label: '可发现来源',
        detail: sourceLabel,
      },
      {
        key: 'consent',
        label: '推荐授权',
        detail: strangerPolicyLabel,
      },
      {
        key: 'privacy',
        label: '隐私处理',
        detail: privacyLabel,
      },
      {
        key: 'safety',
        label: '安全过滤',
        detail: safetySignal,
      },
      {
        key: 'approval',
        label: '触达边界',
        detail: input.safetyBoundary
          ? '发送邀请、加好友或创建活动前必须由你确认'
          : '真实触达前仍会再次确认',
      },
    ];
  }

  private candidateRelationshipGoal(
    candidate: Record<string, unknown>,
  ): string | null {
    return (
      cleanDisplayText(
        candidate.relationshipGoal ??
          candidate.relationGoal ??
          candidate.targetRelationship,
        '',
      ) ||
      this.stringList(
        candidate.relationshipGoals ?? candidate.goals ?? candidate.socialGoals,
      )[0] ||
      null
    );
  }

  private candidateIdealType(
    candidate: Record<string, unknown>,
  ): string | null {
    return (
      cleanDisplayText(
        candidate.idealType ??
          candidate.targetPreference ??
          candidate.preferenceLine,
        '',
      ) ||
      this.stringList(
        candidate.wantToMeet ??
          candidate.preferredTraits ??
          candidate.idealTraits ??
          candidate.traits,
      )[0] ||
      null
    );
  }

  private candidateInvitePolicy(candidate: Record<string, unknown>): string {
    return (
      cleanDisplayText(candidate.invitePolicy ?? candidate.contactPolicy, '') ||
      '先生成开场白，发送前需要你确认'
    );
  }

  private candidateInterests(
    candidate: Record<string, unknown>,
    draft?: Record<string, unknown> | null,
  ): string[] {
    return this.uniqueStrings([
      ...this.stringList(candidate.commonTags),
      ...this.stringList(candidate.sharedInterests),
      ...this.stringList(candidate.interestTags),
      ...this.stringList(candidate.tags),
      cleanDisplayText(draft?.activityType, ''),
      cleanDisplayText(candidate.sport, ''),
    ]).slice(0, 5);
  }

  private candidateDistanceLabel(
    candidate: Record<string, unknown>,
  ): string | null {
    const explicit = cleanDisplayText(
      candidate.distanceLabel ?? candidate.distance,
      '',
    );
    if (explicit) return explicit;
    const km = Number(candidate.distanceKm);
    if (Number.isFinite(km) && km >= 0) {
      return km < 1
        ? `${Math.round(km * 1000)}m`
        : `${km.toFixed(km < 10 ? 1 : 0)}km`;
    }
    const meters = Number(candidate.distanceMeters);
    if (Number.isFinite(meters) && meters >= 0) {
      if (meters < 1000) return `${Math.round(meters)}m`;
      const nextKm = meters / 1000;
      return `${nextKm.toFixed(nextKm < 10 ? 1 : 0)}km`;
    }
    return null;
  }

  private candidateExplanationSteps(input: {
    candidate: Record<string, unknown>;
    area: string;
    timePreference: string;
    activityType: string;
    intensity: string;
    reasons: string[];
    preferenceHistorySignals: string[];
    safetyBoundary: string;
  }): string[] {
    const explicit = this.stringList(input.candidate.explanationSteps);
    if (explicit.length > 0) return explicit.slice(0, 3);
    const recall =
      cleanDisplayText(input.candidate.recallSource, '') ||
      [input.area, input.activityType, input.timePreference]
        .filter(Boolean)
        .join(' · ');
    const ranking =
      cleanDisplayText(input.candidate.rankingReason, '') ||
      input.reasons[0] ||
      `${input.intensity}和当前需求更接近`;
    const safety =
      cleanDisplayText(input.candidate.safetyFilter, '') ||
      input.safetyBoundary ||
      '仅展示模糊区域，真实动作前需要确认';
    const memory = input.preferenceHistorySignals[0];
    return [
      recall ? `来源：${recall}` : '',
      ranking ? `匹配：${ranking}` : '',
      memory ? `记忆：${memory}` : '',
      safety ? `安全：${safety}` : '',
    ]
      .filter(Boolean)
      .slice(0, 4);
  }

  private candidateRankingBreakdown(input: {
    candidate: Record<string, unknown>;
    area: string;
    timePreference: string;
    activityType: string;
    intensity: string;
    interestTags: string[];
    relationshipGoal: string | null;
    preferenceHistorySignals: string[];
    safetyBoundary: string;
  }): Array<{ key: string; label: string; score: number | null; reason: string }> {
    const breakdown = this.record(input.candidate.scoreBreakdown);
    const numberValue = (value: unknown): number | null => {
      const parsed =
        typeof value === 'number'
          ? value
          : typeof value === 'string' && `${value}`.trim()
            ? Number(value)
            : NaN;
      return Number.isFinite(parsed) ? Math.round(parsed) : null;
    };
    return [
      {
        key: 'location',
        label: '城市/距离',
        score: numberValue(breakdown.distance ?? breakdown.cityMatch ?? breakdown.locationFit),
        reason: input.area ? `区域在 ${input.area} 附近，适合先低压力了解。` : '区域信息已模糊处理。',
      },
      {
        key: 'interest',
        label: '共同兴趣',
        score: numberValue(breakdown.interestSimilarity ?? breakdown.commonTags),
        reason: input.interestTags.length
          ? `共同兴趣包含 ${input.interestTags.slice(0, 3).join('、')}。`
          : `${input.activityType} 与这次需求相关。`,
      },
      {
        key: 'time',
        label: '时间节奏',
        score: numberValue(breakdown.timeFit ?? breakdown.recentActivity),
        reason: `${input.timePreference} 的安排更容易先轻松试探。`,
      },
      {
        key: 'boundary',
        label: '安全边界',
        score: numberValue(breakdown.safetyRisk ?? breakdown.boundaryFit),
        reason: input.safetyBoundary,
      },
      {
        key: 'social_boundary',
        label: '社交边界',
        score: numberValue(breakdown.socialBoundaryFit ?? breakdown.boundaryFit),
        reason: '对方公开可发现，适合先从低压力互动开始；真正联系前仍会等你确认。',
      },
      {
        key: 'life_graph',
        label: '画像偏好',
        score: numberValue(breakdown.lifeGraphBehaviorFit ?? breakdown.profileFit),
        reason:
          input.preferenceHistorySignals[0] ||
          `${input.relationshipGoal ?? '低压力认识'}，${input.intensity}节奏更贴近你的偏好。`,
      },
    ].filter((item) => item.reason);
  }

  private activityExplanationSteps(input: {
    city: string;
    time: string;
    activityType: string;
    locationName: string;
    safetyBoundary: string;
    participantText: string;
    publishPolicy: string;
    approvalPolicy: string;
  }): string[] {
    return this.uniqueStrings([
      `需求：${input.city} · ${input.time} · ${input.activityType}`,
      `地点：优先选择 ${input.locationName}，不共享精确位置`,
      `边界：${input.safetyBoundary}`,
      `确认：${input.approvalPolicy}`,
      `公开：${input.publishPolicy}`,
      input.participantText ? `参与：${input.participantText}` : '',
    ]).slice(0, 5);
  }

  private activityProtocol(input: {
    locationName: string;
    publishPolicy: string;
    approvalPolicy: string;
    meetLoopNextStep: string;
  }): Array<{ key: string; label: string; detail: string }> {
    return [
      {
        key: 'public_place',
        label: '公共场所',
        detail: `优先选择 ${input.locationName} 这类公共场所，避免第一次见面进入私密空间。`,
      },
      {
        key: 'location_privacy',
        label: '位置保护',
        detail: '卡片只展示城市或模糊地点，不共享你的精确位置。',
      },
      {
        key: 'approval',
        label: '创建确认',
        detail: input.approvalPolicy,
      },
      {
        key: 'publish',
        label: '公开边界',
        detail: input.publishPolicy,
      },
      {
        key: 'recovery',
        label: '可恢复闭环',
        detail: input.meetLoopNextStep,
      },
    ];
  }

  private confirmedContext(values: unknown[]): string[] {
    return this.uniqueStrings(
      values
        .map((value) => cleanDisplayText(value, ''))
        .filter((value) => value && !this.isPlaceholderContext(value))
        .map((value) => this.compactContextValue(value)),
    ).slice(0, 5);
  }

  private compactContextValue(value: string): string {
    if (value.length <= 18) return value;
    return `${value.slice(0, 17)}…`;
  }

  private isPlaceholderContext(value: string): boolean {
    return [
      '同城',
      '活动',
      '待确认时间',
      '时间待确认',
      '低压力',
      '轻活动',
      '确认后的候选人',
    ].includes(value);
  }
}
