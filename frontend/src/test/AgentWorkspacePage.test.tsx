import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agentInboxApi } from '../api/agentInboxApi';
import { activitiesApi } from '../api/activitiesApi';
import { lifeGraphApi, type LifeGraphResponse } from '../api/lifeGraphApi';
import { socialAgentDebugApi } from '../api/socialAgentDebugApi';
import { socialAgentApi, type UserFacingAgentResponse } from '../api/socialAgentApi';
import { LifeGraphOnboardingModal } from '../components/agent-workspace/LifeGraphAgentFlow';
import { LoginModal } from '../components/auth/LoginModal';
import { AgentWorkspacePage } from '../pages/AgentWorkspacePage';
import { useAuthStore } from '../stores';

const forbiddenUserArtifacts =
  /Life Graph Agent|Social Match Agent|Meet Loop Agent|traceId|agentTrace|structuredIntent|planner|tool call|toolCalls|DeepSeek|OpenAI|raw JSON|stack|审计|audit log/i;

describe('AgentWorkspacePage', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    class ResizeObserverMock {
      observe() {
        return undefined;
      }
      unobserve() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    }
    Object.defineProperty(window, 'ResizeObserver', {
      configurable: true,
      value: ResizeObserverMock,
    });
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: ResizeObserverMock,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useAuthStore.setState({ isLoggedIn: false, user: null, showLoginModal: false });
  });

  it('renders a simple assistant surface without technical agent artifacts', () => {
    render(
      <MemoryRouter initialEntries={['/agent']}>
        <AgentWorkspacePage view="home" />
      </MemoryRouter>,
    );

    expect(screen.getAllByText('FitMeet Agent').length).toBeGreaterThan(0);
    expect(screen.getByText('当前目标')).toBeInTheDocument();
    expect(screen.getByText('Life Graph 摘要')).toBeInTheDocument();
    expect(screen.getByText('我正在关注')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(
        '例如：今晚想找个人慢跑，别太远，先站内聊',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('站内先聊')).toBeInTheDocument();
    expect(screen.getByText('公共场所优先')).toBeInTheDocument();
    expect(screen.getByText('确认后才执行')).toBeInTheDocument();
    expect(screen.getByText('试试这样开始')).toBeInTheDocument();
    expect(screen.getByText('今晚想出门走走')).toBeInTheDocument();
    expect(screen.queryByText('五个核心任务流')).not.toBeInTheDocument();
    expect(screen.queryByText('同城社交')).not.toBeInTheDocument();
    expect(screen.queryByText(forbiddenUserArtifacts)).not.toBeInTheDocument();
  });

  it('keeps the Life Graph onboarding modal in one assistant voice', async () => {
    const getMe = vi.spyOn(lifeGraphApi, 'getMe').mockResolvedValue(mockLifeGraph());

    render(<LifeGraphOnboardingModal open onClose={() => undefined} />);

    expect(screen.getByText('我对你的了解')).toBeInTheDocument();
    expect(screen.getByText('完善你的 Life Graph')).toBeInTheDocument();
    expect(screen.queryByText(forbiddenUserArtifacts)).not.toBeInTheDocument();
    await waitFor(() => expect(getMe).toHaveBeenCalled());
  });

  it('uses FitMeet product copy in the login modal without old loading language', () => {
    useAuthStore.setState({
      showLoginModal: true,
      loading: false,
      error: null,
    });

    render(
      <MemoryRouter>
        <LoginModal />
      </MemoryRouter>,
    );

    expect(screen.getByText('回到 FitMeet')).toBeInTheDocument();
    expect(screen.getByText('继续你的约练、匹配和 Life Graph。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '继续进入' })).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(/Agent 宇宙|连接 Agent|处理中/);
  });

  it('does not render technical artifacts from streamed user-facing responses', async () => {
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(lifeGraphApi, 'getMe').mockResolvedValue(mockLifeGraph());
    vi.spyOn(agentInboxApi, 'events').mockResolvedValue({ events: [] });
    const streamed: UserFacingAgentResponse = {
      assistantMessage: 'planner raw JSON {"traceId":"abc","toolCalls":[],"model":"OpenAI DeepSeek"}',
      lightStatus: '正在理解你的需求',
      permissionMode: 'limited_auto',
      safeStatus: {
        blocked: false,
        level: 'low',
        boundaryNotes: ['traceId should not be visible'],
        requiredConfirmations: ['tool call should not be visible'],
      },
      pendingConfirmations: [],
      cards: [
        {
          id: 'candidate-1',
          type: 'candidate_card',
          title: 'OpenAI planner candidate',
          body: 'raw JSON with agentTrace and stack',
          status: 'ready',
          data: {
            displayName: '小林',
            recommendationLine: 'toolCalls should not show',
            fitReasons: ['青岛大学附近活动', 'planner should not show'],
            whyNow: '今晚时间合适',
            safetyBoundary: '第一次建议选择公共场所，不共享精确位置',
            suggestedOpener: '你好，这周末下午要不要在公共场所轻松慢跑一圈？',
          },
          actions: [],
        },
      ],
    };
    const streamSpy = vi
      .spyOn(socialAgentApi, 'runUserFacingStream')
      .mockImplementation(async (_data, onEvent) => {
        onEvent({ type: 'status', lightStatus: streamed.lightStatus });
        onEvent({
          type: 'progress',
          id: 'understand',
          kind: 'analysis',
          title: '分析中',
          detail: '正在理解你的需求',
          state: 'running',
        });
        onEvent({
          type: 'progress',
          id: 'search',
          kind: 'tool',
          title: '正在调用工具',
          detail: '正在筛选合适的人',
          state: 'running',
        });
        onEvent({ type: 'result', result: streamed });
        return streamed;
      });

    render(
      <MemoryRouter initialEntries={['/agent']}>
        <AgentWorkspacePage view="home" />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '今晚想找青岛大学附近跑步搭子' },
    });
    const form = screen.getByRole('textbox').closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    await waitFor(() => expect(streamSpy).toHaveBeenCalled());
    expect(screen.getByText('分析中')).toBeInTheDocument();
    expect(screen.getByText('正在调用工具')).toBeInTheDocument();
    expect(screen.getByText('分析')).toBeInTheDocument();
    expect(screen.getByText('工具')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('推荐候选人')).toBeInTheDocument());
    expect(document.body.textContent ?? '').not.toMatch(forbiddenUserArtifacts);
  });

  it('submits natural language suggestions through the user-facing stream', async () => {
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(lifeGraphApi, 'getMe').mockResolvedValue(mockLifeGraph());
    vi.spyOn(agentInboxApi, 'events').mockResolvedValue({ events: [] });
    const streamed = mockCandidateResponse();
    const streamSpy = vi
      .spyOn(socialAgentApi, 'runUserFacingStream')
      .mockImplementation(async (_data, onEvent) => {
        onEvent({ type: 'result', result: streamed });
        return streamed;
      });

    render(
      <MemoryRouter initialEntries={['/agent']}>
        <AgentWorkspacePage view="home" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('今晚想出门走走'));

    await waitFor(() => expect(streamSpy).toHaveBeenCalled());
    expect(streamSpy.mock.calls[0]?.[0]).toMatchObject({
      goal: '今晚想出门走走，找个低压力的人一起散步',
      permissionMode: 'limited_auto',
    });
  });

  it('links the permission dropdown to streamed Agent requests', async () => {
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(lifeGraphApi, 'getMe').mockResolvedValue(mockLifeGraph());
    vi.spyOn(agentInboxApi, 'events').mockResolvedValue({ events: [] });
    const streamSpy = vi
      .spyOn(socialAgentApi, 'runUserFacingStream')
      .mockImplementation(async (_data, onEvent) => {
        const streamed = mockCandidateResponse();
        onEvent({ type: 'result', result: streamed });
        return streamed;
      });

    render(
      <MemoryRouter initialEntries={['/agent']}>
        <AgentWorkspacePage view="home" />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('权限模式'), { target: { value: 'assist' } });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '只帮我看看，不自动操作' } });
    fireEvent.submit(screen.getByRole('textbox').closest('form') as HTMLFormElement);
    await waitFor(() => expect(streamSpy).toHaveBeenCalledTimes(1));
    expect(streamSpy.mock.calls[0]?.[0]).toMatchObject({ permissionMode: 'assist' });

    cleanup();
    vi.restoreAllMocks();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(lifeGraphApi, 'getMe').mockResolvedValue(mockLifeGraph());
    vi.spyOn(agentInboxApi, 'events').mockResolvedValue({ events: [] });
    const openSpy = vi
      .spyOn(socialAgentApi, 'runUserFacingStream')
      .mockImplementation(async (_data, onEvent) => {
        const streamed = mockCandidateResponse();
        onEvent({ type: 'result', result: streamed });
        return streamed;
      });

    render(
      <MemoryRouter initialEntries={['/agent']}>
        <AgentWorkspacePage view="home" />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('权限模式'), { target: { value: 'open' } });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '开放权限跑一遍推荐' } });
    fireEvent.submit(screen.getByRole('textbox').closest('form') as HTMLFormElement);
    await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1));
    expect(openSpy.mock.calls[0]?.[0]).toMatchObject({ permissionMode: 'open' });
  });

  it('renders candidate reasoning and only shows a natural confirmation card before sending', async () => {
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(lifeGraphApi, 'getMe').mockResolvedValue(mockLifeGraph());
    vi.spyOn(agentInboxApi, 'events').mockResolvedValue({ events: [] });
    const streamed = mockCandidateResponse();
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({ type: 'result', result: streamed });
      return streamed;
    });
    const actionResponse = mockOpenerApprovalResponse();
    const actionSpy = vi.spyOn(socialAgentApi, 'performAction').mockResolvedValue(actionResponse);

    render(
      <MemoryRouter initialEntries={['/agent']}>
        <AgentWorkspacePage view="home" />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '今晚想找青岛大学附近跑步搭子' },
    });
    fireEvent.submit(screen.getByRole('textbox').closest('form') as HTMLFormElement);

    await waitFor(() => expect(screen.getByText('小林')).toBeInTheDocument());
    expect(screen.getByText('你们的活动区域、时间、运动偏好和第一次见面边界都比较一致。')).toBeInTheDocument();
    expect(screen.getByText('青岛大学附近活动')).toBeInTheDocument();
    expect(screen.getByText('今晚时间合适')).toBeInTheDocument();
    expect(screen.getByText('第一次建议选择校园操场或公共公园，不共享精确位置。')).toBeInTheDocument();

    fireEvent.click(screen.getByText('生成开场白'));

    await waitFor(() => expect(actionSpy).toHaveBeenCalled());
    expect(actionSpy.mock.calls[0]?.[0]).toMatchObject({
      taskId: 101,
      action: 'candidate.generate_opener',
    });
    await waitFor(() =>
      expect(
        screen.getByText('这条消息会发送给对方。我先帮你写好了，你确认后我再发。'),
      ).toBeInTheDocument(),
    );
    expect(screen.getAllByText('确认发送').length).toBeGreaterThan(0);
    expect(document.body.textContent ?? '').not.toMatch(/已发送|已创建|human approval|tool/i);
  });

  it('shows privacy controls, activity loop details, Life Graph confirmation, and debug logs', async () => {
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(lifeGraphApi, 'getMe').mockResolvedValue(mockLifeGraph());
    vi.spyOn(agentInboxApi, 'events').mockResolvedValue({ events: [] });
    vi.spyOn(activitiesApi, 'get').mockResolvedValue({
      activity: {
        id: 77,
        creatorId: 1,
        participantIds: [1, 2],
        socialRequestId: 3,
        matchedCandidateId: 4,
        type: 'running',
        title: '青岛大学慢跑',
        description: '公共场所轻松慢跑。',
        locationName: '青岛大学操场',
        city: '青岛',
        startTime: '2026-06-04T11:30:00.000Z',
        endTime: null,
        status: 'in_progress',
        icebreakerTasks: [],
        safetyTips: [],
        proofRequired: true,
        proofPolicy: 'mutual_or_proof',
        safetyLevel: 'low',
        checkinByUserId: {},
        confirmByUserId: {},
      },
      proofs: [
        {
          id: 8,
          activityId: 77,
          userId: 1,
          proofType: 'checkin',
          photoUrl: null,
          note: '已到达',
          locationApprox: '青岛大学附近',
          status: 'accepted',
          privacyMode: 'scene_only',
          reviewedById: null,
          reviewedAt: null,
          reviewReason: '',
          createdAt: '2026-06-04T11:35:00.000Z',
        },
      ],
    });
    vi.spyOn(socialAgentDebugApi, 'getTaskEvents').mockResolvedValue({
      taskId: 101,
      events: [
        {
          id: 1,
          taskId: 101,
          eventType: 'tool_call',
          actor: 'agent',
          summary: '活动详情读取完成',
          payload: { status: 'ok' },
          stepId: 'activity',
          toolCallId: 'tool-1',
          createdAt: '2026-06-04T11:36:00.000Z',
        },
      ],
    });
    const streamed = mockRichAgentResponse();
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({ type: 'result', result: streamed });
      return streamed;
    });
    const actionSpy = vi.spyOn(socialAgentApi, 'performAction').mockResolvedValue(streamed);

    render(
      <MemoryRouter initialEntries={['/agent']}>
        <AgentWorkspacePage view="home" />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '今晚想找跑步活动' },
    });
    fireEvent.submit(screen.getByRole('textbox').closest('form') as HTMLFormElement);

    await waitFor(() => expect(screen.getByText('隐私显示')).toBeInTheDocument());
    expect(screen.getAllByText('默认隐藏').length).toBeGreaterThan(0);
    expect(screen.queryByText(/62kg/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '身体信息' }));
    fireEvent.click(screen.getByRole('button', { name: '精确位置' }));
    expect(await screen.findByText(/62kg/)).toBeInTheDocument();
    expect(screen.getAllByText(/青岛大学操场/).length).toBeGreaterThan(0);

    expect(screen.getByText('约练闭环')).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('查看详情')[1]);
    await waitFor(() => expect(activitiesApi.get).toHaveBeenCalledWith(77));
    await waitFor(() => expect(screen.getAllByText('青岛大学慢跑').length).toBeGreaterThan(1));
    expect(screen.getByText(/checkin/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('确认更新'));
    await waitFor(() =>
      expect(actionSpy).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: 101, action: 'life_graph.accept_update' }),
      ),
    );

    fireEvent.click(screen.getByText('查看调试日志'));
    expect(await screen.findByText(/tool_call/)).toBeInTheDocument();
    expect(screen.getByText(/活动详情读取完成/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('页面代码'), {
      target: { value: 'function AgentPermissionSelect(){ return <select aria-label="权限模式" /> }' },
    });
    fireEvent.click(screen.getByText('输出缺失模块列表'));
    expect(screen.getByText('Activity 状态显示')).toBeInTheDocument();
  });

  it('keeps the assistant surface usable at mobile width', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });

    render(
      <MemoryRouter initialEntries={['/agent']}>
        <AgentWorkspacePage view="home" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByText('当前目标')).toBeInTheDocument();
    expect(screen.getByText('试试这样开始')).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(forbiddenUserArtifacts);
  });
});

