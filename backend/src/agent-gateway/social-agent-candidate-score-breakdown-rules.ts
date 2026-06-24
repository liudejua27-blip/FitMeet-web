import { AiDelegateProfile } from '../ai-match/ai-delegate-profile.entity';
import { LifeGraphUnifiedMatchSignalsDto } from '../life-graph/dto/life-graph.dto';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import { SceneRiskPolicyService } from './scene-risk-policy.service';
import type { CandidatePoolResolvedQuery } from './social-agent-candidate-pool-query';
import { normalizeCandidatePoolArray } from './social-agent-candidate-pool-query';

export type CandidateScoreSceneRisk = Pick<
  SceneRiskPolicyService,
  'evaluate' | 'normalizeScene'
>;

export function candidateLifeRhythmScore(
  profile: UserSocialProfile | null,
  delegate: AiDelegateProfile | null,
): number {
  const text = [
    ...normalizeCandidatePoolArray(profile?.availableTimes),
    profile?.weekdayAvailability ?? '',
    profile?.weekendAvailability ?? '',
    ...normalizeCandidatePoolArray(profile?.lifestyleTags),
    ...normalizeCandidatePoolArray(profile?.socialScenes),
    delegate?.availability ?? '',
  ].join(' ');
  if (!text.trim()) return 4;
  if (/周末|白天|规律|早睡|morning|weekend|day/i.test(text)) return 10;
  if (/晚上|夜间|night|evening/i.test(text)) return 7;
  return 6;
}

export function candidateSocialEnergyScore(
  profile: UserSocialProfile | null,
  delegate: AiDelegateProfile | null,
): number {
  const text = [
    profile?.socialStyle,
    profile?.openness,
    profile?.socialPreference,
    ...(profile?.traits ?? []),
    delegate?.idealPartner,
  ]
    .filter(Boolean)
    .join(' ');
  if (!text.trim()) return 4;
  if (/适中|稳定|随和|balanced|medium/i.test(text)) return 8;
  if (/主动|外向|热情|开放|active|open|extrovert/i.test(text)) return 7;
  if (/慢热|安静|内向|克制|quiet|introvert/i.test(text)) return 6;
  return 5;
}

export function candidateSocialBoundaryScore(
  query: CandidatePoolResolvedQuery,
  profile: UserSocialProfile | null,
  delegate: AiDelegateProfile | null,
): number {
  const text = [
    profile?.openness,
    profile?.socialPreference,
    profile?.socialStyle,
    ...(profile?.relationshipGoals ?? []),
    ...(profile?.traits ?? []),
    delegate?.idealPartner,
  ]
    .filter(Boolean)
    .join(' ');
  if (query.acceptsStrangers === false) return 0;
  if (!text.trim()) return query.acceptsStrangers === true ? 5 : 4;
  if (/不接受陌生人|只熟人|拒绝陌生|private|closed/i.test(text)) return 1;
  if (
    /接受陌生人|认识新朋友|新朋友|公开|开放|低压力|慢热|边界|尊重|open|new\s*friends|low\s*pressure|boundary/i.test(
      text,
    )
  ) {
    return query.acceptsStrangers === true ? 8 : 6;
  }
  return query.acceptsStrangers === true ? 6 : 5;
}

export function publicIntentSocialBoundaryScore(
  query: CandidatePoolResolvedQuery,
): number {
  if (query.acceptsStrangers === false) return 0;
  return query.acceptsStrangers === true ? 8 : 6;
}

export function candidateRelationshipGoalScore(
  query: CandidatePoolResolvedQuery,
  tags: string[],
): number {
  const text = [
    query.rawText,
    query.activityType,
    ...query.interestTags,
    ...tags,
  ].join(' ');
  if (/相亲|恋爱|对象|dating|date/i.test(text)) return 10;
  if (/搭子|约练|跑步|健身|麻将|扑克|旅行|旅游|partner|buddy/i.test(text))
    return 9;
  if (/朋友|聊天|认识|friend|social/i.test(text)) return 8;
  if (/学习|自习|study/i.test(text)) return 7;
  return 5;
}

