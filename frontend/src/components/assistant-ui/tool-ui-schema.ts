export type ToolUISchemaType =
  | 'social_match.candidate'
  | 'social_match.activity'
  | 'life_graph.diff'
  | 'meet_loop.timeline'
  | 'safety.approval'
  | 'generic.card';

export type ToolUISchemaAction =
  | 'candidate.view_detail'
  | 'candidate.like'
  | 'candidate.skip'
  | 'candidate.connect'
  | 'candidate.generate_opener'
  | 'candidate.more_like_this'
  | 'opener.confirm_send'
  | 'opener.regenerate'
  | 'opener.reject'
  | 'activity.view_detail'
  | 'activity.confirm_create'
  | 'activity.modify_time'
  | 'activity.modify_location'
  | 'activity.check_in'
  | 'activity.complete'
  | 'activity.upload_proof'
  | 'review.submit'
  | 'life_graph.accept_update'
  | 'life_graph.reject_update'
  | 'meet_loop.resume'
  | 'meet_loop.reschedule'
  | 'safety.approve'
  | 'safety.reject';

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
  preferenceHistorySignals: string[];
  whyNow: string | null;
  openerStrategy: string | null;
  suggestedOpener: string | null;
  recommendedNextAction: string | null;
  safetyBoundary: string | null;
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
};

