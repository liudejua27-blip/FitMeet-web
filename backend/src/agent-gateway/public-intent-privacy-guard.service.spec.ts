import { PublicIntentPrivacyGuardService } from './public-intent-privacy-guard.service';

describe('PublicIntentPrivacyGuardService', () => {
  it('blocks contact details before a public intent is published', () => {
    const guard = new PublicIntentPrivacyGuardService();

    const result = guard.inspect({
      title: '今晚五四广场散步',
      description: '加我微信 wx123456 后直接联系',
    });

    expect(result.blocked).toBe(true);
    expect(result.reasons).toContain('微信号');
    expect(guard.buildBlockedCard({ taskId: 12, result }).schemaType).toBe(
      'social_match.privacy_guard',
    );
  });

  it('allows public-safe activity copy', () => {
    const guard = new PublicIntentPrivacyGuardService();

    expect(
      guard.inspect({
        title: '今晚五四广场散步',
        description: '公共场所，先站内沟通，低压力散步。',
      }).blocked,
    ).toBe(false);
  });
});
