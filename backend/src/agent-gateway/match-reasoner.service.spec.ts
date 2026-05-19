import { MatchReasonerService } from './match-reasoner.service';
import { UserSocialProfile } from '../users/user-social-profile.entity';

function profile(over: Partial<UserSocialProfile> = {}): UserSocialProfile {
  return {
    userId: 1,
    nickname: 'Alex',
    gender: '',
    ageRange: '25-30',
    city: '北京',
    nearbyArea: '',
    mbti: 'INFJ',
    zodiac: '处女座',
    fitnessGoals: [],
    traits: ['温和', '理性'],
    socialStyle: '',
    communicationStyle: '',
    interestTags: ['爬山', '咖啡'],
    availableTimes: [],
    socialPreference: '',
    lifestyleTags: ['露营'],
    socialScenes: ['周末'],
    wantToMeet: [],
    preferredTraits: [],
    avoidTraits: [],
    relationshipGoals: [],
    openness: '',
    rejectRules: '',
    weekdayAvailability: '',
    weekendAvailability: '',
    privacyBoundary: '',
    profileDiscoverable: true,
    agentCanRecommendMe: true,
    agentCanStartChatAfterApproval: true,
    aiSummary: '',
    aiProfileCard: {},
    matchSignals: {},
    sensitiveTagDecisions: {},
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...over,
  } as UserSocialProfile;
}

describe('MatchReasonerService', () => {
  const reasoner = new MatchReasonerService();

  it('produces a structured explanation with all required fields', async () => {
    const out = await reasoner.explain({
      ownerProfile: profile({ userId: 1, nickname: '我' }),
      candidateProfile: profile({ userId: 2, nickname: 'Lee' }),
      publicTags: {
        owner: ['爬山', '咖啡'],
        candidate: ['爬山', '骑行'],
        shared: ['爬山'],
      },
      privatePreferenceSignals: ['想认识事业型朋友'],
      avoidSignals: ['频繁酒局'],
      scoreBreakdown: {
        score: 72,
        cityMatch: true,
        mbtiMatch: true,
        traitOverlap: ['理性'],
      },
    });

    expect(out.publicReason).toMatch(/爬山/);
    expect(out.sharedPoints.length).toBeGreaterThan(0);
    expect(out.suggestedOpener).toMatch(/Lee/);
    expect(out.riskWarnings.length).toBeGreaterThan(0);
    expect(out.requiresUserConfirmation).toBe(true);
    expect(out.confidence).toBeGreaterThan(0);
    expect(out.confidence).toBeLessThanOrEqual(1);
    expect(out.source).toBe('fallback');
    expect(out.nextAction).toBeTruthy();
  });

  it('reframes wealth/resource preferences without value judgments', async () => {
    const out = await reasoner.explain({
      ownerProfile: profile({ userId: 1 }),
      candidateProfile: profile({ userId: 2 }),
      privatePreferenceSignals: ['事业型', '商业交流'],
      confirmedSensitiveTags: ['高消费生活方式'],
      scoreBreakdown: { score: 60 },
    });
    expect(out.privateReason).toMatch(/创业|商业|生活方式/);
    expect(out.privateReason).not.toMatch(/因为对方有钱/);
    expect(out.publicReason).not.toMatch(/因为.{0,10}有钱/);
  });

  it('redacts contact info, exact amounts and identity-bearing fields', () => {
    const sanitized = reasoner.sanitizeText(
      '加微信13800001111 邮箱abc@x.com 月薪 30000元 单位是字节跳动 住北京海淀区中关村大街1号',
    );
    expect(sanitized).not.toMatch(/13800001111/);
    expect(sanitized).not.toMatch(/abc@x\.com/);
    expect(sanitized).not.toMatch(/30000/);
    expect(sanitized).not.toMatch(/字节跳动/);
    expect(sanitized).not.toMatch(/中关村大街1号/);
    // labels are kept but the leaky value is replaced
    expect(sanitized).toMatch(/微信已隐藏/);
    expect(sanitized).toMatch(/单位已隐藏/);
  });

  it('warns when data is thin (low score → suggest 先线上了解)', async () => {
    const out = await reasoner.explain({
      ownerProfile: profile({ userId: 1, interestTags: [] }),
      candidateProfile: profile({ userId: 2, interestTags: [] }),
      publicTags: { owner: [], candidate: [], shared: [] },
      scoreBreakdown: { score: 30 },
    });
    expect(
      [out.publicReason, out.nextAction, ...out.riskWarnings].join(' '),
    ).toMatch(/资料|线上|了解/);
  });

  it('every output text passes the redaction guard', async () => {
    const out = await reasoner.explain({
      ownerProfile: profile({
        userId: 1,
        privacyBoundary: '不交换电话13800001111',
      }),
      candidateProfile: profile({
        userId: 2,
        aiSummary: '联系：手机号13900002222',
      }),
      scoreBreakdown: { score: 65, cityMatch: true },
    });
    const blob = [
      out.publicReason,
      out.privateReason,
      out.suggestedOpener,
      out.nextAction,
      ...out.sharedPoints,
      ...out.complementaryPoints,
      ...out.riskWarnings,
    ].join(' ');
    expect(blob).not.toMatch(/13800001111|13900002222/);
  });
});
