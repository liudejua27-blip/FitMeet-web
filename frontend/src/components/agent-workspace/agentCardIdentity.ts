import type { FitMeetAlphaCard } from '../../api/socialAgentApi';

export function mergeUniqueAgentCards(
  existing: FitMeetAlphaCard[],
  incoming: FitMeetAlphaCard[],
) {
  const seen = new Set(existing.flatMap(agentCardDedupKeys));
  const merged = [...existing];
  for (const card of incoming) {
    const keys = agentCardDedupKeys(card);
    if (keys.some((key) => seen.has(key))) continue;
    for (const key of keys) seen.add(key);
    merged.push(card);
  }
  return merged;
}

export function agentCardDedupKeys(card: FitMeetAlphaCard) {
  const keys = new Set<string>();
  const type = card.schemaType ?? card.type ?? 'card';
  const add = (prefix: string, value: unknown) => {
    const text = stringFromUnknown(value);
    if (text) keys.add(`${prefix}:${text}`);
  };

  add('card:id', card.id);
  add(`${type}:card`, card.id);
  for (const approvalId of collectApprovalIds(card)) {
    add('approval', approvalId);
    add(`${type}:approval`, approvalId);
  }

  const actionTypes = collectActionTypes(card);
  const candidateIds = collectCandidateIds(card);
  const useCandidateOnlyKey = shouldUseCandidateOnlyKey(card, actionTypes);
  for (const candidateId of candidateIds) {
    if (useCandidateOnlyKey) {
      add('candidate', candidateId);
      add(`${type}:candidate`, candidateId);
    } else {
      for (const actionType of actionTypes) {
        add('candidate-action', `${candidateId}:${actionType}`);
        add(`${type}:candidate-action`, `${candidateId}:${actionType}`);
      }
    }
  }

  for (const opportunityId of collectOpportunityIds(card)) {
    add('opportunity', opportunityId);
    add(`${type}:opportunity`, opportunityId);
    const taskId = stringFromUnknown(card.data.taskId ?? nestedValue(card.data.opportunity, 'taskId'));
    if (taskId) {
      add('task-opportunity', `${taskId}:${opportunityId}`);
      add(`${type}:task-opportunity`, `${taskId}:${opportunityId}`);
    }
  }

  for (const draftKey of collectOpportunityDraftKeys(card)) {
    add('opportunity-draft', draftKey);
    add(`${type}:opportunity-draft`, draftKey);
  }

  if (keys.size === 0) keys.add(`${type}:fallback:${card.id ?? JSON.stringify(card.data)}`);
  return [...keys];
}

export function agentCardIdentityHints(card: FitMeetAlphaCard) {
  return uniqueIdentities(
    card.id,
    ...collectApprovalIds(card),
    ...collectCandidateIds(card),
    ...collectOpportunityIds(card),
  );
}

function shouldUseCandidateOnlyKey(card: FitMeetAlphaCard, actionTypes: string[]) {
  if (isCandidateActionResultCard(card, actionTypes)) return false;
  if (actionTypes.length === 0) return true;
  return card.schemaType === 'social_match.candidate' || card.type === 'candidate_card';
}

function isCandidateActionResultCard(card: FitMeetAlphaCard, actionTypes: string[]) {
  const cardId = stringFromUnknown(card.id) ?? '';
  const schemaName = stringFromUnknown(card.data.schemaName) ?? '';
  const dataActionType =
    stringFromUnknown(card.data.actionType) ??
    stringFromUnknown(card.data.action) ??
    stringFromUnknown(nestedValue(card.data.approval, 'actionType')) ??
    stringFromUnknown(nestedValue(card.data.approval, 'action'));
  if (
    card.schemaType === 'safety.approval' ||
    schemaName === 'ApprovalPanel' ||
    /(^|[_:-])(approval|opener|invite|connect)([_:-]|$)/i.test(cardId) ||
    ['opener.confirm_send', 'send_invite', 'candidate.connect', 'connect_candidate'].includes(
      dataActionType ?? '',
    )
  ) {
    return true;
  }

  if (
    card.data.openerDraftReady === true ||
    stringFromUnknown(card.data.message) ||
    stringFromUnknown(card.data.suggestedOpener) ||
    stringFromUnknown(card.data.openerText) ||
    stringFromUnknown(card.data.inviteMessage)
  ) {
    return true;
  }

  return actionTypes.length > 0 && !isBaseCandidateCard(card);
}

function isBaseCandidateCard(card: FitMeetAlphaCard) {
  const schemaName = stringFromUnknown(card.data.schemaName) ?? '';
  return (
    card.schemaType === 'social_match.candidate' ||
    card.type === 'candidate_card' ||
    schemaName === 'CandidateCard'
  );
}

export function agentCardApprovalId(data: Record<string, unknown>) {
  return (
    stringFromUnknown(data.approvalId) ??
    stringFromUnknown(nestedValue(data.approval, 'id')) ??
    stringFromUnknown(nestedValue(data.inlineApprovalConfirmation, 'id'))
  );
}

