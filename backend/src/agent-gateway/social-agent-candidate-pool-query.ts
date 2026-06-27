import { extractKnownCity, sanitizeCity } from '../common/city.util';
import { cleanDisplayText } from '../common/display-text.util';
import { UserSocialRequest } from '../social-requests/social-request.entity';
import { AgentTask } from './entities/agent-task.entity';
import {
  extractCandidateActivity,
  extractCandidateTags,
  extractCandidateTime,
} from './social-agent-candidate-query-parser';
import { readSocialAgentTaskMemory } from './social-agent-memory.util';

export type CandidatePoolIntent = 'social_search' | 'activity_search';

export type CandidatePoolQuery = {
  ownerUserId: number;
  intent?: CandidatePoolIntent;
  taskId?: number | null;
  socialRequestId?: number | null;
  city?: string | null;
  activityType?: string | null;
  interestTags?: string[] | null;
  candidatePreference?: string | null;
  candidatePreferencePolicy?: string | null;
  timePreference?: string | null;
  locationPreference?: string | null;
  rawText?: string | null;
  acceptsStrangers?: boolean | null;
  candidateUserIds?: number[] | null;
  publicIntentIds?: string[] | null;
  limit?: number | null;
  persistCandidates?: boolean;
};

export type CandidatePoolResolvedQuery = {
  city: string;
  intent: CandidatePoolIntent;
  interestTags: string[];
  candidatePreference?: string;
  candidatePreferencePolicy?: string;
  activityType: string;
  timePreference: string;
  locationPreference: string;
  socialRequestId: number | null;
  rawText: string;
  acceptsStrangers: boolean | null;
  candidateUserIds: number[];
  publicIntentIds: string[];
};

export function buildCandidatePoolResolvedQuery(input: {
  query: CandidatePoolQuery;
  socialRequestId: number | null;
  request?: UserSocialRequest | null;
  task?: AgentTask | null;
}): CandidatePoolResolvedQuery {
  const { query, request, task } = input;
  const taskSlots = readCandidatePoolTaskSlotValues(task);
  const taskBoundaries = readCandidatePoolTaskBoundaryValues(task);
  const hasCurrentTaskSlotContext = hasCandidatePoolTaskSlotContext(taskSlots);
  const inputCity = sanitizeCity(query.city);
  const inputActivityType = cleanDisplayText(query.activityType, '');
  const inputTimePreference = cleanDisplayText(query.timePreference, '');
  const inputLocationPreference = cleanDisplayText(
    query.locationPreference,
    '',
  );
  const candidatePreference = cleanDisplayText(
    query.candidatePreference ?? taskSlots.candidate_preference,
    '',
  );
  const candidatePreferencePolicy = cleanDisplayText(
    query.candidatePreferencePolicy,
    'public_discoverable_profiles_and_user_consented_public_tags_only',
  );
  const rawText = cleanDisplayText(
    query.rawText ??
      (hasCurrentTaskSlotContext
        ? task?.goal
        : (request?.rawText ?? request?.title ?? task?.goal)),
    '',
  );
  const slotRawText = candidatePoolSlotRawText(taskSlots);
  const city = resolveCandidatePoolCity({
    explicitCity: inputCity,
    requestCity: request?.city,
    rawText,
    slotRawText,
    geoArea: taskSlots.geo_area,
    locationPreference: inputLocationPreference || taskSlots.location_text,
  });
  const activityType = cleanDisplayText(
    inputActivityType ||
      taskSlots.activity ||
      request?.activityType ||
      extractCandidateActivity(rawText || slotRawText),
    '',
  );
  const interestTags = uniqueCandidatePoolStrings([
    ...(Array.isArray(query.interestTags) ? query.interestTags : []),
    ...(hasCurrentTaskSlotContext
      ? []
      : Array.isArray(request?.interestTags)
        ? request.interestTags
        : []),
    ...extractCandidateTags(rawText),
    ...extractCandidateTags(slotRawText),
    ...candidatePreferenceQueryTags(candidatePreference),
    activityType,
  ]);
  const timePreference = cleanDisplayText(
    inputTimePreference ||
      taskSlots.time_window ||
      extractCandidateTime(rawText || slotRawText),
    '',
  );
  const acceptsStrangers = resolveCandidatePoolStrangerPolicy({
    explicit: query.acceptsStrangers,
    rawText: `${rawText} ${taskSlots.safety_boundary ?? ''}`.trim(),
    memory: taskBoundaries.acceptsStrangers,
  });

  return {
    city,
    intent: query.intent ?? 'social_search',
    interestTags,
    candidatePreference,
    candidatePreferencePolicy,
    activityType,
    timePreference,
    locationPreference:
      inputLocationPreference || taskSlots.location_text || '',
    socialRequestId: input.socialRequestId,
    rawText,
    acceptsStrangers,
    candidateUserIds: uniqueCandidatePoolNumbers(query.candidateUserIds),
    publicIntentIds: uniqueCandidatePoolStrings(query.publicIntentIds ?? []),
  };
}

