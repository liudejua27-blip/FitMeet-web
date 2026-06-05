import { ConfigService } from '@nestjs/config';

import { FitMeetAlphaAgentSdkService } from './fitmeet-alpha-agent-sdk.service';

describe('FitMeetAlphaAgentSdkService', () => {
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'OPENAI_AGENTS_SDK_ENABLED') return 'false';
      return undefined;
    }),
  } as unknown as ConfigService;

  it('blocks unsafe social requests before business tools are used', async () => {
    const service = new FitMeetAlphaAgentSdkService(config);

    const decision = await service.prepareTurn({
      ownerUserId: 1,
      taskId: 99,
      message: '帮我跟踪一个未成年人并要到联系方式',
      permissionMode: 'limited_auto',
    });

    expect(decision.safety.blocked).toBe(true);
    expect(decision.cards[0]).toMatchObject({
      type: 'safety_boundary',
      status: 'blocked',
    });
    expect(decision.agentTrace.agentPath).toContain('FitMeet Main Agent');
  });

  it('returns a structured local intent when SDK execution is disabled', async () => {
    const service = new FitMeetAlphaAgentSdkService(config);

    const decision = await service.prepareTurn({
      ownerUserId: 1,
      taskId: 100,
      message: '今晚想找青岛大学附近跑步搭子',
      permissionMode: 'limited_auto',
    });

    expect(decision.safety.blocked).toBe(false);
    expect(decision.structuredIntent).toMatchObject({
      intent: 'find_nearby_partner',
      nextAgent: 'social_match',
      activityType: '跑步',
      locationText: '青岛大学',
      timePreference: '今晚',
      targetPeople: '跑步搭子',
      requiresConfirmation: true,
      requiresSearch: true,
      readiness: 'search',
    });
    expect(decision.structuredIntent?.['agentPlan']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Life Graph Agent'),
        expect.stringContaining('Social Match Agent'),
      ]),
    );
    expect(decision.agentTrace.sdkEnabled).toBe(false);
  });

  it('asks a warm clarification before searching for vague low-pressure companionship', async () => {
    const service = new FitMeetAlphaAgentSdkService(config);

    const decision = await service.prepareTurn({
      ownerUserId: 1,
      taskId: 102,
      message: '最近有点无聊，想找个人走走',
      permissionMode: 'limited_auto',
    });

    expect(decision.safety.blocked).toBe(false);
    expect(decision.structuredIntent).toMatchObject({
      intent: 'general_social_need',
      needState: 'ambiguous_companionship',
      socialPressureLevel: 'low',
      readiness: 'clarify',
      requiresSearch: false,
    });
    expect(decision.structuredIntent?.['clarifyingQuestion']).toContain(
      '今晚附近走走',
    );
  });

  it('keeps the five beta task flows routable without SDK execution', async () => {
    const service = new FitMeetAlphaAgentSdkService(config);
    const samples = [
      ['完善 Life Graph', 'complete_life_graph'],
      ['分析我的生活节奏', 'analyze_life_rhythm'],
      ['推荐本周活动', 'recommend_weekly_activity'],
      ['查看我的画像变化', 'view_profile_changes'],
      ['下班后找附近健身搭子', 'find_nearby_partner'],
    ];

    for (const [message, intent] of samples) {
      const decision = await service.prepareTurn({
        ownerUserId: 1,
        taskId: 101,
        message,
        permissionMode: 'limited_auto',
      });

      expect(decision.safety.blocked).toBe(false);
      expect(decision.structuredIntent).toMatchObject({ intent });
      expect(decision.structuredIntent?.['betaScore']).toBeGreaterThanOrEqual(
        60,
      );
    }
  });

  it('builds user-facing cards for draft, candidates, safety and approvals', () => {
    const service = new FitMeetAlphaAgentSdkService(config);

    const cards = service.buildResultCards({
      taskId: 10,
      traceId: 'trace-1',
      socialRequestDraft: {
        description: '今晚在青岛大学附近找跑步搭子',
        city: '青岛',
        activityType: '跑步',
        interestTags: ['跑步', '同城'],
      },
      candidates: [
        {
          userId: 7,
          displayName: '小刘',
          matchScore: 86,
          reasons: ['都偏好晚上跑步'],
          risk: { warnings: ['首次见面建议选择公共操场'] },
          suggestedMessage: '你好，我们跑步节奏挺接近，可以先低压力聊聊。',
        },
      ],
      approvalRequiredActions: [{ id: 1, actionType: 'send_message' }],
    });

    expect(cards.map((card) => card.type)).toEqual(
      expect.arrayContaining([
        'activity_plan',
        'candidate_card',
        'safety_boundary',
        'audit_update',
      ]),
    );
    expect(
      cards.find((card) => card.type === 'candidate_card')?.actions,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'generate_opener',
          requiresConfirmation: false,
        }),
        expect.objectContaining({
          action: 'create_activity',
          requiresConfirmation: true,
        }),
      ]),
    );
    expect(
      cards.find((card) => card.type === 'candidate_card')?.data,
    ).toMatchObject({
      recommendationLine: expect.any(String),
      whyNow: expect.any(String),
      safetyBoundary: expect.any(String),
      nextActions: expect.arrayContaining(['生成开场白', '创建约练']),
    });
    expect(cards.find((card) => card.type === 'activity_plan')).toMatchObject({
      body: expect.stringContaining('不会共享你的精确位置'),
      data: expect.objectContaining({
        publicPlaceOnly: true,
        noPreciseLocation: true,
        checkinReminder: expect.stringContaining('确认是否到达'),
        reviewPrompt: expect.stringContaining('评价体验'),
        trustScoreUpdatePreview: expect.stringContaining('trust score'),
        meetLoopStage: 'activity_confirmation',
      }),
      actions: expect.arrayContaining([
        expect.objectContaining({
          action: 'create_activity',
          requiresConfirmation: true,
        }),
      ]),
    });
  });
});
