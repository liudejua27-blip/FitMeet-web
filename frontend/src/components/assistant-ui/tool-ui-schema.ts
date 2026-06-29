import { isLowRiskApprovalActionType, isLowRiskApprovalText } from './tool-risk-policy';

export type ToolUISchemaType =
  | 'social_match.candidate'
  | 'social_match.activity'
  | 'social_match.empty'
  | 'social_match.no_candidates'
  | 'social_match.privacy_guard'
  | 'social_match.rate_limited'
  | 'social_match.slot_completion'
  | 'profile.completion'
  | 'life_graph.diff'
  | 'meet_loop.timeline'
  | 'public_intent.application'
  | 'safety.approval'
  | 'loop.choice'
  | 'clarification.binary'
  | 'workout.intake'
  | 'workout.draft'
  | 'friend.intake'
  | 'travel.intake'
  | 'travel.companion_draft'
  | 'generic.card';

export type ToolUIProductComponent =
  | 'CandidateCards'
  | 'OpportunityCard'
  | 'CandidateEmptyStateCard'
  | 'SlotClarificationCard'
  | 'ProfileCompletionCard'
  | 'LifeGraphDiffCard'
  | 'MeetLoopTimeline'
  | 'PublicIntentApplicationCard'
  | 'ApprovalPanel'
  | 'LoopChoiceCard'
  | 'ClarificationBinaryCard'
  | 'WorkoutIntakeCard'
  | 'WorkoutDraftCard'
  | 'GenericCard';

export type ToolUISchemaAction =
  | 'candidate.view_detail'
  | 'candidate.like'
  | 'candidate.skip'
  | 'candidate.feedback.good_fit'
  | 'candidate.feedback.bad_fit'
  | 'candidate.feedback.too_far'
  | 'candidate.feedback.time_mismatch'
  | 'candidate.feedback.style_mismatch'
  | 'candidate.connect'
  | 'matching.relax_distance'
  | 'matching.relax_time'
  | 'matching.relax_tags'
  | 'candidate.generate_opener'
  | 'candidate.more_like_this'
  | 'opener.confirm_send'
  | 'opener.regenerate'
  | 'opener.reject'
  | 'publish_to_discover'
  | 'social_intent.decline_publish'
  | 'social_intent.dismiss'
  | 'social_intent.retry_publish'
  | 'activity.view_detail'
  | 'activity.confirm_create'
  | 'activity.modify_time'
  | 'activity.modify_location'
  | 'activity.skip_publish'
  | 'activity.check_in'
  | 'activity.complete'
  | 'activity.upload_proof'
  | 'review.submit'
  | 'life_graph.accept_update'
  | 'life_graph.reject_update'
  | 'meet_loop.resume'
  | 'meet_loop.reschedule'
  | 'safety.approve'
  | 'safety.reject'
  | 'slot_completion.use_default_safety'
  | 'slot_completion.custom_safety'
  | 'slot_completion.cancel'
  | 'loop_choice.workout'
  | 'loop_choice.friend'
  | 'loop_choice.travel'
  | 'clarification.yes'
  | 'clarification.no'
  | 'workout_intake.submit'
  | 'workout_intake.use_defaults'
  | 'workout_intake.cancel'
  | 'workout_draft.publish'
  | 'workout_draft.private_match'
  | 'workout_draft.edit'
  | 'workout_draft.cancel'
  | 'public_intent_application.accept'
  | 'public_intent_application.reject'
  | 'public_intent_application.view_profile'
  | 'public_intent_application.open_conversation';

export type AssistantCardAction = {
  id?: string;
  label?: string;
  action?: string;
  schemaAction?: ToolUISchemaAction;
  requiresConfirmation?: boolean;
  payload?: Record<string, unknown>;
};

export type SchemaDrivenAssistantCard = {
  id: string;
  type: string;
  schemaVersion: string;
  schemaType: ToolUISchemaType;
  title: string;
  body?: string;
  status?: string;
  data: Record<string, unknown>;
  actions: AssistantCardAction[];
};

export type ToolUICardCollectionSummary = {
  title: string;
  detail: string;
  candidateCount: number;
  emptyCount: number;
  opportunityCount: number;
  approvalCount: number;
  lifeGraphDiffCount: number;
  profileCompletionCount: number;
  meetLoopCount: number;
  applicationCount: number;
  loopChoiceCount: number;
  clarificationCount: number;
  workoutIntakeCount: number;
  workoutDraftCount: number;
  friendIntakeCount: number;
  travelIntakeCount: number;
  travelCompanionDraftCount: number;
  genericCount: number;
  components: ToolUIProductComponent[];
};

export type CandidateOpportunityView = {
  name: string;
  title: string;
  subtitle: string | null;
  avatarUrl: string | null;
  score: number | null;
  summary: string;
  relationshipGoal: string | null;
  idealType: string | null;
  invitePolicy: string | null;
  confirmedContext: string[];
  area: string | null;
  time: string | null;
  distanceLabel: string | null;
  interests: string[];
  safetyBadges: string[];
  reasons: string[];
  explanationSteps: string[];
  rankingBreakdown: CandidateRankingBreakdownItemView[];
  trustSignals: string[];
  coldStartSignals: string[];
  discoverySafetySignals: string[];
  recommendationProtocol: CandidateRecommendationProtocolItemView[];
  recentPublicActivity: string[];
  preferenceHistorySignals: string[];
  whyNow: string | null;
  openerStrategy: string | null;
  suggestedOpener: string | null;
  recommendedNextAction: string | null;
  safetyBoundary: string | null;
  reasoningQuality: CandidateReasoningQualityView;
};

export type CandidateReasoningQualityView = {
  degraded: boolean;
  retryable: boolean;
  source: string | null;
  confidence: number | null;
  label: string | null;
  detail: string | null;
  actionLabel: string | null;
};

export type CandidateRecommendationProtocolItemView = {
  key: string;
  label: string;
  detail: string;
};

export type CandidateRankingBreakdownItemView = {
  key: string;
  label: string;
  score: number | null;
  reason: string;
};

export type ActivityOpportunityView = {
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  confirmedContext: string[];
  city: string | null;
  location: string | null;
  time: string | null;
  capacityLabel: string | null;
  intensity: string | null;
  host: string | null;
  summary: string;
  nextAction: string;
  tags: string[];
  safetyBadges: string[];
  reasons: string[];
  explanationSteps: string[];
  activityProtocol: ActivityProtocolItemView[];
  safetyBoundary: string | null;
  publishPolicy: string | null;
  approvalPolicy: string | null;
  meetLoopNextStep: string | null;
  checkinReminder: string | null;
  reviewPrompt: string | null;
  lifeGraphUpdatePreview: string | null;
  trustScoreUpdatePreview: string | null;
  autoPublished: boolean;
  publicIntentId: string | null;
  discoverHref: string | null;
  publicIntentHref: string | null;
  messagesHref: string | null;
};

export type ActivityProtocolItemView = {
  key: string;
  label: string;
  detail: string;
};

export type CandidateEmptyStateRecoveryOptionView = {
  key: string;
  label: string;
  detail: string;
  requiresConfirmation: boolean;
};

export type CandidateEmptyStateView = {
  title: string;
  summary: string;
  criteria: string[];
  recoveryOptions: CandidateEmptyStateRecoveryOptionView[];
  safetyBoundary: string | null;
  nextBestStep: string | null;
};

export type DefaultOpportunityActionStep = {
  schemaAction: ToolUISchemaAction;
  requiresConfirmation: boolean;
  source: 'default';
};

export type LifeGraphDiffView = {
  title: string;
  description: string;
  source: string | null;
  sourceLabel: string;
  currentValue: string;
  proposedValue: string;
  fields: string[];
  conflicts: string[];
  sensitivityLevel: string | null;
  confirmationBoundary: string | null;
  privacyBoundary: string | null;
  revokeHint: string | null;
  sourceSignals: string[];
};

export type MeetLoopStageState = 'done' | 'current' | 'next';

export type MeetLoopTimelineStepView = {
  key: string;
  label: string;
  state: MeetLoopStageState;
  description: string;
  actionLabel: string | null;
  checkpointReady: boolean;
  resumeMode: 'resume' | 'reschedule' | 'review' | 'memory' | null;
};

export type MeetLoopTimelineView = {
  title: string;
  description: string;
  nextAction: string;
  stage: string | null;
  connectionState: string | null;
  counterpartIntent: string | null;
  replyIntentLabel: string | null;
  replyIntentDescription: string | null;
  nextSafeStep: string | null;
  waitingFor: string | null;
  nextRecoverableActions: string[];
  sideEffectPolicy: string | null;
  recoveryProtocol: MeetLoopRecoveryProtocolItemView[];
  replyPreview: string | null;
  steps: MeetLoopTimelineStepView[];
};

export type MeetLoopRecoveryProtocolItemView = {
  key: string;
  label: string;
  detail: string;
};

export type SafetyApprovalView = {
  title: string;
  boundary: string;
  riskLevel: string | null;
  reasons: string[];
  auditNote: string | null;
  confirmationLabel: string;
  checkpointLabel: string;
};

export type GenericCardView = {
  title: string;
  body: string | null;
  statusLabel: string | null;
  details: string[];
};

export type PublicIntentApplicationView = {
  applicationId: number | string | null;
  publicIntentId: string | null;
  applicantUserId: number | string | null;
  applicantName: string;
  publicIntentTitle: string;
  message: string;
  status: string;
  statusLabel: string;
  meetId: number | string | null;
  profileHref: string | null;
  messagesHref: string | null;
  conversationId: string | null;
  safetyBoundary: string;
};

export const FITMEET_TOOL_UI_SCHEMA_VERSION = 'fitmeet.tool-ui.v1';

export function extractAssistantCards(data: unknown): SchemaDrivenAssistantCard[] {
  if (!isRecord(data) || !Array.isArray(data.cards)) return [];
  return data.cards.filter(isRecord).map((card, index) => normalizeAssistantCard(card, index));
}

export function extractCanonicalAssistantCards(data: unknown): SchemaDrivenAssistantCard[] {
  if (!isRecord(data) || !Array.isArray(data.cards)) return [];
  return dedupeAssistantCards(
    data.cards
      .filter(isRecord)
      .map((card, index) => normalizeAssistantCard(card, index))
      .filter((card) => isCanonicalAssistantCard(card)),
  );
}

export function dedupeAssistantCards(
  cards: SchemaDrivenAssistantCard[],
): SchemaDrivenAssistantCard[] {
  const hostCards = collectApprovalHostCards(cards);
  for (const card of cards) {
    if (card.schemaType !== 'safety.approval') continue;
    if (isLowRiskApprovalCard(card)) continue;
    const host = findApprovalHostCard(card, hostCards);
    const inlineApproval = inlineApprovalConfirmationFromApprovalCard(card, host?.card);
    if (!host || !inlineApproval) continue;
    const actionKey = publicString(inlineApproval.confirmation.actionKey) ?? 'approval';
    host.inlineApprovalCandidates.set(
      actionKey,
      choosePreferredInlineApproval(
        host.inlineApprovalCandidates.get(actionKey) ?? null,
        inlineApproval,
      ),
    );
  }

  const cardsWithInlineApproval = new Map<string, SchemaDrivenAssistantCard>();
  for (const host of hostCards) {
    if (host.inlineApprovalCandidates.size === 0) continue;
    const inlineApprovalConfirmations = Object.fromEntries(
      Array.from(host.inlineApprovalCandidates.entries()).map(([actionKey, candidate]) => [
        actionKey,
        candidate.confirmation,
      ]),
    );
    const firstInlineApproval = Array.from(host.inlineApprovalCandidates.values()).sort(
      (left, right) => right.priority - left.priority,
    )[0]?.confirmation;
    cardsWithInlineApproval.set(host.card.id, {
      ...host.card,
      data: {
        ...host.card.data,
        inlineApprovalConfirmation: firstInlineApproval,
        inlineApprovalConfirmations,
      },
    });
  }

  const seen = new Set<string>();
  const result: SchemaDrivenAssistantCard[] = [];
  for (const originalCard of cards) {
    const card = cardsWithInlineApproval.get(originalCard.id) ?? originalCard;
    const keys = cardIdentityKeys(card);
    if (
      card.schemaType === 'safety.approval' &&
      approvalCardShouldCollapseIntoActionCard(card, hostCards)
    ) {
      continue;
    }
    if (keys.some((key) => seen.has(key))) continue;
    for (const key of keys) seen.add(key);
    result.push(card);
  }
  return result;
}