function candidatePreferenceQueryTags(value: string): string[] {
  const source = cleanDisplayText(value, '');
  if (!source) return [];
  const tags = [
    ...normalizeCandidatePoolArray(source),
    ...extractCandidateTags(source),
  ];
  if (/舞蹈|跳舞|舞者|dance/i.test(source)) tags.push('舞蹈相关');
  if (/女生|女孩|女性|女同学|女大学生/i.test(source)) tags.push('女生');
  if (/男生|男孩|男性|男同学|男大学生/i.test(source)) tags.push('男生');
  if (/同校|校友|大学生|学生|青岛大学/i.test(source)) tags.push('同校/学生');
  return uniqueCandidatePoolStrings(tags);
}

function resolveCandidatePoolCity(input: {
  explicitCity: string;
  requestCity?: string | null;
  rawText: string;
  slotRawText: string;
  geoArea?: string;
  locationPreference?: string;
}): string {
  const explicit = sanitizeCity(input.explicitCity);
  if (explicit) return explicit;
  const slotKnown = extractKnownCity(input.slotRawText);
  if (slotKnown) return slotKnown;
  const inferred = inferCandidatePoolCityFromArea(
    `${input.geoArea ?? ''} ${input.locationPreference ?? ''}`,
  );
  if (inferred) return inferred;
  const rawKnown = extractKnownCity(input.rawText);
  if (rawKnown) return rawKnown;
  const requestCity = sanitizeCity(input.requestCity);
  if (requestCity) return requestCity;
  return sanitizeCity(input.geoArea);
}

function inferCandidatePoolCityFromArea(value: string): string {
  const text = cleanDisplayText(value, '');
  if (!text) return '';
  if (
    /(崂山区|市南区|市北区|李沧区|黄岛区|青岛大学|五四广场|奥帆中心|石老人|浮山|麦岛|台东|栈桥)/.test(
      text,
    )
  ) {
    return '青岛';
  }
  return '';
}

export function resolveCandidatePoolStrangerPolicy(input: {
  explicit?: boolean | null;
  rawText?: string | null;
  memory?: boolean | null;
}): boolean | null {
  if (typeof input.explicit === 'boolean') return input.explicit;
  const text = cleanDisplayText(input.rawText, '');
  if (
    text &&
    /(不接受陌生人|不要陌生人|别推荐陌生人|不要推荐陌生人|只推荐熟人|只看熟人|只找熟人|不想认识陌生人)/i.test(
      text,
    )
  ) {
    return false;
  }
  if (
    text &&
    /(接受陌生人|可以接受陌生人|愿意认识陌生人|可以认识陌生人|可以推荐陌生人|愿意认识新朋友)/i.test(
      text,
    )
  ) {
    return true;
  }
  if (typeof input.memory === 'boolean') return input.memory;
  return null;
}

