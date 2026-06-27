import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FitMeetToolUIActionsProvider } from '../components/assistant-ui/tool-ui-actions';
import { AssistantDataFallback } from '../components/assistant-ui/tool-fallback';
import {
  socialProfileApi,
  type SocialProfileBuilderCard,
  type SocialProfileCompletion,
} from '../api/socialProfileApi';
import type { UserFacingAgentResponse } from '../api/socialAgentApi';

vi.mock('@assistant-ui/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@assistant-ui/react')>();
  return {
    ...actual,
    useAuiState: (
      selector: (state: {
        message: { id: string; metadata: { custom: Record<string, unknown> } };
        thread: { isRunning: boolean };
      }) => unknown,
    ) =>
      selector({
        message: { id: 'test-message', metadata: { custom: {} } },
        thread: { isRunning: false },
      }),
  };
});

function profileDraft(): SocialProfileBuilderCard {
  return {
    basic: {
      nickname: 'Nova',
      city: '青岛',
      ageRange: '25-34',
      gender: '',
      zodiac: '',
    },
    personality: {
      mbti: '',
      traits: [],
      socialStyle: '',
      communicationStyle: '',
    },
    interests: {
      sports: ['跑步'],
      lifestyle: [],
      socialScenes: [],
    },
    preferences: {
      wantToMeet: ['跑步搭子'],
      preferredTraits: [],
      avoid: ['夜间私人场所'],
    },
    relationshipIntent: {
      goals: [],
      openness: '',
    },
    availability: {
      weekdays: '',
      weekends: '周末下午',
    },
    visibility: {
      profileDiscoverable: true,
      agentCanRecommendMe: true,
      agentCanStartChatAfterApproval: true,
    },
    matchSignals: {
      publicTags: ['跑步'],
      privatePreferenceTags: [],
      sensitivePrivateTags: [],
      matchKeywords: ['跑步', '青岛'],
      confidence: 0.7,
      source: 'fallback',
    },
    summary: '青岛周末跑步。',
  };
}

function completion(overrides: Partial<SocialProfileCompletion> = {}): SocialProfileCompletion {
  return {
    completedFields: ['city', 'fitnessGoals', 'wantToMeet', 'privacyBoundary'],
    missingFields: ['availableTimes'],
    percent: 70,
    readinessLevel: 'match_ready',
    canEnterMatchPool: false,
    authorizationRequired: true,
    authorization: {
      matchPoolEnabled: false,
      profileDiscoverable: false,
      agentCanRecommendMe: false,
      agentCanStartChatAfterApproval: false,
      hideSensitiveTags: true,
      requiresOwnerConfirmationToEnable: true,
      consentSource: 'not_enabled',
    },
    sections: [],
    nextActions: [],
    ...overrides,
  };
}

