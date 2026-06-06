import { cleanDisplayText } from '../common/display-text.util';
import { LifeGraphUnifiedMatchSignalsDto } from '../life-graph/dto/life-graph.dto';
import { User } from '../users/user.entity';

export type CandidateLifeGraphQuery = {
  rawText: string;
  activityType: string;
  interestTags: string[];
  timePreference?: string;
  locationPreference?: string;
};

export type CandidateLifeGraphBehaviorFitInput = {
  query: CandidateLifeGraphQuery;
  city: string;
  tags: string[];
  commonTags: string[];
  signals?: LifeGraphUnifiedMatchSignalsDto | null;
};

export function lifeGraphLocationBoost(
  candidateCity: string,
  signals: LifeGraphUnifiedMatchSignalsDto | null | undefined,
  cityMatches: (left: string, right: string) => boolean,
): number {
  if (!signals) return 0;
  const city = textSignal(signals.identitySignals.city);
  const nearbyArea = textSignal(signals.identitySignals.nearbyArea);
  if (city && candidateCity && cityMatches(city, candidateCity))
    return nearbyArea ? 4 : 3;
  return nearbyArea ? 1 : 0;
}

export function lifeGraphTimeBoost(
  signals?: LifeGraphUnifiedMatchSignalsDto | null,
): number {
  if (!signals) return 0;
  const text = [
    textSignal(signals.lifestyleSignals.availableTimes),
    textSignal(signals.lifestyleSignals.weekendAvailability),
    textSignal(signals.lifestyleSignals.activeHours),
  ].join(' ');
  if (/周末|下午|上午|晚上|weekend|morning|afternoon|evening/i.test(text))
    return 3;
  return 0;
}

export function lifeGraphSportBoost(
  tags: string[],
  signals?: LifeGraphUnifiedMatchSignalsDto | null,
): number {
  const sports = signalList(signals?.fitnessSignals.sportsPreferences);
  if (sports.length === 0) return 0;
  return sports.some((sport) =>
    tags.some(
      (tag) =>
        tag.toLowerCase().includes(sport.toLowerCase()) ||
        sport.toLowerCase().includes(tag.toLowerCase()),
    ),
  )
    ? 5
    : 0;
}

export function lifeGraphRhythmBoost(
  signals?: LifeGraphUnifiedMatchSignalsDto | null,
): number {
  return signals?.lifestyleSignals.availableTimes ||
    signals?.lifestyleSignals.weekendAvailability
    ? 2
    : 0;
}

export function lifeGraphGoalBoost(
  query: CandidateLifeGraphQuery,
  tags: string[],
  signals?: LifeGraphUnifiedMatchSignalsDto | null,
): number {
  const goal = [
    textSignal(signals?.socialIntentSignals.currentSocialGoal),
    textSignal(signals?.socialIntentSignals.relationshipGoal),
  ].join(' ');
  if (!goal.trim()) return 0;
  const text = [
    query.rawText,
    query.activityType,
    ...query.interestTags,
    ...tags,
  ].join(' ');
  return goal
    .split(/[、,\s]+/)
    .filter(Boolean)
    .some((part) => text.includes(part))
    ? 2
    : 1;
}

