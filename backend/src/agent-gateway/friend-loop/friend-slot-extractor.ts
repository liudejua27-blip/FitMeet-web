import { cleanDisplayText } from '../../common/display-text.util';
import { sanitizeCity } from '../../common/city.util';
import type { FriendSlotValidation, FriendSlots } from './friend-loop.types';

const CITY =
  /(北京|上海|广州|深圳|杭州|成都|重庆|南京|苏州|武汉|西安|长沙|郑州|天津|济南|厦门|宁波|合肥|青岛)/;
const TOPICS = [
  '咖啡',
  '电影',
  '音乐',
  '阅读',
  '摄影',
  '徒步',
  '桌游',
  '探店',
  '自习',
  '聊天',
  '同城',
  '低压力社交',
];

export function extractFriendSlots(input: {
  message: string;
  previousSlots?: Partial<FriendSlots>;
}): FriendSlots {
  const text = cleanDisplayText(input.message, '');
  const previous = input.previousSlots ?? {};
  return normalizeFriendSlots({
    ...previous,
    friendGoal:
      cleanDisplayText(previous.friendGoal, '') ||
      extractGoal(text) ||
      undefined,
    city: cleanDisplayText(previous.city, '') || extractCity(text) || undefined,
    topicTags:
      previous.topicTags && previous.topicTags.length > 0
        ? previous.topicTags
        : extractTopics(text),
    scenePreference:
      cleanDisplayText(previous.scenePreference, '') ||
      extractScene(text) ||
      undefined,
    timePreference:
      cleanDisplayText(previous.timePreference, '') ||
      extractTime(text) ||
      undefined,
    candidatePreference:
      cleanDisplayText(previous.candidatePreference, '') ||
      extractCandidatePreference(text) ||
      undefined,
    safetyBoundary:
      cleanDisplayText(previous.safetyBoundary, '') ||
      defaultFriendSafetyBoundary(),
    visibilityPreference: 'private',
  });
}

export function validateFriendSlots(slots: FriendSlots): FriendSlotValidation {
  const missing: FriendSlotValidation['missing'] = [];
  if (!cleanDisplayText(slots.friendGoal, '')) missing.push('friendGoal');
  if (!cleanDisplayText(slots.city, '')) missing.push('city');
  return { valid: missing.length === 0, missing };
}

export function normalizeFriendSlots(
  value: Partial<FriendSlots> = {},
): FriendSlots {
  return {
    friendGoal: cleanDisplayText(value.friendGoal, '') || undefined,
    city: sanitizeCity(value.city) || undefined,
    topicTags: normalizeTags(value.topicTags),
    scenePreference: cleanDisplayText(value.scenePreference, '') || undefined,
    timePreference: cleanDisplayText(value.timePreference, '') || undefined,
    candidatePreference:
      cleanDisplayText(value.candidatePreference, '') || undefined,
    safetyBoundary:
      cleanDisplayText(value.safetyBoundary, '') ||
      defaultFriendSafetyBoundary(),
    visibilityPreference: 'private',
  };
}

export function defaultFriendSafetyBoundary() {
  return '默认安全设置：站内先聊、低压力认识、不交换联系方式、不公开精确位置';
}

function extractGoal(text: string): string | undefined {
  if (!text) return undefined;
  const match = text.match(
    /(想|希望|帮我|我要|我想)?(认识新朋友|认识朋友|找朋友|找同城朋友|找聊天搭子|交友|扩列|低压力社交)/,
  );
  if (match?.[2]) return match[2];
  if (/朋友|交友|扩列/.test(text)) return '认识新朋友';
  return undefined;
}

function extractCity(text: string): string | undefined {
  const match = text.match(CITY);
  return match?.[1];
}

function extractTopics(text: string): string[] {
  return TOPICS.filter((topic) => text.includes(topic)).slice(0, 6);
}

function extractScene(text: string): string | undefined {
  if (/咖啡|探店/.test(text)) return '咖啡或轻松探店';
  if (/线上|先聊|聊天/.test(text)) return '先站内聊天';
  if (/同城|附近/.test(text)) return '同城低压力认识';
  return undefined;
}

function extractTime(text: string): string | undefined {
  const match = text.match(
    /(今天|今晚|明天|明晚|后天|周末|本周末|下周末|工作日晚上|下班后|晚上|下午|上午)/,
  );
  return match?.[1];
}

function extractCandidatePreference(text: string): string | undefined {
  const match = text.match(
    /(同城|附近|年龄差不多|兴趣相近|低压力|真诚|女生|男生|资料完整|同校|同行)/,
  );
  return match?.[1];
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanDisplayText(item, ''))
    .filter(Boolean)
    .slice(0, 8);
}
