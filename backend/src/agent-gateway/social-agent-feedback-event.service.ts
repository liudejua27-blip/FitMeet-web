import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, Repository } from 'typeorm';

import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';
import {
  AgentFeedbackEvent,
  type AgentFeedbackReasonCode,
  type AgentFeedbackType,
} from './entities/agent-feedback-event.entity';
import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskEventActor,
  AgentTaskEventType,
} from './entities/agent-task.entity';
import { SocialAgentUserInterestEventService } from './social-agent-user-interest-event.service';
import { SocialAgentPreferenceGeneralizationService } from './social-agent-preference-generalization.service';

export type AgentFeedbackEventInput = {
  taskId?: number | null;
  publicIntentId?: string | null;
  matchingJobId?: number | null;
  candidateId?: number | null;
  candidateRecordId?: number | null;
  feedbackType?: string | null;
  reasonCode?: string | null;
  freeText?: string | null;
  appliesToCurrentTask?: boolean | null;
  appliesToFutureProfile?: boolean | null;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type AgentFeedbackCorpusRow = {
  id: number;
  userId: number;
  taskId: number | null;
  publicIntentId: string | null;
  matchingJobId: number | null;
  candidateId: number | null;
  feedbackType: AgentFeedbackType;
  reasonCode: AgentFeedbackReasonCode;
  freeText: string | null;
  correctionType: string | null;
  oldValue: string | null;
  newValue: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

const FEEDBACK_TYPES = new Set<AgentFeedbackType>([
  'candidate_quality',
  'agent_understanding',
  'task_correction',
  'task_outcome',
  'message_quality',
]);

const REASON_CODES = new Set<AgentFeedbackReasonCode>([
  'good_fit',
  'more_like_this',
  'save_candidate',
  'connect_candidate',
  'bad_fit',
  'too_far',
  'time_mismatch',
  'style_mismatch',
  'wrong_activity',
  'privacy_preference',
  'not_public',
  'other',
]);

const NEGATIVE_REASON_CODES = new Set<AgentFeedbackReasonCode>([
  'bad_fit',
  'too_far',
  'time_mismatch',
  'style_mismatch',
  'wrong_activity',
  'privacy_preference',
  'not_public',
]);

type CorrectionSignal = {
  correctionType: string | null;
  oldValue: string | null;
  newValue: string | null;
  reasonCode: AgentFeedbackReasonCode | null;
  appliesToFutureProfile: boolean;
};

@Injectable()
export class SocialAgentFeedbackEventService {
  constructor(
    @InjectRepository(AgentFeedbackEvent)
    private readonly feedbackRepo: Repository<AgentFeedbackEvent>,
    private readonly dataSource: DataSource,
    private readonly interestEvents: SocialAgentUserInterestEventService,
    @Optional()
    private readonly preferenceGeneralization?: SocialAgentPreferenceGeneralizationService,
  ) {}

  async submit(ownerUserId: number, input: AgentFeedbackEventInput) {
    const feedbackType = this.feedbackType(input.feedbackType);
    const inferredCorrection = this.inferCorrection(input.freeText);
    const reasonCode = this.reasonCode(
      input.reasonCode,
      inferredCorrection.reasonCode,
      feedbackType,
    );
    const taskId = this.positiveNumber(input.taskId);
    const candidateId = this.positiveNumber(input.candidateId);
    const candidateRecordId = this.positiveNumber(input.candidateRecordId);
    const matchingJobId = this.positiveNumber(input.matchingJobId);
    const publicIntentId =
      cleanDisplayText(input.publicIntentId, '').slice(0, 80) || null;
    const freeText =
      cleanDisplayText(input.freeText, '').slice(0, 1000) || null;
    const source = cleanDisplayText(input.source, 'agent_web').slice(0, 80);
    const metadata = sanitizeForDisplay(input.metadata ?? {}) as Record<
      string,
      unknown
    >;

    const saved = await this.dataSource.transaction(async (manager) => {
      let task: AgentTask | null = null;
      if (taskId) {
        task = await manager.getRepository(AgentTask).findOne({
          where: { id: taskId, ownerUserId },
        });
        if (!task) {
          throw new NotFoundException(`Social agent task ${taskId} not found`);
        }
      }

      const row = await manager.getRepository(AgentFeedbackEvent).save(
        manager.getRepository(AgentFeedbackEvent).create({
          userId: ownerUserId,
          taskId,
          publicIntentId,
          matchingJobId,
          candidateId,
          candidateRecordId,
          feedbackType,
          reasonCode,
          freeText,
          correctionType: inferredCorrection.correctionType,
          oldValue: inferredCorrection.oldValue,
          newValue: inferredCorrection.newValue,
          appliesToCurrentTask: input.appliesToCurrentTask !== false,
          appliesToFutureProfile:
            input.appliesToFutureProfile === true ||
            inferredCorrection.appliesToFutureProfile,
          source,
          metadata,
        }),
      );

      if (task) {
        const memoryPatch = this.feedbackMemoryPatch(row);
        task.memory = this.appendFeedbackMemory(task.memory, memoryPatch);
        await manager.getRepository(AgentTask).save(task);
        await manager.getRepository(AgentTaskEvent).save(
          manager.getRepository(AgentTaskEvent).create({
            taskId: task.id,
            ownerUserId,
            eventType: AgentTaskEventType.FeedbackReceived,
            actor: AgentTaskEventActor.User,
            summary: this.eventSummary(row),
            payload: sanitizeForDisplay({
              feedbackEventId: row.id,
              feedbackType: row.feedbackType,
              reasonCode: row.reasonCode,
              candidateId: row.candidateId,
              candidateRecordId: row.candidateRecordId,
              publicIntentId: row.publicIntentId,
              matchingJobId: row.matchingJobId,
              correctionType: row.correctionType,
              oldValue: row.oldValue,
              newValue: row.newValue,
              source: row.source,
            }) as Record<string, unknown>,
          }),
        );
      }
      return row;
    });

    await this.recordInterestSignal(saved).catch(() => undefined);
    await this.preferenceGeneralization
      ?.recordFeedback(saved)
      .catch(() => undefined);

    return {
      ok: true,
      id: saved.id,
      taskId: saved.taskId,
      publicIntentId: saved.publicIntentId,
      matchingJobId: saved.matchingJobId,
      candidateId: saved.candidateId,
      feedbackType: saved.feedbackType,
      reasonCode: saved.reasonCode,
      correctionType: saved.correctionType,
      createdAt: saved.createdAt.toISOString(),
    };
  }

  listRecent(input?: {
    limit?: number;
    feedbackType?: string | null;
    reasonCode?: string | null;
  }): Promise<AgentFeedbackEvent[]> {
    const take = this.limit(input?.limit, 100, 500);
    const where: FindOptionsWhere<AgentFeedbackEvent> = {};
    const feedbackType = this.optionalFeedbackType(input?.feedbackType);
    if (feedbackType) where.feedbackType = feedbackType;
    const reasonCode = this.optionalReasonCode(input?.reasonCode);
    if (reasonCode) where.reasonCode = reasonCode;
    return this.feedbackRepo.find({
      where,
      order: { createdAt: 'DESC', id: 'DESC' },
      take,
    });
  }

  async exportFailureCorpus(input?: {
    limit?: number;
    since?: Date | null;
  }): Promise<AgentFeedbackCorpusRow[]> {
    const take = this.limit(input?.limit, 200, 1000);
    const since =
      input?.since instanceof Date && !Number.isNaN(input.since.getTime())
        ? input.since
        : null;
    const qb = this.feedbackRepo
      .createQueryBuilder('event')
      .where(
        '(event.reasonCode IN (:...reasonCodes) OR event.correctionType IS NOT NULL)',
        {
          reasonCodes: Array.from(NEGATIVE_REASON_CODES),
        },
      );
    if (since) {
      qb.andWhere('event.createdAt >= :since', { since });
    }
    const rows = await qb
      .orderBy('event.createdAt', 'DESC')
      .addOrderBy('event.id', 'DESC')
      .take(take)
      .getMany();
    return rows.map((row) => this.toCorpusRow(row));
  }

  async generateGoldenCandidateCases(input?: { limit?: number }) {
    const rows = await this.exportFailureCorpus({
      limit: this.limit(input?.limit, 80, 300),
    });
    return rows.map((row) => ({
      caseId: `feedback_candidate_${row.id}`,
      source: 'agent_feedback_events',
      feedbackEventId: row.id,
      stateBefore: {
        taskId: row.taskId,
        publicIntentId: row.publicIntentId,
        matchingJobId: row.matchingJobId,
        candidateId: row.candidateId,
      },
      input:
        row.freeText || this.reasonCodePrompt(row.reasonCode) || '候选质量反馈',
      expected: {
        feedbackType: row.feedbackType,
        reasonCode: row.reasonCode,
        mustNot: [
          'publish_without_confirmation',
          'contact_without_confirmation',
        ],
      },
      metadata: row.metadata,
    }));
  }

  private feedbackType(value: unknown): AgentFeedbackType {
    if (typeof value === 'string') {
      const normalized = value.trim() as AgentFeedbackType;
      if (FEEDBACK_TYPES.has(normalized)) return normalized;
    }
    return 'candidate_quality';
  }

  private optionalFeedbackType(value: unknown): AgentFeedbackType | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim() as AgentFeedbackType;
    return FEEDBACK_TYPES.has(normalized) ? normalized : null;
  }

  private reasonCode(
    explicit: unknown,
    inferred: AgentFeedbackReasonCode | null,
    feedbackType: AgentFeedbackType,
  ): AgentFeedbackReasonCode {
    if (typeof explicit === 'string') {
      const normalized = explicit.trim() as AgentFeedbackReasonCode;
      if (REASON_CODES.has(normalized)) return normalized;
    }
    if (inferred) return inferred;
    if (feedbackType === 'candidate_quality') return 'good_fit';
    return 'other';
  }

  private optionalReasonCode(value: unknown): AgentFeedbackReasonCode | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim() as AgentFeedbackReasonCode;
    return REASON_CODES.has(normalized) ? normalized : null;
  }

  private inferCorrection(value: unknown): CorrectionSignal {
    const text = cleanDisplayText(value, '').trim();
    if (!text) return this.emptyCorrection();

    const slotCorrection = text.match(
      /不是\s*([^，,。；;]{1,40})\s*[，, ]?\s*是\s*([^，,。；;]{1,40})/,
    );
    if (slotCorrection) {
      return {
        correctionType: 'slot_value_correction',
        oldValue: cleanDisplayText(slotCorrection[1], '').slice(0, 240),
        newValue: cleanDisplayText(slotCorrection[2], '').slice(0, 240),
        reasonCode: 'wrong_activity',
        appliesToFutureProfile: false,
      };
    }
    if (/不要太远|别太远|太远|近一点|附近就好|附近即可|附近优先/.test(text)) {
      return {
        correctionType: 'distance_preference',
        oldValue: null,
        newValue: 'nearby_only',
        reasonCode: 'too_far',
        appliesToFutureProfile: true,
      };
    }
    if (/不要公开|不想公开|别公开|只私下|不要发到发现/.test(text)) {
      return {
        correctionType: 'visibility_preference',
        oldValue: null,
        newValue: 'private_only',
        reasonCode: 'not_public',
        appliesToFutureProfile: true,
      };
    }
    return this.emptyCorrection();
  }

  private emptyCorrection(): CorrectionSignal {
    return {
      correctionType: null,
      oldValue: null,
      newValue: null,
      reasonCode: null,
      appliesToFutureProfile: false,
    };
  }

  private appendFeedbackMemory(
    memory: AgentTask['memory'],
    patch: Record<string, unknown>,
  ): AgentTask['memory'] {
    const base = this.record(memory);
    const current = this.record(base.agentFeedback);
    const recent = this.recordList(current.recentEvents);
    const corrections = this.recordList(current.corrections);
    const correction =
      typeof patch.correctionType === 'string' && patch.correctionType
        ? {
            feedbackEventId: patch.feedbackEventId,
            correctionType: patch.correctionType,
            oldValue: patch.oldValue,
            newValue: patch.newValue,
            reasonCode: patch.reasonCode,
            createdAt: patch.createdAt,
          }
        : null;
    return {
      ...base,
      agentFeedback: {
        ...current,
        lastFeedbackAt: patch.createdAt,
        recentEvents: [patch, ...recent].slice(0, 20),
        corrections: correction
          ? [correction, ...corrections].slice(0, 20)
          : corrections.slice(0, 20),
      },
    };
  }

  private feedbackMemoryPatch(
    row: AgentFeedbackEvent,
  ): Record<string, unknown> {
    return sanitizeForDisplay({
      feedbackEventId: row.id,
      feedbackType: row.feedbackType,
      reasonCode: row.reasonCode,
      candidateId: row.candidateId,
      candidateRecordId: row.candidateRecordId,
      publicIntentId: row.publicIntentId,
      matchingJobId: row.matchingJobId,
      freeText: row.freeText,
      correctionType: row.correctionType,
      oldValue: row.oldValue,
      newValue: row.newValue,
      appliesToCurrentTask: row.appliesToCurrentTask,
      appliesToFutureProfile: row.appliesToFutureProfile,
      source: row.source,
      createdAt: row.createdAt.toISOString(),
    }) as Record<string, unknown>;
  }

  private async recordInterestSignal(row: AgentFeedbackEvent) {
    if (row.feedbackType !== 'candidate_quality') return;
    const eventType = this.isPositiveCandidateFeedback(row.reasonCode)
      ? 'save_candidate'
      : 'skip_candidate';
    await this.interestEvents.recordEvent({
      ownerUserId: row.userId,
      agentTaskId: row.taskId,
      eventType,
      targetUserId: row.candidateId,
      candidateRecordId: row.candidateRecordId,
      weight: this.isPositiveCandidateFeedback(row.reasonCode) ? 4 : -4,
      source: 'agent_feedback_event',
      dedupeKey: `agent-feedback:${row.id}`,
      metadata: {
        feedbackEventId: row.id,
        reasonCode: row.reasonCode,
        publicIntentId: row.publicIntentId,
        matchingJobId: row.matchingJobId,
      },
    });
  }

  private eventSummary(row: AgentFeedbackEvent): string {
    const label = this.reasonCodePrompt(row.reasonCode) || row.reasonCode;
    if (row.candidateId) return `记录候选反馈：${label}`;
    if (row.correctionType) return `记录用户纠错：${label}`;
    return `记录 Agent 反馈：${label}`;
  }

  private reasonCodePrompt(reasonCode: AgentFeedbackReasonCode): string {
    switch (reasonCode) {
      case 'good_fit':
        return '合适';
      case 'more_like_this':
        return '想看更多类似';
      case 'save_candidate':
        return '收藏候选';
      case 'connect_candidate':
        return '联系候选';
      case 'bad_fit':
        return '不合适';
      case 'too_far':
        return '太远';
      case 'time_mismatch':
        return '时间不对';
      case 'style_mismatch':
        return '风格不对';
      case 'wrong_activity':
        return '活动理解错误';
      case 'privacy_preference':
        return '隐私偏好';
      case 'not_public':
        return '不想公开';
      default:
        return '其他';
    }
  }

  private toCorpusRow(row: AgentFeedbackEvent): AgentFeedbackCorpusRow {
    return {
      id: row.id,
      userId: row.userId,
      taskId: row.taskId,
      publicIntentId: row.publicIntentId,
      matchingJobId: row.matchingJobId,
      candidateId: row.candidateId,
      feedbackType: row.feedbackType,
      reasonCode: row.reasonCode,
      freeText: row.freeText,
      correctionType: row.correctionType,
      oldValue: row.oldValue,
      newValue: row.newValue,
      metadata: sanitizeForDisplay(row.metadata ?? {}) as Record<
        string,
        unknown
      >,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private isPositiveCandidateFeedback(
    reasonCode: AgentFeedbackReasonCode,
  ): boolean {
    return [
      'good_fit',
      'more_like_this',
      'save_candidate',
      'connect_candidate',
    ].includes(reasonCode);
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private recordList(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value)
      ? value.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object' && !Array.isArray(item),
        )
      : [];
  }

  private positiveNumber(value: unknown): number | null {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue) || numberValue <= 0) return null;
    return Math.trunc(numberValue);
  }

  private limit(value: unknown, fallback: number, max: number): number {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue) || numberValue <= 0) return fallback;
    return Math.max(1, Math.min(Math.trunc(numberValue), max));
  }
}
