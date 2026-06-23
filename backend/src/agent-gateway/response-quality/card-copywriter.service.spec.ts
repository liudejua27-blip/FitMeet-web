import { CardCopywriterService } from './card-copywriter.service';
import { ConfirmationCopyService } from './confirmation-copy.service';
import { PersonalizationService } from './personalization.service';
import { SafetyCopyService } from './safety-copy.service';
import { TonePolicyService } from './tone-policy.service';

function makeService() {
  const tone = new TonePolicyService();
  return new CardCopywriterService(
    tone,
    new ConfirmationCopyService(),
    new SafetyCopyService(tone),
    new PersonalizationService(),
  );
}

describe('CardCopywriterService', () => {
  it('emits stable assistant-ui opportunity schema for candidate cards', () => {
    const card = makeService().candidate({
      taskId: 101,
      draft: {
        city: '青岛',
        activityType: '跑步',
        timePreference: '周末下午',
        intensity: '轻松/低压力',
      },
      candidate: {
        userId: 22,
        displayName: '小林',
        avatarUrl: '/avatars/xiaolin.png',
        matchScore: 87,
        city: '青岛市南区',
        distanceKm: 2.4,
        commonTags: ['跑步', '公共路线'],
        matchPoints: ['你们都偏好公共场所', '你们的运动强度接近'],
        scoreBreakdown: {
          distance: 14,
          interestSimilarity: 18,
          timeFit: 10,
          safetyRisk: 6,
          socialBoundaryFit: 8,
          lifeGraphBehaviorFit: 9,
        },
        relationshipGoal: '低压力认识新朋友',
        idealType: '运动搭子',
        invitePolicy: '先生成开场白，确认后再邀请',
        discoverySafetySignals: [
          '公开可发现',
          '已开启 Agent 匹配',
          '资料已脱敏',
          '无拉黑/投诉风险信号',
          '邀请前保留确认边界',
        ],
        preferenceHistorySignals: [
          '我会优先参考你最近确认的可约时间变化：从「工作日晚上」调整为「周末下午」。',
        ],
        recentPublicActivity: [
          '公开约练：周末慢跑',
          '最近公开更新：2026-06-15',
        ],
        suggestedOpener: '周末下午如果方便，可以先在公共路线轻松跑一圈。',
        whyNow: '你最近更适合从低压力的跑步开始。',
        openerStrategy: '先确认时间和强度，不要一上来就给对方压力。',
        recommendationConsent: {
          profileDiscoverable: true,
          agentCanRecommendMe: true,
          sourceLabel: '公开可发现且已允许 Agent 推荐',
          privacyLabel: '资料已脱敏',
          strangerPolicyLabel: '你已同意查看公开可发现的陌生人机会',
        },
        matchReasoner: {
          source: 'fallback',
          confidence: 0.43,
          degraded: true,
          retryable: true,
          degradationReason: 'upstream overloaded',
        },
        recallSource: '周末跑步偏好',
        rankingReason: '时间和强度更接近',
        safetyFilter: '仅展示模糊区域',
      },
    });

    expect(card).toMatchObject({
      type: 'candidate_card',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.candidate',
      title: '和 小林 低压力认识',
      data: expect.objectContaining({
        schemaName: 'OpportunityCard',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'social_match.candidate',
        confirmedContext: [
          '青岛',
          '周末下午',
          '跑步',
          '轻松/低压力',
          expect.stringContaining('公共场所'),
        ],
        sharedInterests: ['跑步'],
        distanceLabel: '2.4km',
        relationshipGoal: '低压力认识新朋友',
        idealType: '运动搭子',
        invitePolicy: '先生成开场白，确认后再邀请',
        preferenceHistorySignals: [
          '我会优先参考你最近确认的可约时间变化：从「工作日晚上」调整为「周末下午」。',
        ],
        recentPublicActivity: [
          '公开约练：周末慢跑',
          '最近公开更新：2026-06-15',
        ],
        reasonerSource: 'fallback',
        reasoningConfidence: 0.43,
        reasoningDegraded: true,
        reasoningRetryable: true,
        matchReasoner: {
          source: 'fallback',
          confidence: 0.43,
          degraded: true,
          retryable: true,
          degradationReason: 'model_unavailable',
        },
        explanationSteps: [
          '来源：周末跑步偏好',
          '匹配：时间和强度更接近',
          '记忆：我会优先参考你最近确认的可约时间变化：从「工作日晚上」调整为「周末下午」。',
          '安全：仅展示模糊区域',
        ],
        rankingBreakdown: expect.arrayContaining([
          expect.objectContaining({ key: 'location', score: 14 }),
          expect.objectContaining({ key: 'interest', score: 18 }),
          expect.objectContaining({ key: 'social_boundary', score: 8 }),
          expect.objectContaining({ key: 'life_graph', score: 9 }),
        ]),
        opportunity: expect.objectContaining({
          type: 'person',
          name: '小林',
          avatarUrl: '/avatars/xiaolin.png',
          score: 87,
          area: '青岛',
          time: '周末下午',
          reasonerSource: 'fallback',
          reasoningConfidence: 0.43,
          reasoningDegraded: true,
          reasoningRetryable: true,
          matchReasoner: {
            source: 'fallback',
            confidence: 0.43,
            degraded: true,
            retryable: true,
            degradationReason: 'model_unavailable',
          },
          distanceLabel: '2.4km',
          interests: ['跑步'],
          relationshipGoal: '低压力认识新朋友',
          idealType: '运动搭子',
          invitePolicy: '先生成开场白，确认后再邀请',
          discoverySafetySignals: [
            '公开可发现',
            '已开启 Agent 匹配',
            '资料已脱敏',
            '无拉黑/投诉风险信号',
            '邀请前保留确认边界',
          ],
          recommendationProtocol: [
            {
              key: 'discoverability',
              label: '可发现来源',
              detail: '公开可发现且已允许 Agent 推荐',
            },
            {
              key: 'consent',
              label: '推荐授权',
              detail: expect.any(String),
            },
            {
              key: 'privacy',
              label: '隐私处理',
              detail: '资料已脱敏',
            },
            {
              key: 'safety',
              label: '安全过滤',
              detail: '无拉黑/投诉风险信号',
            },
            {
              key: 'approval',
              label: '触达边界',
              detail: '发送邀请、加好友或创建活动前必须由你确认',
            },
          ],
          preferenceHistorySignals: [
            '我会优先参考你最近确认的可约时间变化：从「工作日晚上」调整为「周末下午」。',
          ],
          recentPublicActivity: [
            '公开约练：周末慢跑',
            '最近公开更新：2026-06-15',
          ],
          whyNow: '你最近更适合从低压力的跑步开始。',
          openerStrategy: '先确认时间和强度，不要一上来就给对方压力。',
          reasons: ['你们都偏好公共场所', '你们的运动强度接近'],
          explanationSteps: [
            '来源：周末跑步偏好',
            '匹配：时间和强度更接近',
            '记忆：我会优先参考你最近确认的可约时间变化：从「工作日晚上」调整为「周末下午」。',
            '安全：仅展示模糊区域',
          ],
          rankingBreakdown: expect.arrayContaining([
            expect.objectContaining({
              label: '共同兴趣',
              reason: expect.stringContaining('跑步'),
            }),
            expect.objectContaining({
              label: '社交边界',
              reason: expect.stringContaining('低压力互动'),
            }),
            expect.objectContaining({
              label: '画像偏好',
              reason: expect.stringContaining('最近确认的可约时间变化'),
            }),
          ]),
          suggestedOpener: expect.stringContaining('跑步'),
          recommendedNextAction: '先生成开场白，确认后再发送。',
          safetyBoundary: expect.stringContaining('公共场所'),
          confirmedContext: [
            '青岛',
            '周末下午',
            '跑步',
            '轻松/低压力',
            expect.stringContaining('公共场所'),
          ],
        }),
      }),
      actions: expect.arrayContaining([
        expect.objectContaining({
          label: '查看详情',
          schemaAction: 'candidate.view_detail',
        }),
        expect.objectContaining({
          label: '生成开场白',
          action: 'candidate.generate_opener',
          schemaAction: 'candidate.generate_opener',
        }),
        expect.objectContaining({
          label: '确认后邀请Ta',
          action: 'candidate.connect',
          schemaAction: 'candidate.connect',
          requiresConfirmation: true,
          payload: expect.objectContaining({
            actionType: 'connect_candidate',
            sideEffect: 'send_message_or_connect',
            approvalRequired: true,
            checkpointRequired: true,
            resumeMode: 'resume_after_approval',
            idempotencyKey: 'candidate-connect:101:22',
            riskLevel: 'medium',
            safetyBoundary: expect.stringContaining('公共场所'),
            suggestedOpener: expect.stringContaining('跑步'),
            auditEvent: 'social_agent.candidate.connect.approval_required',
            riskReasons: expect.arrayContaining([
              '这个动作会联系真实用户',
              '发送邀请前必须由你确认',
              '不会自动交换联系方式或精确位置',
            ]),
          }),
        }),
        expect.objectContaining({
          label: '不感兴趣',
          schemaAction: 'candidate.skip',
          requiresConfirmation: false,
        }),
      ]),
    });
  });

  it('keeps visible candidate card copy bound to the current task slots', () => {
    const card = makeService().candidate({
      taskId: 202,
      draft: {
        city: '青岛',
        activityType: '跑步',
        timePreference: '今天晚上',
        locationName: '青岛大学附近',
        interestTags: ['跑步'],
      },
      taskSlotSummary: {
        activity: '跑步',
        time_window: '今天晚上',
        location_text: '青岛大学附近',
      },
      candidate: {
        userId: 33,
        displayName: '陈砚',
        city: '青岛',
        area: '咖啡店',
        locationText: 'Citywalk 街区',
        activityType: '咖啡',
        commonTags: ['咖啡', 'Citywalk'],
        interestTags: ['咖啡', 'Citywalk'],
        matchScore: 72,
        suggestedOpener: '看到你散步，也许可以先轻松聊聊。',
      },
    });

    expect(card.data).toMatchObject({
      area: '青岛大学附近',
      activityType: '跑步',
      timePreference: '今天晚上',
      sharedInterests: ['跑步'],
      opportunity: expect.objectContaining({
        area: '青岛大学附近',
        time: '今天晚上',
        interests: ['跑步'],
        suggestedOpener: expect.stringContaining('跑步'),
      }),
    });
    const visibleFields = [
      card.data.area,
      card.data.activityType,
      card.data.timePreference,
      card.data.sharedInterests,
      (card.data.opportunity as Record<string, unknown>).area,
      (card.data.opportunity as Record<string, unknown>).time,
      (card.data.opportunity as Record<string, unknown>).interests,
      (card.data.opportunity as Record<string, unknown>).suggestedOpener,
    ];
    expect(JSON.stringify(visibleFields)).not.toContain('咖啡');
    expect(JSON.stringify(visibleFields)).not.toContain('Citywalk');
    expect(JSON.stringify(visibleFields)).not.toContain('散步');
  });

  it('fills product-safe defaults for weak cold-start candidate cards', () => {
    const card = makeService().candidate({
      taskId: 102,
      draft: {
        city: '青岛',
        activityType: '跑步',
        timePreference: '今晚',
      },
      candidate: {
        userId: 23,
        nickname: '阿森',
        score: 76,
      },
    });

    expect(card).toMatchObject({
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.candidate',
      data: expect.objectContaining({
        schemaName: 'OpportunityCard',
        schemaType: 'social_match.candidate',
        opportunity: expect.objectContaining({
          name: '阿森',
          suggestedOpener: expect.stringContaining('公共场所'),
          safetyBoundary: expect.stringContaining('公共场所'),
          discoverySafetySignals: expect.arrayContaining([
            expect.stringContaining('脱敏'),
            expect.stringContaining('确认'),
          ]),
          recommendationProtocol: expect.arrayContaining([
            expect.objectContaining({
              key: 'privacy',
              detail: expect.stringContaining('脱敏'),
            }),
            expect.objectContaining({
              key: 'approval',
              detail: expect.stringContaining('确认'),
            }),
          ]),
        }),
        suggestedOpener: expect.stringContaining('公共场所'),
      }),
      actions: expect.arrayContaining([
        expect.objectContaining({
          schemaAction: 'candidate.connect',
          requiresConfirmation: true,
          payload: expect.objectContaining({
            approvalRequired: true,
            checkpointRequired: true,
            suggestedOpener: expect.stringContaining('公共场所'),
          }),
        }),
      ]),
    });
  });

  it('emits stable assistant-ui opportunity schema for activity plans', () => {
    const card = makeService().activityPlan({
      taskId: 202,
      draft: {
        city: '上海',
        activityType: '羽毛球',
        timePreference: '周六 16:00',
        locationName: '徐汇公共球馆',
        description: '轻松打两局，先熟悉节奏。',
        participants: ['你', '阿杰'],
      },
    });

    expect(card).toMatchObject({
      type: 'activity_plan',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.activity',
      title: '约练计划待确认',
      data: expect.objectContaining({
        schemaName: 'OpportunityCard',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'social_match.activity',
        opportunityCard: true,
        opportunityType: 'activity',
        opportunityTitle: '羽毛球约练',
        opportunitySubtitle: '上海 · 周六 16:00',
        confirmedContext: expect.arrayContaining([
          '上海',
          '周六 16:00',
          '羽毛球',
          '徐汇公共球馆',
          expect.stringContaining('公共场所'),
        ]),
        opportunity: expect.objectContaining({
          type: 'activity',
          title: '羽毛球约练',
          subtitle: '上海 · 周六 16:00',
          city: '上海',
          location: '徐汇公共球馆',
          time: '周六 16:00',
          activityType: '羽毛球',
          safetyBadges: ['公共场所', '不共享精确位置', '确认后创建'],
          activityProtocol: expect.arrayContaining([
            expect.objectContaining({
              key: 'public_place',
              label: '公共场所',
              detail: expect.stringContaining('徐汇公共球馆'),
            }),
            expect.objectContaining({
              key: 'location_privacy',
              label: '位置保护',
              detail: '卡片只展示城市或模糊地点，不共享你的精确位置。',
            }),
            expect.objectContaining({
              key: 'approval',
              label: '创建确认',
              detail: '创建约练前必须由你确认时间、地点和参与边界。',
            }),
            expect.objectContaining({
              key: 'publish',
              label: '公开边界',
              detail: '默认不公开发布；如果需要公开发起，我会单独征得你确认。',
            }),
            expect.objectContaining({
              key: 'recovery',
              label: '连续推进',
              detail: '确认后进入“等待回复/确认到达/评价回写”的约练闭环。',
            }),
          ]),
          reasons: expect.arrayContaining([
            '需求：上海 · 周六 16:00 · 羽毛球',
            expect.stringContaining('地点：优先选择 徐汇公共球馆'),
            expect.stringContaining('确认：创建约练前必须由你确认'),
          ]),
          explanationSteps: expect.arrayContaining([
            '需求：上海 · 周六 16:00 · 羽毛球',
            expect.stringContaining('地点：优先选择 徐汇公共球馆'),
            expect.stringContaining('确认：创建约练前必须由你确认'),
          ]),
          publishPolicy:
            '默认不公开发布；如果需要公开发起，我会单独征得你确认。',
          approvalPolicy: '创建约练前必须由你确认时间、地点和参与边界。',
          meetLoopNextStep:
            '确认后进入“等待回复/确认到达/评价回写”的约练闭环。',
          checkinReminder: '活动开始前我会提醒你确认是否到达。',
          reviewPrompt: '活动结束后我会提醒你评价体验，帮助后续推荐更贴近你。',
          lifeGraphUpdatePreview: expect.stringContaining('Life Graph'),
          trustScoreUpdatePreview:
            '如果活动完成并完成评价，我会把履约结果写入 trust score。',
          recommendedNextAction: '确认后我再创建约练，不会自动公开发布。',
          confirmedContext: expect.arrayContaining([
            '上海',
            '周六 16:00',
            '羽毛球',
            '徐汇公共球馆',
            expect.stringContaining('公共场所'),
          ]),
        }),
        publishPolicy: '默认不公开发布；如果需要公开发起，我会单独征得你确认。',
        approvalPolicy: '创建约练前必须由你确认时间、地点和参与边界。',
        meetLoopNextStep: '确认后进入“等待回复/确认到达/评价回写”的约练闭环。',
        activityProtocol: expect.arrayContaining([
          expect.objectContaining({ key: 'approval', label: '创建确认' }),
          expect.objectContaining({ key: 'publish', label: '公开边界' }),
          expect.objectContaining({ key: 'recovery', label: '连续推进' }),
        ]),
        explanationSteps: expect.arrayContaining([
          '需求：上海 · 周六 16:00 · 羽毛球',
          expect.stringContaining('边界：'),
        ]),
        fitReasons: expect.arrayContaining([
          '需求：上海 · 周六 16:00 · 羽毛球',
          expect.stringContaining('边界：'),
        ]),
      }),
      actions: expect.arrayContaining([
        expect.objectContaining({
          label: '查看详情',
          action: 'activity.view_detail',
          schemaAction: 'activity.view_detail',
          requiresConfirmation: false,
        }),
        expect.objectContaining({
          label: '发布卡片',
          action: 'publish_to_discover',
          schemaAction: 'activity.confirm_create',
          requiresConfirmation: true,
          payload: expect.objectContaining({
            actionType: 'create_activity',
            sideEffect: 'create_activity',
            approvalRequired: true,
            checkpointRequired: true,
            resumeMode: 'resume_after_approval',
            idempotencyKey: 'activity-create:202',
            riskLevel: 'medium',
            riskReasons: expect.arrayContaining([
              '这个动作会创建真实约练',
              '公开发布或邀请他人前必须由你确认',
              '不会共享精确位置',
            ]),
          }),
        }),
      ]),
    });
  });

  it('keeps audit update copy user-facing instead of backend approval jargon', () => {
    const card = makeService().auditUpdate({
      taskId: 202,
      approvalRequiredActions: [
        {
          actionType: 'send_invite',
          riskLevel: 'medium',
          reason: '发送邀请前需要用户确认',
        },
      ],
    });

    expect(card).toMatchObject({
      schemaType: 'safety.approval',
      title: '确认后我再继续',
      body: '我准备好了一步会触达他人或公开内容的操作。你确认前，我不会发送、连接或发布。',
      data: expect.objectContaining({
        auditNote:
          '确认或取消后，你都可以回看这次决定；如果想改内容，直接告诉我。',
        approval: expect.objectContaining({
          title: '确认后我再继续',
          boundary:
            '我准备好了一步会触达他人或公开内容的操作。你确认前，我不会发送、连接或发布。',
          auditNote:
            '确认或取消后，你都可以回看这次决定；如果想改内容，直接告诉我。',
          checkpointLabel: '我会接着处理',
        }),
      }),
    });
    expect(JSON.stringify(card)).not.toMatch(
      /审批审计日志|审计日志|audit log/i,
    );
    expect(JSON.stringify(card)).not.toMatch(/当前有\s*\d+\s*个动作/);
  });
});
