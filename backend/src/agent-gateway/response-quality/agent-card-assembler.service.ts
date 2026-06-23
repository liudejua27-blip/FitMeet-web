import { Injectable } from '@nestjs/common';

import type {
  FitMeetAgentLoopStage,
  FitMeetAgentSchemaAction,
  FitMeetAlphaCard,
  FitMeetAlphaCardAction,
} from '../fitmeet-alpha-agent.types';

const DEBUG_FIELD_NAMES = new Set([
  'traceId',
  'agentTrace',
  'structuredIntent',
  'planner',
  'plannerSource',
  'rawJson',
  'rawJSON',
  'raw',
  'rawText',
  'debug',
  'toolCalls',
  'toolCall',
  'toolCallId',
  'debugReasons',
  'events',
  'model',
  'stack',
  'prompt',
  'systemPrompt',
  'instruction',
  'knownTaskSlotConstraints',
  'candidatePreferencePolicy',
  'profileUsed',
  'chatRun',
  'chatRuns',
  'visibleSteps',
  'queuedRun',
  'runId',
  'replan',
  'error',
]);
const DEBUG_FIELD_NAME_PATTERN =
  /(?:trace|structuredIntent|planner|rawJson|rawJSON|debug|toolCall|stack|prompt|systemPrompt|instruction|knownTaskSlotConstraints|candidatePreferencePolicy|chatRun|visibleSteps|queuedRun|replan)/i;
const DEBUG_TEXT_PATTERN =
  /\b(?:traceId|agentTrace|structuredIntent|planner|raw JSON|rawJson|tool_call|toolCall|toolCalls|stack trace|system prompt|internal runtime|database query|sql query)\b/i;

@Injectable()
export class AgentCardAssemblerService {
  assemble(cards: FitMeetAlphaCard[] | null | undefined): FitMeetAlphaCard[] {
    return this.stripDebugFields(
      this.dedupeCards(this.normalizeCardActions(cards ?? [])),
    ) as FitMeetAlphaCard[];
  }

  stripDebugFields(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value
        .map((item) => this.stripDebugFields(item))
        .filter((item) => item !== undefined);
    }
    if (typeof value === 'string') {
      return DEBUG_TEXT_PATTERN.test(value) ? undefined : value;
    }
    if (!value || typeof value !== 'object') return value;

