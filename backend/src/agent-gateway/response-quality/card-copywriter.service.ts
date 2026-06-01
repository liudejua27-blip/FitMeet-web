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
    const time = cleanDisplayText(draft.timePreference ?? draft.preferredTime, '待确认时间');
    const city = cleanDisplayText(draft.city, '同城');
    const description =
      this.tone.cleanUserText(draft.description, '') ||
      this.tone.cleanUserText(draft.rawText, '') ||
      `我会先把这次${activityType}整理成一个可确认计划。`;
    return {
      id: `activity_plan:${input.taskId}`,
      type: 'activity_plan',
      title: '约练计划待确认',
      body: `${description} 时间：${time}。地点：${city}的公共场所。参与人：你和确认后的候选人。${this.safety.activityBoundary()}`,
      status: 'waiting_confirmation',
      data: {
        taskId: input.taskId,
        socialRequestId: draft.socialRequestId ?? null,
        city,
        activityType,
        time,
        safetyBoundary: this.safety.activityBoundary(),
        lifeGraphSummary: this.personalization.lifeGraphSummary(input.lifeGraphSignals),
        lifeGraphUpdatePreview: this.personalization.lifeGraphUpdatePreview(activityType),
      },
      actions: [
        {
          id: 'confirm_create_activity',
          label: '确认创建约练',
          action: 'create_activity',
          requiresConfirmation: true,
          payload: { taskId: input.taskId, socialRequestDraft: draft },
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
    const reasons = this.stringList(
      explanation.fitReasons ?? candidate.matchReasons ?? candidate.reasons,
    );
    const activityType = cleanDisplayText(input.draft?.activityType, '') || this.inferActivity(candidate);
    const opener =
      cleanDisplayText(explanation.suggestedOpener, '') ||
      cleanDisplayText(candidate.suggestedOpener, '') ||
      cleanDisplayText(candidate.suggestedMessage, '');
    const targetUserId =
      candidate.targetUserId ?? candidate.candidateUserId ?? candidate.userId;
    const recommendationLine = this.personalization.candidateRecommendationLine({
      displayName,
      activityType: activityType || '见面',
      reasons,
    });
    const safetyBoundary =
      this.stringList(candidate.riskWarnings ?? this.record(candidate.risk).warnings)[0] ||
      '第一次建议选择公共场所，先站内沟通，不共享精确位置。';
    const whyNow = this.personalization.whyNow({
      timePreference: input.draft?.timePreference,
      locationText: input.draft?.city ?? input.draft?.locationText,
      candidateCity: candidate.city,
      distanceKm: candidate.distanceKm,
    });
    return {
      id: `candidate_card:${input.taskId}:${targetUserId ?? displayName}`,
      type: 'candidate_card',
      title: displayName,
      body: `${recommendationLine} ${whyNow}`,
      status: 'waiting_confirmation',
      data: {
        taskId: input.taskId,
        targetUserId,
        candidateRecordId: candidate.candidateRecordId ?? null,
        publicIntentId: candidate.publicIntentId ?? null,
        socialRequestId: candidate.socialRequestId ?? null,
        matchScore: Math.round(score),
        recommendationLine,
        fitReasons: reasons.slice(0, 4),
        whyNow,
        safetyBoundary,
        suggestedOpener: opener,
        nextActions: ['生成开场白', '看看更多', '只看同校', '只看女生', '创建约练', '不喜欢这个推荐'],
        lifeGraphSummary: this.personalization.lifeGraphSummary(input.lifeGraphSignals),
        lifeGraphUpdatePreview: this.personalization.lifeGraphUpdatePreview(activityType),
      },
      actions: this.candidateActions(input.taskId, targetUserId, candidate),
    };
  }

  openerApproval(input: {
    taskId: number;
    candidate: Record<string, unknown>;
    message: string;
  }): FitMeetAlphaCard {
    return {
      id: `opener_approval:${input.taskId}:${input.candidate.targetUserId ?? input.candidate.userId ?? 'draft'}`,
      type: 'opener_approval',
      title: this.confirmation.title('send_message'),
      body: this.confirmation.body('send_message', {
        ...input.candidate,
        message: input.message,
      }),
      status: 'waiting_confirmation',
      data: {
        taskId: input.taskId,
        message: input.message,
        safetyBoundary: '确认前不会发送。建议先站内沟通，不急着交换联系方式。',
      },
      actions: [
        {
          id: 'send_message',
          label: '确认发送',
          action: 'send_message',
          requiresConfirmation: true,
          payload: { taskId: input.taskId, candidate: input.candidate, message: input.message },
        },
      ],
    };
  }

  safetyCard(id: string, safety: FitMeetAgentSafety): FitMeetAlphaCard {
    return {
      id: `safety_boundary:${id}`,
      type: 'safety_boundary',
      title: safety.blocked ? '我不能继续这个请求' : '本次匹配的安全边界',
      body: safety.blocked ? this.safety.refusal(safety) : this.safety.boundaryIntro(),
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
        requiresConfirmation: false,
        payload: { taskId, targetUserId, candidate },
      },
      {
        id: 'see_more',
        label: '看看更多',
        action: 'see_more',
        requiresConfirmation: false,
        payload: { taskId },
      },
      {
        id: 'filter_school',
        label: '只看同校',
        action: 'filter_school',
        requiresConfirmation: false,
        payload: { taskId },
      },
      {
        id: 'filter_gender_female',
        label: '只看女生',
        action: 'filter_gender_female',
        requiresConfirmation: false,
        payload: { taskId },
      },
      {
        id: 'create_activity',
        label: '创建约练',
        action: 'create_activity',
        requiresConfirmation: true,
        payload: { taskId, targetUserId, candidate },
      },
      {
        id: 'dislike_candidate',
        label: '不喜欢这个推荐',
        action: 'dislike_candidate',
        requiresConfirmation: false,
        payload: { taskId, targetUserId, candidate },
      },
    ];
  }

  private inferActivity(candidate: Record<string, unknown>): string {
    const tags = this.stringList(candidate.commonTags ?? candidate.interestTags);
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
}
