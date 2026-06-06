import { AiDelegateProfile } from '../ai-match/ai-delegate-profile.entity';
import { cleanDisplayText } from '../common/display-text.util';
import { sanitizeCity } from '../common/city.util';
import { User } from '../users/user.entity';
import { UserSocialProfile } from '../users/user-social-profile.entity';

export type CandidateProfileDataQuality = 'complete' | 'partial' | 'incomplete';

export function candidateProfileCompleteness(
  user: User,
  profile: UserSocialProfile | null,
  delegate: AiDelegateProfile | null,
): number {
  let score = 0;
  if (firstText(profile?.city, profile?.nearbyArea, user.city, delegate?.city))
    score += 30;
  if (candidateProfileTags(user, profile, delegate).length > 0) score += 30;
  if (
    normalizeArray(profile?.availableTimes).length > 0 ||
    profile?.weekdayAvailability ||
    profile?.weekendAvailability ||
    delegate?.availability
  ) {
    score += 15;
  }
  if (
    profile?.socialPreference ||
    normalizeArray(profile?.fitnessGoals).length > 0 ||
    delegate?.interests ||
    delegate?.trainingGoals
  ) {
    score += 15;
  }
  if (cleanDisplayText(profile?.nickname ?? user.name, '') || user.avatar)
    score += 10;
  return Math.min(1, score / 100);
}

export function candidateDataQuality(
  completeness: number,
): CandidateProfileDataQuality {
  if (completeness >= 0.85) return 'complete';
  if (completeness >= 0.4) return 'partial';
  return 'incomplete';
}

export function candidateProfileTags(
  user: User,
  profile: UserSocialProfile | null,
  delegate: AiDelegateProfile | null,
): string[] {
  return uniqueStrings([
    ...normalizeArray(user.interestTags),
    ...normalizeArray(profile?.interestTags),
    ...normalizeArray(profile?.fitnessGoals),
    ...normalizeArray(profile?.lifestyleTags),
    ...normalizeArray(profile?.socialScenes),
    ...normalizeArray(profile?.wantToMeet),
    ...normalizeArray(profile?.relationshipGoals),
    ...normalizeArray(profile?.traits),
    ...normalizeArray(delegate?.favoriteSports),
    ...extractKnownTags(delegate?.interests ?? ''),
    ...extractKnownTags(delegate?.trainingGoals ?? ''),
    ...extractKnownTags(delegate?.idealPartner ?? ''),
  ]);
}

export function candidateDisplayName(
  user: User,
  profile: UserSocialProfile | null,
  city: string,
): string {
  const profileName = cleanDisplayText(profile?.nickname, '');
  if (profileName && !isGeneratedFitMeetName(profileName)) return profileName;
  const userName = cleanDisplayText(user.name, '');
  if (userName && !isGeneratedFitMeetName(userName)) return userName;
  const cityName = sanitizeCity(city || user.city);
  return cityName ? `${cityName}用户 ${user.id}` : `已脱敏用户 ${user.id}`;
}

function normalizeArray(value: unknown): string[] {
  if (Array.isArray(value))
    return uniqueStrings(value.map((item) => String(item)));
  if (typeof value === 'string') {
    return uniqueStrings(value.split(/[、,，;；|]/u));
  }
  return [];
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

function extractKnownTags(text: string): string[] {
  const source = cleanDisplayText(text, '');
  if (!source) return [];
  const tags: Array<[string, RegExp]> = [
    ['咖啡', /咖啡|coffee/i],
    ['拍照', /拍照|摄影|photo/i],
    ['跑步', /跑步|running|跑团/i],
    ['羽毛球', /羽毛球|badminton/i],
    ['健身', /健身|撸铁|fitness|gym/i],
    ['瑜伽', /瑜伽|yoga/i],
    ['徒步', /徒步|hiking/i],
    ['骑行', /骑行|cycling/i],
    ['citywalk', /city\s*walk|citywalk|城市漫步|散步/i],
    ['学习', /学习|自习|study/i],
    ['电影', /电影|movie/i],
  ];
  return tags.filter(([, regex]) => regex.test(source)).map(([tag]) => tag);
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = cleanDisplayText(value, '');
    if (text) return text;
  }
  return '';
}

function isGeneratedFitMeetName(value: string): boolean {
  return /^fitmeet\s+user\b/i.test(value.trim());
}