export function candidatePreferenceFitScore(input: {
  query: CandidatePoolResolvedQuery;
  candidateSignals: unknown[];
}): number {
  const preference = normalizeCandidatePreference(
    input.query.candidatePreference,
  );
  if (!preference) return 0;
  const haystack = input.candidateSignals
    .flatMap(signalToStrings)
    .join(' ')
    .toLowerCase();
  if (!haystack) return 0;
  const tokens = preferenceTokens(preference);
  const hits = tokens.filter((token) => textContains(haystack, token));
  if (hits.length === 0) return 0;
  return Math.min(10, hits.length * 4 + (hits.length >= 2 ? 2 : 0));
}

export function candidateSafetyRiskScore(
  riskLevel: ReturnType<SceneRiskPolicyService['evaluate']>['riskLevel'],
): number {
  if (riskLevel === 'critical') return 0;
  if (riskLevel === 'high') return 3;
  if (riskLevel === 'medium') return 6;
  return 9;
}

export function evaluateCandidateScoreSceneRisk(input: {
  query: CandidatePoolResolvedQuery;
  tags: string[];
  lifeGraphSignals?: LifeGraphUnifiedMatchSignalsDto | null;
  sceneRisk: CandidateScoreSceneRisk;
}): ReturnType<SceneRiskPolicyService['evaluate']> {
  const sceneType = input.sceneRisk.normalizeScene(
    null,
    [
      input.query.rawText,
      input.query.activityType,
      ...input.query.interestTags,
      ...input.tags,
    ].join(' '),
  );
  return input.sceneRisk.evaluate({
    sceneType,
    actionType: 'send_message',
    text: input.query.rawText,
    permissionMode: 'limited_auto',
    safetySignals: input.lifeGraphSignals?.safetySignals,
  });
}

export function candidateProfileTimeMatches(
  queryTime: string,
  profile: UserSocialProfile | null,
  delegate: AiDelegateProfile | null,
): number {
  if (!queryTime) return 8;
  const text = [
    ...normalizeCandidatePoolArray(profile?.availableTimes),
    profile?.weekdayAvailability,
    profile?.weekendAvailability,
    delegate?.availability,
  ]
    .filter(Boolean)
    .join(' ');
  if (!text) return 4;
  return text.includes(queryTime) || queryTime.includes(text) ? 15 : 8;
}

function normalizeCandidatePreference(value: unknown): string {
  return safeText(value).trim();
}

function preferenceTokens(preference: string): string[] {
  const tokens = [
    ...normalizeCandidatePoolArray(preference),
    ...preference
      .split(/[,\s，、/]+/u)
      .map((item) => item.trim())
      .filter(Boolean),
  ];
  if (/女生|女孩|女性|女同学|女大学生|female/i.test(preference)) {
    tokens.push('女生', '女性', 'female');
  }
  if (/男生|男孩|男性|男同学|男大学生|male/i.test(preference)) {
    tokens.push('男生', '男性', 'male');
  }
  if (/同校|校友|大学生|学生|青岛大学/i.test(preference)) {
    tokens.push('同校', '学生', '大学生', '青岛大学');
  }
  if (/舞蹈|跳舞|舞者|dance/i.test(preference)) {
    tokens.push('舞蹈', '跳舞', 'dance');
  }
  if (/低压力|轻松|慢热|安全感|边界/i.test(preference)) {
    tokens.push('低压力', '轻松', '慢热', '边界');
  }
  return uniqueStrings(tokens).filter((token) => token.length >= 2);
}

function textContains(haystack: string, token: string): boolean {
  const needle = token.toLowerCase();
  if (!needle) return false;
  return (
    haystack.includes(needle) ||
    haystack
      .split(/[,\s，、/]+/u)
      .filter(Boolean)
      .some((part) => needle.includes(part) || part.includes(needle))
  );
}

function uniqueStrings(values: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const text = safeText(value).trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function signalToStrings(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(signalToStrings);
  const text = safeText(value).trim();
  return text ? [text] : [];
}

function safeText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}
