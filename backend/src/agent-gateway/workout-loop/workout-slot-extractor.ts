import { cleanDisplayText } from '../../common/display-text.util';
import type {
  WorkoutRequiredSlot,
  WorkoutSlotValidation,
  WorkoutSlots,
} from './workout-loop.types';

const DEFAULT_SAFETY_BOUNDARY =
  '默认安全设置：公共场所、站内沟通、不交换联系方式、不公开精确位置';
const PLACE_MARKERS = [
  '地点在',
  '位置在',
  '我想在',
  '想在',
  '我在',
  '在',
  '去',
  '到',
];
const PLACE_TIME_PREFIXES = [
  '今天',
  '今晚',
  '明天',
  '明晚',
  '后天',
  '周末',
  '本周末',
  '下周末',
  '上午',
  '中午',
  '下午',
  '晚上',
  '早上',
];
const PLACE_STOP_WORDS = [
  '找个搭子',
  '找搭子',
  '找人',
  '一起',
  '健身',
  '跑步',
  '夜跑',
  '运动',
  '散步',
  '打球',
];

export function extractWorkoutSlots(input: {
  message: string;
  previousSlots?: Partial<WorkoutSlots>;
}): WorkoutSlots {
  const message = cleanDisplayText(input.message, '');
  const previous = input.previousSlots ?? {};
  const activityType = extractActivity(message) ?? previous.activityType;
  const timePreference = extractTime(message) ?? previous.timePreference;
  const locationText = extractPlace(message) ?? previous.locationText;
  const city = extractCity(message) ?? previous.city;
  const radiusKm = extractRadius(message) ?? previous.radiusKm ?? 3;
  const intensity = extractIntensity(message) ?? previous.intensity;
  const candidatePreference =
    extractCandidatePreference(message) ?? previous.candidatePreference;
  return {
    activityType,
    timePreference,
    locationText,
    city,
    radiusKm,
    intensity,
    candidatePreference,
    slotMeta: {
      ...(previous.slotMeta ?? {}),
      ...(activityType && activityType !== previous.activityType
        ? { activityType: { source: 'rule' as const, confidence: 0.72 } }
        : {}),
      ...(timePreference && timePreference !== previous.timePreference
        ? { timePreference: { source: 'rule' as const, confidence: 0.7 } }
        : {}),
      ...(locationText && locationText !== previous.locationText
        ? { locationText: { source: 'rule' as const, confidence: 0.64 } }
        : {}),
      ...(city && city !== previous.city
        ? { city: { source: 'rule' as const, confidence: 0.78 } }
        : {}),
      ...(intensity && intensity !== previous.intensity
        ? { intensity: { source: 'rule' as const, confidence: 0.65 } }
        : {}),
      ...(candidatePreference &&
      candidatePreference !== previous.candidatePreference
        ? {
            candidatePreference: {
              source: 'rule' as const,
              confidence: 0.62,
            },
          }
        : {}),
    },
    safetyBoundary: previous.safetyBoundary ?? DEFAULT_SAFETY_BOUNDARY,
    visibilityPreference: previous.visibilityPreference ?? 'public',
  };
}

export function validateWorkoutSlots(
  slots: WorkoutSlots,
): WorkoutSlotValidation {
  return validateWorkoutSlotsForDraft(slots);
}

export function validateWorkoutSlotsForDraft(
  slots: WorkoutSlots,
): WorkoutSlotValidation {
  const missing: WorkoutRequiredSlot[] = [];
  if (!slots.activityType) missing.push('activityType');
  if (!slots.timePreference) missing.push('timePreference');
  if (!slots.locationText && !slots.city) missing.push('locationText');
  return { valid: missing.length === 0, missing };
}

export function validateWorkoutSlotsForPublish(
  slots: WorkoutSlots,
): WorkoutSlotValidation {
  const validation = validateWorkoutSlotsForDraft(slots);
  const missing = [...validation.missing];
  if (!slots.city) missing.push('city');
  if (!slots.locationText) missing.push('locationText');
  return {
    valid: missing.length === 0,
    missing: Array.from(new Set(missing)),
  };
}

export function defaultWorkoutSafetyBoundary() {
  return DEFAULT_SAFETY_BOUNDARY;
}

function extractActivity(message: string): string | undefined {
  const activities = [
    '羽毛球',
    '篮球',
    'citywalk',
    'city walk',
    '练肩',
    '夜跑',
    '跑步',
    '慢跑',
    '健身',
    '撸铁',
    '散步',
    '徒步',
    '骑行',
    '瑜伽',
    '游泳',
  ];
  const matched = activities.find((item) => message.includes(item));
  if (!matched) return undefined;
  if (matched === 'city walk') return 'citywalk';
  if (matched === '练肩') return '健身';
  if (matched === '夜跑') return '跑步';
  if (matched === '慢跑') return '跑步';
  if (matched === '撸铁') return '健身';
  return matched;
}

