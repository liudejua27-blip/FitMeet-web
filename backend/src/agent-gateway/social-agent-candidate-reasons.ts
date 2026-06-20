import { cleanDisplayText } from '../common/display-text.util';
import { candidateCityMatches } from './social-agent-candidate-scoring';

type CandidateReasonQuery = {
  city: string;
  acceptsStrangers?: boolean | null;
  candidatePreference?: string | null;
};

export function buildProfileCandidateReasons(input: {
  query: CandidateReasonQuery;
  city: string;
  commonTags: string[];
  completeness: number;
  verified: boolean;
}): string[] {
  const reasons: string[] = ['来自真实注册用户和社交画像。'];
  if (candidateCityMatches(input.query.city, input.city))
    reasons.push(`城市匹配：${input.city}。`);
  if (input.commonTags.length)
    reasons.push(`共同兴趣：${input.commonTags.slice(0, 3).join('、')}。`);
  const candidatePreference = cleanDisplayText(input.query.candidatePreference, '');
  if (candidatePreference && input.commonTags.length) {
    reasons.push(`已按公开资料里的偏好线索参考：${candidatePreference}。`);
  }
  if (input.completeness >= 0.7) reasons.push('画像信息较完整。');
  if (input.verified) reasons.push('用户已认证。');
  if (input.query.acceptsStrangers === true)
    reasons.push('对方公开可发现，适合作为安全的新认识机会。');
  return reasons.slice(0, 6);
}

export function buildPublicIntentCandidateReasons(input: {
  intent: { title?: unknown; requestType?: unknown; timePreference?: unknown };
  query: CandidateReasonQuery;
  city: string;
  commonTags: string[];
}): string[] {
  const title = cleanDisplayText(input.intent.title, '公开约练卡片');
  const reasons = [`来自真实公开约练卡片：${title}。`];
  if (candidateCityMatches(input.query.city, input.city))
    reasons.push(`卡片城市匹配：${input.city}。`);
  if (input.commonTags.length)
    reasons.push(`卡片标签匹配：${input.commonTags.slice(0, 3).join('、')}。`);
  const candidatePreference = cleanDisplayText(input.query.candidatePreference, '');
  if (candidatePreference && input.commonTags.length) {
    reasons.push(`已按公开卡片标签参考你的偏好：${candidatePreference}。`);
  }
  const timePreference = cleanDisplayText(input.intent.timePreference, '');
  if (timePreference) reasons.push(`时间偏好：${timePreference}。`);
  const requestType = cleanDisplayText(input.intent.requestType, '');
  if (requestType) reasons.push(`需求类型：${requestType}。`);
  if (input.query.acceptsStrangers === true)
    reasons.push('公开卡片可发现，适合从低压力互动开始。');
  return reasons.slice(0, 6);
}
