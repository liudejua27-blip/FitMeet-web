import {
  buildPublicIntentMatchSignalFromRequest,
  buildPublicSocialCandidateReason,
  buildPublicSocialRequestTitle,
  classifyPublicSocialRisk,
  extractPublicRequestKeywords,
  hashPublicIntentBucket,
  hasPublicIntentSensitiveContent,
  normalizePublicIntentHeader,
  normalizePublicIntentIp,
  previewPublicIntentText,
  scorePublicIntentSuspicion,
} from './public-social-intent.helpers';
import { CreateSocialRequestDto } from './dto/agent-gateway.dto';
import { SocialRequestRiskLevel } from './entities/social-request.entity';

function request(overrides: Partial<CreateSocialRequestDto> = {}) {
  return {
    requestType: 'fitness_partner',
    description: '今晚想找附近跑步搭子，在公共场地先慢跑 3km',
    city: '青岛',
    interests: ['running', 'fitness'],
    verifiedOnly: true,
    ...overrides,
  } as CreateSocialRequestDto;
}

describe('public social intent helpers', () => {
  it('classifies public social intent risk from request content', () => {
    expect(
      classifyPublicSocialRisk(
        request({ requestType: 'bar_friend', description: '找同场喝酒搭子' }),
      ),
    ).toBe(SocialRequestRiskLevel.High);
    expect(
      classifyPublicSocialRisk(
        request({ requestType: 'dog_walking', description: '周末线下遛狗' }),
      ),
    ).toBe(SocialRequestRiskLevel.Medium);
    expect(classifyPublicSocialRisk(request())).toBe(
      SocialRequestRiskLevel.Low,
    );
  });

  it('builds deterministic title, keywords, candidate reason and preview text', () => {
    expect(buildPublicSocialRequestTitle(request())).toBe('寻找附近约练搭子');
    expect(
      extractPublicRequestKeywords('周末想跑步、健身，然后喝咖啡'),
    ).toEqual(['fitness', 'running', 'coffee']);
    expect(
      buildPublicSocialCandidateReason(
        { city: '青岛', verified: true },
        request(),
        ['running'],
        1.234,
      ),
    ).toContain('距离约 1.23km');
    expect(previewPublicIntentText('  a   b   c  ', 160)).toBe('a b c');
    expect(previewPublicIntentText('abcdef', 5)).toBe('ab...');
  });

  it('computes match signal and abuse heuristics without service state', () => {
    const signal = buildPublicIntentMatchSignalFromRequest(request(), [
      { score: 82, reasonTags: ['same_city'] },
      { score: 72, reasonTags: ['verified'] },
    ]);

    expect(signal.score).toBeGreaterThanOrEqual(75);
    expect(signal.confidence).toBe('high');
    expect(signal.reasons).toContain('城市信号：青岛');
    expect(hasPublicIntentSensitiveContent('请加微信转账')).toBe(true);
    expect(
      hasPublicIntentSensitiveContent('集合点坐标 36.123456,120.123456'),
    ).toBe(true);
    expect(hasPublicIntentSensitiveContent('青岛某小区3号楼2单元门口见')).toBe(
      true,
    );
    expect(
      scorePublicIntentSuspicion(
        request({ description: '短', city: undefined, limit: 20 }),
        { ip: '127.0.0.1', deviceId: '', userAgent: 'Safari', origin: '' },
      ),
    ).toBeGreaterThanOrEqual(4);
  });

  it('normalizes public request headers and stable rate-limit buckets', () => {
    expect(
      normalizePublicIntentIp({
        forwardedFor: '1.1.1.1, 2.2.2.2',
        ip: '3.3.3.3',
      }),
    ).toBe('1.1.1.1');
    expect(normalizePublicIntentHeader(['device-a', 'device-b'])).toBe(
      'device-a',
    );
    expect(hashPublicIntentBucket('device-a')).toHaveLength(24);
    expect(hashPublicIntentBucket('device-a')).toBe(
      hashPublicIntentBucket('device-a'),
    );
  });
});