type ApprovalHostCard = {
  card: SchemaDrivenAssistantCard;
  keys: Set<string>;
  hostType: 'candidate' | 'activity';
  inlineApprovalCandidates: Map<string, InlineApprovalCandidate>;
};

type InlineApprovalCandidate = {
  priority: number;
  confirmation: Record<string, unknown>;
};

function collectApprovalHostCards(cards: SchemaDrivenAssistantCard[]): ApprovalHostCard[] {
  return cards
    .filter(
      (card) =>
        card.schemaType === 'social_match.candidate' || card.schemaType === 'social_match.activity',
    )
    .map((card) => ({
      card,
      keys: new Set(hostCardIdentityKeys(card)),
      hostType: card.schemaType === 'social_match.candidate' ? 'candidate' : 'activity',
      inlineApprovalCandidates: new Map<string, InlineApprovalCandidate>(),
    }));
}

function approvalCardShouldCollapseIntoActionCard(
  card: SchemaDrivenAssistantCard,
  hostCards: ApprovalHostCard[],
) {
  if (card.schemaType !== 'safety.approval') return false;
  if (isLowRiskApprovalCard(card)) return true;
  if (hostCards.length === 0) return false;
  return Boolean(findApprovalHostCard(card, hostCards));
}

function findApprovalHostCard(
  approvalCard: SchemaDrivenAssistantCard,
  hostCards: ApprovalHostCard[],
): ApprovalHostCard | null {
  if (hostCards.length === 0) return null;
  const approvalKeys = new Set(hostCardIdentityKeys(approvalCard));
  const keyedMatch = hostCards.find((host) => [...approvalKeys].some((key) => host.keys.has(key)));
  if (keyedMatch) return keyedMatch;

  const text = approvalCardSearchText(approvalCard);
  const wantsCandidate =
    /candidate|connect|friend|send|message|invite|contact|候选|加好友|好友|连接|发送|私信|邀请|联系/.test(
      text,
    );
  const wantsActivity =
    /publish|social_request|activity|meet|location|precise|发布|发现|活动|约练|位置|精确/.test(
      text,
    );
  const candidateHosts = hostCards.filter((host) => host.hostType === 'candidate');
  const activityHosts = hostCards.filter((host) => host.hostType === 'activity');
  const candidateNameMatch = uniqueHostByTextHint(candidateHosts, text);
  if (wantsCandidate && candidateNameMatch) return candidateNameMatch;
  const activityNameMatch = uniqueHostByTextHint(activityHosts, text);
  if (wantsActivity && activityNameMatch) return activityNameMatch;
  if (wantsCandidate && candidateHosts.length === 1) return candidateHosts[0];
  if (wantsActivity && activityHosts.length === 1) return activityHosts[0];
  if (hostCards.length === 1 && (wantsCandidate || wantsActivity)) return hostCards[0];
  return null;
}

function uniqueHostByTextHint(
  hostCards: ApprovalHostCard[],
  text: string,
): ApprovalHostCard | null {
  const matches = hostCards.filter((host) =>
    hostCardTextHints(host.card).some((hint) => text.includes(hint)),
  );
  return matches.length === 1 ? matches[0] : null;
}

function hostCardTextHints(card: SchemaDrivenAssistantCard): string[] {
  const opportunity = isRecord(card.data.opportunity) ? card.data.opportunity : {};
  const candidate = isRecord(card.data.candidate) ? card.data.candidate : {};
  const values = [
    card.title,
    card.data.displayName,
    card.data.name,
    card.data.nickname,
    opportunity.title,
    opportunity.name,
    opportunity.displayName,
    opportunity.nickname,
    candidate.title,
    candidate.name,
    candidate.displayName,
    candidate.nickname,
  ];
  return Array.from(
    new Set(
      values
        .map((value) => publicDetail(value)?.toLowerCase())
        .filter((value): value is string => Boolean(value && value.length >= 2)),
    ),
  );
}

function inlineApprovalConfirmationFromApprovalCard(
  card: SchemaDrivenAssistantCard,
  hostCard: SchemaDrivenAssistantCard | undefined,
): InlineApprovalCandidate | null {
  const sources = approvalIdentitySources(card);
  const id = approvalIdFromCardData(card) ?? approvalIdFromCardActions(card) ?? card.id;
  if (!id) return null;
  const actionType =
    firstPrimitiveFromSources(sources, ['schemaAction', 'actionType', 'action']) ??
    actionTypeFromApprovalText(card);
  const summary =
    firstPublicDetailFromSources(sources, ['summary', 'boundary']) ??
    card.body ??
    '确认前不会触达对方或公开敏感信息。';
  const riskLevel = firstPrimitiveFromSources(sources, ['riskLevel', 'risk_level']) ?? 'medium';
  return {
    priority: approvalCardPriority(card),
    confirmation: {
      id,
      type: firstPrimitiveFromSources(sources, ['type']) ?? 'action',
      actionType,
      summary,
      riskLevel,
      expiresAt: firstPrimitiveFromSources(sources, ['expiresAt', 'expires_at']),
      actionKey: inlineApprovalActionKeyForApprovalCard(card, hostCard),
    },
  };
}

function approvalIdFromCardActions(card: SchemaDrivenAssistantCard) {
  for (const action of card.actions) {
    const payload = isRecord(action.payload) ? action.payload : {};
    const value =
      primitiveIdentityString(payload.approvalId) ??
      primitiveIdentityString(payload.approval_id) ??
      primitiveIdentityString(action.id);
    if (value) return value;
  }
  return null;
}

function approvalIdFromCardData(card: SchemaDrivenAssistantCard) {
  const approval = isRecord(card.data.approval) ? card.data.approval : {};
  return (
    firstPrimitiveFromSources(approvalIdentitySources(card), ['approvalId', 'approval_id']) ??
    primitiveIdentityString(approval.id)
  );
}

function choosePreferredInlineApproval(
  existing: InlineApprovalCandidate | null,
  next: InlineApprovalCandidate,
) {
  if (!existing) return next;
  return next.priority >= existing.priority ? next : existing;
}

function approvalCardPriority(card: SchemaDrivenAssistantCard) {
  const text = approvalCardSearchText(card);
  if (/send|message|invite|opener|发送|私信|邀请|开场白/.test(text)) return 50;
  if (/connect|friend|candidate|加好友|好友|连接|候选/.test(text)) return 40;
  if (/publish|social_request|activity|meet|location|发现|发布|活动|约练|位置/.test(text)) {
    return 30;
  }
  return 10;
}

function actionTypeFromApprovalText(card: SchemaDrivenAssistantCard) {
  const text = approvalCardSearchText(card);
  if (/send|message|invite|发送|私信|邀请/.test(text)) return 'send_invite';
  if (/connect|friend|candidate|加好友|好友|连接|候选/.test(text)) return 'connect_candidate';
  if (/publish|social_request|activity|meet|发现|发布|活动|约练/.test(text)) {
    return 'publish_social_request';
  }
  return 'approval_required';
}

function inlineApprovalActionKeyForApprovalCard(
  card: SchemaDrivenAssistantCard,
  hostCard: SchemaDrivenAssistantCard | undefined,
) {
  const text = approvalCardSearchText(card);
  if (hostCard?.schemaType === 'social_match.activity') {
    return /publish|social_request|发现|发布/.test(text)
      ? 'publish_to_discover'
      : 'activity.confirm_create';
  }
  if (/send|message|invite|opener|发送|私信|邀请|开场白/.test(text)) return 'opener.confirm_send';
  if (/connect|friend|candidate|加好友|好友|连接|候选/.test(text)) return 'candidate.connect';
  if (/publish|social_request|activity|meet|发现|发布|活动|约练/.test(text)) {
    return /publish|social_request|发现|发布/.test(text)
      ? 'publish_to_discover'
      : 'activity.confirm_create';
  }
  return 'candidate.connect';
}

function isLowRiskApprovalCard(card: SchemaDrivenAssistantCard) {
  const actionType = approvalCardActionType(card);
  if (isLowRiskApprovalActionType(actionType)) return true;
  return isLowRiskApprovalText(approvalCardSearchText(card));
}

function approvalCardActionType(card: SchemaDrivenAssistantCard) {
  return firstPrimitiveFromSources(approvalIdentitySources(card), [
    'schemaAction',
    'actionType',
    'action',
  ]);
}

function approvalCardSearchText(card: SchemaDrivenAssistantCard) {
  const approval = isRecord(card.data.approval) ? card.data.approval : {};
  const sources = approvalIdentitySources(card);
  const sourceValues = sources.flatMap((source) => [
    source.actionType,
    source.action,
    source.schemaAction,
    source.riskLevel,
    source.risk_level,
    source.summary,
    source.boundary,
    source.confirmationLabel,
    source.candidateRecordId,
    source.socialRequestCandidateId,
    source.targetUserId,
    source.candidateUserId,
    source.userId,
    source.opportunityId,
    source.activityId,
    source.publicIntentId,
    source.socialRequestId,
    source.taskId,
  ]);
  return [
    card.id,
    card.title,
    card.body,
    card.type,
    card.status,
    card.data.actionType,
    card.data.action,
    card.data.riskLevel,
    card.data.summary,
    card.data.boundary,
    card.data.confirmationLabel,
    card.data.candidateRecordId,
    card.data.targetUserId,
    card.data.opportunityId,
    approval.id,
    approval.title,
    approval.actionType,
    approval.action,
    approval.riskLevel,
    approval.boundary,
    approval.summary,
    approval.confirmationLabel,
    ...sourceValues,
  ]
    .map((value) => publicString(value))
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase();
}

function cardIdentityKeys(card: SchemaDrivenAssistantCard): string[] {
  const keys = new Set<string>();
  const add = (prefix: string, value: unknown) => {
    const text = primitiveIdentityString(value);
    if (text) keys.add(`${prefix}:${text}`);
  };
  add('id', card.id);
  const approval = isRecord(card.data.approval) ? card.data.approval : {};
  for (const source of approvalIdentitySources(card)) {
    add('approval', source.approvalId);
    add('approval', source.approval_id);
    add('checkpoint', source.checkpointId);
    add('checkpoint', source.checkpoint_id);
  }
  add('approval', approval.id);
  const actionType = approvalCardActionType(card);
  const candidateKeys = candidateCardIdentityKeys(card);
  const useCandidateOnlyKey = shouldUseCandidateOnlyCardKey(card, actionType);
  for (const key of candidateKeys) {
    if (useCandidateOnlyKey) keys.add(key);
    if (actionType) keys.add(`${key}:action:${actionType}`);
  }
  const taskId = firstPrimitiveFromSources(cardIdentitySources(card), ['taskId', 'agentTaskId']);
  const opportunityId =
    firstPrimitiveFromSources(cardIdentitySources(card), [
      'opportunityId',
      'activityId',
      'publicIntentId',
      'socialRequestId',
    ]) ??
    (isRecord(card.data.opportunity) ? primitiveIdentityString(card.data.opportunity.id) : null);
  if (taskId && opportunityId) keys.add(`opportunity:${taskId}:${opportunityId}`);
  if (keys.size === 0) keys.add(`id:${card.id}`);
  return [...keys];
}

function shouldUseCandidateOnlyCardKey(card: SchemaDrivenAssistantCard, actionType: string | null) {
  if (card.schemaType === 'safety.approval') return false;
  if (actionType && isCandidateActionResultCard(card, actionType)) return false;
  return true;
}

function isCandidateActionResultCard(card: SchemaDrivenAssistantCard, actionType: string) {
  if (
    /^(send_invite|connect_candidate|candidate\.connect|opener\.confirm_send|send_message|add_friend)$/i.test(
      actionType,
    )
  ) {
    return true;
  }
  const schemaName = primitiveIdentityString(card.data.schemaName) ?? '';
  return schemaName === 'ApprovalPanel';
}

function hostCardIdentityKeys(card: SchemaDrivenAssistantCard): string[] {
  const keys = new Set(candidateCardIdentityKeys(card));
  const add = (prefix: string, value: unknown) => {
    const text = primitiveIdentityString(value);
    if (text) keys.add(`${prefix}:${text}`);
  };
  const opportunity = isRecord(card.data.opportunity) ? card.data.opportunity : {};
  const sources = cardIdentitySources(card);
  const taskId =
    firstPrimitiveFromSources(sources, ['taskId', 'agentTaskId']) ??
    primitiveIdentityString(opportunity.taskId);
  const opportunityId =
    firstPrimitiveFromSources(sources, [
      'opportunityId',
      'activityId',
      'publicIntentId',
      'socialRequestId',
    ]) ??
    primitiveIdentityString(opportunity.id) ??
    primitiveIdentityString(opportunity.opportunityId) ??
    primitiveIdentityString(opportunity.activityId) ??
    primitiveIdentityString(opportunity.publicIntentId) ??
    primitiveIdentityString(opportunity.socialRequestId);
  if (taskId && opportunityId) keys.add(`opportunity:${taskId}:${opportunityId}`);
  add('opportunity', opportunityId);
  add('activity', card.data.activityId);
  add('activity', opportunity.activityId);
  add('public-intent', card.data.publicIntentId);
  add('public-intent', opportunity.publicIntentId);
  add('social-request', card.data.socialRequestId);
  add('social-request', opportunity.socialRequestId);
  return [...keys];
}

