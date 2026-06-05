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
    const lifeGraphUpdatePreview =
      this.personalization.lifeGraphUpdatePreview(activityType);
    const trustScoreUpdatePreview =
      '如果活动完成并完成评价，我会把履约结果写入 trust score。';
    const description =
      this.tone.cleanUserText(draft.description, '') ||
      this.tone.cleanUserText(draft.rawText, '') ||
      `我会先把这次${activityType}整理成一个可确认计划。`;
    return {
      id: `activity_plan:${input.taskId}`,
      type: 'activity_plan',
      title: '约练计划待确认',
      body: `${description} 时间：${time}。地点：${locationName}。活动：${activityType}。参与人：${participantText}。我不会共享你的精确位置。${safetyBoundary} ${checkinReminder} ${reviewPrompt}`,
      status: 'waiting_confirmation',
      data: {
        taskId: input.taskId,
        socialRequestId: draft.socialRequestId ?? null,
        city,
        locationName,
        activityType,
        time,
        participants: participantText,
        publicPlaceOnly: true,
        noPreciseLocation: true,
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
          action: 'create_activity',
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
              meetLoopStage: 'activity_confirmation',
            },
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
    const reasons = this.uniqueStrings([
      ...matchPoints,
      ...this.stringList(
        explanation.fitReasons ?? candidate.matchReasons ?? candidate.reasons,
      ),
    ]);
    const activityType =
      cleanDisplayText(input.draft?.activityType, '') ||
      this.inferActivity(candidate);
    const opener =
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
    const whyNow =
      cleanDisplayText(candidate.whyNow, '') ||
      this.personalization.whyNow({
        timePreference: input.draft?.timePreference,
        locationText: input.draft?.city ?? input.draft?.locationText,
        candidateCity: candidate.city,
        distanceKm: candidate.distanceKm,
      });
    const cardIdentity = cleanDisplayText(targetUserId, displayName);
    return {
      id: `candidate_card:${input.taskId}:${cardIdentity}`,
      type: 'candidate_card',
      title: displayName,
      body: `${recommendationLine} ${whyNow}`,
      status: 'waiting_confirmation',
      data: {
        taskId: input.taskId,
        loopStage: 'candidate_recommendation',
        targetUserId,
        candidateRecordId: candidate.candidateRecordId ?? null,
        publicIntentId: candidate.publicIntentId ?? null,
        socialRequestId: candidate.socialRequestId ?? null,
        matchScore: Math.round(score),
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
          '生成开场白',
          '看看更多',
          '只看同校',
          '只看女生',
          '创建约练',
          '不喜欢这个推荐',
        ],
        lifeGraphSummary: this.personalization.lifeGraphSummary(
          input.lifeGraphSignals,
        ),
        lifeGraphUpdatePreview:
          this.personalization.lifeGraphUpdatePreview(activityType),
      },
      actions: this.candidateActions(input.taskId, targetUserId, candidate),
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
      title: this.confirmation.title('send_message'),
      body: this.confirmation.body('send_message', {
        ...input.candidate,
        message: input.message,
      }),
      status: 'waiting_confirmation',
      data: {
        taskId: input.taskId,
        displayName,
        message: input.message,
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
      ],
    };
  }

  safetyCard(id: string, safety: FitMeetAgentSafety): FitMeetAlphaCard {
    return {
      id: `safety_boundary:${id}`,
      type: 'safety_boundary',
      title: safety.blocked ? '我不能继续这个请求' : '本次匹配的安全边界',
      body: safety.blocked
        ? this.safety.refusal(safety)
        : this.safety.boundaryIntro(),
      status: safety.blocked ? 'blocked' : 'ready',
      data: {
        blocked: safety.blocked,
        level: safety.level,
        reasons: safety.reasons,
        boundaryNotes: this.safety.boundaryNotes(safety),
        requiredConfirmations: safety.requiredConfirmations,
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
      title: '有动作需要你确认',
      body: `当前有 ${input.approvalRequiredActions.length} 个动作需要你确认后才会继续。`,
      status: 'waiting_confirmation',
      data: {
        taskId: input.taskId,
        approvalRequiredActions: input.approvalRequiredActions,
      },
      actions: [],
    };
  }

  private candidateActions(
    taskId: number,
    targetUserId: unknown,
    candidate: Record<string, unknown>,
  ): FitMeetAlphaCardAction[] {
    return [
      {
        id: 'generate_opener',
        label: '生成开场白',
        action: 'generate_opener',
        schemaAction: 'candidate.generate_opener',
        loopStage: 'candidate_selected',
        requiresConfirmation: false,
        payload: { taskId, targetUserId, candidate },
      },
      {
        id: 'see_more',
        label: '看看更多',
        action: 'see_more',
        schemaAction: 'candidate.more_like_this',
        loopStage: 'candidate_recommendation',
        requiresConfirmation: false,
        payload: { taskId },
      },
      {
        id: 'filter_school',
        label: '只看同校',
        action: 'filter_school',
        schemaAction: 'candidate.more_like_this',
        loopStage: 'candidate_recommendation',
        requiresConfirmation: false,
        payload: { taskId },
      },
      {
        id: 'filter_gender_female',
        label: '只看女生',
        action: 'filter_gender_female',
        schemaAction: 'candidate.more_like_this',
        loopStage: 'candidate_recommendation',
        requiresConfirmation: false,
        payload: { taskId },
      },
      {
        id: 'create_activity',
        label: '创建约练',
        action: 'create_activity',
        schemaAction: 'activity.confirm_create',
        loopStage: 'activity_draft_created',
        requiresConfirmation: true,
        payload: { taskId, targetUserId, candidate },
      },
      {
        id: 'dislike_candidate',
        label: '不喜欢这个推荐',
        action: 'dislike_candidate',
        schemaAction: 'candidate.skip',
        loopStage: 'candidate_recommendation',
        requiresConfirmation: false,
        payload: { taskId, targetUserId, candidate },
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
}