describe('assistant-ui tool fallback rendering', () => {
  const response = (
    partial: Pick<UserFacingAgentResponse, 'assistantMessage' | 'cards' | 'pendingConfirmations'>,
  ): UserFacingAgentResponse => ({
    assistantMessage: partial.assistantMessage,
    cards: partial.cards,
    pendingConfirmations: partial.pendingConfirmations,
    lightStatus: '已整理回复',
    safeStatus: {
      blocked: false,
      level: 'low',
      boundaryNotes: [],
      requiredConfirmations: [],
    },
    permissionMode: 'confirm',
  });

  it('keeps multiple standalone approvals inside one compact product card and exposes only the current decision', () => {
    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-approval"
        data={{
          pendingConfirmations: [
            {
              id: 1,
              actionType: 'send_invite',
              summary: '确认发送约练邀请',
              riskLevel: 'high',
            },
            {
              id: 2,
              actionType: 'connect_candidate',
              summary: '确认加好友并聊天',
              riskLevel: 'high',
            },
            {
              id: 3,
              actionType: 'publish_social_request',
              summary: '确认发布到发现',
              riskLevel: 'medium',
            },
          ],
        }}
      />,
    );

    const approval = screen.getByTestId('assistant-ui-approval-tool');
    expect(approval).toHaveAttribute('data-density', 'inline');
    expect(approval).toHaveAttribute('data-visible-confirmation-count', '1');
    expect(approval).toHaveAttribute('data-hidden-confirmation-count', '2');
    expect(screen.getAllByTestId('assistant-ui-approval-confirmation-row')).toHaveLength(1);
    expect(screen.getByTestId('assistant-ui-approval-collapsed-count')).toHaveTextContent(
      '还有 2 个动作也在这张卡里',
    );
    expect(screen.getByTestId('assistant-ui-approval-queued-actions')).toHaveTextContent(
      '确认加好友并聊天',
    );
    expect(screen.getByTestId('assistant-ui-approval-queued-actions')).toHaveTextContent(
      '确认发布到发现',
    );
    expect(approval).toHaveTextContent('确认发送邀请');
    expect(approval).not.toHaveTextContent(/connect_candidate|publish_social_request/);
  });

  it('cleans legacy approval summaries before rendering standalone approval UI', () => {
    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-approval"
        data={{
          pendingConfirmations: [
            {
              id: 88,
              actionType: 'connect_candidate',
              summary: '连接候选人之前先确认。',
              riskLevel: 'high',
            },
          ],
        }}
      />,
    );

    const approval = screen.getByTestId('assistant-ui-approval-tool');
    expect(approval).toHaveTextContent('确认加好友并聊天');
    expect(approval).toHaveTextContent('加好友并聊天前需要你确认');
    expect(approval).toHaveTextContent('确认后才会发出好友申请');
    expect(approval).not.toHaveTextContent('连接候选人');
    expect(approval).not.toHaveTextContent(
      /riskLevel|medium|checkpoint|audit|将要执行|风险级别|风险等级|动作：|动作:/i,
    );
  });

  it('does not render standalone approval panels for low-risk candidate actions', () => {
    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-approval"
        data={{
          pendingConfirmations: [
            {
              id: 'save-chen',
              actionType: 'candidate.like',
              summary: '收藏候选人',
              riskLevel: 'medium',
            },
            {
              id: 'opener-chen',
              actionType: 'candidate.generate_opener',
              summary: '生成开场白',
              riskLevel: 'low',
            },
          ],
        }}
      />,
    );

    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();
    expect(screen.queryByText(/收藏候选人|生成开场白/)).not.toBeInTheDocument();
  });

  it('does not render draft-only opener safety cards as standalone approvals', () => {
    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-cards"
        data={{
          cards: [
            {
              id: 'opener-draft-only',
              schemaType: 'safety.approval',
              schemaVersion: 'fitmeet.tool-ui.v1',
              title: '生成开场白草稿',
              body: '只生成草稿，不会自动发送给对方。',
              data: {
                schemaName: 'SafetyApprovalCard',
                schemaType: 'safety.approval',
                summary: '生成开场白草稿，不会发送给对方。',
                riskLevel: 'low',
              },
              actions: [],
            },
          ],
        }}
      />,
    );

    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-generative-cards')).not.toBeInTheDocument();
    expect(screen.queryByText(/生成开场白草稿/)).not.toBeInTheDocument();
  });

  it('renders profile completion cards as fillable interview cards', async () => {
    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-cards"
        data={{
          cards: [
            {
              id: 'profile_completion:101',
              type: 'profile_completion',
              schemaVersion: 'fitmeet.tool-ui.v1',
              schemaType: 'profile.completion',
              title: '让 Agent 帮你补充个人信息',
              body: '回答后先生成更新预览。',
              data: {
                schemaName: 'ProfileCompletionCard',
                schemaVersion: 'fitmeet.tool-ui.v1',
                schemaType: 'profile.completion',
                questions: [
                  {
                    key: 'currentGoal',
                    label: '当前目标',
                    question: '你这次最想达成什么？',
                    options: ['找运动搭子', '暂不确定'],
                  },
                  {
                    key: 'safetyBoundary',
                    label: '安全边界',
                    question: '有哪些必要的安全边界？',
                    options: ['只接受公共场所', '暂不确定'],
                  },
                ],
              },
              actions: [],
            },
          ],
        }}
      />,
    );

    const card = await screen.findByTestId('profile-completion-card');
    expect(card).toHaveTextContent('让 Agent 帮你补充个人信息');
    expect(card).toHaveTextContent('你这次最想达成什么');
    expect(card).toHaveTextContent('有哪些必要的安全边界');
    expect(within(card).getByRole('button', { name: '生成更新预览' })).toBeDisabled();
    expect(within(card).getByRole('button', { name: '本次使用，不保存' })).toBeInTheDocument();
  });

  it('saves profile completion without implicit matching consent', async () => {
    const draft = profileDraft();
    const aiDraftSpy = vi.spyOn(socialProfileApi, 'aiDraft').mockResolvedValue({
      mode: 'fallback',
      draft,
      proposal: {
        proposalId: 901,
        baseProfileVersion: 3,
        proposedFields: { city: '青岛', fitnessGoals: ['跑步'] },
        draft,
        status: 'pending',
        expiresAt: '2026-06-25T00:00:00.000Z',
      },
      profileUsed: {} as never,
      completion: completion({ authorizationRequired: true }),
    });
    const aiSaveSpy = vi.spyOn(socialProfileApi, 'aiSave').mockResolvedValue({
      profile: {} as never,
      aiDelegateProfile: null,
      matchingEnabled: false,
      completion: completion({
        percent: 82,
        missingFields: [],
        canEnterMatchPool: true,
        authorizationRequired: true,
      }),
      proposal: null,
    });
    const updatePrivacySpy = vi.spyOn(socialProfileApi, 'updatePrivacy').mockResolvedValue({
      profileDiscoverable: true,
      agentCanRecommendMe: true,
      agentCanStartChatAfterApproval: false,
      hideSensitiveTags: true,
      candidateDisplayMode: 'anonymous_until_confirmed',
      candidateAvatarVisibility: 'hidden_until_confirmed',
      candidateCoarseArea: '',
      contactDisclosurePolicy: 'in_app_after_match',
      preciseLocationPolicy: 'coarse_only',
      strangerOpenerPolicy: 'opener_requires_confirmation',
      strangerInvitePolicy: 'invite_requires_confirmation',
      strangerFriendPolicy: 'friend_requires_confirmation',
      matchPoolEnabled: true,
      completion: completion({
        percent: 82,
        missingFields: [],
        canEnterMatchPool: true,
        authorizationRequired: false,
      }),
      authorization: undefined,
      sensitiveTagSummary: { pending: 0, confirmed: 0, rejected: 0, hidden: 0 },
    });

    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-cards"
        data={{
          cards: [
            {
              id: 'profile_completion:consent',
              type: 'profile_completion',
              schemaVersion: 'fitmeet.tool-ui.v1',
              schemaType: 'profile.completion',
              title: '让 Agent 帮你补充个人信息',
              body: '回答后先生成更新预览。',
              data: {
                schemaName: 'ProfileCompletionCard',
                schemaVersion: 'fitmeet.tool-ui.v1',
                schemaType: 'profile.completion',
                questions: [
                  {
                    key: 'city',
                    label: '城市与活动范围',
                    question: '你在哪个城市？',
                    options: ['青岛'],
                  },
                ],
              },
              actions: [],
            },
          ],
        }}
      />,
    );

    const card = await screen.findByTestId('profile-completion-card');
    fireEvent.click(within(card).getByRole('button', { name: '青岛' }));
    fireEvent.click(within(card).getByRole('button', { name: '生成更新预览' }));

    await waitFor(() => expect(aiDraftSpy).toHaveBeenCalled());
    fireEvent.click(within(card).getByRole('button', { name: '确认保存' }));

    await waitFor(() =>
      expect(aiSaveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          profile: draft,
          proposalId: 901,
          expectedProfileVersion: 3,
        }),
      ),
    );
    expect(aiSaveSpy.mock.calls[0]?.[0]).not.toMatchObject({
      enableMatching: true,
      matchingConsent: true,
      profileVisibilityConsent: true,
    });
    expect(await screen.findByTestId('profile-matching-authorization-card')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '确认开启匹配授权' }));
    await waitFor(() =>
      expect(updatePrivacySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          profileDiscoverable: true,
          agentCanRecommendMe: true,
          ownerConfirmed: true,
          matchingConsent: true,
          profileVisibilityConsent: true,
        }),
      ),
    );
  });

  it('shows user-facing labels for remaining profile gaps after saving', async () => {
    const draft = profileDraft();
    vi.spyOn(socialProfileApi, 'aiDraft').mockResolvedValue({
      mode: 'fallback',
      draft,
      proposal: {
        proposalId: 902,
        baseProfileVersion: 3,
        proposedFields: {},
        draft,
        status: 'pending',
        expiresAt: '2026-06-27T00:00:00.000Z',
      },
      profileUsed: {} as never,
      completion: completion(),
    });
    vi.spyOn(socialProfileApi, 'aiSave').mockResolvedValue({
      profile: {} as never,
      aiDelegateProfile: null,
      matchingEnabled: false,
      completion: completion({
        percent: 87,
        missingFields: ['ageRange', 'gender', 'nearbyArea'],
      }),
      proposal: null,
    });

    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-cards"
        data={{
          cards: [
            {
              id: 'profile_completion:labels',
              type: 'profile_completion',
              schemaVersion: 'fitmeet.tool-ui.v1',
              schemaType: 'profile.completion',
              title: '让 Agent 帮你补充个人信息',
              body: '回答后先生成更新预览。',
              data: {
                schemaName: 'ProfileCompletionCard',
                schemaVersion: 'fitmeet.tool-ui.v1',
                schemaType: 'profile.completion',
                questions: [
                  {
                    key: 'nearbyArea',
                    label: '常活动区域',
                    question: '你通常在哪个区、商圈或健身房附近活动？',
                    options: ['学校或公司附近'],
                  },
                ],
              },
              actions: [],
            },
          ],
        }}
      />,
    );

    const card = await screen.findByTestId('profile-completion-card');
    fireEvent.click(within(card).getByRole('button', { name: '学校或公司附近' }));
    fireEvent.click(within(card).getByRole('button', { name: '生成更新预览' }));
    await waitFor(() => expect(socialProfileApi.aiDraft).toHaveBeenCalled());
    fireEvent.click(within(card).getByRole('button', { name: '确认保存' }));

    await screen.findByText(/性别展示偏好/);
    expect(screen.getByText(/年龄段展示偏好/)).toBeInTheDocument();
    expect(screen.getAllByText(/常活动区域/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/ageRange/)).not.toBeInTheDocument();
    expect(screen.queryByText(/gender/)).not.toBeInTheDocument();
    expect(screen.queryByText(/nearbyArea/)).not.toBeInTheDocument();
  });

  it('keeps standalone approval panels for high-risk social actions', () => {
    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-approval"
        data={{
          pendingConfirmations: [
            {
              id: 'invite-chen',
              actionType: 'send_invite',
              summary: '确认发送给陈砚',
              riskLevel: 'medium',
            },
          ],
        }}
      />,
    );

    const approval = screen.getByTestId('assistant-ui-approval-tool');
    expect(approval).toHaveTextContent('确认发送邀请');
    expect(screen.getByTestId('assistant-ui-approval-confirmation-row')).toBeInTheDocument();
  });

  it('turns backend-style approval metadata into product copy', () => {
    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-approval"
        data={{
          pendingConfirmations: [
            {
              id: 'publish-qdu-walk',
              actionType: 'publish_social_request',
              summary: '风险级别：medium · 动作：需要确认的操作',
              riskLevel: 'medium',
            },
          ],
        }}
      />,
    );

    const approval = screen.getByTestId('assistant-ui-approval-tool');
    expect(approval).toHaveTextContent('确认发布到发现');
    expect(approval).toHaveTextContent('把约练卡公开到发现页');
    expect(approval).toHaveTextContent('确认后才会发布到发现');
    expect(approval).not.toHaveTextContent(/风险级别|风险等级|medium|动作：|动作:/i);
  });

  it('renders candidate actions in one card and opens approval inline only for high-risk actions', async () => {
    const onCardAction = vi.fn((input: { schemaAction?: string | null }) => {
      if (input.schemaAction === 'candidate.like') {
        return response({
          assistantMessage: '已收藏这个候选人。',
          cards: [],
          pendingConfirmations: [],
        });
      }
      if (input.schemaAction === 'candidate.generate_opener') {
        return response({
          assistantMessage: '可以这样开场。',
          pendingConfirmations: [],
          cards: [
            {
              id: 'candidate-card-chen-opener',
              type: 'candidate_card',
              schemaType: 'social_match.candidate',
              schemaVersion: 'fitmeet.tool-ui.v1',
              title: '给陈砚的开场白',
              body: '你好，我也在青岛大学附近散步，要不要今天先轻松走一圈？',
              data: {
                schemaType: 'social_match.candidate',
                displayName: '陈砚',
                suggestedOpener: '你好，我也在青岛大学附近散步，要不要今天先轻松走一圈？',
              },
              actions: [],
            },
          ],
        });
      }
      if (input.schemaAction === 'opener.confirm_send') {
        return response({
          assistantMessage: '发送前需要你确认。',
          cards: [],
          pendingConfirmations: [
            {
              id: 711,
              type: 'send_invite',
              actionType: 'send_invite',
              summary: 'riskLevel medium checkpoint audit',
              riskLevel: 'medium',
              expiresAt: null,
            },
          ],
        });
      }
      return response({ assistantMessage: '已继续。', cards: [], pendingConfirmations: [] });
    });
    const onApproveApproval = vi.fn(() =>
      response({
        assistantMessage: '已确认发送给陈砚，后续进展会留在当前对话。',
        cards: [],
        pendingConfirmations: [],
      }),
    );

    render(
      <FitMeetToolUIActionsProvider value={{ onCardAction, onApproveApproval }}>
        <AssistantDataFallback
          type="data"
          status={{ type: 'complete' }}
          name="fitmeet-cards"
          data={{
            cards: [
              {
                id: 'candidate-card-chen',
                schemaType: 'social_match.candidate',
                schemaVersion: 'fitmeet.tool-ui.v1',
                title: '陈砚',
                body: '青岛大学附近，公开资料显示喜欢散步和舞蹈。',
                data: {
                  schemaType: 'social_match.candidate',
                  displayName: '陈砚',
                  candidateRecordId: 'candidate-record-chen',
                  city: '青岛',
                  distanceLabel: '青岛大学附近',
                  interests: ['散步', '舞蹈'],
                  matchReasons: ['地点接近', '公开兴趣匹配'],
                },
                actions: [
                  {
                    id: 'view-chen',
                    label: '查看',
                    action: 'candidate.view_detail',
                    schemaAction: 'candidate.view_detail',
                    requiresConfirmation: false,
                  },
                  {
                    id: 'save-chen',
                    label: '收藏',
                    action: 'candidate.like',
                    schemaAction: 'candidate.like',
                    requiresConfirmation: true,
                  },
                  {
                    id: 'opener-chen',
                    label: '开场白',
                    action: 'candidate.generate_opener',
                    schemaAction: 'candidate.generate_opener',
                    requiresConfirmation: true,
                  },
                  {
                    id: 'send-chen',
                    label: '确认发送给陈砚',
                    action: 'send_invite',
                    schemaAction: 'opener.confirm_send',
                    requiresConfirmation: true,
                    payload: { candidateRecordId: 'candidate-record-chen' },
                  },
                  {
                    id: 'connect-chen',
                    label: '加好友并聊天',
                    action: 'connect_candidate',
                    schemaAction: 'candidate.connect',
                    requiresConfirmation: true,
                    payload: { candidateRecordId: 'candidate-record-chen' },
                  },
                ],
              },
            ],
          }}
        />
      </FitMeetToolUIActionsProvider>,
    );

    const candidate = screen.getByTestId('assistant-ui-schema-card');
    const candidateCard = await within(candidate).findByTestId('opportunity-card');
    expect(candidateCard).toHaveAttribute('data-layout-model', 'structured-recommendation-card');
    expect(candidateCard).toHaveAttribute('data-action-placement', 'bottom-grid');
    expect(candidateCard).toHaveTextContent('陈砚，适合从一次轻松散步开始');
    expect(candidateCard).toHaveTextContent('推荐理由');
    expect(candidateCard).toHaveTextContent('地点接近');
    expect(candidateCard).toHaveTextContent('青岛');
    expect(candidateCard).toHaveTextContent('时间待确认');
    const actionCard = within(candidate).getByTestId('assistant-ui-unified-action-card');
    expect(
      within(actionCard)
        .getAllByTestId('assistant-ui-schema-action')
        .map((button) => button.textContent?.trim()),
    ).toEqual([
      '查看详情',
      '收藏',
      '合适',
      '不合适',
      '太远',
      '时间不对',
      '风格不对',
      '发消息',
      '邀请Ta',
      '加好友并聊天',
    ]);
    expect(within(actionCard).getByRole('button', { name: '查看详情' })).toHaveAttribute(
      'data-requires-confirmation',
      'false',
    );
    expect(within(actionCard).getByRole('button', { name: '收藏' })).toHaveAttribute(
      'data-requires-confirmation',
      'false',
    );
    expect(within(actionCard).getByRole('button', { name: '生成开场白' })).toHaveAttribute(
      'data-requires-confirmation',
      'false',
    );
    expect(within(actionCard).getByRole('button', { name: '发送邀请' })).toHaveAttribute(
      'data-requires-confirmation',
      'true',
    );
    expect(within(actionCard).getByRole('button', { name: '加好友并聊天' })).toHaveAttribute(
      'data-requires-confirmation',
      'true',
    );
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();

    fireEvent.click(within(actionCard).getByRole('button', { name: '收藏' }));
    await waitFor(() =>
      expect(onCardAction).toHaveBeenCalledWith(
        expect.objectContaining({
          schemaAction: 'candidate.like',
        }),
      ),
    );
    expect(await screen.findByTestId('assistant-ui-inline-outcome-preview')).toHaveTextContent(
      '已收藏',
    );
    expect(screen.getByTestId('assistant-ui-inline-outcome-preview')).toHaveTextContent(
      '已记录这个候选，后续推荐会参考你的选择。',
    );
    expect(screen.queryByTestId('assistant-ui-inline-approval-panel')).not.toBeInTheDocument();

    fireEvent.click(within(actionCard).getByRole('button', { name: '生成开场白' }));
    expect(await screen.findByTestId('assistant-ui-inline-draft-preview')).toHaveTextContent(
      '你好，我也在青岛大学附近散步，要不要今天先轻松走一圈？',
    );
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();

    fireEvent.click(within(actionCard).getByRole('button', { name: '发送邀请' }));
    const inlineApproval = await screen.findByTestId('assistant-ui-inline-approval-panel');
    expect(inlineApproval).toHaveTextContent('确认发送邀请');
    expect(inlineApproval).toHaveTextContent('确认后才会发送邀请内容');
    expect(inlineApproval).not.toHaveTextContent(
      /riskLevel|medium|checkpoint|audit|风险级别|风险等级|动作：|动作:/i,
    );
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();

    fireEvent.click(within(inlineApproval).getByRole('button', { name: '确认发送' }));
    await waitFor(() =>
      expect(onApproveApproval).toHaveBeenCalledWith(expect.objectContaining({ approvalId: 711 })),
    );
    expect(document.body.textContent ?? '').not.toMatch(
      /riskLevel|medium|checkpoint|audit|风险级别|风险等级|动作：|动作:/i,
    );
  });

  it('renders multiple candidate cards as a lightweight product flow instead of a tool panel', () => {
    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-cards"
        data={{
          cards: ['陈砚', '夏禾', '林屿'].map((name, index) => ({
            id: `candidate-card-${index + 1}`,
            schemaType: 'social_match.candidate',
            schemaVersion: 'fitmeet.tool-ui.v1',
            title: name,
            body: `${name} 在青岛大学附近公开可发现，适合轻松散步。`,
            data: {
              schemaType: 'social_match.candidate',
              displayName: name,
              candidateRecordId: `candidate-record-${index + 1}`,
              city: '青岛',
              distanceLabel: '青岛大学附近',
              interests: ['散步'],
              matchReasons: ['地点接近', '活动偏好匹配'],
            },
            actions: [],
          })),
        }}
      />,
    );

    const collection = screen.getByTestId('assistant-ui-generative-cards');
    expect(collection).toHaveAttribute('data-card-density', 'product-flow');
    expect(collection).toHaveAttribute('data-product-components', 'CandidateCards');
    expect(collection).toHaveTextContent('3 个候选');
    expect(collection).not.toHaveClass('rounded-2xl');
    expect(
      collection.querySelector('[data-collection-header="lightweight-product-summary"]'),
    ).not.toBeNull();
    expect(screen.getAllByTestId('assistant-ui-schema-card')).toHaveLength(3);
  });

  it('renders slot completion as a structured clarification card', async () => {
    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-cards"
        data={{
          cards: [
            {
              id: 'slot-card-1',
              schemaType: 'social_match.slot_completion',
              schemaVersion: 'fitmeet.tool-ui.v1',
              title: '补齐约练卡信息',
              body: '生成约练卡前还差：时间、地点、安全边界。',
              data: {
                schemaType: 'social_match.slot_completion',
                workflowState: 'COLLECTING_SLOTS',
                waitingFor: 'safety_boundary',
                missingSlots: [
                  { key: 'time', label: '时间', prompt: '例如：今晚 7 点' },
                  { key: 'location', label: '地点', prompt: '例如：五四广场' },
                  {
                    key: 'safety_boundary',
                    label: '安全边界',
                    prompt: '是否只在公共场所活动',
                  },
                ],
                completedSlots: [{ key: 'activity', label: '活动', value: '散步' }],
                optionalSlots: [{ key: 'candidatePreference', label: '候选偏好' }],
                rankingPreference: {
                  labels: ['距离优先', '同频优先'],
                  reason: '更近一点，能聊得来优先',
                },
              },
              actions: [
                {
                  id: 'use-default-safety',
                  label: '使用默认安全设置',
                  schemaAction: 'slot_completion.use_default_safety',
                },
              ],
            },
          ],
        }}
      />,
    );

    const card = await screen.findByTestId('assistant-ui-slot-clarification-card');
    expect(card).toHaveTextContent('还差这些信息');
    expect(card).toHaveTextContent('安全边界');
    expect(card).toHaveTextContent('已确认');
    expect(card).toHaveTextContent('散步');
    expect(card).toHaveTextContent('距离优先');
    expect(screen.getByTestId('assistant-ui-generative-cards')).toHaveAttribute(
      'data-product-components',
      'SlotClarificationCard',
    );
  });

  it('normalizes raw card actions so backend risk flag drift does not leak approval UI', async () => {
    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-cards"
        data={{
          cards: [
            {
              id: 'candidate-card-raw-actions',
              schemaType: 'social_match.candidate',
              schemaVersion: 'fitmeet.tool-ui.v1',
              title: '林澈',
              body: '公开资料显示她也在青岛大学附近活动。',
              data: {
                schemaType: 'social_match.candidate',
                displayName: '林澈',
                candidateRecordId: 'candidate-record-lin',
              },
              actions: [
                {
                  id: 'raw-save-lin',
                  label: '收藏',
                  action: 'save_candidate',
                  requiresConfirmation: true,
                },
                {
                  id: 'raw-send-lin',
                  label: '发送邀请',
                  action: 'send_invite',
                  requiresConfirmation: false,
                },
              ],
            },
          ],
        }}
      />,
    );

    const candidate = screen.getByTestId('assistant-ui-schema-card');
    const actionCard = within(candidate).getByTestId('assistant-ui-unified-action-card');
    expect(within(actionCard).getByRole('button', { name: '收藏' })).toHaveAttribute(
      'data-requires-confirmation',
      'false',
    );
    expect(within(actionCard).getByRole('button', { name: '发送邀请' })).toHaveAttribute(
      'data-requires-confirmation',
      'true',
    );
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();
  });

  it('collapses matching approval cards into the candidate action card instead of rendering duplicates', async () => {
    render(
      <FitMeetToolUIActionsProvider
        value={{
          onCardAction: async () =>
            response({
              assistantMessage: '发送前需要你确认。',
              cards: [],
              pendingConfirmations: [
                {
                  id: 8801,
                  type: 'approval',
                  actionType: 'send_invite',
                  summary: '确认后才会发送邀请内容。',
                  riskLevel: 'medium',
                  expiresAt: null,
                },
              ],
            }),
        }}
      >
        <AssistantDataFallback
          type="data"
          status={{ type: 'complete' }}
          name="fitmeet-cards"
          data={{
            cards: [
              {
                id: 'candidate-card-chen',
                schemaType: 'social_match.candidate',
                schemaVersion: 'fitmeet.tool-ui.v1',
                title: '陈砚',
                body: '公开资料显示她也喜欢散步。',
                data: {
                  schemaType: 'social_match.candidate',
                  displayName: '陈砚',
                  candidateRecordId: 501,
                  targetUserId: 22,
                },
                actions: [
                  {
                    id: 'candidate-view-chen',
                    label: '查看',
                    action: 'candidate.view_detail',
                    schemaAction: 'candidate.view_detail',
                    requiresConfirmation: false,
                    payload: { candidateRecordId: 501, targetUserId: 22 },
                  },
                  {
                    id: 'candidate-save-chen',
                    label: '收藏',
                    action: 'save_candidate',
                    schemaAction: 'candidate.like',
                    requiresConfirmation: false,
                    payload: { candidateRecordId: 501, targetUserId: 22 },
                  },
                  {
                    id: 'candidate-opener-chen',
                    label: '开场白',
                    action: 'generate_opener',
                    schemaAction: 'candidate.generate_opener',
                    requiresConfirmation: false,
                    payload: { candidateRecordId: 501, targetUserId: 22 },
                  },
                  {
                    id: 'candidate-send-chen',
                    label: '发送邀请',
                    action: 'send_invite',
                    schemaAction: 'opener.confirm_send',
                    requiresConfirmation: true,
                    payload: {
                      candidateRecordId: 501,
                      targetUserId: 22,
                      actionType: 'send_invite',
                    },
                  },
                  {
                    id: 'candidate-connect-chen',
                    label: '加好友并聊天',
                    action: 'connect_candidate',
                    schemaAction: 'candidate.connect',
                    requiresConfirmation: true,
                    payload: {
                      candidateRecordId: 501,
                      targetUserId: 22,
                      actionType: 'connect_candidate',
                    },
                  },
                ],
              },
              {
                id: 'approval-send-chen',
                schemaType: 'safety.approval',
                schemaVersion: 'fitmeet.tool-ui.v1',
                title: '确认发送邀请',
                body: '确认后才会把邀请发给陈砚。',
                data: {
                  schemaName: 'ApprovalPanel',
                  schemaType: 'safety.approval',
                  approvalId: 8801,
                  candidateRecordId: 501,
                  targetUserId: 22,
                  actionType: 'send_invite',
                  riskLevel: 'medium',
                  summary: 'riskLevel medium checkpoint audit',
                },
                actions: [],
              },
            ],
          }}
        />
      </FitMeetToolUIActionsProvider>,
    );

    expect(screen.getAllByTestId('assistant-ui-schema-card')).toHaveLength(1);
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();
    const candidate = screen.getByTestId('assistant-ui-schema-card');
    const actionCard = within(candidate).getByTestId('assistant-ui-unified-action-card');
    expect(
      within(actionCard)
        .getAllByTestId('assistant-ui-schema-action')
        .map((button) => button.textContent?.trim()),
    ).toEqual([
      '查看详情',
      '收藏',
      '合适',
      '不合适',
      '太远',
      '时间不对',
      '风格不对',
      '发消息',
      '邀请Ta',
      '加好友并聊天',
    ]);

    fireEvent.click(within(actionCard).getByRole('button', { name: '发送邀请' }));
    const inlineApproval = await screen.findByTestId('assistant-ui-inline-approval-panel');
    expect(inlineApproval).toHaveTextContent('确认发送邀请');
    expect(inlineApproval).not.toHaveTextContent(
      /riskLevel|medium|checkpoint|audit|风险级别|风险等级|动作：|动作:|保存点/i,
    );
  });

  it('keeps invite approvals as send confirmations even when replay text mentions the candidate', async () => {
    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-cards"
        data={{
          cards: [
            {
              id: 'candidate-card-chen-ambiguous-send',
              schemaType: 'social_match.candidate',
              schemaVersion: 'fitmeet.tool-ui.v1',
              title: '陈砚',
              body: '公开资料显示她也喜欢散步。',
              data: {
                schemaType: 'social_match.candidate',
                displayName: '陈砚',
                candidateRecordId: 501,
                targetUserId: 22,
              },
              actions: [
                {
                  id: 'candidate-send-chen-ambiguous',
                  label: '发送邀请',
                  action: 'send_invite',
                  schemaAction: 'opener.confirm_send',
                  requiresConfirmation: true,
                  payload: { candidateRecordId: 501, targetUserId: 22 },
                },
                {
                  id: 'candidate-connect-chen-ambiguous',
                  label: '加好友并聊天',
                  action: 'connect_candidate',
                  schemaAction: 'candidate.connect',
                  requiresConfirmation: true,
                  payload: { candidateRecordId: 501, targetUserId: 22 },
                },
              ],
            },
            {
              id: 'approval-candidate-send-chen-ambiguous',
              schemaType: 'safety.approval',
              schemaVersion: 'fitmeet.tool-ui.v1',
              title: '确认发送给候选人陈砚',
              body: '确认后才会把这条约练邀请发送给候选人陈砚。',
              data: {
                schemaName: 'ApprovalPanel',
                schemaType: 'safety.approval',
                approvalId: 8818,
                candidateRecordId: 501,
                targetUserId: 22,
                riskLevel: 'medium',
                summary: '确认发送给候选人陈砚',
              },
              actions: [],
            },
          ],
        }}
      />,
    );

    expect(screen.getAllByTestId('assistant-ui-schema-card')).toHaveLength(1);
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();
    const actionCard = within(screen.getByTestId('assistant-ui-schema-card')).getByTestId(
      'assistant-ui-unified-action-card',
    );

    fireEvent.click(within(actionCard).getByRole('button', { name: '发送邀请' }));

    const inlineApproval = await screen.findByTestId('assistant-ui-inline-approval-panel');
    expect(inlineApproval).toHaveTextContent('确认发送邀请');
    expect(inlineApproval).toHaveTextContent('确认发送');
    expect(inlineApproval).not.toHaveTextContent('确认加好友');
  });

  it('keeps replayed candidate actions and approvals on one unified candidate card', async () => {
    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-cards"
        data={{
          cards: [
            {
              id: 'candidate-card-chen-unified',
              schemaType: 'social_match.candidate',
              schemaVersion: 'fitmeet.tool-ui.v1',
              title: '陈砚',
              body: '公开资料显示她也喜欢散步和编程。',
              data: {
                schemaType: 'social_match.candidate',
                displayName: '陈砚',
                candidateRecordId: 501,
                targetUserId: 22,
                interests: ['散步', '编程'],
                matchReasons: ['地点接近', '兴趣匹配'],
              },
              actions: [
                {
                  id: 'view-chen',
                  label: '查看',
                  action: 'candidate.view_detail',
                  schemaAction: 'candidate.view_detail',
                  requiresConfirmation: false,
                  payload: { candidateRecordId: 501, targetUserId: 22 },
                },
                {
                  id: 'save-chen',
                  label: '收藏',
                  action: 'save_candidate',
                  schemaAction: 'candidate.like',
                  requiresConfirmation: true,
                  payload: { candidateRecordId: 501, targetUserId: 22 },
                },
                {
                  id: 'opener-chen',
                  label: '开场白',
                  action: 'generate_opener',
                  schemaAction: 'candidate.generate_opener',
                  requiresConfirmation: true,
                  payload: { candidateRecordId: 501, targetUserId: 22 },
                },
                {
                  id: 'send-chen',
                  label: '确认发送给陈砚',
                  action: 'send_invite',
                  schemaAction: 'opener.confirm_send',
                  requiresConfirmation: true,
                  payload: { candidateRecordId: 501, targetUserId: 22 },
                },
                {
                  id: 'connect-chen',
                  label: '加好友并聊天',
                  action: 'connect_candidate',
                  schemaAction: 'candidate.connect',
                  requiresConfirmation: true,
                  payload: { candidateRecordId: 501, targetUserId: 22 },
                },
              ],
            },
            {
              id: 'approval-save-chen-replay',
              schemaType: 'safety.approval',
              schemaVersion: 'fitmeet.tool-ui.v1',
              title: '收藏 陈砚',
              body: '收藏候选人。',
              data: {
                schemaName: 'ApprovalPanel',
                schemaType: 'safety.approval',
                approvalId: 'save-chen-replay',
                candidateRecordId: 501,
                targetUserId: 22,
                actionType: 'candidate.like',
                riskLevel: 'low',
                summary: '收藏候选人',
              },
              actions: [],
            },
            {
              id: 'approval-opener-chen-replay',
              schemaType: 'safety.approval',
              schemaVersion: 'fitmeet.tool-ui.v1',
              title: '生成开场白',
              body: '生成开场白草稿。',
              data: {
                schemaName: 'ApprovalPanel',
                schemaType: 'safety.approval',
                approvalId: 'opener-chen-replay',
                candidateRecordId: 501,
                targetUserId: 22,
                actionType: 'candidate.generate_opener',
                riskLevel: 'low',
                summary: '生成开场白',
              },
              actions: [],
            },
            {
              id: 'approval-send-chen-replay',
              schemaType: 'safety.approval',
              schemaVersion: 'fitmeet.tool-ui.v1',
              title: '确认发送给陈砚',
              body: '确认后才会把邀请发给陈砚。',
              data: {
                schemaName: 'ApprovalPanel',
                schemaType: 'safety.approval',
                approvalId: 8801,
                candidateRecordId: 501,
                targetUserId: 22,
                actionType: 'send_invite',
                riskLevel: 'medium',
                summary: 'riskLevel medium checkpoint audit',
              },
              actions: [],
            },
            {
              id: 'approval-connect-chen-replay',
              schemaType: 'safety.approval',
              schemaVersion: 'fitmeet.tool-ui.v1',
              title: '加好友并聊天：陈砚',
              body: '确认后才会建立聊天入口。',
              data: {
                schemaName: 'ApprovalPanel',
                schemaType: 'safety.approval',
                approvalId: 8802,
                candidateRecordId: 501,
                targetUserId: 22,
                actionType: 'connect_candidate',
                riskLevel: 'medium',
                summary: 'riskLevel medium checkpoint audit',
              },
              actions: [],
            },
          ],
        }}
      />,
    );

    expect(screen.getAllByTestId('assistant-ui-schema-card')).toHaveLength(1);
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        /riskLevel|medium|checkpoint|audit|风险级别|风险等级|动作：|动作:|保存点/i,
      ),
    ).not.toBeInTheDocument();

    const candidate = screen.getByTestId('assistant-ui-schema-card');
    const actionCard = within(candidate).getByTestId('assistant-ui-unified-action-card');
    expect(
      within(actionCard)
        .getAllByTestId('assistant-ui-schema-action')
        .map((button) => button.textContent?.trim()),
    ).toEqual([
      '查看详情',
      '收藏',
      '合适',
      '不合适',
      '太远',
      '时间不对',
      '风格不对',
      '发消息',
      '邀请Ta',
      '加好友并聊天',
    ]);
    expect(within(actionCard).getByRole('button', { name: '收藏' })).toHaveAttribute(
      'data-requires-confirmation',
      'false',
    );
    expect(within(actionCard).getByRole('button', { name: '生成开场白' })).toHaveAttribute(
      'data-requires-confirmation',
      'false',
    );

    fireEvent.click(within(actionCard).getByRole('button', { name: '加好友并聊天' }));
    const inlineApproval = await screen.findByTestId('assistant-ui-inline-approval-panel');
    expect(inlineApproval).toHaveTextContent('确认加好友并聊天');
    expect(inlineApproval).not.toHaveTextContent(
      /riskLevel|medium|checkpoint|audit|风险级别|风险等级|动作：|动作:|保存点/i,
    );
  });

  it('folds legacy opener approval cards without approvalId into the candidate card', async () => {
    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-cards"
        data={{
          cards: [
            {
              id: 'candidate-legacy-opener-host',
              type: 'candidate_card',
              schemaType: 'social_match.candidate',
              schemaVersion: 'fitmeet.tool-ui.v1',
              title: '陈砚',
              body: '公开可发现候选人。',
              data: {
                schemaName: 'OpportunityCard',
                schemaType: 'social_match.candidate',
                candidateRecordId: 501,
                targetUserId: 22,
                displayName: '陈砚',
                opportunity: {
                  type: 'person',
                  name: '陈砚',
                  title: '陈砚',
                  summary: '公开可发现候选人。',
                },
              },
              actions: [
                {
                  id: 'send-invite-legacy-host',
                  label: '发送邀请',
                  action: 'send_message',
                  schemaAction: 'opener.confirm_send',
                  requiresConfirmation: true,
                  payload: { candidateRecordId: 501, targetUserId: 22 },
                },
              ],
            },
            {
              id: 'opener_approval:101:22',
              type: 'opener_approval',
              schemaType: 'safety.approval',
              schemaVersion: 'fitmeet.tool-ui.v1',
              title: '这条消息会发送给陈砚',
              body: '确认后才会发送。',
              data: {
                schemaName: 'SafetyApprovalCard',
                schemaType: 'safety.approval',
                targetUserId: 22,
                displayName: '陈砚',
                riskLevel: 'medium',
                summary: '确认后才会发送邀请内容。',
              },
              actions: [
                {
                  id: 'opener_confirm_send',
                  label: '确认发送',
                  action: 'send_message',
                  schemaAction: 'opener.confirm_send',
                  requiresConfirmation: true,
                  payload: {
                    taskId: 101,
                    targetUserId: 22,
                    approvalId: 8801,
                    message: '周末下午方便一起散步吗？',
                  },
                },
              ],
            },
          ],
        }}
      />,
    );

    expect(screen.getAllByTestId('assistant-ui-schema-card')).toHaveLength(1);
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();

    const candidate = screen.getByTestId('assistant-ui-schema-card');
    fireEvent.click(within(candidate).getByRole('button', { name: '发送邀请' }));
    const inlineApproval = await screen.findByTestId('assistant-ui-inline-approval-panel');
    expect(inlineApproval).toHaveTextContent('确认发送邀请');
    expect(inlineApproval).not.toHaveTextContent(
      /riskLevel|medium|checkpoint|audit|风险级别|风险等级|动作：|动作:|保存点/i,
    );
  });

  it('folds orphan safety approval cards into one inline approval panel', () => {
    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-cards"
        data={{
          cards: [
            {
              id: 'approval-send-orphan',
              schemaType: 'safety.approval',
              schemaVersion: 'fitmeet.tool-ui.v1',
              title: '确认发送给陈砚',
              body: '确认后才会把邀请发给陈砚。',
              data: {
                schemaName: 'ApprovalPanel',
                schemaType: 'safety.approval',
                approvalId: 9101,
                actionType: 'send_invite',
                riskLevel: 'medium',
                summary: '确认后才会发送邀请内容。',
              },
              actions: [],
            },
            {
              id: 'approval-connect-orphan',
              schemaType: 'safety.approval',
              schemaVersion: 'fitmeet.tool-ui.v1',
              title: '加好友并聊天：陈砚',
              body: '确认后才会建立聊天入口。',
              data: {
                schemaName: 'ApprovalPanel',
                schemaType: 'safety.approval',
                approvalId: 9102,
                actionType: 'connect_candidate',
                riskLevel: 'medium',
                summary: '加好友并聊天前需要你确认。',
              },
              actions: [],
            },
          ],
        }}
      />,
    );

    expect(screen.queryByTestId('assistant-ui-generative-cards')).not.toBeInTheDocument();
    const approvalPanel = screen.getByTestId('assistant-ui-approval-tool');
    expect(approvalPanel).toHaveAttribute('data-density', 'inline');
    expect(approvalPanel).toHaveAttribute('data-visible-confirmation-count', '1');
    expect(approvalPanel).toHaveAttribute('data-hidden-confirmation-count', '1');
    expect(screen.getAllByTestId('assistant-ui-approval-confirmation-row')).toHaveLength(1);
    expect(screen.getByTestId('assistant-ui-approval-collapsed-count')).toHaveTextContent(
      '还有 1 个动作也在这张卡里',
    );
    expect(screen.getByTestId('assistant-ui-approval-queued-actions')).toHaveTextContent(
      '确认加好友并聊天',
    );
    expect(screen.queryAllByTestId('assistant-ui-schema-card')).toHaveLength(0);
    expect(approvalPanel).toHaveTextContent('确认发送邀请');
    expect(approvalPanel).not.toHaveTextContent(
      /riskLevel|medium|checkpoint|audit|风险级别|风险等级|动作：|动作:|保存点/i,
    );
  });

  it('keeps mixed candidate cards focused by suppressing orphan approval panels until a card action is clicked', () => {
    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-cards"
        data={{
          cards: [
            {
              id: 'candidate-chen',
              schemaType: 'social_match.candidate',
              schemaVersion: 'fitmeet.tool-ui.v1',
              title: '陈砚',
              body: '青岛大学附近，喜欢散步和编程。',
              data: {
                schemaName: 'CandidateCards',
                schemaType: 'social_match.candidate',
                candidateRecordId: 501,
                opportunity: {
                  name: '陈砚',
                  summary: '青岛大学附近，喜欢散步和编程。',
                },
              },
              actions: [],
            },
            {
              id: 'candidate-xiahe',
              schemaType: 'social_match.candidate',
              schemaVersion: 'fitmeet.tool-ui.v1',
              title: '夏禾',
              body: '公开资料里有舞蹈和散步标签。',
              data: {
                schemaName: 'CandidateCards',
                schemaType: 'social_match.candidate',
                candidateRecordId: 502,
                opportunity: {
                  name: '夏禾',
                  summary: '公开资料里有舞蹈和散步标签。',
                },
              },
              actions: [],
            },
            {
              id: 'approval-send-ambiguous',
              schemaType: 'safety.approval',
              schemaVersion: 'fitmeet.tool-ui.v1',
              title: '确认发送邀请',
              body: '确认后才会发送邀请。',
              data: {
                schemaName: 'ApprovalPanel',
                schemaType: 'safety.approval',
                approvalId: 9201,
                actionType: 'send_invite',
                riskLevel: 'medium',
                summary: 'riskLevel medium checkpoint audit',
              },
              actions: [],
            },
          ],
        }}
      />,
    );

    expect(screen.getAllByTestId('assistant-ui-schema-card')).toHaveLength(2);
    expect(document.querySelector('[data-renderer="safety.approval"]')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();
    expect(screen.queryByText('确认发送邀请')).not.toBeInTheDocument();
  });

  it('drops replayed low-risk approval cards even when the backend omitted actionType', () => {
    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-cards"
        data={{
          cards: [
            {
              id: 'approval-save-without-action',
              schemaType: 'safety.approval',
              schemaVersion: 'fitmeet.tool-ui.v1',
              title: '收藏 陈砚',
              body: '收藏候选人，方便稍后查看。',
              data: {
                schemaName: 'ApprovalPanel',
                schemaType: 'safety.approval',
                approvalId: 9103,
                riskLevel: 'medium',
                summary: '收藏 陈砚',
              },
              actions: [],
            },
            {
              id: 'approval-opener-without-action',
              schemaType: 'safety.approval',
              schemaVersion: 'fitmeet.tool-ui.v1',
              title: '生成开场白',
              body: '只生成草稿，不会发送给对方。',
              data: {
                schemaName: 'ApprovalPanel',
                schemaType: 'safety.approval',
                approvalId: 9104,
                riskLevel: 'medium',
                summary: '生成开场白草稿',
              },
              actions: [],
            },
          ],
        }}
      />,
    );

    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();
    expect(screen.queryByText(/收藏 陈砚|生成开场白/)).not.toBeInTheDocument();
  });

  it('renders candidate empty-state recovery options as unified card actions', async () => {
    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-cards"
        data={{
          cards: [
            {
              id: 'candidate-empty-qdu-walk',
              type: 'candidate_empty_state',
              schemaType: 'social_match.empty',
              schemaVersion: 'fitmeet.tool-ui.v1',
              title: '暂时没有找到合适的人',
              body: '没有找到真实、公开可发现且符合安全边界的人。',
              data: {
                schemaType: 'social_match.empty',
                taskId: 88,
                criteria: ['青岛大学附近', '今天上午', '散步', '女生、编程/科技相关'],
                recoveryOptions: [
                  {
                    key: 'publish_to_discover',
                    label: '确认发布',
                    detail: '公开前仍需要你确认。',
                    requiresConfirmation: true,
                  },
                  {
                    key: 'expand_radius',
                    label: '扩大范围',
                    detail: '只搜索公开可发现资料。',
                  },
                  {
                    key: 'change_time',
                    label: '换个时间',
                    detail: '保留活动和地点。',
                  },
                  {
                    key: 'relax_preference',
                    label: '放宽偏好',
                    detail: '保留安全边界。',
                  },
                ],
              },
              actions: [],
            },
          ],
        }}
      />,
    );

    const emptyCard = await screen.findByTestId('assistant-ui-candidate-empty-card');
    expect(emptyCard).toHaveAttribute('data-no-fake-candidates', 'true');
    expect(emptyCard).toHaveTextContent('女生、编程/科技相关');
    expect(emptyCard).not.toHaveTextContent('只搜索公开可发现资料。');
    expect(emptyCard).not.toHaveTextContent('保留活动和地点。');
    const actionCard = within(emptyCard).getByTestId('assistant-ui-unified-action-card');
    expect(within(actionCard).getByRole('button', { name: '确认发布' })).toHaveAttribute(
      'data-requires-confirmation',
      'true',
    );
    expect(within(actionCard).getByRole('button', { name: '扩大范围' })).toHaveAttribute(
      'data-requires-confirmation',
      'false',
    );
    expect(within(actionCard).getByRole('button', { name: '换个时间' })).toHaveAttribute(
      'data-requires-confirmation',
      'false',
    );
    expect(within(actionCard).getByRole('button', { name: '放宽偏好' })).toHaveAttribute(
      'data-requires-confirmation',
      'false',
    );
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();
  });

  it('renders opportunity actions in one card and opens publish approval inline only after click', async () => {
    const onCardAction = vi.fn((input: { schemaAction?: string | null }) => {
      if (input.schemaAction === 'publish_to_discover') {
        return response({
          assistantMessage: '发布前需要你确认。',
          cards: [],
          pendingConfirmations: [
            {
              id: 812,
              type: 'publish_social_request',
              actionType: 'publish_social_request',
              summary: 'riskLevel medium checkpoint audit',
              riskLevel: 'medium',
              expiresAt: null,
            },
          ],
        });
      }
      return response({
        assistantMessage: '已更新这张约练卡。',
        cards: [],
        pendingConfirmations: [],
      });
    });
    const onApproveApproval = vi.fn(() =>
      response({
        assistantMessage: '已确认，正在发布到发现。',
        cards: [],
        pendingConfirmations: [],
      }),
    );

    render(
      <FitMeetToolUIActionsProvider value={{ onApproveApproval, onCardAction }}>
        <AssistantDataFallback
          type="data"
          status={{ type: 'complete' }}
          name="fitmeet-cards"
          data={{
            cards: [
              {
                id: 'opportunity-card-qdu-walk',
                schemaType: 'social_match.activity',
                schemaVersion: 'fitmeet.tool-ui.v1',
                title: '青岛大学轻松散步',
                body: '今天晚上，青岛大学附近，低强度散步。',
                data: {
                  schemaType: 'social_match.activity',
                  taskId: 88,
                  opportunityId: 'qdu-walk-tonight',
                  city: '青岛',
                  location: '青岛大学附近',
                  time: '今天晚上',
                  activityType: '散步',
                },
                actions: [
                  {
                    id: 'publish-qdu-walk',
                    label: '确认发布约练',
                    action: 'publish_social_request',
                    schemaAction: 'publish_to_discover',
                    requiresConfirmation: true,
                    payload: {
                      taskId: 88,
                      opportunityId: 'qdu-walk-tonight',
                    },
                  },
                  {
                    id: 'modify-qdu-walk',
                    label: '改一下',
                    action: 'modify_activity',
                    schemaAction: 'activity.modify_time',
                    requiresConfirmation: false,
                  },
                  {
                    id: 'skip-qdu-walk',
                    label: '先不发',
                    action: 'skip_publish',
                    schemaAction: 'activity.skip_publish',
                    requiresConfirmation: false,
                  },
                ],
              },
            ],
          }}
        />
      </FitMeetToolUIActionsProvider>,
    );

    const opportunity = screen.getByTestId('assistant-ui-schema-card');
    const activityCard = await within(opportunity).findByTestId('activity-opportunity-card');
    expect(activityCard).toHaveAttribute('data-layout-model', 'structured-activity-card');
    expect(activityCard).toHaveAttribute('data-action-placement', 'bottom-grid');
    expect(activityCard).toHaveTextContent('发布前确认');
    expect(activityCard).toHaveTextContent('约练说明');
    expect(activityCard).toHaveTextContent('青岛大学附近');
    expect(activityCard).toHaveTextContent('今天晚上');
    const actionCard = within(opportunity).getByTestId('assistant-ui-unified-action-card');
    expect(within(actionCard).getByRole('button', { name: '确认发布' })).toHaveAttribute(
      'data-requires-confirmation',
      'true',
    );
    expect(within(actionCard).getByRole('button', { name: '修改卡片' })).toHaveAttribute(
      'data-requires-confirmation',
      'false',
    );
    expect(within(actionCard).getByRole('button', { name: '暂不发布' })).toHaveAttribute(
      'data-requires-confirmation',
      'false',
    );
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();

    fireEvent.click(within(actionCard).getByRole('button', { name: '确认发布' }));
    const inlineApproval = await screen.findByTestId('assistant-ui-inline-approval-panel');
    expect(onCardAction).not.toHaveBeenCalled();
    expect(inlineApproval).toHaveTextContent('确认发布到发现');
    expect(inlineApproval).toHaveTextContent('确认后这张约练卡才会出现在发现页');
    expect(inlineApproval).not.toHaveTextContent(
      /riskLevel|medium|checkpoint|audit|风险级别|风险等级|动作：|动作:/i,
    );
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();
    fireEvent.click(within(inlineApproval).getByRole('button', { name: '确认发布' }));
    await waitFor(() =>
      expect(onCardAction).toHaveBeenCalledWith(
        expect.objectContaining({
          schemaAction: 'publish_to_discover',
          action: 'publish_to_discover',
          payload: expect.objectContaining({ confirmedPublish: true }),
        }),
      ),
    );
    const chainedApproval = await screen.findByTestId('assistant-ui-inline-approval-panel');
    expect(chainedApproval).toHaveTextContent('确认发布到发现');
    expect(chainedApproval).not.toHaveTextContent(
      /riskLevel|medium|checkpoint|audit|风险级别|风险等级|动作：|动作:/i,
    );
    fireEvent.click(within(chainedApproval).getByRole('button', { name: '确认发布' }));
    await waitFor(() =>
      expect(onApproveApproval).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalId: 812,
          payload: expect.objectContaining({ decision: 'approved', approvalId: 812 }),
        }),
      ),
    );
  });

  it('keeps publish and dismiss CTAs visible for private activity drafts with socialRequestId', async () => {
    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-cards"
        data={{
          cards: [
            {
              id: 'activity-plan-private-draft',
              schemaType: 'social_match.activity',
              schemaVersion: 'fitmeet.tool-ui.v1',
              title: '五四广场散步约练卡',
              body: '明天晚上 7 点，在青岛五四广场轻松散步。',
              status: 'waiting_confirmation',
              data: {
                schemaType: 'social_match.activity',
                taskId: 28,
                socialRequestId: 3,
                city: '青岛',
                location: '青岛五四广场',
                time: '明天晚上 7 点',
                activityType: '散步',
                publishStatus: 'draft',
                visibilityStatus: 'private',
              },
              actions: [
                {
                  id: 'publish-private-draft',
                  label: '确认发布',
                  action: 'publish_to_discover',
                  schemaAction: 'publish_to_discover',
                  requiresConfirmation: true,
                  payload: { taskId: 28, socialRequestId: 3 },
                },
                {
                  id: 'modify-private-draft',
                  label: '修改卡片',
                  action: 'modify_activity',
                  schemaAction: 'activity.modify_time',
                  requiresConfirmation: false,
                  payload: { taskId: 28, socialRequestId: 3 },
                },
                {
                  id: 'skip-private-draft',
                  label: '暂不发布',
                  action: 'activity.skip_publish',
                  schemaAction: 'activity.skip_publish',
                  requiresConfirmation: false,
                  payload: { taskId: 28, socialRequestId: 3 },
                },
              ],
            },
          ],
        }}
      />,
    );

    const activityCard = await screen.findByTestId('activity-opportunity-card');
    expect(activityCard).toHaveTextContent('发布前确认');
    expect(activityCard).not.toHaveTextContent('已发布');
    const actionCard = screen.getByTestId('assistant-ui-unified-action-card');
    expect(within(actionCard).getByRole('button', { name: '确认发布' })).toHaveAttribute(
      'data-schema-action',
      'publish_to_discover',
    );
    expect(within(actionCard).getByRole('button', { name: '修改卡片' })).toHaveAttribute(
      'data-schema-action',
      'activity.modify_time',
    );
    expect(within(actionCard).getByRole('button', { name: '暂不发布' })).toHaveAttribute(
      'data-schema-action',
      'activity.skip_publish',
    );
  });

  it('renders schema approval cards as product confirmation cards instead of backend approval forms', async () => {
    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-cards"
        data={{
          cards: [
            {
              id: 'approval-card-1',
              schemaType: 'safety.approval',
              schemaVersion: 'fitmeet.tool-ui.v1',
              title: '确认发送邀请',
              body: '确认后才会把这条邀请发给陈砚。',
              data: {
                schemaName: 'ApprovalPanel',
                schemaType: 'safety.approval',
                schemaVersion: 'fitmeet.tool-ui.v1',
                approval: {
                  id: 88,
                  actionType: 'send_invite',
                  riskLevel: 'medium',
                  title: '确认发送邀请',
                  boundary: '确认后才会把这条邀请发给陈砚。',
                  confirmationLabel: '发送前确认',
                  checkpointLabel: '等待保存点',
                  auditNote: 'audit log checkpoint medium',
                  reasons: ['对方会收到邀请，所以需要你先确认。'],
                },
              },
              actions: [
                {
                  id: 'send-approval',
                  label: '发送邀请',
                  action: 'send_invite',
                  schemaAction: 'opener.confirm_send',
                  requiresConfirmation: true,
                  payload: { approvalId: 88 },
                },
              ],
            },
          ],
        }}
      />,
    );

    const approval = await screen.findByTestId('assistant-ui-approval-tool');
    const actionCard = within(approval).getByTestId('assistant-ui-unified-action-card');
    const details = within(approval).getByTestId('assistant-ui-product-card-details');
    expect(
      actionCard.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(approval).toHaveTextContent('确认发送邀请');
    expect(approval).toHaveTextContent('发送前确认');
    expect(approval).not.toHaveTextContent(
      /medium|riskLevel|actionType|checkpoint|风险级别|风险等级|动作：|动作:|保存点|audit/i,
    );
  });

  it('keeps legacy process payloads as a single non-expandable status by default', () => {
    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-process"
        data={{
          steps: [
            {
              id: 'hydrate-context',
              label: '正在读取你的偏好',
              status: 'complete',
            },
            {
              id: 'slot-memory',
              label: '已记录：今晚、散步、青岛大学附近',
              status: 'complete',
            },
            {
              id: 'candidate-search',
              label: '正在筛选公开可发现的人',
              status: 'running',
            },
          ],
          historySteps: [
            {
              id: 'hydrate-context',
              label: '正在读取你的偏好',
              status: 'complete',
            },
            {
              id: 'slot-memory',
              label: '已记录：今晚、散步、青岛大学附近',
              status: 'complete',
            },
            {
              id: 'candidate-search',
              label: '正在筛选公开可发现的人',
              status: 'running',
            },
          ],
        }}
      />,
    );

    const process = screen.getByTestId('assistant-ui-tool-ui');
    expect(process).toHaveAttribute('data-process-rendering', 'covering-status');
    expect(process).toHaveAttribute('data-process-step-count', '1');
    expect(process).toHaveAttribute('data-process-history-count', '0');
    expect(process).toHaveAttribute('data-process-clickable', 'false');
    expect(process).not.toHaveAttribute('open');

    const statusLine = within(process).getByTestId('assistant-ui-process-status-line');
    expect(statusLine).toHaveTextContent('正在筛选公开可发现的人');
    expect(statusLine).not.toHaveTextContent('已记录：今晚、散步、青岛大学附近');
    expect(within(process).queryByText('查看过程')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-process-evidence')).not.toBeInTheDocument();

    const summary = process.querySelector('summary');
    expect(summary).not.toBeNull();
    fireEvent.click(summary as HTMLElement);
    expect(process).not.toHaveAttribute('open');
    expect(screen.queryByTestId('assistant-ui-process-evidence')).not.toBeInTheDocument();
  });

  it('does not render repeated process nodes as a visible timeline', () => {
    const repeatedSteps = Array.from({ length: 14 }, (_, index) => ({
      id: `understanding-${index}`,
      label: '正在理解你的需求',
      detail: index === 0 ? '我会先识别普通聊天还是约练流程。' : undefined,
      status: index === 13 ? 'running' : 'complete',
    }));

    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'running' }}
        name="fitmeet-process"
        data={{
          steps: repeatedSteps,
          historySteps: repeatedSteps,
        }}
      />,
    );

    const process = screen.getByTestId('assistant-ui-tool-ui');
    expect(process).toHaveAttribute('data-process-rendering', 'covering-status');
    expect(process).toHaveAttribute('data-process-step-count', '1');
    expect(process).toHaveAttribute('data-process-history-count', '0');
    expect(process).toHaveAttribute('data-process-clickable', 'false');
    expect(process).not.toHaveAttribute('open');

    const statusLine = within(process).getByTestId('assistant-ui-process-status-line');
    expect(statusLine.textContent?.trim()).toBeTruthy();
    expect(screen.getAllByText(statusLine.textContent?.trim() ?? '')).toHaveLength(1);
    expect(screen.queryByTestId('assistant-ui-process-detail')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-process-evidence')).not.toBeInTheDocument();
    expect(within(process).queryByText('查看过程')).not.toBeInTheDocument();
  });

  it('renders replay summaries as one covering status without opening a process timeline', () => {
    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-process-fallback"
        data={{
          visibleSummary: {
            source: 'replay.summary',
            displayMode: 'covering_status',
            updateModel: 'latest_state',
            defaultVisibleCount: 1,
            historyVisibility: 'collapsed',
            expandable: true,
            state: 'running',
            title: '正在整理你的约练需求…',
            detail: '我会先按已记录的信息继续，不重复追问。',
          },
          steps: [
            {
              id: 'hydrate_context',
              label: 'hydrate_context planner traceId raw JSON',
              detail: 'tool_call_started payload internal runtime',
              status: 'complete',
            },
            {
              id: 'slot-memory',
              label: '已记录：今晚、散步、青岛大学附近',
              status: 'complete',
            },
            {
              id: 'candidate-search',
              label: '正在筛选公开可发现的人',
              status: 'running',
            },
          ],
          historySteps: [
            {
              id: 'hydrate_context',
              label: 'hydrate_context planner traceId raw JSON',
              detail: 'tool_call_started payload internal runtime',
              status: 'complete',
            },
            {
              id: 'candidate-search',
              label: '正在筛选公开可发现的人',
              status: 'running',
            },
          ],
        }}
      />,
    );

    const process = screen.getByTestId('assistant-ui-tool-fallback');
    expect(process).toHaveAttribute('data-process-rendering', 'covering-status');
    expect(process).toHaveAttribute('data-process-step-count', '1');
    expect(process).toHaveAttribute('data-process-history-count', '0');
    expect(process).toHaveAttribute('data-process-clickable', 'false');
    expect(process).toHaveAttribute('data-process-summary-source', 'replay.summary');
    expect(process).not.toHaveAttribute('open');

    const statusLine = within(process).getByTestId('assistant-ui-process-status-line');
    expect(statusLine).toHaveTextContent('正在整理你的约练需求');
    expect(statusLine).not.toHaveTextContent('青岛大学附近');
    expect(statusLine).not.toHaveTextContent(/hydrate_context|planner|traceId|raw JSON/i);
    expect(within(process).queryByText('查看过程')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-process-detail')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/hydrate_context|planner|traceId|raw JSON|payload|runtime/i),
    ).not.toBeInTheDocument();

    const summary = process.querySelector('summary');
    expect(summary).not.toBeNull();
    fireEvent.click(summary as HTMLElement);

    expect(process).not.toHaveAttribute('open');
    expect(screen.queryByTestId('assistant-ui-process-detail')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/hydrate_context|planner|traceId|raw JSON|payload|runtime/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-process-evidence')).not.toBeInTheDocument();
  });

  it('replaces covering status updates without keeping stale process details open', async () => {
    const { rerender } = render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'running' }}
        name="fitmeet-process-fallback"
        data={{
          visibleSummary: {
            source: 'replay.summary',
            displayMode: 'covering_status',
            updateModel: 'latest_state',
            defaultVisibleCount: 1,
            historyVisibility: 'collapsed',
            expandable: true,
            state: 'running',
            title: '正在整理你的约练需求…',
            detail: '我会按已经说过的信息继续处理。',
            currentSeq: 1,
          },
        }}
      />,
    );

    const process = screen.getByTestId('assistant-ui-tool-fallback');
    const summary = process.querySelector('summary');
    expect(summary).not.toBeNull();
    fireEvent.click(summary as HTMLElement);
    expect(process).not.toHaveAttribute('open');
    expect(screen.queryByTestId('assistant-ui-process-detail')).not.toBeInTheDocument();

    rerender(
      <AssistantDataFallback
        type="data"
        status={{ type: 'running' }}
        name="fitmeet-process-fallback"
        data={{
          visibleSummary: {
            source: 'replay.summary',
            displayMode: 'covering_status',
            updateModel: 'latest_state',
            defaultVisibleCount: 1,
            historyVisibility: 'collapsed',
            expandable: true,
            state: 'running',
            title: '正在筛选公开可发现的人…',
            detail: '我会先看公开资料和公开活动。',
            currentSeq: 2,
          },
        }}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('assistant-ui-tool-fallback')).toHaveAttribute(
        'data-process-open',
        'false',
      ),
    );
    const updatedProcess = screen.getByTestId('assistant-ui-tool-fallback');
    const statusLine = within(updatedProcess).getByTestId('assistant-ui-process-status-line');
    expect(statusLine).toHaveTextContent('正在筛选公开可发现的人');
    expect(screen.queryByTestId('assistant-ui-process-detail')).not.toBeInTheDocument();
  });

  it('keeps approval waiting traces collapsed until the user opens the process summary', () => {
    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-process"
        data={{
          visibleSummary: {
            source: 'social_agent_event_v2',
            displayMode: 'covering_status',
            updateModel: 'latest_state',
            defaultVisibleCount: 1,
            historyVisibility: 'collapsed',
            pendingApproval: true,
            expandable: true,
            state: 'waiting',
            title: '发送邀请前需要你确认',
            detail: '确认前不会发送邀请或交换敏感信息。',
          },
          steps: [
            {
              id: 'social-codex:summary',
              label: '发送邀请前需要你确认',
              detail: '确认前不会发送邀请或交换敏感信息。',
              status: 'waiting',
              processType: 'run_summary',
              metadata: {
                processType: 'run_summary',
                pendingApproval: true,
                dryRunPreviewTitle: '发出散步邀请',
                sideEffectAllowedBeforeApproval: false,
                auditRequired: true,
              },
            },
          ],
          historySteps: [
            {
              id: 'hydrate-context',
              label: 'hydrate_context planner traceId raw JSON',
              detail: 'tool_call_started payload internal runtime',
              status: 'complete',
            },
            {
              id: 'approval',
              label: '发送邀请前需要你确认',
              detail: '对方会看到你的公开约练邀请。',
              status: 'waiting',
              processType: 'approval',
              metadata: {
                processType: 'approval',
                dryRunPreviewTitle: '发出散步邀请',
                sideEffectAllowedBeforeApproval: false,
                auditRequired: true,
              },
            },
          ],
        }}
      />,
    );

    const process = screen.getByTestId('assistant-ui-tool-ui');
    expect(process).toHaveAttribute('data-process-rendering', 'covering-status');
    expect(process).toHaveAttribute('data-process-default-visible-count', '1');
    expect(process).toHaveAttribute('data-process-clickable', 'true');
    expect(process).not.toHaveAttribute('open');

    const statusLine = within(process).getByTestId('assistant-ui-process-status-line');
    expect(statusLine).toHaveTextContent('发送邀请前需要你确认');
    const statusText = statusLine.textContent ?? '';
    expect(statusText.match(/需要你确认/g) ?? []).toHaveLength(1);
    expect(statusText).not.toContain('· 等待确认');
    expect(statusLine).not.toHaveTextContent(/hydrate_context|planner|traceId|raw JSON|payload/i);
    expect(screen.queryByTestId('assistant-ui-process-detail')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-process-evidence')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-approval-runtime-hints')).not.toBeInTheDocument();

    const summary = process.querySelector('summary');
    expect(summary).not.toBeNull();
    fireEvent.click(summary as HTMLElement);

    expect(process).toHaveAttribute('open');
    expect(screen.getByTestId('assistant-ui-process-detail')).toHaveTextContent(
      '确认前不会发送邀请或交换敏感信息。',
    );
    expect(screen.getByTestId('assistant-ui-process-evidence')).toHaveAttribute(
      'data-evidence-count',
      '1',
    );
    expect(screen.getByTestId('assistant-ui-approval-runtime-hints')).toHaveTextContent(
      '确认前不会触达对方',
    );
    expect(screen.getByTestId('assistant-ui-approval-runtime-hints')).toHaveTextContent(
      '之后可以回看这次确认',
    );
    expect(
      screen.queryByText(/hydrate_context|planner|traceId|raw JSON|payload/i),
    ).not.toBeInTheDocument();
  });

  it('adds a short waiting-confirmation suffix only when the status title has not said it', () => {
    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-process"
        data={{
          visibleSummary: {
            source: 'social_agent_event_v2',
            displayMode: 'covering_status',
            updateModel: 'latest_state',
            defaultVisibleCount: 1,
            historyVisibility: 'collapsed',
            pendingApproval: true,
            expandable: true,
            state: 'waiting',
            title: '正在检查安全边界',
            detail: '确认前不会执行真实动作。',
          },
          pendingConfirmations: [{ id: 'approval-1' }],
        }}
      />,
    );

    const process = screen.getByTestId('assistant-ui-tool-ui');
    const statusLine = within(process).getByTestId('assistant-ui-process-status-line');
    expect(statusLine).toHaveTextContent('正在检查安全边界 · 等待确认');
  });

  it('keeps completed checkpoint details product-light instead of showing recovery internals', () => {
    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-process-fallback"
        data={{
          runtime: {
            checkpointId: 88,
            canReplay: true,
            canFork: true,
          },
          visibleSummary: {
            source: 'replay.summary',
            displayMode: 'covering_status',
            updateModel: 'latest_state',
            defaultVisibleCount: 1,
            historyVisibility: 'collapsed',
            expandable: true,
            state: 'done',
            title: '已整理当前进展',
            detail: '可以继续追问，也可以换一种方案。',
          },
        }}
      />,
    );

    const process = screen.getByTestId('assistant-ui-tool-fallback');
    const summary = process.querySelector('summary');
    expect(summary).not.toBeNull();
    fireEvent.click(summary as HTMLElement);

    expect(process).toHaveAttribute('open');
    expect(screen.queryByText('已保存可恢复状态')).not.toBeInTheDocument();
    expect(screen.queryByText('进度已保存')).not.toBeInTheDocument();
    expect(screen.getByText('可以从这里继续')).toBeInTheDocument();
    expect(screen.getByText('继续处理选项')).toBeInTheDocument();
  });

  it('keeps retryable checkpoint failures collapsed as one status until opened', () => {
    render(
      <AssistantDataFallback
        type="data"
        status={{ type: 'complete' }}
        name="fitmeet-process"
        data={{
          runtime: {
            checkpointId: 321,
            checkpointType: 'step',
            canReplay: true,
            canFork: false,
            checkpointAction: 'retry',
            resumeCursor: {
              threadId: 'agent-task:321',
              action: 'retry',
              stepId: 'rank',
            },
          },
          visibleSummary: {
            source: 'replay.summary',
            displayMode: 'covering_status',
            updateModel: 'latest_state',
            defaultVisibleCount: 1,
            historyVisibility: 'collapsed',
            expandable: true,
            state: 'failed',
            title: '刚才连接不稳',
            detail: '我保留了这段需求，可以继续处理，不会重复执行已确认的高风险动作。',
          },
          steps: [
            {
              id: 'social-codex:summary',
              label: '刚才连接不稳',
              detail: '我保留了这段需求，可以继续处理，不会重复执行已确认的高风险动作。',
              status: 'error',
              processType: 'run_summary',
              metadata: {
                processType: 'run_summary',
                source: 'replay.summary',
              },
            },
          ],
          historySteps: [
            {
              id: 'hydrate-context',
              label: 'hydrate_context planner traceId raw JSON',
              detail: 'tool_call_started payload internal runtime',
              status: 'complete',
            },
            {
              id: 'rank',
              label: '排序候选机会',
              detail: '排序服务暂时没有完成。',
              status: 'error',
              processType: 'tool_progress',
            },
          ],
        }}
      />,
    );

    const process = screen.getByTestId('assistant-ui-tool-ui');
    expect(process).toHaveAttribute('data-process-rendering', 'covering-status');
    expect(process).toHaveAttribute('data-process-status', 'error');
    expect(process).toHaveAttribute('data-process-clickable', 'true');
    expect(process).toHaveAttribute('data-checkpoint-state', 'retryable');
    expect(process).toHaveAttribute('data-retryable', 'true');
    expect(process).toHaveAttribute('data-step-id', 'rank');
    expect(process).not.toHaveAttribute('open');

    const statusLine = within(process).getByTestId('assistant-ui-process-status-line');
    expect(statusLine).toHaveTextContent('刚才连接不稳');
    expect(statusLine).not.toHaveTextContent(/hydrate_context|planner|traceId|raw JSON|payload/i);
    expect(screen.queryByTestId('assistant-ui-process-detail')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-process-evidence')).not.toBeInTheDocument();

    expect(
      screen.queryByText(/hydrate_context|planner|traceId|raw JSON|payload/i),
    ).not.toBeInTheDocument();
  });
});
