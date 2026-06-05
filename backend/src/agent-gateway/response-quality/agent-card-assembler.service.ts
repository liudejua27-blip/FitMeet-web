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
  'toolCalls',
  'toolCall',
  'debugReasons',
  'events',
  'model',
  'stack',
]);

@Injectable()
export class AgentCardAssemblerService {
  assemble(cards: FitMeetAlphaCard[] | null | undefined): FitMeetAlphaCard[] {
    return this.stripDebugFields(
      this.normalizeCardActions(cards ?? []),
    ) as FitMeetAlphaCard[];
  }

  stripDebugFields(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.stripDebugFields(item));
    }
    if (!value || typeof value !== 'object') return value;

    const clean: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(
      ([key, nested]) => {
        if (DEBUG_FIELD_NAMES.has(key)) return;
        clean[key] = this.stripDebugFields(nested);
      },
    );
    return clean;
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
  ): FitMeetAgentSchemaAction {
    switch (action) {
      case 'send_message':
        return 'opener.confirm_send';
      case 'connect_candidate':
      case 'save_candidate':
        return 'candidate.like';
      case 'create_activity':
        return 'activity.confirm_create';
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
        return 'candidate.more_like_this';
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
      case 'checkin_card':
        return 'activity_confirmed';
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
}