function mockLifeGraph(): LifeGraphResponse {
  return {
    profile: {
      id: 1,
      userId: 1,
      completenessScore: 72,
      currentSocialGoal: '',
      aiSummary: '你更适合周末下午的低压力运动社交。',
      preferredLanguage: 'zh-CN',
      country: 'CN',
      region: '',
      city: '青岛',
      timezone: 'Asia/Shanghai',
      lastUpdatedAt: null,
      createdAt: '',
      updatedAt: '',
    },
    fields: {},
    completeness: {
      completenessScore: 72,
      modules: {},
      missingFields: [],
    },
    pendingProposal: null,
  };
}

function mockCandidateResponse(): UserFacingAgentResponse {
  return {
    assistantMessage:
      '可以。我会先结合你的 Life Graph 和安全边界，帮你看更适合低压力跑步的人。',
    lightStatus: '正在筛选合适的人',
    permissionMode: 'limited_auto',
    safeStatus: {
      blocked: false,
      level: 'low',
      boundaryNotes: ['第一次建议选择公共场所，不共享精确位置。'],
      requiredConfirmations: [],
    },
    pendingConfirmations: [],
    cards: [
      {
        id: 'candidate-1',
        type: 'candidate_card',
        title: '小林',
        body: '你们在时间、地点、活动偏好和第一次见面边界上比较接近。',
        status: 'ready',
        data: {
          taskId: 101,
          matchScore: '86%',
          recommendationLine: '你们的活动区域、时间、运动偏好和第一次见面边界都比较一致。',
          fitReasons: ['青岛大学附近活动', '周末下午活跃', '喜欢跑步/散步', '接受公共场所见面'],
          whyNow: '今晚时间合适',
          safetyBoundary: '第一次建议选择校园操场或公共公园，不共享精确位置。',
          suggestedOpener:
            '你好，我看到你也喜欢周末下午跑步。我平时也在青岛大学附近活动，如果你方便的话，这周六下午可以在校园操场或附近公园一起慢跑一圈。',
        },
        actions: [
          {
            id: 'generate-opener',
            label: '生成开场白',
            action: 'generate_opener',
            requiresConfirmation: false,
            payload: { taskId: 101 },
          },
          {
            id: 'see-more',
            label: '看看更多',
            action: 'see_more',
            requiresConfirmation: false,
            payload: { taskId: 101 },
          },
          {
            id: 'create-activity',
            label: '创建约练',
            action: 'create_activity',
            requiresConfirmation: true,
            payload: { taskId: 101 },
          },
        ],
      },
    ],
  };
}

