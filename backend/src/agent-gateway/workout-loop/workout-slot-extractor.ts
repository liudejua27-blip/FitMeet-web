import { cleanDisplayText } from '../../common/display-text.util';
import type { WorkoutSlotValidation, WorkoutSlots } from './workout-loop.types';

const DEFAULT_SAFETY_BOUNDARY =
  '默认安全设置：公共场所、站内沟通、不交换联系方式、不公开精确位置';

export function extractWorkoutSlots(input: {
  message: string;
  previousSlots?: Partial<WorkoutSlots>;
}): WorkoutSlots {
  const message = cleanDisplayText(input.message, '');
  const previous = input.previousSlots ?? {};
  return {
    activityType: extractActivity(message) ?? previous.activityType,
    timePreference: extractTime(message) ?? previous.timePreference,
    locationText: extractPlace(message) ?? previous.locationText,
    city: extractCity(message) ?? previous.city,
    radiusKm: extractRadius(message) ?? previous.radiusKm ?? 3,
    intensity: extractIntensity(message) ?? previous.intensity,
    candidatePreference:
      extractCandidatePreference(message) ?? previous.candidatePreference,
    safetyBoundary: previous.safetyBoundary ?? DEFAULT_SAFETY_BOUNDARY,
    visibilityPreference: previous.visibilityPreference ?? 'public',
  };
}

export function validateWorkoutSlots(
  slots: WorkoutSlots,
): WorkoutSlotValidation {
  const missing: WorkoutSlotValidation['missing'] = [];
  if (!slots.activityType) missing.push('activityType');
  if (!slots.timePreference) missing.push('timePreference');
  if (!slots.locationText && !slots.city) missing.push('locationText');
  return { valid: missing.length === 0, missing };
}

export function defaultWorkoutSafetyBoundary() {
  return DEFAULT_SAFETY_BOUNDARY;
}

function extractActivity(message: string): string | undefined {
  const activities = [
    '羽毛球',
    '篮球',
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
  if (matched === '慢跑') return '跑步';
  if (matched === '撸铁') return '健身';
  return matched;
}

function extractTime(message: string): string | undefined {
  const explicit = Array.from(
    message.matchAll(
      /(?:(今天|今晚|明天|后天|本周末|下周末|周末)\s*(上午|中午|下午|晚上|早上)?\s*(\d{1,2}\s*[点:：]\s*\d{0,2})?|(?:上午|中午|下午|晚上|早上)\s*(\d{1,2}\s*[点:：]\s*\d{0,2})?|(\d{1,2}\s*[点:：]\s*\d{0,2}))/g,
    ),
  )
    .map((match) => match[0]?.replace(/\s+/g, ''))
    .filter((value): value is string => Boolean(value));
  const scored = explicit
    .map((value) => ({
      value,
      score:
        (/(今天|今晚|明天|后天|本周末|下周末|周末)/.test(value) ? 2 : 0) +
        (/(上午|中午|下午|晚上|早上)/.test(value) ? 2 : 0) +
        (/(\d{1,2})[点:：]/.test(value) ? 3 : 0),
    }))
    .filter((item) => item.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || right.value.length - left.value.length,
    );
  if (scored[0]?.value) return scored[0].value;
  const weekday = message.match(
    /(周一|周二|周三|周四|周五|周六|周日|星期[一二三四五六日天])/,
  );
  return weekday?.[0];
}

function extractPlace(message: string): string | undefined {
  const suffixPlacePattern =
    /([\u4e00-\u9fa5A-Za-z0-9·•-]{2,32}?(?:(?:大学|学院|公园|广场|体育馆|健身房|球馆|操场|商场|校区|中心|海边|河边)(?:附近)?|附近))/g;
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
  return value
    .replace(/^.*(?:在|去|到|地点在|位置在)(?=[\u4e00-\u9fa5A-Za-z0-9·•-])/, '')
    .replace(
      /^(今天|今晚|明天|后天|周末|本周末|下周末|上午|中午|下午|晚上|早上)+/,
      '',
    )
    .replace(/^(我想在|想在|我在|在|去|到|地点在|位置在)/, '')
    .replace(/(找个?搭子|找人|一起|健身|跑步|运动|散步|打球).*$/, '')
    .trim();
}

function placeScore(value: string): number {
  return (
    (/(大学|学院|公园|广场|体育馆|健身房|球馆|操场|商场|校区|中心|海边|河边)/.test(
      value,
    )
      ? 3
      : 0) +
    (/(附近)$/.test(value) ? 1 : 0) -
    (/^(我|想|发布|约练|今天|明天|后天)/.test(value) ? 2 : 0)
  );
}

function extractCity(message: string): string | undefined {
  const cities = [
    '青岛',
    '北京',
    '上海',
    '杭州',
    '深圳',
    '广州',
    '南京',
    '成都',
    '武汉',
    '西安',
    '厦门',
    '苏州',
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
    /(希望|想找|最好|优先)(.{1,40})(?:一起|陪我|跑步|健身|运动|散步|打球|$)/,
  );
  return match?.[2]
    ?.replace(/^[个一位些\s，,。；;]+/, '')
    .replace(/(今天|今晚|明天|后天|上午|中午|下午|晚上|早上).*/, '')
    .trim();
}
