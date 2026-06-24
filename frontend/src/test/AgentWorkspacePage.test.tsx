import { act } from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
  type RenderResult,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  socialAgentApi,
  type FitMeetAlphaCardAction,
  type SocialAgentProfileGateStatus,
  type SocialAgentReminderPreference,
  type SocialCodexReplayPackage,
  type UserFacingAgentResponse,
  type UserFacingAgentSessionSnapshot,
} from '../api/socialAgentApi';
import { agentApprovalsApi, type AgentApprovalResumePlan } from '../api/agentApprovalsApi';
import { resetCardActionRuntimeStateForTests } from '../components/assistant-ui/tool-card-actions';
import { AgentWorkspacePage } from '../pages/AgentWorkspacePage';
import { useAuthStore } from '../stores';

const forbiddenUserArtifacts =
  /Life Graph Agent|Social Match Agent|Meet Loop Agent|traceId|agentTrace|structuredIntent|planner|tool call|toolCalls|DeepSeek|OpenAI|raw JSON|stack|审计|audit log/i;

function useRealAgentAdapter() {
  vi.stubEnv('VITE_AGENT_ADAPTER', 'real');
  vi.spyOn(socialAgentApi, 'handleMessageStream').mockImplementation(
    async (request, onEvent, signal) =>
      socialAgentApi.runUserFacingStream(
        {
          goal: request.message,
          permissionMode: 'limited_auto',
          taskId: request.taskId,
          idempotencyKey: request.idempotencyKey,
          clientContext: request.clientContext,
        },
        onEvent,
        signal,
      ),
  );
}

function openRadixMenu(trigger: HTMLElement) {
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
}

function getEnabledSchemaActionButton(schemaAction: string) {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>(`button[data-schema-action="${schemaAction}"]`),
  );
  return buttons.find((button) => !button.disabled) ?? buttons[0] ?? null;
}

function mockApprovalResumePlan(
  overrides: Partial<NonNullable<AgentApprovalResumePlan>> = {},
): NonNullable<AgentApprovalResumePlan> {
  const stepId = overrides.resumeCursor?.stepId ?? 'approval-88';
  const idempotencyKey =
    overrides.idempotencyKey ??
    `agent-checkpoint:resume:agent-task:42:checkpoint:${overrides.checkpointId ?? 99}:step:${stepId}`;
  return {
    checkpointId: 99,
    parentCheckpointId: null,
    taskId: 42,
    action: 'resume',
    resumePrompt: '继续刚才保存的 Agent 步骤。',
    threadId: 'agent-task:42',
    resumeCursor: {
      threadId: 'agent-task:42',
      checkpointId: overrides.checkpointId ?? 99,
      parentCheckpointId: null,
      action: 'resume',
      stepId,
      ...overrides.resumeCursor,
    },
    sourceStep: {
      stepId: String(stepId ?? 'approval-88'),
      label: null,
      toolName: 'approval_gate',
      ...overrides.sourceStep,
    },
    stepScope: {
      mode: 'full_checkpoint',
      stepCount: 0,
      sourceCheckpointId: null,
      ...overrides.stepScope,
    },
    sideEffectPolicy: {
      idempotencyKey,
      sideEffectsBeforeResume: 'idempotent_only',
      duplicatePolicy: 'reuse_idempotency_key',
      ...overrides.sideEffectPolicy,
    },
    idempotencyKey,
    interrupt: null,
    runId: 'run-1',
    ...overrides,
  };
}

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
    vi.spyOn(socialAgentApi, 'getTaskEventReplay').mockResolvedValue(emptyReplay());
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    window.history.pushState({}, '', '/');
    act(() => {
      resetCardActionRuntimeStateForTests();
      useAuthStore.setState({ isLoggedIn: false, user: null, showLoginModal: false });
    });
  });

  it('renders a pure assistant-ui chat shell without FitMeet workspace artifacts', async () => {
    await renderAgentPage();

    const shell = await screen.findByTestId('assistant-ui-shell');
    expect(shell.className).toContain('h-[100svh]');
    expect(shell.className).not.toContain('100dvh');
    expect(screen.getByRole('heading', { name: '有什么我可以帮你？' })).toBeInTheDocument();
    expect(screen.getByText('开始你的全球社交')).toBeInTheDocument();
    expect(shell).toHaveAttribute('data-sidebar-state', 'open');
    expect(shell).toHaveAttribute('data-sidebar-mode', 'desktop');
    expect(shell).toHaveAttribute('data-auth-state', 'signed-out');
    expect(shell).toHaveAttribute('data-stream-state', 'idle');
    expect(shell).toHaveAttribute('data-session-state', 'ready');
    expect(shell).toHaveAttribute('data-message-count', '0');
    expect(screen.getByTestId('assistant-ui-main')).toHaveAttribute('aria-label', '聊天主区域');
    expect(screen.getByTestId('assistant-ui-main')).toHaveAttribute('data-stream-state', 'idle');
    expect(screen.getByTestId('assistant-ui-main')).toHaveAttribute('data-recovery-state', 'none');
    expect(screen.getByTestId('assistant-ui-thread')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-thread')).toHaveAttribute(
      'data-thread-model',
      'assistant-ui-thread',
    );
    expect(screen.getByTestId('assistant-ui-thread')).toHaveAttribute(
      'data-thread-shell',
      'chatgpt-clone',
    );
    expect(screen.getByTestId('assistant-ui-thread')).toHaveAttribute(
      'data-empty-state',
      'visible',
    );
    expect(screen.getByTestId('assistant-ui-thread')).toHaveAttribute(
      'data-viewport-state',
      'hidden',
    );
    expect(screen.getByTestId('assistant-ui-thread')).toHaveAttribute(
      'data-selection-overlap-policy',
      'avoid-message-text',
    );
    expect(screen.getByTestId('assistant-ui-empty-state')).toHaveAttribute(
      'data-empty-model',
      'assistant-ui-welcome',
    );
    expect(screen.getByTestId('assistant-ui-empty-state')).toHaveAttribute(
      'data-empty-layout',
      'centered-composer',
    );
    expect(screen.getByTestId('assistant-ui-empty-state')).toHaveAttribute(
      'data-suggestion-chips',
      'none',
    );
    expect(screen.getByTestId('assistant-ui-empty-title')).toHaveAttribute(
      'data-title-model',
      'chatgpt-welcome',
    );
    expect(screen.getByTestId('assistant-ui-empty-subtitle')).toHaveAttribute(
      'data-subtitle-model',
      'brand-minimal',
    );
    expect(screen.getByTestId('assistant-ui-empty-composer-slot')).toHaveAttribute(
      'data-composer-placement',
      'centered-empty-state',
    );
    expect(screen.getByTestId('assistant-ui-messages')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-messages')).toHaveAttribute('data-message-count', '0');
    expect(screen.getByTestId('assistant-ui-messages')).toHaveAttribute(
      'data-stream-state',
      'idle',
    );
    expect(screen.getByTestId('assistant-ui-messages')).toHaveAttribute(
      'data-messages-model',
      'assistant-ui-thread-messages',
    );
    expect(screen.getByTestId('assistant-ui-messages')).toHaveAttribute(
      'data-message-renderer',
      'assistant-ui-message-parts',
    );
    expect(screen.queryByRole('log', { name: '对话消息' })).not.toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-composer')).toHaveClass(
      'shadow-[0_1px_2px_rgba(0,0,0,0.035)]',
    );
    expect(screen.getByTestId('assistant-ui-composer')).toHaveAttribute(
      'data-ui-model',
      'assistant-ui-chatgpt-composer',
    );
    expect(screen.getByTestId('assistant-ui-composer')).toHaveAttribute(
      'data-visual-density',
      'compact',
    );
    expect(screen.getByTestId('assistant-ui-composer')).toHaveAttribute(
      'data-toolbar-model',
      'minimal',
    );
    expect(screen.getByTestId('assistant-ui-composer')).toHaveAttribute(
      'data-permission-entry',
      'none',
    );
    const composer = screen.getByTestId('assistant-ui-composer');
    expect(
      within(composer).queryByRole('button', { name: /工具|权限|执行边界/ }),
    ).not.toBeInTheDocument();
    expect(within(composer).queryByText(/找人|约练|推荐用户|主动提醒/)).not.toBeInTheDocument();
    expect(within(composer).queryByTestId('assistant-ui-reminder-toggle')).not.toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-composer')).toHaveAttribute(
      'data-attachment-model',
      'message-part',
    );
    expect(screen.getByTestId('assistant-ui-composer')).toHaveAttribute(
      'data-border-tone',
      'subtle',
    );
    expect(screen.getByTestId('assistant-ui-composer')).toHaveAttribute(
      'data-focus-ring',
      'subtle',
    );
    expect(screen.getByTestId('assistant-ui-composer')).toHaveAttribute(
      'data-composer-radius',
      '28px',
    );
    expect(screen.getByTestId('assistant-ui-composer')).toHaveAttribute(
      'data-focus-ring-model',
      'chatgpt-subtle',
    );
    expect(screen.getByTestId('assistant-ui-composer')).toHaveAttribute(
      'data-keyboard-safe-area',
      'enabled',
    );
    expect(screen.getByTestId('assistant-ui-composer')).toHaveAttribute(
      'data-primary-action',
      'login',
    );
    expect(screen.getByTestId('assistant-ui-composer')).toHaveAttribute(
      'data-composer-state',
      'auth-required',
    );
    expect(screen.getByTestId('assistant-ui-composer')).toHaveAttribute(
      'data-auth-state',
      'signed-out',
    );
    expect(screen.getByTestId('assistant-ui-composer')).toHaveAttribute(
      'data-upload-blocked',
      'false',
    );
    expect(screen.getByTestId('assistant-ui-composer')).toHaveAttribute('data-upload-count', '0');
    expect(screen.getByTestId('assistant-ui-composer')).toHaveAttribute(
      'data-upload-uploading',
      '0',
    );
    expect(screen.getByTestId('assistant-ui-composer')).toHaveAttribute('data-upload-failed', '0');
    expect(screen.getByTestId('assistant-ui-attachment-dropzone')).toHaveAttribute(
      'aria-label',
      '拖放图片或视频到这里',
    );
    expect(screen.getByTestId('assistant-ui-attachment-dropzone')).toHaveAttribute(
      'data-dropzone-state',
      'disabled',
    );
    expect(screen.getByTestId('assistant-ui-composer-input')).toHaveAttribute(
      'data-input-model',
      'single-composer',
    );
    expect(screen.getByTestId('assistant-ui-composer-input')).toHaveAttribute(
      'data-auto-focus',
      'disabled',
    );
    expect(screen.getByTestId('assistant-ui-composer-toolbar')).toHaveAttribute(
      'data-toolbar-model',
      'minimal',
    );
    expect(screen.getByTestId('assistant-ui-composer-toolbar')).toHaveAttribute(
      'data-permission-entry',
      'none',
    );
    expect(screen.getByTestId('assistant-ui-composer-secondary-actions')).toHaveAttribute(
      'data-action-group',
      'attachments',
    );
    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByTestId('assistant-ui-empty-suggestions')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /解释一个问题/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /整理一个计划/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新对话' })).toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-sidebar-account')).toHaveAttribute(
      'data-auth-state',
      'signed-out',
    );
    expect(screen.getByTestId('assistant-ui-sidebar-account')).toHaveAttribute(
      'data-sync-state',
      'signed-out',
    );
    expect(screen.getByText('登录后同步')).toBeInTheDocument();
    expect(screen.getByText('保存会话和偏好')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', '登录后继续');
    expect(screen.getByTestId('assistant-ui-disclaimer')).toHaveTextContent(
      'FitMeet Agent 可能会出错。重要操作请以你确认后的内容为准。',
    );
    expect(screen.queryByRole('button', { name: /^Tools$/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Search the web')).not.toBeInTheDocument();
    expect(screen.queryByText('Create an image')).not.toBeInTheDocument();
    expect(document.querySelector('.fitmeet-assistant-shell')).toBeNull();
    expect(document.querySelector('.fitmeet-assistant-stage')).toBeNull();
    expect(document.querySelector('.fitmeet-composer')).toBeNull();
    expect(document.querySelector('.agent-gpt-copy-shell')).toBeNull();
    expect(document.querySelector('.agent-workspace--gpt')).toBeNull();
    expect(document.querySelector('.agent-gpt-result-block')).toBeNull();
    expect(document.querySelector('.codex-ant-pet')).toBeNull();
    expect(document.querySelector('.life-modal')).toBeNull();
    expect(screen.queryByText('开始一个低压力任务')).not.toBeInTheDocument();
    expect(screen.queryByText('今天想认识什么样的人？')).not.toBeInTheDocument();
    expect(screen.queryByText('找个跑步搭子')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /权限模式|执行边界|工具/ }),
    ).not.toBeInTheDocument();
    expect(document.querySelectorAll('img[src="/favicon-192.png"]')).toHaveLength(1);
  });

  it('keeps the empty state centered on the composer instead of custom prompt chips', async () => {
    await renderAgentPage();

    const emptyState = await screen.findByTestId('assistant-ui-empty-state');
    expect(screen.queryByTestId('assistant-ui-empty-suggestions')).not.toBeInTheDocument();
    expect(emptyState).toHaveAttribute('data-suggestion-chips', 'none');
    expect(screen.getByTestId('assistant-ui-empty-composer-slot')).toHaveAttribute(
      'data-keyboard-safe-area',
      'enabled',
    );
    expect(screen.getByTestId('assistant-ui-composer')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(screen.queryByText('解释一个问题')).not.toBeInTheDocument();
    expect(screen.queryByText('整理一个计划')).not.toBeInTheDocument();
    expect(screen.queryByText('找个跑步搭子')).not.toBeInTheDocument();
    expect(screen.queryByText('今天想认识什么样的人？')).not.toBeInTheDocument();
  });

  it('shows a lightweight profile completion prompt without blocking ordinary empty chat', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({
      isLoggedIn: true,
      showLoginModal: false,
      user: {
        id: 1001,
        name: '测试用户',
        avatar: '',
        color: '#111111',
        gender: 'unknown',
        age: 28,
        city: '',
        gym: '',
        bio: '',
        singleCert: false,
        interestTags: [],
        trainingDays: 0,
        trainingCount: 0,
        caloriesBurned: 0,
        bestRecords: [],
        meetCount: 0,
        followers: 0,
        following: 0,
      },
    });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'listThreads').mockResolvedValue({ threads: [] });
    vi.spyOn(socialAgentApi, 'getProfileGate').mockResolvedValue({
      passed: false,
      missing: ['city', 'availability', 'publicAuthorization'],
      assistantMessage: '我还需要补齐城市/区域、可约时间、公开授权。',
      profileCompleteness: 42,
      readinessLevel: 'profile_missing',
      canEnterMatchPool: false,
      nextActions: ['城市/大致区域', '可约时间', '是否授权公开到发现页'],
    } satisfies SocialAgentProfileGateStatus);

    await renderAgentPage();

    expect(await screen.findByTestId('assistant-ui-empty-state')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-profile-gate-hint')).toHaveAttribute(
      'data-blocks-chat',
      'false',
    );
    expect(screen.getByText('匹配前还差一点个人信息')).toBeInTheDocument();
    expect(screen.getByText(/普通聊天可以直接开始/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '完善个人信息' })).toHaveAttribute(
      'href',
      '/agent/profile',
    );
    expect(screen.getByText('城市/大致区域')).toBeInTheDocument();
    expect(screen.getByText('可约时间')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', '询问任何问题');
    expect(
      screen.queryByText(/推荐给你的人|约练闭环|今天想认识什么样的人/),
    ).not.toBeInTheDocument();
  });

  it('shows inline auth instead of opening the login modal on unauthenticated submit', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: false, showLoginModal: false });
    const streamSpy = vi.spyOn(socialAgentApi, 'runUserFacingStream');

    await renderAgentPage();

    expect(screen.getByRole('button', { name: '登录后继续' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登录后添加图片或视频' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '登录后同步' }));
    expect(useAuthStore.getState().showLoginModal).toBe(true);
    act(() => {
      useAuthStore.setState({ showLoginModal: false });
    });
    fireEvent.click(screen.getByRole('button', { name: '登录后继续' }));
    expect(useAuthStore.getState().showLoginModal).toBe(true);
    act(() => {
      useAuthStore.setState({ showLoginModal: false });
    });

    submitPrompt('只想普通聊天');

    expect(await screen.findByText('登录后继续')).toBeInTheDocument();
    expect(
      screen.getByText('登录后我可以继续同步这段会话、偏好和未完成步骤。'),
    ).toBeInTheDocument();
    expect(screen.queryByText('可以从这里继续')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
    expect(useAuthStore.getState().showLoginModal).toBe(false);
    expect(streamSpy).not.toHaveBeenCalled();
  });

  it('streams real assistant_delta text into the assistant-ui message flow', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const streamed = {
      ...mockResponse(),
      assistantMessage: '这是自然回复，可以继续追问。',
      cards: [],
    };
    const streamSpy = vi
      .spyOn(socialAgentApi, 'runUserFacingStream')
      .mockImplementation(async (_data, onEvent) => {
        onEvent({ type: 'assistant_delta', delta: '这是自然', source: 'llm' });
        onEvent({ type: 'assistant_delta', delta: '回复，可以继续追问。', source: 'llm' });
        onEvent({ type: 'assistant_done', source: 'llm' });
        onEvent({ type: 'result', result: streamed });
        return streamed;
      });

    await renderAgentPage();

    expect(await screen.findByRole('textbox')).toHaveAttribute('placeholder', '询问任何问题');
    expect(screen.getByTestId('assistant-ui-composer')).toHaveAttribute(
      'data-primary-action',
      'dictate',
    );
    expect(screen.getByTestId('assistant-ui-composer')).toHaveAttribute(
      'data-composer-state',
      'empty',
    );
    expect(screen.getByTestId('assistant-ui-composer')).toHaveAttribute(
      'data-auth-state',
      'signed-in',
    );
    expect(screen.getByTestId('assistant-ui-attachment-dropzone')).toHaveAttribute(
      'data-dropzone-state',
      'ready',
    );
    expect(screen.getByTestId('assistant-ui-composer-primary-actions')).toHaveAttribute(
      'data-action-model',
      'send-cancel-dictate',
    );
    expect(screen.getByTestId('assistant-ui-sidebar-account')).toHaveAttribute(
      'data-auth-state',
      'signed-in',
    );
    expect(screen.getByTestId('assistant-ui-sidebar-account')).toHaveTextContent('FitMeet');
    expect(screen.getByTestId('assistant-ui-sidebar-account')).toHaveAttribute(
      'data-sync-state',
      'synced',
    );
    fireEvent.click(screen.getByTestId('assistant-ui-sidebar-account'));
    expect(screen.getByTestId('assistant-ui-sidebar-account-menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /个人信息/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /人物画像/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Life Graph/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /待处理/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-reminder-toggle')).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('assistant-ui-sidebar-account-menu')).not.toBeInTheDocument();
    expect(screen.getByText('准备开始')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '登录后同步' })).not.toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-dictate-button')).toHaveClass('bg-transparent');
    expect(screen.getByTestId('assistant-ui-dictate-button')).toHaveClass('text-[#5d5d5d]');
    expect(screen.getByTestId('assistant-ui-dictate-button')).not.toHaveClass('bg-[#0d0d0d]');
    expect(screen.getByTestId('assistant-ui-dictate-button')).not.toHaveClass('bg-[#ff7a3d]');
    expect(screen.queryByRole('button', { name: /^Tools$/i })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '解释一下今天的训练计划' } });
    expect(screen.getByTestId('assistant-ui-composer')).toHaveAttribute(
      'data-primary-action',
      'send',
    );
    expect(screen.getByTestId('assistant-ui-composer')).toHaveAttribute(
      'data-composer-state',
      'ready',
    );
    fireEvent.submit(screen.getByRole('textbox').closest('form') as HTMLFormElement);

    await waitFor(() => expect(streamSpy).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('这是自然回复，可以继续追问。')).toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-tool-ui')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-tool-fallback')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-generative-cards')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(forbiddenUserArtifacts);

    const userMessage = document.querySelector(
      '[data-testid="assistant-ui-message"][data-role="user"]',
    );
    expect(userMessage).not.toBeNull();
    expect(userMessage).toHaveAttribute('role', 'article');
    expect(userMessage).toHaveAttribute('aria-label', '用户消息');
    expect(userMessage?.getAttribute('data-message-id') ?? '').toMatch(/^user/);
    expect(userMessage).toHaveAttribute('data-message-status', 'unknown');
    expect(userMessage).toHaveAttribute('data-message-model', 'assistant-ui-message');
    expect(userMessage).toHaveAttribute('data-message-parts-model', 'assistant-ui-message-parts');
    expect(userMessage).toHaveAttribute('data-surface', 'user-bubble');
    expect(userMessage).toHaveAttribute('data-actionbar-placement', 'inline-leading');
    expect(userMessage?.querySelector('[data-testid="assistant-ui-message-row"]')).toHaveAttribute(
      'data-row-role',
      'user',
    );
    expect(
      userMessage?.querySelector('[data-testid="assistant-ui-message-content"]'),
    ).toHaveAttribute('data-surface', 'bubble');
    expect(
      userMessage?.querySelector('[data-testid="assistant-ui-message-parts"]'),
    ).toHaveAttribute('data-supported-parts', 'text,image,data,tools');
    expect(
      userMessage?.querySelector('[data-testid="assistant-ui-message-attachments"]'),
    ).toHaveAttribute('data-attachment-model', 'message-part');
    const assistantMessage = document.querySelector(
      '[data-testid="assistant-ui-message"][data-role="assistant"]',
    );
    expect(assistantMessage).not.toBeNull();
    expect(assistantMessage).toHaveAttribute('role', 'article');
    expect(assistantMessage).toHaveAttribute('aria-label', '助手消息');
    expect(assistantMessage?.getAttribute('data-message-id') ?? '').toMatch(/^assistant/);
    expect(assistantMessage).toHaveAttribute('data-message-status', 'complete');
    expect(assistantMessage).toHaveAttribute('data-feedback-status', 'idle');
    expect(assistantMessage).toHaveAttribute('data-message-model', 'assistant-ui-message');
    expect(assistantMessage).toHaveAttribute(
      'data-message-parts-model',
      'assistant-ui-message-parts',
    );
    expect(assistantMessage).toHaveAttribute('data-surface', 'assistant-prose');
    expect(assistantMessage).toHaveAttribute('data-actionbar-placement', 'below-message');
    expect(
      assistantMessage?.querySelector('[data-testid="assistant-ui-message-content"]'),
    ).toHaveAttribute('data-surface', 'prose');
    expect(
      assistantMessage?.querySelector('[data-testid="assistant-ui-message-parts"]'),
    ).toHaveAttribute('data-parts-model', 'assistant-ui');
    expect(
      assistantMessage?.querySelector('[data-testid="assistant-ui-message-actions-row"]'),
    ).toHaveAttribute('data-actionbar-placement', 'below-message');
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument();
    fireEvent.mouseEnter(userMessage as HTMLElement);
    expect(await screen.findByRole('button', { name: '编辑' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    expect(await screen.findByTestId('assistant-ui-edit-composer')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-edit-composer-root')).toHaveClass('bg-white');
    expect(screen.getByTestId('assistant-ui-edit-composer-root')).toHaveClass('border-[#e5e5e5]');
  });

  it('merges assistant delta and final result into one assistant message for the same run', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const streamed = {
      ...mockResponse(),
      assistantMessage: '我会按今天上午、青岛大学附近、散步来继续处理。',
      assistantMessageSource: 'llm' as const,
      cards: [],
      runtime: {
        runId: 'run-single-merge',
        messageId: 'assistant-message-single-merge',
        threadId: 'agent-task:101',
      },
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({
        type: 'assistant.delta',
        eventId: 'run-single-merge:1',
        seq: 1,
        createdAt: new Date('2026-06-21T00:00:00.000Z').toISOString(),
        userId: '7',
        threadId: 'agent-task:101',
        taskId: 101,
        runId: 'run-single-merge',
        messageId: 'assistant-message-single-merge',
        stage: 'slot_filling',
        visibility: 'user_visible',
        display: { title: '正在整理你的约练需求', state: 'running' },
        payload: {
          delta: streamed.assistantMessage,
          source: 'llm',
          messageId: 'assistant-message-single-merge',
        },
      });
      onEvent({
        type: 'run.completed',
        eventId: 'run-single-merge:2',
        seq: 2,
        createdAt: new Date('2026-06-21T00:00:01.000Z').toISOString(),
        userId: '7',
        threadId: 'agent-task:101',
        taskId: 101,
        runId: 'run-single-merge',
        messageId: 'assistant-message-single-merge',
        stage: 'rank_candidates',
        visibility: 'user_visible',
        display: { title: '已整理当前进度', state: 'done' },
        payload: {
          assistantMessage: streamed.assistantMessage,
          messageId: 'assistant-message-single-merge',
        },
      });
      return streamed;
    });

    await renderAgentPage();
    await screen.findByRole('textbox');

    submitPrompt('我想在青岛大学附近今天上午找散步搭子');

    expect(await screen.findByText(streamed.assistantMessage)).toBeInTheDocument();
    const assistantMessages = Array.from(
      document.querySelectorAll('[data-testid="assistant-ui-message"][data-role="assistant"]'),
    );
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0]).toHaveAttribute('data-message-status', 'complete');
    expect(screen.getAllByText(streamed.assistantMessage)).toHaveLength(1);
    expect(screen.queryByTestId('assistant-ui-generative-cards')).not.toBeInTheDocument();
  });

  it('merges anchored assistant delta with an unanchored final result into one assistant message', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const streamed = {
      ...mockResponse(),
      assistantMessage: '明白，我会按今晚、青岛大学附近、散步这个方向继续。',
      assistantMessageSource: 'llm' as const,
      cards: [],
      runtime: undefined,
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({
        type: 'assistant.delta',
        eventId: 'run-missing-final-anchor:1',
        seq: 1,
        createdAt: new Date('2026-06-21T00:00:00.000Z').toISOString(),
        userId: '7',
        threadId: 'agent-task:101',
        taskId: 101,
        runId: 'run-missing-final-anchor',
        messageId: 'assistant-message-missing-final-anchor',
        stage: 'slot_filling',
        visibility: 'user_visible',
        display: { title: '正在整理你的约练需求', state: 'running' },
        payload: {
          delta: streamed.assistantMessage,
          source: 'llm',
          messageId: 'assistant-message-missing-final-anchor',
        },
      });
      onEvent({
        type: 'assistant_done',
        source: 'llm',
      });
      onEvent({ type: 'result', result: streamed });
      return streamed;
    });

    await renderAgentPage();
    submitPrompt('今晚青岛大学附近散步');

    expect(await screen.findByText(streamed.assistantMessage)).toBeInTheDocument();
    const assistantMessages = Array.from(
      document.querySelectorAll('[data-testid="assistant-ui-message"][data-role="assistant"]'),
    );
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0]).toHaveAttribute('data-message-status', 'complete');
    expect(screen.getAllByText(streamed.assistantMessage)).toHaveLength(1);
    expect(screen.queryByTestId('assistant-ui-branch-picker')).not.toBeInTheDocument();
    expect(screen.queryByText('2/2')).not.toBeInTheDocument();
  });

  it('dedupes replayed result cards and action groups within the same assistant run', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'updateThread').mockResolvedValue({
      thread: {
        id: '101',
        threadId: 101,
        taskId: 101,
        title: '青岛大学散步搭子',
        preview: '继续筛选候选',
        status: 'regular',
        goal: '今天上午青岛大学附近散步搭子',
        messageCount: 1,
        updatedAt: '2026-06-21T00:01:00.000Z',
        createdAt: '2026-06-21T00:01:00.000Z',
      },
    });
    const assistantMessage = '我按今天上午、青岛大学附近、散步来筛选公开可发现的人。';
    const sourceCandidateCard = mockCandidateResponse().cards[0];
    const candidateCard: UserFacingAgentResponse['cards'][number] = {
      ...sourceCandidateCard,
      id: 'candidate-replay-first-id',
      title: '陈砚',
      body: '青岛大学附近公开可发现候选。',
      data: {
        ...sourceCandidateCard.data,
        candidateRecordId: 501,
        targetUserId: 22,
        displayName: '陈砚',
        avatarUrl: '/avatars/chenyan.png',
      },
      actions: [
        {
          id: 'raw-view',
          label: 'view_candidate',
          action: 'see_more',
          schemaAction: 'candidate.view_detail',
          requiresConfirmation: false,
        },
        {
          id: 'raw-save',
          label: 'save_candidate',
          action: 'save_candidate',
          requiresConfirmation: true,
        },
        {
          id: 'raw-opener',
          label: 'generate_opener',
          action: 'generate_opener',
          requiresConfirmation: true,
        },
        {
          id: 'raw-send',
          label: 'send_invite',
          action: 'send_message',
          schemaAction: 'opener.confirm_send',
          requiresConfirmation: false,
        },
        {
          id: 'raw-connect',
          label: 'connect_candidate',
          action: 'connect_candidate',
          requiresConfirmation: false,
        },
      ],
    };
    const replayedCandidateCard: UserFacingAgentResponse['cards'][number] = {
      ...candidateCard,
      id: 'candidate-replay-second-id',
      data: {
        ...candidateCard.data,
        candidate: {
          candidateRecordId: 501,
          targetUserId: 22,
        },
      },
    };
    const streamed: UserFacingAgentResponse = {
      ...mockResponse(),
      assistantMessage,
      assistantMessageSource: 'llm',
      cards: [candidateCard, replayedCandidateCard],
      pendingConfirmations: [
        {
          id: 9011,
          type: 'approval_required',
          actionType: 'connect_candidate',
          summary: '确认后才会加好友并打开后续聊天入口。',
          riskLevel: 'medium',
          expiresAt: null,
        },
        {
          id: 9011,
          type: 'approval_required',
          actionType: 'connect_candidate',
          summary: '确认后才会加好友并打开后续聊天入口。',
          riskLevel: 'medium',
          expiresAt: null,
        },
      ],
      taskId: 101,
      workflow: mockWorkflow('run-card-replay'),
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({
        type: 'assistant.delta',
        eventId: 'run-card-replay:1',
        seq: 1,
        createdAt: new Date('2026-06-21T00:01:00.000Z').toISOString(),
        userId: '7',
        threadId: 'agent-task:101',
        taskId: 101,
        runId: 'run-card-replay',
        messageId: 'assistant-message-card-replay',
        stage: 'rank_candidates',
        visibility: 'user_visible',
        display: { title: '正在筛选公开可发现的人', state: 'running' },
        payload: {
          delta: assistantMessage,
          source: 'llm',
          messageId: 'assistant-message-card-replay',
        },
      });
      onEvent({ type: 'result', result: streamed });
      onEvent({
        type: 'result',
        result: {
          ...streamed,
          cards: [replayedCandidateCard],
          pendingConfirmations: streamed.pendingConfirmations.slice(0, 1),
        },
      });
      return streamed;
    });

    await renderAgentPage();
    await screen.findByRole('textbox');

    submitPrompt('今天上午青岛大学附近散步，帮我找搭子');

    expect(await screen.findByText(assistantMessage)).toBeInTheDocument();
    expect(screen.getAllByText(assistantMessage)).toHaveLength(1);
    expect(
      document.querySelectorAll('[data-testid="assistant-ui-message"][data-role="assistant"]'),
    ).toHaveLength(1);
    await waitFor(() => expect(screen.getAllByTestId('assistant-ui-schema-card')).toHaveLength(1));
    expect(screen.getAllByTestId('assistant-ui-unified-action-card')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: '查看详情' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: '收藏' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: '生成开场白' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: '发送邀请' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: '加好友并聊天' })).toHaveLength(1);
    expect(screen.queryByTestId('assistant-ui-inline-approval-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-branch-picker')).not.toBeInTheDocument();
    expect(screen.queryByText('2/2')).not.toBeInTheDocument();
  });

  it('keeps generic stream fallback out of assistant answers and branch variants', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const fallback = {
      ...mockResponse(),
      assistantMessage: 'FitMeet Agent 暂时没有顺利完成。我已经保留当前对话，请稍后再试。',
      assistantMessageSource: 'fallback' as const,
      cards: [],
    };
    const streamSpy = vi
      .spyOn(socialAgentApi, 'runUserFacingStream')
      .mockImplementation(async (_data, onEvent) => {
        onEvent({ type: 'result', result: fallback });
        return fallback;
      });

    await renderAgentPage();
    submitPrompt('帮我找个今晚散步搭子');

    await waitFor(() => expect(streamSpy).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId('assistant-ui-interrupt-resume')).toHaveAttribute(
      'data-kind',
      'failed',
    );
    expect(screen.getByTestId('assistant-ui-interrupt-resume')).toHaveAttribute(
      'data-recovery-surface',
      'single-line',
    );
    expect(screen.getByTestId('assistant-ui-interrupt-resume')).toHaveAttribute(
      'data-recovery-card',
      'false',
    );
    expect(screen.getByText('这段需求还在')).toBeInTheDocument();
    expect(screen.queryByText(/FitMeet Agent 暂时没有顺利完成/)).not.toBeInTheDocument();
    expect(screen.queryByText(/稍后再试/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-branch-picker')).not.toBeInTheDocument();
  });

  it('does not replace a completed assistant answer with recovery UI when the stream tail fails', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const completed = {
      ...mockResponse(),
      assistantMessage: '我明白了，会按今晚、青岛大学附近、散步这些条件继续处理。',
      assistantMessageSource: 'llm' as const,
      cards: [],
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({
        type: 'assistant_delta',
        delta: completed.assistantMessage,
        source: 'llm',
      });
      onEvent({ type: 'assistant_done', source: 'llm' });
      onEvent({ type: 'result', result: completed });
      throw Object.assign(new Error('stream tail failed'), {
        recoveryNotice: {
          kind: 'interrupted' as const,
          title: '这次处理没有完成',
          message: 'FitMeet Agent 暂时没有顺利完成。我已经保留当前对话，请稍后再试。',
          retryable: true,
          source: 'stream_error' as const,
        },
      });
    });

    await renderAgentPage();
    submitPrompt('今晚青岛大学附近散步');

    expect(await screen.findByText(completed.assistantMessage)).toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-interrupt-resume')).not.toBeInTheDocument();
    expect(screen.queryByText(/这次处理没有完成/)).not.toBeInTheDocument();
    expect(screen.queryByText(/FitMeet Agent 暂时没有顺利完成/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-branch-picker')).not.toBeInTheDocument();
  });

  it('does not render fallback assistant_delta as normal streaming answer text', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const fallback = {
      ...mockResponse(),
      assistantMessage: 'FitMeet Agent 暂时没有顺利完成。我已经保留当前对话，请稍后再试。',
      assistantMessageSource: 'fallback' as const,
      cards: [],
    };
    let resolveRun: ((value: typeof fallback) => void) | null = null;
    const streamSpy = vi
      .spyOn(socialAgentApi, 'runUserFacingStream')
      .mockImplementation(async (_data, onEvent) => {
        onEvent({
          type: 'assistant_delta',
          delta: fallback.assistantMessage,
          source: 'fallback',
        });
        onEvent({ type: 'assistant_done', source: 'fallback' });
        return await new Promise<typeof fallback>((resolve) => {
          resolveRun = resolve;
        });
      });

    await renderAgentPage();
    submitPrompt('帮我找个今晚散步搭子');

    await waitFor(() => expect(streamSpy).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/FitMeet Agent 暂时没有顺利完成/)).not.toBeInTheDocument();
    expect(screen.queryByText(/稍后再试/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-branch-picker')).not.toBeInTheDocument();

    await act(async () => {
      resolveRun?.(fallback);
    });

    expect(await screen.findByTestId('assistant-ui-interrupt-resume')).toHaveAttribute(
      'data-kind',
      'failed',
    );
    expect(screen.queryByText(/FitMeet Agent 暂时没有顺利完成/)).not.toBeInTheDocument();
  });

  it('does not turn fallback-sourced regenerations into assistant branch variants', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const firstResponse = {
      ...mockResponse(),
      assistantMessage: '我先按今晚青岛大学附近散步来理解。',
      assistantMessageSource: 'llm' as const,
      cards: [],
    };
    const fallbackResponse = {
      ...mockResponse(),
      assistantMessage: '我已经保留当前方向，等连接恢复后可以继续。',
      assistantMessageSource: 'fallback' as const,
      cards: [],
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream')
      .mockImplementationOnce(async (_data, onEvent) => {
        onEvent({
          type: 'assistant_delta',
          delta: firstResponse.assistantMessage,
          source: 'llm',
        });
        onEvent({ type: 'assistant_done', source: 'llm' });
        onEvent({ type: 'result', result: firstResponse });
        return firstResponse;
      })
      .mockImplementationOnce(async (_data, onEvent) => {
        onEvent({
          type: 'assistant_delta',
          delta: fallbackResponse.assistantMessage,
          source: 'fallback',
        });
        onEvent({ type: 'assistant_done', source: 'fallback' });
        onEvent({ type: 'result', result: fallbackResponse });
        return fallbackResponse;
      });

    await renderAgentPage();
    submitPrompt('今晚青岛大学附近散步');
    expect(await screen.findByText(firstResponse.assistantMessage)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '重新生成' }));

    expect(await screen.findByTestId('assistant-ui-interrupt-resume')).toHaveAttribute(
      'data-kind',
      'failed',
    );
    expect(screen.queryByText(fallbackResponse.assistantMessage)).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-branch-picker')).not.toBeInTheDocument();
    expect(screen.queryByText('2/2')).not.toBeInTheDocument();
  });

  it('renders structured recoveryNotice as a recovery state instead of an assistant answer', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'listThreads').mockResolvedValue({ threads: [] });
    const recoveryResponse = {
      ...mockResponse(),
      assistantMessage: '',
      assistantMessageSource: 'fallback' as const,
      recoveryNotice: {
        kind: 'timeout' as const,
        title: '这次处理时间有点久',
        message: '可以继续处理，也可以补充新的要求。',
        retryable: true,
        source: 'stream_error' as const,
      },
      cards: [],
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({ type: 'result', result: recoveryResponse });
      return recoveryResponse;
    });

    await renderAgentPage();
    submitPrompt('继续帮我找青岛大学附近散步搭子');

    const recovery = await screen.findByTestId('assistant-ui-interrupt-resume');
    expect(recovery).toHaveAttribute('data-kind', 'failed');
    expect(recovery).toHaveTextContent('这段需求还在');
    expect(recovery).toHaveTextContent('可以继续处理，也可以补充新的要求。');
    expect(recovery).not.toHaveTextContent('这次处理时间有点久');
    expect(
      screen.queryByText('我整理好了，可以继续追问或让我接着处理下一步。'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-branch-picker')).not.toBeInTheDocument();
  });

  it('replaces generic fallback copy with product guidance when useful approval state exists', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const fallbackWithApproval = {
      ...mockResponse(),
      assistantMessage: 'FitMeet Agent 暂时没有顺利完成。我已经保留当前对话，请稍后再试。',
      assistantMessageSource: 'fallback' as const,
      pendingConfirmations: [
        {
          id: 88,
          type: 'action',
          actionType: 'connect_candidate',
          summary: '连接候选人之前先确认。',
          riskLevel: 'high',
          expiresAt: null,
        },
      ],
      cards: [],
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({ type: 'result', result: fallbackWithApproval });
      return fallbackWithApproval;
    });

    await renderAgentPage();
    submitPrompt('帮我发送邀请');

    expect(
      await screen.findByText('我把需要你确认的内容放在下面，确认前不会执行真实动作。'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/FitMeet Agent 暂时没有顺利完成/)).not.toBeInTheDocument();
    expect(screen.queryByText(/稍后再试/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-branch-picker')).not.toBeInTheDocument();
  });

  it('shows useful social cards instead of a recovery card when fallback includes recoverable card data', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'listThreads').mockResolvedValue({ threads: [] });
    const fallbackWithCards: UserFacingAgentResponse = {
      ...mockCandidateResponse(),
      assistantMessage: 'FitMeet Agent 暂时没有顺利完成。我已经保留当前对话，请稍后再试。',
      assistantMessageSource: 'fallback',
      recoveryNotice: {
        kind: 'interrupted',
        title: '这次处理没有完成',
        message: '可以继续处理，也可以补充新的要求。',
        retryable: true,
        source: 'stream_error',
      },
      cards: mockCandidateResponse().cards.map((card) => ({
        ...card,
        id: `useful-recovery-${card.id}`,
      })),
      pendingConfirmations: [],
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({ type: 'result', result: fallbackWithCards });
      return fallbackWithCards;
    });

    await renderAgentPage();
    submitPrompt('继续帮我找青岛大学附近散步搭子');

    expect(
      await screen.findByText('我把整理好的结果放在下面，你可以查看后再决定下一步。'),
    ).toBeInTheDocument();
    expect(await screen.findByTestId('assistant-ui-generative-cards')).toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-interrupt-resume')).not.toBeInTheDocument();
    expect(screen.queryByText(/FitMeet Agent 暂时没有顺利完成/)).not.toBeInTheDocument();
    expect(screen.queryByText('这次处理没有完成')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-branch-picker')).not.toBeInTheDocument();
  });

  it('shows schema-driven cards instead of a recovery card when fallback includes new Tool UI data', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'listThreads').mockResolvedValue({ threads: [] });
    const fallbackWithSchemaCards: UserFacingAgentResponse = {
      ...mockResponse(),
      assistantMessage: 'FitMeet Agent 暂时没有顺利完成。我已经保留当前对话，请稍后再试。',
      assistantMessageSource: 'fallback',
      recoveryNotice: {
        kind: 'interrupted',
        title: '这次处理没有完成',
        message: '可以继续处理，也可以补充新的要求。',
        retryable: true,
        source: 'stream_error',
      },
      cards: [
        {
          id: 'schema-candidate-card-1',
          type: 'tool_ui',
          title: '陈砚',
          body: '公开资料里有散步和编程兴趣，可以先低压力认识。',
          status: 'ready',
          data: {
            taskId: 101,
            schemaName: 'OpportunityCard',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'social_match.candidate',
            candidateRecordId: 501,
            displayName: '陈砚',
            sharedInterests: ['散步', '编程'],
            fitReasons: ['青岛大学附近', '今天上午可尝试'],
          },
          actions: [],
        } as unknown as UserFacingAgentResponse['cards'][number],
      ],
      pendingConfirmations: [],
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({ type: 'result', result: fallbackWithSchemaCards });
      return fallbackWithSchemaCards;
    });

    await renderAgentPage();
    submitPrompt('继续帮我找青岛大学附近散步搭子');

    expect(
      await screen.findByText('我把整理好的结果放在下面，你可以查看后再决定下一步。'),
    ).toBeInTheDocument();
    expect(await screen.findByTestId('assistant-ui-generative-cards')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-generative-cards')).toHaveAttribute(
      'data-card-density',
      'single-product',
    );
    expect(screen.getByTestId('assistant-ui-generative-cards')).not.toHaveTextContent(
      '候选、约练和真实动作都按结构化卡片展示',
    );
    expect(screen.getByText('陈砚')).toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-interrupt-resume')).not.toBeInTheDocument();
    expect(screen.queryByText('这次处理没有完成')).not.toBeInTheDocument();
  });

  it('uses structured SSE error recoveryNotice when a stream fails before result', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'listThreads').mockResolvedValue({ threads: [] });
    const error = Object.assign(new Error('FitMeet Agent 暂时没有顺利完成'), {
      recoveryNotice: {
        kind: 'interrupted' as const,
        title: '排序步骤暂时没有完成',
        message: '当前操作未完成。我已经保留当前对话，可以稍后再试。',
        retryable: true,
        source: 'stream_error' as const,
      },
    });
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockRejectedValue(error);

    await renderAgentPage();
    submitPrompt('今晚青岛大学附近散步，继续帮我找人');

    const recovery = await screen.findByTestId('assistant-ui-interrupt-resume');
    expect(recovery).toHaveAttribute('data-kind', 'failed');
    expect(recovery).toHaveAttribute('data-display-model', 'lightweight-inline-recovery');
    expect(recovery).toHaveAttribute('data-recovery-surface', 'single-line');
    expect(recovery).toHaveAttribute('data-recovery-card', 'false');
    expect(recovery).toHaveTextContent('这段需求还在');
    expect(recovery).toHaveTextContent('可以继续处理，我会从这里接着处理；也可以补充新的要求。');
    expect(recovery).toHaveTextContent('刚才说到：今晚青岛大学附近散步，继续帮我找人');
    expect(recovery).not.toHaveTextContent('这次处理没有完成');
    expect(recovery).not.toHaveTextContent('排序步骤暂时没有完成');
    expect(recovery).not.toHaveTextContent('当前操作未完成');
    expect(recovery).not.toHaveTextContent('FitMeet Agent 暂时没有顺利完成');
    expect(screen.queryByText('服务暂时不可用')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-branch-picker')).not.toBeInTheDocument();
  });

  it('keeps subsequent messages in the backend thread returned by the public task result', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'listThreads').mockResolvedValue({ threads: [] });
    const createThreadSpy = vi.spyOn(socialAgentApi, 'createThread').mockResolvedValue({
      thread: {
        id: 'should-not-create-thread',
        threadId: 999,
        taskId: 999,
        title: '不应创建的新对话',
        preview: null,
        status: 'awaiting_feedback',
        goal: '',
        messageCount: 0,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    });
    const firstResponse = {
      ...mockResponse(),
      taskId: 101,
      assistantMessage: '我记住了，这段会话会继续沿用同一个 thread。',
      cards: [],
      workflow: mockWorkflow('social-thread-stable-1'),
    };
    const secondResponse = {
      ...mockResponse(),
      taskId: 101,
      assistantMessage: '继续在同一段会话里处理。',
      cards: [],
      workflow: mockWorkflow('social-thread-stable-1'),
    };
    const streamSpy = vi
      .spyOn(socialAgentApi, 'runUserFacingStream')
      .mockImplementationOnce(async (_data, onEvent) => {
        onEvent({ type: 'result', result: firstResponse });
        return firstResponse;
      })
      .mockImplementationOnce(async (_data, onEvent) => {
        onEvent({ type: 'result', result: secondResponse });
        return secondResponse;
      });

    await renderAgentPage();
    await screen.findByRole('textbox');
    submitPrompt('周末下午想散步');
    expect(await screen.findByText(firstResponse.assistantMessage)).toBeInTheDocument();

    submitPrompt('可以，继续帮我找人');
    expect(await screen.findByText(secondResponse.assistantMessage)).toBeInTheDocument();
    expect(screen.getAllByText(secondResponse.assistantMessage)).toHaveLength(1);

    expect(streamSpy).toHaveBeenCalledTimes(2);
    expect(streamSpy.mock.calls[1]?.[0]).toMatchObject({
      clientContext: expect.objectContaining({
        threadId: 'agent-task:101',
      }),
    });
    expect(createThreadSpy).not.toHaveBeenCalled();
  });

  it('keeps subsequent messages in the thread announced by an early status event', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'listThreads').mockResolvedValue({ threads: [] });
    const streamSpy = vi
      .spyOn(socialAgentApi, 'runUserFacingStream')
      .mockImplementation(async (_data, onEvent) => {
        onEvent({
          type: 'status',
          lightStatus: '正在理解你的需求',
          taskId: 88,
          threadId: 'agent-task:88',
        });
        return {
          ...mockResponse(),
          assistantMessage: '我已经沿着这段对话继续。',
          cards: [],
        };
      });

    await renderAgentPage();
    await screen.findByRole('textbox');
    submitPrompt('今晚青岛大学附近散步');
    expect(await screen.findByText('我已经沿着这段对话继续。')).toBeInTheDocument();

    submitPrompt('可以，帮我继续找人');
    await waitFor(() => expect(streamSpy).toHaveBeenCalledTimes(2));

    expect(streamSpy.mock.calls[1]?.[0]).toMatchObject({
      taskId: 88,
      clientContext: expect.objectContaining({
        threadId: 'agent-task:88',
      }),
    });
  });

  it('renders Social Codex visible process trace inside the assistant message without business cards', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const streamed = {
      ...mockResponse(),
      assistantMessage: '我会按这些信息继续帮你整理。',
      cards: [],
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({
        type: 'visible_process.delta',
        eventId: 'run-visible:1',
        seq: 1,
        createdAt: '2026-06-17T00:00:00.000Z',
        userId: '7',
        threadId: 'agent-thread-1',
        taskId: 42,
        runId: 'run-visible',
        stage: 'hydrate_context',
        visibility: 'user_visible',
        display: {
          title: '正在读取你的偏好',
          state: 'running',
        },
      });
      onEvent({
        type: 'slot.completed',
        eventId: 'run-visible:2',
        seq: 2,
        createdAt: '2026-06-17T00:00:01.000Z',
        userId: '7',
        threadId: 'agent-thread-1',
        taskId: 42,
        runId: 'run-visible',
        stage: 'slot_filling',
        visibility: 'user_visible',
        display: {
          title: '',
          state: 'done',
        },
        payload: {
          slots: {
            time_window: '周末下午',
            activity: '散步',
            location_text: '青岛大学附近',
          },
        },
      });
      onEvent({
        type: 'candidate_search.done',
        eventId: 'run-visible:3',
        seq: 3,
        createdAt: '2026-06-17T00:00:02.000Z',
        userId: '7',
        threadId: 'agent-thread-1',
        taskId: 42,
        runId: 'run-visible',
        stage: 'search_candidates',
        visibility: 'user_visible',
        display: {
          title: '',
          state: 'done',
        },
        payload: {
          candidateCount: 3,
        },
      });
      onEvent({
        type: 'memory.saved',
        eventId: 'run-visible:4',
        seq: 4,
        createdAt: '2026-06-17T00:00:03.000Z',
        userId: '7',
        threadId: 'agent-thread-1',
        taskId: 42,
        runId: 'run-visible',
        stage: 'life_graph_writeback',
        visibility: 'user_visible',
        display: {
          title: '这些信息下次会继续使用',
          state: 'done',
        },
        payload: {
          lifeGraphFacts: [
            {
              key: 'preferred_activity',
              label: '常见活动偏好',
              displayValue: '散步',
              evidenceCount: 1,
            },
            {
              key: 'first_meet_safety_boundary',
              label: '首次见面安全边界',
              displayValue: '公共场所优先',
              evidenceCount: 1,
            },
          ],
        },
      });
      onEvent({ type: 'assistant_delta', delta: '我会按这些信息继续帮你整理。', source: 'llm' });
      onEvent({ type: 'assistant_done', source: 'llm' });
      onEvent({ type: 'result', result: streamed });
      return streamed;
    });

    await renderAgentPage();
    await screen.findByRole('textbox');

    submitPrompt('周末下午，散步，崂山区青岛大学');

    expect(await screen.findByText('我会按这些信息继续帮你整理。')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-shell')).toHaveAttribute(
      'data-active-thread-id',
      'agent-thread-1',
    );
    expect(screen.queryByTestId('assistant-ui-tool-ui')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-process-timeline')).not.toBeInTheDocument();
    const processSteps = screen.queryAllByTestId('assistant-ui-process-step');
    const socialCodexSteps = processSteps.filter((step) =>
      (step.getAttribute('data-step-id') ?? '').startsWith('social-codex:'),
    );
    expect(socialCodexSteps.length).toBeLessThanOrEqual(1);
    const visibleStepLabels = socialCodexSteps.map((step) => step.textContent ?? '');
    expect(new Set(visibleStepLabels).size).toBe(visibleStepLabels.length);
    expect(document.body.textContent ?? '').not.toContain('run-visible:');
    expect(document.body.textContent ?? '').not.toContain('这些信息下次会继续使用查看过程');
    expect(document.body.textContent ?? '').not.toContain('正在读取你的偏好已完成');
    expect(document.body.textContent ?? '').not.toContain('正在筛选公开可发现的人已完成');
    expect(screen.queryByTestId('assistant-ui-generative-cards')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(forbiddenUserArtifacts);
  });

  it('renders legacy tool stream events as one replaceable status instead of a visible timeline', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const streamed = {
      ...mockResponse(),
      assistantMessage: '我会继续按公开可发现范围筛选。',
      cards: [],
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({
        type: 'agent_loop_step',
        lifecycle: 'searching_candidates',
        stepId: 'rank.candidates:2',
        phase: 'tool',
        agentName: 'Social Match Agent',
        toolName: 'social_match_search_turn',
        status: 'running',
        title: '正在筛选公开可发现的人',
        detail: '正在筛选公开可发现的人',
      });
      onEvent({
        type: 'tool_call',
        lifecycle: 'searching_candidates',
        stepId: 'rank.candidates:2',
        agentName: 'Social Match Agent',
        toolName: 'social_match_search_turn',
        title: '正在处理这一步',
        detail: '正在筛选公开可发现的人',
      });
      onEvent({
        type: 'tool_result',
        lifecycle: 'searching_candidates',
        stepId: 'rank.candidates:2',
        agentName: 'Social Match Agent',
        toolName: 'social_match_search_turn',
        title: '已筛选公开可发现的人',
        detail: '正在筛选公开可发现的人',
        status: 'done',
      });
      onEvent({
        type: 'progress',
        lifecycle: 'searching_candidates',
        id: 'rank.candidates:2',
        kind: 'tool',
        title: '正在处理这一步',
        detail: '正在筛选公开可发现的人',
        state: 'done',
        metadata: {
          stepId: 'rank.candidates:2',
          agentName: 'Social Match Agent',
          toolName: 'social_match_search_turn',
        },
      });
      onEvent({
        type: 'assistant_delta',
        delta: streamed.assistantMessage,
        source: 'llm',
      });
      onEvent({ type: 'assistant_done', source: 'llm' });
      onEvent({ type: 'result', result: streamed });
      return streamed;
    });

    await renderAgentPage();
    await screen.findByRole('textbox');

    submitPrompt('周末下午帮我找青岛大学附近散步搭子');

    expect(await screen.findByText(streamed.assistantMessage)).toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-tool-ui')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-process-evidence')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('assistant-ui-process-step')).toHaveLength(0);
    expect(document.body.textContent ?? '').not.toMatch(
      /tool_call|tool_result|Social Match Agent|social_match_search_turn/i,
    );
  });

  it('does not render an approval card for non-risky clarification waiting steps', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      const response = {
        ...mockResponse(),
        assistantMessage:
          '我先确认一下，你更倾向于在青岛哪个区域活动？知道大概范围后，我再帮你看合适机会。',
        cards: [],
        pendingConfirmations: [],
      };
      onEvent({
        type: 'progress',
        id: 'clarify-area',
        kind: 'analysis',
        title: '确认需要补充的信息',
        detail: '等待用户补充大致区域',
        state: 'waiting',
        metadata: { phase: 'clarify_social_intent' },
      });
      onEvent({ type: 'result', result: response });
      return response;
    });

    await renderAgentPage();
    submitPrompt('我想在青岛周末下午找一个轻松羽毛球搭子，只接受公开场所。');

    expect(await screen.findByText(/更倾向于在青岛哪个区域/)).toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();
    expect(screen.queryByText('需要你确认这一步')).not.toBeInTheDocument();
  });

  it('shows a lightweight assistant thinking state before the first token arrives', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const streamed = {
      ...mockResponse(),
      assistantMessage: '我在，这个问题可以继续聊。',
      cards: [],
    };
    let resolveStream!: () => void;
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(
      (_data, onEvent) =>
        new Promise<UserFacingAgentResponse>((resolve) => {
          resolveStream = () => {
            onEvent({
              type: 'assistant_delta',
              delta: '我在，这个问题可以继续聊。',
              source: 'llm',
            });
            onEvent({ type: 'assistant_done', source: 'llm' });
            onEvent({ type: 'result', result: streamed });
            resolve(streamed);
          };
        }),
    );

    await renderAgentPage();

    submitPrompt('普通聊聊，不需要找人');

    expect(await screen.findByTestId('assistant-ui-thinking')).toBeInTheDocument();
    expect(await screen.findByText('正在理解你的需求…')).toBeInTheDocument();
    expect(screen.queryByText('正在理解你的问题…')).not.toBeInTheDocument();
    expect(screen.queryByText('正在组织自然回复')).not.toBeInTheDocument();
    expect(screen.queryByText('正在检查必要边界')).not.toBeInTheDocument();
    const process = screen.getByTestId('assistant-ui-tool-ui');
    expect(process).toHaveAttribute('data-process-summary-source', 'local.covering_status');
    expect(process).toHaveAttribute('data-process-rendering', 'covering-status');
    expect(process).toHaveAttribute('data-process-clickable', 'false');
    expect(process).toHaveAttribute('data-process-history-count', '0');
    expect(screen.queryByTestId('assistant-ui-process-detail')).not.toBeInTheDocument();
    expect(screen.queryByText('正在整理执行轨迹')).not.toBeInTheDocument();

    await act(async () => {
      resolveStream();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.queryByTestId('assistant-ui-thinking')).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('正在整理执行轨迹')).not.toBeInTheDocument();
    expect(screen.queryByText('正在理解你的需求…')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-tool-ui')).not.toBeInTheDocument();
  });

  it('uses one covering process status for social/tool runs instead of duplicating inline thinking', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const streamed = {
      ...mockResponse(),
      assistantMessage: '我会先按你的条件整理机会。',
      cards: [],
    };
    let resolveStream!: () => void;
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(
      (_data, onEvent) =>
        new Promise<UserFacingAgentResponse>((resolve) => {
          resolveStream = () => {
            onEvent({
              type: 'assistant_delta',
              delta: streamed.assistantMessage,
              source: 'llm',
            });
            onEvent({ type: 'assistant_done', source: 'llm' });
            onEvent({ type: 'result', result: streamed });
            resolve(streamed);
          };
        }),
    );

    await renderAgentPage();

    submitPrompt('周末下午想找青岛大学附近的散步搭子');

    const process = await screen.findByTestId('assistant-ui-tool-ui');
    expect(process).toHaveAttribute('data-process-mainline', 'latest-visible-summary');
    expect(process).toHaveAttribute('data-process-default-visible-count', '1');
    expect(within(process).getByTestId('assistant-ui-process-status-line')).toHaveTextContent(
      /正在(理解你的需求|整理你的约练需求)/,
    );
    expect(screen.queryByTestId('assistant-ui-inline-thinking')).not.toBeInTheDocument();
    expect(screen.queryByText('正在理解你的需求…')).not.toBeInTheDocument();

    await act(async () => {
      resolveStream();
      await Promise.resolve();
    });

    expect(await screen.findByText('我会先按你的条件整理机会。')).toBeInTheDocument();
  });

  it('treats legacy progress events as a single covering status instead of a tool timeline', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const streamed = {
      ...mockResponse(),
      assistantMessage: '我会按这个方向继续。',
      cards: [],
    };
    let resolveStream!: () => void;
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(
      (_data, onEvent) =>
        new Promise<UserFacingAgentResponse>((resolve) => {
          onEvent({
            type: 'progress',
            id: 'legacy-understand',
            kind: 'analysis',
            title: '正在理解你的需求',
            state: 'running',
          });
          onEvent({
            type: 'progress',
            id: 'legacy-search',
            kind: 'tool',
            title: '正在筛选公开可发现的人',
            detail: '我会优先按你刚说的地点和时间处理。',
            state: 'running',
          });
          resolveStream = () => {
            onEvent({
              type: 'assistant_delta',
              delta: streamed.assistantMessage,
              source: 'llm',
            });
            onEvent({ type: 'assistant_done', source: 'llm' });
            onEvent({ type: 'result', result: streamed });
            resolve(streamed);
          };
        }),
    );

    await renderAgentPage();
    await screen.findByRole('textbox');

    submitPrompt('今晚青岛大学附近散步，帮我找人');

    const process = await screen.findByTestId('assistant-ui-tool-ui');
    expect(process).toHaveAttribute('data-process-rendering', 'covering-status');
    expect(process).toHaveAttribute('data-process-display-mode', 'covering_status');
    expect(process).toHaveAttribute('data-process-summary-update-model', 'latest_state');
    expect(process).toHaveAttribute('data-process-default-visible-count', '1');
    expect(process).toHaveAttribute('data-process-history-visibility', 'collapsed');
    expect(process).toHaveAttribute('data-process-step-count', '1');
    expect(process).not.toHaveAttribute('open');
    const statusLine = within(process).getByTestId('assistant-ui-process-status-line');
    expect(statusLine).toHaveTextContent('正在筛选公开可发现的人');
    expect(statusLine).not.toHaveTextContent('正在理解你的需求');
    expect(statusLine).not.toHaveTextContent('我会优先按你刚说的地点和时间处理。');
    expect(screen.queryAllByTestId('assistant-ui-process-step')).toHaveLength(0);
    expect(screen.queryByTestId('assistant-ui-process-timeline')).not.toBeInTheDocument();

    await act(async () => {
      resolveStream();
      await Promise.resolve();
    });

    expect(await screen.findByText(streamed.assistantMessage)).toBeInTheDocument();
  });

  it('renders the latest visible process as the single message-owned status before tokens arrive', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const streamed = {
      ...mockResponse(),
      assistantMessage: '我会先按你说的条件继续处理。',
      cards: [],
    };
    let resolveStream!: () => void;
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(
      (_data, onEvent) =>
        new Promise<UserFacingAgentResponse>((resolve) => {
          onEvent({
            type: 'visible_process.delta',
            eventId: 'visible-before-token:1',
            seq: 1,
            createdAt: '2026-06-17T00:00:00.000Z',
            userId: '7',
            threadId: 'agent-thread-1',
            taskId: 42,
            runId: 'visible-before-token',
            stage: 'hydrate_context',
            visibility: 'user_visible',
            display: {
              title: '正在读取你的偏好',
              state: 'running',
            },
          });
          onEvent({
            type: 'slot.completed',
            eventId: 'visible-before-token:2',
            seq: 2,
            createdAt: '2026-06-17T00:00:01.000Z',
            userId: '7',
            threadId: 'agent-thread-1',
            taskId: 42,
            runId: 'visible-before-token',
            stage: 'slot_filling',
            visibility: 'user_visible',
            display: {
              title: '已记录你的关键信息',
              detail: '今天晚上、散步、青岛大学附近',
              state: 'done',
            },
            payload: {
              slots: {
                time_window: '今天晚上',
                activity: '散步',
                location_text: '青岛大学附近',
              },
            },
          });
          resolveStream = () => {
            onEvent({
              type: 'assistant_delta',
              delta: streamed.assistantMessage,
              source: 'llm',
            });
            onEvent({ type: 'assistant_done', source: 'llm' });
            onEvent({ type: 'result', result: streamed });
            resolve(streamed);
          };
        }),
    );

    await renderAgentPage();
    await screen.findByRole('textbox');

    submitPrompt('今晚青岛大学附近散步');

    const process = await screen.findByTestId('assistant-ui-tool-ui');
    expect(process).toHaveAttribute('data-process-rendering', 'covering-status');
    expect(process).toHaveAttribute('data-process-mainline', 'latest-visible-summary');
    expect(process).toHaveAttribute('data-process-default-visible-count', '1');
    expect(process).toHaveAttribute('data-process-display-mode', 'covering_status');
    expect(process).toHaveAttribute('data-process-summary-update-model', 'latest_state');
    expect(process).toHaveAttribute(
      'data-process-visible-title',
      '已确认：今天晚上、散步、青岛大学附近',
    );
    expect(process).not.toHaveAttribute('open');
    const statusLine = within(process).getByTestId('assistant-ui-process-status-line');
    expect(statusLine).toHaveAttribute('data-process-line', 'latest-visible-summary');
    expect(statusLine).toHaveAttribute('data-process-inline-detail', 'collapsed');
    expect(statusLine).toHaveTextContent('已确认：今天晚上、散步、青岛大学附近');
    expect(screen.queryByTestId('assistant-ui-inline-thinking')).not.toBeInTheDocument();
    expect(screen.queryByText('正在读取你的偏好…')).not.toBeInTheDocument();
    expect(screen.queryByText('正在组织回复…')).not.toBeInTheDocument();

    await act(async () => {
      resolveStream();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.queryByTestId('assistant-ui-thinking')).not.toBeInTheDocument(),
    );
    expect(screen.getByText(streamed.assistantMessage)).toBeInTheDocument();
  });

  it('keeps live Social Codex process events as one covering status while the run is still streaming', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const streamed = {
      ...mockResponse(),
      assistantMessage: '我会按这个方向继续找。',
      cards: [],
    };
    let resolveStream!: () => void;
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(
      (_data, onEvent) =>
        new Promise<UserFacingAgentResponse>((resolve) => {
          onEvent({
            type: 'visible_process.delta',
            eventId: 'covering-live:1',
            seq: 1,
            createdAt: '2026-06-17T00:00:00.000Z',
            userId: '7',
            threadId: 'agent-thread-1',
            taskId: 42,
            runId: 'covering-live',
            stage: 'hydrate_context',
            visibility: 'user_visible',
            display: {
              title: '正在读取你的偏好',
              state: 'running',
            },
          });
          onEvent({
            type: 'slot.completed',
            eventId: 'covering-live:2',
            seq: 2,
            createdAt: '2026-06-17T00:00:01.000Z',
            userId: '7',
            threadId: 'agent-thread-1',
            taskId: 42,
            runId: 'covering-live',
            stage: 'slot_filling',
            visibility: 'user_visible',
            display: {
              title: '已记住：今晚、散步、青岛大学附近',
              state: 'done',
            },
            payload: {
              slots: {
                time_window: '今晚',
                activity: '散步',
                location_text: '青岛大学附近',
              },
            },
          });
          onEvent({
            type: 'candidate_search.started',
            eventId: 'covering-live:3',
            seq: 3,
            createdAt: '2026-06-17T00:00:02.000Z',
            userId: '7',
            threadId: 'agent-thread-1',
            taskId: 42,
            runId: 'covering-live',
            stage: 'search_candidates',
            visibility: 'user_visible',
            display: {
              title: '正在筛选公开可发现的人',
              detail: '我会优先使用你刚补充的时间、地点和活动。',
              state: 'running',
            },
          });
          resolveStream = () => {
            onEvent({
              type: 'assistant_delta',
              delta: streamed.assistantMessage,
              source: 'llm',
            });
            onEvent({ type: 'assistant_done', source: 'llm' });
            onEvent({ type: 'result', result: streamed });
            resolve(streamed);
          };
        }),
    );

    await renderAgentPage();
    await screen.findByRole('textbox');

    submitPrompt('今晚青岛大学附近散步，帮我找公开可发现的人');

    const process = await screen.findByTestId('assistant-ui-tool-ui');
    expect(process).toHaveAttribute('data-process-display', 'compact');
    expect(process).toHaveAttribute('data-process-surface', 'single-line-status');
    expect(process).toHaveAttribute('data-process-rendering', 'covering-status');
    expect(process).toHaveAttribute('data-process-mainline', 'latest-visible-summary');
    expect(process).toHaveAttribute('data-process-default-visible-count', '1');
    expect(process).toHaveAttribute('data-process-display-mode', 'covering_status');
    expect(process).toHaveAttribute('data-process-summary-update-model', 'latest_state');
    expect(process).toHaveAttribute('data-process-step-count', '1');
    expect(process).toHaveAttribute('data-process-visible-title', '正在筛选公开可发现的人');
    expect(process).not.toHaveAttribute('open');
    const statusLine = within(process).getByTestId('assistant-ui-process-status-line');
    expect(statusLine).toHaveAttribute('data-process-inline-detail', 'collapsed');
    expect(statusLine).toHaveTextContent('正在筛选公开可发现的人');
    expect(statusLine).not.toHaveTextContent('我会优先使用你刚补充的时间、地点和活动。');
    expect(statusLine).not.toHaveTextContent('正在读取你的偏好');
    expect(statusLine).not.toHaveTextContent('已记住：今晚、散步、青岛大学附近');
    expect(screen.queryAllByTestId('assistant-ui-process-step')).toHaveLength(0);
    expect(screen.queryByTestId('assistant-ui-process-timeline')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/covering-live|hydrate_context|slot_filling|search_candidates/),
    ).not.toBeInTheDocument();
    expect(within(process).queryByText('查看过程')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-process-detail')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-process-evidence')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('assistant-ui-process-step')).toHaveLength(0);

    await act(async () => {
      resolveStream();
      await Promise.resolve();
    });

    expect(await screen.findByText(streamed.assistantMessage)).toBeInTheDocument();
  });

  it('prioritizes live approval over the previous covering process status', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const streamed = {
      ...mockResponse(),
      assistantMessage: '我会等你确认后再继续。',
      cards: [],
    };
    let resolveStream!: () => void;
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(
      (_data, onEvent) =>
        new Promise<UserFacingAgentResponse>((resolve) => {
          onEvent({
            type: 'candidate_search.started',
            eventId: 'approval-live:1',
            seq: 1,
            createdAt: '2026-06-17T00:00:00.000Z',
            userId: '7',
            threadId: 'agent-thread-1',
            taskId: 42,
            runId: 'approval-live',
            stage: 'search_candidates',
            visibility: 'user_visible',
            display: {
              title: '正在筛选公开可发现的人',
              state: 'running',
            },
          });
          onEvent({
            type: 'approval.required',
            eventId: 'approval-live:2',
            seq: 2,
            createdAt: '2026-06-17T00:00:01.000Z',
            userId: '7',
            threadId: 'agent-thread-1',
            taskId: 42,
            runId: 'approval-live',
            stage: 'approval',
            visibility: 'user_visible',
            display: {
              title: '发送邀请前需要你确认',
              detail: '确认前不会联系对方。',
              state: 'waiting',
            },
            payload: {
              approvalId: 'approve-live-1',
              actionType: 'send_invite',
              riskLevel: 'medium',
            },
          });
          resolveStream = () => {
            onEvent({
              type: 'assistant_delta',
              delta: streamed.assistantMessage,
              source: 'llm',
            });
            onEvent({ type: 'assistant_done', source: 'llm' });
            onEvent({ type: 'result', result: streamed });
            resolve(streamed);
          };
        }),
    );

    await renderAgentPage();
    await screen.findByRole('textbox');

    submitPrompt('帮我给候选人发邀请');

    const process = await screen.findByTestId('assistant-ui-tool-ui');
    expect(process).toHaveAttribute('data-process-rendering', 'covering-status');
    expect(process).toHaveAttribute('data-process-mainline', 'latest-visible-summary');
    expect(process).toHaveAttribute('data-process-default-visible-count', '1');
    expect(process).toHaveAttribute('data-process-visible-title', '发送邀请前需要你确认');
    const statusLine = within(process).getByTestId('assistant-ui-process-status-line');
    expect(statusLine).toHaveTextContent('发送邀请前需要你确认');
    expect(statusLine).not.toHaveTextContent('正在筛选公开可发现的人');
    expect(screen.queryAllByTestId('assistant-ui-process-step')).toHaveLength(0);
    expect(screen.queryByTestId('assistant-ui-process-timeline')).not.toBeInTheDocument();

    await act(async () => {
      resolveStream();
      await Promise.resolve();
    });

    expect(await screen.findByText(streamed.assistantMessage)).toBeInTheDocument();
  });

  it('shows a local GPT-style covering status when the live stream is silent', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const streamed = {
      ...mockResponse(),
      assistantMessage: '我会继续按这些信息处理。',
      cards: [],
    };
    let resolveStream: (() => void) | null = null;
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(
      async (_data, onEvent) =>
        new Promise<UserFacingAgentResponse>((resolve) => {
          resolveStream = () => {
            onEvent({ type: 'assistant_delta', delta: streamed.assistantMessage, source: 'llm' });
            onEvent({ type: 'assistant_done', source: 'llm' });
            onEvent({ type: 'result', result: streamed });
            resolve(streamed);
          };
        }),
    );

    await renderAgentPage();
    await screen.findByRole('textbox');

    submitPrompt('今晚青岛大学附近散步，帮我找公开可发现的人');

    const process = await screen.findByTestId('assistant-ui-tool-ui');
    expect(process).toHaveAttribute('data-process-rendering', 'covering-status');

    await waitFor(
      () => {
        expect(process).toHaveAttribute('data-process-summary-source', 'local.covering_status');
      },
      { timeout: 2000 },
    );

    expect(process).toHaveAttribute('data-process-display', 'compact');
    expect(process).toHaveAttribute('data-process-surface', 'single-line-status');
    expect(process).toHaveAttribute('data-process-mainline', 'latest-visible-summary');
    expect(process).toHaveAttribute('data-process-default-visible-count', '1');
    expect(process).toHaveAttribute('data-process-history-visibility', 'collapsed');
    expect(process).toHaveAttribute('data-process-step-count', '1');
    expect(process).toHaveAttribute('data-process-history-count', '0');
    expect(process).toHaveAttribute('data-process-clickable', 'false');

    const statusLine = within(process).getByTestId('assistant-ui-process-status-line');
    expect(statusLine).toHaveAttribute('aria-live', 'polite');
    expect(statusLine).toHaveAttribute('data-process-inline-detail', 'collapsed');
    expect(statusLine).toHaveTextContent('正在整理你的约练需求');
    expect(statusLine).not.toHaveTextContent('我会按你已经说的信息继续处理');
    expect(within(process).queryByText('查看过程')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-process-evidence')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('assistant-ui-process-step')).toHaveLength(0);

    await act(async () => {
      resolveStream?.();
      await Promise.resolve();
    });
    expect(await screen.findByText(streamed.assistantMessage)).toBeInTheDocument();
  });

  it('renders assistant markdown with ChatGPT-like message structure', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite },
    });
    const markdownReply = [
      '### 训练安排',
      '',
      '- 热身 8 分钟',
      '- 慢跑 20 分钟',
      '',
      '- [x] 确认今天目标',
      '- [ ] 等待你确认时间',
      '',
      '参考 [FitMeet](https://www.ourfitmeet.cn)，不要打开 [危险链接](javascript:alert(1))。',
      '也可以直接访问 https://www.ourfitmeet.cn/agent/chat。',
      '',
      '| 项目 | 建议 |',
      '| --- | --- |',
      '| 强度 | 轻松跑 |',
      '| 时长 | 20 分钟 |',
      '',
      '---',
      '',
      '```ts',
      'const pace = "easy";',
      '```',
    ].join('\n');
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({
        type: 'assistant_delta',
        delta:
          '### 训练安排\n\n- 热身 8 分钟\n- 慢跑 20 分钟\n\n- [x] 确认今天目标\n- [ ] 等待你确认时间\n\n参考 [FitMeet](https://www.ourfitmeet.cn)，不要打开 [危险链接](javascript:alert(1))。\n也可以直接访问 https://www.ourfitmeet.cn/agent/chat。\n\n| 项目 | 建议 |\n| --- | --- |\n| 强度 | 轻松跑 |\n| 时长 | 20 分钟 |\n\n---\n\n',
        source: 'llm',
      });
      onEvent({
        type: 'assistant_delta',
        delta: '```ts\nconst pace = "easy";\n```',
        source: 'llm',
      });
      onEvent({ type: 'assistant_done', source: 'llm' });
      const streamed = {
        ...mockResponse(),
        assistantMessage: markdownReply,
        cards: [],
      };
      onEvent({ type: 'result', result: streamed });
      return streamed;
    });

    await renderAgentPage();

    submitPrompt('给我一个训练安排');

    expect(await screen.findByRole('heading', { name: '训练安排' })).toBeInTheDocument();
    const messageLog = screen.getByRole('log', { name: '对话消息' });
    expect(messageLog).toHaveAttribute('data-message-count', '2');
    expect(messageLog).toHaveAttribute('data-stream-state', 'idle');
    expect(messageLog).toHaveAttribute('data-density', 'comfortable');
    const markdown = screen.getByTestId('assistant-ui-markdown');
    expect(markdown).toHaveClass('space-y-2.5');
    expect(markdown).toHaveTextContent('热身 8 分钟');
    expect(markdown).toHaveTextContent('慢跑 20 分钟');
    expect(markdown).toHaveTextContent('确认今天目标');
    expect(markdown).toHaveTextContent('等待你确认时间');
    expect(markdown.querySelectorAll('li')).toHaveLength(4);
    const taskCheckboxes = screen.getAllByRole('checkbox');
    expect(taskCheckboxes).toHaveLength(2);
    expect(taskCheckboxes[0]).toBeChecked();
    expect(taskCheckboxes[1]).not.toBeChecked();
    expect(screen.getByRole('link', { name: 'FitMeet' })).toHaveAttribute(
      'href',
      'https://www.ourfitmeet.cn',
    );
    expect(screen.queryByRole('link', { name: '危险链接' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'https://www.ourfitmeet.cn/agent/chat' }),
    ).toHaveAttribute('href', 'https://www.ourfitmeet.cn/agent/chat');
    expect(screen.getByRole('columnheader', { name: '项目' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '建议' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '轻松跑' })).toBeInTheDocument();
    expect(markdown.querySelector('hr')).not.toBeNull();
    expect(markdown.querySelector('pre code')).toHaveTextContent('const pace = "easy";');

    fireEvent.click(screen.getByRole('button', { name: '复制代码' }));
    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledWith('const pace = "easy";'));
    expect(await screen.findByRole('button', { name: '代码已复制' })).toBeInTheDocument();
  });

  it('keeps candidate and Life Graph cards hidden even when the backend returns them', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'updateThread').mockResolvedValue({
      thread: {
        id: '101',
        threadId: 101,
        taskId: 101,
        title: '周末跑步候选',
        preview: '继续查看候选',
        status: 'regular',
        goal: '周末跑步候选',
        messageCount: 1,
        updatedAt: '2026-06-13T12:00:00.000Z',
        createdAt: '2026-06-13T12:00:00.000Z',
      },
    });
    const streamed = mockCandidateResponse();
    const streamSpy = vi
      .spyOn(socialAgentApi, 'runUserFacingStream')
      .mockImplementation(async (_data, onEvent) => {
        onEvent({ type: 'result', result: streamed });
        return streamed;
      });

    await renderAgentPage();

    submitPrompt('我不想交友，只想问一个普通问题');

    await waitFor(() => expect(streamSpy).toHaveBeenCalled());
    expect(streamSpy.mock.calls[0]?.[0]).toMatchObject({
      goal: '我不想交友，只想问一个普通问题',
      permissionMode: 'limited_auto',
    });
    expect(await screen.findByText(streamed.assistantMessage)).toBeInTheDocument();
    expect(screen.queryByText('推荐候选人')).not.toBeInTheDocument();
    expect(screen.queryByText('小林')).not.toBeInTheDocument();
    expect(screen.queryByText('Life Graph')).not.toBeInTheDocument();
  });

  it.each([
    '怎么参加活动比较安全？',
    '如何加好友不会打扰别人？',
    '发邀请的流程是什么？',
    '新用户怎么找搭子？',
    '创建活动需要先完善画像吗？',
  ])('keeps workflow guidance "%s" out of social result cards', async (prompt) => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'updateThread').mockResolvedValue({
      thread: {
        id: '101',
        threadId: 101,
        taskId: 101,
        title: '流程咨询',
        preview: '继续咨询流程',
        status: 'regular',
        goal: prompt,
        messageCount: 1,
        updatedAt: '2026-06-13T12:00:00.000Z',
        createdAt: '2026-06-13T12:00:00.000Z',
      },
    });
    const streamed = mockCandidateResponse();
    const streamSpy = vi
      .spyOn(socialAgentApi, 'runUserFacingStream')
      .mockImplementation(async (_data, onEvent) => {
        onEvent({ type: 'result', result: streamed });
        return streamed;
      });

    await renderAgentPage();

    submitPrompt(prompt);

    await waitFor(() => expect(streamSpy).toHaveBeenCalled());
    expect(await screen.findByText(streamed.assistantMessage)).toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-generative-cards')).not.toBeInTheDocument();
    expect(screen.queryByText('推荐候选人')).not.toBeInTheDocument();
    expect(screen.queryByText('小林')).not.toBeInTheDocument();
    expect(screen.queryByText('活动机会')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '加好友' })).not.toBeInTheDocument();
  });

  it('does not product-render legacy-only social cards without canonical Tool UI schema', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'updateThread').mockResolvedValue({
      thread: {
        id: '101',
        threadId: 101,
        taskId: 101,
        title: '周末跑步候选',
        preview: '继续查看候选',
        status: 'regular',
        goal: '周末跑步候选',
        messageCount: 1,
        updatedAt: '2026-06-13T12:00:00.000Z',
        createdAt: '2026-06-13T12:00:00.000Z',
      },
    });
    const streamed: UserFacingAgentResponse = {
      ...mockResponse(),
      assistantMessage: '我先整理了候选方向，等后端返回结构化卡片后再展示可操作候选。',
      lightStatus: '正在筛选公开可发现的人',
      cards: [
        {
          id: 'legacy-candidate-only',
          type: 'candidate_card',
          title: '旧候选卡',
          body: '旧候选摘要',
          status: 'ready',
          data: {
            displayName: '旧候选人',
            recommendationLine: '旧推荐理由',
          },
          actions: [
            {
              id: 'connect',
              label: '加好友',
              action: 'connect_candidate',
              requiresConfirmation: false,
              payload: { candidateId: 1, targetUserId: 2 },
            },
          ],
        },
      ],
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({ type: 'result', result: streamed });
      return streamed;
    });

    await renderAgentPage();

    submitPrompt('帮我找青岛周末下午跑步搭子');

    expect(await screen.findByText(streamed.assistantMessage)).toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-generative-cards')).not.toBeInTheDocument();
    expect(screen.queryByTestId('opportunity-card')).not.toBeInTheDocument();
    expect(document.querySelector('[data-schema-type="social_match.candidate"]')).toBeNull();
    expect(screen.queryByText('旧候选人')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '加好友' })).not.toBeInTheDocument();
  });

  it('renders social cards as assistant-ui message parts only for explicit social intent', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'updateThread').mockResolvedValue({
      thread: {
        id: '101',
        threadId: 101,
        taskId: 101,
        title: '周末跑步候选',
        preview: '继续查看候选',
        status: 'regular',
        goal: '周末跑步候选',
        messageCount: 1,
        updatedAt: '2026-06-13T12:00:00.000Z',
        createdAt: '2026-06-13T12:00:00.000Z',
      },
    });
    const streamed = mockCandidateResponse();
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({ type: 'result', result: streamed });
      return streamed;
    });
    const actionStreamSpy = vi
      .spyOn(socialAgentApi, 'performActionStream')
      .mockImplementation(async (data, onEvent) => {
        const actionResponse: UserFacingAgentResponse =
          data.action === 'activity.confirm_create'
            ? {
                ...mockResponse(),
                assistantMessage: '活动已经按你的确认进入发起流程，后续回复会继续保存在这里。',
                lightStatus: '正在等待你确认' as const,
                workflow: mockWorkflow('agent-task:101', 'RECOVERY', {
                  recoveryMessage: '活动已经按你的确认进入发起流程，后续回复会继续保存在这里。',
                }),
                cards: [
                  {
                    id: 'meet-loop-activity-created',
                    type: 'activity_status',
                    title: '活动发起进展',
                    body: '活动已经进入发起流程，发布和邀约仍会继续遵守你的确认边界。',
                    status: 'ready',
                    data: {
                      taskId: 101,
                      schemaName: 'MeetLoopTimelineCard',
                      schemaVersion: 'fitmeet.tool-ui.v1',
                      schemaType: 'meet_loop.timeline',
                      loopStage: 'activity_created',
                      timeline: {
                        title: '活动发起进展',
                        description: '活动已经进入发起流程，等待候选人响应。',
                        nextAction: '等待回应；必要时我会帮你调整时间或人数。',
                        steps: [
                          {
                            key: 'draft',
                            label: '活动已发起',
                            state: 'done',
                            description: '你确认后，我才进入活动发起流程。',
                          },
                          {
                            key: 'sent',
                            label: '等待回应',
                            state: 'current',
                            description: '等待候选人或参与者回复，不重复打扰。',
                            checkpointReady: true,
                            resumeMode: 'resume',
                          },
                          {
                            key: 'reschedule',
                            label: '必要时改期',
                            state: 'next',
                            description: '如果时间不合适，可以继续协商调整。',
                            resumeMode: 'reschedule',
                          },
                        ],
                      },
                    },
                    actions: [
                      {
                        id: 'meet-loop-activity-resume',
                        label: '继续推进',
                        action: 'meet_loop.resume',
                        schemaAction: 'meet_loop.resume',
                        requiresConfirmation: true,
                        payload: { taskId: 101, checkpointId: 8101 },
                      },
                    ],
                  },
                ],
              }
            : data.action === 'candidate.view_detail'
              ? {
                  ...mockCandidateResponse(),
                  assistantMessage: '我把这个候选机会的详情整理好了。',
                }
              : data.action === 'activity.view_detail'
                ? {
                    ...mockCandidateResponse(),
                    assistantMessage: '我把这个活动机会的详情整理好了。',
                  }
                : data.action === 'candidate.connect'
                  ? mockConnectTimelineResponse()
                  : {
                      ...mockResponse(),
                      assistantMessage: '我已经生成了一版开场白，发送前还会等你确认。',
                      cards: [],
                    };
        onEvent({ type: 'result', result: actionResponse });
        return actionResponse;
      });

    await renderAgentPage();

    submitPrompt('帮我找青岛周末下午能轻松跑步、先站内聊、接受陌生人的搭子');

    expect(await screen.findByTestId('assistant-ui-generative-cards')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-generative-cards')).toHaveAttribute(
      'data-product-components',
      expect.stringContaining('CandidateCards'),
    );
    expect(screen.getByTestId('assistant-ui-generative-cards')).toHaveTextContent('候选');
    const touchConfirmationNotes = screen.getAllByTestId('assistant-ui-touch-confirmation-note');
    expect(touchConfirmationNotes.length).toBeGreaterThan(1);
    touchConfirmationNotes.forEach((note) => {
      expect(note).toHaveAttribute('data-contact-boundary', 'approval-required');
      expect(note).toHaveTextContent('不会自动触达对方');
      expect(note).toHaveTextContent('涉及真实发送、连接或发布时，我会先等你确认。');
    });
    expect(screen.queryByText('已整理为可操作建议')).not.toBeInTheDocument();
    expect(
      screen.queryByText('卡片只展示结果；涉及真实发送、连接或发布时仍会先确认。'),
    ).not.toBeInTheDocument();
    expect(document.querySelector('[data-schema-type="social_match.candidate"]')).not.toBeNull();
    expect(document.querySelector('[data-schema-type="social_match.activity"]')).not.toBeNull();
    expect(document.querySelector('[data-schema-version="fitmeet.tool-ui.v1"]')).not.toBeNull();
    expect(document.querySelector('[data-schema-type="life_graph.diff"]')).not.toBeNull();
    expect(document.querySelector('[data-schema-type="meet_loop.timeline"]')).not.toBeNull();
    expect(document.querySelector('[data-renderer="social_match.candidate"]')).not.toBeNull();
    expect(document.querySelector('[data-renderer="social_match.activity"]')).not.toBeNull();
    expect(document.querySelector('[data-renderer="life_graph.diff"]')).not.toBeNull();
    expect(document.querySelector('[data-renderer="meet_loop.timeline"]')).not.toBeNull();
    expect(
      screen
        .getAllByTestId('assistant-ui-schema-card')
        .map((node) => node.getAttribute('data-schema-type')),
    ).toEqual(
      expect.arrayContaining([
        'social_match.candidate',
        'social_match.activity',
        'life_graph.diff',
        'meet_loop.timeline',
      ]),
    );
    const opportunitySchemaCards = screen
      .getAllByTestId('assistant-ui-schema-card')
      .filter((node) =>
        ['social_match.candidate', 'social_match.activity'].includes(
          node.getAttribute('data-schema-type') ?? '',
        ),
      );
    expect(opportunitySchemaCards).toHaveLength(3);
    expect(opportunitySchemaCards.map((node) => node.getAttribute('data-schema-type'))).toEqual([
      'social_match.candidate',
      'social_match.candidate',
      'social_match.activity',
    ]);
    expect(document.querySelectorAll('[data-product-component="CandidateCards"]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-product-component="OpportunityCard"]')).toHaveLength(1);
    expect(screen.queryByText('OpportunityCard')).not.toBeInTheDocument();
    expect(screen.queryByText('Activity Opportunity')).not.toBeInTheDocument();
    expect(screen.getByText('小林')).toBeInTheDocument();
    expect(screen.getByText('阿哲')).toBeInTheDocument();
    expect(screen.getAllByText('你们的活动区域和时间比较一致。').length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: '小林 的头像' }).getAttribute('src')).toContain(
      '/avatars/xiaolin.png',
    );
    expect(screen.queryByText('2.4km')).not.toBeInTheDocument();
    expect(screen.getAllByText('跑步').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('周末下午').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId('assistant-ui-candidate-intent-chips')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-opportunity-guardrails')).not.toBeInTheDocument();
    expect(screen.queryByTestId('candidate-explanation-trace')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-candidate-discovery-safety')).not.toBeInTheDocument();
    expect(screen.getByText('需要确认的冲突')).toBeInTheDocument();
    expect(screen.getByText(/之前记录过工作日晚间也可运动/)).toBeInTheDocument();
    expect(screen.getByText(/确认边界：只更新运动偏好，不写入具体位置。/)).toBeInTheDocument();
    expect(screen.getByText('敏感度：中')).toBeInTheDocument();
    const memoryChecklist = screen.getByTestId('life-graph-memory-checklist');
    expect(memoryChecklist).toHaveAttribute('data-conflict-count', '1');
    expect(memoryChecklist).toHaveAttribute('data-source-count', '2');
    expect(memoryChecklist).toHaveTextContent('记忆写入检查');
    expect(memoryChecklist).toHaveTextContent('写入字段');
    expect(memoryChecklist).toHaveTextContent('时间偏好、运动强度');
    expect(memoryChecklist).toHaveTextContent('敏感等级');
    expect(memoryChecklist).toHaveTextContent('中');
    expect(memoryChecklist).toHaveTextContent('依据来源');
    expect(memoryChecklist).toHaveTextContent('2 条对话信号');
    expect(memoryChecklist).toHaveTextContent('历史保留');
    expect(memoryChecklist).toHaveTextContent('保留旧偏好记录，不直接覆盖');
    expect(memoryChecklist).toHaveTextContent('写入边界');
    expect(memoryChecklist).toHaveTextContent('1 个冲突需确认');
    expect(screen.getByTestId('meet-loop-timeline')).toBeInTheDocument();
    const currentMeetStep = document.querySelector('[data-meet-loop-step="sent"]');
    expect(currentMeetStep).not.toBeNull();
    expect(currentMeetStep).toHaveAttribute('data-meet-loop-state', 'current');
    expect(currentMeetStep).toHaveAttribute('data-checkpoint-ready', 'true');
    expect(currentMeetStep).toHaveAttribute('data-resume-mode', 'resume');
    expect(screen.getByText('跑步邀约进展')).toBeInTheDocument();
    expect(screen.getAllByText('可以继续').length).toBeGreaterThan(0);
    expect(screen.getAllByText('继续').length).toBeGreaterThan(0);
    expect(document.querySelector('[data-meet-loop-step="confirmed"]')).toHaveAttribute(
      'data-meet-loop-state',
      'next',
    );
    expect(document.querySelector('[data-meet-loop-step="met"]')).toHaveAttribute(
      'data-meet-loop-state',
      'next',
    );
    expect(document.querySelector('[data-meet-loop-step="completed"]')).toHaveAttribute(
      'data-meet-loop-state',
      'next',
    );
    expect(document.querySelector('[data-meet-loop-step="life_graph"]')).toHaveAttribute(
      'data-meet-loop-state',
      'next',
    );
    expect(document.querySelector('[data-meet-loop-step="confirmed"]')).toHaveTextContent('确认');
    expect(document.querySelector('[data-meet-loop-step="met"]')).toHaveTextContent('见面');
    expect(document.querySelector('[data-meet-loop-step="completed"]')).toHaveTextContent('评价');
    expect(document.querySelector('[data-meet-loop-step="life_graph"]')).toHaveTextContent(
      '更新资料',
    );
    expect(screen.getByText('安全见面')).toBeInTheDocument();
    expect(screen.getByText('确认后回写')).toBeInTheDocument();
    const resumeButton = getEnabledSchemaActionButton('meet_loop.resume');
    expect(resumeButton).toBeDefined();
    const currentResumeButton = resumeButton as HTMLButtonElement;
    expect(currentResumeButton).toHaveAttribute('data-schema-action', 'meet_loop.resume');
    expect(screen.getAllByText('发消息').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole('button', { name: '查看详情' }).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole('button', { name: '感兴趣' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '更多类似' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '加好友并聊天' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: '加好友' })).not.toBeInTheDocument();
    const connectButton = getEnabledSchemaActionButton('candidate.connect') as HTMLButtonElement;
    expect(getEnabledSchemaActionButton('candidate.view_detail')).toHaveAttribute(
      'data-schema-action',
      'candidate.view_detail',
    );
    expect(getEnabledSchemaActionButton('candidate.generate_opener')).toHaveAttribute(
      'data-schema-action',
      'candidate.generate_opener',
    );
    expect(connectButton).toHaveAttribute('data-schema-action', 'candidate.connect');
    expect(connectButton).toHaveAttribute('data-requires-confirmation', 'true');
    expect(connectButton).toHaveAttribute('aria-describedby');
    expect(
      document.getElementById(connectButton.getAttribute('aria-describedby') ?? ''),
    ).toHaveTextContent('涉及真实发送、连接或发布时，我会先等你确认。');
    expect(screen.getByText('周末海边轻松跑')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: '周末海边轻松跑 活动图' }).getAttribute('src'),
    ).toContain('/activities/sea-run.png');
    expect(screen.queryByText('3/8 人')).not.toBeInTheDocument();
    const activityCard = document.querySelector<HTMLElement>(
      'article[data-product-component="OpportunityCard"]',
    );
    expect(activityCard).not.toBeNull();
    const activityActionCard = within(activityCard as HTMLElement).getByTestId(
      'assistant-ui-unified-action-card',
    );
    const activityDetails = within(activityCard as HTMLElement).getByTestId(
      'assistant-ui-product-card-details',
    );
    expect(
      activityDetails.compareDocumentPosition(activityActionCard) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByTestId('activity-explanation-steps')).not.toBeInTheDocument();
    expect(screen.queryByTestId('activity-status-strip')).not.toBeInTheDocument();
    expect(screen.queryByTestId('activity-protocol')).not.toBeInTheDocument();
    expect(screen.queryByTestId('activity-safety-loop')).not.toBeInTheDocument();
    const activityModifyTimeButton = getEnabledSchemaActionButton('activity.modify_time');
    const activityModifyLocationButton = getEnabledSchemaActionButton('activity.modify_location');
    expect(activityModifyTimeButton).not.toBeNull();
    expect(activityModifyLocationButton).toBeNull();
    expect(screen.getByRole('button', { name: '确认发布' })).toBeInTheDocument();
    expect(screen.getByText('确认发布')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确认更新' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '暂不写入' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确认发布' })).toHaveAttribute(
      'data-schema-action',
      'publish_to_discover',
    );
    const highRiskActionExpectations = [
      ['candidate.connect', '加好友并聊天'],
      ['publish_to_discover', '确认发布'],
      ['life_graph.accept_update', '确认更新'],
      ['meet_loop.resume', '继续推进'],
    ] as const;
    for (const [schemaAction, label] of highRiskActionExpectations) {
      const button = getEnabledSchemaActionButton(schemaAction);
      expect(button, `${label} should be rendered as a checkpoint-protected action`).not.toBeNull();
      expect(button).toHaveAttribute('data-requires-confirmation', 'true');
      expect(button).toHaveAttribute('data-checkpoint-required', 'true');
    }
    expect(activityModifyTimeButton).toHaveAttribute('data-schema-action', 'activity.modify_time');
    expect(activityModifyLocationButton).toBeNull();
    expect(screen.getByRole('button', { name: '确认更新' })).toHaveAttribute(
      'data-schema-action',
      'life_graph.accept_update',
    );
    expect(screen.getByRole('button', { name: '暂不写入' })).toHaveAttribute(
      'data-schema-action',
      'life_graph.reject_update',
    );
    expect(getEnabledSchemaActionButton('activity.view_detail')).toBeNull();
    const messageCountBeforeDetail = screen.getAllByTestId('assistant-ui-message').length;
    fireEvent.click(getEnabledSchemaActionButton('candidate.view_detail') as HTMLButtonElement);
    expect(window.location.pathname).toBe('/user/22');
    expect(actionStreamSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'candidate.view_detail' }),
      expect.any(Function),
      expect.any(AbortSignal),
    );
    expect(screen.getAllByTestId('assistant-ui-message')).toHaveLength(messageCountBeforeDetail);
    const openerButton = getEnabledSchemaActionButton('candidate.generate_opener');
    expect(openerButton).not.toBeNull();
    fireEvent.click(openerButton as HTMLElement);
    await waitFor(() =>
      expect(actionStreamSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 101,
          action: 'candidate.generate_opener',
          payload: expect.objectContaining({
            taskId: 101,
          }),
        }),
        expect.any(Function),
        expect.any(AbortSignal),
      ),
    );
    await waitFor(() =>
      expect(getEnabledSchemaActionButton('candidate.generate_opener')).toHaveAttribute(
        'data-action-state',
        'succeeded',
      ),
    );
    await waitFor(() => expect(actionStreamSpy).toHaveBeenCalledTimes(1));
    expect(document.querySelector('.agent-gpt-result-block')).toBeNull();
    expect(document.body.textContent ?? '').not.toContain('hidden-trace');
  });

  it('shows safe generated opportunity actions when backend omits card actions', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'updateThread').mockResolvedValue({
      thread: {
        id: '101',
        threadId: 101,
        taskId: 101,
        title: '安全机会',
        preview: '默认安全推进路径',
        status: 'regular',
        goal: '安全机会',
        messageCount: 1,
        updatedAt: '2026-06-13T12:00:00.000Z',
        createdAt: '2026-06-13T12:00:00.000Z',
      },
    });
    const streamed = {
      ...mockCandidateResponse(),
      cards: mockCandidateResponse().cards.map((card) =>
        card.schemaType === 'social_match.candidate' || card.schemaType === 'social_match.activity'
          ? { ...card, actions: [] }
          : card,
      ),
    };
    const actionStreamSpy = vi.spyOn(socialAgentApi, 'performActionStream');
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({ type: 'result', result: streamed });
      return streamed;
    });

    await renderAgentPage();

    submitPrompt('我想找青岛周末下午一起轻松跑步的新朋友');

    expect(await screen.findByTestId('assistant-ui-generative-cards')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-generative-cards')).toHaveAttribute(
      'data-product-components',
      expect.stringContaining('CandidateCards'),
    );
    expect(screen.getByTestId('assistant-ui-generative-cards')).toHaveAttribute(
      'data-product-components',
      expect.stringContaining('OpportunityCard'),
    );
    expect(screen.getByTestId('assistant-ui-generative-cards')).toHaveTextContent('2 个候选');
    expect(screen.getByTestId('assistant-ui-generative-cards')).toHaveTextContent('1 张约练卡');
    await waitFor(() =>
      expect(
        document.querySelectorAll('[data-product-component="CandidateCards"]').length,
      ).toBeGreaterThan(0),
    );
    const candidateCard = document.querySelector<HTMLElement>(
      'article[data-product-component="CandidateCards"]',
    );
    const activityCard = document.querySelector<HTMLElement>(
      'article[data-product-component="OpportunityCard"]',
    );
    expect(candidateCard).not.toBeNull();
    expect(
      within(candidateCard as HTMLElement).getByRole('button', { name: '查看详情' }),
    ).toBeInTheDocument();
    expect(
      within(candidateCard as HTMLElement).getByRole('button', { name: '收藏' }),
    ).toBeInTheDocument();
    expect(
      within(candidateCard as HTMLElement).getByRole('button', { name: '生成开场白' }),
    ).toBeInTheDocument();
    expect(
      within(candidateCard as HTMLElement).getByRole('button', { name: '发送邀请' }),
    ).toBeInTheDocument();
    expect(
      within(candidateCard as HTMLElement).getByRole('button', { name: '加好友并聊天' }),
    ).toBeInTheDocument();
    expect(
      (candidateCard as HTMLElement).querySelector('[data-schema-action="candidate.like"]'),
    ).toHaveAttribute('data-requires-confirmation', 'false');
    expect(
      (candidateCard as HTMLElement).querySelector('[data-schema-action="opener.confirm_send"]'),
    ).toHaveAttribute('data-requires-confirmation', 'true');
    expect(
      (candidateCard as HTMLElement).querySelector('[data-schema-action="candidate.connect"]'),
    ).toHaveAttribute('data-requires-confirmation', 'true');
    expect(
      (candidateCard as HTMLElement).querySelector('[data-schema-action="candidate.connect"]'),
    ).toHaveAttribute('data-action-source', 'default');
    expect(activityCard).not.toBeNull();
    expect(within(activityCard as HTMLElement).getByText('确认发布')).toBeInTheDocument();
    expect(within(activityCard as HTMLElement).getByText('修改卡片')).toBeInTheDocument();
    expect(within(activityCard as HTMLElement).getByText('暂不发布')).toBeInTheDocument();
    expect(
      (activityCard as HTMLElement).querySelector('[data-schema-action="publish_to_discover"]'),
    ).toHaveAttribute('data-requires-confirmation', 'true');
    expect(
      (activityCard as HTMLElement).querySelector('[data-schema-action="publish_to_discover"]'),
    ).toHaveAttribute('data-action-source', 'default');
    const candidateConnectButton = getEnabledSchemaActionButton('candidate.connect');
    const activityCreateButton = getEnabledSchemaActionButton('publish_to_discover');
    expect(candidateConnectButton).not.toBeNull();
    expect(candidateConnectButton).toHaveAttribute('data-action-source', 'default');
    expect(candidateConnectButton).toHaveAttribute('data-requires-confirmation', 'true');
    expect(candidateConnectButton).toHaveAttribute('data-checkpoint-required', 'true');
    expect(activityCreateButton).not.toBeNull();
    expect(activityCreateButton).toHaveAttribute('data-action-source', 'default');
    expect(activityCreateButton).toHaveAttribute('data-requires-confirmation', 'true');
    expect(activityCreateButton).toHaveAttribute('data-checkpoint-required', 'true');
    expect(getEnabledSchemaActionButton('activity.modify_time')).not.toBeNull();
    expect(getEnabledSchemaActionButton('social_intent.decline_publish')).not.toBeNull();
    expect(actionStreamSpy).not.toHaveBeenCalled();
  });

  it('opens publish-to-discover approval inline on the opportunity card instead of stacking a backend approval panel', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'updateThread').mockResolvedValue({
      thread: {
        id: '101',
        threadId: 101,
        taskId: 101,
        title: '发布约练卡',
        preview: '等待确认发布到发现',
        status: 'regular',
        goal: '发布约练卡',
        messageCount: 1,
        updatedAt: '2026-06-13T12:00:00.000Z',
        createdAt: '2026-06-13T12:00:00.000Z',
      },
    });
    const streamed = mockCandidateResponse();
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({ type: 'result', result: streamed });
      return streamed;
    });
    const actionStreamSpy = vi
      .spyOn(socialAgentApi, 'performActionStream')
      .mockImplementation(async (data, onEvent) => {
        const response: UserFacingAgentResponse = {
          ...mockResponse(),
          assistantMessage: '发布到发现前需要你确认。',
          cards: [],
          pendingConfirmations: [
            {
              id: 9810,
              type: 'approval_required',
              actionType: 'publish_social_request',
              summary: '确认后这张约练卡才会出现在发现页。',
              riskLevel: 'medium',
              expiresAt: null,
            },
          ],
        };
        onEvent({ type: 'result', result: response });
        expect(data.action).toBe('publish_to_discover');
        return response;
      });

    await renderAgentPage();

    submitPrompt('我想找青岛周末下午一起轻松跑步的新朋友');

    const publishButton = await waitFor(() => {
      const button = getEnabledSchemaActionButton('publish_to_discover');
      expect(button).not.toBeNull();
      return button as HTMLButtonElement;
    });
    const activityCard = document.querySelector<HTMLElement>(
      'article[data-product-component="OpportunityCard"]',
    );
    expect(activityCard).not.toBeNull();
    expect(screen.queryByTestId('assistant-ui-inline-approval-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();

    fireEvent.click(publishButton);

    const inlineApproval = await within(activityCard as HTMLElement).findByTestId(
      'assistant-ui-inline-approval-panel',
    );
    expect(inlineApproval).toHaveTextContent('确认发布到发现');
    expect(inlineApproval).toHaveTextContent('确认后这张约练卡才会出现在发现页');
    expect(inlineApproval).not.toHaveTextContent(/riskLevel|checkpoint|audit|动作：|风险级别/i);
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();
    expect(actionStreamSpy).not.toHaveBeenCalled();
    fireEvent.click(within(inlineApproval).getByRole('button', { name: '确认发布' }));
    await waitFor(() =>
      expect(actionStreamSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'publish_to_discover',
          payload: expect.objectContaining({ confirmedPublish: true }),
        }),
        expect.any(Function),
        expect.any(AbortSignal),
      ),
    );
  });

  it('keeps the simplified opportunity card focused on draft publish controls', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'updateThread').mockResolvedValue({
      thread: {
        id: '101',
        threadId: 101,
        taskId: 101,
        title: '暂不发布约练卡',
        preview: '约练卡已取消发布',
        status: 'regular',
        goal: '暂不发布约练卡',
        messageCount: 1,
        updatedAt: '2026-06-13T12:00:00.000Z',
        createdAt: '2026-06-13T12:00:00.000Z',
      },
    });
    const streamed = mockCandidateResponse();
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({ type: 'result', result: streamed });
      return streamed;
    });
    const actionStreamSpy = vi.spyOn(socialAgentApi, 'performActionStream');

    await renderAgentPage();

    submitPrompt('我想找青岛周末下午一起轻松跑步的新朋友');

    await waitFor(() => expect(getEnabledSchemaActionButton('publish_to_discover')).not.toBeNull());
    expect(getEnabledSchemaActionButton('activity.modify_time')).not.toBeNull();
    expect(getEnabledSchemaActionButton('social_intent.decline_publish')).not.toBeNull();
    expect(screen.queryByTestId('assistant-ui-inline-approval-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();
    expect(screen.getByText('确认发布')).toBeInTheDocument();
    expect(screen.getByText('修改卡片')).toBeInTheDocument();
    expect(screen.getByText('暂不发布')).toBeInTheDocument();
    expect(actionStreamSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('assistant-ui-inline-approval-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();
  });

  it('renders three candidate OpportunityCards with detail, opener and approval-gated invite actions', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'updateThread').mockResolvedValue({
      thread: {
        id: '101',
        threadId: 101,
        taskId: 101,
        title: '同城跑步搭子',
        preview: '3 个安全候选机会',
        status: 'regular',
        goal: '同城跑步搭子',
        messageCount: 1,
        updatedAt: '2026-06-13T12:00:00.000Z',
        createdAt: '2026-06-13T12:00:00.000Z',
      },
    });
    const streamed = mockThreeCandidateResponse();
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({ type: 'result', result: streamed });
      return streamed;
    });

    await renderAgentPage();

    submitPrompt('我想找一个周末一起跑步的人');

    expect(await screen.findByTestId('assistant-ui-generative-cards')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-generative-cards')).toHaveAttribute(
      'data-product-components',
      'CandidateCards',
    );
    expect(screen.getByTestId('assistant-ui-generative-cards')).toHaveTextContent('3 个候选');
    expect(screen.getByTestId('assistant-ui-generative-cards')).toHaveAttribute(
      'data-candidate-count',
      '3',
    );
    const schemaCards = screen.getAllByTestId('assistant-ui-schema-card');
    expect(schemaCards).toHaveLength(3);
    expect(schemaCards.map((node) => node.getAttribute('data-schema-type'))).toEqual([
      'social_match.candidate',
      'social_match.candidate',
      'social_match.candidate',
    ]);
    expect(await screen.findAllByText('推荐对象')).toHaveLength(3);
    expect(document.querySelectorAll('[data-product-component="CandidateCards"]')).toHaveLength(3);
    expect(
      document.querySelectorAll('article[data-product-renderer="CandidateCards"]'),
    ).toHaveLength(3);
    const firstCandidateCard = document.querySelector<HTMLElement>(
      'article[data-product-component="CandidateCards"]',
    );
    expect(firstCandidateCard).not.toBeNull();
    const firstCandidateActionCard = within(firstCandidateCard as HTMLElement).getByTestId(
      'assistant-ui-unified-action-card',
    );
    const firstCandidateDetails = within(firstCandidateCard as HTMLElement).getAllByTestId(
      'assistant-ui-product-card-details',
    )[0];
    expect(
      firstCandidateDetails.compareDocumentPosition(firstCandidateActionCard) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText('小林')).toBeInTheDocument();
    expect(screen.getByText('阿哲')).toBeInTheDocument();
    expect(screen.getByText('小周')).toBeInTheDocument();
    expect(
      screen.queryByTestId('assistant-ui-candidate-reasoning-quality'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-candidate-discovery-safety')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-recommendation-protocol')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-opportunity-guardrails')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-candidate-action-rhythm')).not.toBeInTheDocument();
    expect(screen.queryByText('活动机会')).not.toBeInTheDocument();
    expect(screen.queryByText('tool_call')).not.toBeInTheDocument();
    expect(screen.queryByText('traceId')).not.toBeInTheDocument();
    expect(
      document.querySelectorAll('button[data-schema-action="candidate.view_detail"]'),
    ).toHaveLength(3);
    expect(
      document.querySelectorAll('button[data-schema-action="candidate.generate_opener"]'),
    ).toHaveLength(3);
    const inviteButtons = Array.from(
      document.querySelectorAll('button[data-schema-action="candidate.connect"]'),
    );
    expect(inviteButtons).toHaveLength(3);
    expect(screen.getAllByTestId('assistant-ui-touch-confirmation-note')).toHaveLength(3);
    inviteButtons.forEach((button) => {
      expect(button).toHaveAttribute('data-requires-confirmation', 'true');
      expect(button).toHaveAttribute('data-checkpoint-required', 'true');
      expect(button).toHaveAttribute('aria-describedby');
      const note = document.getElementById(button.getAttribute('aria-describedby') ?? '');
      expect(note).toHaveAttribute('data-contact-boundary', 'approval-required');
      expect(note).toHaveTextContent('不会自动触达对方');
      expect(note).toHaveTextContent('涉及真实发送、连接或发布时，我会先等你确认。');
    });
  });

  it('sends proposal identifiers when rejecting a default Life Graph Tool UI action', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'updateThread').mockResolvedValue({
      thread: {
        id: '101',
        threadId: 101,
        taskId: 101,
        title: '周末跑步候选',
        preview: '继续查看候选',
        status: 'regular',
        goal: '周末跑步候选',
        messageCount: 1,
        updatedAt: '2026-06-13T12:00:00.000Z',
        createdAt: '2026-06-13T12:00:00.000Z',
      },
    });
    const streamed = mockCandidateResponse();
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({ type: 'result', result: streamed });
      return streamed;
    });
    const actionStreamSpy = vi
      .spyOn(socialAgentApi, 'performActionStream')
      .mockImplementation(async () => ({
        ...mockResponse(),
        assistantMessage: '好的，这次画像建议不会写入。',
        profileUpdated: false,
      }));

    await renderAgentPage();

    submitPrompt('帮我找青岛周末一起跑步的搭子，推荐几个真实用户');

    expect(await screen.findByRole('button', { name: '暂不写入' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '暂不写入' }));

    await waitFor(() =>
      expect(actionStreamSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 101,
          action: 'life_graph.reject_update',
          payload: expect.objectContaining({
            taskId: 101,
            proposalId: 77,
            fieldIds: ['lifestyle:availableTimes:1', 'training:intensity:1'],
          }),
        }),
        expect.any(Function),
        expect.any(AbortSignal),
      ),
    );
    await waitFor(() =>
      expect(getEnabledSchemaActionButton('life_graph.reject_update')).toHaveAttribute(
        'data-action-state',
        'succeeded',
      ),
    );
  });

  it('renders reply writeback proposals as safe Life Graph Tool UI actions', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'updateThread').mockResolvedValue({
      thread: {
        id: '101',
        threadId: 101,
        taskId: 101,
        title: '对方回复画像建议',
        preview: '对方回复后更新建议',
        status: 'regular',
        goal: '对方回复画像建议',
        messageCount: 1,
        updatedAt: '2026-06-13T12:00:00.000Z',
        createdAt: '2026-06-13T12:00:00.000Z',
      },
    });
    const streamed: UserFacingAgentResponse = {
      ...mockResponse(),
      assistantMessage: '对方已经回复，我整理了一条可确认的画像影响建议。',
      lifeGraphWritebackProposal: {
        schemaVersion: 'fitmeet.life_graph.writeback.v1',
        source: 'counterpart_reply',
        status: 'pending_user_confirmation',
        sensitivityLevel: 'medium',
        taskId: 101,
        candidateUserId: 22,
        conversationId: 'conv_1',
        messageId: 'msg_2',
        proposedSignals: [
          {
            field: 'meetLoop.counterpartIntent',
            label: '对方回复意图',
            value: 'ask_question',
            confidence: 0.84,
          },
          {
            field: 'meetLoop.replySummary',
            label: '脱敏互动摘要',
            value: '对方询问见面地点。',
            confidence: 0.76,
          },
        ],
        confirmationBoundary: '这只是画像更新建议，确认前不会写入长期偏好。',
        privacyBoundary: '不保存对方私聊原文，只保存脱敏后的互动信号和下一步建议。',
        revokeHint: '确认后仍可撤回。',
      },
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({ type: 'result', result: streamed });
      return streamed;
    });
    const actionStreamSpy = vi
      .spyOn(socialAgentApi, 'performActionStream')
      .mockImplementation(async () => ({
        ...mockResponse(),
        assistantMessage: '已保留这次回复的脱敏互动信号。',
        profileUpdated: true,
      }));

    await renderAgentPage();

    submitPrompt('帮我找青岛周末跑步搭子，并继续推进对方回复');

    expect(await screen.findByText('资料更新建议')).toBeInTheDocument();
    expect(screen.getByText('对方询问见面地点。')).toBeInTheDocument();
    expect(screen.getAllByText('对方回复后的弱互动信号').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('life-graph-source-boundary')).toHaveAttribute(
      'data-life-graph-source-label',
      '对方回复后的弱互动信号',
    );
    expect(
      screen.getByText(/不保存对方私聊原文，只保存脱敏后的互动信号和下一步建议/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '保留为推荐信号' }));

    await waitFor(() =>
      expect(actionStreamSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 101,
          action: 'life_graph.accept_update',
          payload: expect.objectContaining({
            taskId: 101,
            source: 'counterpart_reply',
            writebackProposalId: 'msg_2',
            conversationId: 'conv_1',
            messageId: 'msg_2',
            candidateUserId: 22,
            canRevoke: true,
            canCorrect: true,
          }),
        }),
        expect.any(Function),
        expect.any(AbortSignal),
      ),
    );
    expect(actionStreamSpy.mock.calls[0]?.[0].payload).not.toHaveProperty('proposalId');
    await waitFor(() =>
      expect(getEnabledSchemaActionButton('life_graph.accept_update')).toHaveAttribute(
        'data-action-state',
        'succeeded',
      ),
    );
  });

  it('renders canonical counterpart reply timeline and weak Life Graph signal cards', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'updateThread').mockResolvedValue({
      thread: {
        id: '101',
        threadId: 101,
        taskId: 101,
        title: '对方回复进展',
        preview: '对方已回复',
        status: 'regular',
        goal: '对方回复进展',
        messageCount: 1,
        updatedAt: '2026-06-13T12:00:00.000Z',
        createdAt: '2026-06-13T12:00:00.000Z',
      },
    });
    const streamed: UserFacingAgentResponse = {
      ...mockResponse(),
      assistantMessage: '对方已经回复了，我先把状态推进到继续站内聊。',
      cards: [
        {
          id: 'meet-loop-reply',
          type: 'review_card',
          title: '邀约进展',
          body: '对方已经回复，可以继续站内聊。',
          status: 'ready',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'meet_loop.timeline',
          data: {
            taskId: 101,
            schemaName: 'MeetLoopTimelineCard',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'meet_loop.timeline',
            loopStage: 'reply_received',
            connectionState: 'reply_received',
            counterpartIntent: 'accepted',
            replyIntentLabel: '对方愿意继续',
            replyIntentDescription: '对方愿意继续互动。你可以先站内聊。',
            nextSafeStep: '如果要创建约练或连接对方，我会先让你确认。',
            replyPreview: '可以呀，周末下午先轻松跑一圈。',
            timeline: {
              title: '邀约进展',
              description: '对方已经回复，可以继续站内聊。',
              nextAction: '如果要创建约练或连接对方，我会先让你确认。',
            },
          },
          actions: [
            {
              id: 'meet-loop-prepare-activity',
              label: '准备约练草案',
              action: 'create_activity',
              schemaAction: 'activity.confirm_create',
              requiresConfirmation: true,
              payload: {
                taskId: 101,
                candidateUserId: 22,
                counterpartIntent: 'accepted',
                approvalRequired: true,
                checkpointRequired: true,
              },
            },
          ],
        },
        {
          id: 'life-graph-reply',
          type: 'audit_update',
          title: '这次回应可以作为一条弱画像信号。',
          body: '确认前不会写入长期画像。',
          status: 'completed',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'life_graph.diff',
          data: {
            taskId: 101,
            schemaName: 'LifeGraphDiffCard',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'life_graph.diff',
            source: 'counterpart_reply',
            loopStage: 'reply_received',
            diff: {
              title: '低压力开场互动信号',
              description: '对方已经回复，说明这类低压力开场方式有效。',
              currentValue: '不把这次回复写入长期画像',
              proposedValue: '提高低压力开场、公共场所和先站内聊候选的解释权重',
              fields: ['低压力开场', '站内聊天边界'],
              privacyBoundary: '不会写入精确位置或私聊内容。',
              sourceSignals: ['对方已回复', '低压力开场有效'],
            },
          },
          actions: [],
        },
      ],
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({ type: 'result', result: streamed });
      return streamed;
    });

    await renderAgentPage();

    submitPrompt('刚才那个周末跑步搭子的邀请对方已经回复了，帮我继续推进但不要自动发消息');

    expect(await screen.findByTestId('meet-loop-reply-received-note')).toHaveTextContent(
      '对方愿意继续',
    );
    expect(screen.getByTestId('meet-loop-reply-received-note')).toHaveAttribute(
      'data-counterpart-intent',
      'accepted',
    );
    expect(screen.getByText('如果要创建约练或连接对方，我会先让你确认。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /准备约练草案/ })).toBeInTheDocument();
    expect(screen.getByText('脱敏摘要：可以呀，周末下午先轻松跑一圈。')).toBeInTheDocument();
    const stageOverview = screen.getByTestId('meet-loop-stage-overview');
    expect(stageOverview).toHaveTextContent('约练阶段');
    expect(stageOverview).toHaveTextContent('发起');
    expect(stageOverview).toHaveTextContent('等待回复');
    expect(stageOverview).toHaveTextContent('改期');
    expect(stageOverview).toHaveTextContent('确认');
    expect(stageOverview).toHaveTextContent('见面');
    expect(stageOverview).toHaveTextContent('评价');
    expect(stageOverview).toHaveTextContent('更新资料');
    expect(screen.getByTestId('life-graph-counterpart-reply-note')).toHaveTextContent(
      '确认前不会写入长期偏好',
    );
    expect(screen.getByText('低压力开场互动信号')).toBeInTheDocument();
    expect(screen.getByText(/不会写入精确位置或私聊内容/)).toBeInTheDocument();
    expect(document.querySelector('[data-connection-state="reply_received"]')).not.toBeNull();
    expect(document.querySelector('[data-life-graph-source="counterpart_reply"]')).not.toBeNull();
    expect(screen.queryByText('tool_call')).not.toBeInTheDocument();
    expect(screen.queryByText('traceId')).not.toBeInTheDocument();
  });

  it('renders checked-in meet-loop cards as the current safe-meet step in assistant-ui Tool UI', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'updateThread').mockResolvedValue({
      thread: {
        id: '101',
        threadId: 101,
        taskId: 101,
        title: '约练签到',
        preview: '签到已记录',
        status: 'regular',
        goal: '约练签到',
        messageCount: 1,
        updatedAt: '2026-06-13T12:00:00.000Z',
        createdAt: '2026-06-13T12:00:00.000Z',
      },
    });
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      const response: UserFacingAgentResponse = {
        ...mockResponse(),
        assistantMessage: '签到已记录。活动结束后你确认完成，我再帮你生成评价卡。',
        cards: [
          {
            id: 'meet-loop-checked-in',
            type: 'review_card',
            title: '约练进展',
            body: '你已经到达公共场所，接下来按安全边界完成见面。',
            status: 'ready',
            data: {
              taskId: 101,
              schemaName: 'MeetLoopTimelineCard',
              schemaVersion: 'fitmeet.tool-ui.v1',
              schemaType: 'meet_loop.timeline',
              activityId: 700,
              candidateUserId: 22,
              loopStage: 'activity_checked_in',
              nextAction: '活动结束后确认完成，再提交评价。',
            },
            actions: [
              {
                id: 'activity-complete',
                label: '确认完成',
                action: 'activity.complete',
                schemaAction: 'activity.complete',
                requiresConfirmation: true,
                payload: { taskId: 101, activityId: 700, candidateUserId: 22 },
              },
            ],
          },
        ],
      };
      onEvent({ type: 'result', result: response });
      return response;
    });
    const actionStreamSpy = vi
      .spyOn(socialAgentApi, 'performActionStream')
      .mockImplementation(async (_data, onEvent) => {
        const response: UserFacingAgentResponse = {
          ...mockResponse(),
          assistantMessage: '已记录这次活动完成，下一步可以提交评价。',
          cards: [],
        };
        onEvent({ type: 'result', result: response });
        return response;
      });
    await renderAgentPage();

    submitPrompt('我已经到达和小林约跑的现场了');

    expect(await screen.findByTestId('assistant-ui-generative-cards')).toBeInTheDocument();
    expect(screen.getByTestId('meet-loop-timeline')).toBeInTheDocument();
    const metStep = document.querySelector('[data-meet-loop-step="met"]');
    expect(metStep).not.toBeNull();
    expect(metStep).toHaveAttribute('data-meet-loop-state', 'current');
    expect(metStep).toHaveAttribute('data-checkpoint-ready', 'true');
    expect(metStep).toHaveTextContent('见面');
    expect(metStep).toHaveTextContent('安全见面');
    expect(document.querySelector('[data-meet-loop-step="completed"]')).toHaveAttribute(
      'data-meet-loop-state',
      'next',
    );
    expect(document.querySelector('[data-meet-loop-step="life_graph"]')).toHaveAttribute(
      'data-meet-loop-state',
      'next',
    );
    expect(screen.getByRole('button', { name: '确认完成' })).toHaveAttribute(
      'data-schema-action',
      'activity.complete',
    );
    const completeButton = screen.getByRole('button', { name: '确认完成' });
    expect(completeButton).not.toBeDisabled();
    fireEvent.click(completeButton);
    await waitFor(() =>
      expect(actionStreamSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 101,
          action: 'activity.complete',
          payload: expect.objectContaining({
            taskId: 101,
            activityId: 700,
            candidateUserId: 22,
          }),
        }),
        expect.any(Function),
        expect.any(AbortSignal),
      ),
    );
  });

  it('executes Meet Loop check-in, review, and proof actions from assistant-ui cards', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'updateThread').mockResolvedValue({
      thread: {
        id: '101',
        threadId: 101,
        taskId: 101,
        title: '活动后续',
        preview: '继续处理约练后续',
        status: 'regular',
        goal: '活动后续',
        messageCount: 1,
        updatedAt: '2026-06-13T12:00:00.000Z',
        createdAt: '2026-06-13T12:00:00.000Z',
      },
    });
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      const response: UserFacingAgentResponse = {
        ...mockResponse(),
        assistantMessage: '我把这次活动的后续步骤放在这里，按你的确认逐步推进。',
        cards: [
          {
            id: 'meet-loop-actions',
            type: 'review_card',
            title: '活动后续',
            body: '签到、评价和证明都通过消息内工具卡处理。',
            status: 'ready',
            data: {
              taskId: 101,
              schemaName: 'MeetLoopTimelineCard',
              schemaVersion: 'fitmeet.tool-ui.v1',
              schemaType: 'meet_loop.timeline',
              activityId: 700,
              candidateUserId: 22,
              loopStage: 'activity_confirmed',
              timeline: {
                title: '活动后续',
                description: '每一步都在确认后推进。',
                nextAction: '到达后签到，结束后评价或上传证明。',
              },
            },
            actions: [
              {
                id: 'check-in',
                label: '我已到达',
                action: 'activity.check_in',
                schemaAction: 'activity.check_in',
                requiresConfirmation: false,
                payload: { taskId: 101, activityId: 700, candidateUserId: 22 },
              },
              {
                id: 'review-submit',
                label: '提交评价',
                action: 'review.submit',
                schemaAction: 'review.submit',
                requiresConfirmation: false,
                payload: { taskId: 101, activityId: 700, rating: 5 },
              },
              {
                id: 'proof-upload',
                label: '上传证明',
                action: 'activity.upload_proof',
                schemaAction: 'activity.upload_proof',
                requiresConfirmation: false,
                payload: { taskId: 101, activityId: 700, proofType: 'photo' },
              },
            ],
          },
        ],
      };
      onEvent({ type: 'result', result: response });
      return response;
    });
    const actionStreamSpy = vi
      .spyOn(socialAgentApi, 'performActionStream')
      .mockImplementation(async (data, onEvent) => {
        const nextActions: FitMeetAlphaCardAction[] =
          data.action === 'activity.check_in'
            ? [
                {
                  id: 'review-submit-next',
                  label: '提交评价',
                  action: 'review.submit',
                  schemaAction: 'review.submit',
                  requiresConfirmation: false,
                  payload: { taskId: 101, activityId: 700, rating: 5 },
                },
                {
                  id: 'proof-upload-next',
                  label: '上传证明',
                  action: 'activity.upload_proof',
                  schemaAction: 'activity.upload_proof',
                  requiresConfirmation: false,
                  payload: { taskId: 101, activityId: 700, proofType: 'photo' },
                },
              ]
            : data.action === 'review.submit'
              ? [
                  {
                    id: 'proof-upload-after-review',
                    label: '上传证明',
                    action: 'activity.upload_proof',
                    schemaAction: 'activity.upload_proof',
                    requiresConfirmation: false,
                    payload: { taskId: 101, activityId: 700, proofType: 'photo' },
                  },
                ]
              : [];
        const response: UserFacingAgentResponse = {
          ...mockResponse(),
          assistantMessage: `已继续处理 ${data.action}。`,
          cards:
            nextActions.length > 0
              ? [
                  {
                    id: `meet-loop-actions-${data.action}`,
                    type: 'review_card',
                    title: '活动后续',
                    body: '继续处理下一步。',
                    status: 'ready',
                    data: {
                      taskId: 101,
                      schemaName: 'MeetLoopTimelineCard',
                      schemaVersion: 'fitmeet.tool-ui.v1',
                      schemaType: 'meet_loop.timeline',
                      activityId: 700,
                      candidateUserId: 22,
                      loopStage: 'activity_confirmed',
                      timeline: {
                        title: '活动后续',
                        description: '每一步都在确认后推进。',
                        nextAction: '继续处理下一步。',
                      },
                    },
                    actions: nextActions,
                  },
                ]
              : [],
        };
        onEvent({ type: 'result', result: response });
        return response;
      });
    await renderAgentPage();

    submitPrompt('我想继续处理这次约练后续');

    const checkInButton = await screen.findByRole('button', { name: '我已到达' });
    const reviewButton = await screen.findByRole('button', { name: '提交评价' });
    const proofButton = await screen.findByRole('button', { name: '上传证明' });
    expect(checkInButton).not.toBeDisabled();
    expect(reviewButton).not.toBeDisabled();
    expect(proofButton).not.toBeDisabled();

    fireEvent.click(checkInButton);
    await waitFor(() =>
      expect(actionStreamSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 101,
          action: 'activity.check_in',
          payload: expect.objectContaining({ activityId: 700, candidateUserId: 22 }),
        }),
        expect.any(Function),
        expect.any(AbortSignal),
      ),
    );
    await waitFor(() =>
      expect(getEnabledSchemaActionButton('activity.check_in')).toHaveAttribute(
        'data-action-state',
        'succeeded',
      ),
    );

    expect(getEnabledSchemaActionButton('review.submit')).toBeNull();
    expect(getEnabledSchemaActionButton('activity.upload_proof')).toBeNull();
  });

  it('executes Meet Loop time and location modification actions through assistant-ui cards', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'updateThread').mockResolvedValue({
      thread: {
        id: '101',
        threadId: 101,
        taskId: 101,
        title: '改期调整',
        preview: '准备调整时间或地点',
        status: 'regular',
        goal: '改期调整',
        messageCount: 1,
        updatedAt: '2026-06-13T12:00:00.000Z',
        createdAt: '2026-06-13T12:00:00.000Z',
      },
    });
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      const response: UserFacingAgentResponse = {
        ...mockResponse(),
        assistantMessage: '如果时间或地点不合适，我会先生成调整草稿，不会自动通知对方。',
        cards: [
          {
            id: 'meet-loop-reschedule-actions',
            type: 'review_card',
            title: '改期调整',
            body: '改时间和改地点都会先停在确认边界内。',
            status: 'ready',
            data: {
              taskId: 101,
              schemaName: 'MeetLoopTimelineCard',
              schemaVersion: 'fitmeet.tool-ui.v1',
              schemaType: 'meet_loop.timeline',
              activityId: 700,
              candidateUserId: 22,
              loopStage: 'message_sent',
              timeline: {
                title: '改期调整',
                description: '不会自动通知对方。',
                nextAction: '告诉我新的时间或地点，我会生成改期草稿。',
              },
            },
            actions: [
              {
                id: 'modify-time',
                label: '修改卡片',
                action: 'activity.modify_time',
                schemaAction: 'activity.modify_time',
                requiresConfirmation: false,
                payload: {
                  taskId: 101,
                  activityId: 700,
                  candidateUserId: 22,
                  proposedTime: '周日 16:00',
                },
              },
              {
                id: 'modify-location',
                label: '修改卡片',
                action: 'activity.modify_location',
                schemaAction: 'activity.modify_location',
                requiresConfirmation: false,
                payload: {
                  taskId: 101,
                  activityId: 700,
                  candidateUserId: 22,
                  proposedLocation: '五四广场附近公共路线',
                },
              },
            ],
          },
        ],
      };
      onEvent({ type: 'result', result: response });
      return response;
    });
    const actionStreamSpy = vi
      .spyOn(socialAgentApi, 'performActionStream')
      .mockImplementation(async (data, onEvent) => {
        const nextActions: FitMeetAlphaCardAction[] =
          data.action === 'activity.modify_time'
            ? [
                {
                  id: 'modify-location-next',
                  label: '修改卡片',
                  action: 'activity.modify_location',
                  schemaAction: 'activity.modify_location',
                  requiresConfirmation: false,
                  payload: {
                    taskId: 101,
                    activityId: 700,
                    candidateUserId: 22,
                    proposedLocation: '五四广场附近公共路线',
                  },
                },
              ]
            : [];
        const response: UserFacingAgentResponse = {
          ...mockResponse(),
          assistantMessage: `已准备 ${data.action} 调整草稿，确认前不会通知对方。`,
          cards:
            nextActions.length > 0
              ? [
                  {
                    id: `meet-loop-reschedule-actions-${data.action}`,
                    type: 'review_card',
                    title: '改期调整',
                    body: '继续调整下一步。',
                    status: 'ready',
                    data: {
                      taskId: 101,
                      schemaName: 'MeetLoopTimelineCard',
                      schemaVersion: 'fitmeet.tool-ui.v1',
                      schemaType: 'meet_loop.timeline',
                      activityId: 700,
                      candidateUserId: 22,
                      loopStage: 'message_sent',
                      timeline: {
                        title: '改期调整',
                        description: '不会自动通知对方。',
                        nextAction: '继续调整下一步。',
                      },
                    },
                    actions: nextActions,
                  },
                ]
              : [],
        };
        onEvent({ type: 'result', result: response });
        return response;
      });
    await renderAgentPage();

    submitPrompt('这次约练可能需要改时间或改地点');

    await screen.findByTestId('assistant-ui-generative-cards');
    const modifyTimeButton = getEnabledSchemaActionButton('activity.modify_time');
    const modifyLocationButton = getEnabledSchemaActionButton('activity.modify_location');
    expect(modifyTimeButton).not.toBeNull();
    expect(modifyLocationButton).not.toBeNull();
    expect(modifyTimeButton).not.toBeDisabled();
    expect(modifyLocationButton).not.toBeDisabled();

    fireEvent.click(modifyTimeButton as HTMLButtonElement);
    await waitFor(() =>
      expect(actionStreamSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 101,
          action: 'activity.modify_time',
          payload: expect.objectContaining({
            activityId: 700,
            candidateUserId: 22,
            proposedTime: '周日 16:00',
          }),
        }),
        expect.any(Function),
        expect.any(AbortSignal),
      ),
    );
    await waitFor(() =>
      expect(getEnabledSchemaActionButton('activity.modify_time')).toHaveAttribute(
        'data-action-state',
        'succeeded',
      ),
    );

    expect(getEnabledSchemaActionButton('activity.modify_location')).toBeNull();
  });

  it('shows confirm send only inside an opener approval card', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'updateThread').mockResolvedValue({
      thread: {
        id: '101',
        threadId: 101,
        taskId: 101,
        title: '确认开场白',
        preview: '发送前确认',
        status: 'regular',
        goal: '确认开场白',
        messageCount: 1,
        updatedAt: '2026-06-13T12:00:00.000Z',
        createdAt: '2026-06-13T12:00:00.000Z',
      },
    });
    const openerApproval: UserFacingAgentResponse = {
      ...mockResponse(),
      assistantMessage: '我先写好了开场白，确认后我再发送。',
      lightStatus: '正在等待你确认' as const,
      cards: [
        {
          id: 'opener-approval-1',
          type: 'opener_approval',
          title: '发送前确认',
          body: '确认前不会发送给对方。',
          status: 'waiting_confirmation',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'safety.approval',
          data: {
            taskId: 101,
            schemaName: 'SafetyApprovalCard',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'safety.approval',
            targetUserId: 22,
            approval: {
              title: '发送前确认',
              boundary: '这会向小林发送一条站内消息，确认前不会执行。',
              riskLevel: 'medium',
              reasons: ['首次联系需要你确认', '不会共享你的联系方式或精确位置'],
              confirmationLabel: '确认发送',
              checkpointLabel: '进度已保存',
            },
            auditNote: '确认后会写入动作日志。',
          },
          actions: [
            {
              id: 'opener-confirm-send',
              label: '确认发送',
              action: 'send_message',
              schemaAction: 'opener.confirm_send',
              requiresConfirmation: true,
              payload: {
                taskId: 101,
                targetUserId: 22,
                message: '周末下午如果方便，我们可以先在公共路线轻松跑一圈。',
                traceId: 'hidden-trace',
              },
            },
          ],
        },
      ],
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({ type: 'result', result: openerApproval });
      return openerApproval;
    });
    const actionStreamSpy = vi
      .spyOn(socialAgentApi, 'performActionStream')
      .mockImplementation(async (_data, onEvent) => {
        const response: UserFacingAgentResponse = {
          ...mockResponse(),
          assistantMessage: '已从确认点继续处理。',
          workflow: mockWorkflow('agent-task:101', 'RECOVERY', {
            recoveryMessage: '已从确认点继续处理。',
          }),
          cards: [
            {
              id: 'meet-loop-message-sent',
              type: 'review_card',
              title: '约练进展',
              body: '邀请已经按你的确认发送。',
              status: 'ready',
              data: {
                taskId: 101,
                schemaName: 'MeetLoopTimelineCard',
                schemaVersion: 'fitmeet.tool-ui.v1',
                schemaType: 'meet_loop.timeline',
                loopStage: 'message_sent',
                connectionState: 'waiting_reply',
                waitingFor: 'counterpart_reply',
                nextRecoverableActions: [
                  'meet_loop.resume',
                  'activity.modify_time',
                  'activity.modify_location',
                ],
                sideEffectPolicy: 'no_followup_without_user_confirmation',
                timeline: {
                  title: '约练进展',
                  description: '邀请已经按你的确认发送，后续回复会继续保存在这里。',
                  nextAction: '等待对方回复；如果时间不合适，可以再调整。',
                  recoveryProtocol: [
                    {
                      key: 'checkpoint',
                      label: '可继续',
                      detail: '刷新或断线后，也可以回到当前邀约进度继续处理。',
                    },
                    {
                      key: 'waiting_for',
                      label: '等待对象',
                      detail: '正在等待对方回复',
                    },
                    {
                      key: 'side_effect',
                      label: '触达边界',
                      detail: '不会自动追发、加好友、创建活动或公开发布。',
                    },
                    {
                      key: 'resume',
                      label: '恢复方式',
                      detail: '继续聊天、改期或发起约练前都会再次确认。',
                    },
                  ],
                  steps: [
                    {
                      key: 'opener',
                      label: '开场白已发送',
                      state: 'done',
                      description: '你确认后，我才发送了这条消息。',
                    },
                    {
                      key: 'reply',
                      label: '等待回复',
                      state: 'current',
                      description: '对方回复后，我会继续推进确认或改期。',
                      checkpointReady: true,
                      resumeMode: 'resume',
                    },
                    {
                      key: 'review',
                      label: '见面后评价',
                      state: 'next',
                      description: '完成后可以评价体验并回写画像。',
                      resumeMode: 'memory',
                    },
                  ],
                },
              },
              actions: [
                {
                  id: 'meet-loop-resume',
                  label: '继续推进',
                  action: 'meet_loop.resume',
                  schemaAction: 'meet_loop.resume',
                  requiresConfirmation: true,
                  payload: { taskId: 101, checkpointId: 7001 },
                },
              ],
            },
          ],
        };
        onEvent({ type: 'result', result: response });
        return response;
      });

    await renderAgentPage();

    submitPrompt('帮我给小林发送这句开场白');

    expect(await screen.findByText('发送前确认')).toBeInTheDocument();
    expect(
      await screen.findByText('这会向小林发送一条站内消息，确认前不会执行。'),
    ).toBeInTheDocument();
    const openerGuardrails = await screen.findByTestId('assistant-ui-approval-guardrails');
    expect(openerGuardrails).toHaveAttribute('data-risk-level', 'medium');
    expect(openerGuardrails).toHaveTextContent('不同意就不会执行');
    expect(openerGuardrails).toHaveTextContent('同意后我会接着处理');
    expect(openerGuardrails).toHaveTextContent('想改内容，直接告诉我');
    expect(screen.queryByRole('button', { name: '发邀请' })).not.toBeInTheDocument();
    const confirmButton = getEnabledSchemaActionButton('opener.confirm_send') as HTMLButtonElement;
    expect(confirmButton).toHaveAttribute('data-schema-action', 'opener.confirm_send');
    expect(confirmButton).toHaveAttribute('data-requires-confirmation', 'true');

    fireEvent.click(confirmButton);

    await waitFor(() =>
      expect(actionStreamSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 101,
          action: 'opener.confirm_send',
          payload: expect.objectContaining({
            taskId: 101,
            targetUserId: 22,
            message: '周末下午如果方便，我们可以先在公共路线轻松跑一圈。',
          }),
        }),
        expect.any(Function),
        expect.any(AbortSignal),
      ),
    );
    expect(JSON.stringify(actionStreamSpy.mock.calls[0]?.[0]?.payload ?? {})).not.toContain(
      'hidden-trace',
    );
    const meetLoopTimelines = await screen.findAllByTestId('meet-loop-timeline');
    const meetLoopTimeline = meetLoopTimelines.find((node) =>
      node.textContent?.includes('开场白已发送'),
    );
    expect(meetLoopTimeline).toBeDefined();
    const currentMeetLoopTimeline = meetLoopTimeline as HTMLElement;
    expect(currentMeetLoopTimeline).toBeInTheDocument();
    expect(within(currentMeetLoopTimeline).getByText('开场白已发送')).toBeInTheDocument();
    expect(within(currentMeetLoopTimeline).getAllByText('等待回复').length).toBeGreaterThan(0);
    expect(within(currentMeetLoopTimeline).getAllByText('可以继续').length).toBeGreaterThan(0);
    expect(within(currentMeetLoopTimeline).getAllByText('继续').length).toBeGreaterThan(0);
    const waitingReplyNote = screen.getByTestId('meet-loop-waiting-reply-note');
    expect(waitingReplyNote).toHaveTextContent('邀请已发出，正在等待对方回复');
    expect(waitingReplyNote).toHaveTextContent('不会自动追发消息');
    const meetLoopCard = screen.getByTestId('assistant-ui-meet-loop-card');
    expect(meetLoopCard).toHaveTextContent('可继续');
    expect(meetLoopCard).toHaveTextContent('可修改卡片');
    expect(screen.getByTestId('meet-loop-recovery-protocol')).toHaveTextContent('可继续');
    expect(screen.getByTestId('meet-loop-recovery-protocol')).toHaveTextContent(
      '回到当前邀约进度继续处理',
    );
    expect(screen.getByTestId('meet-loop-recovery-protocol')).toHaveTextContent('触达边界');
    expect(screen.getByTestId('meet-loop-recovery-protocol')).toHaveTextContent(
      '不会自动追发、加好友、创建活动或公开发布',
    );
    expect(screen.getByTestId('meet-loop-recovery-protocol')).toHaveTextContent('恢复方式');
    expect(waitingReplyNote).toHaveAttribute(
      'data-side-effect-policy',
      'no_followup_without_user_confirmation',
    );
    const resumeButton = getEnabledSchemaActionButton('meet_loop.resume');
    expect(resumeButton).toBeDefined();
    const currentResumeButton = resumeButton as HTMLButtonElement;
    expect(currentResumeButton).toHaveAttribute('data-schema-action', 'meet_loop.resume');
  });

  it('drives the friendship main chain through assistant-ui Tool UI message parts', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'updateThread').mockResolvedValue({
      thread: {
        id: '101',
        threadId: 101,
        taskId: 101,
        title: '周末跑步新朋友',
        preview: '继续推进邀请',
        status: 'regular',
        goal: '周末跑步新朋友',
        messageCount: 1,
        updatedAt: '2026-06-13T12:00:00.000Z',
        createdAt: '2026-06-13T12:00:00.000Z',
      },
    });
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      const response = mockCandidateResponse();
      onEvent({ type: 'result', result: response });
      return response;
    });
    const actionStreamSpy = vi
      .spyOn(socialAgentApi, 'performActionStream')
      .mockImplementation(async (data, onEvent) => {
        const response: UserFacingAgentResponse =
          data.action === 'candidate.generate_opener'
            ? {
                ...mockResponse(),
                assistantMessage: '我先写好了开场白，确认后我再发送。',
                lightStatus: '正在等待你确认' as const,
                cards: [
                  {
                    id: 'opener-approval-main-chain',
                    type: 'opener_approval',
                    title: '发送前确认',
                    body: '周末下午如果方便，我们可以先在公共场所轻松跑一圈。',
                    status: 'waiting_confirmation',
                    schemaVersion: 'fitmeet.tool-ui.v1',
                    schemaType: 'safety.approval',
                    data: {
                      taskId: 101,
                      schemaName: 'SafetyApprovalCard',
                      schemaVersion: 'fitmeet.tool-ui.v1',
                      schemaType: 'safety.approval',
                      targetUserId: 22,
                      approval: {
                        title: '发送前确认',
                        boundary: '这会向小林发送一条站内消息，确认前不会执行。',
                        riskLevel: 'medium',
                        reasons: ['首次联系需要你确认', '不会共享联系方式或精确位置'],
                        confirmationLabel: '确认发送',
                        checkpointLabel: '进度已保存',
                      },
                    },
                    actions: [
                      {
                        id: 'opener-confirm-main-chain',
                        label: '确认发送',
                        action: 'send_message',
                        schemaAction: 'opener.confirm_send',
                        requiresConfirmation: true,
                        payload: {
                          taskId: 101,
                          approvalId: 9001,
                          targetUserId: 22,
                          message: '周末下午如果方便，我们可以先在公共场所轻松跑一圈。',
                        },
                      },
                      {
                        id: 'opener-reject-main-chain',
                        label: '取消发送',
                        action: 'opener.reject',
                        schemaAction: 'opener.reject',
                        requiresConfirmation: false,
                        payload: { taskId: 101, approvalId: 9001 },
                      },
                    ],
                  },
                ],
              }
            : data.action === 'opener.confirm_send'
              ? {
                  ...mockResponse(),
                  assistantMessage: '发送邀请前需要你确认。',
                  lightStatus: '正在等待你确认' as const,
                  cards: [],
                  pendingConfirmations: [
                    {
                      id: 9001,
                      type: 'approval_required',
                      actionType: 'send_invite',
                      summary: '确认后才会把这条邀请发给小林。',
                      riskLevel: 'medium',
                      expiresAt: null,
                    },
                  ],
                }
              : {
                  ...mockResponse(),
                  assistantMessage: '已确认发送给小林，接下来等待对方回复。',
                  workflow: mockWorkflow('agent-task:101', 'RECOVERY', {
                    recoveryMessage: '已确认发送给小林，接下来等待对方回复。',
                  }),
                  cards: [
                    {
                      id: 'meet-loop-main-chain',
                      type: 'review_card',
                      title: '邀约进展',
                      body: '开场白已按你的确认发送。',
                      status: 'ready',
                      schemaVersion: 'fitmeet.tool-ui.v1',
                      schemaType: 'meet_loop.timeline',
                      data: {
                        taskId: 101,
                        schemaName: 'MeetLoopTimelineCard',
                        schemaVersion: 'fitmeet.tool-ui.v1',
                        schemaType: 'meet_loop.timeline',
                        candidateUserId: 22,
                        loopStage: 'message_sent',
                        timeline: {
                          title: '邀约进展',
                          description: '开场白已发送，后续回复会继续保存在这里。',
                          nextAction: '等待对方回复；如果时间不合适，可以继续改期。',
                          steps: [
                            {
                              key: 'opener',
                              label: '开场白已发送',
                              state: 'done',
                              description: '你确认后，我才发送了这条消息。',
                            },
                            {
                              key: 'reply',
                              label: '等待回复',
                              state: 'current',
                              description: '对方回复后，我会继续推进确认或改期。',
                              checkpointReady: true,
                              resumeMode: 'resume',
                            },
                            {
                              key: 'review',
                              label: '见面后评价',
                              state: 'next',
                              description: '完成后可以评价体验并回写画像。',
                              resumeMode: 'memory',
                            },
                          ],
                        },
                      },
                      actions: [
                        {
                          id: 'meet-loop-main-chain-resume',
                          label: '继续推进',
                          action: 'meet_loop.resume',
                          schemaAction: 'meet_loop.resume',
                          requiresConfirmation: true,
                          payload: { taskId: 101, checkpointId: 7101 },
                        },
                      ],
                    },
                  ],
                };
        onEvent({ type: 'result', result: response });
        return response;
      });
    const approveSpy = vi.spyOn(agentApprovalsApi, 'approve').mockResolvedValue({
      ok: true,
      status: 'approved',
      dispatched: true,
      result: {
        targetUserId: 22,
        candidateRecordId: 501,
        socialRequestId: 301,
        conversationId: 'conv-22',
        openedConversation: true,
      },
    });

    await renderAgentPage();

    submitPrompt('我想找青岛周末下午一起轻松跑步的新朋友');

    expect(await screen.findByText('小林')).toBeInTheDocument();
    await screen.findAllByRole('button', { name: '生成开场白' });
    const openerButton = getEnabledSchemaActionButton(
      'candidate.generate_opener',
    ) as HTMLButtonElement;
    expect(openerButton).toHaveAttribute('data-schema-action', 'candidate.generate_opener');
    fireEvent.click(openerButton);

    await waitFor(() =>
      expect(actionStreamSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 101,
          action: 'candidate.generate_opener',
        }),
        expect.any(Function),
        expect.any(AbortSignal),
      ),
    );
    const openerDraft = await screen.findByTestId('assistant-ui-inline-draft-preview');
    expect(openerDraft).toHaveTextContent('周末下午如果方便，我们可以先在公共场所轻松跑一圈。');
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();
    const confirmButton = getEnabledSchemaActionButton('opener.confirm_send') as HTMLButtonElement;
    expect(confirmButton).toHaveAttribute('data-schema-action', 'opener.confirm_send');
    expect(confirmButton).toHaveAttribute('data-requires-confirmation', 'true');
    fireEvent.click(confirmButton);

    await waitFor(() =>
      expect(actionStreamSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 101,
          action: 'opener.confirm_send',
          payload: expect.objectContaining({
            targetUserId: 22,
          }),
        }),
        expect.any(Function),
        expect.any(AbortSignal),
      ),
    );
    const inlineApproval = await screen.findByTestId('assistant-ui-inline-approval-panel');
    expect(inlineApproval).toHaveTextContent('确认发送邀请');
    fireEvent.click(within(inlineApproval).getByRole('button', { name: '确认发送' }));

    await waitFor(() => expect(approveSpy).toHaveBeenCalledWith(9001));
    const meetLoopTimelines = await screen.findAllByTestId('meet-loop-timeline');
    const meetLoopTimeline = meetLoopTimelines.find((node) =>
      node.textContent?.includes('等待回复'),
    );
    expect(meetLoopTimeline).toBeDefined();
    const currentMeetLoopTimeline = meetLoopTimeline as HTMLElement;
    expect(currentMeetLoopTimeline).toBeInTheDocument();
    expect(within(currentMeetLoopTimeline).getByText('发起')).toBeInTheDocument();
    expect(within(currentMeetLoopTimeline).getAllByText('等待回复').length).toBeGreaterThan(0);
    const resumeButton = getEnabledSchemaActionButton('meet_loop.resume');
    expect(resumeButton).toBeDefined();
    const currentResumeButton = resumeButton as HTMLButtonElement;
    expect(currentResumeButton).toHaveAttribute('data-schema-action', 'meet_loop.resume');
    expect(document.body.textContent ?? '').not.toMatch(forbiddenUserArtifacts);
  });

  it('rejects an opener approval from the assistant-ui message part without leaking debug payload', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'updateThread').mockResolvedValue({
      thread: {
        id: '101',
        threadId: 101,
        taskId: 101,
        title: '取消发送这条开场白',
        preview: '已取消这次发送',
        status: 'regular',
        goal: '取消发送这条开场白',
        messageCount: 3,
        updatedAt: '2026-06-06T00:00:00.000Z',
        createdAt: '2026-06-06T00:00:00.000Z',
      },
    });
    const openerApproval: UserFacingAgentResponse = {
      ...mockResponse(),
      assistantMessage: '这条开场白需要你确认，取消后不会联系对方。',
      lightStatus: '正在等待你确认' as const,
      cards: [
        {
          id: 'opener-approval-reject',
          type: 'opener_approval',
          title: '发送前确认',
          body: '确认前不会发送给对方。',
          status: 'waiting_confirmation',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'safety.approval',
          data: {
            taskId: 101,
            schemaName: 'SafetyApprovalCard',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'safety.approval',
            targetUserId: 22,
            approval: {
              title: '发送前确认',
              boundary: '这会向小林发送一条站内消息，确认前不会执行。',
              riskLevel: 'medium',
              reasons: ['首次联系需要你确认'],
              confirmationLabel: '确认发送',
              checkpointLabel: '进度已保存',
            },
          },
          actions: [
            {
              id: 'opener-reject',
              label: '取消发送',
              action: 'opener.reject',
              schemaAction: 'opener.reject',
              requiresConfirmation: false,
              payload: {
                taskId: 101,
                approvalId: 9001,
                targetUserId: 22,
                traceId: 'hidden-trace',
                rawJson: { planner: 'hidden-planner' },
              },
            },
          ],
        },
      ],
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({ type: 'result', result: openerApproval });
      return openerApproval;
    });
    const actionStreamSpy = vi
      .spyOn(socialAgentApi, 'performActionStream')
      .mockImplementation(async (_data, onEvent) => {
        const response = {
          ...mockResponse(),
          assistantMessage: '已取消这次发送，未联系对方。',
          cards: [],
          taskId: 101,
        };
        onEvent({ type: 'result', result: response });
        return response;
      });

    await renderAgentPage();

    submitPrompt('取消发送这条开场白');

    const rejectButton = await screen.findByRole('button', { name: '取消发送' });
    expect(rejectButton).toHaveAttribute('data-schema-action', 'opener.reject');
    expect(rejectButton).toHaveAttribute('data-requires-confirmation', 'false');
    fireEvent.click(rejectButton);

    await waitFor(() =>
      expect(actionStreamSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 101,
          action: 'opener.reject',
          payload: expect.objectContaining({
            taskId: 101,
            approvalId: 9001,
            targetUserId: 22,
          }),
        }),
        expect.any(Function),
        expect.any(AbortSignal),
      ),
    );
    expect(JSON.stringify(actionStreamSpy.mock.calls[0]?.[0]?.payload ?? {})).not.toContain(
      'hidden-trace',
    );
    expect(JSON.stringify(actionStreamSpy.mock.calls[0]?.[0]?.payload ?? {})).not.toContain(
      'planner',
    );
    await waitFor(() =>
      expect(
        screen
          .getAllByText('已取消这次发送，未联系对方。')
          .some((node) => node instanceof HTMLElement),
      ).toBe(true),
    );
    expect(getEnabledSchemaActionButton('opener.confirm_send')).toBeNull();
  });

  it('keeps card actions serial, marks failures, and lets the user retry from the same message part', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      const response = mockCandidateResponse();
      onEvent({ type: 'result', result: response });
      return response;
    });
    const actionStreamSpy = vi
      .spyOn(socialAgentApi, 'performActionStream')
      .mockRejectedValueOnce(new Error('工具暂时不可用，请稍后重试。'))
      .mockImplementationOnce(async (_data, onEvent) => {
        const response = {
          ...mockResponse(),
          assistantMessage: '已重新生成开场白。',
          cards: [],
          taskId: 101,
        };
        onEvent({ type: 'result', result: response });
        return response;
      });

    await renderAgentPage();

    submitPrompt('我想找周末跑步搭子');

    await screen.findAllByRole('button', { name: '生成开场白' });
    const openerButton = getEnabledSchemaActionButton(
      'candidate.generate_opener',
    ) as HTMLButtonElement;
    fireEvent.click(openerButton);

    const failedButton = await waitFor(() => {
      const button = getEnabledSchemaActionButton('candidate.generate_opener');
      expect(button).toHaveAttribute('data-action-state', 'failed');
      return button as HTMLButtonElement;
    });
    expect(failedButton).toHaveAttribute('data-action-state', 'failed');
    expect(failedButton).toHaveAttribute('data-action-executable', 'true');
    expect(failedButton).toHaveAttribute('data-action-retryable', 'true');
    expect(failedButton).toHaveAttribute('data-action-handler', 'available');
    expect(failedButton).toHaveAttribute('aria-busy', 'false');
    expect(failedButton).not.toBeDisabled();
    expect(screen.getByTestId('assistant-ui-card-action-error')).toHaveAttribute(
      'data-schema-action',
      'candidate.generate_opener',
    );
    expect(screen.getByTestId('assistant-ui-card-action-error')).not.toHaveTextContent(
      '这一步暂时没有完成',
    );
    expect(screen.getByTestId('assistant-ui-card-action-error')).not.toHaveTextContent(
      '操作没有完成',
    );

    await act(async () => {
      fireEvent.click(failedButton);
      await Promise.resolve();
    });

    await waitFor(() => expect(actionStreamSpy).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(getEnabledSchemaActionButton('candidate.generate_opener')).toHaveAttribute(
        'data-action-state',
        'succeeded',
      ),
    );
    expect(screen.queryByTestId('assistant-ui-card-action-error')).not.toBeInTheDocument();
  });

  it('uses schema action copy and payloads for backend-provided Tool UI actions', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const streamed = mockCandidateResponse();
    streamed.cards[0] = {
      ...streamed.cards[0],
      actions: [
        {
          id: 'candidate-like',
          label: '记住这个偏好',
          action: 'save_candidate',
          schemaAction: 'candidate.like',
          requiresConfirmation: false,
          payload: { taskId: 101, candidateId: 501, preference: 'running_weekend' },
        },
      ],
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({ type: 'result', result: streamed });
      return streamed;
    });
    const actionStreamSpy = vi
      .spyOn(socialAgentApi, 'performActionStream')
      .mockImplementation(async (_data, onEvent) => {
        const response = {
          ...mockResponse(),
          assistantMessage: '已记录这个推荐偏好。',
          cards: [],
          taskId: 101,
        };
        onEvent({ type: 'result', result: response });
        return response;
      });

    await renderAgentPage();

    submitPrompt('我想找一个周末跑步搭子');
    await screen.findAllByRole('button', { name: '收藏' });
    const likeButton = document.querySelector(
      'button[data-schema-action="candidate.like"][data-action-source="backend"]',
    ) as HTMLButtonElement | null;
    expect(likeButton).not.toBeNull();
    expect(likeButton).toHaveAttribute('data-schema-action', 'candidate.like');
    fireEvent.click(likeButton as HTMLButtonElement);

    await waitFor(() => expect(actionStreamSpy).toHaveBeenCalled());
    expect(actionStreamSpy.mock.calls[0]?.[0]).toMatchObject({
      action: 'candidate.like',
      payload: expect.objectContaining({
        taskId: 101,
        candidateId: 501,
        preference: 'running_weekend',
      }),
    });
    await waitFor(() =>
      expect(getEnabledSchemaActionButton('candidate.like')).toHaveAttribute(
        'data-action-state',
        'succeeded',
      ),
    );
    expect(screen.queryByTestId('assistant-ui-card-action-result')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '生成开场白' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '发送邀请' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '加好友并聊天' }).length).toBeGreaterThan(0);
  });

  it('keeps candidate low-risk actions in one card and opens high-risk approvals inline only', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const streamed = mockCandidateResponse();
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({ type: 'result', result: streamed });
      return streamed;
    });
    const actionStreamSpy = vi
      .spyOn(socialAgentApi, 'performActionStream')
      .mockImplementation(async (data, onEvent) => {
        const action = String(data.action);
        const response: UserFacingAgentResponse = {
          ...mockResponse(),
          assistantMessage:
            action === 'candidate.generate_opener'
              ? '我准备了一句更自然的开场白。'
              : action === 'candidate.like'
                ? '已收藏这个候选，后续推荐会参考。'
                : '这一步需要你确认。',
          cards:
            action === 'candidate.generate_opener'
              ? [
                  {
                    ...streamed.cards[0],
                    id: 'opener-draft-501',
                    title: '小林 的开场白草稿',
                    body: '周末下午如果方便，我们可以先在公共场所轻松跑一圈。',
                    data: {
                      ...streamed.cards[0].data,
                      openerDraftReady: true,
                      suggestedOpener: '周末下午如果方便，我们可以先在公共场所轻松跑一圈。',
                    },
                  },
                ]
              : [],
          pendingConfirmations:
            action === 'opener.confirm_send'
              ? [
                  {
                    id: 8910,
                    type: 'approval_required',
                    actionType: 'send_invite',
                    summary: '确认后才会把这条邀请发给小林。',
                    riskLevel: 'medium',
                    expiresAt: null,
                  },
                ]
              : action === 'candidate.connect'
                ? [
                    {
                      id: 8911,
                      type: 'approval_required',
                      actionType: 'connect_candidate',
                      summary: '确认后才会加好友并打开后续聊天入口。',
                      riskLevel: 'medium',
                      expiresAt: null,
                    },
                  ]
                : [],
        };
        onEvent({ type: 'result', result: response });
        return response;
      });

    const approveSpy = vi.spyOn(agentApprovalsApi, 'approve').mockResolvedValue({
      ok: true,
      status: 'approved',
      dispatched: true,
      result: {
        targetUserId: 22,
        friendRequestId: '601',
        conversationId: 'conv-22',
        openedConversation: true,
        socialRequestId: 301,
        candidateRecordId: 501,
      },
    });
    const rejectSpy = vi.spyOn(agentApprovalsApi, 'reject').mockResolvedValue({
      ok: true,
      status: 'rejected',
    });

    await renderAgentPage();

    submitPrompt('我想找一个周末跑步搭子');
    await waitFor(() => expect(getEnabledSchemaActionButton('candidate.like')).not.toBeNull());
    expect(screen.getAllByTestId('assistant-ui-unified-action-card').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('assistant-ui-inline-approval-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();

    fireEvent.click(getEnabledSchemaActionButton('candidate.like') as HTMLButtonElement);
    await waitFor(() =>
      expect(actionStreamSpy).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'candidate.like' }),
        expect.any(Function),
        expect.any(AbortSignal),
      ),
    );
    await waitFor(() =>
      expect(getEnabledSchemaActionButton('candidate.like')).toHaveAttribute(
        'data-action-state',
        'succeeded',
      ),
    );
    expect(screen.queryByTestId('assistant-ui-inline-approval-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '发送邀请' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '加好友并聊天' }).length).toBeGreaterThan(0);

    fireEvent.click(getEnabledSchemaActionButton('candidate.generate_opener') as HTMLButtonElement);
    await waitFor(() =>
      expect(actionStreamSpy).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'candidate.generate_opener' }),
        expect.any(Function),
        expect.any(AbortSignal),
      ),
    );
    await waitFor(() =>
      expect(getEnabledSchemaActionButton('candidate.generate_opener')).toHaveAttribute(
        'data-action-state',
        'succeeded',
      ),
    );
    const inlineDraft = await screen.findByTestId('assistant-ui-inline-draft-preview');
    expect(inlineDraft).toHaveTextContent('小林 的开场白草稿');
    expect(inlineDraft).toHaveTextContent('周末下午如果方便，我们可以先在公共场所轻松跑一圈。');
    expect(screen.queryByTestId('assistant-ui-inline-approval-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();

    fireEvent.click(getEnabledSchemaActionButton('opener.confirm_send') as HTMLButtonElement);
    const sendApproval = await screen.findByTestId('assistant-ui-inline-approval-panel');
    expect(sendApproval).toHaveTextContent('确认发送邀请');
    expect(sendApproval).toHaveTextContent('确认后才会把这条邀请发给小林。');
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();

    fireEvent.click(within(sendApproval).getByRole('button', { name: '取消' }));
    await waitFor(() => expect(rejectSpy).toHaveBeenCalledWith(8910));
    await waitFor(() =>
      expect(screen.queryByTestId('assistant-ui-inline-approval-panel')).not.toBeInTheDocument(),
    );
    const rejectedOutcome = await screen.findByTestId('assistant-ui-inline-outcome-preview');
    expect(rejectedOutcome).toHaveTextContent('已取消');
    expect(rejectedOutcome).toHaveTextContent('不会继续执行');

    fireEvent.click(getEnabledSchemaActionButton('candidate.connect') as HTMLButtonElement);
    const connectApproval = await screen.findByTestId('assistant-ui-inline-approval-panel');
    expect(connectApproval).toHaveTextContent('确认加好友并聊天');
    expect(connectApproval).toHaveTextContent('确认后才会加好友并打开后续聊天入口。');
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();

    fireEvent.click(within(connectApproval).getByRole('button', { name: '确认加好友' }));
    await waitFor(() => expect(approveSpy).toHaveBeenCalledWith(8911));
    const inlineOutcome = await screen.findByTestId('assistant-ui-inline-outcome-preview');
    expect(inlineOutcome).toHaveTextContent('邀约进展');
    expect(inlineOutcome).toHaveTextContent('站内沟通入口');
  });

  it('does not promote replayed low-risk candidate likes into approval cards', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const streamed = {
      ...mockCandidateResponse(),
      pendingConfirmations: [
        {
          id: 8820,
          type: 'approval_required',
          actionType: 'candidate.like',
          summary: '收藏候选陈砚，后续推荐会参考。',
          riskLevel: 'low',
          expiresAt: null,
        },
      ],
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({ type: 'result', result: streamed });
      return streamed;
    });

    await renderAgentPage();

    submitPrompt('我想找一个周末跑步搭子');
    await waitFor(() => expect(getEnabledSchemaActionButton('candidate.like')).not.toBeNull());

    expect(screen.getAllByTestId('assistant-ui-unified-action-card').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-inline-approval-panel')).not.toBeInTheDocument();
    expect(getEnabledSchemaActionButton('candidate.like')).toHaveAttribute(
      'data-requires-confirmation',
      'false',
    );
  });

  it('keeps low-risk candidate actions inline even when backend marks them as requiring confirmation', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const streamed = mockCandidateResponse();
    streamed.cards[0] = {
      ...streamed.cards[0],
      actions: [
        {
          id: 'backend-like-confirmed',
          label: '收藏',
          action: 'save_candidate',
          schemaAction: 'candidate.like',
          requiresConfirmation: true,
          payload: { taskId: 101, candidateRecordId: 501 },
        },
        {
          id: 'backend-opener-confirmed',
          label: '生成开场白',
          action: 'generate_opener',
          schemaAction: 'candidate.generate_opener',
          requiresConfirmation: true,
          payload: { taskId: 101, candidateRecordId: 501 },
        },
      ],
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({ type: 'result', result: streamed });
      return streamed;
    });
    const actionStreamSpy = vi
      .spyOn(socialAgentApi, 'performActionStream')
      .mockImplementation(async (_data, onEvent) => {
        const response: UserFacingAgentResponse = {
          ...mockResponse(),
          assistantMessage: '已记录，不会触达对方。',
          cards: [],
          pendingConfirmations: [],
        };
        onEvent({ type: 'result', result: response });
        return response;
      });

    await renderAgentPage();

    submitPrompt('我想找一个周末跑步搭子');
    await waitFor(() => expect(getEnabledSchemaActionButton('candidate.like')).not.toBeNull());
    const likeButton = getEnabledSchemaActionButton('candidate.like');
    const openerButton = getEnabledSchemaActionButton('candidate.generate_opener');
    expect(likeButton).not.toBeNull();
    expect(openerButton).not.toBeNull();
    expect(likeButton).toHaveAttribute('data-requires-confirmation', 'false');
    expect(openerButton).toHaveAttribute('data-requires-confirmation', 'false');
    expect(screen.queryByTestId('assistant-ui-inline-approval-panel')).not.toBeInTheDocument();

    fireEvent.click(likeButton as HTMLButtonElement);

    await waitFor(() =>
      expect(actionStreamSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'candidate.like',
          payload: expect.not.objectContaining({
            approvalRequired: true,
            checkpointRequired: true,
          }),
        }),
        expect.any(Function),
        expect.any(AbortSignal),
      ),
    );
    expect(screen.queryByTestId('assistant-ui-inline-approval-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();
  });

  it('executes backend-provided canonical action fields without requiring schemaAction', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const streamed = mockCandidateResponse();
    streamed.cards[0] = {
      ...streamed.cards[0],
      actions: [
        {
          id: 'candidate-connect-canonical',
          label: '加好友',
          action: 'candidate.connect',
          requiresConfirmation: false,
          payload: { taskId: 101, candidateId: 501, targetUserId: 22 },
        },
      ],
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({ type: 'result', result: streamed });
      return streamed;
    });
    const actionStreamSpy = vi
      .spyOn(socialAgentApi, 'performActionStream')
      .mockImplementation(async (_data, onEvent) => {
        const response: UserFacingAgentResponse = {
          ...mockResponse(),
          assistantMessage: '发送邀请或打开聊天前需要你确认。',
          cards: [],
          pendingConfirmations: [
            {
              id: 8800,
              type: 'approval_required',
              actionType: 'send_invite',
              summary: '确认后才会发送邀请内容。',
              riskLevel: 'medium',
              expiresAt: null,
            },
            {
              id: 8801,
              type: 'approval_required',
              actionType: 'connect_candidate',
              summary: '确认后才会加好友并打开后续聊天入口。',
              riskLevel: 'medium',
              expiresAt: null,
            },
          ],
        };
        onEvent({ type: 'result', result: response });
        return response;
      });

    await renderAgentPage();

    submitPrompt('我想找一个周末跑步搭子');
    await waitFor(() => expect(getEnabledSchemaActionButton('candidate.connect')).not.toBeNull());
    const connectButton = getEnabledSchemaActionButton('candidate.connect') as HTMLButtonElement;
    expect(connectButton).toHaveAttribute('data-schema-action', 'candidate.connect');
    expect(connectButton).toHaveAttribute('data-requires-confirmation', 'true');
    expect(connectButton).toHaveAttribute('data-checkpoint-required', 'true');
    fireEvent.click(connectButton);

    await waitFor(() =>
      expect(actionStreamSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 101,
          action: 'candidate.connect',
          idempotencyKey: 'agent-card-action:101:candidate.connect:501',
          payload: expect.objectContaining({
            taskId: 101,
            candidateId: 501,
            targetUserId: 22,
            approvalRequired: true,
            checkpointRequired: true,
            resumeMode: 'resume_after_approval',
          }),
        }),
        expect.any(Function),
        expect.any(AbortSignal),
      ),
    );
    const inlineApproval = await screen.findByTestId('assistant-ui-inline-approval-panel');
    expect(inlineApproval).toHaveTextContent('确认加好友并聊天');
    expect(inlineApproval).toHaveTextContent('确认后才会加好友并打开后续聊天入口。');
    expect(inlineApproval).toHaveAttribute('data-risk-level', 'medium');
    expect(screen.queryByText('连接进展')).not.toBeInTheDocument();
    expect(screen.queryByText('连接已打开')).not.toBeInTheDocument();
  });

  it('keeps replayed candidate approvals collapsed until the user clicks the risky card action', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const streamed = {
      ...mockCandidateResponse(),
      pendingConfirmations: [
        {
          id: 8802,
          type: 'approval_required',
          actionType: 'connect_candidate',
          summary: '确认后才会发送邀请并打开小林的后续聊天入口。',
          riskLevel: 'medium',
          expiresAt: null,
        },
      ],
    };
    const streamSpy = vi
      .spyOn(socialAgentApi, 'runUserFacingStream')
      .mockImplementation(async (_data, onEvent) => {
        onEvent({ type: 'result', result: streamed });
        return streamed;
      });
    const actionStreamSpy = vi.spyOn(socialAgentApi, 'performActionStream');
    const approveSpy = vi.spyOn(agentApprovalsApi, 'approve').mockResolvedValue({
      ok: true,
      status: 'approved',
      dispatched: true,
      result: {
        following: true,
        targetUserId: 22,
        friendRequestId: '601',
        conversationId: 'conv-22',
        openedConversation: true,
        socialRequestId: 301,
        candidateRecordId: 501,
        idempotencyKey: 'candidate-connect:101:22',
      },
    });

    await renderAgentPage();

    submitPrompt('我想找一个周末跑步搭子');

    await waitFor(() => expect(getEnabledSchemaActionButton('candidate.connect')).not.toBeNull());
    expect(screen.queryByTestId('assistant-ui-inline-approval-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();
    const connectButton = getEnabledSchemaActionButton('candidate.connect') as HTMLButtonElement;
    fireEvent.click(connectButton);

    const inlineApproval = await screen.findByTestId('assistant-ui-inline-approval-panel');
    expect(inlineApproval).toHaveTextContent('确认加好友并聊天');
    expect(inlineApproval).toHaveTextContent('确认后才会发送邀请并打开小林的后续聊天入口。');
    expect(inlineApproval).toHaveAttribute('data-risk-level', 'medium');
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();
    expect(actionStreamSpy).not.toHaveBeenCalled();

    fireEvent.click(within(inlineApproval).getByRole('button', { name: '确认加好友' }));

    await waitFor(() => expect(approveSpy).toHaveBeenCalledWith(8802));
    expect(await screen.findByText('邀约进展')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-shell')).toHaveAttribute('data-message-count', '2');
    expect(streamSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();
  });

  it('attaches replayed approvals to the matching candidate card instead of the first candidate', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const streamed = {
      ...mockCandidateResponse(),
      pendingConfirmations: [
        {
          id: 8812,
          type: 'approval_required',
          actionType: 'send_invite',
          summary: '发送这条开场白给阿哲前需要你确认。',
          riskLevel: 'medium',
          expiresAt: null,
        },
        {
          id: 8813,
          type: 'approval_required',
          actionType: 'connect_candidate',
          summary: '确认后才会加好友并打开阿哲聊天入口。',
          riskLevel: 'medium',
          expiresAt: null,
        },
      ],
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({ type: 'result', result: streamed });
      return streamed;
    });
    const actionStreamSpy = vi.spyOn(socialAgentApi, 'performActionStream');
    const approveSpy = vi.spyOn(agentApprovalsApi, 'approve').mockResolvedValue({
      ok: true,
      status: 'approved',
      dispatched: true,
      result: {
        targetUserId: 23,
        conversationId: 'conv-23',
        openedConversation: true,
        candidateRecordId: 502,
      },
    });

    await renderAgentPage();

    submitPrompt('我想找一个周末跑步搭子');
    await waitFor(() =>
      expect(
        document.querySelectorAll('article[data-product-component="CandidateCards"]'),
      ).toHaveLength(2),
    );
    expect(screen.queryByTestId('assistant-ui-inline-approval-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();

    const cards = Array.from(
      document.querySelectorAll<HTMLElement>('article[data-product-component="CandidateCards"]'),
    );
    const xiaolinCard = cards.find((card) => card.textContent?.includes('小林'));
    const azheCard = cards.find((card) => card.textContent?.includes('阿哲'));
    expect(xiaolinCard).toBeTruthy();
    expect(azheCard).toBeTruthy();

    fireEvent.click(within(azheCard as HTMLElement).getByRole('button', { name: '发送邀请' }));

    const inlineApproval = await screen.findByTestId('assistant-ui-inline-approval-panel');
    expect(inlineApproval).toHaveTextContent('确认发送邀请');
    expect(inlineApproval).toHaveTextContent('发送这条开场白给阿哲前需要你确认。');
    expect(actionStreamSpy).not.toHaveBeenCalled();

    fireEvent.click(within(inlineApproval).getByRole('button', { name: '确认发送' }));
    await waitFor(() => expect(approveSpy).toHaveBeenCalledWith(8812));
    expect(
      within(xiaolinCard as HTMLElement).queryByTestId('assistant-ui-inline-approval-panel'),
    ).not.toBeInTheDocument();
  });

  it('uses confirmation payload display hints to keep generic approvals inside the matching candidate card', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const streamed = {
      ...mockCandidateResponse(),
      pendingConfirmations: [
        {
          id: 8814,
          type: 'approval_required',
          actionType: 'send_invite',
          summary: '确认后才会发送这条邀请。',
          riskLevel: 'medium',
          expiresAt: null,
          payload: {
            candidateName: '阿哲',
          },
        },
      ],
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({ type: 'result', result: streamed });
      return streamed;
    });
    const actionStreamSpy = vi.spyOn(socialAgentApi, 'performActionStream');

    await renderAgentPage();

    submitPrompt('我想找一个周末跑步搭子');
    await waitFor(() =>
      expect(
        document.querySelectorAll('article[data-product-component="CandidateCards"]'),
      ).toHaveLength(2),
    );
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();

    const cards = Array.from(
      document.querySelectorAll<HTMLElement>('article[data-product-component="CandidateCards"]'),
    );
    const xiaolinCard = cards.find((card) => card.textContent?.includes('小林'));
    const azheCard = cards.find((card) => card.textContent?.includes('阿哲'));
    expect(xiaolinCard).toBeTruthy();
    expect(azheCard).toBeTruthy();

    fireEvent.click(within(azheCard as HTMLElement).getByRole('button', { name: '发送邀请' }));

    const inlineApproval = await screen.findByTestId('assistant-ui-inline-approval-panel');
    expect(inlineApproval).toHaveTextContent('确认发送邀请');
    expect(inlineApproval).toHaveTextContent('确认后才会发送这条邀请。');
    expect(actionStreamSpy).not.toHaveBeenCalled();
    expect(
      within(xiaolinCard as HTMLElement).queryByTestId('assistant-ui-inline-approval-panel'),
    ).not.toBeInTheDocument();
  });

  it('keeps opener send approvals inline even when the copy mentions an opening line', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const streamed = {
      ...mockCandidateResponse(),
      pendingConfirmations: [
        {
          id: 8804,
          type: 'approval_required',
          actionType: 'opener.confirm_send',
          summary: '发送这条开场白给小林前需要你确认。',
          riskLevel: 'medium',
          expiresAt: null,
        },
      ],
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({ type: 'result', result: streamed });
      return streamed;
    });
    const actionStreamSpy = vi.spyOn(socialAgentApi, 'performActionStream');

    await renderAgentPage();

    submitPrompt('我想找一个周末跑步搭子');

    await waitFor(() => expect(getEnabledSchemaActionButton('opener.confirm_send')).not.toBeNull());
    expect(screen.queryByTestId('assistant-ui-inline-approval-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();

    fireEvent.click(getEnabledSchemaActionButton('opener.confirm_send') as HTMLButtonElement);

    const inlineApproval = await screen.findByTestId('assistant-ui-inline-approval-panel');
    expect(inlineApproval).toHaveTextContent('确认发送邀请');
    expect(inlineApproval).toHaveTextContent('发送这条开场白给小林前需要你确认。');
    expect(inlineApproval).toHaveAttribute('data-risk-level', 'medium');
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();
    expect(actionStreamSpy).not.toHaveBeenCalled();
  });

  it('does not execute raw legacy card actions without a whitelisted schema action', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const streamed = mockCandidateResponse();
    streamed.cards[0] = {
      ...streamed.cards[0],
      actions: [
        {
          id: 'legacy-debug',
          label: '内部调试动作',
          action: 'debug.raw_tool' as never,
          schemaAction: undefined,
          requiresConfirmation: false,
          payload: { taskId: 101, debug: true },
        },
      ],
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({ type: 'result', result: streamed });
      return streamed;
    });
    const actionStreamSpy = vi.spyOn(socialAgentApi, 'performActionStream');

    await renderAgentPage();

    submitPrompt('我想找一个周末一起跑步的人');

    expect(await screen.findByText('小林')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '内部调试动作' })).not.toBeInTheDocument();
    expect(actionStreamSpy).not.toHaveBeenCalled();
  });

  it('sends only minimal safe payload for generated default Tool UI actions', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const streamed = mockCandidateResponse();
    streamed.cards[0] = {
      ...streamed.cards[0],
      actions: [],
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({ type: 'result', result: streamed });
      return streamed;
    });
    const actionStreamSpy = vi
      .spyOn(socialAgentApi, 'performActionStream')
      .mockImplementation(async (_data, onEvent) => {
        const response = {
          ...mockResponse(),
          assistantMessage: '我会继续处理这一步。',
          cards: [],
          taskId: 101,
        };
        onEvent({ type: 'result', result: response });
        return response;
      });

    await renderAgentPage();

    submitPrompt('我想找一个周末一起跑步的人');

    await waitFor(() =>
      expect(getEnabledSchemaActionButton('candidate.view_detail')).not.toBeNull(),
    );
    fireEvent.click(getEnabledSchemaActionButton('candidate.view_detail') as HTMLButtonElement);

    await waitFor(() =>
      expect(actionStreamSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 101,
          action: 'candidate.view_detail',
          payload: expect.objectContaining({
            taskId: 101,
            cardId: 'candidate-1',
            cardType: 'candidate_card',
            schemaType: 'social_match.candidate',
          }),
        }),
        expect.any(Function),
        expect.any(AbortSignal),
      ),
    );
    const sentPayload = actionStreamSpy.mock.calls[0]?.[0]?.payload ?? {};
    expect(sentPayload).not.toHaveProperty('cardData');
    expect(JSON.stringify(sentPayload)).not.toContain('hidden-trace');
  });

  it('requests database restore without rendering old workspace cards', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    const restored = {
      ...mockResponse(),
      assistantMessage: '从已保存的步骤继续：正在等待你确认。原始目标：你有什么功能',
      cards: [],
    };
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue({
      ...emptySession(),
      hasSession: true,
      activeTaskId: 42,
      task: { id: 42, permissionMode: 'limited_auto', goal: '上一次的问题', status: 'succeeded' },
      result: restored,
    });
    vi.spyOn(socialAgentApi, 'runUserFacingStream');
    const runTaskNextSpy = vi.spyOn(socialAgentApi, 'runTaskNext');

    await renderAgentPage('/agent/chat/42');

    await waitFor(() => expect(socialAgentApi.restoreSession).toHaveBeenCalledWith(undefined));
    expect(screen.getByText(/普通聊天不会自动展开旧任务/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '继续上次任务' })).toBeInTheDocument();
    expect(screen.queryByText('我可以继续上次的话题，也可以重新开始。')).not.toBeInTheDocument();
    expect(screen.queryByText(/原始目标/)).not.toBeInTheDocument();
    expect(screen.queryByText(/从已保存的步骤继续/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-branch-picker')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();
    expect(runTaskNextSpy).not.toHaveBeenCalled();
    expect(document.querySelector('.agent-gpt-result-block')).toBeNull();
    expect(document.querySelector('.codex-ant-pet')).toBeNull();
  });

  it('restores full server session history instead of collapsing to one assistant result', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue({
      ...emptySession(64),
      hasSession: true,
      activeTaskId: 64,
      task: {
        id: 64,
        permissionMode: 'limited_auto',
        goal: '今晚青岛大学散步',
        status: 'awaiting_feedback',
      },
      messages: [
        {
          id: 'session-user-1',
          role: 'user',
          content: '今天晚上，青岛大学附近，散步，想找舞蹈相关标签的女生',
        },
        {
          id: 'session-assistant-1',
          role: 'assistant',
          content: '已记住：今天晚上、青岛大学附近、散步，优先看公开舞蹈相关标签。',
        },
      ],
      result: {
        ...mockResponse(),
        assistantMessage: '已记住：今天晚上、青岛大学附近、散步，优先看公开舞蹈相关标签。',
      },
    });
    vi.spyOn(socialAgentApi, 'listThreads').mockResolvedValue({ threads: [] });
    vi.spyOn(socialAgentApi, 'getTaskEventReplay').mockResolvedValue(emptyReplay(64));

    await renderAgentPageWithRoutes('/agent/chat/64');

    expect(
      await screen.findByText('今天晚上，青岛大学附近，散步，想找舞蹈相关标签的女生'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('已记住：今天晚上、青岛大学附近、散步，优先看公开舞蹈相关标签。'),
    ).toBeInTheDocument();
    expect(screen.queryByText('我已经恢复了上一次对话。')).not.toBeInTheDocument();
    expect(screen.queryByText(/原始目标|从已保存的步骤继续/)).not.toBeInTheDocument();
  });

  it('does not restore Social Codex process trace for an ordinary restored response', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue({
      ...emptySession(77),
      hasSession: true,
      activeTaskId: 77,
      task: { id: 77, permissionMode: 'limited_auto', goal: '周末下午散步' },
      result: {
        ...mockResponse(),
        assistantMessage: '我已经恢复了这段约练任务。',
      },
    });
    vi.spyOn(socialAgentApi, 'getTaskEventReplay').mockResolvedValue({
      ...emptyReplay(77),
      eventCount: 3,
      returnedCount: 3,
      lastSeq: 3,
      lastEventId: 'run-77:3',
      events: [
        socialCodexReplayEvent(1, 'run.started', {
          display: { title: '正在理解你的需求', state: 'running' },
        }),
        socialCodexReplayEvent(2, 'slot.completed', {
          stage: 'slot_filling',
          display: {
            title: '已记录你的关键信息',
            detail: '周末下午、散步、青岛大学附近',
            state: 'done',
          },
          payload: {
            slots: {
              time_window: '周末下午',
              activity: '散步',
              location_text: '青岛大学附近',
            },
          },
        }),
        socialCodexReplayEvent(3, 'run.completed', {
          stage: 'life_graph_writeback',
          display: { title: '这一步处理完成', state: 'done' },
        }),
      ],
    });

    await renderAgentPage('/agent/chat/77');

    await waitFor(() => expect(socialAgentApi.getTaskEventReplay).toHaveBeenCalledWith(77));
    await waitFor(() =>
      expect(screen.queryByText('我已经恢复了这段约练任务。')).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('已记录你的关键信息')).not.toBeInTheDocument();
    expect(screen.queryByText('周末下午、散步、青岛大学附近')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-branch-picker')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/hydrate_context|runId|payload|traceId|planner/),
    ).not.toBeInTheDocument();
  });

  it('restores Social Codex replay as one lightweight summary status', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue({
      ...emptySession(77),
      hasSession: true,
      activeTaskId: 77,
      task: { id: 77, permissionMode: 'limited_auto', goal: '给候选人发送散步邀请' },
      result: {
        ...mockResponse(),
        assistantMessage: '我可以继续上次的话题，也可以重新开始。',
      },
    });
    vi.spyOn(socialAgentApi, 'getTaskEventReplay').mockResolvedValue({
      ...emptyReplay(77),
      eventCount: 4,
      returnedCount: 4,
      lastSeq: 4,
      lastEventId: 'run-77:4',
      terminalType: 'run.completed',
      pendingApproval: true,
      summary: {
        state: 'waiting',
        title: '发送邀请前需要你确认',
        detail: '确认后我会从同一步继续。',
        currentStage: 'approval',
        currentEventId: 'run-77:2',
        currentSeq: 2,
        pendingApproval: true,
        candidateCount: null,
        activityCount: null,
        hasOpportunityCard: false,
        savedMemory: false,
        visibleStepCount: 4,
        expandable: true,
      },
      events: [
        socialCodexReplayEvent(1, 'visible_process.delta', {
          stage: 'hydrate_context',
          display: { title: '正在读取你的偏好', state: 'running' },
        }),
        socialCodexReplayEvent(2, 'approval.required', {
          stage: 'approval',
          display: { title: '发送邀请前需要你确认', state: 'waiting' },
          payload: { approvalId: 'approve-77', checkpointId: 77 },
        }),
        socialCodexReplayEvent(3, 'approval.resolved', {
          stage: 'approval',
          display: { title: '已确认这一步', state: 'done' },
          payload: { approvalId: 'another-approval', checkpointId: 88 },
        }),
        socialCodexReplayEvent(4, 'run.completed', {
          stage: 'approval',
          display: { title: '这一步处理完成', state: 'done' },
        }),
      ],
    });

    await renderAgentPage('/agent/chat/77');

    await waitFor(() => expect(socialAgentApi.getTaskEventReplay).toHaveBeenCalledWith(77));
    expect(await screen.findByText('发送邀请前需要你确认')).toBeInTheDocument();
    const process = await screen.findByTestId('assistant-ui-tool-ui');
    expect(process).toHaveAttribute('data-process-step-count', '1');
    expect(process).toHaveAttribute('data-process-surface', 'single-line-status');
    expect(process).toHaveAttribute('data-process-rendering', 'covering-status');
    expect(process).toHaveAttribute('data-process-default-visible-count', '1');
    expect(process).toHaveAttribute('data-process-mainline', 'latest-visible-summary');
    expect(process).toHaveAttribute('data-process-history-visibility', 'collapsed');
    expect(process).toHaveAttribute('data-process-final-answer', 'false');
    expect(process).toHaveAttribute('data-process-summary-source', 'replay.summary');
    expect(process).toHaveAttribute('data-process-display-mode', 'covering_status');
    expect(process).toHaveAttribute('data-process-summary-update-model', 'latest_state');
    expect(process).toHaveAttribute('data-process-visible-title', '发送邀请前需要你确认');
    const statusLine = within(process).getByTestId('assistant-ui-process-status-line');
    expect(statusLine).toHaveAttribute('aria-live', 'polite');
    expect(statusLine).toHaveAttribute('aria-atomic', 'true');
    expect(statusLine).toHaveAttribute('data-process-line', 'latest-visible-summary');
    expect(statusLine).toHaveAttribute('data-process-inline-detail', 'collapsed');
    expect(statusLine).toHaveTextContent('发送邀请前需要你确认');
    expect(statusLine).not.toHaveTextContent('确认后我会从同一步继续。');
    expect(screen.queryByTestId('assistant-ui-process-evidence')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('assistant-ui-process-step')).toHaveLength(0);
    expect(process).not.toHaveAttribute('open');
    expect(screen.queryByText('确认后我会从同一步继续。')).not.toBeInTheDocument();
    const processSummary = process.querySelector('summary');
    expect(processSummary).not.toBeNull();
    fireEvent.click(processSummary!);
    expect(await within(process).findByTestId('assistant-ui-process-detail')).toHaveTextContent(
      '确认后我会从同一步继续。',
    );
    expect(screen.queryByText('正在读取你的偏好')).not.toBeInTheDocument();
    expect(screen.queryByText('已确认这一步')).not.toBeInTheDocument();
    expect(screen.queryByText('这一步处理完成')).not.toBeInTheDocument();
  });

  it('restores replay.summary even when replay events are trimmed', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue({
      ...emptySession(88),
      hasSession: true,
      activeTaskId: 88,
      task: { id: 88, permissionMode: 'limited_auto', goal: '周末青岛大学散步搭子' },
      result: {
        ...mockResponse(),
        assistantMessage: '我可以继续上次的话题，也可以重新开始。',
      },
    });
    vi.spyOn(socialAgentApi, 'getTaskEventReplay').mockResolvedValue({
      ...emptyReplay(88),
      eventCount: 8,
      returnedCount: 0,
      lastSeq: 8,
      lastEventId: 'run-88:8',
      terminalType: null,
      summary: {
        state: 'running',
        title: '正在筛选公开可发现的人',
        detail: '我会优先使用你已经补充的时间、地点和活动。',
        currentStage: 'search_candidates',
        currentEventId: 'run-88:8',
        currentSeq: 8,
        pendingApproval: false,
        candidateCount: null,
        activityCount: null,
        hasOpportunityCard: true,
        savedMemory: true,
        visibleStepCount: 8,
        expandable: true,
      },
      events: [],
    });

    await renderAgentPage('/agent/chat/88');

    await waitFor(() => expect(socialAgentApi.getTaskEventReplay).toHaveBeenCalledWith(88));
    expect(await screen.findByText('正在筛选公开可发现的人')).toBeInTheDocument();
    const process = await screen.findByTestId('assistant-ui-tool-ui');
    expect(process).toHaveAttribute('data-process-summary-source', 'replay.summary');
    expect(process).toHaveAttribute('data-process-display-mode', 'covering_status');
    expect(process).toHaveAttribute('data-process-summary-update-model', 'latest_state');
    expect(process).toHaveAttribute('data-process-visible-title', '正在筛选公开可发现的人');
    expect(process).toHaveAttribute('data-process-default-visible-count', '1');
    expect(process).toHaveAttribute('data-process-history-visibility', 'collapsed');
    expect(process).toHaveAttribute('data-process-step-count', '1');
    expect(process).toHaveAttribute('data-process-history-count', '0');
    expect(process).toHaveAttribute('data-process-clickable', 'true');
    const statusLine = within(process).getByTestId('assistant-ui-process-status-line');
    expect(statusLine).toHaveAttribute('data-process-live-region', 'polite');
    expect(statusLine).toHaveTextContent('正在筛选公开可发现的人');
    expect(within(process).getByText('查看过程')).toBeInTheDocument();
    expect(
      screen.queryByText('我会优先使用你已经补充的时间、地点和活动。'),
    ).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('assistant-ui-process-step')).toHaveLength(0);
    expect(screen.queryByText(/run-88|traceId|payload|planner/)).not.toBeInTheDocument();

    const summary = process.querySelector('summary');
    expect(summary).not.toBeNull();
    fireEvent.click(summary as HTMLElement);
    expect(process).toHaveAttribute('open');
    expect(screen.getByText('我会优先使用你已经补充的时间、地点和活动。')).toBeInTheDocument();
    expect(screen.queryAllByTestId('assistant-ui-process-step')).toHaveLength(0);
    expect(screen.queryByText(/run-88|traceId|payload|planner/)).not.toBeInTheDocument();
  });

  it('respects replay.summary expandable=false as a single covering status', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue({
      ...emptySession(91),
      hasSession: true,
      activeTaskId: 91,
      task: { id: 91, permissionMode: 'limited_auto', goal: '今晚青岛大学散步' },
      result: {
        ...mockResponse(),
        assistantMessage: '我可以继续上次的话题，也可以重新开始。',
      },
    });
    vi.spyOn(socialAgentApi, 'getTaskEventReplay').mockResolvedValue({
      ...emptyReplay(91),
      eventCount: 5,
      returnedCount: 0,
      lastSeq: 5,
      lastEventId: 'run-91:5',
      terminalType: null,
      summary: {
        state: 'running',
        title: '正在整理你的约练需求',
        detail: '我会把已记录的信息用于下一步，不会重复追问。',
        currentStage: 'slot_filling',
        currentEventId: 'run-91:5',
        currentSeq: 5,
        pendingApproval: false,
        candidateCount: null,
        activityCount: null,
        hasOpportunityCard: false,
        savedMemory: true,
        visibleStepCount: 1,
        expandable: false,
      },
      events: [],
    });

    await renderAgentPage('/agent/chat/91');

    expect(await screen.findByText('正在整理你的约练需求')).toBeInTheDocument();
    const process = await screen.findByTestId('assistant-ui-tool-ui');
    expect(process).toHaveAttribute('data-process-summary-source', 'replay.summary');
    expect(process).toHaveAttribute('data-process-visible-title', '正在整理你的约练需求');
    expect(process).toHaveAttribute('data-process-clickable', 'false');
    expect(within(process).getByTestId('assistant-ui-process-status-line')).toHaveTextContent(
      '正在整理你的约练需求',
    );
    expect(within(process).queryByText('查看过程')).not.toBeInTheDocument();
    expect(
      screen.queryByText('我会把已记录的信息用于下一步，不会重复追问。'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-process-detail')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('assistant-ui-process-step')).toHaveLength(0);
    const processSummary = process.querySelector('summary');
    expect(processSummary).not.toBeNull();
    fireEvent.click(processSummary!);
    expect(process).not.toHaveAttribute('open');
    expect(screen.queryByTestId('assistant-ui-process-detail')).not.toBeInTheDocument();
  });

  it('turns a generic replay.summary title into a specific GPT-style stage status', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue({
      ...emptySession(90),
      hasSession: true,
      activeTaskId: 90,
      task: { id: 90, permissionMode: 'limited_auto', goal: '发送青岛大学散步邀请' },
      result: {
        ...mockResponse(),
        assistantMessage: '我可以继续上次的话题，也可以重新开始。',
      },
    });
    vi.spyOn(socialAgentApi, 'getTaskEventReplay').mockResolvedValue({
      ...emptyReplay(90),
      eventCount: 6,
      returnedCount: 0,
      lastSeq: 6,
      lastEventId: 'run-90:6',
      terminalType: 'run.completed',
      summary: {
        state: 'completed',
        title: '这一步处理完成',
        detail: null,
        currentStage: 'send_invite',
        currentEventId: 'run-90:6',
        currentSeq: 6,
        pendingApproval: false,
        candidateCount: null,
        activityCount: null,
        hasOpportunityCard: false,
        savedMemory: false,
        visibleStepCount: 6,
        expandable: true,
      },
      events: [],
    });

    await renderAgentPage('/agent/chat/90');

    await waitFor(() => expect(socialAgentApi.getTaskEventReplay).toHaveBeenCalledWith(90));
    expect(await screen.findByText('邀请已准备好')).toBeInTheDocument();
    const process = await screen.findByTestId('assistant-ui-tool-ui');
    expect(process).toHaveAttribute('data-process-summary-source', 'replay.summary');
    expect(process).toHaveAttribute('data-process-visible-title', '邀请已准备好');
    expect(within(process).getByTestId('assistant-ui-process-status-line')).toHaveTextContent(
      '邀请已准备好',
    );
    expect(screen.queryByText('这一步处理完成')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('assistant-ui-process-step')).toHaveLength(0);
  });

  it('sanitizes replay.summary before restoring it as the inline process status', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue({
      ...emptySession(89),
      hasSession: true,
      activeTaskId: 89,
      task: { id: 89, permissionMode: 'limited_auto', goal: '继续约练任务' },
      result: {
        ...mockResponse(),
        assistantMessage: '我可以继续上次的话题，也可以重新开始。',
      },
    });
    vi.spyOn(socialAgentApi, 'getTaskEventReplay').mockResolvedValue({
      ...emptyReplay(89),
      eventCount: 3,
      returnedCount: 0,
      lastSeq: 3,
      lastEventId: 'run-89:3',
      summary: {
        state: 'running',
        title: 'route_search_turn',
        detail: 'hydrate_context planner payload traceId',
        currentStage: 'search_candidates',
        currentEventId: 'run-89:3',
        currentSeq: 3,
        pendingApproval: false,
        candidateCount: null,
        activityCount: null,
        hasOpportunityCard: false,
        savedMemory: false,
        visibleStepCount: 3,
        expandable: true,
      },
      events: [],
    });

    await renderAgentPage('/agent/chat/89');

    expect(await screen.findByText('正在筛选公开可发现的人')).toBeInTheDocument();
    const process = await screen.findByTestId('assistant-ui-tool-ui');
    expect(process).toHaveAttribute('data-process-visible-title', '正在筛选公开可发现的人');
    expect(
      screen.queryByText(/route_search_turn|hydrate_context|planner|payload|traceId/),
    ).not.toBeInTheDocument();
  });

  it('rewrites legacy model/fallback replay.summary into a single GPT-style status', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue({
      ...emptySession(90),
      hasSession: true,
      activeTaskId: 90,
      task: { id: 90, permissionMode: 'limited_auto', goal: '继续约练任务' },
      result: {
        ...mockResponse(),
        assistantMessage: '我可以继续上次的话题，也可以重新开始。',
      },
    });
    vi.spyOn(socialAgentApi, 'getTaskEventReplay').mockResolvedValue({
      ...emptyReplay(90),
      eventCount: 2,
      returnedCount: 0,
      lastSeq: 2,
      lastEventId: 'run-90:2',
      summary: {
        state: 'running',
        title: '正在调用 DeepSeek 生成匹配意图',
        detail: 'AI 分析超时，已使用规则匹配继续执行',
        currentStage: 'rank_candidates',
        currentEventId: 'run-90:2',
        currentSeq: 2,
        pendingApproval: false,
        candidateCount: null,
        activityCount: null,
        hasOpportunityCard: false,
        savedMemory: false,
        visibleStepCount: 2,
        expandable: true,
      },
      events: [],
    });

    await renderAgentPage('/agent/chat/90');

    const process = await screen.findByTestId('assistant-ui-tool-ui');
    expect(process).toHaveAttribute('data-process-visible-title', '正在整理你的匹配意图');
    expect(within(process).getByTestId('assistant-ui-process-status-line')).toHaveTextContent(
      '正在整理你的匹配意图',
    );
    expect(
      screen.queryByText(/DeepSeek|本地策略|规则匹配|OpenAI|API|SDK/i),
    ).not.toBeInTheDocument();
  });

  it('sanitizes legacy local checkpoint snapshots before rendering the assistant-ui thread', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    const staleResponse: UserFacingAgentResponse = {
      ...mockResponse(),
      assistantMessage: '从已保存的步骤继续：正在等待你确认。原始目标：你有什么功能',
      lightStatus: '正在等待你确认',
      pendingConfirmations: [
        {
          id: 99,
          title: '需要确认',
          description: '继续处理刚才需要确认的步骤。',
        },
      ] as unknown as UserFacingAgentResponse['pendingConfirmations'],
    };
    window.localStorage.setItem(
      'fitmeet-agent-thread:current',
      JSON.stringify({
        activeTaskId: 42,
        messages: [
          {
            id: 'assistant-stale-checkpoint',
            role: 'assistant',
            content: staleResponse.assistantMessage,
            status: 'done',
            result: staleResponse,
            taskId: 42,
            conversationIntent: 'approval',
            showSocialResult: true,
          },
        ],
        userResult: staleResponse,
        mode: 'limited_auto',
        branchSelections: {},
        savedAt: Date.now(),
      }),
    );
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());

    await renderAgentPage();

    expect(screen.queryByText('我可以继续上次的话题，也可以重新开始。')).not.toBeInTheDocument();
    expect(screen.queryByText(/原始目标/)).not.toBeInTheDocument();
    expect(screen.queryByText(/从已保存的步骤继续/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-branch-picker')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(forbiddenUserArtifacts);
  });

  it('sends ordinary chat without the restored social task id after showing the lightweight recovery entry', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    const staleResponse: UserFacingAgentResponse = {
      ...mockResponse(),
      assistantMessage: '从已保存的步骤继续：正在等待你确认。原始目标：今晚青岛大学跑步搭子',
      lightStatus: '正在等待你确认',
      cards: [
        {
          id: 'stale-opportunity-card',
          type: 'activity_plan',
          title: '旧约练卡片',
          data: { status: 'draft', taskId: 42 },
          actions: [],
        },
      ],
    };
    window.localStorage.setItem(
      'fitmeet-agent-thread:current',
      JSON.stringify({
        activeTaskId: 42,
        activeThreadId: 'agent-task:42',
        messages: [
          {
            id: 'assistant-stale-task',
            role: 'assistant',
            content: staleResponse.assistantMessage,
            status: 'done',
            result: staleResponse,
            taskId: 42,
            conversationIntent: 'approval',
            showSocialResult: true,
          },
        ],
        userResult: staleResponse,
        mode: 'limited_auto',
        branchSelections: {},
        savedAt: Date.now(),
      }),
    );
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const streamSpy = vi.spyOn(socialAgentApi, 'runUserFacingStream').mockResolvedValue({
      ...mockResponse(),
      assistantMessage: '可以正常聊天。你想聊什么都可以。',
      cards: [],
    });

    await renderAgentPage();

    expect(screen.getByText(/普通聊天不会自动展开旧任务/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '继续上次任务' })).toBeInTheDocument();
    expect(screen.queryByText('旧约练卡片')).not.toBeInTheDocument();
    expect(screen.queryByText(/青岛大学跑步搭子/)).not.toBeInTheDocument();

    submitPrompt('你好，你能正常聊天吗？');

    await waitFor(() => expect(streamSpy).toHaveBeenCalled());
    expect(streamSpy.mock.calls[0]?.[0]).toMatchObject({
      goal: '你好，你能正常聊天吗？',
      taskId: null,
      clientContext: expect.objectContaining({
        conversationIntent: 'conversation',
        threadId: null,
      }),
    });
  });

  it('shows a latest checkpoint recovery prompt after restoring a resumable thread', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue({
      ...emptySession(42),
      activeTaskId: 42,
      task: {
        id: 42,
        permissionMode: 'limited_auto',
        goal: '等待确认',
        status: 'awaiting_confirmation',
      },
      result: {
        ...mockResponse(),
        assistantMessage: '我已经恢复了这段对话。',
        cards: [],
        pendingConfirmations: [
          {
            id: 88,
            type: 'approval',
            actionType: 'resume_checkpoint',
            summary: '确认后我才会继续。',
            riskLevel: 'medium',
            expiresAt: null,
          },
        ],
      },
    });
    const latestSpy = vi.spyOn(agentApprovalsApi, 'latestCheckpointForTask').mockResolvedValue({
      checkpoint: {
        id: 99,
        agentTaskId: 42,
        status: 'interrupted',
        resumable: true,
        canRetry: true,
        canReplay: true,
        canFork: true,
        threadId: 'agent-task:42',
        sourceStep: {
          stepId: 'approval-88',
          label: '需要你确认这个动作',
          toolName: 'approval_gate',
        },
        steps: [
          {
            stepId: 'search',
            label: '正在查找合适的信息',
            status: 'complete',
            toolName: 'social_match',
            retryable: true,
            replayable: true,
            forkable: true,
          },
          {
            stepId: 'approval-88',
            label: '需要你确认这个动作',
            status: 'waiting',
            toolName: 'approval_gate',
            retryable: true,
            replayable: true,
            forkable: true,
          },
        ],
      },
    });
    const checkpointSpy = vi
      .spyOn(socialAgentApi, 'runCheckpointStream')
      .mockImplementation(async (_data, onEvent) => {
        const resumed = {
          ...mockResponse(),
          assistantMessage: '已从保存的步骤继续。',
          cards: [],
        };
        onEvent({ type: 'result', result: resumed });
        return resumed;
      });

    await renderAgentPageWithRoutes('/agent/chat/42');

    await waitFor(() => expect(latestSpy).toHaveBeenCalledWith(42));
    expect(await screen.findByTestId('assistant-ui-interrupt-resume')).toHaveAttribute(
      'data-kind',
      'checkpoint_available',
    );
    expect(screen.getByTestId('assistant-ui-interrupt-resume')).toHaveAttribute(
      'data-recovery-surface',
      'single-line',
    );
    expect(screen.getByTestId('assistant-ui-interrupt-resume')).toHaveAttribute(
      'data-recovery-card',
      'false',
    );
    expect(screen.getByText('有个动作需要你确认')).toBeInTheDocument();
    expect(screen.getByText(/我可以继续「.*确认.*动作.*」/)).toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-checkpoint-summary-steps')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '忽略，重新开始' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '继续上次任务' }));

    await waitFor(() =>
      expect(checkpointSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          checkpointId: 99,
          action: 'resume',
          stepId: 'approval-88',
        }),
        expect.any(Function),
        expect.any(AbortSignal),
      ),
    );
  });

  it('checks a restored waiting-reply task once and renders run-next cards in the chat thread', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue({
      ...emptySession(42),
      activeTaskId: 42,
      task: {
        id: 42,
        permissionMode: 'limited_auto',
        goal: '等待对方回复',
        status: 'waiting_reply',
      },
      result: {
        ...mockResponse(),
        assistantMessage: '我已经恢复了这段对话。',
        cards: [],
      },
    });
    const runTaskNextSpy = vi.spyOn(socialAgentApi, 'runTaskNext').mockResolvedValue({
      taskId: 42,
      executedSteps: 3,
      succeededSteps: 3,
      failedSteps: 0,
      blockedSteps: 0,
      status: 'waiting_reply',
      handledReply: true,
      decision: { nextAction: 'reply_message' },
      cards: [
        {
          id: 'auto-run-next-meet-loop',
          type: 'review_card',
          title: '邀约进展',
          body: '对方在追问细节。',
          status: 'ready',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'meet_loop.timeline',
          data: {
            taskId: 42,
            schemaName: 'MeetLoopTimelineCard',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'meet_loop.timeline',
            loopStage: 'reply_received',
            connectionState: 'reply_received',
            counterpartIntent: 'ask_question',
            replyIntentLabel: '对方在追问细节',
            nextSafeStep: '先回复对方的问题；发送任何消息前仍会让你确认。',
            sideEffectPolicy: 'no_followup_without_user_confirmation',
            replyPreview: '对方想确认具体地点。',
          },
          actions: [],
        },
      ],
    });

    await renderAgentPage('/agent/chat/42');

    await waitFor(() => expect(runTaskNextSpy).toHaveBeenCalledWith(42));
    expect(await screen.findByTestId('assistant-ui-generative-cards')).toBeInTheDocument();
    expect(screen.getByTestId('meet-loop-reply-received-note')).toHaveTextContent('对方在追问细节');
    expect(document.querySelector('[data-schema-type="meet_loop.timeline"]')).not.toBeNull();
  });

  it('dedupes replayed run-next cards by stable candidate identity even when card ids change', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    let now = 2_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue({
      ...emptySession(42),
      activeTaskId: 42,
      task: {
        id: 42,
        permissionMode: 'limited_auto',
        goal: '等待候选反馈',
        status: 'waiting_reply',
      },
      result: {
        ...mockResponse(),
        assistantMessage: '我已经恢复了这段对话。',
        cards: [],
      },
    });
    vi.spyOn(socialAgentApi, 'listThreads').mockResolvedValue({ threads: [] });
    const runTaskNextSpy = vi
      .spyOn(socialAgentApi, 'runTaskNext')
      .mockResolvedValueOnce({
        taskId: 42,
        executedSteps: 1,
        succeededSteps: 1,
        failedSteps: 0,
        blockedSteps: 0,
        status: 'waiting_reply',
        handledReply: true,
        decision: { nextAction: 'show_candidate' },
        cards: [
          {
            id: 'auto-candidate-first',
            type: 'candidate_card',
            title: '陈砚',
            body: '青岛大学附近，公开资料匹配散步。',
            status: 'ready',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'social_match.candidate',
            data: {
              taskId: 42,
              schemaName: 'CandidateCard',
              schemaVersion: 'fitmeet.tool-ui.v1',
              schemaType: 'social_match.candidate',
              candidateRecordId: 501,
              targetUserId: 22,
              displayName: '陈砚',
            },
            actions: [],
          },
        ],
      })
      .mockResolvedValueOnce({
        taskId: 42,
        executedSteps: 1,
        succeededSteps: 1,
        failedSteps: 0,
        blockedSteps: 0,
        status: 'waiting_reply',
        handledReply: true,
        decision: { nextAction: 'show_candidate' },
        cards: [
          {
            id: 'auto-candidate-replayed-with-new-id',
            type: 'candidate_card',
            title: '陈砚',
            body: '青岛大学附近，公开资料匹配散步。',
            status: 'ready',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'social_match.candidate',
            data: {
              taskId: 42,
              schemaName: 'CandidateCard',
              schemaVersion: 'fitmeet.tool-ui.v1',
              schemaType: 'social_match.candidate',
              candidate: {
                candidateRecordId: 501,
                targetUserId: 22,
              },
              displayName: '陈砚',
            },
            actions: [],
          },
        ],
      });

    await renderAgentPage('/agent/chat/42');

    await waitFor(() => expect(runTaskNextSpy).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId('assistant-ui-generative-cards')).toBeInTheDocument();
    expect(screen.getAllByTestId('assistant-ui-schema-card')).toHaveLength(1);
    expect(screen.getByTestId('assistant-ui-generative-cards')).toHaveAttribute(
      'data-card-density',
      'single-product',
    );

    await act(async () => {
      now += 91_000;
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
    });

    await waitFor(() => expect(runTaskNextSpy).toHaveBeenCalledTimes(2));
    expect(screen.getAllByTestId('assistant-ui-schema-card')).toHaveLength(1);
    expect(screen.getAllByTestId('assistant-ui-schema-card')[0]).toHaveAttribute(
      'data-schema-type',
      'social_match.candidate',
    );
  });

  it('throttles low-touch waiting-reply checks on focus and visibility changes', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue({
      ...emptySession(42),
      activeTaskId: 42,
      task: {
        id: 42,
        permissionMode: 'limited_auto',
        goal: '等待对方回复',
        status: 'waiting_reply',
      },
      result: {
        ...mockResponse(),
        assistantMessage: '我已经恢复了这段对话。',
        cards: [],
      },
    });
    vi.spyOn(socialAgentApi, 'listThreads').mockResolvedValue({ threads: [] });
    const runTaskNextSpy = vi.spyOn(socialAgentApi, 'runTaskNext').mockResolvedValue({
      taskId: 42,
      executedSteps: 0,
      succeededSteps: 0,
      failedSteps: 0,
      blockedSteps: 0,
      status: 'waiting_reply',
      handledReply: false,
      decision: null,
      cards: [],
    });

    await renderAgentPage('/agent/chat/42');
    await waitFor(() => expect(runTaskNextSpy).toHaveBeenCalledTimes(1));

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    expect(runTaskNextSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      now += 91_000;
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
    });
    await waitFor(() => expect(runTaskNextSpy).toHaveBeenCalledTimes(2));
  });

  it('renders mature thread list states with inline rename and delete', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const now = Date.now();
    vi.spyOn(socialAgentApi, 'listThreads').mockResolvedValue({
      threads: [
        {
          id: '42',
          threadId: 42,
          taskId: 42,
          title: '周末训练计划',
          preview: '继续整理计划',
          status: 'running',
          goal: '继续整理计划',
          messageCount: 6,
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          branch: {
            branchSelections: { 'branch-user-1': 2 },
            branchCount: 2,
            activeBranchId: 'assistant-2',
            parentMessageId: 'branch-user-1',
            updatedAt: new Date().toISOString(),
          },
          custom: {
            assistantThread: {
              metadata: {
                client: 'fitmeet-web',
                messageCount: 6,
              },
            },
          },
        },
        {
          id: '41',
          threadId: 41,
          taskId: 41,
          title: '本周社交边界',
          preview: '继续确认边界',
          status: 'regular',
          goal: '继续确认边界',
          messageCount: 3,
          updatedAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
          createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: '40',
          threadId: 40,
          taskId: 40,
          title: '旧对话',
          preview: '继续旧问题',
          status: 'regular',
          goal: '继续旧问题',
          messageCount: 2,
          updatedAt: new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString(),
          createdAt: new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ],
    });
    const updateThreadSpy = vi.spyOn(socialAgentApi, 'updateThread').mockResolvedValue({
      thread: {
        id: '42',
        threadId: 42,
        taskId: 42,
        title: '新的训练计划',
        preview: '继续整理计划',
        status: 'running',
        goal: '继续整理计划',
        messageCount: 6,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    });
    const deleteThreadSpy = vi
      .spyOn(socialAgentApi, 'deleteThread')
      .mockResolvedValue({ ok: true });
    const createThreadSpy = vi.spyOn(socialAgentApi, 'createThread').mockResolvedValue({
      thread: {
        id: '43',
        threadId: 43,
        taskId: 43,
        title: '新对话',
        preview: null,
        status: 'awaiting_feedback',
        goal: '',
        messageCount: 0,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    });
    const getThreadSpy = vi.spyOn(socialAgentApi, 'getThread').mockResolvedValue({
      thread: {
        id: '41',
        threadId: 41,
        taskId: 41,
        title: '本周社交边界',
        preview: '继续确认边界',
        status: 'regular',
        goal: '继续确认边界',
        messageCount: 3,
        updatedAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
      session: {
        ...emptySession(41),
        messages: [
          { id: 'u-41', role: 'user', content: '继续确认边界' },
          { id: 'a-41', role: 'assistant', content: '我会沿着这段上下文继续。' },
        ],
      },
    });

    await renderAgentPage();

    expect(await screen.findByText('周末训练计划')).toBeInTheDocument();
    expect(screen.getByText('最近对话')).toBeInTheDocument();
    expect(screen.getByText('今天')).toBeInTheDocument();
    expect(screen.getByText('过去 7 天')).toBeInTheDocument();
    expect(screen.getByText('更早')).toBeInTheDocument();
    expect(screen.getByText('6 条')).toBeInTheDocument();
    expect(screen.getByText('2 个版本')).toBeInTheDocument();
    expect(screen.getByText('生成中')).toBeInTheDocument();
    expect(screen.getByText('周末训练计划').closest('[data-message-count]')).toHaveAttribute(
      'data-message-count',
      '6',
    );
    expect(screen.getByText('周末训练计划').closest('[data-branch-count]')).toHaveAttribute(
      'data-branch-count',
      '2',
    );
    expect(screen.queryByText('多设备同步')).not.toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-thread-list')).toHaveAttribute(
      'data-runtime-thread-count',
      '3',
    );
    expect(screen.getByTestId('assistant-ui-thread-list')).toHaveAttribute('role', 'navigation');
    expect(screen.getByTestId('assistant-ui-thread-list')).toHaveAttribute(
      'data-persistence',
      'fitmeet-native',
    );
    expect(screen.getByTestId('assistant-ui-thread-list')).toHaveAttribute(
      'data-multidevice-restore',
      'available',
    );
    expect(screen.getByTestId('assistant-ui-thread-list')).toHaveAttribute(
      'data-thread-metadata-persistence',
      'message-count,branch,preview,status,updated-at',
    );
    expect(screen.getByTestId('assistant-ui-thread-list')).toHaveAttribute(
      'data-interaction-model',
      'assistant-ui-thread-list',
    );
    expect(screen.getByTestId('assistant-ui-thread-list')).toHaveAttribute(
      'data-empty-state',
      'false',
    );
    expect(screen.getByTestId('assistant-ui-thread-list')).toHaveAttribute(
      'data-thread-count',
      '3',
    );
    const threadItemsList = screen.getByRole('list', { name: '最近对话' });
    expect(threadItemsList).toHaveAttribute('data-visible-thread-count', '3');
    const firstThreadItem = screen.getByText('周末训练计划').closest('[role="listitem"]');
    expect(firstThreadItem).toHaveAttribute('data-thread-id', '42');
    expect(firstThreadItem).toHaveAttribute('data-thread-position', '1');
    expect(firstThreadItem).toHaveAttribute('aria-posinset', '1');
    expect(firstThreadItem).toHaveAttribute('aria-setsize', '3');
    expect(firstThreadItem).toHaveAttribute('data-hover-menu', 'available');
    expect(firstThreadItem).toHaveAttribute('data-menu-state', 'closed');
    expect(firstThreadItem).toHaveAttribute('data-operation-state', 'idle');
    expect(firstThreadItem).toHaveAttribute('data-editing', 'false');
    expect(firstThreadItem).toHaveAttribute('data-delete-confirmation', 'false');
    const firstThreadButton = screen.getByRole('button', {
      name: /^周末训练计划，继续整理计划/,
    });
    expect(firstThreadButton).toHaveAttribute(
      'title',
      expect.stringMatching(/^周末训练计划 · 继续整理计划/),
    );
    expect(screen.getByTestId('assistant-ui-thread-list')).toHaveAttribute(
      'data-sync-state',
      'synced',
    );
    expect(screen.getByTestId('assistant-ui-thread-list')).toHaveAttribute(
      'data-runtime-loading',
      'false',
    );
    expect(screen.getByTestId('assistant-ui-sidebar-account')).toHaveAttribute(
      'data-sync-state',
      'synced',
    );
    expect(screen.getByTestId('assistant-ui-thread-sync-status')).toHaveAttribute(
      'data-sync-state',
      'synced',
    );
    expect(screen.getByText('已同步到所有设备')).toBeInTheDocument();
    const boundaryThreadButton = screen
      .getAllByRole('button')
      .find((button) => button.getAttribute('title')?.startsWith('本周社交边界 · '));
    expect(boundaryThreadButton).toBeTruthy();
    fireEvent.click(boundaryThreadButton as HTMLElement);
    await waitFor(() => expect(getThreadSpy).toHaveBeenCalledWith('41'));
    expect(await screen.findByText('我会沿着这段上下文继续。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '新对话' }));
    await waitFor(() => expect(createThreadSpy).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('heading', { name: '有什么我可以帮你？' })).toBeInTheDocument();
    expect(screen.queryByText('我会沿着这段上下文继续。')).not.toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-shell')).toHaveAttribute('data-active-thread-id', '43');
    expect(screen.getByText('新对话')).toBeInTheDocument();
    await screen.findByText('周末训练计划');
    await waitFor(() =>
      expect(screen.getByTestId('assistant-ui-thread-list')).toHaveAttribute(
        'data-runtime-loading',
        'false',
      ),
    );

    openRadixMenu(screen.getByRole('button', { name: '周末训练计划 更多操作' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(firstThreadItem).toHaveAttribute('data-menu-state', 'closed');
    openRadixMenu(screen.getByRole('button', { name: '周末训练计划 更多操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '重命名' }));
    const editingThreadItem = screen
      .getByRole('textbox', { name: '重命名会话' })
      .closest('[role="listitem"]');
    expect(editingThreadItem).toHaveAttribute('data-editing', 'true');
    fireEvent.change(screen.getByRole('textbox', { name: '重命名会话' }), {
      target: { value: '新的训练计划' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(updateThreadSpy).toHaveBeenCalledWith('42', '新的训练计划'));
    expect(await screen.findByText('新的训练计划')).toBeInTheDocument();

    openRadixMenu(screen.getByRole('button', { name: '新的训练计划 更多操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '删除' }));
    expect(screen.getByText('新的训练计划').closest('[role="listitem"]')).toHaveAttribute(
      'data-delete-confirmation',
      'true',
    );
    expect(screen.getByText('删除后这个会话会从所有设备隐藏。')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('menuitem', { name: '删除' }).at(-1) as HTMLElement);

    await waitFor(() => expect(deleteThreadSpy).toHaveBeenCalledWith('42'));
  });

  it('supports a desktop sidebar focus mode like a mature ChatGPT shell', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(min-width: 1024px)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });

    const firstRender = await renderAgentPage();

    const threadList = screen.getByTestId('assistant-ui-thread-list');
    expect(threadList).toHaveAttribute('data-state', 'open');
    expect(threadList).toHaveAttribute('aria-hidden', 'false');

    fireEvent.click(screen.getByTestId('assistant-ui-desktop-sidebar-close'));

    expect(threadList).toHaveAttribute('data-state', 'closed');
    expect(threadList).toHaveAttribute('aria-hidden', 'true');
    expect(threadList).toHaveAttribute('inert');
    expect(screen.getByTestId('assistant-ui-desktop-sidebar-open')).toBeInTheDocument();

    firstRender.unmount();
    await renderAgentPage();

    const restoredThreadList = screen.getByTestId('assistant-ui-thread-list');
    expect(restoredThreadList).toHaveAttribute('data-state', 'closed');
    expect(restoredThreadList).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(screen.getByTestId('assistant-ui-desktop-sidebar-open'));

    expect(restoredThreadList).toHaveAttribute('data-state', 'open');
    expect(restoredThreadList).toHaveAttribute('aria-hidden', 'false');
    expect(restoredThreadList).not.toHaveAttribute('inert');
  });

  it('lets desktop focus mode start a new chat without reopening the sidebar', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(min-width: 1024px)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'listThreads').mockResolvedValue({ threads: [] });
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      const response = {
        ...mockResponse(),
        assistantMessage: '我在这个旧对话里。',
        cards: [],
      };
      onEvent({ type: 'result', result: response });
      return response;
    });

    await renderAgentPage();
    submitPrompt('继续一个旧对话');
    expect(await screen.findByText('我在这个旧对话里。')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: '停止生成' })).toBeNull());

    fireEvent.click(screen.getByTestId('assistant-ui-desktop-sidebar-close'));
    fireEvent.click(screen.getByTestId('assistant-ui-desktop-new-chat'));

    expect(await screen.findByRole('heading', { name: '有什么我可以帮你？' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('我在这个旧对话里。')).not.toBeInTheDocument());
    expect(screen.getByTestId('assistant-ui-thread-list')).toHaveAttribute('data-state', 'closed');
  });

  it('keeps thread list errors inline when rename fails', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'listThreads').mockResolvedValue({
      threads: [
        {
          id: '42',
          threadId: 42,
          taskId: 42,
          title: '周末训练计划',
          preview: '继续整理计划',
          status: 'regular',
          goal: '继续整理计划',
          messageCount: 6,
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      ],
    });
    const updateThreadSpy = vi
      .spyOn(socialAgentApi, 'updateThread')
      .mockRejectedValue('rename failed');

    await renderAgentPage();
    expect(await screen.findByText('周末训练计划')).toBeInTheDocument();

    openRadixMenu(screen.getByRole('button', { name: '周末训练计划 更多操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '重命名' }));
    fireEvent.change(screen.getByRole('textbox', { name: '重命名会话' }), {
      target: { value: '新的训练计划' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(updateThreadSpy).toHaveBeenCalledWith('42', '新的训练计划'));
    expect(await screen.findByRole('status')).toHaveTextContent('重命名没有保存，请再试一次。');
    expect(screen.getByRole('textbox', { name: '重命名会话' })).toBeInTheDocument();
  });

  it('shows a ChatGPT-like thread list skeleton while conversations load', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'listThreads').mockImplementation(() => new Promise(() => undefined));

    await renderAgentPage();

    expect(await screen.findByTestId('assistant-ui-thread-list-skeleton')).toBeInTheDocument();
    expect(screen.getByLabelText('正在加载会话')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-thread-list-skeleton')).toHaveAttribute(
      'role',
      'status',
    );
    expect(screen.getByTestId('assistant-ui-thread-list-skeleton')).toHaveAttribute(
      'data-skeleton-row-count',
      '6',
    );
    expect(screen.getByText('正在加载')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-thread-list')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('assistant-ui-thread-list')).toHaveAttribute(
      'data-runtime-loading',
      'true',
    );
    expect(screen.getByTestId('assistant-ui-thread-list')).toHaveAttribute(
      'data-multidevice-restore',
      'syncing',
    );
    expect(screen.getByTestId('assistant-ui-thread-list')).toHaveAttribute(
      'data-sync-state',
      'syncing',
    );
    expect(screen.getByTestId('assistant-ui-sidebar-account')).toHaveAttribute(
      'data-sync-state',
      'syncing',
    );
    expect(screen.getByText('正在同步会话')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-thread-sync-status')).toHaveAttribute(
      'data-sync-state',
      'syncing',
    );
    expect(screen.getByText('正在同步到所有设备')).toBeInTheDocument();
  });

  it('shows a useful empty thread history state', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'listThreads').mockResolvedValue({ threads: [] });

    await renderAgentPage();

    expect(await screen.findByText('暂无历史对话')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-thread-list-empty')).toHaveAttribute('role', 'note');
    expect(screen.getByTestId('assistant-ui-thread-list')).toHaveAttribute(
      'data-empty-state',
      'true',
    );
    expect(screen.getByTestId('assistant-ui-thread-list')).toHaveAttribute(
      'data-multidevice-restore',
      'available',
    );
    expect(screen.getByRole('button', { name: '开始新对话' })).toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-thread-sync-status')).toHaveAttribute(
      'data-sync-state',
      'synced',
    );
    expect(screen.getByText('新会话会自动保存')).toBeInTheDocument();
    expect(screen.queryByText(/换设备也能继续/)).not.toBeInTheDocument();
  });

  it('keeps proactive reminders as a low-key sidebar setting outside the composer', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'listThreads').mockResolvedValue({ threads: [] });
    const disabledPreference = mockReminderPreference({
      enabled: false,
      metadata: {
        reminderDisabledAt: '2026-06-15T01:20:00.000Z',
        reminderPreferenceUpdatedAt: '2026-06-15T01:20:00.000Z',
      },
    });
    const enabledPreference = mockReminderPreference({
      enabled: true,
      metadata: {
        reminderOptInConfirmedAt: '2026-06-15T01:30:00.000Z',
        reminderPreferenceUpdatedAt: '2026-06-15T01:40:00.000Z',
        reminderScenes: [
          'new_match',
          'weekend_opportunities',
          'past_social_goal',
          'activity_follow_up',
          'life_graph_confirmation',
        ],
      },
    });
    vi.spyOn(socialAgentApi, 'getReminderPreference').mockResolvedValue(disabledPreference);
    const updateReminderPreferenceSpy = vi
      .spyOn(socialAgentApi, 'updateReminderPreference')
      .mockImplementation(async (input) =>
        mockReminderPreference({
          ...enabledPreference,
          enabled: input.enabled ?? enabledPreference.enabled,
          frequency: input.frequency ?? enabledPreference.frequency,
          quietStart: input.quietStart ?? enabledPreference.quietStart,
          quietEnd: input.quietEnd ?? enabledPreference.quietEnd,
          metadata: {
            ...enabledPreference.metadata,
            reminderScenes: input.scenes ?? enabledPreference.metadata.reminderScenes,
          },
        }),
      );
    const disableRemindersSpy = vi
      .spyOn(socialAgentApi, 'disableReminders')
      .mockResolvedValue(disabledPreference);

    await renderAgentPage();

    const reminderToggle = await screen.findByTestId('assistant-ui-reminder-toggle');
    expect(reminderToggle).toHaveAttribute('data-reminder-state', 'disabled');
    expect(reminderToggle).toHaveTextContent('约练机会提醒已关闭');
    expect(reminderToggle).toHaveTextContent('关闭后不会主动打扰，可手动开启');
    expect(screen.getByTestId('assistant-ui-reminder-audit-status')).toHaveTextContent(/已关闭：/);
    expect(screen.getByTestId('assistant-ui-composer')).toHaveAttribute(
      'data-permission-entry',
      'none',
    );
    expect(
      within(screen.getByTestId('assistant-ui-composer')).queryByTestId(
        'assistant-ui-reminder-toggle',
      ),
    ).not.toBeInTheDocument();

    fireEvent.click(reminderToggle);

    await waitFor(() =>
      expect(updateReminderPreferenceSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
          frequency: 'weekly',
          topics: ['friendship', 'fitness_partner', 'activity'],
          scenes: [
            'new_match',
            'weekend_opportunities',
            'past_social_goal',
            'activity_follow_up',
            'life_graph_confirmation',
          ],
          quietStart: '09:00',
          quietEnd: '21:00',
        }),
      ),
    );
    expect(await screen.findByText('约练机会提醒已开启')).toBeInTheDocument();
    expect(screen.getByText(/每周一次摘要 · 5 个场景 · 09:00-21:00/)).toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-reminder-toggle')).toHaveAttribute(
      'data-reminder-state',
      'enabled',
    );
    expect(screen.getByTestId('assistant-ui-reminder-settings')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-reminder-settings')).toHaveTextContent(
      '不会替你自动发消息',
    );
    expect(screen.getByTestId('assistant-ui-reminder-audit-status')).toHaveTextContent(
      /已开启：.*最近更新/,
    );

    expect(
      within(screen.getByTestId('assistant-ui-reminder-scenes')).getByRole('button', {
        name: '有新匹配时提醒',
      }),
    ).toHaveAttribute('data-selected', 'true');

    fireEvent.change(screen.getByTestId('assistant-ui-reminder-frequency'), {
      target: { value: 'realtime' },
    });
    await waitFor(() =>
      expect(updateReminderPreferenceSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          enabled: true,
          frequency: 'realtime',
        }),
      ),
    );
    expect(screen.getByText(/实时提醒 · 5 个场景 · 09:00-21:00/)).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('assistant-ui-reminder-frequency'), {
      target: { value: 'daily' },
    });
    await waitFor(() =>
      expect(updateReminderPreferenceSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          enabled: true,
          frequency: 'daily',
        }),
      ),
    );

    fireEvent.change(screen.getByTestId('assistant-ui-reminder-quiet-start'), {
      target: { value: '10:30' },
    });
    await waitFor(() =>
      expect(updateReminderPreferenceSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          enabled: true,
          quietStart: '10:30',
        }),
      ),
    );

    fireEvent.click(
      within(screen.getByTestId('assistant-ui-reminder-scenes')).getByRole('button', {
        name: '邀请快过期时提醒',
      }),
    );
    await waitFor(() =>
      expect(updateReminderPreferenceSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          enabled: true,
          scenes: ['new_match', 'weekend_opportunities', 'past_social_goal', 'activity_follow_up'],
        }),
      ),
    );

    fireEvent.click(
      within(screen.getByTestId('assistant-ui-reminder-scenes')).getByRole('button', {
        name: '周末前提醒我看看机会',
      }),
    );
    await waitFor(() =>
      expect(updateReminderPreferenceSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          enabled: true,
          scenes: ['new_match', 'past_social_goal', 'activity_follow_up'],
        }),
      ),
    );
    await waitFor(() =>
      expect(
        within(screen.getByTestId('assistant-ui-reminder-scenes')).getByRole('button', {
          name: '周末前提醒我看看机会',
        }),
      ).toHaveAttribute('data-selected', 'false'),
    );
    await waitFor(() =>
      expect(screen.getByTestId('assistant-ui-reminder-toggle')).toHaveAttribute(
        'data-reminder-saving',
        'false',
      ),
    );

    fireEvent.click(
      within(screen.getByTestId('assistant-ui-reminder-scenes')).getByRole('button', {
        name: '长期没推进时提醒我继续',
      }),
    );
    await waitFor(() =>
      expect(updateReminderPreferenceSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          enabled: true,
          scenes: ['new_match', 'activity_follow_up'],
        }),
      ),
    );
    await waitFor(() =>
      expect(
        within(screen.getByTestId('assistant-ui-reminder-scenes')).getByRole('button', {
          name: '长期没推进时提醒我继续',
        }),
      ).toHaveAttribute('data-selected', 'false'),
    );
    await waitFor(() =>
      expect(screen.getByTestId('assistant-ui-reminder-toggle')).toHaveAttribute(
        'data-reminder-saving',
        'false',
      ),
    );

    fireEvent.click(
      within(screen.getByTestId('assistant-ui-reminder-scenes')).getByRole('button', {
        name: '对方回复后提醒',
      }),
    );
    await waitFor(() =>
      expect(updateReminderPreferenceSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          enabled: true,
          scenes: ['new_match'],
        }),
      ),
    );

    fireEvent.click(
      within(screen.getByTestId('assistant-ui-reminder-scenes')).getByRole('button', {
        name: '有新匹配时提醒',
      }),
    );
    await waitFor(() =>
      expect(updateReminderPreferenceSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          enabled: true,
          scenes: [],
        }),
      ),
    );
    expect(screen.getByText(/每天一次摘要 · 未选择场景 · 10:30-21:00/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('assistant-ui-reminder-toggle'));
    await waitFor(() => expect(disableRemindersSpy).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('assistant-ui-reminder-toggle')).toHaveAttribute(
      'data-reminder-state',
      'disabled',
    );
  });

  it('opens and focuses reminder settings from the notification settings route', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'listThreads').mockResolvedValue({ threads: [] });
    vi.spyOn(socialAgentApi, 'getReminderPreference').mockResolvedValue(
      mockReminderPreference({
        enabled: false,
        metadata: {
          reminderDisabledAt: '2026-06-15T01:20:00.000Z',
          reminderPreferenceUpdatedAt: '2026-06-15T01:20:00.000Z',
        },
      }),
    );

    await renderAgentPage('/agent/chat?settings=reminders');

    const threadList = screen.getByTestId('assistant-ui-thread-list');
    const reminderToggle = await screen.findByTestId('assistant-ui-reminder-toggle');
    expect(threadList).toHaveAttribute('data-state', 'open');
    await waitFor(() => expect(document.activeElement).toBe(reminderToggle));
    expect(reminderToggle.closest('[data-reminder-focus]')).toHaveAttribute(
      'data-reminder-focus',
      'true',
    );
    expect(reminderToggle).toHaveTextContent('约练机会提醒已关闭');
    expect(screen.getByTestId('assistant-ui-reminder-audit-status')).toHaveTextContent(/已关闭：/);
  });

  it('renders an opened reminder as a lightweight assistant message inside the chat thread', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession(21));
    vi.spyOn(socialAgentApi, 'listThreads').mockResolvedValue({ threads: [] });
    vi.spyOn(socialAgentApi, 'getReminderPreference').mockResolvedValue(
      mockReminderPreference({ enabled: true }),
    );
    const disableRemindersSpy = vi
      .spyOn(socialAgentApi, 'disableReminders')
      .mockResolvedValue(mockReminderPreference({ enabled: false }));
    const dismissReminderSpy = vi.spyOn(socialAgentApi, 'dismissReminder').mockResolvedValue({
      ok: true,
      reminder: null,
      preference: mockReminderPreference({
        enabled: true,
        mutedUntil: '2026-06-16T01:00:00.000Z',
      }),
    });
    vi.spyOn(socialAgentApi, 'runTaskNext').mockResolvedValue({
      taskId: 21,
      executedSteps: 0,
      succeededSteps: 0,
      failedSteps: 0,
      blockedSteps: 0,
      status: 'waiting_reply',
      handledReply: false,
      decision: null,
      cards: [],
    });

    await act(async () => {
      render(
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/agent/chat/21',
              state: {
                agentReminder: {
                  id: 88,
                  taskId: 21,
                  message: '你之前想找羽毛球搭子，周末有几个安全机会。要我帮你看看吗？',
                  source: 'notification_center',
                  context: mockReminderContext(),
                },
              },
            },
          ]}
        >
          <AgentWorkspacePage view="chat" />
        </MemoryRouter>,
      );
    });
    await settleAgentPage();

    expect(
      await screen.findByText('你之前想找羽毛球搭子，周末有几个安全机会。要我帮你看看吗？'),
    ).toBeInTheDocument();
    const reminderMessage = screen
      .getByText('你之前想找羽毛球搭子，周末有几个安全机会。要我帮你看看吗？')
      .closest('[data-testid="assistant-ui-message"]');
    expect(reminderMessage).toHaveAttribute('data-role', 'assistant');
    expect(reminderMessage).toHaveAttribute('data-message-id', 'reminder-88');
    expect(reminderMessage).toHaveAttribute('data-reminder-protocol', 'fitmeet.agent.reminder.v1');
    expect(reminderMessage).toHaveAttribute('data-reminder-suggestion-only', 'true');
    expect(reminderMessage).toHaveAttribute('data-reminder-delivery', 'in_app,agent_thread');
    expect(reminderMessage).toHaveAttribute('data-reminder-external-delivery-disabled', 'true');
    expect(reminderMessage).toHaveAttribute(
      'data-reminder-settings-route',
      '/agent/chat?settings=reminders',
    );
    expect(reminderMessage).toHaveAttribute(
      'data-reminder-opt-out-action',
      'social_agent.reminder.disable',
    );
    expect(screen.getByTestId('assistant-ui-reminder-safety-protocol')).toHaveTextContent(
      '只做建议',
    );
    expect(screen.getByTestId('assistant-ui-reminder-safety-protocol')).toHaveTextContent(
      '站内提醒',
    );
    expect(screen.getByTestId('assistant-ui-reminder-safety-protocol')).toHaveTextContent(
      '执行确认',
    );
    expect(screen.getByTestId('assistant-ui-reminder-safety-protocol')).toHaveTextContent(
      '随时关闭',
    );
    expect(screen.getByTestId('assistant-ui-reminder-preference-signals')).toHaveTextContent(
      '最近确认：兴趣「羽毛球」',
    );
    expect(screen.getByTestId('assistant-ui-reminder-preference-signals')).toHaveTextContent(
      '最近确认：可约时间「周末下午」',
    );
    const reminderActions = screen.getByTestId('assistant-ui-reminder-actions');
    expect(reminderActions).toHaveAttribute('data-reminder-action-state', 'idle');
    fireEvent.click(within(reminderActions).getByRole('button', { name: '稍后再说' }));
    await waitFor(() => expect(dismissReminderSpy).toHaveBeenCalledWith(88));
    await waitFor(() =>
      expect(reminderActions).toHaveAttribute('data-reminder-action-state', 'dismissed'),
    );
    expect(within(reminderActions).getByRole('button', { name: '已降频' })).toBeDisabled();

    fireEvent.click(within(reminderActions).getByRole('button', { name: '关闭提醒' }));
    await waitFor(() => expect(disableRemindersSpy).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(reminderActions).toHaveAttribute('data-reminder-action-state', 'disabled'),
    );
    expect(within(reminderActions).getByRole('button', { name: '已关闭提醒' })).toBeDisabled();
    expect(screen.queryByTestId('assistant-ui-generative-cards')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-approval-tool')).not.toBeInTheDocument();
  });

  it('renders run-next counterpart reply cards from a reminder task as assistant-ui message parts', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession(21));
    vi.spyOn(socialAgentApi, 'listThreads').mockResolvedValue({ threads: [] });
    vi.spyOn(socialAgentApi, 'getReminderPreference').mockResolvedValue(
      mockReminderPreference({ enabled: true }),
    );
    vi.spyOn(socialAgentApi, 'runTaskNext').mockResolvedValue({
      taskId: 21,
      executedSteps: 3,
      succeededSteps: 3,
      failedSteps: 0,
      blockedSteps: 0,
      status: 'waiting_reply',
      handledReply: true,
      decision: { nextAction: 'reply_message' },
      cards: [
        {
          id: 'run-next-meet-loop',
          type: 'review_card',
          title: '邀约进展',
          body: '对方在追问细节。',
          status: 'ready',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'meet_loop.timeline',
          data: {
            taskId: 21,
            schemaName: 'MeetLoopTimelineCard',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'meet_loop.timeline',
            loopStage: 'reply_received',
            connectionState: 'reply_received',
            counterpartIntent: 'ask_question',
            replyIntentLabel: '对方在追问细节',
            nextSafeStep: '先回复对方的问题；发送任何消息前仍会让你确认。',
            sideEffectPolicy: 'no_followup_without_user_confirmation',
            replyPreview: '对方想确认具体地点。',
          },
          actions: [],
        },
      ],
    });

    await act(async () => {
      render(
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/agent/chat/21',
              state: {
                agentReminder: {
                  id: 'reply-88',
                  taskId: 21,
                  message: '你有一条对方的新回复，我可以帮你整理下一步。',
                  source: 'notification_center',
                  context: mockReminderContext(),
                },
              },
            },
          ]}
        >
          <AgentWorkspacePage view="chat" />
        </MemoryRouter>,
      );
    });
    await settleAgentPage();

    expect(await screen.findByTestId('assistant-ui-generative-cards')).toBeInTheDocument();
    expect(screen.getByTestId('meet-loop-reply-received-note')).toHaveTextContent('对方在追问细节');
    expect(screen.getByText('先回复对方的问题；发送任何消息前仍会让你确认。')).toBeInTheDocument();
    expect(document.querySelector('[data-schema-type="meet_loop.timeline"]')).not.toBeNull();
  });

  it('continues a notification reminder as a social opportunity clarification on the next turn', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession(21));
    vi.spyOn(socialAgentApi, 'listThreads').mockResolvedValue({ threads: [] });
    vi.spyOn(socialAgentApi, 'getReminderPreference').mockResolvedValue(
      mockReminderPreference({ enabled: true }),
    );
    vi.spyOn(socialAgentApi, 'runTaskNext').mockResolvedValue({
      taskId: 21,
      executedSteps: 0,
      succeededSteps: 0,
      failedSteps: 0,
      blockedSteps: 0,
      status: 'waiting_reply',
      handledReply: false,
      decision: null,
      cards: [],
    });
    const streamSpy = vi
      .spyOn(socialAgentApi, 'runUserFacingStream')
      .mockImplementation(async (_data, onEvent) => {
        const response = mockCandidateResponse();
        onEvent({ type: 'assistant_delta', delta: response.assistantMessage, source: 'llm' });
        onEvent({ type: 'assistant_done', source: 'llm' });
        onEvent({ type: 'result', result: response });
        return response;
      });

    await act(async () => {
      render(
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/agent/chat/21',
              state: {
                agentReminder: {
                  id: 88,
                  taskId: 21,
                  message: '你之前想找羽毛球搭子，周末有几个安全机会。要我帮你看看吗？',
                  source: 'notification_center',
                  context: mockReminderContext(),
                },
              },
            },
          ]}
        >
          <AgentWorkspacePage view="chat" />
        </MemoryRouter>,
      );
    });
    await settleAgentPage();

    expect(
      await screen.findByText('你之前想找羽毛球搭子，周末有几个安全机会。要我帮你看看吗？'),
    ).toBeInTheDocument();

    submitPrompt('可以，帮我看看');

    await waitFor(() => expect(streamSpy).toHaveBeenCalledTimes(1));
    expect(streamSpy.mock.calls[0]?.[0]).toMatchObject({
      goal: '可以，帮我看看',
      taskId: 21,
    });
    expect(await screen.findByTestId('assistant-ui-generative-cards')).toBeInTheDocument();
    expect(document.querySelector('[data-schema-type="social_match.candidate"]')).not.toBeNull();
    expect(document.querySelector('[data-schema-type="social_match.activity"]')).not.toBeNull();
  });

  it('falls back to the local thread snapshot after reload and keeps follow-up context', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession(77));
    window.localStorage.setItem(
      'fitmeet-agent-thread:current',
      JSON.stringify({
        activeTaskId: 77,
        mode: 'limited_auto',
        savedAt: Date.now(),
        userResult: {
          ...mockResponse(),
          assistantMessage: '到达现场前，先慢慢呼吸。',
          cards: [],
        },
        messages: [
          {
            id: 'stored-user',
            role: 'user',
            content: '我第一次线下见面有点紧张',
            attachments: [
              {
                id: 'stored-image',
                type: 'image',
                name: 'route.png',
                contentType: 'image/png',
                content: [
                  {
                    type: 'image',
                    image: '/uploads/route.png',
                    filename: 'route.png',
                  },
                ],
              },
            ],
          },
          {
            id: 'stored-assistant',
            role: 'assistant',
            content: '到达现场前，先慢慢呼吸。',
            status: 'done',
          },
        ],
      }),
    );
    const streamSpy = vi
      .spyOn(socialAgentApi, 'runUserFacingStream')
      .mockImplementation(async (_data, onEvent) => {
        const streamed = {
          ...mockResponse(),
          assistantMessage: '可以，接着刚才的话题继续。',
          cards: [],
        };
        onEvent({ type: 'result', result: streamed });
        return streamed;
      });

    await renderAgentPage();

    expect(await screen.findByText('到达现场前，先慢慢呼吸。')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'route.png 预览' })).toHaveAttribute(
      'src',
      '/uploads/route.png',
    );
    expect(screen.queryByRole('button', { name: '移除附件 route.png' })).not.toBeInTheDocument();
    submitPrompt('接着刚才的话题');

    await waitFor(() => expect(streamSpy).toHaveBeenCalled());
    expect(streamSpy.mock.calls[0]?.[0]).toMatchObject({
      goal: '接着刚才的话题',
      taskId: null,
      clientContext: expect.objectContaining({
        threadId: null,
      }),
    });
  });

  it('renders accessible branch picker state and switches assistant variants', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession(88));
    const updateThreadSpy = vi.spyOn(socialAgentApi, 'updateThread').mockResolvedValue({
      thread: {
        id: '88',
        threadId: 88,
        taskId: 88,
        title: '给我两个回答版本',
        preview: '第二个回答版本',
        status: 'regular',
        goal: '给我两个回答版本',
        messageCount: 3,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    });
    window.localStorage.setItem(
      'fitmeet-agent-thread:current',
      JSON.stringify({
        activeTaskId: 88,
        mode: 'limited_auto',
        savedAt: Date.now(),
        branchSelections: { 'branch-branch-user': 2 },
        messages: [
          {
            id: 'branch-user',
            role: 'user',
            content: '给我两个回答版本',
          },
          {
            id: 'assistant-v1',
            role: 'assistant',
            content: '第一个回答版本',
            status: 'done',
            createsBranch: true,
          },
          {
            id: 'assistant-v2',
            role: 'assistant',
            content: '第二个回答版本',
            status: 'done',
            createsBranch: true,
          },
        ],
      }),
    );

    await renderAgentPage();

    expect(await screen.findByText('第二个回答版本')).toBeInTheDocument();
    expect(screen.queryByText('第一个回答版本')).not.toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-branch-picker')).toHaveAttribute(
      'aria-label',
      '回答版本 2 / 2',
    );
    expect(screen.getByTestId('assistant-ui-branch-picker')).toHaveAttribute('role', 'toolbar');
    expect(screen.getByTestId('assistant-ui-branch-picker')).toHaveAttribute(
      'data-branch-picker-model',
      'assistant-ui-branch-picker',
    );
    expect(screen.getByTestId('assistant-ui-branch-picker')).toHaveAttribute(
      'data-persistence',
      'fitmeet-thread-metadata',
    );
    expect(screen.getByTestId('assistant-ui-branch-picker')).toHaveAttribute(
      'data-branch-source',
      'runtime',
    );
    expect(screen.getByTestId('assistant-ui-branch-picker')).toHaveAttribute(
      'data-action-count',
      '2',
    );
    expect(screen.getByTestId('assistant-ui-branch-picker')).toHaveAttribute(
      'data-current-index',
      '2',
    );
    expect(screen.getByTestId('assistant-ui-branch-picker')).toHaveAttribute(
      'data-branch-count',
      '2',
    );
    expect(screen.getByTestId('assistant-ui-branch-picker')).toHaveAttribute(
      'data-can-previous',
      'true',
    );
    expect(screen.getByTestId('assistant-ui-branch-picker')).toHaveAttribute(
      'data-can-next',
      'false',
    );
    expect(screen.getByTestId('assistant-ui-branch-picker')).toHaveAttribute(
      'data-branch-position',
      'last',
    );
    expect(screen.getByTestId('assistant-ui-branch-status')).toHaveTextContent('2/2');
    expect(screen.getByTestId('assistant-ui-branch-status')).toHaveAttribute(
      'data-source',
      'runtime',
    );
    expect(screen.getByTestId('assistant-ui-branch-status')).toHaveAttribute(
      'data-current-index',
      '2',
    );
    expect(screen.getByTestId('assistant-ui-branch-status')).toHaveAttribute(
      'data-branch-count',
      '2',
    );
    expect(screen.getByRole('button', { name: '上一个回答' })).toHaveAttribute(
      'data-action-id',
      'branch-previous',
    );
    expect(screen.getByRole('button', { name: '上一个回答' })).toHaveAttribute(
      'data-enabled',
      'true',
    );
    expect(screen.getByRole('button', { name: '下一个回答' })).toHaveAttribute(
      'data-action-id',
      'branch-next',
    );
    expect(screen.getByRole('button', { name: '下一个回答' })).toHaveAttribute(
      'data-enabled',
      'false',
    );
    expect(screen.getByRole('button', { name: '下一个回答' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '上一个回答' }));

    expect(await screen.findByText('第一个回答版本')).toBeInTheDocument();
    expect(screen.queryByText('第二个回答版本')).not.toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-branch-status')).toHaveTextContent('1/2');
    expect(screen.getByTestId('assistant-ui-branch-picker')).toHaveAttribute(
      'data-current-index',
      '1',
    );
    expect(screen.getByTestId('assistant-ui-branch-picker')).toHaveAttribute(
      'data-can-previous',
      'false',
    );
    expect(screen.getByTestId('assistant-ui-branch-picker')).toHaveAttribute(
      'data-can-next',
      'true',
    );
    expect(screen.getByTestId('assistant-ui-branch-picker')).toHaveAttribute(
      'data-branch-position',
      'first',
    );
    expect(screen.getByTestId('assistant-ui-branch-status')).toHaveAttribute(
      'data-current-index',
      '1',
    );
    expect(screen.getByRole('button', { name: '上一个回答' })).toHaveAttribute(
      'data-enabled',
      'false',
    );
    expect(screen.getByRole('button', { name: '下一个回答' })).toHaveAttribute(
      'data-enabled',
      'true',
    );
    expect(screen.getByRole('button', { name: '上一个回答' })).toBeDisabled();
    await waitFor(() =>
      expect(updateThreadSpy).toHaveBeenCalledWith(
        'agent-task:88',
        undefined,
        expect.objectContaining({
          branchSelections: { 'branch-branch-user': 1 },
          activeBranchId: 'assistant-v1',
          branchCount: 2,
        }),
        expect.objectContaining({
          branchSync: expect.objectContaining({
            action: 'previous',
            groupId: 'branch-branch-user',
            activeIndex: 1,
            activeBranchId: 'assistant-v1',
            branchCount: 2,
            source: 'assistant-ui-branch-picker',
          }),
          client: 'fitmeet-web',
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId('assistant-ui-branch-picker')).toHaveAttribute(
        'data-sync-status',
        'synced',
      ),
    );
    expect(screen.getByTestId('assistant-ui-branch-sync')).toHaveClass('sr-only');
    expect(screen.getByTestId('assistant-ui-branch-sync')).toHaveTextContent('版本已同步');
  });

  it('keeps branch switching usable when branch metadata sync fails', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession(92));
    vi.spyOn(socialAgentApi, 'updateThread').mockRejectedValue(new Error('sync failed'));
    window.localStorage.setItem(
      'fitmeet-agent-thread:current',
      JSON.stringify({
        activeTaskId: 92,
        mode: 'limited_auto',
        savedAt: Date.now(),
        branchSelections: { 'branch-branch-user': 2 },
        messages: [
          {
            id: 'branch-user',
            role: 'user',
            content: '给我两个回答版本',
          },
          {
            id: 'assistant-v1',
            role: 'assistant',
            content: '第一个回答版本',
            status: 'done',
            createsBranch: true,
          },
          {
            id: 'assistant-v2',
            role: 'assistant',
            content: '第二个回答版本',
            status: 'done',
            createsBranch: true,
          },
        ],
      }),
    );

    await renderAgentPage();

    expect(await screen.findByText('第二个回答版本')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '上一个回答' }));

    expect(await screen.findByText('第一个回答版本')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('assistant-ui-branch-picker')).toHaveAttribute(
        'data-sync-status',
        'failed',
      ),
    );
    expect(screen.getByTestId('assistant-ui-branch-sync')).toHaveAttribute(
      'data-sync-status',
      'failed',
    );
    expect(screen.getByTestId('assistant-ui-branch-sync')).toHaveTextContent('同步失败');
    expect(screen.getByTestId('assistant-ui-branch-sync')).not.toHaveClass('sr-only');
  });

  it('restores the selected assistant branch from local thread storage', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession(89));
    vi.spyOn(socialAgentApi, 'listThreads').mockResolvedValue({ threads: [] });
    window.localStorage.setItem(
      'fitmeet-agent-thread:current',
      JSON.stringify({
        activeTaskId: 89,
        mode: 'limited_auto',
        savedAt: Date.now(),
        branchSelections: { 'branch-branch-user': 1 },
        messages: [
          {
            id: 'branch-user',
            role: 'user',
            content: '给我两个回答版本',
          },
          {
            id: 'assistant-v1',
            role: 'assistant',
            content: '第一个回答版本',
            status: 'done',
            createsBranch: true,
          },
          {
            id: 'assistant-v2',
            role: 'assistant',
            content: '第二个回答版本',
            status: 'done',
            createsBranch: true,
          },
        ],
      }),
    );

    await renderAgentPage();

    expect(await screen.findByText('第一个回答版本')).toBeInTheDocument();
    expect(screen.queryByText('第二个回答版本')).not.toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-branch-status')).toHaveTextContent('1/2');
    expect(screen.getByRole('button', { name: '上一个回答' })).toBeDisabled();
  });

  it('uses compact density and content visibility for long conversations', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession(91));
    vi.spyOn(socialAgentApi, 'listThreads').mockResolvedValue({ threads: [] });
    const longMessages = Array.from({ length: 82 }, (_, index) => ({
      id: `long-${index}`,
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `长对话消息 ${index + 1}`,
      status: 'done',
      conversationIntent: 'conversation',
    }));
    window.localStorage.setItem(
      'fitmeet-agent-thread:current',
      JSON.stringify({
        activeTaskId: 91,
        mode: 'limited_auto',
        savedAt: Date.now(),
        messages: longMessages,
      }),
    );

    await renderAgentPage();

    expect(await screen.findByText('长对话消息 82')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-thread')).toHaveAttribute('data-density', 'compact');
    expect(screen.getByTestId('assistant-ui-thread')).toHaveAttribute('data-empty-state', 'hidden');
    expect(screen.getByTestId('assistant-ui-thread')).toHaveAttribute(
      'data-viewport-state',
      'visible',
    );
    expect(screen.getByTestId('assistant-ui-thread-viewport')).toHaveAttribute(
      'data-viewport-model',
      'assistant-ui-thread-viewport',
    );
    expect(screen.getByTestId('assistant-ui-thread-viewport')).toHaveAttribute(
      'data-scroll-model',
      'bottom-anchored-thread',
    );
    expect(screen.getByTestId('assistant-ui-thread-viewport')).toHaveAttribute(
      'data-scroll-anchor',
      'bottom',
    );
    expect(screen.getByTestId('assistant-ui-thread-viewport')).toHaveAttribute(
      'data-typing-scroll-policy',
      'manual',
    );
    expect(screen.getByTestId('assistant-ui-thread-viewport')).toHaveAttribute(
      'data-footer-behavior',
      'sticky-composer',
    );
    expect(screen.getByTestId('assistant-ui-thread-viewport')).toHaveClass('overscroll-contain');
    expect(screen.getByTestId('assistant-ui-thread-viewport')).not.toHaveClass('scroll-smooth');
    expect(screen.getByTestId('assistant-ui-thread-viewport')).toHaveClass(
      '[scroll-behavior:auto]',
    );
    expect(screen.getByTestId('assistant-ui-thread-viewport')).toHaveClass(
      '[overflow-anchor:none]',
    );
    expect(screen.getByTestId('assistant-ui-thread-viewport')).toHaveClass(
      '[scrollbar-gutter:stable]',
    );
    expect(screen.getByTestId('assistant-ui-thread-viewport')).toHaveClass(
      '[scroll-padding-bottom:calc(8rem+env(safe-area-inset-bottom)+env(keyboard-inset-height,0px))]',
    );
    expect(screen.getByTestId('assistant-ui-messages')).toHaveAttribute(
      'data-messages-model',
      'assistant-ui-thread-messages',
    );
    expect(screen.getByTestId('assistant-ui-messages')).toHaveAttribute(
      'data-message-renderer',
      'assistant-ui-message-parts',
    );
    expect(screen.getByTestId('assistant-ui-viewport-footer')).toHaveAttribute(
      'data-footer-model',
      'assistant-ui-viewport-footer',
    );
    expect(screen.getByTestId('assistant-ui-viewport-footer')).toHaveAttribute(
      'data-composer-placement',
      'sticky-bottom',
    );
    const renderedMessages = screen.getAllByTestId('assistant-ui-message');
    expect(renderedMessages[0]).toHaveAttribute('data-density', 'compact');
    expect(renderedMessages[0]).toHaveAttribute('data-render-strategy', 'content-visibility');
  });

  it('supports stop/cancel by aborting the current stream', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    let aborted = false;
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(
      async (_data, _onEvent, signal) =>
        new Promise<UserFacingAgentResponse>((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            aborted = true;
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );

    await renderAgentPage();

    submitPrompt('先停一下');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '停止生成' })).toBeInTheDocument(),
    );
    expect(screen.getByTestId('assistant-ui-composer')).toHaveAttribute(
      'data-primary-action',
      'cancel',
    );
    expect(screen.getByTestId('assistant-ui-composer')).toHaveAttribute(
      'data-composer-state',
      'generating',
    );
    fireEvent.click(screen.getByRole('button', { name: '停止生成' }));

    await waitFor(() => expect(aborted).toBe(true));
  });

  it('submits message feedback through the real feedback endpoint', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite },
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: undefined,
    });
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      const streamed = {
        ...mockResponse(),
        assistantMessage: '这是一条可以评价的回复。',
        cards: [],
      };
      onEvent({ type: 'result', result: streamed });
      return streamed;
    });
    const feedbackSpy = vi.spyOn(socialAgentApi, 'submitMessageFeedback').mockResolvedValue({
      ok: true,
      id: 1,
      messageId: 'assistant',
      value: 'positive',
      updatedAt: new Date().toISOString(),
    });

    await renderAgentPage();

    submitPrompt('评价测试');
    expect(await screen.findByText('这是一条可以评价的回复。')).toBeInTheDocument();
    const actionBar = screen.getByTestId('assistant-ui-action-bar');
    expect(actionBar).toHaveAttribute('role', 'toolbar');
    expect(actionBar).toHaveAttribute('aria-label', '助手消息操作');
    expect(actionBar).toHaveAttribute('data-action-count', '7');
    expect(actionBar).toHaveAttribute('data-actionbar-model', 'assistant-ui-message-actions');
    expect(actionBar).toHaveAttribute('data-autohide-model', 'hover-focus');
    expect(actionBar).toHaveAttribute('data-run-visibility', 'hide-when-running');
    expect(actionBar).toHaveAttribute('data-feedback-model', 'persistent-per-message');
    expect(actionBar).toHaveAttribute('data-share-model', 'native-or-copy-link');
    expect(actionBar).toHaveAttribute('data-reload-model', 'assistant-ui-reload');
    expect(actionBar.getAttribute('data-message-id') ?? '').toMatch(/^assistant/);
    expect(actionBar).toHaveAttribute('data-feedback-pinned', 'false');
    expect(actionBar).toHaveAttribute('data-visibility', 'hover-focus');
    expect(actionBar).toHaveAttribute('data-touch-visibility', 'visible');
    expect(actionBar).toHaveClass('opacity-100');
    expect(screen.getByRole('button', { name: '复制' })).toHaveAttribute('data-action-id', 'copy');
    expect(screen.getByRole('button', { name: '喜欢' })).toHaveAttribute(
      'data-action-id',
      'feedback-positive',
    );
    expect(screen.getByRole('button', { name: '不喜欢' })).toHaveAttribute(
      'data-action-id',
      'feedback-negative',
    );
    expect(screen.getByRole('button', { name: '朗读' })).toHaveAttribute('data-action-id', 'speak');
    expect(screen.getByRole('button', { name: '分享' })).toHaveAttribute('data-action-id', 'share');
    expect(screen.getByRole('button', { name: '重新生成' })).toHaveAttribute(
      'data-action-id',
      'reload',
    );
    expect(screen.getByRole('button', { name: '更多' })).toHaveAttribute('data-action-id', 'more');
    fireEvent.click(screen.getByRole('button', { name: '喜欢' }));

    await waitFor(() => expect(feedbackSpy).toHaveBeenCalled());
    expect(feedbackSpy.mock.calls[0]?.[1]).toMatchObject({
      value: 'positive',
      source: 'agent_web',
    });
    expect(await screen.findByText('反馈已保存')).toBeInTheDocument();
    expect(actionBar).toHaveClass('opacity-100');
    expect(actionBar).toHaveAttribute('data-feedback-status', 'submitted');
    expect(actionBar).toHaveAttribute('data-feedback-pinned', 'true');
    expect(actionBar).toHaveAttribute('data-visibility', 'pinned');
    expect(actionBar).toHaveAttribute('data-touch-visibility', 'pinned');
    expect(actionBar).toHaveAttribute('data-autohide-model', 'pinned');

    fireEvent.click(screen.getByRole('button', { name: '复制' }));
    expect(await screen.findByRole('button', { name: '已复制' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '已复制' })).toHaveAttribute(
      'data-copy-state',
      'copied',
    );

    fireEvent.click(screen.getByRole('button', { name: '分享' }));
    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledWith(window.location.href));
    expect(await screen.findByRole('button', { name: '已复制链接' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '已复制链接' })).toHaveAttribute(
      'data-share-state',
      'copied',
    );

    openRadixMenu(screen.getByRole('button', { name: '更多' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-action-more-menu')).toHaveAttribute(
      'data-menu-model',
      'compact-message-actions',
    );
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    openRadixMenu(screen.getByRole('button', { name: '更多' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: '复制链接' }));
    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledWith(window.location.href));
    expect(await screen.findByRole('menuitem', { name: '已复制' })).toBeInTheDocument();
  });

  it('keeps failed feedback attached to the attempted action and allows retry', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      const streamed = {
        ...mockResponse(),
        assistantMessage: '这是一条需要重试评价的回复。',
        cards: [],
      };
      onEvent({ type: 'result', result: streamed });
      return streamed;
    });
    let resolveRetryFeedback:
      | ((value: {
          ok: true;
          id: number;
          messageId: string;
          value: 'positive';
          updatedAt: string;
        }) => void)
      | null = null;
    const retryFeedbackPromise = new Promise<{
      ok: true;
      id: number;
      messageId: string;
      value: 'positive';
      updatedAt: string;
    }>((resolve) => {
      resolveRetryFeedback = resolve;
    });
    const feedbackSpy = vi
      .spyOn(socialAgentApi, 'submitMessageFeedback')
      .mockRejectedValueOnce(new Error('feedback failed'))
      .mockImplementationOnce(() => retryFeedbackPromise);

    await renderAgentPage();

    submitPrompt('评价失败重试测试');
    expect(await screen.findByText('这是一条需要重试评价的回复。')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '喜欢' }));

    expect(await screen.findByText('反馈没有保存，可再点一次')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '评价失败，可重试' })).toHaveAttribute(
      'data-feedback-error',
      'true',
    );
    expect(screen.getByRole('button', { name: '不喜欢' })).toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-action-bar')).toHaveAttribute(
      'data-feedback-status',
      'failed',
    );
    expect(screen.getByTestId('assistant-ui-action-bar')).toHaveAttribute(
      'data-visibility',
      'pinned',
    );

    fireEvent.click(screen.getByRole('button', { name: '评价失败，可重试' }));

    await waitFor(() => expect(feedbackSpy).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: '正在提交评价' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    await act(async () => {
      resolveRetryFeedback?.({
        ok: true,
        id: 2,
        messageId: 'assistant',
        value: 'positive',
        updatedAt: new Date().toISOString(),
      });
      await retryFeedbackPromise;
    });
    expect(await screen.findByText('反馈已保存')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-action-bar')).toHaveAttribute(
      'data-feedback-status',
      'submitted',
    );
  });

  it('renders dedicated tool UI and resumes through the real approval API', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const approvalResponse = {
      ...mockResponse(),
      assistantMessage: '这一步需要你确认。',
      lightStatus: '正在等待你确认' as const,
      runtime: {
        checkpointId: 99,
        checkpointType: 'interrupt',
        canResume: true,
        canReplay: true,
        canFork: true,
        threadId: 'agent-thread-42',
        idempotencyKey: 'approval-88',
        interrupt: {
          kind: 'approval',
          resumeAction: 'resume' as const,
        },
      },
      pendingConfirmations: [
        {
          id: 88,
          type: 'action',
          actionType: 'connect_candidate',
          summary: '连接候选人之前先确认。',
          riskLevel: 'high',
          expiresAt: null,
        },
      ],
    };
    const streamSpy = vi
      .spyOn(socialAgentApi, 'runUserFacingStream')
      .mockImplementation(async (_data, onEvent) => {
        onEvent({
          type: 'progress',
          id: 'profile',
          kind: 'tool',
          title: '整理用户画像',
          detail: '只整理上下文，不直接写入长期记忆。',
          state: 'done',
          metadata: {
            processType: 'memory',
          },
        });
        onEvent({
          type: 'progress',
          id: 'approval',
          kind: 'tool',
          title: '确认连接候选人',
          detail: '需要用户确认后继续。',
          state: 'waiting',
          metadata: {
            processType: 'approval',
            dryRunPreviewTitle: '邀请发送草稿',
            sideEffectAllowedBeforeApproval: false,
            auditRequired: true,
            resumePolicy: '同意后接着当前进度继续',
            executionBoundary: '需要预览、确认和审计后继续',
          },
        });
        onEvent({
          type: 'approval_required',
          approvalId: 88,
          actionType: 'connect_candidate',
          summary: '连接候选人之前先确认。',
          riskLevel: 'high',
        });
        onEvent({ type: 'result', result: approvalResponse });
        return approvalResponse;
      });
    const approveSpy = vi.spyOn(agentApprovalsApi, 'approve').mockResolvedValue({
      ok: true,
      status: 'approved',
      dispatched: true,
      result: {
        following: true,
        targetUserId: 22,
        friendRequestId: '601',
        conversationId: 'conv-22',
        openedConversation: true,
        socialRequestId: 301,
        candidateRecordId: 501,
        idempotencyKey: 'candidate-connect:42:22',
      },
      resume: mockApprovalResumePlan(),
    });
    const checkpointSpy = vi
      .spyOn(socialAgentApi, 'runCheckpointStream')
      .mockImplementation(async (_data, onEvent) => {
        const resumed = {
          ...mockResponse(),
          assistantMessage: '已从刚才的确认点继续处理。',
          cards: [],
        };
        onEvent({ type: 'result', result: resumed });
        return resumed;
      });

    await renderAgentPage();

    submitPrompt('帮我连接这个候选人');

    expect(await screen.findByTestId('assistant-ui-tool-ui')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-tool-ui')).toHaveAttribute('role', 'group');
    expect(screen.getByTestId('assistant-ui-tool-ui')).toHaveAttribute(
      'aria-label',
      expect.stringMatching(/^处理过程：/),
    );
    expect(screen.getByTestId('assistant-ui-tool-ui')).toHaveAttribute(
      'data-render-mode',
      'tool-ui',
    );
    expect(screen.getByTestId('assistant-ui-tool-ui')).toHaveAttribute(
      'data-process-status',
      'waiting',
    );
    expect(
      Number(screen.getByTestId('assistant-ui-tool-ui').getAttribute('data-process-step-count')),
    ).toBe(1);
    expect(
      Number(screen.getByTestId('assistant-ui-tool-ui').getAttribute('data-process-history-count')),
    ).toBeGreaterThanOrEqual(2);
    expect(
      Number(screen.getByTestId('assistant-ui-tool-ui').getAttribute('data-pending-count')),
    ).toBeGreaterThanOrEqual(0);
    expect(screen.getByTestId('assistant-ui-tool-ui')).toHaveAttribute('data-replayable', 'false');
    expect(screen.getByTestId('assistant-ui-tool-ui')).toHaveAttribute(
      'data-checkpoint-state',
      'none',
    );
    expect(screen.getByTestId('assistant-ui-tool-ui')).toHaveAttribute(
      'data-has-checkpoint',
      'false',
    );
    expect(screen.getByTestId('assistant-ui-approval-tool')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-approval-tool')).toHaveAttribute(
      'data-density',
      'inline',
    );
    expect(screen.getByTestId('assistant-ui-approval-tool')).toHaveTextContent('确认加好友并聊天');
    expect(screen.getByTestId('assistant-ui-approval-tool')).not.toHaveTextContent(
      'connect_candidate',
    );
    expect(screen.getByTestId('assistant-ui-approval-tool')).not.toHaveTextContent('riskLevel');
    expect(screen.getByTestId('assistant-ui-approval-tool')).toHaveClass('bg-white');
    expect(screen.getByTestId('assistant-ui-approval-tool')).not.toHaveClass('bg-amber-50/50');
    const approvalGuardrails = screen.getByTestId('assistant-ui-approval-guardrails');
    expect(approvalGuardrails).toHaveAttribute('data-risk-level', 'high');
    expect(approvalGuardrails).toHaveTextContent('不同意就不会执行');
    expect(approvalGuardrails).toHaveTextContent('同意后我会接着处理');
    expect(approvalGuardrails).toHaveTextContent('想改内容，直接告诉我');
    expect(screen.queryByTestId('assistant-ui-approval-runtime-hints')).not.toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-tool-ui')).not.toHaveAttribute('open');
    expect(screen.queryByTestId('assistant-ui-process-evidence')).not.toBeInTheDocument();
    const processSummary = screen.getByTestId('assistant-ui-tool-ui').querySelector('summary');
    expect(processSummary).not.toBeNull();
    fireEvent.click(processSummary as HTMLElement);
    const runtimeHints = screen.getByTestId('assistant-ui-approval-runtime-hints');
    expect(runtimeHints).toHaveTextContent('邀请发送草稿');
    expect(runtimeHints).toHaveTextContent('确认前不会触达对方');
    expect(runtimeHints).toHaveTextContent('之后可以回看这次确认');
    expect(runtimeHints).toHaveTextContent('同意后接着当前进度继续');
    expect(screen.getByText(/确认后才会发出好友申请/)).toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-approval-tool')).not.toHaveTextContent(/将要执行：/);
    expect(screen.getByTestId('assistant-ui-approval-tool')).not.toHaveTextContent(/连接候选人/);
    expect(document.body.textContent ?? '').not.toContain('connect_candidate');
    expect(screen.getByTestId('assistant-ui-tool-ui')).toHaveAttribute(
      'data-process-display',
      'compact',
    );
    expect(screen.getByTestId('assistant-ui-tool-ui')).toHaveAttribute(
      'data-process-surface',
      'single-line-status',
    );
    expect(screen.getByTestId('assistant-ui-tool-ui')).toHaveAttribute(
      'data-process-update-model',
      'latest-state',
    );
    expect(screen.getByTestId('assistant-ui-tool-ui')).toHaveAttribute(
      'data-process-rendering',
      'covering-status',
    );
    expect(screen.getByTestId('assistant-ui-tool-ui')).toHaveAttribute(
      'data-process-default-visible-count',
      '1',
    );
    expect(screen.getByTestId('assistant-ui-tool-ui')).toHaveAttribute(
      'data-process-detail-policy',
      'collapsed-until-open',
    );
    expect(screen.getByTestId('assistant-ui-tool-ui')).toHaveAttribute(
      'data-process-audit-policy',
      'expandable-summary',
    );
    expect(screen.getByTestId('assistant-ui-tool-ui')).toHaveAttribute(
      'data-default-expanded',
      'false',
    );
    expect(screen.getByTestId('assistant-ui-tool-ui')).toHaveAttribute(
      'data-raw-trace-policy',
      'hidden',
    );
    expect(screen.getByTestId('assistant-ui-tool-ui')).toHaveAttribute(
      'data-process-node-policy',
      'max-1-evidence',
    );
    expect(screen.getByTestId('assistant-ui-tool-ui')).toHaveAttribute('open');
    const evidence = screen.getByTestId('assistant-ui-process-evidence');
    expect(Number(evidence.getAttribute('data-evidence-count'))).toBeLessThanOrEqual(1);
    expect(screen.queryByTestId('assistant-ui-tool-group-summary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-tool-group')).not.toBeInTheDocument();
    expect(screen.queryByText('Life Graph')).not.toBeInTheDocument();
    expect(screen.queryByText('Safety Gate')).not.toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-compact-resume-state')).toHaveAttribute(
      'data-display-model',
      'compact-product-copy',
    );
    expect(screen.getByTestId('assistant-ui-compact-resume-state')).toHaveTextContent('需要你确认');
    expect(screen.queryByTestId('assistant-ui-resume-flow')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-resume-scope')).not.toBeInTheDocument();
    expect(screen.queryByText('恢复点 #99')).not.toBeInTheDocument();
    expect(screen.queryByText('同一对话继续')).not.toBeInTheDocument();
    expect(screen.queryByText('不会重复提交')).not.toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toContain('进度已保存');
    expect(document.body.textContent ?? '').not.toContain('保存点');
    expect(screen.queryByTestId('assistant-ui-tool-fallback')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '确认加好友' }));

    await waitFor(() => expect(approveSpy).toHaveBeenCalledWith(88));
    await waitFor(() =>
      expect(checkpointSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          checkpointId: 99,
          action: 'resume',
          decision: 'approved',
        }),
        expect.any(Function),
        expect.any(AbortSignal),
      ),
    );
    expect(await screen.findByText('已从刚才的确认点继续处理。')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getAllByTestId('assistant-ui-meet-loop-card').length).toBeGreaterThan(0),
    );
    const meetLoopCards = screen.getAllByTestId('assistant-ui-meet-loop-card');
    expect(meetLoopCards.some((card) => card.textContent?.includes('邀约进展'))).toBe(true);
    expect(meetLoopCards.some((card) => card.textContent?.includes('等待回复'))).toBe(true);
    expect(document.body.textContent ?? '').not.toContain('candidate-connect:42:22');
    expect(streamSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps approval action pending until approval and checkpoint resume complete', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const approvalResponse = {
      ...mockResponse(),
      assistantMessage: '这一步需要你确认。',
      lightStatus: '正在等待你确认' as const,
      runtime: {
        checkpointId: 99,
        checkpointType: 'interrupt',
        canResume: true,
        canReplay: true,
        canFork: true,
        threadId: 'agent-thread-42',
        idempotencyKey: 'approval-88',
        interrupt: {
          kind: 'approval',
          resumeAction: 'resume' as const,
        },
      },
      pendingConfirmations: [
        {
          id: 88,
          type: 'action',
          actionType: 'connect_candidate',
          summary: '连接候选人之前先确认。',
          riskLevel: 'high',
          expiresAt: null,
        },
      ],
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({
        type: 'approval_required',
        approvalId: 88,
        actionType: 'connect_candidate',
        summary: '连接候选人之前先确认。',
        riskLevel: 'high',
      });
      onEvent({ type: 'result', result: approvalResponse });
      return approvalResponse;
    });
    let resolveApprove!: () => void;
    const approveReady = new Promise<void>((resolve) => {
      resolveApprove = resolve;
    });
    vi.spyOn(agentApprovalsApi, 'approve').mockImplementation(async () => {
      await approveReady;
      return {
        ok: true,
        status: 'approved',
        dispatched: true,
        resume: mockApprovalResumePlan(),
      };
    });
    const checkpointSpy = vi
      .spyOn(socialAgentApi, 'runCheckpointStream')
      .mockImplementation(async (_data, onEvent) => {
        const resumed = {
          ...mockResponse(),
          assistantMessage: '已从刚才的确认点继续处理。',
          cards: [],
        };
        onEvent({ type: 'result', result: resumed });
        return resumed;
      });

    await renderAgentPage();
    submitPrompt('帮我连接这个候选人');

    const approvalTool = await screen.findByTestId('assistant-ui-approval-tool');
    expect(approvalTool).toHaveAttribute('data-has-checkpoint', 'false');
    expect(approvalTool).toHaveAttribute('data-checkpoint-id', '');
    expect(approvalTool).toHaveAttribute('data-approval-state', 'pending');
    const approveButton = await screen.findByRole('button', { name: '确认加好友' });
    expect(approveButton).toHaveAttribute('data-testid', 'assistant-ui-approval-action');
    expect(approveButton).toHaveAttribute('data-approval-action', 'approve');
    expect(approveButton).toHaveAttribute('data-approval-id', '88');
    expect(approveButton).toHaveAttribute('data-checkpoint-id', '');

    fireEvent.click(approveButton);

    expect(await screen.findByRole('button', { name: '正在加好友' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '取消' })).toHaveAttribute(
      'data-action-state',
      'locked',
    );
    expect(checkpointSpy).not.toHaveBeenCalled();
    expect(screen.queryByText('已从刚才的确认点继续处理。')).not.toBeInTheDocument();

    await act(async () => {
      resolveApprove();
      await approveReady;
    });

    await waitFor(() =>
      expect(checkpointSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          checkpointId: 99,
          action: 'resume',
          decision: 'approved',
        }),
        expect.any(Function),
        expect.any(AbortSignal),
      ),
    );
    expect(await screen.findByText('已从刚才的确认点继续处理。')).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toContain('trace-1');
    expect(document.body.textContent ?? '').not.toContain('run-1');
  });

  it('continues after approval without creating a branch when no checkpoint resume is returned', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const approvalResponse = {
      ...mockResponse(),
      assistantMessage: '发送邀请前需要你确认。',
      lightStatus: '正在等待你确认' as const,
      runtime: {
        threadId: 'agent-thread-42',
        idempotencyKey: 'approval-88',
      },
      pendingConfirmations: [
        {
          id: 88,
          type: 'action',
          actionType: 'send_invite',
          summary: '发送邀请前先确认。',
          riskLevel: 'high',
          expiresAt: null,
        },
      ],
    };
    const continuedResponse = {
      ...mockResponse(),
      assistantMessage: '已继续按刚才的候选人和约练需求处理。',
      runtime: {
        runId: 'approval-continue-run',
        messageId: 'approval-continue-message',
        threadId: 'agent-thread-42',
      },
      cards: [],
      pendingConfirmations: [],
    };
    const streamSpy = vi
      .spyOn(socialAgentApi, 'runUserFacingStream')
      .mockImplementation(async (_data, onEvent) => {
        if (streamSpy.mock.calls.length === 1) {
          onEvent({
            type: 'approval_required',
            approvalId: 88,
            actionType: 'send_invite',
            summary: '发送邀请前先确认。',
            riskLevel: 'high',
          });
          onEvent({ type: 'result', result: approvalResponse });
          return approvalResponse;
        }
        onEvent({ type: 'result', result: continuedResponse });
        return continuedResponse;
      });
    vi.spyOn(agentApprovalsApi, 'approve').mockResolvedValue({
      ok: true,
      status: 'approved',
      dispatched: true,
    });
    const checkpointSpy = vi.spyOn(socialAgentApi, 'runCheckpointStream').mockResolvedValue({
      ...mockResponse(),
      assistantMessage: '不应该走 checkpoint。',
    });

    await renderAgentPage();
    submitPrompt('帮我发送邀请');

    const approveButton = await screen.findByRole('button', { name: '确认发送' });
    fireEvent.click(approveButton);

    expect(await screen.findByText('已继续按刚才的候选人和约练需求处理。')).toBeInTheDocument();
    expect(streamSpy).toHaveBeenCalledTimes(2);
    expect(checkpointSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('assistant-ui-branch-picker')).not.toBeInTheDocument();
    expect(screen.getAllByText('帮我发送邀请')).toHaveLength(1);
    expect(screen.queryByText('2/2')).not.toBeInTheDocument();
  });

  it('surfaces checkpoint persistence failures after approval without replaying the side effect', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const approvalResponse = {
      ...mockResponse(),
      assistantMessage: '这一步需要你确认。',
      lightStatus: '正在等待你确认' as const,
      runtime: {
        checkpointId: 99,
        checkpointType: 'interrupt',
        canResume: true,
        canReplay: true,
        canFork: true,
        threadId: 'agent-thread-42',
        idempotencyKey: 'approval-88',
        interrupt: {
          kind: 'approval',
          resumeAction: 'resume' as const,
        },
      },
      pendingConfirmations: [
        {
          id: 88,
          type: 'action',
          actionType: 'connect_candidate',
          summary: '连接候选人之前先确认。',
          riskLevel: 'high',
          expiresAt: null,
        },
      ],
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({
        type: 'approval_required',
        approvalId: 88,
        actionType: 'connect_candidate',
        summary: '连接候选人之前先确认。',
        riskLevel: 'high',
      });
      onEvent({ type: 'result', result: approvalResponse });
      return approvalResponse;
    });
    const approveSpy = vi.spyOn(agentApprovalsApi, 'approve').mockResolvedValue({
      ok: true,
      status: 'approved',
      dispatched: true,
      checkpointError: 'database checkpoint write failed traceId=trace-should-not-render',
      result: {
        following: true,
        targetUserId: 22,
        friendRequestId: '601',
        conversationId: 'conv-22',
        openedConversation: true,
        socialRequestId: 301,
        candidateRecordId: 501,
      },
      resume: mockApprovalResumePlan(),
    });
    const checkpointSpy = vi.spyOn(socialAgentApi, 'runCheckpointStream').mockResolvedValue({
      ...mockResponse(),
      assistantMessage: '不应该自动恢复。',
    });

    await renderAgentPage();
    submitPrompt('帮我连接这个候选人');

    expect(await screen.findByTestId('assistant-ui-approval-tool')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认加好友' }));

    await waitFor(() => expect(approveSpy).toHaveBeenCalledWith(88));
    const recovery = await screen.findByTestId('assistant-ui-interrupt-resume');
    expect(recovery).toHaveAttribute('data-kind', 'checkpoint_failed');
    expect(recovery).toHaveTextContent('确认已记录，后续可以继续');
    expect(recovery).toHaveTextContent('为了避免重复触达对方，我不会自动重跑这个动作');
    expect(screen.queryByRole('button', { name: '继续处理' })).not.toBeInTheDocument();
    expect(checkpointSpy).not.toHaveBeenCalled();
    expect(document.body.textContent ?? '').not.toContain('trace-should-not-render');
    expect(document.body.textContent ?? '').not.toContain('trace-1');
    expect(document.body.textContent ?? '').not.toContain('run-1');
  });

  it('rejects dedicated approval Tool UI through the checkpoint stream without executing the action', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    vi.spyOn(socialAgentApi, 'updateThread').mockResolvedValue({
      thread: {
        id: '101',
        threadId: 101,
        taskId: 101,
        title: '拒绝连接候选人',
        preview: '不会执行这一步',
        status: 'regular',
        goal: '拒绝连接候选人',
        messageCount: 2,
        updatedAt: '2026-06-13T12:00:00.000Z',
        createdAt: '2026-06-13T12:00:00.000Z',
      },
    });
    const approvalResponse = {
      ...mockResponse(),
      assistantMessage: '这一步需要你确认。',
      lightStatus: '正在等待你确认' as const,
      runtime: {
        checkpointId: 99,
        checkpointType: 'interrupt',
        canResume: true,
        canReplay: true,
        canFork: true,
        threadId: 'agent-thread-42',
        idempotencyKey: 'approval-88',
        interrupt: {
          kind: 'approval',
          resumeAction: 'resume' as const,
        },
      },
      pendingConfirmations: [
        {
          id: 88,
          type: 'action',
          actionType: 'connect_candidate',
          summary: '连接候选人之前先确认。',
          riskLevel: 'high',
          expiresAt: null,
        },
      ],
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({
        type: 'approval_required',
        approvalId: 88,
        actionType: 'connect_candidate',
        summary: '连接候选人之前先确认。',
        riskLevel: 'high',
      });
      onEvent({ type: 'result', result: approvalResponse });
      return approvalResponse;
    });
    const rejectSpy = vi.spyOn(agentApprovalsApi, 'reject').mockResolvedValue({
      ok: true,
      status: 'rejected',
      resume: mockApprovalResumePlan(),
    });
    const checkpointSpy = vi
      .spyOn(socialAgentApi, 'runCheckpointStream')
      .mockImplementation(async (_data, onEvent) => {
        const rejected = {
          ...mockResponse(),
          assistantMessage:
            '好的，我不会执行这一步。你可以继续补充要求，或者让我换一种更稳妥的方式处理。',
          cards: [],
        };
        onEvent({ type: 'result', result: rejected });
        return rejected;
      });

    await renderAgentPage();

    submitPrompt('这次不要连接候选人');

    expect(await screen.findByTestId('assistant-ui-approval-tool')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-approval-guardrails')).toHaveTextContent(
      '不同意就不会执行',
    );
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    await waitFor(() => expect(rejectSpy).toHaveBeenCalledWith(88));
    await waitFor(() =>
      expect(checkpointSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          checkpointId: 99,
          action: 'resume',
          decision: 'rejected',
        }),
        expect.any(Function),
        expect.any(AbortSignal),
      ),
    );
    expect(
      await screen.findByText(
        '好的，我不会执行这一步。你可以继续补充要求，或者让我换一种更稳妥的方式处理。',
      ),
    ).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toContain('connect_candidate');
    expect(document.body.textContent ?? '').not.toContain('trace-1');
    expect(document.body.textContent ?? '').not.toContain('run-1');
  });

  it('surfaces checkpoint persistence failures after rejection without resuming the interrupted step', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const approvalResponse = {
      ...mockResponse(),
      assistantMessage: '这一步需要你确认。',
      lightStatus: '正在等待你确认' as const,
      runtime: {
        checkpointId: 99,
        checkpointType: 'interrupt',
        canResume: true,
        canReplay: true,
        canFork: true,
        threadId: 'agent-thread-42',
        idempotencyKey: 'approval-88',
        interrupt: {
          kind: 'approval',
          resumeAction: 'resume' as const,
        },
      },
      pendingConfirmations: [
        {
          id: 88,
          type: 'action',
          actionType: 'connect_candidate',
          summary: '连接候选人之前先确认。',
          riskLevel: 'high',
          expiresAt: null,
        },
      ],
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({
        type: 'approval_required',
        approvalId: 88,
        actionType: 'connect_candidate',
        summary: '连接候选人之前先确认。',
        riskLevel: 'high',
      });
      onEvent({ type: 'result', result: approvalResponse });
      return approvalResponse;
    });
    const rejectSpy = vi.spyOn(agentApprovalsApi, 'reject').mockResolvedValue({
      ok: true,
      status: 'rejected',
      checkpointError: 'checkpoint write failed traceId=reject-trace',
      resume: mockApprovalResumePlan(),
    });
    const checkpointSpy = vi.spyOn(socialAgentApi, 'runCheckpointStream').mockResolvedValue({
      ...mockResponse(),
      assistantMessage: '不应该自动恢复。',
    });

    await renderAgentPage();
    submitPrompt('这次不要连接候选人');

    expect(await screen.findByTestId('assistant-ui-approval-tool')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    await waitFor(() => expect(rejectSpy).toHaveBeenCalledWith(88));
    const recovery = await screen.findByTestId('assistant-ui-interrupt-resume');
    expect(recovery).toHaveAttribute('data-kind', 'checkpoint_failed');
    expect(recovery).toHaveTextContent('已取消这个动作');
    expect(recovery).toHaveTextContent('不会继续触达对方');
    expect(screen.queryByRole('button', { name: '继续处理' })).not.toBeInTheDocument();
    expect(checkpointSpy).not.toHaveBeenCalled();
    expect(document.body.textContent ?? '').not.toContain('reject-trace');
    expect(document.body.textContent ?? '').not.toContain('trace-1');
    expect(document.body.textContent ?? '').not.toContain('run-1');
  });

  it('uses checkpoint stream for tool replay and fork actions', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const checkpointStepId = 'social/match rank #1';
    const streamed = {
      ...mockResponse(),
      assistantMessage: '我整理好了，可以重新整理或换一种方案。',
      runtime: {
        checkpointId: 123,
        checkpointType: 'step',
        canResume: false,
        canReplay: true,
        canFork: true,
        checkpointAction: 'replay' as const,
        resumeCursor: {
          threadId: 'agent-task:123',
          checkpointId: 123,
          parentCheckpointId: null,
          action: 'replay' as const,
          stepId: checkpointStepId,
        },
        sourceStep: {
          stepId: checkpointStepId,
          label: '正在排序候选人',
          toolName: '匹配步骤',
        },
        stepScope: {
          mode: 'through_step' as const,
          stepCount: 2,
          sourceCheckpointId: 122,
        },
        sideEffectPolicy: {
          idempotencyKey: 'agent-checkpoint:replay:agent-task:123:checkpoint:123:step:rank',
          sideEffectsBeforeResume: 'idempotent_only' as const,
          duplicatePolicy: 'reuse_idempotency_key' as const,
        },
        interrupt: {
          kind: 'approval_required',
          threadId: 'agent-task:123',
          idempotencyKey: 'agent-checkpoint:replay:agent-task:123:checkpoint:123:step:rank',
          resumeAction: 'replay' as const,
          stepActions: [
            {
              stepId: checkpointStepId,
              action: 'replay' as const,
              label: '重新整理',
              method: 'POST',
              endpoint: `/social-agent/chat/checkpoints/123/steps/${encodeURIComponent(checkpointStepId)}/replay/stream`,
              idempotencyKey: 'agent-checkpoint:replay:agent-task:123:checkpoint:123:step:rank',
            },
            {
              stepId: checkpointStepId,
              action: 'fork' as const,
              label: '换一种方案',
              method: 'POST',
              endpoint: `/social-agent/chat/checkpoints/123/steps/${encodeURIComponent(checkpointStepId)}/fork/stream`,
              idempotencyKey: 'agent-checkpoint:fork:agent-task:123:checkpoint:123:step:rank',
            },
          ],
        },
      },
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({
        type: 'progress',
        id: '',
        kind: 'tool',
        title: '整理匹配选项',
        detail: '已完成候选召回。',
        state: 'done',
        metadata: {
          agentName: 'Social Match Agent',
        },
        snapshot: {
          schemaVersion: 'fitmeet.step-snapshot.v1',
          observation: ['候选来源：3 个安全摘要'],
          critique: '这一步产生了可用观察，可以交给后续步骤继续整理。',
          result: '已完成，并记录 1 个安全摘要字段。',
        },
      });
      onEvent({ type: 'result', result: streamed });
      return streamed;
    });
    const checkpointSpy = vi
      .spyOn(socialAgentApi, 'runCheckpointStream')
      .mockImplementation(async (data, onEvent) => {
        const replayed = {
          ...mockResponse(),
          assistantMessage: data.action === 'fork' ? '已换一种方案。' : '已重新整理。',
          cards: [],
        };
        onEvent({ type: 'result', result: replayed });
        return replayed;
      });

    await renderAgentPage();
    submitPrompt('我想找周末跑步搭子，帮我整理一个可重新整理的步骤');

    expect(await screen.findByText(streamed.assistantMessage)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重新整理' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '换一种方案' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-checkpoint-action')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-step-snapshot')).not.toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(forbiddenUserArtifacts);
    expect(document.body.textContent ?? '').not.toMatch(
      /Life Graph Agent|Social Match Agent|Meet Loop Agent|Agent Brain/i,
    );
    expect(checkpointSpy).not.toHaveBeenCalled();
  });

  it('does not expose checkpoint replay controls from a user-facing response', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const streamed = {
      ...mockResponse(),
      assistantMessage: '我整理好了，可以重新整理。',
      runtime: {
        checkpointId: 123,
        checkpointType: 'step',
        canResume: false,
        canReplay: true,
        canFork: false,
        checkpointAction: 'replay' as const,
        resumeCursor: {
          threadId: 'agent-task:123',
          parentCheckpointId: null,
          action: 'replay' as const,
          stepId: 'rank',
        },
      },
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({
        type: 'progress',
        id: 'rank',
        kind: 'tool',
        title: '正在排序候选人',
        state: 'done',
      });
      onEvent({ type: 'result', result: streamed });
      return streamed;
    });
    const checkpointSpy = vi.spyOn(socialAgentApi, 'runCheckpointStream').mockResolvedValue({
      ...mockResponse(),
      assistantMessage: '不应该从普通用户页触发 checkpoint。',
    });

    await renderAgentPage();
    submitPrompt('我想找周末跑步搭子，帮我整理一个可重新整理的步骤');

    expect(await screen.findByText(streamed.assistantMessage)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重新整理' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-checkpoint-action')).not.toBeInTheDocument();
    expect(checkpointSpy).not.toHaveBeenCalled();
  });

  it('does not expose checkpoint retry controls for failed user-facing steps', async () => {
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue(emptySession());
    const streamed = {
      ...mockResponse(),
      assistantMessage: '刚才连接不稳，可以继续当前进度。',
      runtime: {
        checkpointId: 321,
        checkpointType: 'step',
        canResume: false,
        canReplay: true,
        canFork: false,
        checkpointAction: 'retry' as const,
      },
    };
    vi.spyOn(socialAgentApi, 'runUserFacingStream').mockImplementation(async (_data, onEvent) => {
      onEvent({
        type: 'progress',
        id: 'rank',
        kind: 'tool',
        title: '排序候选机会',
        detail: '排序服务暂时没有完成。',
        state: 'failed',
      });
      onEvent({ type: 'result', result: streamed });
      return streamed;
    });
    const checkpointSpy = vi
      .spyOn(socialAgentApi, 'runCheckpointStream')
      .mockImplementation(async (data, onEvent) => {
        const retried = {
          ...mockResponse(),
          assistantMessage: data.action === 'retry' ? '已重试这个步骤。' : '已继续处理这个步骤。',
          cards: [],
          runtime: {
            checkpointId: 321,
            checkpointType: 'step',
            canResume: false,
            canReplay: true,
            canFork: false,
            checkpointAction: 'retry' as const,
            resumeCursor: {
              threadId: 'agent-task:321',
              parentCheckpointId: 321,
              action: 'retry' as const,
              stepId: 'rank',
            },
          },
        };
        onEvent({ type: 'result', result: retried });
        return retried;
      });

    await renderAgentPage();

    submitPrompt('帮我找人，如果排序失败就从这一步重试');

    expect(await screen.findByText('刚才连接不稳')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-tool-ui')).toHaveAttribute(
      'data-checkpoint-state',
      'none',
    );
    expect(screen.getByTestId('assistant-ui-tool-ui')).toHaveAttribute(
      'data-process-status',
      'error',
    );
    expect(screen.getByTestId('assistant-ui-tool-ui')).toHaveAttribute('data-retryable', 'false');
    expect(screen.getByTestId('assistant-ui-tool-ui')).toHaveAttribute('data-step-id', 'rank');
    expect(screen.queryByTestId('assistant-ui-process-step')).not.toBeInTheDocument();
    const retryToolSummary = screen.getByTestId('assistant-ui-tool-ui').querySelector('summary');
    expect(retryToolSummary).not.toBeNull();
    fireEvent.click(retryToolSummary as HTMLElement);
    const failedStep = screen
      .getAllByTestId('assistant-ui-process-step')
      .find((step) => step.getAttribute('data-step-id') === 'rank');
    expect(failedStep).toBeTruthy();
    expect(failedStep).toHaveAttribute('data-step-id', 'rank');
    expect(failedStep).toHaveAttribute('data-step-status', 'error');
    expect(failedStep).toHaveAttribute('data-current-step', 'true');
    expect(failedStep).toHaveAttribute('aria-current', 'step');
    expect(screen.queryByRole('button', { name: '继续处理' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-ui-checkpoint-action')).not.toBeInTheDocument();
    expect(checkpointSpy).not.toHaveBeenCalled();
    expect(document.body.textContent ?? '').not.toMatch(forbiddenUserArtifacts);
  });

  it('keeps the assistant surface usable at mobile width', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    useRealAgentAdapter();
    useAuthStore.setState({ isLoggedIn: true, showLoginModal: false });
    vi.spyOn(socialAgentApi, 'restoreSession').mockResolvedValue({
      ...emptySession(390),
      messages: [
        {
          id: 'mobile-user',
          role: 'user',
          content: '移动端普通消息',
        },
      ],
    });
    vi.spyOn(socialAgentApi, 'listThreads').mockResolvedValue({ threads: [] });
    window.localStorage.setItem(
      'fitmeet-agent-thread:current',
      JSON.stringify({
        activeTaskId: 390,
        mode: 'limited_auto',
        savedAt: Date.now() - 1000,
        messages: [
          {
            id: 'mobile-user',
            role: 'user',
            content: '移动端普通消息',
            status: 'done',
            conversationIntent: 'conversation',
          },
        ],
      }),
    );

    await renderAgentPage();

    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(await screen.findByText('移动端普通消息')).toBeInTheDocument();
    const userMessage = screen
      .getAllByTestId('assistant-ui-message')
      .find((message) => message.getAttribute('data-role') === 'user');
    expect(userMessage?.querySelector('.max-w-\\[88\\%\\]')).not.toBeNull();
    expect(userMessage?.querySelector('.sm\\:max-w-\\[78\\%\\]')).not.toBeNull();
    const openSidebar = screen.getByRole('button', { name: '打开会话列表' });
    expect(openSidebar).toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-thread-list')).toHaveAttribute('data-state', 'closed');
    expect(screen.getByTestId('assistant-ui-thread-list')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('assistant-ui-thread-list')).toHaveAttribute('inert');
    expect(screen.getByTestId('assistant-ui-main')).toHaveAttribute(
      'data-mobile-sidebar-modal',
      'false',
    );
    expect(screen.getByTestId('assistant-ui-main')).not.toHaveAttribute('aria-hidden');
    expect(screen.getByTestId('assistant-ui-main')).not.toHaveAttribute('inert');
    expect(screen.getByTestId('assistant-ui-thread-viewport')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-composer')).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(forbiddenUserArtifacts);

    fireEvent.click(openSidebar);

    expect(screen.getByRole('button', { name: '关闭会话列表' })).toBeInTheDocument();
    expect(screen.getByTestId('assistant-ui-mobile-sidebar-backdrop')).toHaveAttribute(
      'data-state',
      'open',
    );
    expect(screen.getByTestId('assistant-ui-thread-list')).toHaveAttribute('data-state', 'open');
    expect(screen.getByTestId('assistant-ui-thread-list')).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByTestId('assistant-ui-thread-list')).not.toHaveAttribute('inert');
    expect(screen.getByTestId('assistant-ui-main')).toHaveAttribute(
      'data-mobile-sidebar-modal',
      'true',
    );
    expect(screen.getByTestId('assistant-ui-main')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('assistant-ui-main')).toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(screen.getByTestId('assistant-ui-mobile-sidebar-backdrop'));

    await waitFor(() => expect(screen.queryByRole('button', { name: '关闭会话列表' })).toBeNull());
    await waitFor(() =>
      expect(screen.queryByTestId('assistant-ui-mobile-sidebar-backdrop')).toBeNull(),
    );
    await waitFor(() => expect(document.activeElement).toBe(openSidebar));
    expect(screen.getByTestId('assistant-ui-main')).toHaveAttribute(
      'data-mobile-sidebar-modal',
      'false',
    );
    expect(screen.getByTestId('assistant-ui-main')).not.toHaveAttribute('aria-hidden');
    expect(screen.getByTestId('assistant-ui-main')).not.toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('');
  });
});

async function renderAgentPage(route = '/agent/chat'): Promise<RenderResult> {
  let result: RenderResult;
  await act(async () => {
    result = render(
      <MemoryRouter initialEntries={[route]}>
        <AgentWorkspacePage view="chat" />
      </MemoryRouter>,
    );
  });
  await settleAgentPage();
  return result!;
}

async function renderAgentPageWithRoutes(route = '/agent/chat'): Promise<RenderResult> {
  let result: RenderResult;
  await act(async () => {
    result = render(
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/agent/chat" element={<AgentWorkspacePage view="chat" />} />
          <Route path="/agent/chat/:taskId" element={<AgentWorkspacePage view="chat" />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await settleAgentPage();
  return result!;
}

async function settleAgentPage() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
  await waitFor(() => {
    expect(screen.queryByTestId('assistant-ui-shell-loading')).not.toBeInTheDocument();
  });
}

function submitPrompt(text: string) {
  const textbox = screen.getByRole('textbox');
  fireEvent.change(textbox, { target: { value: text } });
  fireEvent.submit(textbox.closest('form') as HTMLFormElement);
}

function emptySession(taskId: number | null = null): UserFacingAgentSessionSnapshot {
  return {
    hasSession: Boolean(taskId),
    activeTaskId: taskId,
    task: taskId ? { id: taskId, permissionMode: 'limited_auto', goal: '上一次的问题' } : null,
    messages: [],
    result: null,
  };
}

function emptyReplay(taskId = 42): SocialCodexReplayPackage {
  return {
    taskId,
    threadId: String(taskId),
    runId: `run-${taskId}`,
    eventCount: 0,
    returnedCount: 0,
    lastSeq: null,
    lastEventId: null,
    terminalType: null,
    pendingApproval: false,
    events: [],
    eval: {
      pass: true,
      issues: [],
      replayCase: {
        runId: `run-${taskId}`,
        threadId: String(taskId),
        taskId,
        eventCount: 0,
        stages: [],
        approvalRequired: false,
        terminalType: null,
      },
    },
  };
}

function socialCodexReplayEvent(
  seq: number,
  type: SocialCodexReplayPackage['events'][number]['type'],
  overrides: Partial<SocialCodexReplayPackage['events'][number]> = {},
): SocialCodexReplayPackage['events'][number] {
  return {
    type,
    eventId: `run-77:${seq}`,
    seq,
    createdAt: new Date('2026-06-17T00:00:00.000Z').toISOString(),
    userId: '12',
    threadId: '77',
    taskId: 77,
    runId: 'run-77',
    stage: 'detect_social_intent',
    visibility: 'user_visible',
    display: { title: '正在理解你的需求', state: 'running' },
    ...overrides,
  };
}

function mockResponse(): UserFacingAgentResponse {
  return {
    assistantMessage: '我整理好了，可以继续追问。',
    lightStatus: '已整理回复',
    permissionMode: 'limited_auto',
    safeStatus: {
      blocked: false,
      level: 'low',
      boundaryNotes: [],
      requiredConfirmations: [],
    },
    pendingConfirmations: [],
    cards: [],
  };
}

function mockWorkflow(
  workflowId: string,
  state: NonNullable<UserFacingAgentResponse['workflow']>['state'] = 'IDLE',
  overrides: Partial<NonNullable<UserFacingAgentResponse['workflow']>> = {},
): NonNullable<UserFacingAgentResponse['workflow']> {
  return {
    workflowId,
    state,
    requiredAction: state === 'RECOVERY' ? 'retry' : null,
    retryable: state === 'RECOVERY',
    recoveryMessage: state === 'RECOVERY' ? '我保留了这段进度，可以从这里继续。' : null,
    ...overrides,
  };
}

function mockReminderPreference(
  overrides: Partial<SocialAgentReminderPreference> = {},
): SocialAgentReminderPreference {
  return {
    id: 1,
    userId: 12,
    enabled: false,
    topics: ['friendship', 'fitness_partner', 'activity'],
    frequency: 'weekly',
    quietStart: '09:00',
    quietEnd: '21:00',
    tone: 'gentle',
    metadata: {},
    lastSuggestedAt: null,
    mutedUntil: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function mockReminderContext() {
  return {
    reminderProtocol: 'fitmeet.agent.reminder.v1',
    suggestionOnly: true,
    deliveryChannels: ['in_app', 'agent_thread'],
    externalDeliveryDisabled: true,
    settingsRoute: '/agent/chat?settings=reminders',
    optOutAction: 'social_agent.reminder.disable',
    dismissAction: 'social_agent.reminder.dismiss',
    allowedActions: ['open_agent_chat', 'view_safe_opportunities'],
    preferenceHistorySignals: ['最近确认：兴趣「羽毛球」', '最近确认：可约时间「周末下午」'],
    memoryDerivedIntent: true,
    prohibitedActions: [
      'send_message',
      'add_friend',
      'connect_candidate',
      'create_activity',
      'publish_activity',
      'change_privacy',
      'payment',
    ],
    reminderSafetyProtocol: [
      {
        key: 'suggestion_only',
        label: '只做建议',
        detail: '提醒只会帮你查看机会，不会自动执行任何社交动作。',
      },
      {
        key: 'delivery',
        label: '站内提醒',
        detail: '只通过站内通知和 Agent 会话提示，不使用短信、邮件或外部推送。',
      },
      {
        key: 'approval',
        label: '执行确认',
        detail: '发送邀请、加好友、创建活动或公开发布前都会再次确认。',
      },
      {
        key: 'opt_out',
        label: '随时关闭',
        detail: '你可以在 Agent 会话设置里关闭或调整提醒场景。',
      },
    ],
    safeBoundary: '提醒只会帮你查看机会，发送邀请、加好友、创建活动或公开发布前都会再次确认。',
  };
}

function mockConnectTimelineResponse(): UserFacingAgentResponse {
  return {
    ...mockResponse(),
    assistantMessage:
      '已按你的确认完成连接，并打开后续沟通入口。接下来可以等待对方回复，或继续让我帮你准备更自然的沟通节奏。',
    lightStatus: '已整理回复',
    workflow: mockWorkflow('agent-task:101', 'RECOVERY', {
      recoveryMessage: '已按你的确认完成连接，并打开后续沟通入口。',
    }),
    cards: [
      {
        id: 'meet-loop-connect-opened',
        type: 'review_card',
        title: '连接进展',
        body: '连接完成后，我会把后续回复、改期、确认见面和评价串成连续流程。',
        status: 'ready',
        data: {
          taskId: 101,
          schemaName: 'MeetLoopTimelineCard',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'meet_loop.timeline',
          candidateUserId: 22,
          loopStage: 'waiting_reply',
          timeline: {
            title: '连接进展',
            description: '连接已打开，后续沟通会继续保存在这里。',
            nextAction: '等待对方回复；如果时间不合适，可以继续改期或调整邀约。',
            steps: [
              {
                key: 'draft',
                label: '连接已打开',
                state: 'done',
                description: '你确认后，我才打开后续沟通入口。',
              },
              {
                key: 'sent',
                label: '等待回复',
                state: 'current',
                description: '等待对方回复，不重复打扰。',
                checkpointReady: true,
                resumeMode: 'resume',
              },
              {
                key: 'reschedule',
                label: '必要时改期',
                state: 'next',
                description: '如果时间不合适，可以继续协商调整。',
                resumeMode: 'reschedule',
              },
            ],
          },
        },
        actions: [
          {
            id: 'meet-loop-connect-resume',
            label: '继续推进',
            action: 'meet_loop.resume',
            schemaAction: 'meet_loop.resume',
            requiresConfirmation: true,
            payload: { taskId: 101, checkpointId: 6201, targetUserId: 22 },
          },
        ],
      },
    ],
  };
}

function mockCandidateResponse(): UserFacingAgentResponse {
  return {
    ...mockResponse(),
    assistantMessage: '我先给你一个自然回答；如果你真的想找人，可以继续告诉我偏好。',
    lightStatus: '正在筛选公开可发现的人',
    cards: [
      {
        id: 'candidate-1',
        type: 'candidate_card',
        title: '小林',
        body: '推荐候选人',
        status: 'ready',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'social_match.candidate',
        data: {
          taskId: 101,
          schemaName: 'OpportunityCard',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'social_match.candidate',
          opportunityCard: true,
          opportunity: {
            type: 'person',
            title: '和小林低压力认识',
            subtitle: '青岛 · 跑步 · 周末下午',
            relationshipGoal: '先从低压力运动搭子开始',
            idealType: '同城、周末有空、愿意先站内聊',
            confirmedContext: ['青岛', '周末下午', '轻松跑步', '公共场所'],
          },
          avatarUrl: '/avatars/xiaolin.png',
          displayName: '小林',
          matchScore: 87,
          distanceKm: 2.4,
          sharedInterests: ['跑步', '周末下午'],
          fitReasons: ['你们都偏好公共场所', '你们的运动强度接近'],
          explanationSteps: [
            '来源：周末跑步偏好',
            '匹配：时间和强度更接近',
            '安全：仅展示模糊区域',
          ],
          recommendationLine: '你们的活动区域和时间比较一致。',
          suggestedOpener: '周末下午如果方便，我们可以先在公共场所轻松跑一圈。',
          candidateExplanation: {
            source: 'fallback',
            degraded: true,
            retryable: true,
            degradationReason: 'model_unavailable',
            confidence: 0.43,
          },
          preferenceHistorySignals: [
            '我会优先参考你最近确认的可约时间变化：从「工作日晚上」调整为「周末下午」。',
          ],
          safetyBadges: ['位置已模糊', '公共场所优先'],
          recommendationConsent: {
            profileDiscoverable: true,
            agentCanRecommendMe: true,
            sourceLabel: '公开可发现且已允许 Agent 推荐',
            privacyLabel: '资料已脱敏，邀请前需要你确认',
          },
          discoverySafetySignals: [
            '公开可发现',
            '已开启 Agent 匹配',
            '资料已脱敏，邀请前需要你确认',
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
              detail: '仅展示公开可发现且已授权推荐的资料',
            },
            {
              key: 'privacy',
              label: '隐私处理',
              detail: '资料已脱敏，邀请前需要你确认',
            },
            {
              key: 'approval',
              label: '触达边界',
              detail: '发送邀请、加好友或创建活动前必须由你确认',
            },
          ],
          coldStartSignals: ['同城：青岛', '共同兴趣：跑步', '低压力运动社交'],
          whyNow: '现在更适合从低压力跑步开始，不需要一下子进入强社交。',
          openerStrategy: '开场先轻一点，先确认时间和强度。',
          invitePolicy: '发送邀请前需要你确认',
          recommendedNextAction: '先生成开场白，确认后再发送。',
          traceId: 'hidden-trace',
        },
        actions: [
          {
            id: 'connect-legacy',
            label: '加好友',
            action: 'connect_candidate',
            requiresConfirmation: false,
            payload: { taskId: 101, candidateId: 501, targetUserId: 22 },
          },
          {
            id: 'a1',
            label: '生成开场白',
            action: 'generate_opener',
            schemaAction: 'candidate.generate_opener',
            requiresConfirmation: false,
            payload: { taskId: 101 },
          },
        ],
      },
      {
        id: 'candidate-2',
        type: 'candidate_card',
        title: '阿哲',
        body: '推荐候选人',
        status: 'ready',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'social_match.candidate',
        data: {
          taskId: 101,
          schemaName: 'OpportunityCard',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'social_match.candidate',
          opportunityCard: true,
          opportunity: {
            type: 'person',
            title: '和阿哲先从公开路线开始',
            subtitle: '青岛 · 慢跑 · 周末下午',
            relationshipGoal: '先从公开路线认识新朋友',
            idealType: '愿意公共场所、轻松慢跑',
            confirmedContext: ['青岛', '周末下午', '轻松跑步', '公共场所'],
          },
          avatarUrl: '/avatars/azhe.png',
          displayName: '阿哲',
          matchScore: 82,
          distanceKm: 3.1,
          sharedInterests: ['慢跑', '户外'],
          fitReasons: ['都接受先站内聊', '活动区域接近'],
          explanationSteps: ['来源：公共场所边界', '匹配：距离和时间接近', '安全：先站内沟通'],
          recommendationLine: '他更适合低压力开场，不需要立刻交换联系方式。',
          suggestedOpener: '周末下午如果你也方便，可以先在公开路线轻松慢跑。',
          safetyBadges: ['先站内聊', '不交换精确位置'],
          recommendationConsent: {
            profileDiscoverable: true,
            agentCanRecommendMe: true,
            sourceLabel: '公开可发现且已允许 Agent 推荐',
            privacyLabel: '资料已脱敏，邀请前需要你确认',
          },
          discoverySafetySignals: [
            '公开可发现',
            '已开启 Agent 匹配',
            '资料已脱敏，邀请前需要你确认',
            '无拉黑/投诉风险信号',
          ],
          coldStartSignals: ['同城：青岛', '共同兴趣：慢跑', '公共场所边界清楚'],
          invitePolicy: '先查看详情，不自动邀请',
          recommendedNextAction: '先查看详情，再决定是否生成开场白。',
        },
        actions: [
          {
            id: 'candidate-2-detail',
            label: '查看详情',
            action: 'candidate.view_detail',
            schemaAction: 'candidate.view_detail',
            requiresConfirmation: false,
            payload: { taskId: 101, candidateId: 502, targetUserId: 23 },
          },
          {
            id: 'candidate-2-opener',
            label: '生成开场白',
            action: 'candidate.generate_opener',
            schemaAction: 'candidate.generate_opener',
            requiresConfirmation: false,
            payload: { taskId: 101, candidateId: 502, targetUserId: 23 },
          },
        ],
      },
      {
        id: 'activity-1',
        type: 'activity_plan',
        title: '周末海边轻松跑',
        body: '适合先从公开活动认识新朋友。',
        status: 'ready',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'social_match.activity',
        data: {
          taskId: 101,
          schemaName: 'OpportunityCard',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'social_match.activity',
          opportunityCard: true,
          activityTitle: '周末海边轻松跑',
          subtitle: '青岛 · 五四广场 · 周六下午',
          coverUrl: '/activities/sea-run.png',
          city: '青岛',
          locationName: '五四广场',
          timeLabel: '周六 16:00',
          confirmedContext: ['青岛', '周六 16:00', '轻松跑', '公共活动'],
          joinedCount: 3,
          maxParticipants: 8,
          intensity: '轻松跑',
          tags: ['跑步', '公开活动'],
          safetyBadges: ['公共场所', '人数上限'],
          safetyBoundary: '公共场所见面，不共享精确位置。',
          activityProtocol: [
            {
              key: 'public_place',
              label: '公共场所',
              detail: '优先选择五四广场这类公共场所，避免第一次见面进入私密空间。',
            },
            {
              key: 'approval',
              label: '创建确认',
              detail: '创建约练前必须由你确认时间、地点和参与边界。',
            },
            {
              key: 'publish',
              label: '公开边界',
              detail: '默认不公开发布；如果需要公开发起，我会单独征得你确认。',
            },
            {
              key: 'recovery',
              label: '连续推进',
              detail: '确认后进入“等待回复/确认到达/评价回写”的约练闭环。',
            },
          ],
          publishPolicy: '默认不公开发布；如果需要公开发起，我会单独征得你确认。',
          approvalPolicy: '创建约练前必须由你确认时间、地点和参与边界。',
          meetLoopNextStep: '确认后进入“等待回复/确认到达/评价回写”的约练闭环。',
          checkinReminder: '活动开始前我会提醒你确认是否到达。',
          reviewPrompt: '活动结束后我会请你做一次简短评价，再决定是否写入画像。',
          lifeGraphUpdatePreview: '完成后会把这次活动结果用于更新你的长期偏好。',
          trustScoreUpdatePreview: '完成与评价会写入 trust score，用来提升后续推荐可信度。',
          fitReasons: ['和你的时间偏好一致', '可以先参加活动再决定是否加好友'],
          explanationSteps: [
            '来源：来自公开活动，已通过公开可发现筛选',
            '匹配：周六下午和轻松跑更接近你的需求',
            '安全：公共场所见面，不共享精确位置。',
            '确认：报名、邀请或公开发起前都需要你确认',
          ],
          recommendationLine: '这个活动比直接连接陌生人更低压力。',
          recommendedNextAction: '先查看活动详情，确认后再报名或邀请朋友。',
        },
        actions: [
          {
            id: 'activity-view',
            label: '查看活动详情',
            action: 'view_activity',
            schemaAction: 'activity.view_detail',
            requiresConfirmation: false,
            payload: { activityId: 202 },
          },
          {
            id: 'activity-modify-time',
            label: '修改卡片',
            action: 'reschedule_meet_loop',
            schemaAction: 'activity.modify_time',
            requiresConfirmation: false,
            payload: { taskId: 101, activityId: 202, proposedTime: '周六 16:00' },
          },
          {
            id: 'activity-modify-location',
            label: '修改卡片',
            action: 'reschedule_meet_loop',
            schemaAction: 'activity.modify_location',
            requiresConfirmation: false,
            payload: { taskId: 101, activityId: 202, proposedLocation: '五四广场' },
          },
          {
            id: 'activity-confirm-create',
            label: '确认后发布',
            action: 'create_activity',
            schemaAction: 'activity.confirm_create',
            requiresConfirmation: true,
            payload: { taskId: 101, activityId: 202 },
          },
        ],
      },
      {
        id: 'life-graph-1',
        type: 'profile_proposal',
        title: 'Life Graph 更新',
        body: '画像更新建议',
        status: 'waiting_confirmation',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'life_graph.diff',
        data: {
          taskId: 101,
          proposalId: 77,
          fieldIds: ['lifestyle:availableTimes:1', 'training:intensity:1'],
          schemaName: 'LifeGraphDiffCard',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'life_graph.diff',
          before: '周末偏好不明确',
          after: '更适合周末下午的轻松跑活动',
          proposedFields: ['时间偏好', '运动强度'],
          conflicts: ['之前记录过工作日晚间也可运动'],
          sensitivityLevel: '中',
          sourceSignals: ['本轮对话提到周末下午', '明确选择轻松跑'],
          confirmationBoundary: '只更新运动偏好，不写入具体位置。',
        },
        actions: [],
      },
      {
        id: 'meet-loop-1',
        type: 'review_card',
        title: '邀约进展',
        body: '我会按可继续节点推进。',
        status: 'ready',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'meet_loop.timeline',
        data: {
          taskId: 101,
          schemaName: 'MeetLoopTimelineCard',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'meet_loop.timeline',
          timeline: {
            title: '跑步邀约进展',
            description: '每一步都可以从保存的上下文继续。',
            nextAction: '确认后发送邀请，不会自动触达对方。',
            steps: [
              {
                key: 'draft',
                label: '发起',
                state: 'done',
                description: '已整理邀请草稿、时间和公共场所边界。',
                actionLabel: '草稿已保存',
                checkpointReady: true,
                resumeMode: 'resume',
              },
              {
                key: 'sent',
                label: '等待回复',
                state: 'current',
                description: '确认后发送，不重复打扰。',
                actionLabel: '确认后发送',
                checkpointReady: true,
                resumeMode: 'resume',
              },
              {
                key: 'reschedule',
                label: '改期',
                state: 'next',
                description: '如果时间不合适，会先征得你同意再调整。',
                actionLabel: '可改期',
                resumeMode: 'reschedule',
              },
            ],
          },
        },
        actions: [
          {
            id: 'meet-loop-resume',
            label: '继续推进',
            action: 'resume_meet_loop',
            schemaAction: 'meet_loop.resume',
            requiresConfirmation: true,
            payload: { taskId: 101, meetLoopId: 7 },
          },
        ],
      },
    ],
  };
}

function mockThreeCandidateResponse(): UserFacingAgentResponse {
  const base = mockCandidateResponse();
  const candidateCards = base.cards.filter((card) => card.type === 'candidate_card');
  const thirdCandidate: UserFacingAgentResponse['cards'][number] = {
    id: 'candidate-3',
    type: 'candidate_card',
    title: '小周',
    body: '推荐候选人',
    status: 'ready',
    schemaVersion: 'fitmeet.tool-ui.v1',
    schemaType: 'social_match.candidate',
    data: {
      taskId: 101,
      schemaName: 'OpportunityCard',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.candidate',
      opportunityCard: true,
      opportunity: {
        type: 'person',
        title: '和小周先从周末慢跑开始',
        subtitle: '青岛 · 慢跑 · 周末下午',
        relationshipGoal: '先认识运动节奏相近的新朋友',
        idealType: '同城、轻松慢跑、边界清楚',
        rankingBreakdown: [
          {
            key: 'location',
            label: '城市/距离',
            score: 12,
            reason: '区域在青岛附近，适合先低压力了解。',
          },
          {
            key: 'interest',
            label: '共同兴趣',
            score: 15,
            reason: '共同兴趣包含慢跑、公园路线。',
          },
        ],
        confirmedContext: ['青岛', '周末下午', '轻松跑步', '先站内沟通'],
      },
      avatarUrl: '/avatars/xiaozhou.png',
      displayName: '小周',
      matchScore: 79,
      distanceKm: 4.2,
      sharedInterests: ['慢跑', '公园路线'],
      fitReasons: ['都接受陌生人冷启动', '都偏好低压力运动社交'],
      explanationSteps: ['来源：公开可发现资料', '匹配：兴趣和时间接近', '安全：邀请前确认'],
      recommendationLine: '他适合先用轻量开场白确认节奏，不急着线下见面。',
      suggestedOpener: '周末下午如果你也想轻松慢跑，我们可以先站内聊聊路线和节奏。',
      safetyBadges: ['公开可发现', '邀请前确认'],
      recommendationConsent: {
        profileDiscoverable: true,
        agentCanRecommendMe: true,
        sourceLabel: '公开可发现且已允许 Agent 推荐',
        privacyLabel: '资料已脱敏，邀请前需要你确认',
      },
      discoverySafetySignals: [
        '公开可发现',
        '已开启 Agent 匹配',
        '资料已脱敏，邀请前需要你确认',
        '无拉黑/投诉风险信号',
      ],
      recommendationProtocol: [
        {
          key: 'discoverability',
          label: '可发现来源',
          detail: '公开可发现且已允许 Agent 推荐',
        },
        {
          key: 'approval',
          label: '触达边界',
          detail: '发送邀请、加好友或创建活动前必须由你确认',
        },
      ],
      coldStartSignals: ['同城：青岛', '共同兴趣：慢跑', '边界：先站内沟通'],
      invitePolicy: '发送邀请前需要你确认',
      recommendedNextAction: '先查看详情，再生成开场白。',
    },
    actions: [
      {
        id: 'candidate-3-detail',
        label: '查看详情',
        action: 'candidate.view_detail',
        schemaAction: 'candidate.view_detail',
        requiresConfirmation: false,
        payload: { taskId: 101, candidateId: 503, targetUserId: 24 },
      },
      {
        id: 'candidate-3-opener',
        label: '生成开场白',
        action: 'candidate.generate_opener',
        schemaAction: 'candidate.generate_opener',
        requiresConfirmation: false,
        payload: { taskId: 101, candidateId: 503, targetUserId: 24 },
      },
      {
        id: 'candidate-3-connect',
        label: '确认后发邀请',
        action: 'candidate.connect',
        schemaAction: 'candidate.connect',
        requiresConfirmation: true,
        payload: {
          taskId: 101,
          candidateId: 503,
          targetUserId: 24,
          approvalRequired: true,
          checkpointRequired: true,
          resumeMode: 'resume_after_approval',
        },
      },
    ],
  };

  return {
    ...base,
    cards: [...candidateCards, thirdCandidate],
  };
}
