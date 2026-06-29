import { cleanDisplayText } from '../../common/display-text.util';
import { extractKnownCity, sanitizeCity } from '../../common/city.util';
import type { TravelSlotValidation, TravelSlots } from './travel-loop.types';

const DESTINATION =
  /(北京|上海|广州|深圳|杭州|成都|重庆|南京|苏州|武汉|西安|长沙|天津|厦门|青岛|大理|丽江|三亚|西藏|新疆|云南|川西|日本|韩国|泰国|新加坡|香港|澳门)/;
const TAGS = [
  '拍照',
  '美食',
  '徒步',
  '海边',
  '雪山',
  '博物馆',
  '城市漫游',
  '自驾',
  '穷游',
  '轻奢',
  '周边游',
  '出境游',
];

export function extractTravelSlots(input: {
  message: string;
  previousSlots?: Partial<TravelSlots>;
}): TravelSlots {
  const text = cleanDisplayText(input.message, '');
  const previous = input.previousSlots ?? {};
  return normalizeTravelSlots({
    ...previous,
    destination:
      cleanDisplayText(previous.destination, '') ||
      extractDestination(text) ||
      undefined,
    city: cleanDisplayText(previous.city, '') || extractCity(text) || undefined,
    geoResolution: previous.geoResolution,
    departureTime:
      cleanDisplayText(previous.departureTime, '') ||
      extractDepartureTime(text) ||
      undefined,
    duration:
      cleanDisplayText(previous.duration, '') ||
      extractDuration(text) ||
      undefined,
    budgetRange:
      cleanDisplayText(previous.budgetRange, '') ||
      extractBudget(text) ||
      undefined,
    transportMode:
      cleanDisplayText(previous.transportMode, '') ||
      extractTransport(text) ||
      undefined,
    tags:
      previous.tags && previous.tags.length > 0
        ? previous.tags
        : extractTags(text),
    genderPreference:
      cleanDisplayText(previous.genderPreference, '') ||
      extractGenderPreference(text) ||
      undefined,
    photoPreference:
      cleanDisplayText(previous.photoPreference, '') ||
      extractPhotoPreference(text) ||
      undefined,
    accommodationPreference:
      cleanDisplayText(previous.accommodationPreference, '') ||
      extractAccommodation(text) ||
      undefined,
    foodPreference:
      cleanDisplayText(previous.foodPreference, '') ||
      extractFoodPreference(text) ||
      undefined,
    candidatePreference:
      cleanDisplayText(previous.candidatePreference, '') ||
      extractCandidatePreference(text) ||
      undefined,
    safetyBoundary:
      cleanDisplayText(previous.safetyBoundary, '') ||
      defaultTravelSafetyBoundary(),
    visibilityPreference: 'private',
  });
}

export function validateTravelSlots(slots: TravelSlots): TravelSlotValidation {
  const missing: TravelSlotValidation['missing'] = [];
  if (!cleanDisplayText(slots.destination, '')) missing.push('destination');
  if (!cleanDisplayText(slots.departureTime, '')) missing.push('departureTime');
  if (!cleanDisplayText(slots.budgetRange, '')) missing.push('budgetRange');
  if (!cleanDisplayText(slots.transportMode, '')) missing.push('transportMode');
  return { valid: missing.length === 0, missing };
}

export function normalizeTravelSlots(
  value: Partial<TravelSlots> = {},
): TravelSlots {
  return {
    destination: cleanDisplayText(value.destination, '') || undefined,
    city: sanitizeCity(value.city) || undefined,
    geoResolution: value.geoResolution,
    departureTime: cleanDisplayText(value.departureTime, '') || undefined,
    duration: cleanDisplayText(value.duration, '') || undefined,
    budgetRange: cleanDisplayText(value.budgetRange, '') || undefined,
    transportMode: cleanDisplayText(value.transportMode, '') || undefined,
    tags: normalizeTags(value.tags),
    genderPreference: cleanDisplayText(value.genderPreference, '') || undefined,
    photoPreference: cleanDisplayText(value.photoPreference, '') || undefined,
    accommodationPreference:
      cleanDisplayText(value.accommodationPreference, '') || undefined,
    foodPreference: cleanDisplayText(value.foodPreference, '') || undefined,
    candidatePreference:
      cleanDisplayText(value.candidatePreference, '') || undefined,
    safetyBoundary:
      cleanDisplayText(value.safetyBoundary, '') ||
      defaultTravelSafetyBoundary(),
    visibilityPreference: 'private',
  };
}