export function normalizeCandidatePoolArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueCandidatePoolStrings(value.map((item) => String(item)));
  }
  if (typeof value === 'string') {
    return uniqueCandidatePoolStrings(value.split(/[、,，;；|]/u));
  }
  return [];
}

export function uniqueCandidatePoolStrings(values: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
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

export function uniqueCandidatePoolNumbers(values: unknown): number[] {
  if (!Array.isArray(values)) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const value of values) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) continue;
    const id = Math.floor(parsed);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function readCandidatePoolTaskSlotValues(
  task?: AgentTask | null,
): Record<string, string> {
  if (!task) return {};
  const memory = readSocialAgentTaskMemory(task);
  const taskSlots = isCandidatePoolRecord(memory.taskSlots)
    ? memory.taskSlots
    : {};
  const out: Record<string, string> = {};
  for (const [key, slot] of Object.entries(taskSlots)) {
    if (!isCandidatePoolRecord(slot)) continue;
    if (!isCandidatePoolTaskSlotUsable(key, slot)) continue;
    const value = cleanDisplayText(slot.value, '');
    if (value) out[key] = value;
  }
  const constraints = isCandidatePoolRecord(memory.knownTaskSlotConstraints)
    ? memory.knownTaskSlotConstraints
    : {};
  const knownSlots = Array.isArray(constraints['knownSlots'])
    ? constraints['knownSlots']
    : [];
  const doNotAskAgainFor = Array.isArray(constraints['doNotAskAgainFor'])
    ? new Set(
        constraints['doNotAskAgainFor']
          .map((key) => cleanDisplayText(key, ''))
          .filter(Boolean),
      )
    : new Set<string>();
  for (const rawSlot of knownSlots) {
    if (!isCandidatePoolRecord(rawSlot)) continue;
    const key = cleanDisplayText(rawSlot.key, '');
    if (!key || out[key]) continue;
    const value = cleanDisplayText(rawSlot.value, '');
    if (!value) continue;
    const state = cleanDisplayText(rawSlot.state, '');
    if (
      !doNotAskAgainFor.has(key) &&
      !['answered', 'confirmed', 'completed', 'modified'].includes(state)
    ) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

function readCandidatePoolTaskBoundaryValues(task?: AgentTask | null): {
  acceptsStrangers: boolean | null;
} {
  if (!task) return { acceptsStrangers: null };
  const memory = readSocialAgentTaskMemory(task);
  return {
    acceptsStrangers:
      typeof memory.boundaries.acceptsStrangers === 'boolean'
        ? memory.boundaries.acceptsStrangers
        : null,
  };
}

function isCandidatePoolTaskSlotUsable(
  key: string,
  slot: Record<string, unknown>,
): boolean {
  const value = cleanDisplayText(slot.value, '');
  if (!value) return false;
  const state = cleanDisplayText(slot.state, '');
  const source = cleanDisplayText(slot.source, '');
  if (state === 'missing') return false;
  if (key === 'geo_area') return true;
  if (
    (key === 'activity' || key === 'time_window' || key === 'location_text') &&
    (state === 'inferred' || source === 'inferred')
  ) {
    return false;
  }
  return true;
}

function candidatePoolSlotRawText(taskSlots: Record<string, string>): string {
  return [
    taskSlots.geo_area,
    taskSlots.location_text,
    taskSlots.time_window,
    taskSlots.activity,
    taskSlots.candidate_preference,
  ]
    .filter(Boolean)
    .join(' ');
}

function hasCandidatePoolTaskSlotContext(
  taskSlots: Record<string, string>,
): boolean {
  return [
    taskSlots.geo_area,
    taskSlots.location_text,
    taskSlots.time_window,
    taskSlots.activity,
    taskSlots.candidate_preference,
  ].some(Boolean);
}

function isCandidatePoolRecord(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
