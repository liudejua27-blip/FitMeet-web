import { cleanDisplayText } from '../common/display-text.util';

export type SocialAgentRankingPreference = {
  distance: number;
  time: number;
  interest: number;
  language: number;
  socialStyle: number;
  labels: string[];
  reason: string;
  source: string;
  updatedAt: string;
};

export const SOCIAL_AGENT_DEFAULT_RANKING_PREFERENCE: SocialAgentRankingPreference =
  {
    distance: 1,
    time: 1,
    interest: 1,
    language: 1,
    socialStyle: 1,
    labels: [],
    reason: '',
    source: 'default',
    updatedAt: new Date(0).toISOString(),
  };

const MIN_WEIGHT = 0.7;
const MAX_WEIGHT = 1.8;

export function normalizeSocialAgentRankingPreference(
  value: unknown,
): SocialAgentRankingPreference {
  if (!isRecord(value)) return { ...SOCIAL_AGENT_DEFAULT_RANKING_PREFERENCE };
  return {
    distance: boundedWeight(value.distance),
    time: boundedWeight(value.time),
    interest: boundedWeight(value.interest),
    language: boundedWeight(value.language),
    socialStyle: boundedWeight(value.socialStyle),
    labels: stringList(value.labels).slice(0, 5),
    reason: cleanDisplayText(value.reason, '').slice(0, 120),
    source: cleanDisplayText(value.source, '') || 'task_memory',
    updatedAt:
      cleanDisplayText(value.updatedAt, '') ||
      SOCIAL_AGENT_DEFAULT_RANKING_PREFERENCE.updatedAt,
  };
}

export function extractSocialAgentRankingPreferenceFromMessage(input: {
  message: string;
  previous?: SocialAgentRankingPreference | null;
}): SocialAgentRankingPreference | null {
  const text = cleanDisplayText(input.message, '');
  if (!text) return null;
  const previous = normalizeSocialAgentRankingPreference(input.previous);
  const next: SocialAgentRankingPreference = {
    ...previous,
    labels: [...previous.labels],
    reason: text.slice(0, 120),
    source: 'user_task_preference',
    updatedAt: new Date().toISOString(),
  };
  let changed = false;

  if (
    /(更近|近一点|附近|离我近|距离优先|少跑远|半径小|同校|同区域)/.test(text)
  ) {
    next.distance = 1.65;
    next.labels = mergeLabels(next.labels, '距离优先');
    changed = true;
  }
  if (
    /(时间更重要|时间优先|时间匹配|时间合适|今晚优先|周末优先|别改时间)/.test(
      text,
    )
  ) {
    next.time = 1.6;
    next.labels = mergeLabels(next.labels, '时间优先');
    changed = true;
  }
  if (/(兴趣更重要|兴趣优先|爱好相近|同好|共同兴趣|活动类型优先)/.test(text)) {
    next.interest = 1.45;
    next.labels = mergeLabels(next.labels, '兴趣同频');
    changed = true;
  }
  if (/(聊得来|同频|低压力|轻松|不尬聊|性格合适|风格优先|能聊)/.test(text)) {
    next.socialStyle = 1.55;
    next.labels = mergeLabels(next.labels, '同频优先');
    changed = true;
  }
  if (/(语言|中文|英语|英文|普通话|同语言)/i.test(text)) {
    next.language = 1.35;
    next.labels = mergeLabels(next.labels, '语言匹配');
    changed = true;
  }

  return changed ? next : null;
}

export function rankingPreferenceLabels(
  preference?: SocialAgentRankingPreference | null,
): string[] {
  const normalized = normalizeSocialAgentRankingPreference(preference);
  return normalized.labels.slice(0, 5);
}

export function rankingPreferenceIsDefault(
  preference?: SocialAgentRankingPreference | null,
): boolean {
  const normalized = normalizeSocialAgentRankingPreference(preference);
  return (
    normalized.distance === 1 &&
    normalized.time === 1 &&
    normalized.interest === 1 &&
    normalized.language === 1 &&
    normalized.socialStyle === 1
  );
}

function boundedWeight(value: unknown): number {
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return 1;
  return Math.max(
    MIN_WEIGHT,
    Math.min(MAX_WEIGHT, Number(numberValue.toFixed(2))),
  );
}

function mergeLabels(previous: string[], label: string): string[] {
  const values = [...previous, label];
  const seen = new Set<string>();
  return values.filter((item) => {
    const text = cleanDisplayText(item, '');
    if (!text || seen.has(text)) return false;
    seen.add(text);
    return true;
  });
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanDisplayText(item, '')).filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
