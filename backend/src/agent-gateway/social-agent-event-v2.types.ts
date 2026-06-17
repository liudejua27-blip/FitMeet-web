export type SocialAgentEventV2Type =
  | 'run.started'
  | 'visible_process.delta'
  | 'assistant.delta'
  | 'tool.started'
  | 'tool.progress'
  | 'tool.done'
  | 'slot.filled'
  | 'slot.completed'
  | 'memory.saved'
  | 'opportunity_card.created'
  | 'candidate_search.started'
  | 'candidate_search.done'
  | 'safety_check.done'
  | 'approval.required'
  | 'approval.resolved'
  | 'run.completed'
  | 'run.failed';

export type SocialAgentEventV2Stage =
  | 'detect_social_intent'
  | 'hydrate_context'
  | 'profile_gate'
  | 'slot_filling'
  | 'create_opportunity_card'
  | 'publish_to_discover'
  | 'search_candidates'
  | 'safety_filter'
  | 'rank_candidates'
  | 'generate_opener'
  | 'approval'
  | 'send_invite'
  | 'life_graph_writeback';

export type SocialAgentEventV2Visibility =
  | 'user_visible'
  | 'debug_only'
  | 'internal';

export type SocialAgentEventV2DisplayState =
  | 'running'
  | 'done'
  | 'waiting'
  | 'failed';

export type SocialAgentEventV2 = {
  type: SocialAgentEventV2Type;
  eventId: string;
  seq: number;
  createdAt: string;
  userId: string;
  threadId: string;
  taskId: number | null;
  runId: string;
  messageId?: string;
  stage: SocialAgentEventV2Stage;
  visibility: SocialAgentEventV2Visibility;
  display?: {
    title: string;
    detail?: string;
    state: SocialAgentEventV2DisplayState;
  };
  payload?: Record<string, unknown>;
};

export type SocialAgentEventV2EnvelopeInput = {
  type: SocialAgentEventV2Type;
  userId: number;
  threadId?: string | number | null;
  taskId?: number | null;
  runId?: string | null;
  messageId?: string | null;
  stage: SocialAgentEventV2Stage;
  visibility?: SocialAgentEventV2Visibility;
  display?: SocialAgentEventV2['display'];
  payload?: Record<string, unknown>;
};
