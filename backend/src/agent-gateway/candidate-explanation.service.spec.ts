import { CandidateExplanationService } from './candidate-explanation.service';
import { SceneRiskPolicyService } from './scene-risk-policy.service';

describe('CandidateExplanationService', () => {
  const service = new CandidateExplanationService(new SceneRiskPolicyService());

  it('returns card-ready explanation fields for every candidate', () => {
    const explanation = service.explain({
      userRequest: '我想找周末下午在三里屯安静咖啡局聊天的人',
      candidate: {
        displayName: '小林',
        city: '北京',
        commonTags: ['咖啡', '周末下午'],
      },
      matchScore: 88,
      matchReasons: ['周末下午时间重叠', '都喜欢安静咖啡局'],
      sceneType: 'general',
      riskWarnings: [],
    });

    expect(explanation.fitReasons.length).toBeGreaterThan(0);
    expect(explanation.suggestedOpener).toContain('小林');
    expect(explanation.awkwardPoints.length).toBeGreaterThan(0);
    expect(explanation.safeFirstStep).toContain('公开');
    expect(explanation.nextActionSuggestion).toBeTruthy();
  });

  it('changes wording and confirmation posture by high-risk scene', () => {
    const explanation = service.explain({
      userRequest: '找酒搭子，晚上喝一杯',
      candidate: {
        displayName: '阿宁',
        city: '上海',
        commonTags: ['酒吧', '聊天'],
      },
      matchScore: 82,
      matchReasons: ['兴趣相似'],
      sceneType: 'drinking',
      riskWarnings: ['酒局需要公开地点'],
    });

    expect(explanation.requiresConfirmation).toBe(true);
    expect(explanation.awkwardPoints.join(' ')).toContain('酒局');
    expect(explanation.safeFirstStep).toContain('返程');
  });

  it('includes Life Graph signals, missing fields, and boundary notes', () => {
    const explanation = service.explain({
      userRequest: '帮我找附近跑步搭子',
      candidate: {
        displayName: '小林',
        city: '青岛',
        commonTags: ['跑步'],
      },
      matchReasons: ['运动偏好相似'],
      lifeGraphSignals: {
        identitySignals: { city: '青岛', nearbyArea: '青岛大学附近' },
        lifestyleSignals: { availableTimes: ['周末下午'] },
        fitnessSignals: { sportsPreferences: ['跑步'] },
        socialIntentSignals: { preferredSocialStyle: '先聊天后见面' },
        safetySignals: {
          publicPlaceOnly: true,
          locationSharingAllowed: false,
        },
        missingCriticalFields: [{ label: '活动强度' }],
      },
    });

    expect(explanation.lifeGraphExplanation).toMatchObject({
      usedSignals: expect.arrayContaining([
        expect.stringContaining('青岛大学附近'),
        expect.stringContaining('跑步'),
      ]),
      missingSignals: expect.arrayContaining(['活动强度']),
      boundaryNotes: expect.arrayContaining([
        expect.stringContaining('公共场所'),
        expect.stringContaining('精确定位'),
      ]),
    });
  });
});
