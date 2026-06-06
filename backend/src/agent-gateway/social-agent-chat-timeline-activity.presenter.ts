import { cleanDisplayText } from '../common/display-text.util';
import type {
  SocialAgentActivityResult,
  SocialAgentPendingApprovalSnapshot,
} from './social-agent-chat.types';

export function readSocialAgentActivityResults(
  value: unknown,
): SocialAgentActivityResult[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => {
      const source: SocialAgentActivityResult['source'] =
        cleanDisplayText(item.source, '') === 'activity'
          ? 'activity'
          : 'public_intent';
      return {
        id: cleanDisplayText(item.id, ''),
        source,
        isRealData: item.isRealData === true,
        activityId: numberValue(item.activityId),
        publicIntentId: cleanDisplayText(item.publicIntentId, '') || null,
        title: cleanDisplayText(item.title, '活动'),
        description: cleanDisplayText(item.description, ''),
        city: cleanDisplayText(item.city, ''),
        loc: cleanDisplayText(item.loc ?? item.locationName, ''),
        requestType: cleanDisplayText(item.requestType ?? item.type, ''),
        interestTags: stringList(item.interestTags),
        timePreference: cleanDisplayText(item.timePreference, ''),
        ownerUserId: numberValue(item.ownerUserId),
        status: cleanDisplayText(item.status, ''),
        createdAt: cleanDisplayText(item.createdAt, '') || null,
        matchScore: numberValue(item.matchScore) ?? undefined,
        matchReasons: stringList(item.matchReasons),
      };
    })
    .filter((item) => item.id || item.activityId || item.publicIntentId);
}

export function normalizePendingApprovalSnapshot(
  value: unknown,
): SocialAgentPendingApprovalSnapshot | undefined {
  if (!isRecord(value)) return undefined;
  const id = numberValue(value.id);
  const type = cleanDisplayText(value.type, '');
  const actionType = cleanDisplayText(value.actionType, '');
  if (!id || !type || !actionType) return undefined;
  return {
    id,
    type: type as SocialAgentPendingApprovalSnapshot['type'],
    actionType,
    summary: cleanDisplayText(value.summary, ''),
    riskLevel: cleanDisplayText(
      value.riskLevel,
      'medium',
    ) as SocialAgentPendingApprovalSnapshot['riskLevel'],
    payload: isRecord(value.payload) ? value.payload : {},
    expiresAt: cleanDisplayText(value.expiresAt, '') || null,
  };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => cleanDisplayText(item, ''))
        .filter(Boolean)
        .slice(0, 20)
    : [];
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
