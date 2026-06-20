import { afterEach, describe, expect, it } from 'vitest';

import type { SocialCodexReplayPackage, UserFacingAgentResponse } from '../api/socialAgentApi';
import {
  readStoredAgentThread,
  buildBranchSnapshot,
  continuesOpportunityClarification,
  decorateAssistantBranches,
  isBranchableAssistantMessage,
  isGenericCheckpointResponse,
  isNonAnswerFallbackResponse,
  mergeProgressStep,
  messagesFromSessionSnapshot,
  recoveryFromUserFacingResponse,
  intentForPrompt,
  resolveIntentFromStreamEvent,
  sanitizeStoredThreadMessage,
  shouldAttachVisibleProcessToMessage,
  shouldFetchCheckpointRecovery,
  shouldRestoreReplayTrace,
  threadIdFromResponse,
} from '../components/agent-workspace/agentWorkspaceRuntime';
import {
  applyLocalCoveringStatus,
  createInitialCoveringStatus,
  removeLocalCoveringStatusSteps,
  streamEventReplacesLocalCoveringStatus,
} from '../components/agent-workspace/useAgentSubmitRuntime';
import type { AgentStreamEvent } from '../components/agent-workspace/api';
import type { AgentThreadMessage, Step } from '../components/agent-workspace/socialAgentThreadStore';

