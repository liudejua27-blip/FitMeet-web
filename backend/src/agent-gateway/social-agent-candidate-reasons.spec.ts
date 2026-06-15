import {
  buildProfileCandidateReasons,
  buildPublicIntentCandidateReasons,
} from './social-agent-candidate-reasons';

describe('social-agent-candidate-reasons', () => {
  it('builds stable profile candidate reasons for Web/iOS candidate cards', () => {
    expect(
      buildProfileCandidateReasons({
        query: { city: '青岛', acceptsStrangers: true },
        city: '青岛市',
        commonTags: ['跑步', '咖啡', '拍照', '瑜伽'],
        completeness: 0.72,
        verified: true,
      }),
    ).toEqual([
      '来自真实注册用户和社交画像。',
      '城市匹配：青岛市。',
      '共同兴趣：跑步、咖啡、拍照。',
      '画像信息较完整。',
      '用户已认证。',
      '对方公开可发现，适合作为安全的新认识机会。',
    ]);
  });

  it('keeps profile reasons conservative when optional signals are missing', () => {
    expect(
      buildProfileCandidateReasons({
        query: { city: '北京' },
        city: '青岛',
        commonTags: [],
        completeness: 0.4,
        verified: false,
      }),
    ).toEqual(['来自真实注册用户和社交画像。']);
  });

  it('builds stable public intent candidate reasons with fallback title', () => {
    expect(
      buildPublicIntentCandidateReasons({
        intent: {
          title: '',
          requestType: 'running',
          timePreference: '周末',
        },
        query: { city: '青岛', acceptsStrangers: true },
        city: '青岛',
        commonTags: ['跑步', '健身', 'citywalk', '咖啡'],
      }),
    ).toEqual([
      '来自真实公开约练卡片：公开约练卡片。',
      '卡片城市匹配：青岛。',
      '卡片标签匹配：跑步、健身、citywalk。',
      '时间偏好：周末。',
      '需求类型：running。',
      '公开卡片可发现，适合从低压力互动开始。',
    ]);
  });
});
