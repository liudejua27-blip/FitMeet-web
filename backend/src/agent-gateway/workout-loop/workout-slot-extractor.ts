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
  const explicit = message.match(
    /(今天|今晚|明天|后天|周末|本周末|下周末)?\s*(上午|中午|下午|晚上|早上)?\s*(\d{1,2}\s*[点:：]\s*\d{0,2})?/,
  );
  const raw = explicit?.[0]?.replace(/\s+/g, '');
  if (
    raw &&
    /(今天|今晚|明天|后天|周末|上午|中午|下午|晚上|早上|\d{1,2}[点:：])/.test(
      raw,
    )
  ) {
    return raw;
  }
  const weekday = message.match(
    /(周一|周二|周三|周四|周五|周六|周日|星期[一二三四五六日天])/,
  );
  return weekday?.[0];
}

function extractPlace(message: string): string | undefined {
  const near = message.match(
    /([\u4e00-\u9fa5A-Za-z0-9·•-]{2,24}(?:大学|学院|公园|广场|体育馆|健身房|球馆|操场|商场|校区|中心|海边|河边|附近))/,
  );
  if (near?.[1]) return cleanPlaceText(near[1]);
  const around = message.match(
    /(?:在|去|到|地点在|位置在)\s*([\u4e00-\u9fa5A-Za-z0-9·•-]{2,24})/,
  );
  return around?.[1] ? cleanPlaceText(around[1]) : undefined;
}

function cleanPlaceText(value: string): string {
  return value
    .replace(
      /^(今天|今晚|明天|后天|周末|本周末|下周末|上午|中午|下午|晚上|早上)+/,
      '',
    )
    .trim();
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
  const match = message.match(
    /(希望|想找|最好|优先)(.{1,40})(?:一起|陪我|跑步|健身|运动|散步|打球|$)/,
  );
  return match?.[2]?.trim();
}