describe('agent workspace runtime fallback boundaries', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('normalizes stored task-only sessions to the Social Codex thread id shape', () => {
    window.localStorage.setItem(
      'fitmeet-agent-thread:current',
      JSON.stringify({
        activeTaskId: 77,
        messages: [userMessage('user-1', '继续青岛大学散步任务')],
        userResult: null,
        mode: 'limited_auto',
        branchSelections: {},
        savedAt: Date.now(),
      }),
    );

    expect(readStoredAgentThread()?.activeThreadId).toBe('agent-task:77');
  });

  it('normalizes numeric response thread ids before reusing a run thread', () => {
    const response: UserFacingAgentResponse = {
      assistantMessage: '我会继续沿用同一个约练任务。',
      lightStatus: '已整理回复',
      permissionMode: 'limited_auto',
      safeStatus: {
        blocked: false,
        level: 'low',
        boundaryNotes: [],
        requiredConfirmations: [],
      },
      pendingConfirmations: [],
      cards: [
        {
          id: 'card-1',
          type: 'candidate_card',
          title: '约练任务',
          body: '继续处理',
          data: {
            taskId: 91,
            threadId: '91',
          },
          actions: [],
        },
      ],
      runtime: {
        threadId: '91',
      },
    };

    expect(threadIdFromResponse(response)).toBe('agent-task:91');
  });

  it('does not let fallback assistant messages become branch variants', () => {
    const messages: AgentThreadMessage[] = [
      userMessage('user-1', '今晚青岛大学附近散步'),
      assistantMessage('assistant-1', '我先按今晚青岛大学附近散步来理解。', 'llm'),
      assistantMessage('assistant-2', '我已经保留当前方向，等连接恢复后可以继续。', 'fallback'),
    ];

    expect(isBranchableAssistantMessage(messages[1])).toBe(true);
    expect(isBranchableAssistantMessage(messages[2])).toBe(false);
    expect(decorateAssistantBranches(messages, {})).not.toContainEqual(
      expect.objectContaining({
        id: 'assistant-2',
        branch: expect.any(Object),
      }),
    );
    expect(buildBranchSnapshot(messages, {})).toBeNull();
  });

  it('drops stale branch selections when only recovery or fallback assistant messages remain', () => {
    const messages: AgentThreadMessage[] = [
      userMessage('user-1', '为什么没有继续？'),
      {
        id: 'assistant-recovery',
        role: 'assistant',
        content: '我已经保留当前对话。你可以稍后再试一次。',
        status: 'done',
        assistantMessageSource: 'fallback',
        surfaceKind: 'recovery',
        branchable: false,
      },
    ];

    expect(buildBranchSnapshot(messages, { 'branch-user-1': 2 })).toBeNull();
    expect(decorateAssistantBranches(messages, { 'branch-user-1': 2 })).toEqual(messages);
  });

  it('restores fallback-sourced session messages as non-branchable assistant messages', () => {
    const messages = messagesFromSessionSnapshot(
      {
        hasSession: true,
        activeTaskId: 42,
        task: { id: 42, status: 'active' },
        messages: [
          { id: 'user-1', role: 'user', content: '帮我找今晚散步搭子' },
          {
            id: 'assistant-fallback',
            role: 'assistant',
            content: '我会先按今晚青岛大学附近散步来整理。',
            assistantMessageSource: 'fallback',
          },
        ],
      },
      null,
      42,
    );

    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      id: 'assistant-fallback',
      role: 'assistant',
      assistantMessageSource: 'fallback',
      branchable: false,
    });
    expect(isBranchableAssistantMessage(messages[1])).toBe(false);
  });

  it('filters generic recovery text from restored session history', () => {
    const messages = messagesFromSessionSnapshot(
      {
        hasSession: true,
        activeTaskId: 42,
        task: { id: 42, status: 'active' },
        messages: [
          { id: 'user-1', role: 'user', content: '为什么没有继续？' },
          {
            id: 'assistant-recovery',
            role: 'assistant',
            content: '我已经保留当前对话。你可以稍后再试一次。',
            assistantMessageSource: 'fallback',
          },
        ],
      },
      null,
      42,
    );

    expect(messages.map((message) => message.id)).toEqual(['user-1']);
  });

  it('filters saved-checkpoint recovery copy with original goal from restored session history', () => {
    const messages = messagesFromSessionSnapshot(
      {
        hasSession: true,
        activeTaskId: 42,
        task: { id: 42, status: 'active' },
        messages: [
          { id: 'user-1', role: 'user', content: '你有什么功能' },
          {
            id: 'assistant-checkpoint-recovery',
            role: 'assistant',
            content: '从已保存的步骤继续：正在等待你确认。原始目标：你有什么功能',
            assistantMessageSource: 'fallback',
          },
        ],
      },
      null,
      42,
    );

    expect(messages.map((message) => message.id)).toEqual(['user-1']);
  });

  it('does not persist generic recovery as a useful stored assistant answer', () => {
    const restored = sanitizeStoredThreadMessage({
      id: 'assistant-recovery',
      role: 'assistant',
      content: '连接中断了。我已经保留当前对话。',
      status: 'done',
      assistantMessageSource: 'fallback',
    });

    expect(restored).toBeNull();
  });

  it('treats sanitized empty fallback responses as recovery notices instead of answers', () => {
    expect(
      isNonAnswerFallbackResponse({
        assistantMessage: '',
        assistantMessageSource: 'fallback',
        lightStatus: '已整理回复',
        cards: [],
        pendingConfirmations: [],
        safeStatus: {
          blocked: false,
          level: 'low',
          boundaryNotes: [],
          requiredConfirmations: [],
        },
        permissionMode: 'confirm',
      }),
    ).toBe(true);
  });

  it('prefers structured recoveryNotice over fallback copy detection', () => {
    const response: UserFacingAgentResponse = {
      assistantMessage: '',
      assistantMessageSource: 'fallback',
      recoveryNotice: {
        kind: 'timeout',
        title: '这次处理时间有点久',
        message: '我已经保留当前对话。你可以重试，或者继续告诉我下一步。',
        retryable: true,
        source: 'stream_error',
      },
      lightStatus: '已整理回复',
      cards: [],
      pendingConfirmations: [],
      safeStatus: {
        blocked: false,
        level: 'low',
        boundaryNotes: [],
        requiredConfirmations: [],
      },
      permissionMode: 'confirm',
    };

    expect(isNonAnswerFallbackResponse(response)).toBe(true);
    expect(recoveryFromUserFacingResponse(response, '继续找人')).toMatchObject({
      kind: 'failed',
      title: '这次处理时间有点久',
      message: '我已经保留当前对话。你可以重试，或者继续告诉我下一步。',
      prompt: '继续找人',
      retryable: true,
    });
  });

  it('treats connection-recovery fallback copy as a recovery notice instead of an answer', () => {
    expect(
      isNonAnswerFallbackResponse({
        assistantMessage: '我已经保留当前方向，等连接恢复后可以继续。',
        assistantMessageSource: 'fallback',
        lightStatus: '已整理回复',
        cards: [],
        pendingConfirmations: [],
        safeStatus: {
          blocked: false,
          level: 'low',
          boundaryNotes: [],
          requiredConfirmations: [],
        },
        permissionMode: 'confirm',
      }),
    ).toBe(true);
  });

  it('treats checkpoint recovery copy as a recovery notice instead of an answer', () => {
    expect(
      isNonAnswerFallbackResponse({
        assistantMessage: '从已保存的步骤继续：正在等待你确认。原始目标：你有什么功能',
        assistantMessageSource: 'fallback',
        lightStatus: '已整理回复',
        cards: [],
        pendingConfirmations: [],
        safeStatus: {
          blocked: false,
          level: 'low',
          boundaryNotes: [],
          requiredConfirmations: [],
        },
        permissionMode: 'confirm',
      }),
    ).toBe(true);
  });

  it('treats ordinary help checkpoint copy as generic unless useful social surface exists', () => {
    expect(
      isGenericCheckpointResponse({
        assistantMessage:
          '从已保存的步骤继续：正在等待你确认。原始目标：为什么我的记忆没了，怎么使用这个 Agent',
        assistantMessageSource: 'fallback',
        lightStatus: '已整理回复',
        cards: [],
        pendingConfirmations: [],
        safeStatus: {
          blocked: false,
          level: 'low',
          boundaryNotes: [],
          requiredConfirmations: [],
        },
        permissionMode: 'confirm',
      }),
    ).toBe(true);

    expect(
      isGenericCheckpointResponse({
        assistantMessage:
          '从已保存的步骤继续：正在等待你确认。原始目标：为什么我的记忆没了，怎么使用这个 Agent',
        assistantMessageSource: 'fallback',
        lightStatus: '已整理回复',
        cards: [
          {
            id: 'candidate-card-1',
            type: 'candidate_card',
            title: '合适候选',
            data: {},
            actions: [],
          },
        ],
        pendingConfirmations: [],
        safeStatus: {
          blocked: false,
          level: 'low',
          boundaryNotes: [],
          requiredConfirmations: [],
        },
        permissionMode: 'confirm',
      }),
    ).toBe(false);
  });

  it('does not fetch checkpoint recovery for generic restored confirmation tasks', () => {
    const genericResponse: UserFacingAgentResponse = {
      assistantMessage: '从已保存的步骤继续：正在等待你确认。原始目标：你有什么功能',
      assistantMessageSource: 'fallback',
      lightStatus: '已整理回复',
      cards: [],
      pendingConfirmations: [],
      safeStatus: {
        blocked: false,
        level: 'low',
        boundaryNotes: [],
        requiredConfirmations: [],
      },
      permissionMode: 'confirm',
    };

    expect(shouldFetchCheckpointRecovery(genericResponse, 'awaiting_confirmation', false)).toBe(
      false,
    );
  });

  it('still fetches checkpoint recovery for real pending approvals', () => {
    const approvalResponse: UserFacingAgentResponse = {
      assistantMessage: '发送邀请前需要你确认。',
      lightStatus: '正在等待你确认',
      cards: [],
      pendingConfirmations: [
        {
          id: 88,
          type: 'approval',
          actionType: 'send_invite',
          summary: '确认后才会发送邀请。',
          riskLevel: 'medium',
          expiresAt: null,
        },
      ],
      safeStatus: {
        blocked: false,
        level: 'medium',
        boundaryNotes: [],
        requiredConfirmations: ['发送邀请'],
      },
      permissionMode: 'confirm',
    };

    expect(shouldFetchCheckpointRecovery(approvalResponse, 'awaiting_confirmation', false)).toBe(
      true,
    );
  });

  it('keeps non-social lookup, help, and advice prompts out of the social run path', () => {
    expect(intentForPrompt('帮我找一下设置入口在哪里')).toBe('conversation');
    expect(intentForPrompt('我想找回之前的聊天记录')).toBe('conversation');
    expect(intentForPrompt('给我找一下隐私政策说明')).toBe('conversation');
    expect(intentForPrompt('我想找客服问问账号问题')).toBe('conversation');
    expect(intentForPrompt('FitMeet 支持找人功能吗？')).toBe('conversation');
    expect(intentForPrompt('帮我分析一下我的理想型，先不要搜索候选人')).toBe(
      'conversation',
    );
  });

  it('still treats explicit opportunity discovery as social execution', () => {
    expect(intentForPrompt('今天晚上青岛大学附近散步，帮我找人')).toBe(
      'social',
    );
    expect(intentForPrompt('推荐几个公开可发现的篮球搭子')).toBe('social');
  });

  it('continues opportunity clarification only for slot answers or explicit social execution', () => {
    expect(continuesOpportunityClarification('今天晚上，青岛大学，散步')).toBe(
      true,
    );
    expect(continuesOpportunityClarification('女生，最好是舞蹈生')).toBe(true);
    expect(continuesOpportunityClarification('可以，帮我找人')).toBe(true);
    expect(continuesOpportunityClarification('可以，帮我看看')).toBe(true);
    expect(continuesOpportunityClarification('那就看看')).toBe(true);
    expect(continuesOpportunityClarification('为什么你没懂我的意思')).toBe(
      false,
    );
    expect(continuesOpportunityClarification('帮我找一下设置入口')).toBe(false);
    expect(continuesOpportunityClarification('我想找回之前的聊天记录')).toBe(
      false,
    );
  });

  it('lets replay.summary replace old process nodes instead of accumulating a timeline', () => {
    const previousSteps: Step[] = [
      {
        id: 'social-codex:context',
        label: '正在读取你的偏好',
        status: 'success',
        kind: 'status',
        processType: 'visible_process',
      },
      {
        id: 'social-codex:slots',
        label: '已记录约练信息',
        status: 'success',
        kind: 'status',
        processType: 'slot_memory',
      },
      {
        id: 'social-codex:candidates',
        label: '正在筛选公开可发现的人',
        status: 'running',
        kind: 'status',
        processType: 'candidate_search',
      },
    ];

    const next = mergeProgressStep(
      previousSteps,
      {
        type: 'progress',
        id: 'social-codex:summary',
        kind: 'status',
        title: '正在整理合适机会',
        detail: '我会优先使用已补充的时间、地点和活动。',
        state: 'running',
        metadata: {
          processType: 'run_summary',
          source: 'replay.summary',
          currentStage: 'rank_candidates',
        },
      },
      'social',
    );

    expect(next).toEqual([
      expect.objectContaining({
        id: 'social-codex:summary',
        label: '正在整理合适机会',
        status: 'running',
        processType: 'run_summary',
      }),
    ]);
  });

  it('keeps consecutive SocialAgentEventV2 summaries as one covering status step', () => {
    const afterContext = mergeProgressStep(
      [],
      {
        type: 'progress',
        id: 'social-codex:summary',
        kind: 'status',
        title: '正在读取你的偏好',
        detail: '我会结合最近对话和当前约练任务。',
        state: 'running',
        metadata: {
          processType: 'run_summary',
          source: 'social_agent_event_v2',
          sourceProtocol: 'social_agent_event_v2',
          originalProcessType: 'visible_process',
          displayMode: 'covering_status',
          updateModel: 'latest_state',
          defaultVisibleCount: 1,
          historyVisibility: 'collapsed',
          currentStage: 'hydrate_context',
          eventId: 'run-1:1',
          seq: 1,
        },
      },
      'social',
    );

    const afterSlots = mergeProgressStep(
      afterContext,
      {
        type: 'progress',
        id: 'social-codex:summary',
        kind: 'status',
        title: '已记录你的关键信息',
        detail: '今天晚上、散步、青岛大学附近',
        state: 'done',
        metadata: {
          processType: 'run_summary',
          source: 'social_agent_event_v2',
          sourceProtocol: 'social_agent_event_v2',
          originalProcessType: 'slot_memory',
          displayMode: 'covering_status',
          updateModel: 'latest_state',
          defaultVisibleCount: 1,
          historyVisibility: 'collapsed',
          currentStage: 'slot_filling',
          eventId: 'run-1:2',
          seq: 2,
        },
      },
      'social',
    );

    const afterCandidates = mergeProgressStep(
      afterSlots,
      {
        type: 'progress',
        id: 'social-codex:summary',
        kind: 'status',
        title: '正在筛选公开可发现的人',
        detail: '会优先使用你已经补充的时间、地点和偏好。',
        state: 'running',
        metadata: {
          processType: 'run_summary',
          source: 'social_agent_event_v2',
          sourceProtocol: 'social_agent_event_v2',
          originalProcessType: 'candidate_search',
          displayMode: 'covering_status',
          updateModel: 'latest_state',
          defaultVisibleCount: 1,
          historyVisibility: 'collapsed',
          currentStage: 'search_candidates',
          eventId: 'run-1:3',
          seq: 3,
        },
      },
      'social',
    );

    expect(afterContext).toHaveLength(1);
    expect(afterSlots).toHaveLength(1);
    expect(afterCandidates).toEqual([
      expect.objectContaining({
        id: 'social-codex:summary',
        label: '正在筛选公开可发现的人',
        detail: '会优先使用你已经补充的时间、地点和偏好。',
        status: 'running',
        processType: 'run_summary',
        metadata: expect.objectContaining({
          originalProcessType: 'candidate_search',
          currentStage: 'search_candidates',
          eventId: 'run-1:3',
          seq: 3,
        }),
      }),
    ]);
  });

  it('does not restore a generic replay summary for ordinary conversations', () => {
    expect(
      shouldRestoreReplayTrace(
        replayPackage({
          summary: {
            title: 'hydrate_context',
            detail: '正在读取上下文',
            state: 'running',
            currentStage: 'hydrate_context',
            currentEventId: null,
            currentSeq: null,
            pendingApproval: false,
            candidateCount: null,
            activityCount: null,
            hasOpportunityCard: false,
            savedMemory: false,
            visibleStepCount: 1,
            expandable: false,
          },
        }),
        'conversation',
      ),
    ).toBe(false);
  });

  it('restores replay trace when an approval is pending', () => {
    expect(
      shouldRestoreReplayTrace(
        replayPackage({
          pendingApproval: true,
          summary: {
            title: '需要你确认这一步',
            detail: '确认前不会发送邀请。',
            state: 'waiting',
            currentStage: 'approval',
            currentEventId: 'event-approval',
            currentSeq: 7,
            pendingApproval: true,
            candidateCount: null,
            activityCount: null,
            hasOpportunityCard: false,
            savedMemory: false,
            visibleStepCount: 1,
            expandable: true,
          },
        }),
        'conversation',
      ),
    ).toBe(true);
  });

  it('restores replay trace for saved slot progress even when the current intent is conversation', () => {
    expect(
      shouldRestoreReplayTrace(
        replayPackage({
          events: [replayEvent('slot.completed', { stage: 'slot_filling' })],
        }),
        'conversation',
      ),
    ).toBe(true);
  });

  it('keeps an approval node when a run summary arrives', () => {
    const previousSteps: Step[] = [
      {
        id: 'approval',
        label: '发送邀请前需要你确认',
        status: 'waiting',
        kind: 'status',
        processType: 'approval',
      },
      {
        id: 'social-codex:candidates',
        label: '正在筛选公开可发现的人',
        status: 'running',
        kind: 'status',
        processType: 'candidate_search',
      },
    ];

    const next = mergeProgressStep(
      previousSteps,
      {
        type: 'progress',
        id: 'social-codex:summary',
        kind: 'status',
        title: '发送邀请前需要你确认',
        state: 'waiting',
        metadata: {
          processType: 'run_summary',
          source: 'replay.summary',
          pendingApproval: true,
        },
      },
      'approval',
    );

    expect(next).toHaveLength(2);
    expect(next[0]).toMatchObject({
      id: 'approval',
      status: 'waiting',
      processType: 'approval',
    });
    expect(next[1]).toMatchObject({
      id: 'social-codex:summary',
      status: 'waiting',
      processType: 'run_summary',
    });
  });

  it('keeps pending approval as the covering status when run.completed arrives later', () => {
    const waiting = mergeProgressStep(
      [
        {
          id: 'approval',
          label: '发送邀请前需要你确认',
          detail: '确认前不会发送邀请。',
          status: 'waiting',
          kind: 'status',
          processType: 'approval',
        },
      ],
      {
        type: 'progress',
        id: 'social-codex:summary',
        kind: 'status',
        title: '这一步处理完成',
        detail: '已保存到当前任务。',
        state: 'done',
        metadata: {
          processType: 'run_summary',
          source: 'social_agent_event_v2',
          sourceProtocol: 'social_agent_event_v2',
          originalProcessType: 'run',
          displayMode: 'covering_status',
          updateModel: 'latest_state',
          defaultVisibleCount: 1,
          historyVisibility: 'collapsed',
          currentStage: 'approval',
          eventId: 'run-1:4',
          seq: 4,
        },
      },
      'approval',
    );

    expect(waiting).toEqual([
      expect.objectContaining({
        id: 'approval',
        status: 'waiting',
        processType: 'approval',
      }),
      expect.objectContaining({
        id: 'social-codex:summary',
        label: '发送邀请前需要你确认',
        status: 'waiting',
        processType: 'run_summary',
        detail: '确认前不会发送邀请。',
        metadata: expect.objectContaining({
          pendingApproval: true,
          preservedApproval: true,
        }),
      }),
    ]);
  });

  it('starts a submitted run with one GPT-style covering status instead of a preset timeline', () => {
    const social = createInitialCoveringStatus('social');
    const conversation = createInitialCoveringStatus('conversation');

    expect(social).toHaveLength(1);
    expect(social[0]).toMatchObject({
      id: 'local-covering-status',
      label: '正在整理你的约练需求…',
      status: 'running',
      processType: 'run_summary',
      metadata: {
        source: 'local.covering_status',
        displayMode: 'covering_status',
        updateModel: 'latest_state',
        defaultVisibleCount: 1,
        historyVisibility: 'collapsed',
      },
    });
    expect(social.map((step) => step.id)).not.toEqual(
      expect.arrayContaining(['understand', 'profile', 'search', 'rank']),
    );

    expect(conversation).toHaveLength(1);
    expect(conversation[0]).toMatchObject({
      id: 'local-covering-status',
      label: '正在思考…',
      detail: '我会直接回复，不触发社交工具。',
      processType: 'run_summary',
    });
  });

  it('uses one replaceable local covering status while a live stream is silent', () => {
    const initialSteps: Step[] = [
      { id: 'understand', label: '正在理解你的需求', status: 'running' },
      { id: 'profile', label: '正在结合上下文', status: 'pending' },
    ];

    const soft = applyLocalCoveringStatus(initialSteps, 'social', 'soft');
    expect(soft).toHaveLength(3);
    expect(soft.at(-1)).toMatchObject({
      id: 'local-covering-status',
      label: '正在整理你的约练需求…',
      detail: '我会按你已经说的信息继续处理。',
      status: 'running',
      processType: 'run_summary',
      metadata: {
        processType: 'run_summary',
        source: 'local.covering_status',
        localFallback: true,
        displayMode: 'covering_status',
        updateModel: 'latest_state',
        defaultVisibleCount: 1,
        historyVisibility: 'collapsed',
      },
    });

    const slow = applyLocalCoveringStatus(soft, 'social', 'slow');
    expect(slow.filter((step) => step.id === 'local-covering-status')).toHaveLength(1);
    expect(slow.at(-1)).toMatchObject({
      label: '还在整理你的约练需求…',
      detail: '可以继续等待，也可以随时停止后重试。',
      processType: 'run_summary',
    });

    expect(removeLocalCoveringStatusSteps(slow)).toEqual(initialSteps);
  });

  it('drops the local covering status as soon as a real stream process event arrives', () => {
    const initialSteps: Step[] = [
      { id: 'understand', label: '正在理解你的需求', status: 'running' },
      { id: 'profile', label: '正在结合上下文', status: 'pending' },
    ];
    const withLocalStatus = applyLocalCoveringStatus(initialSteps, 'social', 'soft');

    const next = mergeProgressStep(
      withLocalStatus,
      {
        type: 'progress',
        id: 'social-codex:candidates',
        kind: 'status',
        title: '正在筛选公开可发现的人',
        detail: '会优先使用你已经补充的时间、地点和活动。',
        state: 'running',
        metadata: {
          processType: 'candidate_search',
          source: 'social_agent_event_v2',
        },
      },
      'social',
    );

    expect(next.some((step) => step.id === 'local-covering-status')).toBe(false);
    expect(next.some((step) => step.metadata?.source === 'local.covering_status')).toBe(false);
    expect(next.at(-1)).toMatchObject({
      id: 'social-codex:candidates',
      label: '正在筛选公开可发现的人',
      status: 'running',
      processType: 'candidate_search',
    });
  });

  it('keeps local covering status until a user-visible stream event can replace it', () => {
    expect(
      streamEventReplacesLocalCoveringStatus({
        type: 'lifecycle',
        lifecycle: 'analyzing_intent',
        message: 'received',
      }),
    ).toBe(false);
    expect(
      streamEventReplacesLocalCoveringStatus({
        type: 'assistant_done',
        source: 'llm',
      }),
    ).toBe(false);
    expect(
      streamEventReplacesLocalCoveringStatus({
        type: 'assistant_delta',
        delta: '',
        source: 'llm',
      }),
    ).toBe(false);
    expect(
      streamEventReplacesLocalCoveringStatus({
        type: 'assistant_delta',
        delta: 'fallback slice',
        source: 'fallback',
      }),
    ).toBe(false);
    expect(
      streamEventReplacesLocalCoveringStatus({
        type: 'run.started',
        eventId: 'run-1',
        seq: 1,
        createdAt: '2026-06-17T00:00:00.000Z',
        userId: '7',
        threadId: 'agent-thread-1',
        taskId: 42,
        runId: 'run-1',
        stage: 'detect_social_intent',
        visibility: 'user_visible',
      } as AgentStreamEvent),
    ).toBe(false);

    expect(
      streamEventReplacesLocalCoveringStatus({
        type: 'assistant_delta',
        delta: '我正在处理。',
        source: 'llm',
      }),
    ).toBe(true);
    expect(
      streamEventReplacesLocalCoveringStatus({
        type: 'progress',
        id: 'social-codex:summary',
        kind: 'status',
        title: '正在理解你的需求',
        state: 'running',
      }),
    ).toBe(true);
    expect(
      streamEventReplacesLocalCoveringStatus({
        type: 'visible_process.delta',
        eventId: 'run-2',
        seq: 2,
        createdAt: '2026-06-17T00:00:01.000Z',
        userId: '7',
        threadId: 'agent-thread-1',
        taskId: 42,
        runId: 'run-1',
        stage: 'slot_filling',
        visibility: 'user_visible',
        display: {
          title: '正在整理你的约练需求',
          state: 'running',
        },
      } as AgentStreamEvent),
    ).toBe(true);
  });

  it('keeps ordinary visible process updates out of the social action intent', () => {
    const ordinaryProcess = {
      type: 'progress' as const,
      id: 'social-codex:summary',
      kind: 'status' as const,
      title: '正在整理回复',
      state: 'running' as const,
      metadata: {
        processType: 'run_summary',
        originalProcessType: 'visible_process',
        surfaceIntent: 'conversation',
      },
    };
    const socialProcess = {
      ...ordinaryProcess,
      title: '正在筛选公开可发现的人',
      metadata: {
        ...ordinaryProcess.metadata,
        originalProcessType: 'candidate_search',
        surfaceIntent: 'social',
      },
    };

    expect(shouldAttachVisibleProcessToMessage(ordinaryProcess)).toBe(true);
    expect(resolveIntentFromStreamEvent(ordinaryProcess)).toBeNull();
    expect(shouldAttachVisibleProcessToMessage(socialProcess)).toBe(true);
    expect(resolveIntentFromStreamEvent(socialProcess)).toBe('social');
  });
});

