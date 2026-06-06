import { cleanDisplayText } from '../common/display-text.util';
import { LifeGraphUnifiedMatchSignalsDto } from '../life-graph/dto/life-graph.dto';

export type SocialMatchDynamicExplanation = {
  whyYouMayLike: string;
  whyNow: string;
  matchPoints: string[];
  boundaryNotes: string[];
  openerStrategy: string;
  dynamicSignalReasons: string[];
  continuousFilterHints: string[];
};

export type SocialMatchDynamicExplanationInput = {
  displayName: string;
  city: string;
  interestTags: string[];
  commonTags: string[];
  matchReasons: string[];
  scoreBreakdown: Record<string, number>;
  riskWarnings: string[];
  lifeGraphSignals?: LifeGraphUnifiedMatchSignalsDto | null;
};

export function buildSocialMatchDynamicExplanation(
  input: SocialMatchDynamicExplanationInput,
): SocialMatchDynamicExplanation {
  const behavior = input.lifeGraphSignals?.behaviorSignals;
  const safety = input.lifeGraphSignals?.safetySignals;
  const guidance = behavior?.matchingGuidance;
  const commonTags = input.commonTags.slice(0, 3);
  const matchPoints = uniqueStrings([
    input.city ? `你们的活动区域都在 ${input.city} 附近。` : '',
    commonTags.length > 0 ? `你们有共同兴趣：${commonTags.join('、')}。` : '',
    guidance?.shouldPreferLowPressure || behavior?.pressurePreference === 'low'
      ? '你最近更适合低压力社交，这个推荐适合先轻松聊起。'
      : '',
    guidance?.shouldPreferSports || behavior?.socialEnergy === 'sports'
      ? '你最近更偏运动型连接，适合从一次轻运动开始。'
      : '',
    behavior?.completionTrend === 'reliable'
      ? '你的约练完成趋势比较稳定，可以推进到明确但不冒进的计划。'
      : '',
    guidance?.shouldPreferSameSchoolOrArea ||
    behavior?.locationPreference === 'same_school_or_area'
      ? '你更容易接受同校或活动区域接近的人。'
      : '',
    ...input.matchReasons.slice(0, 3),
  ]).slice(0, 6);
  const boundaryNotes = uniqueStrings([
    safety?.publicPlaceOnly
      ? '第一次建议选择校园操场、公园或其他公共场所。'
      : '',
    safety?.locationSharingAllowed === false ? '不建议直接共享精确位置。' : '',
    guidance?.shouldAvoidNight ||
    behavior?.nightBoundary === 'avoids_late_private'
      ? '如果时间偏晚，优先改到白天或人多的公开区域。'
      : '',
    ...input.riskWarnings,
  ]).slice(0, 4);
  const dynamicSignalReasons = uniqueStrings([
    behavior?.summary,
    ...(behavior?.insights ?? []),
    ...(guidance?.rankingNotes ?? []),
    behavior?.completionTrend === 'fragile'
      ? '最近活动履约趋势需要更轻的安排。'
      : '',
    behavior?.cancellationPattern === 'frequent'
      ? '最近取消较多，建议先用更短、更轻的活动试探。'
      : '',
    behavior?.feedbackPattern?.length
      ? `你近期反馈更偏向：${behavior.feedbackPattern.slice(0, 3).join('、')}。`
      : '',
  ]).slice(0, 5);
  const topReason =
    matchPoints[0] ?? '这个候选人的活动节奏和这次需求有可对齐的地方。';
  const behaviorScore = input.scoreBreakdown.lifeGraphBehaviorFit ?? 0;
  const whyYouMayLike =
    behaviorScore > 0
      ? `我推荐 ${input.displayName}，不是只因为分数高，而是因为 ${topReason}`
      : `我推荐 ${input.displayName}，因为 ${topReason}`;
  const whyNow = socialMatchWhyNow(input, behaviorScore);
  const openerStrategy =
    behavior?.pressurePreference === 'low'
      ? '开场先轻一点，先确认时间和强度，不要一上来就给对方压力。'
      : '开场可以直接但克制：说明共同兴趣、可选时间和公共地点，让对方有选择空间。';

  return {
    whyYouMayLike,
    whyNow,
    matchPoints,
    boundaryNotes:
      boundaryNotes.length > 0
        ? boundaryNotes
        : ['第一次建议先站内沟通，选择公共场所，不共享精确位置。'],
    openerStrategy,
    dynamicSignalReasons,
    continuousFilterHints: uniqueStrings([
      ...(guidance?.suggestedFilters ?? []),
      '只看同校',
      '不要晚上',
      '换成散步',
      '只看低压力',
      '不想要这个类型',
    ]).slice(0, 6),
  };
}

function socialMatchWhyNow(
  input: Pick<
    SocialMatchDynamicExplanationInput,
    'city' | 'interestTags' | 'commonTags' | 'lifeGraphSignals'
  >,
  behaviorScore: number,
): string {
  const behavior = input.lifeGraphSignals?.behaviorSignals;
  const activity = input.commonTags[0] ?? input.interestTags[0] ?? '轻松认识';
  if (behavior?.activityLevel === 'quiet') {
    return `现在更适合从低压力的 ${activity} 开始，不需要一下子进入强社交。`;
  }
  if (behavior?.socialEnergy === 'sports') {
    return `你最近更偏运动社交，适合把认识新人放在 ${activity} 这种自然场景里。`;
  }
  if (behaviorScore > 0) {
    return '这次推荐和你最近的生活节奏、边界偏好有重合，适合先试一次轻量连接。';
  }
  return input.city
    ? `你们的活动区域都在 ${input.city}，适合先从一次轻量沟通开始。`
    : '这次需求比较明确，适合先从轻量沟通开始确认时间和边界。';
}

function uniqueStrings(values: unknown[]): string[] {
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
