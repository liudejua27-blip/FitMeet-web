import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LifeGraphPage } from '../pages/LifeGraphPage';
import {
  lifeGraphApi,
  type LifeGraphFieldCategory,
  type LifeGraphResponse,
} from '../api/lifeGraphApi';

vi.mock('../api/lifeGraphApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/lifeGraphApi')>();
  return {
    ...actual,
    lifeGraphApi: {
      getMe: vi.fn(),
      updateMe: vi.fn(),
      getCompleteness: vi.fn(),
      getAudit: vi.fn(),
      confirmUpdate: vi.fn(),
      rejectUpdate: vi.fn(),
      revokeField: vi.fn(),
      extractFromChat: vi.fn(),
    },
  };
});

const mockedApi = vi.mocked(lifeGraphApi);

const graphResponse: LifeGraphResponse = {
  profile: {
    id: 1,
    userId: 7,
    completenessScore: 72,
    currentSocialGoal: '找青岛大学跑步搭子',
    aiSummary:
      '你目前更适合低压力、公共场所、先聊天后见面的社交方式。可约时间还需要继续确认。',
    preferredLanguage: 'zh-CN',
    country: '中国',
    region: '山东',
    city: '青岛',
    timezone: 'Asia/Shanghai',
    lastUpdatedAt: '2026-05-26T02:00:00.000Z',
    createdAt: '2026-05-26T01:00:00.000Z',
    updatedAt: '2026-05-26T02:00:00.000Z',
  },
  fields: {
    identity: [
      field('identity', 'city', '青岛', 'manual', 1, true),
      field('identity', 'nearbyArea', '青岛大学附近', 'ai_inferred', 0.92, false),
    ],
    social_intent: [
      field('social_intent', 'preferredSocialStyle', '先聊天后见面', 'ai_inferred', 0.88, false),
    ],
    lifestyle: [field('lifestyle', 'availableTimes', ['周末下午'], 'manual', 1, true)],
    fitness_activity: [
      field('fitness_activity', 'sportsPreferences', ['跑步'], 'manual', 1, true),
      field('fitness_activity', 'publicPlaceOnly', true, 'manual', 1, true),
    ],
    trust_safety: [
      field('trust_safety', 'requiresStrictConfirmation', true, 'system_generated', 1, true),
    ],
    interaction_memory: [],
    privacy_boundary: [],
  },
  completeness: {
    completenessScore: 72,
    modules: {
      identity: 75,
      social_intent: 60,
      lifestyle: 70,
      fitness_activity: 80,
      trust_safety: 50,
      interaction_memory: 20,
      privacy_boundary: 50,
    },
    missingFields: [
      {
        category: 'lifestyle',
        fieldKey: 'acceptsNightMeet',
        label: '是否接受夜间见面',
        priority: 'high',
      },
    ],
  },
  pendingProposal: {
    proposalId: 99,
    userId: 7,
    taskId: null,
    messageId: 'message_1',
    status: 'proposed',
    aiSummary: '我识别到你周末下午有空，并偏好跑步。',
    confirmationRequired: true,
    createdAt: '2026-05-26T02:00:00.000Z',
    confirmedAt: null,
    rejectedAt: null,
    missingFields: [],
    proposedFields: [
      {
        proposalFieldId: 'lifestyle:weekendAvailability:1',
        category: 'lifestyle',
        fieldKey: 'weekendAvailability',
        fieldValue: '周末下午',
        source: 'ai_inferred',
        confidence: 0.9,
        reason: '用户提到周末下午比较有空',
        requiresUserConfirmation: true,
        status: 'proposed',
        conflict: false,
        oldValue: null,
      },
    ],
  },
};

function field(
  category: LifeGraphFieldCategory,
  fieldKey: string,
  fieldValue: unknown,
  source: 'manual' | 'ai_inferred' | 'system_generated',
  confidence: number,
  confirmedByUser: boolean,
) {
  return {
    id: Math.floor(Math.random() * 10000),
    userId: 7,
    category,
    fieldKey,
    fieldValue,
    source,
    confidence,
    confirmedByUser,
    editable: true,
    revoked: false,
    revokedAt: null,
    lastInferredAt: source === 'ai_inferred' ? '2026-05-26T02:00:00.000Z' : null,
    signalType: 'core_signal' as const,
    visibleInRecommendationReason: true,
    userCanDisableForMatching: false,
    enabledForMatching: true,
    createdAt: '2026-05-26T01:00:00.000Z',
    updatedAt: '2026-05-26T02:00:00.000Z',
  };
}

function renderPage(width = 1024) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  return render(
    <MemoryRouter>
      <LifeGraphPage />
    </MemoryRouter>,
  );
}