export type ActivityProtocolItemView = {
  key: string;
  label: string;
  detail: string;
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

export const FITMEET_TOOL_UI_SCHEMA_VERSION = 'fitmeet.tool-ui.v1';

export function extractAssistantCards(data: unknown): SchemaDrivenAssistantCard[] {
  if (!isRecord(data) || !Array.isArray(data.cards)) return [];
  return data.cards.filter(isRecord).map((card, index) => normalizeAssistantCard(card, index));
}

export function extractCanonicalAssistantCards(data: unknown): SchemaDrivenAssistantCard[] {
  if (!isRecord(data) || !Array.isArray(data.cards)) return [];
  return data.cards
    .filter(isRecord)
    .map((card, index) => normalizeAssistantCard(card, index))
    .filter((card) => isCanonicalAssistantCard(card));
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
  if (schemaType === 'life_graph.diff') return '画像更新建议';
  if (schemaType === 'meet_loop.timeline') return '约练进展';
  if (schemaType === 'safety.approval') return '安全确认';
  return '整理结果';
}

export function toolUISchemaTypeFromUnknown(value: unknown): ToolUISchemaType | undefined {
  const text = publicString(value);
  if (
    text === 'social_match.candidate' ||
    text === 'social_match.activity' ||
    text === 'life_graph.diff' ||
    text === 'meet_loop.timeline' ||
    text === 'safety.approval' ||
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
    text === 'candidate.connect' ||
    text === 'candidate.generate_opener' ||
    text === 'candidate.more_like_this' ||
    text === 'opener.confirm_send' ||
    text === 'opener.regenerate' ||
    text === 'opener.reject' ||
    text === 'activity.view_detail' ||
    text === 'activity.confirm_create' ||
    text === 'activity.modify_time' ||
    text === 'activity.modify_location' ||
    text === 'activity.check_in' ||
    text === 'activity.complete' ||
    text === 'activity.upload_proof' ||
    text === 'review.submit' ||
    text === 'life_graph.accept_update' ||
    text === 'life_graph.reject_update' ||
    text === 'meet_loop.resume' ||
    text === 'meet_loop.reschedule' ||
    text === 'safety.approve' ||
    text === 'safety.reject'
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
  if (value === 'send_message') return 'opener.confirm_send';
  if (value === 'view_activity') return 'activity.view_detail';
  if (value === 'create_activity') return 'activity.confirm_create';
  if (value === 'check_in') return 'activity.check_in';
  if (value === 'submit_review') return 'review.submit';
  if (value === 'upload_proof') return 'activity.upload_proof';
  if (value === 'confirm_profile_update') return 'life_graph.accept_update';
  return undefined;
}

function legacyActionRequiresConfirmation(
  rawAction: string | null,
  schemaAction: ToolUISchemaAction | undefined,
) {
  return (
    rawAction === 'connect_candidate' ||
    rawAction === 'send_message' ||
    rawAction === 'create_activity' ||
    rawAction === 'confirm_profile_update' ||
    schemaAction === 'candidate.connect' ||
    schemaAction === 'opener.confirm_send' ||
    schemaAction === 'activity.confirm_create' ||
    schemaAction === 'life_graph.accept_update'
  );
}

export function schemaTypeFromLegacyCardType(type: string): ToolUISchemaType {
  if (type === 'candidate_card') return 'social_match.candidate';
  if (type === 'activity_plan' || type === 'activity_status') return 'social_match.activity';
  if (type === 'profile_proposal' || type === 'audit_update') return 'life_graph.diff';
  if (type === 'checkin_card' || type === 'review_card') return 'meet_loop.timeline';
  if (type === 'opener_approval' || type === 'safety_boundary') return 'safety.approval';
  return 'generic.card';
}

export function defaultOpportunityActionsForSchema(
  schemaType: ToolUISchemaType,
): DefaultOpportunityActionStep[] {
  if (schemaType === 'social_match.candidate') {
    return [
      { schemaAction: 'candidate.view_detail', requiresConfirmation: false, source: 'default' },
      { schemaAction: 'candidate.generate_opener', requiresConfirmation: false, source: 'default' },
      { schemaAction: 'candidate.connect', requiresConfirmation: true, source: 'default' },
    ];
  }
  if (schemaType === 'social_match.activity') {
    return [
      { schemaAction: 'activity.view_detail', requiresConfirmation: false, source: 'default' },
      { schemaAction: 'activity.modify_time', requiresConfirmation: false, source: 'default' },
      { schemaAction: 'activity.modify_location', requiresConfirmation: false, source: 'default' },
      { schemaAction: 'activity.confirm_create', requiresConfirmation: true, source: 'default' },
    ];
  }
  return [];
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
      fallback.consentSignals ??
      [
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
      label: '可恢复',
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
    hasConfirmRequiredAction(actions)
      ? '发送邀请前必须确认'
      : '涉及真实触达时必须确认',
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
      '只有你确认后，活动结果才会作为 Life Graph 的长期记忆候选。',
    trustScoreUpdatePreview:
      publicDetail(opportunity.trustScoreUpdatePreview) ??
      publicDetail(card.data.trustScoreUpdatePreview) ??
      '完成、评价和守约情况会作为后续推荐可信度的弱信号。',
    autoPublished:
      opportunity.autoPublished === true || card.data.autoPublished === true,
    publicIntentId:
      publicString(opportunity.publicIntentId) ??
      publicString(card.data.publicIntentId),
    discoverHref:
      publicString(opportunity.discoverHref) ??
      publicString(card.data.discoverHref),
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
      label: '可恢复闭环',
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
    title: (publicDetail(diff.title) ?? card.title) || '画像更新建议',
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
      publicDetail(timeline.description) ?? card.body ?? '我会把邀约拆成可确认、可恢复的步骤。',
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
      publicDetail(card.data.replyIntentLabel) ??
      publicDetail(timeline.replyIntentLabel),
    replyIntentDescription:
      publicDetail(card.data.replyIntentDescription) ??
      publicDetail(timeline.replyIntentDescription),
    nextSafeStep:
      publicDetail(card.data.nextSafeStep) ??
      publicDetail(timeline.nextSafeStep),
    waitingFor:
      publicDetail(card.data.waitingFor) ??
      publicDetail(timeline.waitingFor),
    nextRecoverableActions: publicStringArray(
      card.data.nextRecoverableActions ?? timeline.nextRecoverableActions,
    ).slice(0, 4),
    sideEffectPolicy:
      publicDetail(card.data.sideEffectPolicy) ??
      publicDetail(timeline.sideEffectPolicy),
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

function normalizeMeetLoopRecoveryProtocol(
  value: unknown,
): MeetLoopRecoveryProtocolItemView[] {
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
      '这一步涉及真实动作，我会等你确认后再继续。',
    riskLevel:
      publicDetail(approval.riskLevel) ??
      publicDetail(approval.level) ??
      publicDetail(card.data.riskLevel) ??
      publicDetail(card.data.level),
    reasons: publicStringArray(
      approval.reasons ?? card.data.riskReasons ?? card.data.reasons,
    ).slice(0, 4),
    auditNote:
      publicDetail(approval.auditNote) ??
      publicDetail(card.data.auditNote) ??
      publicDetail(card.data.reviewNote) ??
      publicDetail(card.data.confirmationNote),
    confirmationLabel:
      publicDetail(approval.confirmationLabel) ??
      publicDetail(card.data.confirmationLabel) ??
      '用户确认后执行',
    checkpointLabel:
      publicDetail(approval.checkpointLabel) ??
      publicDetail(card.data.checkpointLabel) ??
      '进度已保存',
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

function publicString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
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
  if (text === 'failed' || text === 'error') return '需要重试';
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
    { key: 'life_graph', label: '回写画像' },
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
  if (key === 'draft') return '确认后发起';
  if (key === 'sent') return '等待回复';
  if (key === 'reschedule') return '可改期';
  if (key === 'confirmed') return '确认细节';
  if (key === 'met') return '安全见面';
  if (key === 'completed') return '见面后评价';
  if (key === 'life_graph') return '确认后回写';
  if (state === 'next') return '等待前序步骤';
  return '可继续';
}

function meetLoopDefaultLabel(key: string) {
  if (key === 'draft') return '发起';
  if (key === 'sent') return '等待回复';
  if (key === 'reschedule') return '改期';
  if (key === 'confirmed') return '确认';
  if (key === 'met') return '见面';
  if (key === 'completed') return '评价';
  if (key === 'life_graph') return '回写画像';
  return '下一步';
}

function meetLoopStageDescription(label: string, state: MeetLoopStageState) {
  const prefix = state === 'done' ? '已完成' : state === 'current' ? '当前步骤' : '等待前一步完成';
  if (label === '发起') return `${prefix}：整理邀约对象、时间和边界。`;
  if (label === '等待回复') return `${prefix}：等待对方回复，不重复打扰。`;
  if (label === '改期') return `${prefix}：双方时间不合适时再调整。`;
  if (label === '确认') return `${prefix}：确认地点、时间和安全边界。`;
  if (label === '见面') return `${prefix}：按确认后的公共场所和时间见面。`;
  if (label === '评价') return `${prefix}：见面后记录体验反馈。`;
  if (label === '回写画像') return `${prefix}：只把你确认的信息写回画像。`;
  return `${prefix}：继续处理这一环节。`;
}

function sanitizePublicText(value: string) {
  const trimmed = value.trim();
  if (!trimmed || isInternalDebugText(trimmed)) return null;
  const withoutForbidden = trimmed
    .replace(/\btool[_\s-]?call(s)?\b/gi, '处理步骤')
    .replace(/\btool[_\s-]?result(s)?\b/gi, '处理结果')
    .replace(/\btrace[Ii]d\b/g, '')
    .replace(/\bagent[Tt]race\b/g, '')
    .replace(/\bplan(n)?er\b/gi, '下一步')
    .replace(/\bcheckpoint\b/gi, '保存进度')
    .replace(/\breplay\b/gi, '重新运行')
    .replace(/\bfork\b/gi, '新版本')
    .replace(/\braw\s+JSON\b/gi, '')
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
    /\btraceid\b/,
    /\bagenttrace\b/,
    /\bplanner\b/,
    /\btool[_\s-]?calls?\b/,
    /\btool[_\s-]?results?\b/,
    /\braw\s+json\b/,
    /\brawjson\b/,
    /\bstructuredintent\b/,
    /\bcheckpoint\b/,
    /\breplay\b/,
    /\bfork\b/,
    /\bdebug\b/,
    /\binternal\b/,
    /\bruntime\b/,
    new RegExp('\\bst' + 'ack\\b'),
    /\bhidden[-_\w]*\b/,
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
  return /^(traceId|agentTrace|planner|toolCalls?|toolResults?|raw|rawJson|debug|stack|structuredIntent|internal|metadata|runtime|checkpoint)$/i.test(
    key,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