function mockRichAgentResponse(): UserFacingAgentResponse {
  return {
    assistantMessage: '我把候选人、活动状态和画像更新建议整理好了，关键动作会等你确认。',
    lightStatus: '正在等待你确认',
    permissionMode: 'limited_auto',
    safeStatus: {
      blocked: false,
      level: 'low',
      boundaryNotes: ['身体信息和精确位置只对你本人显示。'],
      requiredConfirmations: ['Life Graph 更新需要确认'],
    },
    pendingConfirmations: [],
    cards: [
      {
        id: 'candidate-rich',
        type: 'candidate_card',
        title: '小周',
        body: '你们在区域、时间和跑步偏好上比较匹配。',
        status: 'ready',
        data: {
          taskId: 101,
          matchScore: '91%',
          area: '青岛大学附近',
          timePreference: '今晚 19:30',
          sportType: '慢跑',
          socialPreference: '低压力公共场所',
          nextActionSuggestion: '发送邀请或加入活动',
          bodyInfo: '身高 170cm / 62kg',
          preciseLocation: '青岛大学操场 36.1062, 120.4213',
          recommendationLine: '区域、时间、运动类型和社交偏好都匹配。',
          fitReasons: ['区域接近', '时间一致', '运动类型一致', '社交偏好一致'],
          safetyBoundary: '精确位置默认隐藏，第一次见面选择公共场所。',
        },
        actions: [],
      },
      {
        id: 'activity-77',
        type: 'activity_status',
        title: '青岛大学慢跑',
        body: '活动已进入签到和证明阶段。',
        status: 'ready',
        data: {
          taskId: 101,
          activityId: 77,
          status: 'in_progress',
          city: '青岛',
          exactLocation: '青岛大学操场',
          proofStatus: '待上传证明',
        },
        actions: [
          {
            id: 'upload-proof',
            label: '上传证明',
            action: 'upload_proof',
            schemaAction: 'activity.upload_proof',
            requiresConfirmation: false,
            payload: { taskId: 101, activityId: 77 },
          },
        ],
      },
      {
        id: 'profile-update',
        type: 'profile_proposal',
        title: '建议更新 Life Graph',
        body: '记录你更偏好公共场所慢跑。',
        status: 'waiting_confirmation',
        data: {
          taskId: 101,
          proposedFields: ['运动偏好：慢跑', '社交边界：公共场所'],
        },
        actions: [
          {
            id: 'accept-life',
            label: '确认更新',
            action: 'confirm_profile_update',
            schemaAction: 'life_graph.accept_update',
            requiresConfirmation: true,
            payload: { taskId: 101 },
          },
          {
            id: 'reject-life',
            label: '拒绝更新',
            action: 'refine_request',
            schemaAction: 'life_graph.reject_update',
            requiresConfirmation: false,
            payload: { taskId: 101 },
          },
        ],
      },
    ],
  };
}

