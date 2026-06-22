import {
  enforceSocialIntentGate,
  enforceExplicitSocialExecutionRoute,
  hasExplicitCandidateRefinementIntent,
  hasExplicitCandidateMessageConfirmationIntent,
  hasExplicitEmptyCandidateRecoveryIntent,
  hasExistingSocialActionContext,
  hasExplicitPublishSideEffectIntent,
  hasExplicitSocialSideEffectIntent,
  hasExplicitSocialExecutionIntent,
  explicitlyRejectsSocialExecution,
  isConversationOnlySocialMention,
  shouldAllowSocialExecution,
} from './social-agent-social-intent-gate';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';

describe('social agent social intent gate', () => {
  it.each([
    '这个平台有没有活动功能？',
    'FitMeet 支持找人功能吗？',
    '可以介绍一下约练和加好友流程吗？',
    '有没有推荐用户的入口说明？',
    '我现在不想交友，只想聊聊今天的压力',
    '先不要推荐人，我只是问一个普通问题',
    '我适合认识什么样的人？先给我建议，不要推荐真实用户',
    '你觉得我想认识哪类朋友会更合适？',
    '推荐什么样的人比较适合我，先别直接找人',
    '推荐一些适合我的运动搭子类型，不要给真实用户',
    '帮我分析一下我的理想型，先不要搜索候选人',
    '根据我的画像判断我适合认识哪类朋友，不要推荐真实用户',
    '最近参加活动有点累，我想先安静聊会儿',
    '我只是想说说最近交友压力，不需要推荐任何人',
    '先别约练，也别搜索用户，我只是心情不好',
    '我想找回之前的聊天记录',
    '帮我找一下设置入口在哪里',
    '给我找一下隐私政策说明',
    '我想找客服问问账号问题',
  ])(
    'keeps capability and workflow questions out of social execution: %s',
    (message) => {
      expect(hasExplicitSocialExecutionIntent(message)).toBe(false);
      expect(
        shouldAllowSocialExecution({
          message,
          intent: 'activity_search',
        }),
      ).toBe(false);
    },
  );

  it.each([
    '周末有没有羽毛球活动，帮我看看',
    '青岛附近有没有户外徒步活动',
    '帮我找周末下午一起跑步的人',
    '推荐几个公开可发现的篮球搭子',
    '帮我找几个适合我的青岛跑步搭子',
    '我想认识周末能一起咖啡散步的新朋友',
    '我想在青岛大学附近，今天晚上，散步，找女生，最好喜欢编程',
  ])('allows explicit opportunity discovery: %s', (message) => {
    expect(hasExplicitSocialExecutionIntent(message)).toBe(true);
    expect(
      shouldAllowSocialExecution({
        message,
        intent: 'social_search',
      }),
    ).toBe(true);
  });

  it('keeps rich profile facts as profile enrichment unless the user asks to search now', () => {
    const profileFacts =
      '我是白羊男，18，身高181，体重70kg，在青岛上学，性格开放、infp。常住在崂山区青岛大学，想找个同校的女生';

    expect(hasExplicitSocialExecutionIntent(profileFacts)).toBe(false);
    expect(
      shouldAllowSocialExecution({
        message: profileFacts,
        intent: 'social_search',
      }),
    ).toBe(false);
    expect(
      enforceSocialIntentGate({ message: profileFacts }, {
        intent: 'social_search',
        confidence: 0.9,
        entities: {
          city: '青岛',
          activityType: '',
          targetGender: '女生',
          timePreference: '',
          locationPreference: '青岛大学',
        },
        shouldSearch: true,
        shouldReplan: false,
        shouldUpdateProfile: false,
        shouldExecuteAction: false,
        replyStrategy: 'search_candidates',
        source: 'deepseek',
      } satisfies SocialAgentIntentRouterResult),
    ).toMatchObject({
      intent: 'profile_enrichment',
      shouldSearch: false,
      shouldUpdateProfile: true,
      replyStrategy: 'conversational_answer',
    });
  });

  it('keeps explicit profile completion requests out of social search', () => {
    const message = '请帮我完善人物画像：我周末下午一般有空，喜欢跑步。';

    expect(hasExplicitSocialExecutionIntent(message)).toBe(false);
    expect(
      enforceSocialIntentGate({ message }, {
        intent: 'social_search',
        confidence: 0.88,
        entities: {
          city: '',
          activityType: '跑步',
          targetGender: '',
          timePreference: '周末下午',
          locationPreference: '',
        },
        shouldSearch: true,
        shouldReplan: false,
        shouldUpdateProfile: false,
        shouldExecuteAction: false,
        replyStrategy: 'search_candidates',
        source: 'deepseek',
      } satisfies SocialAgentIntentRouterResult),
    ).toMatchObject({
      intent: 'profile_enrichment_request',
      shouldSearch: false,
      shouldUpdateProfile: true,
      replyStrategy: 'conversational_answer',
    });
  });

  it('allows candidate follow-up only when there is existing social context', () => {
    expect(hasExplicitCandidateRefinementIntent('有没有女生')).toBe(true);
    expect(
      shouldAllowSocialExecution({
        message: '第二个更合适吗？',
        intent: 'candidate_followup',
      }),
    ).toBe(false);
    expect(
      shouldAllowSocialExecution({
        message: '第二个更合适吗？',
        intent: 'candidate_followup',
        taskContext: { hasCandidates: true },
      }),
    ).toBe(true);
  });

  it('forces explicit candidate refinement back into candidate follow-up even if model routes generic chat', () => {
    const route = enforceExplicitSocialExecutionRoute(
      {
        message: '有没有女生',
        taskContext: { hasCandidates: true, candidateCount: 4 },
        conversationIntent: 'conversation',
      },
      {
        intent: 'casual_chat',
        confidence: 0.78,
        entities: {
          city: '',
          activityType: '',
          targetGender: '',
          timePreference: '',
          locationPreference: '',
        },
        shouldSearch: false,
        shouldReplan: false,
        shouldUpdateProfile: false,
        shouldExecuteAction: false,
        replyStrategy: 'conversational_answer',
        source: 'deepseek',
      } satisfies SocialAgentIntentRouterResult,
    );

    expect(route).toMatchObject({
      intent: 'candidate_followup',
      shouldSearch: true,
      replyStrategy: 'search_candidates',
    });
  });

  it('uses conversation intent to block implicit social continuation from stale context', () => {
    expect(
      shouldAllowSocialExecution({
        message: '为什么我的记忆没了？',
        intent: 'candidate_followup',
        taskContext: { hasCandidates: true, hasSearchContext: true },
        conversationIntent: 'conversation',
      }),
    ).toBe(false);

    const route = enforceSocialIntentGate(
      {
        message: '为什么我的记忆没了？',
        taskContext: { hasCandidates: true, hasSearchContext: true },
        conversationIntent: 'conversation',
      },
      {
        intent: 'candidate_followup',
        confidence: 0.91,
        entities: {
          city: '',
          activityType: '',
          targetGender: '',
          timePreference: '',
          locationPreference: '',
        },
        shouldSearch: true,
        shouldReplan: true,
        shouldUpdateProfile: false,
        shouldExecuteAction: false,
        replyStrategy: 'search_candidates',
        source: 'deepseek',
      } satisfies SocialAgentIntentRouterResult,
    );

    expect(route).toMatchObject({
      intent: 'casual_chat',
      shouldSearch: false,
      shouldExecuteAction: false,
      replyStrategy: 'conversational_answer',
    });
  });

  it('does not let conversation intent suppress an explicit user request to find people', () => {
    expect(
      shouldAllowSocialExecution({
        message: '今天晚上青岛大学附近散步，帮我找人',
        intent: 'social_search',
        conversationIntent: 'conversation',
      }),
    ).toBe(true);
  });

  it('allows cold-start matching when the user opts out of publishing a card', () => {
    const message = '我不想发布卡片，只想根据我的画像找几个合适的人';

    expect(explicitlyRejectsSocialExecution(message)).toBe(false);
    expect(hasExplicitSocialExecutionIntent(message)).toBe(true);
    expect(hasExplicitPublishSideEffectIntent(message)).toBe(false);
    expect(hasExplicitSocialSideEffectIntent(message)).toBe(false);
    expect(
      shouldAllowSocialExecution({
        message,
        intent: 'social_search',
        conversationIntent: 'social',
      }),
    ).toBe(true);
  });

  it('recognizes explicit publish requests without reducing them to candidate search only', () => {
    const message =
      '我想今天晚上在青岛大学附近散步，帮我生成并发布一张约练卡到发现，只公开模糊地点。';

    expect(hasExplicitSocialExecutionIntent(message)).toBe(true);
    expect(hasExplicitPublishSideEffectIntent(message)).toBe(true);
    expect(hasExplicitSocialSideEffectIntent(message)).toBe(true);
  });

  it('keeps publish opt-out from becoming a publish side effect while preserving explicit matching', () => {
    expect(hasExplicitPublishSideEffectIntent('先不发布到发现')).toBe(false);
    expect(
      shouldAllowSocialExecution({
        message: '先不发布到发现，也不要推荐人，我只是想普通聊聊',
        intent: 'social_search',
        taskContext: { hasSearchContext: true },
        conversationIntent: 'social',
      }),
    ).toBe(false);
    expect(
      shouldAllowSocialExecution({
        message: '先不发布到发现，帮我按兴趣匹配几个公开可发现用户',
        intent: 'social_search',
        conversationIntent: 'social',
      }),
    ).toBe(true);
  });

  it('allows short follow-up social search only when an existing task context is active', () => {
    expect(
      shouldAllowSocialExecution({
        message: '可以',
        intent: 'social_search',
      }),
    ).toBe(false);
    expect(
      shouldAllowSocialExecution({
        message: '可以',
        intent: 'social_search',
        taskContext: { hasSearchContext: true },
      }),
    ).toBe(true);
    expect(
      shouldAllowSocialExecution({
        message: '可以，继续帮我看看活动',
        intent: 'activity_search',
        taskContext: { hasSearchContext: true },
      }),
    ).toBe(true);
  });

  it('requires existing candidate, approval, or social task context before side-effect actions can run', () => {
    expect(
      hasExistingSocialActionContext({
        taskContext: { hasCandidates: false, hasSearchContext: false },
      }),
    ).toBe(false);
    expect(
      shouldAllowSocialExecution({
        message: '帮我发给这个人',
        intent: 'action_request',
      }),
    ).toBe(false);
    expect(
      shouldAllowSocialExecution({
        message: '帮我发给这个人',
        intent: 'action_request',
        taskContext: { hasCandidates: true },
      }),
    ).toBe(true);
    expect(
      shouldAllowSocialExecution({
        message: '确认发布',
        intent: 'action_request',
        taskContext: {
          pendingApprovals: [{ id: 88, actionType: 'publish_social_request' }],
        },
      }),
    ).toBe(true);
    expect(
      shouldAllowSocialExecution({
        message: '那你帮我发布到发现',
        intent: 'action_request',
        taskContext: {
          taskSlots: {
            activity: { value: '健身', state: 'completed' },
            time_window: { value: '今晚', state: 'completed' },
            location_text: { value: '青岛大学附近', state: 'completed' },
          },
        },
      }),
    ).toBe(true);
    expect(
      shouldAllowSocialExecution({
        message: '发送吧',
        intent: 'action_request',
      }),
    ).toBe(false);
    expect(
      shouldAllowSocialExecution({
        message: '发送吧',
        intent: 'action_request',
        taskContext: {
          pendingActions: [{ actionType: 'send_invite' }],
        },
      }),
    ).toBe(true);
  });

  it('keeps explicit opt-out and conversation-only messages from continuing task search', () => {
    expect(
      shouldAllowSocialExecution({
        message: '先不要推荐人，我只是问一个普通问题',
        intent: 'social_search',
        taskContext: { hasSearchContext: true },
      }),
    ).toBe(false);
    expect(
      shouldAllowSocialExecution({
        message: '我现在不想交友，只想聊聊今天的压力',
        intent: 'social_search',
        taskContext: { hasCandidates: true },
      }),
    ).toBe(false);
  });

  it('separates candidate message confirmation from follow-up and discovery copy', () => {
    expect(hasExplicitCandidateMessageConfirmationIntent('确认发送')).toBe(
      true,
    );
    expect(hasExplicitCandidateMessageConfirmationIntent('可以发送')).toBe(
      true,
    );
    expect(
      hasExplicitCandidateMessageConfirmationIntent('为什么需要确认？'),
    ).toBe(false);
    expect(
      hasExplicitCandidateMessageConfirmationIntent('可以，帮我找人'),
    ).toBe(false);
    expect(hasExplicitCandidateMessageConfirmationIntent('还不发')).toBe(false);
  });

  it('detects empty-candidate recovery instructions without treating help questions as execution', () => {
    expect(hasExplicitEmptyCandidateRecoveryIntent('扩大到 10 公里')).toBe(
      true,
    );
    expect(hasExplicitEmptyCandidateRecoveryIntent('放宽舞蹈相关偏好')).toBe(
      true,
    );
    expect(hasExplicitEmptyCandidateRecoveryIntent('改到周末下午')).toBe(true);
    expect(hasExplicitEmptyCandidateRecoveryIntent('怎么扩大匹配范围？')).toBe(
      false,
    );
    expect(
      hasExplicitEmptyCandidateRecoveryIntent('我只是想找一下设置入口'),
    ).toBe(false);
  });

  it('normalizes allowed social search routes so complete requests can queue search', () => {
    const route = enforceSocialIntentGate(
      {
        message:
          '现在帮我找青岛大学同校女生，周末下午轻松跑步或散步，公共场所先站内聊，接受陌生人，不公开发起。',
      },
      {
        intent: 'social_search',
        confidence: 0.88,
        entities: {
          city: '青岛',
          activityType: '跑步',
          targetGender: '女生',
          timePreference: '周末下午',
          locationPreference: '',
        },
        shouldSearch: false,
        shouldReplan: false,
        shouldUpdateProfile: false,
        shouldExecuteAction: false,
        replyStrategy: 'conversational_answer',
        source: 'rules',
      } satisfies SocialAgentIntentRouterResult,
    );

    expect(route).toMatchObject({
      intent: 'social_search',
      shouldSearch: true,
      shouldExecuteAction: false,
      replyStrategy: 'search_candidates',
    });
  });

  it('downgrades model social-search guesses when the user says they only want to talk', () => {
    const message = '我只是想说说最近交友压力，不需要推荐任何人';

    expect(isConversationOnlySocialMention(message)).toBe(true);
    expect(
      enforceSocialIntentGate({ message }, {
        intent: 'social_search',
        confidence: 0.91,
        entities: {
          city: '',
          activityType: '',
          targetGender: '',
          timePreference: '',
          locationPreference: '',
        },
        shouldSearch: true,
        shouldReplan: true,
        shouldUpdateProfile: false,
        shouldExecuteAction: false,
        replyStrategy: 'search_candidates',
        source: 'deepseek',
      } satisfies SocialAgentIntentRouterResult),
    ).toMatchObject({
      intent: 'casual_chat',
      shouldSearch: false,
      shouldExecuteAction: false,
      replyStrategy: 'conversational_answer',
    });
  });
});