function userMessage(id: string, content: string): AgentThreadMessage {
  return {
    id,
    role: 'user',
    content,
    status: 'done',
    result: null,
  };
}

function assistantMessage(
  id: string,
  content: string,
  source: UserFacingAgentResponse['assistantMessageSource'],
): AgentThreadMessage {
  return {
    id,
    role: 'assistant',
    content,
    status: 'done',
    taskId: 42,
    conversationIntent: 'conversation',
    surfaceKind: 'answer',
    assistantMessageSource: source,
    branchable: source !== 'fallback',
  };
}

function replayPackage(overrides: Partial<SocialCodexReplayPackage> = {}): SocialCodexReplayPackage {
  return {
    taskId: 42,
    threadId: 'agent-task:42',
    runId: 'run-1',
    eventCount: overrides.events?.length ?? 0,
    returnedCount: overrides.events?.length ?? 0,
    lastSeq: null,
    lastEventId: null,
    terminalType: null,
    pendingApproval: false,
    events: [],
    ...overrides,
  };
}

function replayEvent(
  type: SocialCodexReplayPackage['events'][number]['type'],
  overrides: Partial<SocialCodexReplayPackage['events'][number]> = {},
): SocialCodexReplayPackage['events'][number] {
  return {
    type,
    eventId: `${type}-1`,
    seq: 1,
    createdAt: new Date('2026-06-20T00:00:00.000Z').toISOString(),
    userId: 'user-1',
    threadId: 'agent-task:42',
    taskId: 42,
    runId: 'run-1',
    stage: 'detect_social_intent',
    visibility: 'user_visible',
    display: {
      title: '已记录你的关键信息',
      state: 'done',
    },
    payload: {},
    ...overrides,
  };
}
