import { Injectable } from '@nestjs/common';

import { cleanDisplayText } from '../../common/display-text.util';

@Injectable()
export class PersonalizationService {
  lifeGraphSummary(signals?: Record<string, unknown> | null): string {
    if (!signals) {
      return '我对你的了解还不完整，会优先用公开场所、低压力和需要确认的方式推进。';
    }
    const behavior = this.record(signals.behaviorSignals);
    const summary = cleanDisplayText(behavior.summary, '');
    if (summary) return summary;
    const used = this.readSignals(signals);
    if (used.length === 0) {
      return '我对你的了解还不完整，会先补问时间、地点和社交边界。';
    }
    return `我对你的了解是：${used.join('，')}。`;
  }

  candidateRecommendationLine(input: {
    displayName: string;
    activityType?: string;
    reasons: string[];
  }): string {
    const activity = cleanDisplayText(input.activityType, '') || '这次见面';
    const reason = input.reasons[0] || '你们的时间、区域和边界比较接近';
    return `我推荐 ${input.displayName}，不是只看兴趣相同，而是因为${reason}，适合从一次轻松的${activity}开始。`;
  }

  whyNow(input: {
    timePreference?: unknown;
    locationText?: unknown;
    candidateCity?: unknown;
    distanceKm?: unknown;
  }): string {
    const time = cleanDisplayText(input.timePreference, '');
    const place =
      cleanDisplayText(input.locationText, '') ||
      cleanDisplayText(input.candidateCity, '');
    const distance =
      typeof input.distanceKm === 'number' && Number.isFinite(input.distanceKm)
        ? `${input.distanceKm.toFixed(1)} 公里`
        : '';
    if (time && place)
      return `${time}、${place}这个条件已经比较具体，可以先筛掉时间或区域不合适的人。`;
    if (time) return `${time}这个时间点比较明确，适合先看可约时间匹配的人。`;
    if (place || distance)
      return `${place || distance}附近更适合从公共场所的轻量见面开始。`;
    return '现在更适合先用低压力方式开场，再根据回复决定是否约见。';
  }

  lifeGraphUpdatePreview(activityType?: unknown): string {
    const activity = cleanDisplayText(activityType, '轻运动社交');
    return `这次完成后，我会把你的 Life Graph 更新为：近期更适合低压力的${activity}，并观察完成率、取消情况和你对同校或同区域搭子的反馈。你之后可以查看、撤回或纠正这些更新。`;
  }

  private readSignals(signals: Record<string, unknown>): string[] {
    const output: string[] = [];
    const identity = this.record(signals.identitySignals);
    const lifestyle = this.record(signals.lifestyleSignals);
    const fitness = this.record(signals.fitnessSignals);
    const social = this.record(signals.socialIntentSignals);
    const behavior = this.record(signals.behaviorSignals);
    const city = cleanDisplayText(identity.city, '');
    const nearbyArea = cleanDisplayText(identity.nearbyArea, '');
    const availableTimes = this.valueText(
      lifestyle.availableTimes ?? lifestyle.weekendAvailability,
    );
    const sports = this.valueText(fitness.sportsPreferences);
    const socialStyle = cleanDisplayText(social.preferredSocialStyle, '');
    const behaviorInsights = Array.isArray(behavior.insights)
      ? behavior.insights
          .map((item) => cleanDisplayText(item, ''))
          .filter(Boolean)
      : [];
    if (behaviorInsights.length) output.push(...behaviorInsights.slice(0, 3));
    if (availableTimes) output.push(`更适合${availableTimes}的安排`);
    if (sports) output.push(`偏好${sports}`);
    if (city || nearbyArea)
      output.push(`更容易接受${nearbyArea || city}附近的人`);
    if (socialStyle) output.push(`社交节奏偏${socialStyle}`);
    output.push('第一次见面优先公共场所');
    return output.slice(0, 5);
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private valueText(value: unknown): string {
    if (Array.isArray(value)) {
      return value
        .map((item) => cleanDisplayText(item, ''))
        .filter(Boolean)
        .join('、');
    }
    if (this.record(value).value)
      return this.valueText(this.record(value).value);
    return cleanDisplayText(value, '');
  }
}