function candidateCardIdentityKeys(card: SchemaDrivenAssistantCard): string[] {
  const values = cardIdentitySources(card).flatMap((source) => [
    source.candidateRecordId,
    source.socialRequestCandidateId,
    source.targetUserId,
    source.candidateUserId,
    source.userId,
  ]);
  const opportunity = isRecord(card.data.opportunity) ? card.data.opportunity : {};
  values.push(
    opportunity.candidateRecordId,
    opportunity.socialRequestCandidateId,
    opportunity.targetUserId,
    opportunity.candidateUserId,
    opportunity.userId,
  );
  const candidate = isRecord(card.data.candidate) ? card.data.candidate : {};
  values.push(
    candidate.candidateRecordId,
    candidate.socialRequestCandidateId,
    candidate.targetUserId,
    candidate.candidateUserId,
    candidate.userId,
  );
  const uniqueValues = new Set(
    values
      .map((value) => primitiveIdentityString(value))
      .filter((value): value is string => Boolean(value)),
  );
  return Array.from(uniqueValues).map((value) => `candidate:${value}`);
}

function cardIdentitySources(card: SchemaDrivenAssistantCard): Record<string, unknown>[] {
  const approval = isRecord(card.data.approval) ? card.data.approval : {};
  const payload = isRecord(card.data.payload) ? card.data.payload : {};
  const approvalPayload = isRecord(approval.payload) ? approval.payload : {};
  const actionPayloads = card.actions
    .map((action) => (isRecord(action.payload) ? action.payload : null))
    .filter((value): value is Record<string, unknown> => Boolean(value));
  return [card.data, payload, approval, approvalPayload, ...actionPayloads];
}

function approvalIdentitySources(card: SchemaDrivenAssistantCard): Record<string, unknown>[] {
  return cardIdentitySources(card);
}

function firstPrimitiveFromSources(
  sources: Record<string, unknown>[],
  keys: string[],
): string | null {
  for (const source of sources) {
    for (const key of keys) {
      const value = primitiveIdentityString(source[key]);
      if (value) return value;
    }
  }
  return null;
}

function firstPublicDetailFromSources(
  sources: Record<string, unknown>[],
  keys: string[],
): string | null {
  for (const source of sources) {
    for (const key of keys) {
      const value = publicDetail(source[key]);
      if (value) return value;
    }
  }
  return null;
}

export function isCanonicalAssistantCard(card: SchemaDrivenAssistantCard): boolean {
  if (card.schemaVersion !== FITMEET_TOOL_UI_SCHEMA_VERSION) return false;
  if (!toolUISchemaTypeFromUnknown(card.schemaType)) return false;
  const dataSchemaVersion = publicString(card.data.schemaVersion);
  const dataSchemaType = toolUISchemaTypeFromUnknown(card.data.schemaType);
  if (dataSchemaVersion && dataSchemaVersion !== FITMEET_TOOL_UI_SCHEMA_VERSION) return false;
  if (dataSchemaType && dataSchemaType !== card.schemaType) return false;
  return Boolean(publicString(card.data.schemaName) || dataSchemaType);
}

export function normalizeAssistantCard(
  card: Record<string, unknown>,
  index = 0,
): SchemaDrivenAssistantCard {
  const legacyType =
    publicString(card.legacyType) ??
    publicString(card.type) ??
    publicString(card.schemaType) ??
    'generic';
  const schemaType =
    toolUISchemaTypeFromUnknown(card.schemaType) ?? schemaTypeFromLegacyCardType(legacyType);

  return {
    id: publicString(card.id) ?? `${schemaType}-${index}`,
    type: legacyType,
    schemaVersion: publicString(card.schemaVersion) ?? FITMEET_TOOL_UI_SCHEMA_VERSION,
    schemaType,
    title: publicDetail(card.title) ?? schemaDefaultTitle(schemaType),
    body: publicDetail(card.body) ?? undefined,
    status: publicString(card.status) ?? undefined,
    data: isRecord(card.data) ? card.data : {},
    actions: normalizeCardActions(card.actions),
  };
}

export function productComponentForSchemaType(
  schemaType: ToolUISchemaType,
): ToolUIProductComponent {
  if (schemaType === 'social_match.candidate') return 'CandidateCards';
  if (schemaType === 'social_match.activity') return 'OpportunityCard';
  if (
    schemaType === 'social_match.empty' ||
    schemaType === 'social_match.no_candidates' ||
    schemaType === 'social_match.privacy_guard' ||
    schemaType === 'social_match.rate_limited'
  ) {
    return 'CandidateEmptyStateCard';
  }
  if (schemaType === 'social_match.slot_completion') return 'SlotClarificationCard';
  if (schemaType === 'profile.completion') return 'ProfileCompletionCard';
  if (schemaType === 'life_graph.diff') return 'LifeGraphDiffCard';
  if (schemaType === 'meet_loop.timeline') return 'MeetLoopTimeline';
  if (schemaType === 'public_intent.application') return 'PublicIntentApplicationCard';
  if (schemaType === 'safety.approval') return 'ApprovalPanel';
  if (schemaType === 'loop.choice') return 'LoopChoiceCard';
  if (schemaType === 'clarification.binary') return 'ClarificationBinaryCard';
  if (schemaType === 'workout.intake') return 'WorkoutIntakeCard';
  if (schemaType === 'workout.draft') return 'WorkoutDraftCard';
  if (
    schemaType === 'friend.intake' ||
    schemaType === 'travel.intake' ||
    schemaType === 'travel.companion_draft'
  ) {
    return 'GenericCard';
  }
  return 'GenericCard';
}

export function summarizeToolUICardCollection(
  cards: SchemaDrivenAssistantCard[],
): ToolUICardCollectionSummary {
  const candidateCount = cards.filter(
    (card) => card.schemaType === 'social_match.candidate',
  ).length;
  const emptyCount = cards.filter(
    (card) =>
      card.schemaType === 'social_match.empty' ||
      card.schemaType === 'social_match.no_candidates' ||
      card.schemaType === 'social_match.privacy_guard' ||
      card.schemaType === 'social_match.rate_limited',
  ).length;
  const slotCompletionCount = cards.filter(
    (card) => card.schemaType === 'social_match.slot_completion',
  ).length;
  const activityCount = cards.filter((card) => card.schemaType === 'social_match.activity').length;
  const approvalCount = cards.filter((card) => card.schemaType === 'safety.approval').length;
  const lifeGraphDiffCount = cards.filter((card) => card.schemaType === 'life_graph.diff').length;
  const profileCompletionCount = cards.filter(
    (card) => card.schemaType === 'profile.completion',
  ).length;
  const meetLoopCount = cards.filter((card) => card.schemaType === 'meet_loop.timeline').length;
  const applicationCount = cards.filter(
    (card) => card.schemaType === 'public_intent.application',
  ).length;
  const loopChoiceCount = cards.filter((card) => card.schemaType === 'loop.choice').length;
  const clarificationCount = cards.filter(
    (card) => card.schemaType === 'clarification.binary',
  ).length;
  const workoutIntakeCount = cards.filter((card) => card.schemaType === 'workout.intake').length;
  const workoutDraftCount = cards.filter((card) => card.schemaType === 'workout.draft').length;
  const friendIntakeCount = cards.filter((card) => card.schemaType === 'friend.intake').length;
  const travelIntakeCount = cards.filter((card) => card.schemaType === 'travel.intake').length;
  const travelCompanionDraftCount = cards.filter(
    (card) => card.schemaType === 'travel.companion_draft',
  ).length;
  const genericCount = cards.filter((card) => card.schemaType === 'generic.card').length;
  const opportunityCount =
    candidateCount +
    activityCount +
    slotCompletionCount +
    applicationCount +
    loopChoiceCount +
    clarificationCount +
    workoutIntakeCount +
    workoutDraftCount +
    friendIntakeCount +
    travelIntakeCount +
    travelCompanionDraftCount;
  const components = Array.from(
    new Set(cards.map((card) => productComponentForSchemaType(card.schemaType))),
  );
  const titleParts = [
    candidateCount > 0 ? `${candidateCount} 个候选` : null,
    emptyCount > 0 ? `${emptyCount} 个下一步建议` : null,
    activityCount > 0 ? `${activityCount} 张约练卡` : null,
    slotCompletionCount > 0 ? `${slotCompletionCount} 张补充卡` : null,
    meetLoopCount > 0 ? `${meetLoopCount} 个约练进展` : null,
    applicationCount > 0 ? `${applicationCount} 条报名申请` : null,
    loopChoiceCount > 0 ? `${loopChoiceCount} 张闭环选择卡` : null,
    clarificationCount > 0 ? `${clarificationCount} 张确认卡` : null,
    workoutIntakeCount > 0 ? `${workoutIntakeCount} 张约练填写卡` : null,
    workoutDraftCount > 0 ? `${workoutDraftCount} 张约练草稿` : null,
    friendIntakeCount > 0 ? `${friendIntakeCount} 张交友占位卡` : null,
    travelIntakeCount > 0 ? `${travelIntakeCount} 张旅游填写占位卡` : null,
    travelCompanionDraftCount > 0 ? `${travelCompanionDraftCount} 张旅游搭子占位卡` : null,
    lifeGraphDiffCount > 0 ? `${lifeGraphDiffCount} 条画像建议` : null,
    profileCompletionCount > 0 ? `${profileCompletionCount} 张资料补全卡` : null,
    approvalCount > 0 ? `${approvalCount} 个待确认动作` : null,
  ].filter(Boolean);
  const title = titleParts.length > 0 ? titleParts.join(' · ') : '整理结果';
  let detail = '结果已按安全的消息卡片展示。';
  if (
    loopChoiceCount > 0 ||
    clarificationCount > 0 ||
    workoutIntakeCount > 0 ||
    workoutDraftCount > 0
  ) {
    detail = '约练闭环按选择、确认、填写和发布确认展示；资料补全不会阻断本次约练卡。';
  } else if (friendIntakeCount > 0 || travelIntakeCount > 0 || travelCompanionDraftCount > 0) {
    detail = '交友和旅游闭环已预留卡片协议，当前先以占位卡提示即将支持。';
  } else if (opportunityCount > 0) {
    detail = '候选、约练和真实动作都按结构化卡片展示；涉及连接、发送或公开时会先确认。';
  } else if (emptyCount > 0) {
    detail = '没有真实候选时，不会编造结果；你可以选择发布到发现、扩大范围或调整时间。';
  } else if (approvalCount > 0) {
    detail = '这次操作涉及真实动作或隐私边界，确认前不会自动执行。';
  } else if (lifeGraphDiffCount > 0) {
    detail = '画像变化会展示依据、冲突和撤回边界，确认后才写入长期记忆。';
  } else if (profileCompletionCount > 0) {
    detail = '先补齐当前匹配最需要的信息，生成预览并确认后才保存。';
  } else if (meetLoopCount > 0) {
    detail = '约练进展按发起、等待、改期、确认、评价和画像回写展示。';
  } else if (applicationCount > 0) {
    detail = '报名申请按结构化卡片展示；接受后才会创建会话和参与关系。';
  }

  return {
    title,
    detail,
    candidateCount,
    emptyCount,
    opportunityCount,
    approvalCount,
    lifeGraphDiffCount,
    profileCompletionCount,
    meetLoopCount,
    applicationCount,
    loopChoiceCount,
    clarificationCount,
    workoutIntakeCount,
    workoutDraftCount,
    friendIntakeCount,
    travelIntakeCount,
    travelCompanionDraftCount,
    genericCount,
    components,
  };
}

export function normalizeCardActions(value: unknown): AssistantCardAction[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((action) => {
    const rawAction = publicString(action.action);
    const schemaAction =
      toolUISchemaActionFromUnknown(action.schemaAction) ??
      toolUISchemaActionFromUnknown(rawAction) ??
      toolUISchemaActionFromLegacyAction(rawAction);
    const payload =
      schemaAction && isRecord(action.payload) ? sanitizeActionPayload(action.payload) : undefined;
    return {
      id: publicString(action.id) ?? undefined,
      label: publicDetail(action.label) ?? undefined,
      action: schemaAction ? (rawAction ?? undefined) : undefined,
      schemaAction,
      requiresConfirmation:
        action.requiresConfirmation === true ||
        legacyActionRequiresConfirmation(rawAction, schemaAction),
      payload: Object.keys(payload ?? {}).length > 0 ? payload : undefined,
    };
  });
}