function mockHappyPath(response = graphResponse) {
  mockedApi.getMe.mockResolvedValue(response);
  mockedApi.getCompleteness.mockResolvedValue(response.completeness);
  mockedApi.getAudit.mockResolvedValue([
    {
      id: 1,
      userId: 7,
      category: 'identity',
      fieldKey: 'city',
      oldValue: null,
      newValue: '青岛',
      source: 'manual',
      confidence: 1,
      action: 'updated',
      reason: 'user_manual_update',
      taskId: null,
      messageId: null,
      createdAt: '2026-05-26T02:00:00.000Z',
    },
  ]);
  mockedApi.updateMe.mockResolvedValue(response);
  mockedApi.confirmUpdate.mockResolvedValue({ ...response.pendingProposal!, status: 'confirmed' });
  mockedApi.rejectUpdate.mockResolvedValue({ ...response.pendingProposal!, status: 'rejected' });
  mockedApi.revokeField.mockResolvedValue(response);
}

describe('LifeGraphPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHappyPath();
  });

  it('loads /life-graph and renders summary, completeness, missing fields and audit timeline', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Life Graph' })).toBeInTheDocument();
    expect(screen.getByText('Agent 当前理解')).toBeInTheDocument();
    expect(screen.getAllByText('画像完整度').length).toBeGreaterThan(0);
    expect(screen.getByText('这些信息会让匹配更准确')).toBeInTheDocument();
    expect(screen.getByText('最近画像更新记录')).toBeInTheDocument();
    expect(screen.getAllByText('72%').length).toBeGreaterThan(0);
  });

  it('renders ProposalCard and can confirm or reject proposals', async () => {
    const { unmount } = renderPage();

    const proposal = await screen.findByText('Agent 从你的对话中识别到以下画像更新，是否保存？');
    expect(proposal).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '全部保存' }));
    await waitFor(() => expect(mockedApi.confirmUpdate).toHaveBeenCalledWith({ proposalId: 99 }));

    unmount();
    vi.clearAllMocks();
    mockHappyPath();
    renderPage();
    await screen.findByText('Agent 从你的对话中识别到以下画像更新，是否保存？');
    fireEvent.click(screen.getAllByRole('button', { name: '不保存' })[0]);
    await waitFor(() =>
      expect(mockedApi.rejectUpdate).toHaveBeenCalledWith({
        proposalId: 99,
        reason: '用户在 Life Graph 页面选择不保存',
      }),
    );
  });

  it('allows FieldRow editing and revoking without showing raw backend details', async () => {
    renderPage();

    const cityRow = await screen.findByText('城市');
    const row = cityRow.closest('div')?.parentElement?.parentElement?.parentElement;
    expect(row).toBeTruthy();
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: '编辑' }));
    fireEvent.change(screen.getByPlaceholderText('补充城市'), {
      target: { value: '青岛市' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(mockedApi.updateMe).toHaveBeenCalledWith({
        fields: [
          expect.objectContaining({
            category: 'identity',
            fieldKey: 'city',
            fieldValue: '青岛市',
            confirmedByUser: true,
          }),
        ],
      }),
    );

    const revokeButtons = await screen.findAllByRole('button', { name: '撤回' });
    fireEvent.click(revokeButtons[0]);
    await waitFor(() => expect(mockedApi.revokeField).toHaveBeenCalled());
  });

  it('shows a friendly error instead of stack traces or raw JSON', async () => {
    mockedApi.getMe.mockRejectedValue(new Error('{"stack":"database trace"}'));
    mockedApi.getCompleteness.mockRejectedValue(new Error('ignore'));
    mockedApi.getAudit.mockRejectedValue(new Error('ignore'));

    renderPage();

    expect(await screen.findByText('Life Graph 暂时无法同步')).toBeInTheDocument();
    expect(screen.getByText('Life Graph 暂时没有同步成功，请稍后重试。')).toBeInTheDocument();
    expect(screen.queryByText(/stack/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/database trace/i)).not.toBeInTheDocument();
  });

  it('renders empty states and remains usable on mobile width', async () => {
    mockHappyPath({
      ...graphResponse,
      fields: {},
      pendingProposal: null,
      completeness: {
        completenessScore: 0,
        modules: {},
        missingFields: [],
      },
    });

    renderPage(390);

    expect(await screen.findByRole('heading', { name: 'Life Graph' })).toBeInTheDocument();
    expect(screen.getByText('暂无待确认画像更新')).toBeInTheDocument();
    expect(screen.getByText('当前没有高优先级缺失项。你仍然可以让 Agent 继续优化语气、开场白和隐私边界。')).toBeInTheDocument();
  });
});