export function defaultTravelSafetyBoundary() {
  return '默认安全设置：先站内沟通，确认行程前不交换联系方式，不公开证件、酒店或精确住址。';
}

function extractDestination(text: string): string | undefined {
  const direct = text.match(
    /(?:去|到|飞|结伴去|想去|目的地)([\u4e00-\u9fa5A-Za-z]{2,12})/,
  );
  if (direct?.[1]) return direct[1].replace(/旅游|旅行|出游|玩$/, '');
  const match = text.match(DESTINATION);
  return match?.[1];
}

function extractCity(text: string): string | undefined {
  return extractKnownCity(text) || undefined;
}

function extractDepartureTime(text: string): string | undefined {
  const match = text.match(
    /(今天|明天|后天|周末|本周末|下周末|五一|十一|国庆|春节|暑假|寒假|下个月|月底|年假|工作日|周[一二三四五六日天])/,
  );
  return match?.[1];
}

function extractDuration(text: string): string | undefined {
  const match = text.match(/(\d{1,2}\s*(天|晚)|一日游|两天一晚|三天两晚|半天)/);
  return match?.[1];
}

function extractBudget(text: string): string | undefined {
  const explicitAmount = extractBudgetAmount(text);
  if (explicitAmount) return explicitAmount;
  if (text.includes('穷游')) return '穷游';
  if (text.includes('轻奢')) return '轻奢';
  if (text.includes('AA') || text.includes('aa')) return 'AA';
  if (text.includes('预算') || text.includes('花费') || text.includes('费用')) {
    return '预算待确认';
  }
  return undefined;
}

function extractBudgetAmount(text: string): string | undefined {
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (!isAsciiDigit(char)) continue;
    let end = index;
    while (end < text.length && isAsciiDigit(text[end]) && end - index < 5) {
      end += 1;
    }
    const amount = text.slice(index, end);
    if (amount.length < 2) {
      index = end;
      continue;
    }
    const next = nextNonSpaceChar(text, end);
    const prefix = text.slice(Math.max(0, index - 4), index);
    if (
      next === '元' ||
      next === '块' ||
      prefix.includes('预算') ||
      prefix.includes('人均') ||
      prefix.includes('费用') ||
      prefix.includes('花费')
    ) {
      return `${amount}元`;
    }
    index = end;
  }
  return undefined;
}

function nextNonSpaceChar(text: string, start: number): string {
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char !== ' ' && char !== '\t' && char !== '\n' && char !== '\r') {
      return char;
    }
  }
  return '';
}

function isAsciiDigit(value: string | undefined): boolean {
  if (!value) return false;
  const code = value.charCodeAt(0);
  return code >= 48 && code <= 57;
}

function extractTransport(text: string): string | undefined {
  if (/自驾|开车/.test(text)) return '自驾';
  if (/高铁|动车/.test(text)) return '高铁';
  if (/飞机|机票|飞/.test(text)) return '飞机';
  if (/公交|地铁|公共交通/.test(text)) return '公共交通';
  return undefined;
}

function extractTags(text: string): string[] {
  return TAGS.filter((tag) => text.includes(tag)).slice(0, 8);
}

function extractGenderPreference(text: string): string | undefined {
  const match = text.match(/(女生|男生|不限性别|同性|异性)/);
  return match?.[1];
}

function extractPhotoPreference(text: string): string | undefined {
  if (/会拍照|拍照好|摄影/.test(text)) return '会拍照优先';
  if (/不拍照|少拍照/.test(text)) return '低拍照需求';
  return undefined;
}

function extractAccommodation(text: string): string | undefined {
  if (/青旅|青年旅舍/.test(text)) return '青旅';
  if (/酒店|民宿/.test(text)) return text.includes('民宿') ? '民宿' : '酒店';
  if (/不拼房|单独住/.test(text)) return '不拼房';
  return undefined;
}

function extractFoodPreference(text: string): string | undefined {
  if (/清淡/.test(text)) return '清淡';
  if (/辣|火锅/.test(text)) return '能吃辣';
  if (/美食|探店/.test(text)) return '美食探店';
  return undefined;
}

function extractCandidatePreference(text: string): string | undefined {
  const match = text.match(
    /(预算相近|时间合适|会拍照|不赶路|爱拍照|能早起|低压力|同城出发|女生|男生)/,
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