function collectApprovalIds(card: FitMeetAlphaCard) {
  return uniqueIdentities(
    card.data.approvalId,
    nestedValue(card.data.approval, 'id'),
    nestedValue(card.data.inlineApprovalConfirmation, 'id'),
    ...actionPayloadValues(card, 'approvalId'),
  );
}

function collectCandidateIds(card: FitMeetAlphaCard) {
  return uniqueIdentities(
    card.data.candidateRecordId,
    card.data.socialRequestCandidateId,
    card.data.targetUserId,
    card.data.candidateUserId,
    card.data.userId,
    nestedValue(card.data.candidate, 'candidateRecordId'),
    nestedValue(card.data.candidate, 'socialRequestCandidateId'),
    nestedValue(card.data.candidate, 'targetUserId'),
    nestedValue(card.data.candidate, 'candidateUserId'),
    nestedValue(card.data.candidate, 'userId'),
    nestedValue(card.data.opportunity, 'candidateRecordId'),
    nestedValue(card.data.opportunity, 'socialRequestCandidateId'),
    nestedValue(card.data.opportunity, 'targetUserId'),
    nestedValue(card.data.opportunity, 'candidateUserId'),
    nestedValue(card.data.opportunity, 'userId'),
    ...actionPayloadValues(card, 'candidateRecordId'),
    ...actionPayloadValues(card, 'socialRequestCandidateId'),
    ...actionPayloadValues(card, 'targetUserId'),
    ...actionPayloadValues(card, 'candidateUserId'),
    ...actionPayloadValues(card, 'userId'),
  );
}

function collectOpportunityIds(card: FitMeetAlphaCard) {
  return uniqueIdentities(
    card.data.opportunityId,
    card.data.activityId,
    card.data.publicIntentId,
    card.data.socialRequestId,
    nestedValue(card.data.opportunity, 'id'),
    nestedValue(card.data.opportunity, 'opportunityId'),
    nestedValue(card.data.opportunity, 'activityId'),
    nestedValue(card.data.opportunity, 'publicIntentId'),
    nestedValue(card.data.opportunity, 'socialRequestId'),
    ...actionPayloadValues(card, 'opportunityId'),
    ...actionPayloadValues(card, 'activityId'),
    ...actionPayloadValues(card, 'publicIntentId'),
    ...actionPayloadValues(card, 'socialRequestId'),
  );
}

function collectOpportunityDraftKeys(card: FitMeetAlphaCard) {
  const taskId = stringFromUnknown(card.data.taskId ?? nestedValue(card.data.opportunity, 'taskId'));
  if (!taskId) return [];
  const opportunityIds = collectOpportunityIds(card);
  if (opportunityIds.length > 0) return [];
  const type = stringFromUnknown(card.schemaType ?? card.type);
  if (
    type !== 'social_match.activity' &&
    type !== 'activity_plan' &&
    type !== 'activity_status'
  ) {
    return [];
  }
  const opportunity = isRecord(card.data.opportunity) ? card.data.opportunity : {};
  const signature = stableDraftSignature([
    firstString(
      opportunity.title,
      card.data.activityTitle,
      card.data.name,
      card.data.title,
      card.title,
    ),
    firstString(opportunity.activity, opportunity.activityType, card.data.activity, card.data.activityType),
    firstString(opportunity.city, card.data.city),
    firstString(
      opportunity.area,
      opportunity.location,
      opportunity.locationName,
      opportunity.venue,
      card.data.area,
      card.data.location,
      card.data.locationName,
      card.data.venue,
    ),
    firstString(
      opportunity.time,
      opportunity.timeLabel,
      opportunity.startsAtLabel,
      card.data.timePreference,
      card.data.timeLabel,
      card.data.startsAtLabel,
    ),
    firstString(opportunity.intensity, card.data.intensity),
  ]);
  return signature ? [`${taskId}:${signature}`] : [];
}

function collectActionTypes(card: FitMeetAlphaCard) {
  return uniqueIdentities(
    card.data.actionType,
    card.data.action,
    nestedValue(card.data.approval, 'actionType'),
    nestedValue(card.data.approval, 'action'),
    ...safeCardActions(card).map((action) => action.schemaAction ?? action.action),
    ...actionPayloadValues(card, 'actionType'),
    ...actionPayloadValues(card, 'action'),
  );
}

function actionPayloadValues(card: FitMeetAlphaCard, key: string) {
  return safeCardActions(card).map((action) => action.payload?.[key]);
}

function safeCardActions(card: FitMeetAlphaCard) {
  return Array.isArray(card.actions) ? card.actions : [];
}

function stableDraftSignature(values: unknown[]) {
  const text = values
    .map((value) => stringFromUnknown(value))
    .filter((value): value is string => Boolean(value))
    .join('|')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。！？、,.!?;；:："'“”‘’()[\]{}<>《》]/g, '')
    .trim();
  return text.length >= 4 ? text.slice(0, 160) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function uniqueIdentities(...values: unknown[]) {
  return Array.from(
    new Set(
      values
        .map((value) => stringFromUnknown(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function firstString(...values: unknown[]) {
  return values.map((value) => stringFromUnknown(value)).find(Boolean) ?? null;
}

function nestedValue(value: unknown, key: string) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)[key]
    : null;
}

function stringFromUnknown(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