    const clean: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(
      ([key, nested]) => {
        if (this.isDebugFieldName(key)) return;
        const next = this.stripDebugFields(nested);
        if (next !== undefined) clean[key] = next;
      },
    );
    return clean;
  }

  private isDebugFieldName(key: string): boolean {
    return DEBUG_FIELD_NAMES.has(key) || DEBUG_FIELD_NAME_PATTERN.test(key);
  }

  private normalizeCardActions(cards: FitMeetAlphaCard[]): FitMeetAlphaCard[] {
    return cards.map((card) => ({
      ...card,
      data: {
        ...(card.data ?? {}),
        loopStage:
          this.cardLoopStage(card) ??
          this.readLoopStage(card.data?.loopStage) ??
          undefined,
      },
      actions: (card.actions ?? []).map((action) =>
        this.normalizeAction(card, action),
      ),
    }));
  }

  private dedupeCards(cards: FitMeetAlphaCard[]): FitMeetAlphaCard[] {
    const seen = new Set<string>();
    const next: FitMeetAlphaCard[] = [];
    for (const card of cards) {
      const keys = this.cardDedupKeys(card);
      if (keys.length > 0 && keys.some((key) => seen.has(key))) {
        continue;
      }
      next.push(card);
      keys.forEach((key) => seen.add(key));
    }
    return next;
  }

  private cardDedupKeys(card: FitMeetAlphaCard): string[] {
    const keys = new Set<string>();
    const schemaType = this.readText(card.schemaType, card.type);
    const cardId = this.readText(card.id, '');
    if (cardId) keys.add(`card:${schemaType}:${cardId}`);

    const data = this.isRecord(card.data) ? card.data : {};
    const approvalId =
      this.readScalar(data.approvalId) ??
      this.readScalar(this.recordValue(data.approval)?.id) ??
      this.readScalar(this.recordValue(data.approvalRequest)?.id);
    if (approvalId) keys.add(`approval:${approvalId}`);

    const actionType =
      this.readText(data.actionType, '') ||
      this.readText(data.schemaAction, '') ||
      this.readText(data.type, '') ||
      this.readText(this.recordValue(data.approval)?.actionType, '');
    const candidateRecordId =
      this.readScalar(data.candidateRecordId) ??
      this.readScalar(data.relatedCandidateId) ??
      this.readScalar(data.candidateId) ??
      this.readScalar(data.targetUserId) ??
      this.readScalar(this.recordValue(data.candidate)?.candidateRecordId) ??
      this.readScalar(this.recordValue(data.candidate)?.targetUserId);
    if (candidateRecordId && actionType) {
      keys.add(`candidate-action:${candidateRecordId}:${actionType}`);
    }

    const taskId = this.readScalar(data.taskId);
    const opportunityId =
      this.readScalar(data.opportunityId) ??
      this.readScalar(data.publicIntentId) ??
      this.readScalar(this.recordValue(data.opportunity)?.id) ??
      this.readScalar(this.recordValue(data.activity)?.id);
    if (taskId && opportunityId) {
      keys.add(`task-opportunity:${taskId}:${opportunityId}`);
    }

    return Array.from(keys);
  }

  private normalizeAction(
    card: FitMeetAlphaCard,
    action: FitMeetAlphaCardAction,
  ): FitMeetAlphaCardAction {
    return {
      ...action,
      schemaAction:
        action.schemaAction ?? this.schemaActionForLegacy(action.action),
      loopStage:
        action.loopStage ??
        this.actionLoopStage(action.action) ??
        this.cardLoopStage(card) ??
        undefined,
    };
  }

  private schemaActionForLegacy(
    action: FitMeetAlphaCardAction['action'],
  ): FitMeetAgentSchemaAction | undefined {
    switch (action) {
      case 'send_message':
        return 'opener.confirm_send';
      case 'save_candidate':
        return 'candidate.like';
      case 'connect_candidate':
        return 'candidate.connect';
      case 'publish_social_request':
      case 'publish_to_discover':
        return 'publish_to_discover';
      case 'create_activity':
        return 'activity.confirm_create';
      case 'view_activity':
        return 'activity.view_detail';
      case 'upload_proof':
        return 'activity.upload_proof';
      case 'generate_opener':
        return 'candidate.generate_opener';
      case 'see_more':
      case 'filter_school':
      case 'filter_gender_female':
      case 'refine_request':
        return 'candidate.more_like_this';
      case 'dislike_candidate':
        return 'candidate.skip';
      case 'check_in':
        return 'activity.check_in';
      case 'submit_review':
        return 'review.submit';
      case 'confirm_profile_update':
        return 'life_graph.accept_update';
      default:
        return undefined;
    }
  }

  private actionLoopStage(
    action: FitMeetAlphaCardAction['action'],
  ): FitMeetAgentLoopStage | null {
    switch (action) {
      case 'generate_opener':
        return 'candidate_selected';
      case 'send_message':
        return 'opener_draft_created';
      case 'create_activity':
        return 'activity_draft_created';
      case 'view_activity':
      case 'upload_proof':
        return 'activity_completed';
      case 'check_in':
        return 'activity_confirmed';
      case 'submit_review':
        return 'activity_completed';
      case 'confirm_profile_update':
        return 'life_graph_updated';
      default:
        return null;
    }
  }

  private cardLoopStage(card: FitMeetAlphaCard): FitMeetAgentLoopStage | null {
    switch (card.type) {
      case 'candidate_card':
        return 'candidate_recommendation';
      case 'opener_approval':
        return 'opener_draft_created';
      case 'activity_plan':
        return 'activity_draft_created';
      case 'activity_status':
        return 'activity_completed';
      case 'checkin_card':
        return 'activity_confirmed';
      case 'meet_loop_timeline':
      case 'review_card':
        return 'activity_completed';
      case 'audit_update':
        return 'opener_draft_created';
      case 'profile_proposal':
        return 'life_graph_updated';
      default:
        return null;
    }
  }

  private readLoopStage(value: unknown): FitMeetAgentLoopStage | null {
    const allowed: FitMeetAgentLoopStage[] = [
      'social_search',
      'candidate_recommendation',
      'candidate_selected',
      'opener_draft_created',
      'opener_confirmed',
      'message_sent',
      'activity_draft_created',
      'activity_confirmed',
      'activity_checked_in',
      'activity_completed',
      'review_submitted',
      'life_graph_updated',
      'trust_score_updated',
    ];
    return typeof value === 'string' &&
      allowed.includes(value as FitMeetAgentLoopStage)
      ? (value as FitMeetAgentLoopStage)
      : null;
  }

  private readScalar(value: unknown): string | null {
    if (typeof value === 'number' && Number.isFinite(value))
      return String(value);
    if (typeof value === 'string' && value.trim()) return value.trim();
    return null;
  }

  private readText(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
  }

  private recordValue(value: unknown): Record<string, unknown> | null {
    return this.isRecord(value) ? value : null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}
