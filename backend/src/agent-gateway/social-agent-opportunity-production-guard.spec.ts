import {
  assertSocialAgentOpportunityPublishable,
  socialAgentOpportunityGuardIssues,
} from './social-agent-opportunity-production-guard';

describe('socialAgentOpportunityProductionGuard', () => {
  it('blocks clearly expired opportunity times', () => {
    const draft = {
      title: '青岛跑步搭子',
      city: '青岛',
      locationName: '五四广场',
      timePreference: '昨天晚上',
      safetyBoundary: '公共场所，先站内沟通',
    } as never;

    expect(() => assertSocialAgentOpportunityPublishable(draft)).toThrow(
      '约练时间看起来已经过期',
    );
  });

  it('blocks station-external contact exchange in public cards', () => {
    const draft = {
      title: '青岛跑步搭子',
      description: '加我微信再约',
      city: '青岛',
      locationName: '五四广场',
      timePreference: '明晚',
      safetyBoundary: '公共场所，先站内沟通',
    } as never;

    expect(() => assertSocialAgentOpportunityPublishable(draft)).toThrow(
      '约练卡不能包含手机号、微信或其他站外联系方式',
    );
  });

  it('warns on city and location mismatch without blocking draft review', () => {
    const issues = socialAgentOpportunityGuardIssues({
      title: '散步搭子',
      city: '青岛',
      locationName: '上海徐汇公共球馆',
      timePreference: '周六 16:00',
      safetyBoundary: '公共场所，位置模糊',
    } as never);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'city_location_mismatch',
          severity: 'warn',
        }),
      ]),
    );
    expect(issues.some((issue) => issue.severity === 'block')).toBe(false);
  });
});