export function schemaDefaultTitle(schemaType: ToolUISchemaType) {
  if (schemaType === 'social_match.candidate') return '候选机会';
  if (schemaType === 'social_match.activity') return '活动机会';
  if (schemaType === 'social_match.empty') return '暂时没有找到合适的人';
  if (schemaType === 'social_match.no_candidates') return '暂时没有找到合适候选';
  if (schemaType === 'social_match.privacy_guard') return '隐私安全提醒';
  if (schemaType === 'social_match.rate_limited') return '发布频率提醒';
  if (schemaType === 'social_match.slot_completion') return '补齐约练卡信息';
  if (schemaType === 'profile.completion') return '个人信息补全';
  if (schemaType === 'life_graph.diff') return '资料更新建议';
  if (schemaType === 'meet_loop.timeline') return '约练进展';
  if (schemaType === 'public_intent.application') return '约练报名申请';
  if (schemaType === 'safety.approval') return '安全确认';
  if (schemaType === 'loop.choice') return '选择要开始的闭环';
  if (schemaType === 'clarification.binary') return '确认一下';
  if (schemaType === 'workout.intake') return '填写本次约练需求';
  if (schemaType === 'workout.draft') return '约练卡草稿';
  if (schemaType === 'friend.intake') return '交友闭环即将支持';
  if (schemaType === 'travel.intake') return '旅游闭环即将支持';
  if (schemaType === 'travel.companion_draft') return '旅游搭子草稿即将支持';
  return '整理结果';
}

export function toolUISchemaTypeFromUnknown(value: unknown): ToolUISchemaType | undefined {
  const text = publicString(value);
  if (
    text === 'social_match.candidate' ||
    text === 'social_match.activity' ||
    text === 'social_match.empty' ||
    text === 'social_match.no_candidates' ||
    text === 'social_match.privacy_guard' ||
    text === 'social_match.rate_limited' ||
    text === 'social_match.slot_completion' ||
    text === 'profile.completion' ||
    text === 'life_graph.diff' ||
    text === 'meet_loop.timeline' ||
    text === 'public_intent.application' ||
    text === 'safety.approval' ||
    text === 'loop.choice' ||
    text === 'clarification.binary' ||
    text === 'workout.intake' ||
    text === 'workout.draft' ||
    text === 'friend.intake' ||
    text === 'travel.intake' ||
    text === 'travel.companion_draft' ||
    text === 'generic.card'
  ) {
    return text;
  }
  return undefined;
}

export function toolUISchemaActionFromUnknown(value: unknown): ToolUISchemaAction | undefined {
  const text = publicString(value);
  if (
    text === 'candidate.view_detail' ||
    text === 'candidate.like' ||
    text === 'candidate.skip' ||
    text === 'candidate.feedback.good_fit' ||
    text === 'candidate.feedback.bad_fit' ||
    text === 'candidate.feedback.too_far' ||
    text === 'candidate.feedback.time_mismatch' ||
    text === 'candidate.feedback.style_mismatch' ||
    text === 'candidate.connect' ||
    text === 'matching.relax_distance' ||
    text === 'matching.relax_time' ||
    text === 'matching.relax_tags' ||
    text === 'candidate.generate_opener' ||
    text === 'candidate.more_like_this' ||
    text === 'opener.confirm_send' ||
    text === 'opener.regenerate' ||
    text === 'opener.reject' ||
    text === 'publish_to_discover' ||
    text === 'social_intent.decline_publish' ||
    text === 'social_intent.dismiss' ||
    text === 'social_intent.retry_publish' ||
    text === 'activity.view_detail' ||
    text === 'activity.confirm_create' ||
    text === 'activity.modify_time' ||
    text === 'activity.modify_location' ||
    text === 'activity.skip_publish' ||
    text === 'activity.check_in' ||
    text === 'activity.complete' ||
    text === 'activity.upload_proof' ||
    text === 'review.submit' ||
    text === 'life_graph.accept_update' ||
    text === 'life_graph.reject_update' ||
    text === 'meet_loop.resume' ||
    text === 'meet_loop.reschedule' ||
    text === 'safety.approve' ||
    text === 'safety.reject' ||
    text === 'slot_completion.use_default_safety' ||
    text === 'slot_completion.custom_safety' ||
    text === 'slot_completion.cancel' ||
    text === 'loop_choice.workout' ||
    text === 'loop_choice.friend' ||
    text === 'loop_choice.travel' ||
    text === 'clarification.yes' ||
    text === 'clarification.no' ||
    text === 'workout_intake.submit' ||
    text === 'workout_intake.use_defaults' ||
    text === 'workout_intake.cancel' ||
    text === 'workout_draft.publish' ||
    text === 'workout_draft.private_match' ||
    text === 'workout_draft.edit' ||
    text === 'workout_draft.cancel' ||
    text === 'public_intent_application.accept' ||
    text === 'public_intent_application.reject' ||
    text === 'public_intent_application.view_profile' ||
    text === 'public_intent_application.open_conversation'
  ) {
    return text;
  }
  return undefined;
}

function toolUISchemaActionFromLegacyAction(value: string | null): ToolUISchemaAction | undefined {
  if (!value) return undefined;
  if (value === 'connect_candidate') return 'candidate.connect';
  if (value === 'save_candidate') return 'candidate.like';
  if (value === 'dislike_candidate') return 'candidate.skip';
  if (value === 'generate_opener') return 'candidate.generate_opener';
  if (value === 'reject_opener') return 'opener.reject';
  if (value === 'see_more') return 'candidate.more_like_this';
  if (value === 'expand_radius') return 'candidate.more_like_this';
  if (value === 'relax_preference') return 'candidate.more_like_this';
  if (value === 'matching.relax_distance') return 'matching.relax_distance';
  if (value === 'matching.relax_time') return 'matching.relax_time';
  if (value === 'matching.relax_tags') return 'matching.relax_tags';
  if (value === 'send_message') return 'opener.confirm_send';
  if (value === 'view_activity') return 'activity.view_detail';
  if (value === 'publish_social_request') return 'publish_to_discover';
  if (value === 'publish_to_discover') return 'publish_to_discover';
  if (value === 'workout_draft.publish') return 'workout_draft.publish';
  if (value === 'create_activity') return 'activity.confirm_create';
  if (value === 'modify_activity') return 'activity.modify_time';
  if (value === 'change_time') return 'activity.modify_time';
  if (
    value === 'skip_publish' ||
    value === 'activity.skip_publish' ||
    value === 'decline_publish' ||
    value === 'dismiss_draft'
  ) {
    return 'social_intent.decline_publish';
  }
  if (value === 'check_in') return 'activity.check_in';
  if (value === 'submit_review') return 'review.submit';
  if (value === 'upload_proof') return 'activity.upload_proof';
  if (value === 'confirm_profile_update') return 'life_graph.accept_update';
  if (value === 'accept_public_intent_application' || value === 'application.accept') {
    return 'public_intent_application.accept';
  }
  if (value === 'reject_public_intent_application' || value === 'application.reject') {
    return 'public_intent_application.reject';
  }
  if (value === 'view_application_profile' || value === 'application.view_profile') {
    return 'public_intent_application.view_profile';
  }
  if (value === 'open_application_conversation' || value === 'application.open_conversation') {
    return 'public_intent_application.open_conversation';
  }
  return undefined;
}

function legacyActionRequiresConfirmation(
  rawAction: string | null,
  schemaAction: ToolUISchemaAction | undefined,
) {
  return (
    rawAction === 'connect_candidate' ||
    rawAction === 'send_message' ||
    rawAction === 'publish_social_request' ||
    rawAction === 'publish_to_discover' ||
    rawAction === 'workout_draft.publish' ||
    rawAction === 'create_activity' ||
    rawAction === 'confirm_profile_update' ||
    schemaAction === 'candidate.connect' ||
    schemaAction === 'opener.confirm_send' ||
    schemaAction === 'publish_to_discover' ||
    schemaAction === 'workout_draft.publish' ||
    schemaAction === 'activity.confirm_create' ||
    schemaAction === 'life_graph.accept_update' ||
    schemaAction === 'public_intent_application.accept'
  );
}

export function schemaTypeFromLegacyCardType(type: string): ToolUISchemaType {
  if (type === 'candidate_card') return 'social_match.candidate';
  if (type === 'candidate_empty_state') return 'social_match.empty';
  if (type === 'activity_plan' || type === 'activity_status') return 'social_match.activity';
  if (type === 'profile_proposal' || type === 'audit_update') return 'life_graph.diff';
  if (type === 'checkin_card' || type === 'meet_loop_timeline' || type === 'review_card') {
    return 'meet_loop.timeline';
  }
  if (type === 'public_intent_application_card') return 'public_intent.application';
  if (type === 'opener_approval' || type === 'safety_boundary') return 'safety.approval';
  return 'generic.card';
}

export function defaultOpportunityActionsForSchema(
  schemaType: ToolUISchemaType,
): DefaultOpportunityActionStep[] {
  if (schemaType === 'social_match.candidate') {
    return [
      { schemaAction: 'candidate.view_detail', requiresConfirmation: false, source: 'default' },
      { schemaAction: 'candidate.like', requiresConfirmation: false, source: 'default' },
      {
        schemaAction: 'candidate.feedback.good_fit',
        requiresConfirmation: false,
        source: 'default',
      },
      {
        schemaAction: 'candidate.feedback.bad_fit',
        requiresConfirmation: false,
        source: 'default',
      },
      {
        schemaAction: 'candidate.feedback.too_far',
        requiresConfirmation: false,
        source: 'default',
      },
      {
        schemaAction: 'candidate.feedback.time_mismatch',
        requiresConfirmation: false,
        source: 'default',
      },
      {
        schemaAction: 'candidate.feedback.style_mismatch',
        requiresConfirmation: false,
        source: 'default',
      },
      { schemaAction: 'candidate.generate_opener', requiresConfirmation: false, source: 'default' },
      { schemaAction: 'opener.confirm_send', requiresConfirmation: true, source: 'default' },
      { schemaAction: 'candidate.connect', requiresConfirmation: true, source: 'default' },
    ];
  }
  if (schemaType === 'social_match.activity') {
    return [
      { schemaAction: 'publish_to_discover', requiresConfirmation: true, source: 'default' },
      { schemaAction: 'activity.modify_time', requiresConfirmation: false, source: 'default' },
      {
        schemaAction: 'social_intent.decline_publish',
        requiresConfirmation: false,
        source: 'default',
      },
    ];
  }
  if (schemaType === 'public_intent.application') {
    return [
      {
        schemaAction: 'public_intent_application.accept',
        requiresConfirmation: true,
        source: 'default',
      },
      {
        schemaAction: 'public_intent_application.reject',
        requiresConfirmation: false,
        source: 'default',
      },
      {
        schemaAction: 'public_intent_application.view_profile',
        requiresConfirmation: false,
        source: 'default',
      },
      {
        schemaAction: 'public_intent_application.open_conversation',
        requiresConfirmation: false,
        source: 'default',
      },
    ];
  }
  if (schemaType === 'social_match.empty') {
    return [
      { schemaAction: 'publish_to_discover', requiresConfirmation: true, source: 'default' },
      { schemaAction: 'candidate.more_like_this', requiresConfirmation: false, source: 'default' },
      { schemaAction: 'activity.modify_time', requiresConfirmation: false, source: 'default' },
    ];
  }
  if (schemaType === 'social_match.no_candidates') {
    return [
      { schemaAction: 'matching.relax_distance', requiresConfirmation: false, source: 'default' },
      { schemaAction: 'matching.relax_time', requiresConfirmation: false, source: 'default' },
      { schemaAction: 'matching.relax_tags', requiresConfirmation: false, source: 'default' },
      { schemaAction: 'activity.modify_time', requiresConfirmation: false, source: 'default' },
      {
        schemaAction: 'social_intent.decline_publish',
        requiresConfirmation: false,
        source: 'default',
      },
    ];
  }
  return [];
}