export function lifeGraphBehaviorFit(
  input: CandidateLifeGraphBehaviorFitInput,
  cityMatches: (left: string, right: string) => boolean,
): number {
  const behavior = input.signals?.behaviorSignals;
  if (!behavior) return 0;
  const weights = behavior.recommendationWeights;
  const guidance = behavior.matchingGuidance;
  const text = [
    input.query.rawText,
    input.query.activityType,
    ...input.query.interestTags,
    ...input.tags,
    ...input.commonTags,
  ].join(' ');
  let score = 0;
  score += Math.round(
    unitScore(weights?.reliability ?? behavior.scores?.reliability) * 4,
  );
  score += Math.round(
    unitScore(weights?.sports ?? behavior.scores?.sportsAffinity) * 3,
  );
  if (behavior.completionTrend === 'reliable') score += 2;
  if (behavior.cancellationPattern === 'frequent') score -= 3;
  if (behavior.cancellationPattern === 'rare') score += 1;
  if (
    (guidance?.shouldPreferLowPressure ||
      behavior.pressurePreference === 'low') &&
    looksLikeLowPressure(text)
  ) {
    score += Math.round(
      unitScore(weights?.lowPressure ?? behavior.scores?.lowPressureFit) * 4,
    );
  }
  if (
    (guidance?.shouldPreferSameSchoolOrArea ||
      behavior.locationPreference === 'same_school_or_area') &&
    looksLikeSameSchoolOrArea(text, input.city, input.signals)
  ) {
    score += Math.max(2, Math.round(unitScore(weights?.sameSchoolOrArea) * 4));
  }
  if (
    (guidance?.shouldPreferSameCity ||
      behavior.locationPreference === 'same_city') &&
    cityMatches(textSignal(input.signals?.identitySignals.city), input.city)
  ) {
    score += Math.max(1, Math.round(unitScore(weights?.sameCity) * 3));
  }
  if (
    (guidance?.shouldPreferCommonInterest ||
      behavior.locationPreference === 'interest_first') &&
    input.commonTags.length > 0
  ) {
    score += Math.max(1, Math.round(unitScore(weights?.commonInterest) * 3));
  }
  if (
    (behavior.feedbackPattern ?? []).some((item) =>
      text.toLowerCase().includes(item.toLowerCase()),
    )
  ) {
    score += 2;
  }
  if (
    (guidance?.shouldAvoidNight ||
      behavior.nightBoundary === 'avoids_late_private') &&
    looksLikeLateNight(text)
  ) {
    score -= 6;
  }
  if (guidance?.shouldReduceDisturbance && !looksLikeLowPressure(text)) {
    score -= 2;
  }
  return Math.max(0, Math.min(12, score));
}

export function lifeGraphBoundaryFit(
  query: CandidateLifeGraphQuery,
  signals?: LifeGraphUnifiedMatchSignalsDto | null,
): number {
  if (!signals) return 0;
  const text = [
    query.rawText,
    query.activityType,
    query.timePreference,
    query.locationPreference,
  ].join(' ');
  let score = 0;
  if (signals.safetySignals.publicPlaceOnly) score += 2;
  if (signals.safetySignals.strictConfirmationRequired) score += 1;
  if (signals.safetySignals.locationSharingAllowed === false) score += 1;
  if (
    (signals.behaviorSignals?.matchingGuidance?.shouldAvoidNight ||
      signals.behaviorSignals?.nightBoundary === 'avoids_late_private') &&
    looksLikeLateNight(text)
  ) {
    score -= 4;
  }
  if (
    signals.safetySignals.acceptsNightMeet === false &&
    looksLikeLateNight(text)
  ) {
    score -= 3;
  }
  return Math.max(0, Math.min(6, score));
}

export function lifeGraphSafetyPenalty(
  candidate: Pick<User, 'verified'>,
  signals?: LifeGraphUnifiedMatchSignalsDto | null,
): number {
  if (!signals) return 0;
  let penalty = 0;
  if (signals.safetySignals.realNameRequired && !candidate.verified)
    penalty += 2;
  if (signals.safetySignals.acceptsNightMeet === false) penalty += 1;
  return penalty;
}

function unitScore(value: unknown): number {
  const score = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(score)) return 0;
  const normalized = score > 1 ? score / 100 : score;
  return Math.max(0, Math.min(1, normalized));
}

function looksLikeLowPressure(text: string): boolean {
  return /低压力|轻松|散步|走走|慢跑|慢热|不尴尬|low\s*pressure|walk|jog/i.test(
    text,
  );
}

function looksLikeLateNight(text: string): boolean {
  return /深夜|凌晨|太晚|晚上|夜里|night|late/i.test(text);
}

function looksLikeSameSchoolOrArea(
  text: string,
  candidateCity: string,
  signals?: LifeGraphUnifiedMatchSignalsDto | null,
): boolean {
  const area = textSignal(signals?.identitySignals.nearbyArea);
  if (area && text.includes(area)) return true;
  return (
    /同校|校内|校园|大学|school|campus/i.test(text) || Boolean(candidateCity)
  );
}

function textSignal(value: unknown): string {
  if (Array.isArray(value))
    return value
      .map((item) => firstText(item))
      .filter(Boolean)
      .join(' ');
  return firstText(value);
}

function signalList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => firstText(item)).filter(Boolean)
    : firstText(value)
      ? [firstText(value)]
      : [];
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = cleanDisplayText(value, '');
    if (text) return text;
  }
  return '';
}
