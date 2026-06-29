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
    locationText:
      cleanDisplayText(previous.locationText, '') ||
      extractLocationText(text) ||
      extractCity(text) ||
      undefined,
    topicTags: mergeTags(previous.topicTags, extractTopics(text)),
    genderPreference:
      cleanDisplayText(previous.genderPreference, '') ||
      extractGenderPreference(text) ||
      undefined,
    bodyPreference:
      cleanDisplayText(previous.bodyPreference, '') ||
      extractBodyPreference(text) ||
      undefined,
    appearancePreference:
      cleanDisplayText(previous.appearancePreference, '') ||
      extractAppearancePreference(text) ||
      undefined,
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
  if (
    !cleanDisplayText(slots.city, '') &&
    !cleanDisplayText(slots.locationText, '')
  ) {
    missing.push('locationText');
  }
  if (!normalizeTags(slots.topicTags).length) missing.push('topicTags');
  if (!cleanDisplayText(slots.genderPreference, '')) {
    missing.push('genderPreference');
  }
  if (!cleanDisplayText(slots.bodyPreference, '')) {
    missing.push('bodyPreference');
  }
  if (!cleanDisplayText(slots.appearancePreference, '')) {
    missing.push('appearancePreference');
  }
  return { valid: missing.length === 0, missing };
}

export function normalizeFriendSlots(
  value: Partial<FriendSlots> = {},
): FriendSlots {
  return {
    friendGoal: cleanDisplayText(value.friendGoal, '') || undefined,
    city: sanitizeCity(value.city) || undefined,
    locationText: cleanDisplayText(value.locationText, '') || undefined,
    district: cleanDisplayText(value.district, '') || undefined,
    poiName: cleanDisplayText(value.poiName, '') || undefined,
    lat: typeof value.lat === 'number' ? value.lat : undefined,
    lng: typeof value.lng === 'number' ? value.lng : undefined,
    geoResolution: value.geoResolution,
    topicTags: normalizeTags(value.topicTags),
    genderPreference: cleanDisplayText(value.genderPreference, '') || undefined,
    bodyPreference: cleanDisplayText(value.bodyPreference, '') || undefined,
    appearancePreference:
      cleanDisplayText(value.appearancePreference, '') || undefined,
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

function extractLocationText(text: string): string | undefined {
  if (!text) return undefined;
  const city = extractCity(text);
  if (city) return city;
  const explicit = text.match(
    /(?:在|想在|希望在)?([\u4e00-\u9fa5A-Za-z0-9]{2,18}(?:附近|同城|大学|学院|校区|公司|园区|商圈|广场|公园|咖啡馆|咖啡厅|书店|市区|区|路|街))/,
  );
  if (explicit?.[1]) return explicit[1];
  if (/附近/.test(text)) return '附近';
  if (/同城/.test(text)) return '同城';
  return undefined;
}

function extractTopics(text: string): string[] {
  return TOPICS.filter((topic) => text.includes(topic)).slice(0, 6);
}

function extractGenderPreference(text: string): string | undefined {
  if (/不限性别|性别不限|男女都可|都可以/.test(text)) return '不限性别';
  const match = text.match(
    /(女生|女孩子|女性|男生|男孩子|男性)(?:优先|最好|比较好|都行|也可以)?/,
  );
  if (!match?.[1]) return undefined;
  if (/女/.test(match[1])) return text.includes('优先') ? '女生优先' : '女生';
  if (/男/.test(match[1])) return text.includes('优先') ? '男生优先' : '男生';
  return undefined;
}

function extractBodyPreference(text: string): string | undefined {
  if (/身材不限|不看身材|体型不限/.test(text)) return '身材不限';
  const match = text.match(
    /(身材匀称|体型匀称|爱运动|运动型|健康体型|瘦一点|偏瘦|高一点|高个子|不胖)/,
  );
  return match?.[1];
}

function extractAppearancePreference(text: string): string | undefined {
  if (/颜值不限|不看颜值|外貌不限|看感觉/.test(text))
    return '外貌不限，看聊得来';
  const match = text.match(
    /(颜值高|好看|清爽|干净|气质好|阳光|顺眼|照片真实|资料真实)/,
  );
  return match?.[1];
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

function mergeTags(...values: unknown[]): string[] {
  return values
    .flatMap((value) => normalizeTags(value))
    .filter((item, index, array) => array.indexOf(item) === index)
    .slice(0, 8);
}