export function normalizeCandidateEmptyStateView(
  card: SchemaDrivenAssistantCard,
): CandidateEmptyStateView {
  const recoveryOptions = normalizeCandidateEmptyRecoveryOptions(card.data.recoveryOptions);
  return {
    title: card.title || '暂时没有找到合适的人',
    summary:
      card.body ??
      publicDetail(card.data.summary) ??
      '这次没有找到真实、公开可发现且符合安全边界的人；我不会用假候选凑数。',
    criteria: publicStringArray(card.data.criteria).slice(0, 5),
    recoveryOptions,
    safetyBoundary:
      publicDetail(card.data.safetyBoundary) ??
      '不会编造候选；发送邀请、公开位置或交换联系方式前必须确认。',
    nextBestStep:
      publicDetail(card.data.nextBestStep) ?? '建议先发布到发现，或放宽范围后重新搜索。',
  };
}

export function normalizePublicIntentApplicationView(
  card: SchemaDrivenAssistantCard,
): PublicIntentApplicationView {
  const application = isRecord(card.data.application) ? card.data.application : {};
  const applicant = isRecord(card.data.applicant) ? card.data.applicant : {};
  const publicIntent = isRecord(card.data.publicIntent) ? card.data.publicIntent : {};
  const status =
    publicString(card.data.status) ?? publicString(application.status) ?? 'pending';
  const applicantUserId = firstPublicPrimitive(
    card.data.applicantUserId,
    application.applicantUserId,
    applicant.userId,
    applicant.id,
  );
  const applicantName =
    publicDetail(card.data.applicantName) ??
    publicDetail(application.applicantName) ??
    publicDetail(applicant.displayName) ??
    publicDetail(applicant.name) ??
    (applicantUserId !== null ? `用户 ${String(applicantUserId)}` : '申请人');
  const publicIntentId =
    publicString(card.data.publicIntentId) ?? publicString(application.publicIntentId);
  const conversationId =
    publicString(card.data.conversationId) ?? publicString(application.conversationId);
  const messagesHref =
    firstSafePublicApplicationHref(card.data.messagesHref, application.messagesHref) ??
    (conversationId ? `/messages?conversationId=${encodeURIComponent(conversationId)}` : null);
  const profileHref =
    firstSafePublicApplicationHref(
      card.data.profileHref,
      card.data.userHref,
      application.profileHref,
      applicant.profileHref,
    ) ?? (applicantUserId !== null ? `/user/${encodeURIComponent(String(applicantUserId))}` : null);

  return {
    applicationId: firstPublicPrimitive(card.data.applicationId, application.id),
    publicIntentId,
    applicantUserId,
    applicantName,
    publicIntentTitle:
      publicDetail(card.data.publicIntentTitle) ??
      publicDetail(publicIntent.title) ??
      publicDetail(application.publicIntentTitle) ??
      card.title,
    message:
      publicDetail(card.data.message) ??
      publicDetail(application.message) ??
      card.body ??
      '对方想加入你发布的约练卡。',
    status,
    statusLabel: publicIntentApplicationStatusLabel(status),
    meetId: firstPublicPrimitive(card.data.meetId, application.meetId),
    profileHref,
    messagesHref,
    conversationId,
    safetyBoundary:
      publicDetail(card.data.safetyBoundary) ??
      '接受后才会创建站内会话；不会公开手机号、微信或精确位置。',
  };
}

export function normalizeCandidateOpportunityView(
  card: SchemaDrivenAssistantCard,
): CandidateOpportunityView {
  const opportunity = isRecord(card.data.opportunity) ? card.data.opportunity : {};
  const score = publicNumber(opportunity.score ?? card.data.matchScore ?? card.data.score);
  const name =
    publicDetail(opportunity.name) ??
    publicDetail(card.data.displayName) ??
    publicDetail(card.data.name) ??
    card.title;
  const title = publicDetail(opportunity.title) ?? name;
  const summary =
    publicDetail(opportunity.summary) ??
    publicDetail(card.data.recommendationLine) ??
    publicDetail(card.data.summary) ??
    card.body ??
    '已整理出一个候选机会。';
  const confirmedContext = opportunityConfirmedContext(opportunity, card.data);

  return {
    name,
    title,
    subtitle:
      publicDetail(opportunity.subtitle) ??
      publicDetail(card.data.subtitle) ??
      publicDetail(opportunity.regionLine) ??
      publicDetail(card.data.regionLine) ??
      publicDetail(card.data.contextLine),
    avatarUrl:
      publicString(opportunity.avatarUrl) ??
      publicString(card.data.avatarUrl) ??
      publicString(card.data.imageUrl),
    score,
    summary,
    relationshipGoal:
      publicDetail(opportunity.relationshipGoal) ??
      publicDetail(opportunity.relationGoal) ??
      publicDetail(opportunity.goal) ??
      publicDetail(card.data.relationshipGoal) ??
      publicDetail(card.data.relationGoal) ??
      publicDetail(card.data.targetRelationship),
    idealType:
      publicDetail(opportunity.idealType) ??
      publicDetail(opportunity.targetPreference) ??
      publicDetail(opportunity.preference) ??
      publicDetail(card.data.idealType) ??
      publicDetail(card.data.targetPreference) ??
      publicDetail(card.data.preferenceLine),
    invitePolicy:
      publicDetail(opportunity.invitePolicy) ??
      publicDetail(opportunity.contactPolicy) ??
      publicDetail(card.data.invitePolicy) ??
      publicDetail(card.data.contactPolicy) ??
      (hasConfirmRequiredAction(card.actions) ? '发送邀请前需要你确认' : null),
    confirmedContext,
    area:
      publicDetail(opportunity.area) ??
      publicDetail(opportunity.region) ??
      publicDetail(opportunity.safeArea) ??
      publicDetail(card.data.area) ??
      publicDetail(card.data.region) ??
      publicDetail(card.data.safeArea) ??
      publicDetail(card.data.city),
    time:
      publicDetail(opportunity.time) ??
      publicDetail(card.data.timePreference) ??
      publicDetail(card.data.whyNow),
    distanceLabel: candidateDistanceLabel(opportunity, card.data),
    interests: publicStringArray(
      opportunity.interests ??
        opportunity.interestTags ??
        card.data.sharedInterests ??
        card.data.commonInterests ??
        card.data.interests ??
        card.data.interestTags ??
        card.data.tags,
    ).slice(0, 5),
    safetyBadges: publicStringArray(
      opportunity.safetyBadges ??
        opportunity.privacySignals ??
        opportunity.safetySignals ??
        card.data.safetyBadges ??
        card.data.privacySignals ??
        card.data.safetySignals,
    ).slice(0, 4),
    reasons: publicStringArray(
      opportunity.reasons ?? card.data.fitReasons ?? card.data.matchReasons,
    ).slice(0, 4),
    explanationSteps: candidateExplanationSteps(opportunity, card.data),
    rankingBreakdown: normalizeCandidateRankingBreakdown(
      opportunity.rankingBreakdown ?? card.data.rankingBreakdown,
    ),
    trustSignals: candidateTrustSignals(opportunity, card.data, confirmedContext),
    coldStartSignals: publicStringArray(
      opportunity.coldStartSignals ?? card.data.coldStartSignals,
    ).slice(0, 4),
    discoverySafetySignals: candidateDiscoverySafetySignals(opportunity, card.data, card.actions),
    recommendationProtocol: candidateRecommendationProtocol(opportunity, card.data, card.actions),
    recentPublicActivity: publicStringArray(
      opportunity.recentPublicActivity ??
        opportunity.publicActivity ??
        opportunity.publicSignals ??
        card.data.recentPublicActivity ??
        card.data.publicActivity ??
        card.data.publicSignals,
    ).slice(0, 4),
    preferenceHistorySignals: publicStringArray(
      opportunity.preferenceHistorySignals ?? card.data.preferenceHistorySignals,
    ).slice(0, 3),
    whyNow:
      publicDetail(opportunity.whyNow) ??
      publicDetail(card.data.whyNow) ??
      publicDetail(card.data.privateReason),
    openerStrategy:
      publicDetail(opportunity.openerStrategy) ??
      publicDetail(card.data.openerStrategy) ??
      publicDetail(card.data.openerHint),
    suggestedOpener:
      publicDetail(opportunity.suggestedOpener) ??
      publicDetail(opportunity.openerPreview) ??
      publicDetail(opportunity.openingLine) ??
      publicDetail(opportunity.messageDraft) ??
      publicDetail(opportunity.openerDraft) ??
      publicDetail(card.data.suggestedOpener) ??
      publicDetail(card.data.openerPreview) ??
      publicDetail(card.data.openingLine) ??
      publicDetail(card.data.messageDraft) ??
      publicDetail(card.data.openerDraft),
    recommendedNextAction:
      publicDetail(opportunity.recommendedNextAction) ??
      publicDetail(card.data.recommendedNextAction),
    safetyBoundary:
      publicDetail(opportunity.safetyBoundary) ??
      publicDetail(opportunity.safeBoundary) ??
      publicDetail(opportunity.safetyLine) ??
      publicDetail(card.data.safetyBoundary) ??
      publicDetail(card.data.safeBoundary) ??
      publicDetail(card.data.safetyLine),
    reasoningQuality: candidateReasoningQuality(opportunity, card.data),
  };
}

function candidateReasoningQuality(
  primary: Record<string, unknown>,
  fallback: Record<string, unknown>,
): CandidateReasoningQualityView {
  const reasoner = firstRecord(
    primary.reasoner,
    primary.matchReasoner,
    primary.candidateExplanation,
    primary.explanation,
    fallback.reasoner,
    fallback.matchReasoner,
    fallback.candidateExplanation,
    fallback.explanation,
  );
  const degraded =
    publicBoolean(primary.degraded) ??
    publicBoolean(primary.reasoningDegraded) ??
    publicBoolean(fallback.degraded) ??
    publicBoolean(fallback.reasoningDegraded) ??
    publicBoolean(reasoner?.degraded) ??
    false;
  const retryable =
    publicBoolean(primary.retryable) ??
    publicBoolean(primary.reasoningRetryable) ??
    publicBoolean(fallback.retryable) ??
    publicBoolean(fallback.reasoningRetryable) ??
    publicBoolean(reasoner?.retryable) ??
    false;
  const source =
    publicString(primary.reasonerSource) ??
    publicString(primary.explanationSource) ??
    publicString(fallback.reasonerSource) ??
    publicString(fallback.explanationSource) ??
    publicString(reasoner?.source) ??
    publicString(reasoner?.reasonerSource);
  const confidence =
    publicNumber(primary.reasoningConfidence) ??
    publicNumber(fallback.reasoningConfidence) ??
    publicNumber(reasoner?.confidence);

  return {
    degraded,
    retryable,
    source,
    confidence,
    label: degraded ? '我先用公开资料保守推荐' : null,
    detail: degraded ? '更细的个性化解释稍后可重试；发送邀请前仍会等你确认。' : null,
    actionLabel: degraded && retryable ? '可稍后重新生成推荐解释' : null,
  };
}

function candidateTrustSignals(
  primary: Record<string, unknown>,
  fallback: Record<string, unknown>,
  confirmedContext: string[],
) {
  const explicit = publicStringArray(
    primary.trustSignals ??
      primary.consentSignals ??
      fallback.trustSignals ??
      fallback.consentSignals ?? [
        isRecord(primary.recommendationConsent)
          ? primary.recommendationConsent.sourceLabel
          : undefined,
        isRecord(primary.recommendationConsent)
          ? primary.recommendationConsent.privacyLabel
          : undefined,
        isRecord(primary.recommendationConsent)
          ? primary.recommendationConsent.strangerPolicyLabel
          : undefined,
        isRecord(fallback.recommendationConsent)
          ? fallback.recommendationConsent.sourceLabel
          : undefined,
        isRecord(fallback.recommendationConsent)
          ? fallback.recommendationConsent.privacyLabel
          : undefined,
        isRecord(fallback.recommendationConsent)
          ? fallback.recommendationConsent.strangerPolicyLabel
          : undefined,
      ],
  ).slice(0, 4);
  if (explicit.length > 0) return explicit;

  const signals = [
    publicDetail(primary.relationshipGoal) ??
      publicDetail(primary.relationGoal) ??
      publicDetail(fallback.relationshipGoal) ??
      publicDetail(fallback.targetRelationship),
    publicDetail(primary.idealType) ??
      publicDetail(primary.targetPreference) ??
      publicDetail(fallback.idealType) ??
      publicDetail(fallback.targetPreference),
    ...confirmedContext,
  ]
    .filter(Boolean)
    .map((value) => `参考已确认偏好：${value}`);

  return Array.from(new Set(signals)).slice(0, 4);
}

function normalizeCandidateRecommendationProtocol(
  value: unknown,
): CandidateRecommendationProtocolItemView[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item, index) => {
      const label = publicDetail(item.label);
      const detail = publicDetail(item.detail ?? item.value ?? item.description);
      if (!label || !detail) return null;
      return {
        key: publicString(item.key) ?? `protocol-${index}`,
        label,
        detail,
      };
    })
    .filter((item): item is CandidateRecommendationProtocolItemView => Boolean(item))
    .slice(0, 5);
}

