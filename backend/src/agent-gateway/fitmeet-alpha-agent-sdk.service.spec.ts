import { ConfigService } from '@nestjs/config';

import { FitMeetAlphaAgentSdkService } from './fitmeet-alpha-agent-sdk.service';
import { fitMeetAlphaAgentForNextAgent } from './fitmeet-alpha-agent-topology';

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
    expect(decision.agentTrace.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agent: 'Social Match Agent',
          intent: 'find_nearby_partner',
          readiness: 'search',
          nextAction: 'plan_tool_search',
        }),
      ]),
    );
  });

  it('uses hydrated task slots when local intent fallback handles a short follow-up', async () => {
    const service = new FitMeetAlphaAgentSdkService(config);

    const decision = await service.prepareTurn({
      ownerUserId: 1,
      taskId: 103,
      message: '可以，帮我找人',
      permissionMode: 'limited_auto',
      context: {
        taskSlots: {
          activity: { value: '散步', state: 'completed' },
          time_window: { value: '今天晚上', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
          candidate_preference: {
            value: '女生，舞蹈相关公开标签优先',
            state: 'answered',
          },
          safety_boundary: {
            value: '第一次见面只接受公共场所',
            state: 'completed',
          },
        },
        recentMessages: [
          {
            role: 'user',
            content: '我想在青岛大学，今天晚上，找个女生散步，最好是舞蹈生。',
          },
        ],
      },
    });

    expect(decision.safety.blocked).toBe(false);
    expect(decision.structuredIntent).toMatchObject({
      intent: 'find_nearby_partner',
      nextAgent: 'social_match',
      activityType: '散步',
      timePreference: '今天晚上',
      locationText: '青岛大学附近',
      readiness: 'search',
      requiresSearch: true,
    });
    expect(decision.structuredIntent?.['targetPeople']).toContain('舞蹈');
    expect(decision.structuredIntent?.['relationshipGoal']).toContain('舞蹈');
    expect(decision.structuredIntent?.['missingInformation']).toEqual([]);
    expect(decision.structuredIntent?.['optionalPreferences']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('舞蹈相关公开标签优先'),
        expect.stringContaining('公共场所'),
      ]),
    );
  });

  it('keeps weekend person-search requests on the candidate matching path', async () => {
    const service = new FitMeetAlphaAgentSdkService(config);

    const decision = await service.prepareTurn({
      ownerUserId: 1,
      taskId: 104,
      message: '周末下午在青岛大学附近找女生散步，最好是舞蹈生',
      permissionMode: 'limited_auto',
    });

    expect(decision.safety.blocked).toBe(false);
    expect(decision.structuredIntent).toMatchObject({
      intent: 'find_nearby_partner',
      nextAgent: 'social_match',
      activityType: '散步',
      timePreference: '周末',
      locationText: '青岛大学',
      readiness: 'search',
      requiresSearch: true,
    });
    expect(decision.structuredIntent?.['intent']).not.toBe(
      'recommend_weekly_activity',
    );
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
      ['完善 Life Graph', 'complete_life_graph', 'Life Graph Agent'],
      ['分析我的生活节奏', 'analyze_life_rhythm', 'Life Graph Agent'],
      ['推荐本周活动', 'recommend_weekly_activity', 'Social Match Agent'],
      ['查看我的画像变化', 'view_profile_changes', 'Life Graph Agent'],
      ['5公里30分钟配速是多少', 'fitness_math', 'Math Agent'],
      ['下班后找附近健身搭子', 'find_nearby_partner', 'Social Match Agent'],
    ];

    for (const [message, intent, agentName] of samples) {
      const decision = await service.prepareTurn({
        ownerUserId: 1,
        taskId: 101,
        message,
        permissionMode: 'limited_auto',
      });

      expect(decision.safety.blocked).toBe(false);
      expect(decision.structuredIntent).toMatchObject({ intent });
      expect(
        fitMeetAlphaAgentForNextAgent(decision.structuredIntent?.['nextAgent']),
      ).toBe(agentName);
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
          scoreBreakdown: {
            distance: 16,
            interestSimilarity: 20,
            timeFit: 12,
            safetyRisk: 8,
            lifeGraphBehaviorFit: 10,
          },
          commonTags: ['跑步', '同城'],
          distanceKm: 1.8,
          recallSource: '青岛大学 · 跑步 · 今晚',
          rankingReason: '都偏好晚上跑步',
          relationshipGoal: '先从低压力运动搭子开始',
          idealType: '同城周末有空、愿意先站内聊',
          invitePolicy: '发送邀请前必须由我确认',
          avatarUrl: 'https://cdn.example.com/xiaoliu.png',
          reasons: ['都偏好晚上跑步'],
          risk: { warnings: ['首次见面建议选择公共操场'] },
          suggestedMessage: '你好，我们跑步节奏挺接近，可以先低压力聊聊。',
        },
        {
          userId: 8,
          displayName: '小林',
          matchScore: 82,
          commonTags: ['夜跑'],
          reasons: ['同校周边更方便'],
        },
      ],
      approvalRequiredActions: [{ id: 1, actionType: 'send_message' }],
    });
    const candidateCards = cards.filter(
      (card) => card.type === 'candidate_card',
    );

    expect(cards.map((card) => card.type)).toEqual(
      expect.arrayContaining([
        'activity_plan',
        'candidate_card',
        'safety_boundary',
        'audit_update',
      ]),
    );
    expect(cards[0]?.type).toBe('candidate_card');
    expect(candidateCards).toHaveLength(2);
    expect(candidateCards.map((card) => card.data?.['displayName'])).toEqual([
      '小刘',
      '小林',
    ]);
    expect(
      cards.find((card) => card.type === 'candidate_card')?.actions,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: '生成邀请开场白',
          action: 'candidate.generate_opener',
          requiresConfirmation: false,
        }),
        expect.objectContaining({
          label: '确认后发邀请',
          action: 'candidate.connect',
          schemaAction: 'candidate.connect',
          requiresConfirmation: true,
        }),
        expect.objectContaining({
          label: '不感兴趣',
          action: 'dislike_candidate',
          schemaAction: 'candidate.skip',
          requiresConfirmation: false,
        }),
      ]),
    );
    expect(
      cards.find((card) => card.type === 'candidate_card')?.data,
    ).toMatchObject({
      schemaName: 'OpportunityCard',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.candidate',
      opportunityCard: true,
      confirmedContext: ['青岛', '跑步', expect.stringContaining('公共操场')],
      opportunity: expect.objectContaining({
        type: 'person',
        name: '小刘',
        avatarUrl: 'https://cdn.example.com/xiaoliu.png',
        score: 86,
        relationshipGoal: '先从低压力运动搭子开始',
        idealType: '同城周末有空、愿意先站内聊',
        invitePolicy: '发送邀请前必须由我确认',
        interests: expect.arrayContaining(['跑步', '同城']),
        distanceLabel: '1.8km',
        explanationSteps: expect.arrayContaining([
          expect.stringContaining('来源：青岛大学'),
          expect.stringContaining('匹配：都偏好晚上跑步'),
          expect.stringContaining('安全：首次见面建议选择公共操场'),
        ]),
        rankingBreakdown: expect.arrayContaining([
          expect.objectContaining({
            key: 'location',
            label: '城市/距离',
            score: 16,
          }),
          expect.objectContaining({
            key: 'interest',
            label: '共同兴趣',
            reason: expect.stringContaining('跑步、同城'),
          }),
          expect.objectContaining({
            key: 'life_graph',
            label: '画像偏好',
          }),
        ]),
        coldStartSignals: expect.arrayContaining([
          expect.stringContaining('区域：青岛'),
          expect.stringContaining('共同兴趣：跑步、同城'),
        ]),
        confirmedContext: ['青岛', '跑步', expect.stringContaining('公共操场')],
        recommendedNextAction: expect.stringContaining('确认后再发送'),
      }),
      relationshipGoal: '先从低压力运动搭子开始',
      idealType: '同城周末有空、愿意先站内聊',
      invitePolicy: '发送邀请前必须由我确认',
      recommendationLine: expect.any(String),
      whyNow: expect.any(String),
      safetyBoundary: expect.any(String),
      sharedInterests: expect.arrayContaining(['跑步', '同城']),
      explanationSteps: expect.arrayContaining([
        expect.stringContaining('来源：青岛大学'),
      ]),
      rankingBreakdown: expect.arrayContaining([
        expect.objectContaining({ key: 'boundary', label: '安全边界' }),
      ]),
      nextActions: expect.arrayContaining(['生成邀请开场白', '确认后发邀请']),
    });
    expect(cards.find((card) => card.type === 'activity_plan')).toMatchObject({
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.activity',
      body: expect.stringContaining('不会共享你的精确位置'),
      data: expect.objectContaining({
        schemaName: 'OpportunityCard',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'social_match.activity',
        opportunityCard: true,
        opportunityType: 'activity',
        opportunityTitle: '跑步约练',
        opportunitySubtitle: expect.stringContaining('青岛'),
        confirmedContext: [
          '青岛',
          '跑步',
          '青岛的公共场所',
          expect.stringContaining('公共场所'),
        ],
        opportunity: expect.objectContaining({
          type: 'activity',
          title: '跑步约练',
          city: '青岛',
          location: '青岛的公共场所',
          activityType: '跑步',
          safetyBadges: ['公共场所', '不共享精确位置', '确认后创建'],
          confirmedContext: [
            '青岛',
            '跑步',
            '青岛的公共场所',
            expect.stringContaining('公共场所'),
          ],
        }),
        publicPlaceOnly: true,
        noPreciseLocation: true,
        checkinReminder: expect.stringContaining('确认是否到达'),
        reviewPrompt: expect.stringContaining('评价体验'),
        trustScoreUpdatePreview: expect.stringContaining('trust score'),
        meetLoopStage: 'activity_confirmation',
      }),
      actions: expect.arrayContaining([
        expect.objectContaining({
          action: 'activity.confirm_create',
          schemaAction: 'activity.confirm_create',
          requiresConfirmation: true,
          payload: expect.objectContaining({
            approvalRequired: true,
            checkpointRequired: true,
            resumeMode: 'resume_after_approval',
            riskReasons: expect.arrayContaining([
              expect.stringContaining('真实约练'),
              expect.stringContaining('确认前不会公开发布'),
            ]),
          }),
        }),
      ]),
    });
    expect(cards.find((card) => card.type === 'safety_boundary')).toMatchObject(
      {
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'safety.approval',
        data: expect.objectContaining({
          schemaName: 'SafetyApprovalCard',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'safety.approval',
          approval: expect.objectContaining({
            riskLevel: 'low',
            confirmationLabel: '后续动作需确认',
            checkpointLabel: '安全边界已保存',
          }),
        }),
      },
    );
    expect(cards.find((card) => card.type === 'audit_update')).toMatchObject({
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'safety.approval',
      data: expect.objectContaining({
        schemaName: 'SafetyApprovalCard',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'safety.approval',
        riskLevel: 'medium',
        reasons: expect.arrayContaining(['send_message']),
        approval: expect.objectContaining({
          riskLevel: 'medium',
          reasons: expect.arrayContaining(['send_message']),
          confirmationLabel: '确认后才执行',
          checkpointLabel: '审批中断点已保存',
        }),
      }),
    });
  });

  it('builds a recovery card instead of fake candidates when real candidate search is empty', () => {
    const service = new FitMeetAlphaAgentSdkService(config);

    const cards = service.buildResultCards({
      taskId: 42,
      socialRequestDraft: {
        description: '今晚在青岛大学附近找舞蹈生散步',
        city: '青岛',
        activityType: '散步',
        timePreference: '今天晚上',
        locationName: '青岛大学附近',
        candidatePreference: '公开资料里有舞蹈相关标签的女生优先',
      },
      candidates: [],
      approvalRequiredActions: [],
    });

    const emptyCard = cards.find(
      (card) => card.type === 'candidate_empty_state',
    );

    expect(emptyCard).toMatchObject({
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.empty',
      title: '暂时没有找到合适的人',
      status: 'ready',
      data: expect.objectContaining({
        schemaName: 'CandidateEmptyStateCard',
        schemaType: 'social_match.empty',
        reason: 'no_real_candidates',
        criteria: expect.arrayContaining([
          '散步',
          '青岛',
          '青岛大学附近',
          '今天晚上',
          '公开资料里有舞蹈相关标签的女生优先',
        ]),
        recoveryOptions: expect.arrayContaining([
          expect.objectContaining({
            key: 'publish_to_discover',
            label: '发布到发现',
            requiresConfirmation: true,
          }),
          expect.objectContaining({
            key: 'expand_radius',
            label: '扩大范围',
          }),
          expect.objectContaining({
            key: 'change_time',
            label: '换个时间',
          }),
        ]),
        safetyBoundary: expect.stringContaining('不会编造候选'),
      }),
      actions: expect.arrayContaining([
        expect.objectContaining({
          id: 'publish_to_discover',
          schemaAction: 'activity.confirm_create',
          requiresConfirmation: true,
          payload: expect.objectContaining({
            approvalRequired: true,
            checkpointRequired: true,
            sideEffect: 'publish_public_intent',
          }),
        }),
        expect.objectContaining({
          id: 'expand_radius',
          schemaAction: 'candidate.more_like_this',
          requiresConfirmation: false,
        }),
        expect.objectContaining({
          id: 'change_time',
          schemaAction: 'activity.modify_time',
          requiresConfirmation: false,
        }),
      ]),
    });
    expect(emptyCard?.body).toContain('不会用假候选凑数');
    expect(cards.filter((card) => card.type === 'candidate_card')).toHaveLength(
      0,
    );
  });

  it('limits user-visible opportunity cards to three while keeping safety and audit cards', () => {
    const service = new FitMeetAlphaAgentSdkService(config);

    const cards = service.buildResultCards({
      taskId: 11,
      traceId: 'trace-opportunity-limit',
      socialRequestDraft: {
        description: '周末在青岛找户外搭子',
        city: '青岛',
        activityType: '户外',
        timePreference: '周末',
      },
      candidates: [
        { userId: 1, displayName: '候选 A', matchScore: 91 },
        { userId: 2, displayName: '候选 B', matchScore: 88 },
        { userId: 3, displayName: '候选 C', matchScore: 83 },
        { userId: 4, displayName: '候选 D', matchScore: 80 },
      ],
      approvalRequiredActions: [{ id: 1, actionType: 'send_message' }],
    });

    const opportunityCards = cards.filter(
      (card) => card.data?.['opportunityCard'] === true,
    );

    expect(opportunityCards).toHaveLength(3);
    expect(opportunityCards.map((card) => card.type)).toEqual([
      'candidate_card',
      'candidate_card',
      'candidate_card',
    ]);
    expect(
      opportunityCards.every(
        (card) =>
          card.schemaVersion === 'fitmeet.tool-ui.v1' &&
          card.schemaType === 'social_match.candidate' &&
          card.data?.['schemaName'] === 'OpportunityCard' &&
          card.data?.['opportunityCard'] === true,
      ),
    ).toBe(true);
    expect(
      opportunityCards.every((card) => {
        const data = card.data ?? {};
        const opportunity = data['opportunity'] as
          | Record<string, unknown>
          | undefined;
        return (
          Boolean(opportunity?.['summary']) &&
          Array.isArray(opportunity?.['confirmedContext']) &&
          (opportunity?.['confirmedContext'] as unknown[]).length >= 3 &&
          Array.isArray(opportunity?.['explanationSteps']) &&
          (opportunity?.['explanationSteps'] as unknown[]).some((step) =>
            String(step).startsWith('安全：'),
          ) &&
          Boolean(opportunity?.['safetyBoundary']) &&
          Boolean(opportunity?.['recommendedNextAction'])
        );
      }),
    ).toBe(true);
    expect(
      opportunityCards.every((card) => {
        const schemaActions = card.actions.map((action) => action.schemaAction);
        return (
          schemaActions.includes('candidate.view_detail') &&
          schemaActions.includes('candidate.generate_opener') &&
          schemaActions.includes('candidate.connect') &&
          schemaActions.includes('candidate.skip')
        );
      }),
    ).toBe(true);
    expect(
      opportunityCards.every((card) =>
        card.actions.some(
          (action) =>
            action.schemaAction === 'candidate.connect' &&
            action.requiresConfirmation === true &&
            action.payload?.['approvalRequired'] === true &&
            action.payload?.['checkpointRequired'] === true &&
            action.payload?.['resumeMode'] === 'resume_after_approval' &&
            typeof action.payload?.['idempotencyKey'] === 'string' &&
            action.payload?.['sideEffect'] === 'send_message_or_connect',
        ),
      ),
    ).toBe(true);
    expect(opportunityCards.map((card) => card.data?.['displayName'])).toEqual([
      '候选 A',
      '候选 B',
      '候选 C',
    ]);
    expect(cards.find((card) => card.type === 'activity_plan')).toBeUndefined();
    expect(cards.find((card) => card.type === 'safety_boundary')).toBeDefined();
    expect(cards.find((card) => card.type === 'audit_update')).toBeDefined();
  });
});