function extractTime(message: string): string | undefined {
  const explicit = Array.from(
    message.matchAll(
      /(?:(今天|今晚|明天|明晚|后天|本周末|下周末|周末)\s*(上午|中午|下午|晚上|早上)?\s*(\d{1,2}\s*[点:：]\s*\d{0,2})?|(?:上午|中午|下午|晚上|早上)\s*(\d{1,2}\s*[点:：]\s*\d{0,2})?|(\d{1,2}\s*[点:：]\s*\d{0,2}))/g,
    ),
  )
    .map((match) => match[0]?.replace(/\s+/g, ''))
    .filter((value): value is string => Boolean(value));
  const scored = explicit
    .map((value) => ({
      value,
      score:
        (/(今天|今晚|明天|明晚|后天|本周末|下周末|周末)/.test(value) ? 2 : 0) +
        (/(上午|中午|下午|晚上|早上)/.test(value) ? 2 : 0) +
        (/(\d{1,2})[点:：]/.test(value) ? 3 : 0),
    }))
    .filter((item) => item.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || right.value.length - left.value.length,
    );
  if (scored[0]?.value) return scored[0].value;
  const relative = message.match(
    /(下班后|工作日晚上|夜跑|这周末|本周末|下周末)/,
  );
  if (relative?.[0]) return relative[0] === '夜跑' ? '夜间' : relative[0];
  const weekday = message.match(
    /((?:周一|周二|周三|周四|周五|周六|周日|星期[一二三四五六日天])(?:上午|中午|下午|晚上|早上|下班后)?)/,
  );
  return weekday?.[0];
}

function extractPlace(message: string): string | undefined {
  const suffixPlacePattern =
    /([\u4e00-\u9fa5A-Za-z0-9·•-]{2,32}?(?:(?:大学|学院|公园|广场|体育馆|健身房|球馆|操场|商场|校区|中心|海边|河边|湖)(?:附近)?|附近))/g;
  const candidates = Array.from(message.matchAll(suffixPlacePattern))
    .map((match) => cleanPlaceText(match[1] ?? ''))
    .filter(Boolean)
    .sort(
      (left, right) =>
        placeScore(right) - placeScore(left) || left.length - right.length,
    );
  if (candidates[0]) return candidates[0];
  const around = message.match(
    /(?:在|去|到|地点在|位置在)\s*([\u4e00-\u9fa5A-Za-z0-9·•-]{2,24})/,
  );
  return around?.[1] ? cleanPlaceText(around[1]) : undefined;
}

function cleanPlaceText(value: string): string {
  let text = value.trim();
  const marker = lastMarker(text, PLACE_MARKERS);
  if (marker) text = text.slice(marker.index + marker.value.length).trim();
  text = removeLeadingTokens(text, PLACE_TIME_PREFIXES);
  text = removeLeadingTokens(text, PLACE_MARKERS);
  const stopIndex = firstTokenIndex(text, PLACE_STOP_WORDS);
  if (stopIndex >= 0) text = text.slice(0, stopIndex);
  return text.trim();
}

function lastMarker(
  text: string,
  markers: string[],
): { index: number; value: string } | null {
  let result: { index: number; value: string } | null = null;
  for (const marker of markers) {
    const index = text.lastIndexOf(marker);
    if (index >= 0 && (!result || index > result.index)) {
      result = { index, value: marker };
    }
  }
  return result;
}

function removeLeadingTokens(text: string, tokens: string[]): string {
  let next = text.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const token of tokens) {
      if (next.startsWith(token)) {
        next = next.slice(token.length).trim();
        changed = true;
        break;
      }
    }
  }
  return next;
}

function firstTokenIndex(text: string, tokens: string[]): number {
  return tokens.reduce((first, token) => {
    const index = text.indexOf(token);
    if (index < 0) return first;
    return first < 0 ? index : Math.min(first, index);
  }, -1);
}

function placeScore(value: string): number {
  return (
    (/(大学|学院|公园|广场|体育馆|健身房|球馆|操场|商场|校区|中心|海边|河边|湖)/.test(
      value,
    )
      ? 3
      : 0) +
    (/(附近)$/.test(value) ? 1 : 0) -
    (/^(我|想|发布|约练|今天|明天|明晚|后天)/.test(value) ? 2 : 0)
  );
}

function extractCity(message: string): string | undefined {
  const cities = [
    '北京',
    '上海',
    '广州',
    '深圳',
    '杭州',
    '成都',
    '重庆',
    '南京',
    '苏州',
    '武汉',
    '西安',
    '长沙',
    '郑州',
    '天津',
    '青岛',
    '济南',
    '厦门',
    '宁波',
    '合肥',
    '大连',
    '沈阳',
    '昆明',
    '佛山',
    '东莞',
    '无锡',
    '珠海',
    '南昌',
    '南宁',
    '贵阳',
    '太原',
    '石家庄',
    '哈尔滨',
    '长春',
    '兰州',
    '海口',
    '三亚',
    '香港',
    '澳门',
    '台北',
  ];
  return cities.find((city) => message.includes(city));
}

function extractRadius(message: string): number | undefined {
  const match = message.match(/(\d{1,3})\s*(?:km|公里|千米)/i);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.min(value, 50);
}

function extractIntensity(message: string): string | undefined {
  if (/(轻松|低强度|慢一点|休闲)/.test(message)) return '轻松';
  if (/(中等|正常强度|适中)/.test(message)) return '中等';
  if (/(高强度|认真练|进阶|冲刺)/.test(message)) return '进阶';
  return undefined;
}

function extractCandidatePreference(message: string): string | undefined {
  const explicit = message.match(
    /(最好|希望|想找|优先).{0,16}(男生|女生|男性|女性|同校|同学|朋友|新手|高手|轻松一点|水平相近)/,
  );
  if (explicit?.[2]) return explicit[2].trim();
  const match = message.match(
    /(希望|想找|最好|优先)(.{1,40})(?:一起|陪我|跑步|夜跑|健身|运动|散步|打球|$)/,
  );
  return match?.[2]
    ?.replace(/^[个一位些\s，,。；;]+/, '')
    .replace(/(今天|今晚|明天|明晚|后天|上午|中午|下午|晚上|早上).*/, '')
    .trim();
}