function normalizeCandidateEmptyRecoveryOptions(
  value: unknown,
): CandidateEmptyStateRecoveryOptionView[] {
  if (!Array.isArray(value)) return defaultCandidateEmptyRecoveryOptions();
  const options = value
    .filter(isRecord)
    .map((item, index) => {
      const label = publicDetail(item.label);
      const detail = publicDetail(item.detail ?? item.value ?? item.description);
      if (!label || !detail) return null;
      return {
        key: publicString(item.key) ?? `recovery-${index}`,
        label,
        detail,
        requiresConfirmation: item.requiresConfirmation === true,
      };
    })
    .filter((item): item is CandidateEmptyStateRecoveryOptionView => Boolean(item))
    .slice(0, 4);
  return options.length > 0 ? options : defaultCandidateEmptyRecoveryOptions();
}

function defaultCandidateEmptyRecoveryOptions(): CandidateEmptyStateRecoveryOptionView[] {
  return [
    {
      key: 'publish_to_discover',
      label: '确认发布',
      detail: '让公开可发现的人看到你的约练卡；发布前仍需要确认。',
      requiresConfirmation: true,
    },
    {
      key: 'expand_radius',
      label: '扩大范围',
      detail: '扩大同城范围后继续搜索真实公开资料。',
      requiresConfirmation: false,
    },
    {
      key: 'change_time',
      label: '换个时间',
      detail: '保留活动和地点，把时间换成更容易匹配的窗口。',
      requiresConfirmation: false,
    },
    {
      key: 'relax_preference',
      label: '放宽偏好',
      detail: '保留安全边界，先放宽非必要偏好再搜索。',
      requiresConfirmation: false,
    },
  ];
}

function publicIntentApplicationStatusLabel(status: string) {
  if (status === 'accepted') return '已接受';
  if (status === 'rejected') return '已拒绝';
  if (status === 'cancelled') return '已取消';
  return '待处理';
}

function firstSafePublicApplicationHref(...values: unknown[]): string | null {
  for (const value of values) {
    const href = publicString(value);
    if (!href) continue;
    if (
      href.startsWith('/user/') ||
      href.startsWith('/messages?') ||
      href === '/messages' ||
      href.startsWith('/public-intent/')
    ) {
      return href;
    }
  }
  return null;
}

function candidateRecommendationProtocol(
  primary: Record<string, unknown>,
  fallback: Record<string, unknown>,
  actions: AssistantCardAction[],
): CandidateRecommendationProtocolItemView[] {
  const explicit = normalizeCandidateRecommendationProtocol(
    primary.recommendationProtocol ?? fallback.recommendationProtocol,
  );
  if (explicit.length > 0) return explicit;

  return [
    {
      key: 'source',
      label: '可见来源',
      detail: '只基于公开可发现或已允许 Agent 匹配的信息整理。',
    },
    {
      key: 'privacy',
      label: '资料边界',
      detail: '默认展示脱敏资料和模糊区域，不展示精确位置或私密联系方式。',
    },
    {
      key: 'touch',
      label: '触达边界',
      detail: hasConfirmRequiredAction(actions)
        ? '发送邀请、加好友或创建活动前必须由你确认。'
        : '不会自动触达对方；如果下一步涉及发送或连接，会先让你确认。',
    },
    {
      key: 'recovery',
      label: '可以继续',
      detail: '你可以跳过、重试生成开场白，或从确认点继续。',
    },
  ];
}

function candidateDiscoverySafetySignals(
  primary: Record<string, unknown>,
  fallback: Record<string, unknown>,
  actions: AssistantCardAction[],
) {
  const explicit = publicStringArray(
    primary.discoverySafetySignals ?? fallback.discoverySafetySignals,
  ).slice(0, 5);
  if (explicit.length > 0) return explicit;

  const signals = [
    '仅整理公开可发现或已授权匹配的信息',
    '资料默认脱敏，不展示精确位置或私密联系方式',
    hasConfirmRequiredAction(actions) ? '发送邀请前必须确认' : '涉及真实触达时必须确认',
    '可跳过、重试或从确认点恢复',
  ];
  return Array.from(new Set(signals)).slice(0, 5);
}

function normalizeCandidateRankingBreakdown(value: unknown): CandidateRankingBreakdownItemView[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item, index) => {
      const label = publicDetail(item.label);
      const reason = publicDetail(item.reason);
      if (!label || !reason) return null;
      return {
        key: publicString(item.key) ?? `ranking-${index}`,
        label,
        score: publicNumber(item.score),
        reason,
      };
    })
    .filter((item): item is CandidateRankingBreakdownItemView => Boolean(item))
    .slice(0, 5);
}

function hasConfirmRequiredAction(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((item) => isRecord(item) && item.requiresConfirmation === true);
}

function candidateExplanationSteps(
  primary: Record<string, unknown>,
  fallback: Record<string, unknown>,
) {
  const explicit = publicStringArray(
    primary.explanationSteps ??
      primary.traceSummary ??
      fallback.explanationSteps ??
      fallback.traceSummary ??
      fallback.explainability,
  )
    .map(friendlyCandidateExplanationStep)
    .slice(0, 3);
  if (explicit.length > 0) return explicit;

  const recall =
    publicDetail(primary.recallSource) ??
    publicDetail(fallback.recallSource) ??
    publicDetail(fallback.recallReason) ??
    publicDetail(fallback.sourceLine);
  const ranking =
    publicDetail(primary.rankingSignal) ??
    publicDetail(primary.rankingReason) ??
    publicDetail(fallback.rankingSignal) ??
    publicDetail(fallback.rankingReason) ??
    publicDetail(fallback.rankReason);
  const safety =
    publicDetail(primary.safetyFilter) ??
    publicDetail(primary.safetyLine) ??
    publicDetail(fallback.safetyFilter) ??
    publicDetail(fallback.safetyLine);

  return [
    recall ? `来源：${recall}` : null,
    ranking ? `匹配：${ranking}` : null,
    safety ? `安全：${safety}` : null,
  ].filter(Boolean) as string[];
}

function friendlyCandidateExplanationStep(value: string): string {
  return value
    .replace(/^召回[：:]\s*/i, '来源：')
    .replace(/^排序[：:]\s*/i, '匹配：')
    .replace(/^候选召回[：:]\s*/i, '候选来源：')
    .replace(/^rank[：:]\s*/i, '匹配：')
    .replace(/^recall[：:]\s*/i, '来源：')
    .trim();
}

function opportunityConfirmedContext(
  primary: Record<string, unknown>,
  fallback: Record<string, unknown>,
) {
  const explicit = publicStringArray(
    primary.confirmedContext ??
      primary.confirmedFields ??
      primary.requestContext ??
      fallback.confirmedContext ??
      fallback.confirmedFields ??
      fallback.requestContext ??
      fallback.clarification,
  ).slice(0, 5);
  if (explicit.length > 0) return explicit;

  const fields = [
    publicDetail(primary.city) ??
      publicDetail(primary.area) ??
      publicDetail(fallback.city) ??
      publicDetail(fallback.area),
    publicDetail(primary.time) ??
      publicDetail(fallback.timeLabel) ??
      publicDetail(fallback.timePreference),
    publicDetail(primary.activity) ??
      publicDetail(primary.activityType) ??
      publicDetail(fallback.activityType),
    publicDetail(primary.intensity) ??
      publicDetail(fallback.intensity) ??
      publicDetail(fallback.level),
    publicDetail(primary.boundary) ??
      publicDetail(primary.safetyBoundary) ??
      publicDetail(fallback.safetyBoundary),
  ].filter(Boolean) as string[];
  return Array.from(new Set(fields)).slice(0, 5);
}

export function normalizeActivityOpportunityView(
  card: SchemaDrivenAssistantCard,
): ActivityOpportunityView {
  const opportunity = isRecord(card.data.opportunity) ? card.data.opportunity : {};
  const title =
    publicDetail(opportunity.title) ??
    publicDetail(card.data.activityTitle) ??
    publicDetail(card.data.name) ??
    card.title;
  const summary =
    publicDetail(opportunity.summary) ??
    publicDetail(card.data.recommendationLine) ??
    publicDetail(card.data.whyThisActivity) ??
    card.body ??
    '这是一个适合当前需求的线下机会。';

  return {
    title,
    subtitle:
      publicDetail(opportunity.subtitle) ??
      publicDetail(card.data.subtitle) ??
      publicDetail(card.data.locationName),
    imageUrl:
      publicString(opportunity.imageUrl) ??
      publicString(card.data.coverUrl) ??
      publicString(card.data.imageUrl) ??
      publicString(card.data.posterUrl),
    confirmedContext: opportunityConfirmedContext(opportunity, card.data),
    city:
      publicDetail(opportunity.city) ??
      publicDetail(card.data.city) ??
      publicDetail(card.data.area),
    location:
      publicDetail(opportunity.location) ??
      publicDetail(opportunity.venueName) ??
      publicDetail(opportunity.spot) ??
      publicDetail(opportunity.address) ??
      publicDetail(card.data.locationName) ??
      publicDetail(card.data.location) ??
      publicDetail(card.data.venue) ??
      publicDetail(card.data.venueName) ??
      publicDetail(card.data.spot) ??
      publicDetail(card.data.address),
    time:
      publicDetail(opportunity.time) ??
      publicDetail(opportunity.timeLabel) ??
      publicDetail(opportunity.startsAtLabel) ??
      publicDetail(opportunity.startTime) ??
      publicDetail(opportunity.startsAt) ??
      publicDetail(card.data.timeLabel) ??
      publicDetail(card.data.startsAtLabel) ??
      publicDetail(card.data.startTime) ??
      publicDetail(card.data.startsAt) ??
      publicDetail(card.data.timePreference),
    capacityLabel: activityCapacityLabel(opportunity, card.data),
    intensity:
      publicDetail(opportunity.intensity) ??
      publicDetail(card.data.intensity) ??
      publicDetail(card.data.level),
    host:
      publicDetail(opportunity.host) ??
      publicDetail(card.data.hostName) ??
      publicDetail(card.data.organizerName),
    summary,
    nextAction:
      publicDetail(opportunity.nextAction) ??
      publicDetail(opportunity.recommendedNextAction) ??
      publicDetail(card.data.recommendedNextAction) ??
      publicDetail(card.data.nextAction) ??
      '查看详情后再决定是否加入或发起邀请。',
    tags: publicStringArray(
      opportunity.tags ??
        opportunity.interestTags ??
        card.data.tags ??
        card.data.interests ??
        card.data.interestTags ??
        card.data.sports,
    ).slice(0, 5),
    safetyBadges: publicStringArray(
      opportunity.safetyBadges ??
        opportunity.privacySignals ??
        card.data.safetyBadges ??
        card.data.privacySignals,
    ).slice(0, 4),
    reasons: publicStringArray(
      opportunity.reasons ?? card.data.fitReasons ?? card.data.matchReasons,
    ).slice(0, 4),
    explanationSteps: publicStringArray(
      opportunity.explanationSteps ??
        opportunity.traceSummary ??
        card.data.explanationSteps ??
        card.data.traceSummary,
    )
      .map(friendlyActivityExplanationStep)
      .slice(0, 5),
    activityProtocol: activityProtocolWithFallback(opportunity, card.data),
    safetyBoundary:
      publicDetail(opportunity.safetyBoundary) ??
      publicDetail(opportunity.safeBoundary) ??
      publicDetail(opportunity.safetyLine) ??
      publicDetail(card.data.safetyBoundary) ??
      publicDetail(card.data.safeBoundary) ??
      publicDetail(card.data.safetyLine) ??
      '优先公共场所和模糊位置，活动前后都保留确认与退出空间。',
    publishPolicy:
      publicDetail(opportunity.publishPolicy) ??
      publicDetail(opportunity.visibilityPolicy) ??
      publicDetail(card.data.publishPolicy) ??
      publicDetail(card.data.visibilityPolicy) ??
      '默认不公开发布；如果需要公开发起，我会单独征得你确认。',
    approvalPolicy:
      publicDetail(opportunity.approvalPolicy) ??
      publicDetail(opportunity.confirmationPolicy) ??
      publicDetail(card.data.approvalPolicy) ??
      publicDetail(card.data.confirmationPolicy) ??
      '创建活动、发送邀请或公开发布前必须由你确认。',
    meetLoopNextStep:
      publicDetail(opportunity.meetLoopNextStep) ??
      publicDetail(card.data.meetLoopNextStep) ??
      '确认后进入“等待回复 / 改期 / 确认到达 / 评价回写”的约练闭环。',
    checkinReminder:
      publicDetail(opportunity.checkinReminder) ??
      publicDetail(card.data.checkinReminder) ??
      '活动开始前我会提醒你确认是否到达，不会自动替你签到。',
    reviewPrompt:
      publicDetail(opportunity.reviewPrompt) ??
      publicDetail(card.data.reviewPrompt) ??
      '活动结束后我会请你做一次简短评价，再决定是否写入画像。',
    lifeGraphUpdatePreview:
      publicDetail(opportunity.lifeGraphUpdatePreview) ??
      publicDetail(card.data.lifeGraphUpdatePreview) ??
      '只有你确认后，活动结果才会作为长期偏好的更新建议。',
    trustScoreUpdatePreview:
      publicDetail(opportunity.trustScoreUpdatePreview) ??
      publicDetail(card.data.trustScoreUpdatePreview) ??
      '完成、评价和守约情况会作为后续推荐可信度的弱信号。',
    autoPublished: opportunity.autoPublished === true || card.data.autoPublished === true,
    publicIntentId:
      publicString(opportunity.publicIntentId) ?? publicString(card.data.publicIntentId),
    discoverHref: publicString(opportunity.discoverHref) ?? publicString(card.data.discoverHref),
    publicIntentHref:
      publicString(opportunity.publicIntentHref) ?? publicString(card.data.publicIntentHref),
    messagesHref: publicString(opportunity.messagesHref) ?? publicString(card.data.messagesHref),
  };
}