function mockOpenerApprovalResponse(): UserFacingAgentResponse {
  return {
    assistantMessage: '我先帮你写了一条低压力的开场白。你确认前，我不会替你发送。',
    lightStatus: '正在等待你确认',
    permissionMode: 'limited_auto',
    safeStatus: {
      blocked: false,
      level: 'low',
      boundaryNotes: [],
      requiredConfirmations: [],
    },
    pendingConfirmations: [
      {
        id: 9,
        type: 'send_message',
        actionType: 'send_candidate_message',
        summary: '发送开场白给候选人 #2',
        riskLevel: 'medium',
        expiresAt: null,
      },
    ],
    cards: [
      {
        id: 'opener-approval-1',
        type: 'opener_approval',
        title: '这条消息会发送给对方。我先帮你写好了，你确认后我再发。',
        body: '你好，我看到你也喜欢周末下午跑步。如果你方便的话，这周六下午可以在公共场所轻松慢跑一圈。',
        status: 'waiting_confirmation',
        data: {
          taskId: 101,
          loopStage: 'opener_draft_created',
          safetyBoundary: '确认前不会发送。建议先站内沟通。',
        },
        actions: [
          {
            id: 'opener-confirm-send',
            label: '确认发送',
            action: 'send_message',
            schemaAction: 'opener.confirm_send',
            loopStage: 'opener_draft_created',
            requiresConfirmation: true,
            payload: { taskId: 101 },
          },
        ],
      },
    ],
  };
}
