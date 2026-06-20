import { cleanDisplayText } from '../common/display-text.util';

export type SocialAgentKnownTaskSlot = {
  key: string;
  label: string;
  value: string;
  state?: string;
  confirmation: 'user_confirmed' | 'inferred_context';
};

export type SocialAgentKnownTaskSlotConstraints = {
  treatAsHardConstraints: true;
  knownSlots: SocialAgentKnownTaskSlot[];
  doNotAskAgainFor: string[];
  userVisibleSummary: string;
  candidatePreferencePolicy: string;
  instruction: string;
};

const SLOT_LABELS: Record<string, string> = {
  activity: '活动',
  time_window: '时间',
  location_text: '地点',
  geo_area: '区域',
  intensity: '强度',
  visibility: '公开方式',
  safety_boundary: '安全边界',
  invite_tone: '邀请语气',
  candidate_preference: '候选偏好',
};

const KNOWN_SLOT_STATES = new Set([
  'inferred',
  'answered',
  'confirmed',
  'completed',
  'modified',
]);

const USER_CONFIRMED_SLOT_STATES = new Set([
  'answered',
  'confirmed',
  'completed',
  'modified',
]);

export function buildSocialAgentKnownTaskSlotConstraints(
  taskSlots: Record<string, unknown> | null | undefined,
): SocialAgentKnownTaskSlotConstraints | null {
  if (!isRecord(taskSlots)) return null;
  const knownSlots = Object.entries(taskSlots)
    .map(([key, rawSlot]) => knownTaskSlot(key, rawSlot))
    .filter((slot): slot is SocialAgentKnownTaskSlot => slot !== null);

  if (!knownSlots.length) return null;
  const doNotAskAgainFor = knownSlots
    .filter((slot) => slot.confirmation === 'user_confirmed')
    .map((slot) => slot.key);

  return {
    treatAsHardConstraints: true,
    knownSlots,
    doNotAskAgainFor,
    userVisibleSummary: knownSlots
      .map((slot) => `${slot.label}：${slot.value}`)
      .join('；'),
    candidatePreferencePolicy:
      'candidate_preference 只能用于公开可发现资料、公开标签或用户自愿公开信息，不能推断隐私。',
    instruction:
      'planner/router/Brain/subagent 必须基于 knownSlots 继续推进；除非用户主动修改，否则不得重复询问 doNotAskAgainFor 中的字段。state 为 inferred 的字段只能作为上下文线索，不能当作用户已确认答案，也不能阻止必要澄清。',
  };
}

function knownTaskSlot(
  key: string,
  rawSlot: unknown,
): SocialAgentKnownTaskSlot | null {
  const slot = isRecord(rawSlot) ? rawSlot : {};
  const state = cleanDisplayText(slot.state, '');
  if (state && !KNOWN_SLOT_STATES.has(state)) return null;
  const rawValue = isRecord(rawSlot) ? slot.value : rawSlot;
  const value = cleanDisplayText(rawValue, '');
  if (!value) return null;
  return {
    key,
    label: SLOT_LABELS[key] ?? key,
    value,
    ...(state ? { state } : {}),
    confirmation: USER_CONFIRMED_SLOT_STATES.has(state)
      ? 'user_confirmed'
      : 'inferred_context',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