function activityProtocolWithFallback(
  primary: Record<string, unknown>,
  fallback: Record<string, unknown>,
): ActivityProtocolItemView[] {
  const explicit = normalizeActivityProtocol(primary.activityProtocol ?? fallback.activityProtocol);
  if (explicit.length > 0) return explicit;
  return [
    {
      key: 'public_place',
      label: '公共场所',
      detail: '优先选择公共场馆或开放路线，不默认展示精确位置。',
    },
    {
      key: 'approval',
      label: '创建确认',
      detail: '创建活动、发送邀请或公开发布前必须由你确认。',
    },
    {
      key: 'publish',
      label: '公开边界',
      detail: '默认不公开发布；如果需要公开发起，我会单独征得你确认。',
    },
    {
      key: 'recovery',
      label: '连续推进',
      detail: '确认后进入等待回复、改期、确认到达、评价和画像回写流程。',
    },
  ];
}

function normalizeActivityProtocol(value: unknown): ActivityProtocolItemView[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item, index) => {
      const label = publicDetail(item.label);
      const detail = publicDetail(item.detail ?? item.value ?? item.description);
      if (!label || !detail) return null;
      return {
        key: publicString(item.key) ?? `activity-protocol-${index}`,
        label,
        detail,
      };
    })
    .filter((item): item is ActivityProtocolItemView => Boolean(item))
    .slice(0, 5);
}

function friendlyActivityExplanationStep(value: string): string {
  return value
    .replace(/^召回[：:]\s*/i, '来源：')
    .replace(/^活动召回[：:]\s*/i, '来源：')
    .replace(/^排序[：:]\s*/i, '匹配：')
    .replace(/^rank[：:]\s*/i, '匹配：')
    .replace(/^recall[：:]\s*/i, '来源：')
    .trim();
}

export function normalizeLifeGraphDiffView(card: SchemaDrivenAssistantCard): LifeGraphDiffView {
  const diff = isRecord(card.data.diff) ? card.data.diff : {};
  const source = publicDetail(card.data.source) ?? publicDetail(diff.source);
  const currentValue =
    publicDetail(diff.currentValue) ??
    publicDetail(diff.current) ??
    publicDetail(diff.before) ??
    publicDetail(card.data.currentValue) ??
    publicDetail(card.data.before) ??
    publicDetail(card.data.current) ??
    '暂无明确记录';
  const proposedValue =
    publicDetail(diff.proposedValue) ??
    publicDetail(diff.proposed) ??
    publicDetail(diff.after) ??
    publicDetail(card.data.proposedValue) ??
    publicDetail(card.data.after) ??
    publicDetail(card.data.proposed) ??
    card.body ??
    '等待你确认后更新';

  return {
    title: (publicDetail(diff.title) ?? card.title) || '资料更新建议',
    description:
      publicDetail(diff.description) ?? '只在你确认后写入长期记忆；冲突或敏感内容会保留边界提示。',
    source,
    sourceLabel: lifeGraphSourceLabel(source),
    currentValue,
    proposedValue,
    fields: publicStringArray(diff.fields ?? card.data.proposedFields ?? card.data.fields).slice(
      0,
      6,
    ),
    conflicts: publicStringArray(
      diff.conflicts ?? card.data.conflicts ?? card.data.conflictHints,
    ).slice(0, 4),
    sensitivityLevel:
      publicDetail(diff.sensitivityLevel) ??
      publicDetail(card.data.sensitivityLevel) ??
      publicDetail(card.data.privacyLevel) ??
      publicDetail(card.data.memoryTier),
    confirmationBoundary:
      publicDetail(diff.confirmationBoundary) ??
      publicDetail(card.data.confirmationBoundary) ??
      publicDetail(card.data.memoryBoundary) ??
      publicDetail(card.data.userConfirmation),
    privacyBoundary:
      publicDetail(diff.privacyBoundary) ??
      publicDetail(card.data.privacyBoundary) ??
      publicDetail(card.data.memoryBoundary),
    revokeHint:
      publicDetail(diff.revokeHint) ??
      publicDetail(card.data.revokeHint) ??
      publicDetail(card.data.correctionHint),
    sourceSignals: publicStringArray(
      diff.sourceSignals ?? card.data.sourceSignals ?? card.data.evidence,
    ).slice(0, 3),
  };
}

function lifeGraphSourceLabel(source: string | null): string {
  if (source === 'counterpart_reply') return '对方回复后的弱互动信号';
  if (source === 'meet_loop_review') return '约练完成后的评价反馈';
  if (source === 'profile_proposal') return '你确认过的画像提案';
  if (source === 'manual_correction') return '你手动修正的画像信息';
  return '待确认的画像信号';
}

export function normalizeMeetLoopTimelineView(
  card: SchemaDrivenAssistantCard,
): MeetLoopTimelineView {
  const timeline = isRecord(card.data.timeline) ? card.data.timeline : {};
  const explicitSteps = normalizeMeetLoopTimelineSteps(timeline.steps ?? card.data.steps);
  const stage =
    publicString(timeline.stage) ??
    publicString(card.data.loopStage) ??
    publicString(card.data.status) ??
    card.status;
  const steps =
    explicitSteps.length > 0
      ? mergeMeetLoopTimelineSteps(explicitSteps, stage)
      : meetLoopStages(stage);
  return {
    title: (publicDetail(timeline.title) ?? card.title) || '约练进展',
    description:
      publicDetail(timeline.description) ?? card.body ?? '我会把邀约拆成可确认、可继续的进度。',
    nextAction:
      publicDetail(timeline.nextAction) ??
      publicDetail(card.data.recommendedNextAction) ??
      publicDetail(card.data.nextAction) ??
      '下一步会等你确认后继续。',
    stage: stage ?? null,
    connectionState:
      publicDetail(card.data.connectionState) ??
      publicDetail(timeline.connectionState) ??
      publicDetail(card.data.status),
    counterpartIntent:
      publicDetail(card.data.counterpartIntent) ??
      publicDetail(card.data.replyIntent) ??
      publicDetail(timeline.counterpartIntent),
    replyIntentLabel:
      publicDetail(card.data.replyIntentLabel) ?? publicDetail(timeline.replyIntentLabel),
    replyIntentDescription:
      publicDetail(card.data.replyIntentDescription) ??
      publicDetail(timeline.replyIntentDescription),
    nextSafeStep: publicDetail(card.data.nextSafeStep) ?? publicDetail(timeline.nextSafeStep),
    waitingFor: publicDetail(card.data.waitingFor) ?? publicDetail(timeline.waitingFor),
    nextRecoverableActions: publicStringArray(
      card.data.nextRecoverableActions ?? timeline.nextRecoverableActions,
    ).slice(0, 4),
    sideEffectPolicy:
      publicDetail(card.data.sideEffectPolicy) ?? publicDetail(timeline.sideEffectPolicy),
    recoveryProtocol: normalizeMeetLoopRecoveryProtocol(
      card.data.recoveryProtocol ?? timeline.recoveryProtocol,
    ),
    replyPreview:
      publicDetail(card.data.replyPreview) ??
      publicDetail(card.data.messagePreview) ??
      publicDetail(card.data.counterpartReply),
    steps,
  };
}

function normalizeMeetLoopRecoveryProtocol(value: unknown): MeetLoopRecoveryProtocolItemView[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item, index) => {
      const label = publicDetail(item.label);
      const detail = publicDetail(item.detail ?? item.value ?? item.description);
      if (!label || !detail) return null;
      return {
        key: publicString(item.key) ?? `recovery-${index}`,
        label,
        detail,
      };
    })
    .filter((item): item is MeetLoopRecoveryProtocolItemView => Boolean(item))
    .slice(0, 4);
}

export function normalizeSafetyApprovalView(card: SchemaDrivenAssistantCard): SafetyApprovalView {
  const approval = isRecord(card.data.approval) ? card.data.approval : {};
  return {
    title: (publicDetail(approval.title) ?? card.title) || '安全确认',
    boundary:
      publicDetail(approval.boundary) ??
      publicDetail(approval.safetyBoundary) ??
      publicDetail(card.data.safetyBoundary) ??
      publicDetail(card.data.boundary) ??
      card.body ??
      '这次操作涉及真实动作，我会等你确认后再继续。',
    riskLevel:
      publicDetail(approval.riskLevel) ??
      publicDetail(approval.level) ??
      publicDetail(card.data.riskLevel) ??
      publicDetail(card.data.level),
    reasons: publicStringArray(
      approval.reasons ?? card.data.riskReasons ?? card.data.reasons,
    ).slice(0, 4),
    auditNote:
      publicApprovalNote(approval.auditNote) ??
      publicApprovalNote(card.data.auditNote) ??
      publicApprovalNote(card.data.reviewNote) ??
      publicApprovalNote(card.data.confirmationNote),
    confirmationLabel:
      publicDetail(approval.confirmationLabel) ??
      publicDetail(card.data.confirmationLabel) ??
      '你确认后才会继续',
    checkpointLabel:
      publicDetail(approval.checkpointLabel) ??
      publicDetail(card.data.checkpointLabel) ??
      '我会接着处理',
  };
}

export function normalizeGenericCardView(card: SchemaDrivenAssistantCard): GenericCardView {
  return {
    title: card.title || '整理结果',
    body:
      card.body ??
      publicDetail(card.data.summary) ??
      publicDetail(card.data.message) ??
      publicDetail(card.data.detail),
    statusLabel:
      publicDetail(card.data.statusLabel) ??
      genericStatusLabel(card.status) ??
      publicDetail(card.data.status),
    details: publicStringArray(
      card.data.details ??
        card.data.highlights ??
        card.data.items ??
        card.data.summaryLines ??
        card.data.lines,
    ).slice(0, 4),
  };
}

function publicDetail(value: unknown) {
  if (typeof value === 'string') return sanitizePublicText(value);
  if (isRecord(value)) {
    const keys = ['title', 'message', 'summary', 'detail', 'status'];
    for (const key of keys) {
      const candidate = publicString(value[key]);
      const sanitized = candidate ? sanitizePublicText(candidate) : null;
      if (sanitized) return sanitized;
    }
  }
  return null;
}

function publicApprovalNote(value: unknown) {
  const text = publicDetail(value);
  if (!text) return null;
  if (
    /\b(audit|risk|risklevel|medium|high|low|critical|idempotency|dry[-_ ]?run)\b|保存进度|审计|幂等|风险等级|风险级别|动作[：:]|等待保存点|保存点/i.test(
      text,
    )
  ) {
    return null;
  }
  return text;
}

function publicString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function primitiveIdentityString(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function firstPublicPrimitive(...values: unknown[]): string | number | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function publicStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const detail = publicDetail(item);
      if (detail) return detail;
      return typeof item === 'string' ? null : publicString(item);
    })
    .filter(Boolean) as string[];
}

function publicNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function publicBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (text === 'true') return true;
    if (text === 'false') return false;
  }
  return null;
}

function firstRecord(...values: unknown[]): Record<string, unknown> | null {
  return values.find(isRecord) ?? null;
}

function candidateDistanceLabel(
  primary: Record<string, unknown>,
  fallback: Record<string, unknown>,
) {
  const explicit =
    publicDetail(primary.distanceLabel) ??
    publicDetail(primary.distance) ??
    publicDetail(fallback.distanceLabel) ??
    publicDetail(fallback.distance);
  if (explicit) return explicit;
  const km = publicNumber(primary.distanceKm ?? fallback.distanceKm);
  if (km != null) return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(km < 10 ? 1 : 0)}km`;
  const meters = publicNumber(primary.distanceMeters ?? fallback.distanceMeters);
  if (meters != null) {
    if (meters < 1000) return `${Math.round(meters)}m`;
    const nextKm = meters / 1000;
    return `${nextKm.toFixed(nextKm < 10 ? 1 : 0)}km`;
  }
  return null;
}

function activityCapacityLabel(
  primary: Record<string, unknown>,
  fallback: Record<string, unknown>,
) {
  const explicit =
    publicDetail(primary.capacityLabel) ??
    publicDetail(primary.participantLabel) ??
    publicDetail(fallback.capacityLabel) ??
    publicDetail(fallback.participantLabel);
  if (explicit) return explicit;
  const joined =
    publicNumber(primary.joinedCount) ??
    publicNumber(primary.currentParticipants) ??
    publicNumber(primary.participantCount) ??
    publicNumber(fallback.joinedCount) ??
    publicNumber(fallback.currentParticipants) ??
    publicNumber(fallback.participantCount);
  const limit =
    publicNumber(primary.maxParticipants) ??
    publicNumber(primary.capacity) ??
    publicNumber(primary.limit) ??
    publicNumber(fallback.maxParticipants) ??
    publicNumber(fallback.capacity) ??
    publicNumber(fallback.limit);
  if (joined != null && limit != null) return `${joined}/${limit} 人`;
  if (limit != null) return `最多 ${limit} 人`;
  if (joined != null) return `${joined} 人已加入`;
  return null;
}

function genericStatusLabel(value: unknown) {
  const text = publicString(value)?.toLowerCase();
  if (!text) return null;
  if (text === 'ready' || text === 'done' || text === 'complete' || text === 'completed') {
    return '已整理';
  }
  if (text === 'running' || text === 'pending' || text === 'processing') return '处理中';
  if (text === 'failed' || text === 'error') return '可以重试';
  if (text === 'waiting') return '等待确认';
  return sanitizePublicText(value as string);
}

function normalizeMeetLoopTimelineSteps(value: unknown): MeetLoopTimelineStepView[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((step, index) => {
    const key = publicString(step.key) ?? publicString(step.id) ?? `step-${index + 1}`;
    const label = publicDetail(step.label) ?? meetLoopDefaultLabel(key);
    const state = meetLoopStageStateFromUnknown(step.state);
    return {
      key,
      label,
      state,
      description: publicDetail(step.description) ?? meetLoopStageDescription(label, state),
      actionLabel:
        publicDetail(step.actionLabel) ??
        publicDetail(step.nextAction) ??
        meetLoopStepActionLabel(key, state),
      checkpointReady:
        step.checkpointReady === true || step.canResume === true || state === 'current',
      resumeMode: meetLoopResumeModeFromUnknown(step.resumeMode ?? step.action ?? key),
    };
  });
}

function meetLoopStageStateFromUnknown(value: unknown): MeetLoopStageState {
  if (value === 'done' || value === 'current' || value === 'next') return value;
  if (value === 'completed' || value === 'complete' || value === true) return 'done';
  if (value === 'active' || value === 'running' || value === 'waiting') return 'current';
  return 'next';
}

function meetLoopStages(stage: string | null | undefined): MeetLoopTimelineStepView[] {
  const order = [
    { key: 'draft', label: '发起' },
    { key: 'sent', label: '等待回复' },
    { key: 'reschedule', label: '改期' },
    { key: 'confirmed', label: '确认' },
    { key: 'met', label: '见面' },
    { key: 'completed', label: '评价' },
    { key: 'life_graph', label: '更新资料' },
  ];
  const text = String(stage ?? '').toLowerCase();
  const activeIndex = /life|graph|trust/.test(text)
    ? 6
    : /review|completed|complete|评价/.test(text)
      ? 5
      : /met|meet|offline|checkin|check_in|checked_in|arrived|到达|签到|见面/.test(text)
        ? 4
        : /confirm|confirmed|确认/.test(text)
          ? 3
          : /reschedule|modify|改期/.test(text)
            ? 2
            : /sent|reply|waiting|等待/.test(text)
              ? 1
              : 0;
  return order.map((item, index) => {
    const state = index < activeIndex ? 'done' : index === activeIndex ? 'current' : 'next';
    return {
      ...item,
      state,
      description: meetLoopStageDescription(item.label, state),
      actionLabel: meetLoopStepActionLabel(item.key, state),
      checkpointReady: state === 'current',
      resumeMode: meetLoopResumeModeFromUnknown(item.key),
    };
  });
}

function mergeMeetLoopTimelineSteps(
  explicitSteps: MeetLoopTimelineStepView[],
  stage: string | null | undefined,
) {
  const activeExplicit = explicitSteps.find((step) => step.state === 'current');
  const base = meetLoopStages(activeExplicit?.key ?? stage);
  const explicitByKey = new Map(explicitSteps.map((step) => [step.key, step]));
  const merged = base.map((step) => ({ ...step, ...explicitByKey.get(step.key) }));
  const knownKeys = new Set(base.map((step) => step.key));
  const extras = explicitSteps.filter((step) => !knownKeys.has(step.key));
  return [...merged, ...extras];
}

function meetLoopResumeModeFromUnknown(value: unknown): MeetLoopTimelineStepView['resumeMode'] {
  const text = publicString(value)?.toLowerCase();
  if (!text) return null;
  if (/reschedule|modify|改期/.test(text)) return 'reschedule';
  if (/review|评价|completed|complete/.test(text)) return 'review';
  if (/life|graph|memory|画像|回写/.test(text)) return 'memory';
  if (/draft|sent|confirm|resume|invite|发起|等待|确认/.test(text)) return 'resume';
  return null;
}

function meetLoopStepActionLabel(key: string, state: MeetLoopStageState) {
  if (state === 'done') return '已保存';
  if (key === 'draft') return '确认后推进';
  if (key === 'sent') return '等待回复';
  if (key === 'reschedule') return '可改期';
  if (key === 'confirmed') return '确认细节';
  if (key === 'met') return '安全见面';
  if (key === 'completed') return '见面后评价';
  if (key === 'life_graph') return '确认后回写';
  if (state === 'next') return '等待前面事项';
  return '可继续';
}

function meetLoopDefaultLabel(key: string) {
  if (key === 'draft') return '发起';
  if (key === 'sent') return '等待回复';
  if (key === 'reschedule') return '改期';
  if (key === 'confirmed') return '确认';
  if (key === 'met') return '见面';
  if (key === 'completed') return '评价';
  if (key === 'life_graph') return '更新资料';
  return '下一步';
}

function meetLoopStageDescription(label: string, state: MeetLoopStageState) {
  const prefix =
    state === 'done' ? '已完成' : state === 'current' ? '当前进度' : '等待前面事项完成';
  if (label === '发起') return `${prefix}：整理邀约对象、时间和边界。`;
  if (label === '等待回复') return `${prefix}：等待对方回复，不重复打扰。`;
  if (label === '改期') return `${prefix}：双方时间不合适时再调整。`;
  if (label === '确认') return `${prefix}：确认地点、时间和安全边界。`;
  if (label === '见面') return `${prefix}：按确认后的公共场所和时间见面。`;
  if (label === '评价') return `${prefix}：见面后记录体验反馈。`;
  if (label === '更新资料') return `${prefix}：只把你确认的信息写回个人信息。`;
  return `${prefix}：继续处理这一环节。`;
}

const INTERNAL_TRACE_ID_PATTERN = new RegExp(`\\b${['trace', '[Ii]d'].join('')}\\b`, 'g');
const INTERNAL_AGENT_TRACE_PATTERN = new RegExp(`\\b${['agent', '[Tt]race'].join('')}\\b`, 'g');
const INTERNAL_NEXT_STEP_PATTERN = new RegExp(`\\b${['plan', '(n)?er'].join('')}\\b`, 'gi');
const INTERNAL_RAW_STRUCTURED_PATTERN = new RegExp(
  `\\b${['raw', '\\s+', 'JSON'].join('')}\\b`,
  'gi',
);
const INTERNAL_RAW_STRUCTURED_LOWER_PATTERN = new RegExp(
  `\\b${['raw', '\\s+', 'json'].join('')}\\b`,
);
const INTERNAL_RAW_COMPACT_PATTERN = new RegExp(`\\b${['raw', 'json'].join('')}\\b`);
const TECHNICAL_PAYLOAD_KEY_PATTERN = new RegExp(
  `^(${[
    ['trace', 'Id'].join(''),
    ['agent', 'Trace'].join(''),
    ['plan', 'ner'].join(''),
    'toolCalls?',
    'toolResults?',
    'raw',
    ['raw', 'Json'].join(''),
    'debug',
    ['st', 'ack'].join(''),
    ['structured', 'Intent'].join(''),
    'internal',
    'metadata',
    'runtime',
    'checkpoint',
  ].join('|')})$`,
  'i',
);

function sanitizePublicText(value: string) {
  const trimmed = value.trim();
  if (!trimmed || isInternalDebugText(trimmed)) return null;
  const withoutForbidden = trimmed
    .replace(/\btool[_\s-]?call(s)?\b/gi, '处理过程')
    .replace(/\btool[_\s-]?result(s)?\b/gi, '处理结果')
    .replace(INTERNAL_TRACE_ID_PATTERN, '')
    .replace(INTERNAL_AGENT_TRACE_PATTERN, '')
    .replace(INTERNAL_NEXT_STEP_PATTERN, '下一步')
    .replace(/\bcheckpoint\b/gi, '保存进度')
    .replace(/\breplay\b/gi, '重新整理')
    .replace(/\bfork\b/gi, '换一种方案')
    .replace(INTERNAL_RAW_STRUCTURED_PATTERN, '')
    .replace(/\bJSON\b/g, '数据')
    .replace(new RegExp('\\bst' + 'ack\\b', 'gi'), '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!withoutForbidden || isInternalDebugText(withoutForbidden)) return null;
  return withoutForbidden.length > 120
    ? `${withoutForbidden.slice(0, 118).trim()}…`
    : withoutForbidden;
}

function isInternalDebugText(value: string) {
  const normalized = value.toLowerCase();
  const technicalMatches = [
    new RegExp(`\\b${['trace', 'id'].join('')}\\b`),
    new RegExp(`\\b${['agent', 'trace'].join('')}\\b`),
    new RegExp(`\\b${['plan', 'ner'].join('')}\\b`),
    /\btool[_\s-]?calls?\b/,
    /\btool[_\s-]?results?\b/,
    INTERNAL_RAW_STRUCTURED_LOWER_PATTERN,
    INTERNAL_RAW_COMPACT_PATTERN,
    /\bstructuredintent\b/,
    /\bcheckpoint\b/,
    /\breplay\b/,
    /\bfork\b/,
    /\bdebug\b/,
    /\binternal\b/,
    /\bruntime\b/,
    /\brisklevel\b/,
    /\bmedium\b/,
    /\bcritical\b/,
    new RegExp('\\bst' + 'ack\\b'),
    /\bhidden[-_\w]*\b/,
    /风险等级|风险级别|动作[：:]/,
  ].filter((pattern) => pattern.test(normalized)).length;
  if (technicalMatches >= 2) return true;
  return (
    technicalMatches >= 1 &&
    !/[\u4e00-\u9fff]/.test(value) &&
    /\b(should|become|public|complete|ready|failed|pending|runtime|metadata)\b/.test(normalized)
  );
}

function sanitizeActionPayload(
  payload: Record<string, unknown>,
  depth = 0,
): Record<string, unknown> {
  if (depth > 4) return {};
  return Object.fromEntries(
    Object.entries(payload)
      .filter(([key]) => !isTechnicalPayloadKey(key))
      .map(([key, value]) => [key, sanitizePayloadValue(value, depth + 1)])
      .filter(([, value]) => value !== undefined),
  );
}

function sanitizePayloadValue(value: unknown, depth: number): unknown {
  if (value == null) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizePayloadValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (isRecord(value)) {
    return sanitizeActionPayload(value, depth);
  }
  return undefined;
}

function isTechnicalPayloadKey(key: string) {
  return TECHNICAL_PAYLOAD_KEY_PATTERN.test(key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
