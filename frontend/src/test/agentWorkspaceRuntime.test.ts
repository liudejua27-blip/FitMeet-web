import { afterEach, describe, expect, it } from 'vitest';

import type {
  FitMeetAlphaCard,
  SocialCodexReplayPackage,
  UserFacingAgentResponse,
} from '../api/socialAgentApi';
import {
  readStoredAgentThread,
  buildBranchSnapshot,
  assistantMessageForUserFacingResult,
  continuesOpportunityClarification,
  decorateAssistantBranches,
  isBranchableAssistantMessage,
  isGenericCheckpointResponse,
  isNonAnswerFallbackResponse,
  mergeProgressStep,
  messagesFromSessionSnapshot,
  recoveryFromUserFacingResponse,
  responseFromSessionSnapshot,
  responseHasCheckpointRuntime,
  responseAwaitsOpportunityClarification,
  intentForPrompt,
  resolveIntentFromStreamEvent,
  sanitizeStoredThreadMessage,
  shouldAttachVisibleProcessToMessage,
  shouldFetchCheckpointRecovery,
  shouldRestoreReplayTrace,
  findTaskId,
  threadIdFromResponse,
} from '../components/agent-workspace/agentWorkspaceRuntime';
import {
  applyLocalCoveringStatus,
  createInitialCoveringStatus,
  removeLocalCoveringStatusSteps,
  streamEventReplacesLocalCoveringStatus,
} from '../components/agent-workspace/useAgentSubmitRuntime';
import {
  findAssistantRunResultMergeIndex,
  dedupeUserFacingResponseCards,
  mergeAssistantFinalText,
} from '../components/agent-workspace/useAgentFinalResultRuntime';
import {
  mergeApprovalDispatchResponseIntoMessages,
  mergeUniqueApprovalDispatchCards,
  responseFromApprovalDispatchResult,
} from '../components/agent-workspace/useAgentApprovalDispatchMessages';
import {
  collapseRepeatedAssistantTextBlocks,
  mergeAssistantDeltaText,
} from '../components/agent-workspace/useAgentMessageStream';
import { reduceSingleRunAssistantMessages } from '../components/agent-workspace/agentAssistantMessageReducer';
import type { AgentStreamEvent } from '../components/agent-workspace/api';
import type {
  AgentThreadMessage,
  Step,
} from '../components/agent-workspace/socialAgentThreadStore';

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
    } satisfies UserFacingAgentResponse;

    expect(threadIdFromResponse(response)).toBe('agent-task:91');
  });

  it('recovers task and thread identity from top-level user-facing result fields without cards', () => {
    const response: UserFacingAgentResponse = {
      taskId: 117,
      assistantMessage: '我已经保留这张约练卡的上下文。',
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

    expect(findTaskId(response)).toBe(117);
    expect(threadIdFromResponse(response)).toBe('agent-task:117');
  });

  it('classifies explicit social matching prompts as social even with rich candidate preferences', () => {
    expect(intentForPrompt('我想在青岛大学附近，今天晚上，散步，找女生，最好喜欢编程')).toBe(
      'social',
    );
    expect(intentForPrompt('有没有女生')).toBe('social');
    expect(intentForPrompt('最好是舞蹈生')).toBe('social');
    expect(intentForPrompt('继续刚才青岛大学散步的约练任务')).toBe('social');
    expect(intentForPrompt('有没有找人功能')).toBe('conversation');
  });

  it('dedupes approval dispatch cards by stable approval id while keeping different candidate actions', () => {
    const sendCard = approvalDispatchCard({
      id: 'approval-88-meet-loop',
      approvalId: 88,
      actionType: 'send_invite',
    });
    const replayedSendCard = approvalDispatchCard({
      id: 'approval-88-meet-loop',
      approvalId: 88,
      actionType: 'send_invite',
    });
    const connectCard = approvalDispatchCard({
      id: 'approval-89-meet-loop',
      approvalId: 89,
      actionType: 'connect_candidate',
    });

    const merged = mergeUniqueApprovalDispatchCards([sendCard], [replayedSendCard, connectCard]);

    expect(merged).toHaveLength(2);
    expect(merged.map((card) => card.data.actionType)).toEqual([
      'send_invite',
      'connect_candidate',
    ]);
  });

  it('merges inline approval dispatch results back into the originating message card', () => {
    const candidateCard = {
      id: 'candidate-card-501',
      type: 'candidate_card',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.candidate',
      title: '陈砚',
      body: '公开资料匹配青岛大学散步。',
      data: {
        taskId: 101,
        candidateRecordId: 501,
        targetUserId: 22,
      },
      actions: [],
    } satisfies FitMeetAlphaCard;
    const dispatchCard = approvalDispatchCard({
      id: 'approval-8801-meet-loop',
      approvalId: 8801,
      actionType: 'send_invite',
    });
    const current: AgentThreadMessage[] = [
      userMessage('user-1', '给陈砚发送邀请'),
      {
        id: 'assistant-origin',
        role: 'assistant',
        content: '这位候选人可以先低压力沟通。',
        status: 'done',
        result: userFacingResponseWithCards([candidateCard]),
        showSocialResult: true,
      },
    ];

    const publishResponse = responseFromApprovalDispatchResult({
      approvalId: 9901,
      actionType: 'publish_social_request',
      dispatchResult: {
        socialRequestId: 301,
        publicIntentId: 'public_301',
        discoverHref: '/discover?publicIntentId=public_301',
        publicIntentHref: '/public-intent/public_301',
        status: 'published',
        synced: true,
      },
      taskId: 101,
    });
    expect(publishResponse).not.toBeNull();

    const merged = mergeApprovalDispatchResponseIntoMessages({
      activeTaskId: 101,
      current,
      input: {
        approvalId: 8801,
        actionType: 'send_invite',
        dispatchResult: {
          targetUserId: 22,
          candidateRecordId: 501,
          conversationId: 'conversation-22',
        },
        taskId: 101,
        targetMessageId: 'assistant-origin',
        targetCardId: 'candidate-card-501',
        suppressStandalone: true,
      },
      nextId: (prefix) => `${prefix}-new`,
      response: {
        ...userFacingResponseWithCards([dispatchCard]),
        assistantMessage: '已按你的确认建立站内沟通入口。',
      },
    });

    expect(merged).toHaveLength(2);
    expect(merged[1]).toMatchObject({
      id: 'assistant-origin',
      conversationIntent: 'approval',
      showSocialResult: true,
    });
    expect(merged[1].result?.cards.map((card) => card.id)).toEqual([
      'candidate-card-501',
      'approval-8801-meet-loop',
    ]);
  });

  it('does not append a standalone approval dispatch result for inline card actions without a target', () => {
    const current: AgentThreadMessage[] = [userMessage('user-1', '给陈砚发送邀请')];
    const merged = mergeApprovalDispatchResponseIntoMessages({
      activeTaskId: 101,
      current,
      input: {
        approvalId: 8801,
        actionType: 'send_invite',
        dispatchResult: {
          targetUserId: 22,
          conversationId: 'conversation-22',
        },
        taskId: 101,
        suppressStandalone: true,
      },
      nextId: (prefix) => `${prefix}-new`,
      response: {
        ...userFacingResponseWithCards([
          approvalDispatchCard({
            id: 'approval-8801-meet-loop',
            approvalId: 8801,
            actionType: 'send_invite',
          }),
        ]),
        assistantMessage: '已按你的确认建立站内沟通入口。',
      },
    });

    expect(merged).toBe(current);
  });

  it('merges approved Discover publish dispatch back into the originating opportunity card', () => {
    const opportunityCard = {
      id: 'opportunity-card-301',
      type: 'activity_status',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.activity',
      title: '今晚青岛大学散步',
      body: '发布前需要确认。',
      data: {
        taskId: 101,
        socialRequestId: 301,
      },
      actions: [],
    } satisfies FitMeetAlphaCard;
    const current: AgentThreadMessage[] = [
      userMessage('user-1', '同意发布'),
      {
        id: 'assistant-origin',
        role: 'assistant',
        content: '发布前需要确认。',
        status: 'done',
        result: userFacingResponseWithCards([opportunityCard]),
        showSocialResult: true,
      },
    ];
    const publishResponse = responseFromApprovalDispatchResult({
      approvalId: 9901,
      actionType: 'publish_social_request',
      dispatchResult: {
        socialRequestId: 301,
        publicIntentId: 'public_301',
        discoverHref: '/discover?publicIntentId=public_301',
        publicIntentHref: '/public-intent/public_301',
        status: 'published',
        synced: true,
      },
      taskId: 101,
    });
    expect(publishResponse).not.toBeNull();

    const merged = mergeApprovalDispatchResponseIntoMessages({
      activeTaskId: 101,
      current,
      input: {
        approvalId: 9901,
        actionType: 'publish_social_request',
        dispatchResult: {
          socialRequestId: 301,
          publicIntentId: 'public_301',
          discoverHref: '/discover?publicIntentId=public_301',
          publicIntentHref: '/public-intent/public_301',
          status: 'published',
          synced: true,
        },
        taskId: 101,
        targetMessageId: 'assistant-origin',
        targetCardId: 'opportunity-card-301',
        suppressStandalone: true,
      },
      nextId: (prefix) => `${prefix}-new`,
      response: publishResponse!,
    });

    expect(merged).toHaveLength(2);
    expect(merged[1].result?.cards.map((card) => card.id)).toEqual([
      'approval-9901-publish-discover',
    ]);
    expect(merged[1].result?.cards[0]).toMatchObject({
      schemaType: 'social_match.activity',
      title: '已发布到发现',
      data: expect.objectContaining({
        publicIntentId: 'public_301',
        discoverHref: '/discover?publicIntentId=public_301',
        publicIntentHref: '/public-intent/public_301',
        publishStatus: 'published',
      }),
    });
  });

  it('converts approved Discover publish dispatch into a visible detail card', () => {
    const response = responseFromApprovalDispatchResult({
      approvalId: 9901,
      actionType: 'publish_social_request',
      dispatchResult: {
        id: 'public_301',
        socialRequestId: 301,
        publicIntentId: 'public_301',
        discoverHref: '/discover?publicIntentId=public_301',
        publicIntentHref: '/public-intent/public_301',
        status: 'published',
        synced: true,
      },
      taskId: 101,
    });

    expect(response).toMatchObject({
      assistantMessage: expect.stringContaining('发布到发现页'),
      lightStatus: '已整理回复',
      cards: [
        expect.objectContaining({
          schemaType: 'social_match.activity',
          title: '已发布到发现',
          data: expect.objectContaining({
            taskId: 101,
            socialRequestId: 301,
            publicIntentId: 'public_301',
            discoverHref: '/discover?publicIntentId=public_301',
            publicIntentHref: '/public-intent/public_301',
            publishStatus: 'published',
          }),
          actions: [
            expect.objectContaining({
              label: '查看发现详情',
              schemaAction: 'activity.view_detail',
              payload: expect.objectContaining({
                discoverHref: '/discover?publicIntentId=public_301',
                publicIntentHref: '/public-intent/public_301',
              }),
            }),
          ],
        }),
      ],
    });
  });

  it('collapses repeated assistant delta and final text surfaces in a single run', () => {
    const answer = '谢谢你的认可！我现在会先把你的约练需求整理清楚，再继续推荐。';
    const richerAnswer =
      '谢谢你的认可！我现在会先把你的约练需求整理清楚，再继续推荐具体的人和活动。';
    expect(collapseRepeatedAssistantTextBlocks(`${answer}\n\n${answer}`)).toBe(answer);
    expect(collapseRepeatedAssistantTextBlocks(`${answer}\n${answer}`)).toBe(answer);
    expect(collapseRepeatedAssistantTextBlocks(`${answer}\n\n${richerAnswer}`)).toBe(richerAnswer);
    expect(mergeAssistantDeltaText(answer, `\n\n${answer}`)).toBe(answer);
    expect(mergeAssistantDeltaText(answer, `\n${answer}`)).toBe(answer);

    const messages: AgentThreadMessage[] = [
      userMessage('user-1', '你现在好智能'),
      {
        id: 'assistant-stream-1',
        role: 'assistant',
        content: `${answer}\n\n${answer}`,
        status: 'done',
        runId: 'run-dup',
        messageId: 'message-dup',
        result: null,
      },
    ];

    expect(
      findAssistantRunResultMergeIndex(
        messages,
        { runId: 'run-dup', messageId: 'message-dup' },
        answer,
      ),
    ).toBe(1);
  });

  it('collapses a whole assistant answer repeated as two paragraphs', () => {
    const answer =
      '谢谢你的认可！我现在的确在努力变得更聪明。你的需求我理解是：找一个社交压力不大、节奏舒服的活动伙伴。';

    expect(collapseRepeatedAssistantTextBlocks(`${answer}\n\n${answer}`)).toBe(answer);
  });

  it('collapses long screenshot-style repeated assistant clarification copy', () => {
    const answer =
      '谢谢你的认可！我现在的确在努力变得更聪明——特别是帮你把“想运动 + 想社交”这件事做得更顺。目前你的需求我理解是：找一个社交压力不大、节奏舒服的活动伙伴。不过要精准匹配，我还需要知道几个关键信息，比如：-你更想今晚就近试试，还是周末下午找个时间？-你偏好什么类型的运动或活动？（跑步、徒步、打球、或者只是轻松的户外散步都行）你告诉我这些，我就能直接帮你推荐具体的人或活动方案了。';

    expect(collapseRepeatedAssistantTextBlocks(`${answer}\n\n${answer}`)).toBe(answer);
    expect(mergeAssistantDeltaText(answer, `\n\n${answer}`)).toBe(answer);
  });

  it('collapses a repeated answer even when the replay copy has small punctuation changes', () => {
    const first =
      '谢谢你的认可！我现在的确在努力变得更聪明。你的需求我理解是：找一个社交压力不大、节奏舒服的活动伙伴。';
    const replay =
      '谢谢你的认可，我现在的确在努力变得更聪明——你的需求我理解是：找一个社交压力不大、节奏舒服的活动伙伴。';

    expect(collapseRepeatedAssistantTextBlocks(`${first}\n${replay}`)).toBe(replay);
  });

  it('merges a final result into the same run message even when the final copy differs', () => {
    const messages: AgentThreadMessage[] = [
      userMessage('user-1', '帮我找青岛大学附近散步搭子'),
      {
        id: 'assistant-stream-1',
        role: 'assistant',
        content: '正在整理你的约练需求…',
        status: 'done',
        runId: 'run-social-1',
        messageId: 'message-social-1',
        result: null,
      },
    ];

    expect(
      findAssistantRunResultMergeIndex(
        messages,
        { runId: 'run-social-1', messageId: 'message-social-1' },
        '我已经整理出 3 个公开可发现的人选。',
      ),
    ).toBe(1);
    expect(
      mergeAssistantFinalText(
        '正在整理你的约练需求…',
        '我已经整理出 3 个公开可发现的人选，可以先看这几个机会。',
      ),
    ).toBe('我已经整理出 3 个公开可发现的人选，可以先看这几个机会。');
  });

  it('does not let a shorter recovery notice replace an already completed answer', () => {
    expect(
      mergeAssistantFinalText(
        '我已经按今晚、青岛大学附近、散步这些条件继续处理，并会优先查找公开可发现的人。',
        '这段需求还在',
      ),
    ).toBe('我已经按今晚、青岛大学附近、散步这些条件继续处理，并会优先查找公开可发现的人。');
  });

  it('does not let a generic idle fallback replace a concrete streamed social answer', () => {
    expect(
      mergeAssistantFinalText(
        '明白，你想今晚在青岛大学附近散步，并优先找公开资料里有编程兴趣的女生。我会按这些条件继续处理。',
        '你好，我在。你可以随便聊，也可以补充偏好；等你明确说要找人、找活动或找搭子时，我再开始搜索。',
      ),
    ).toBe(
      '明白，你想今晚在青岛大学附近散步，并优先找公开资料里有编程兴趣的女生。我会按这些条件继续处理。',
    );
  });

  it('merges near-duplicate final text into the current assistant message without a run anchor', () => {
    const streamed = '谢谢你的认可！我现在会先把你的约练需求整理清楚，再继续推荐具体的人和活动。';
    const finalCopy = '谢谢你的认可，我现在会先把你的约练需求整理清楚，再继续推荐具体的人和活动';
    const messages: AgentThreadMessage[] = [
      userMessage('user-1', '你现在好智能'),
      {
        id: 'assistant-stream-no-anchor',
        role: 'assistant',
        content: streamed,
        status: 'done',
        result: null,
      },
    ];

    expect(findAssistantRunResultMergeIndex(messages, {}, finalCopy)).toBe(1);
    expect(
      reduceSingleRunAssistantMessages([
        ...messages,
        {
          id: 'assistant-final-no-anchor',
          role: 'assistant',
          content: finalCopy,
          status: 'done',
          result: null,
        },
      ]),
    ).toHaveLength(2);
  });

  it('reduces replayed delta and final result for the same run into one assistant message', () => {
    const existingCard = {
      id: 'candidate-501',
      type: 'candidate_card',
      schemaType: 'social_match.candidate',
      schemaVersion: 'fitmeet.tool-ui.v1',
      title: '陈砚',
      body: '青岛大学附近，公开资料匹配散步。',
      data: {
        candidateRecordId: 501,
        targetUserId: 22,
      },
      actions: [],
    } satisfies FitMeetAlphaCard;
    const replayedCard = {
      ...existingCard,
      id: 'candidate-501-replayed',
    } satisfies FitMeetAlphaCard;
    const finalResult = {
      ...userFacingResponseWithCards([replayedCard]),
      assistantMessage: '我整理好了，先给你 1 个公开可发现的人选。',
    } satisfies UserFacingAgentResponse;

    const reduced = reduceSingleRunAssistantMessages([
      userMessage('user-1', '今天上午青岛大学附近散步，女生，喜欢编程'),
      {
        id: 'assistant-stream-1',
        role: 'assistant',
        content: '正在整理你的约练需求…',
        status: 'streaming',
        runId: 'run-social-dup',
        messageId: 'assistant-social-dup',
        result: {
          ...userFacingResponseWithCards([existingCard]),
        },
      },
      {
        id: 'assistant-final-1',
        role: 'assistant',
        content: finalResult.assistantMessage,
        status: 'done',
        runId: 'run-social-dup',
        messageId: 'assistant-social-dup',
        result: finalResult,
      },
    ]);

    expect(reduced).toHaveLength(2);
    expect(reduced[1]).toMatchObject({
      id: 'assistant-stream-1',
      role: 'assistant',
      status: 'done',
      content: finalResult.assistantMessage,
      runId: 'run-social-dup',
      messageId: 'assistant-social-dup',
    });
    expect(reduced[1].result?.cards).toHaveLength(1);
    expect(reduced[1].result?.cards[0].id).toBe('candidate-501');
  });

  it('dedupes adjacent assistant answers even when a stream lacks run/message anchors', () => {
    const answer = '谢谢你的认可！我理解你想找一个节奏舒服的活动伙伴，还需要确认时间和活动类型。';
    const finalResult = {
      ...userFacingResponseWithCards([]),
      assistantMessage: answer,
    } satisfies UserFacingAgentResponse;

    const reduced = reduceSingleRunAssistantMessages([
      userMessage('user-1', '你现在好智能'),
      {
        id: 'assistant-delta-without-anchor',
        role: 'assistant',
        content: answer,
        status: 'done',
        result: null,
      },
      {
        id: 'assistant-final-without-anchor',
        role: 'assistant',
        content: `${answer}\n\n${answer}`,
        status: 'done',
        result: finalResult,
      },
    ]);

    expect(reduced).toHaveLength(2);
    expect(reduced[1]).toMatchObject({
      id: 'assistant-delta-without-anchor',
      role: 'assistant',
      status: 'done',
      content: answer,
      result: expect.objectContaining({
        assistantMessage: answer,
      }),
    });
  });

  it('dedupes adjacent assistant answers when reconnect replay uses a different run id', () => {
    const answer =
      '明白了，你想在青岛大学附近找今天上午可以一起散步、并且公开资料里有编程兴趣的人。我会按这些条件继续处理。';
    const replayedAnswer =
      '明白，你想在青岛大学附近找今天上午可以一起散步，并且公开资料里有编程兴趣的人。我会按这些条件继续处理。';

    const reduced = reduceSingleRunAssistantMessages([
      userMessage('user-1', '今天上午青岛大学附近散步，女生，喜欢编程'),
      {
        id: 'assistant-run-a',
        role: 'assistant',
        content: answer,
        status: 'done',
        runId: 'run-a',
        messageId: 'message-a',
        result: null,
      },
      {
        id: 'assistant-run-b-replay',
        role: 'assistant',
        content: replayedAnswer,
        status: 'done',
        runId: 'run-b-replay',
        messageId: 'message-b-replay',
        result: null,
      },
    ]);

    expect(reduced).toHaveLength(2);
    expect(reduced[1]).toMatchObject({
      id: 'assistant-run-a',
      role: 'assistant',
      content: replayedAnswer,
      runId: 'run-b-replay',
      messageId: 'message-b-replay',
    });
  });

  it('keeps interrupted streaming and replayed final result as one assistant surface', () => {
    const finalResult = {
      ...userFacingResponseWithCards([]),
      assistantMessage: '我已经按青岛大学附近、今天上午、散步来继续处理。',
    } satisfies UserFacingAgentResponse;

    const reduced = reduceSingleRunAssistantMessages([
      userMessage('user-1', '青岛大学附近今天上午散步，帮我找人'),
      {
        id: 'assistant-stream-1',
        role: 'assistant',
        content: '正在整理你的约练需求…',
        status: 'error',
        runId: 'run-interrupted-1',
        messageId: 'assistant-interrupted-1',
        result: null,
        branchable: false,
      },
      {
        id: 'assistant-final-1',
        role: 'assistant',
        content: finalResult.assistantMessage,
        status: 'done',
        runId: 'run-interrupted-1',
        messageId: 'assistant-interrupted-1',
        result: finalResult,
        branchable: true,
      },
    ]);

    expect(reduced).toHaveLength(2);
    expect(reduced[1]).toMatchObject({
      id: 'assistant-stream-1',
      status: 'done',
      content: finalResult.assistantMessage,
      branchable: false,
    });
    expect(buildBranchSnapshot(reduced, {})).toBeNull();
  });

  it('strips branch metadata when an interrupted run is explicitly non-branchable', () => {
    const reduced = reduceSingleRunAssistantMessages([
      userMessage('user-1', '继续刚才青岛大学散步找搭子的事'),
      {
        id: 'assistant-recovery-stream',
        role: 'assistant',
        content: '刚才连接不稳，我保留了这段需求。',
        status: 'error',
        runId: 'run-recovery-branch',
        messageId: 'message-recovery-branch',
        branchable: false,
      },
      {
        id: 'assistant-recovery-final',
        role: 'assistant',
        content: '我会沿用青岛大学、散步和今天上午，不重新追问。',
        status: 'done',
        runId: 'run-recovery-branch',
        messageId: 'message-recovery-branch',
        branchable: true,
        createsBranch: true,
        branch: {
          groupId: 'branch-user-1',
          index: 2,
          count: 2,
          activeIndex: 2,
          syncStatus: 'idle',
        },
      },
    ]);

    expect(reduced).toHaveLength(2);
    expect(reduced[1]).toMatchObject({
      id: 'assistant-recovery-stream',
      branchable: false,
      createsBranch: false,
    });
    expect(reduced[1].branch).toBeUndefined();
    expect(buildBranchSnapshot(reduced, {})).toBeNull();
  });

  it('collapses duplicated final answer text replayed inside one run result', () => {
    const duplicated =
      '我理解了：你想今天上午在青岛大学附近散步，优先找公开资料里有编程兴趣的女生。\n\n我理解了：你想今天上午在青岛大学附近散步，优先找公开资料里有编程兴趣的女生。';
    const finalResult = {
      ...userFacingResponseWithCards([]),
      assistantMessage: duplicated,
    } satisfies UserFacingAgentResponse;

    const reduced = reduceSingleRunAssistantMessages([
      userMessage('user-1', '青岛大学附近今天上午散步，女生，喜欢编程'),
      {
        id: 'assistant-stream',
        role: 'assistant',
        content: '正在整理你的约练需求…',
        status: 'streaming',
        runId: 'run-duplicated-final',
        messageId: 'assistant-duplicated-final',
      },
      {
        id: 'assistant-final',
        role: 'assistant',
        content: duplicated,
        status: 'done',
        runId: 'run-duplicated-final',
        messageId: 'assistant-duplicated-final',
        result: finalResult,
      },
    ]);

    expect(reduced).toHaveLength(2);
    expect(reduced[1].content).toBe(
      '我理解了：你想今天上午在青岛大学附近散步，优先找公开资料里有编程兴趣的女生。',
    );
    expect(reduced[1].result?.assistantMessage).toBe(
      '我理解了：你想今天上午在青岛大学附近散步，优先找公开资料里有编程兴趣的女生。',
    );
  });

  it('dedupes replayed pending confirmations by approval id even when copy changes', () => {
    const firstResult = {
      ...userFacingResponseWithCards([]),
      pendingConfirmations: [
        {
          id: 8801,
          type: 'approval',
          actionType: 'send_invite',
          summary: '确认发送给陈砚',
          riskLevel: 'medium',
          expiresAt: null,
        },
      ],
    } satisfies UserFacingAgentResponse;
    const replayedResult = {
      ...userFacingResponseWithCards([]),
      pendingConfirmations: [
        {
          id: 8801,
          type: 'approval',
          actionType: 'send_invite',
          summary: '发送邀请前需要你确认',
          riskLevel: 'medium',
          expiresAt: null,
        },
      ],
    } satisfies UserFacingAgentResponse;

    const reduced = reduceSingleRunAssistantMessages([
      userMessage('user-1', '给陈砚发送邀请'),
      {
        id: 'assistant-stream-1',
        role: 'assistant',
        content: '发送前需要你确认。',
        status: 'streaming',
        runId: 'run-approval-replay',
        messageId: 'assistant-approval-replay',
        result: firstResult,
      },
      {
        id: 'assistant-final-1',
        role: 'assistant',
        content: '我把确认按钮放在下面。',
        status: 'done',
        runId: 'run-approval-replay',
        messageId: 'assistant-approval-replay',
        result: replayedResult,
      },
    ]);

    expect(reduced).toHaveLength(2);
    expect(reduced[1].result?.pendingConfirmations).toHaveLength(1);
    expect(reduced[1].result?.pendingConfirmations[0]).toMatchObject({
      id: 8801,
      actionType: 'send_invite',
    });
  });

  it('dedupes replayed pending confirmations by candidate action when approval id is missing', () => {
    const firstResult = {
      ...userFacingResponseWithCards([]),
      pendingConfirmations: [
        {
          id: null,
          type: 'approval',
          actionType: 'send_invite',
          summary: '确认发送给陈砚',
          riskLevel: 'medium',
          expiresAt: null,
          payload: { candidateRecordId: 501, targetUserId: 22 },
        },
      ] as unknown as UserFacingAgentResponse['pendingConfirmations'],
    } satisfies UserFacingAgentResponse;
    const replayedResult = {
      ...userFacingResponseWithCards([]),
      pendingConfirmations: [
        {
          id: null,
          type: 'approval_required',
          actionType: 'send_invite',
          summary: '邀请发送前需要你确认',
          riskLevel: 'medium',
          expiresAt: null,
          payload: { candidateRecordId: 501, targetUserId: 22 },
        },
      ] as unknown as UserFacingAgentResponse['pendingConfirmations'],
    } satisfies UserFacingAgentResponse;

    const reduced = reduceSingleRunAssistantMessages([
      userMessage('user-1', '给陈砚发送邀请'),
      {
        id: 'assistant-stream-candidate-approval',
        role: 'assistant',
        content: '发送前需要你确认。',
        status: 'streaming',
        runId: 'run-candidate-approval-replay',
        messageId: 'assistant-candidate-approval-replay',
        result: firstResult,
      },
      {
        id: 'assistant-final-candidate-approval',
        role: 'assistant',
        content: '我把确认按钮放在候选卡里。',
        status: 'done',
        runId: 'run-candidate-approval-replay',
        messageId: 'assistant-candidate-approval-replay',
        result: replayedResult,
      },
    ]);

    expect(reduced).toHaveLength(2);
    expect(reduced[1].result?.pendingConfirmations).toHaveLength(1);
    expect(reduced[1].result?.pendingConfirmations[0]).toMatchObject({
      id: null,
      actionType: 'send_invite',
    });
  });

  it('dedupes final result cards by card, approval, candidate action, and task opportunity keys', () => {
    const cards = [
      approvalDispatchCard({ id: 'card-stable', approvalId: 701, actionType: 'send_invite' }),
      approvalDispatchCard({ id: 'card-stable', approvalId: 701, actionType: 'send_invite' }),
      {
        ...approvalDispatchCard({
          id: 'same-approval-from-safety-card',
          approvalId: 701,
          actionType: 'send_invite',
        }),
        schemaType: 'safety.approval' as const,
      },
      {
        ...approvalDispatchCard({
          id: 'candidate-replay-send-1',
          approvalId: 0,
          actionType: 'send_invite',
        }),
        data: {
          taskId: 101,
          candidateRecordId: 501,
          actionType: 'send_invite',
        },
      },
      {
        ...approvalDispatchCard({
          id: 'candidate-replay-send-2',
          approvalId: 0,
          actionType: 'send_invite',
        }),
        data: {
          taskId: 101,
          candidateRecordId: 501,
          actionType: 'send_invite',
        },
      },
      {
        ...approvalDispatchCard({ id: '', approvalId: 0, actionType: 'connect_candidate' }),
        data: {
          taskId: 101,
          candidateRecordId: 501,
          actionType: 'connect_candidate',
        },
      },
      {
        ...approvalDispatchCard({
          id: 'opportunity-replay-1',
          approvalId: 0,
          actionType: 'activity.confirm_create',
        }),
        schemaType: 'social_match.activity' as const,
        data: {
          taskId: 101,
          opportunityId: 'opp-1',
          actionType: 'activity.confirm_create',
        },
      },
      {
        ...approvalDispatchCard({
          id: 'opportunity-replay-2',
          approvalId: 0,
          actionType: 'activity.confirm_create',
        }),
        schemaType: 'social_match.activity' as const,
        data: {
          taskId: 101,
          opportunityId: 'opp-1',
          actionType: 'activity.confirm_create',
        },
      },
    ];

    const result = dedupeUserFacingResponseCards(userFacingResponseWithCards(cards));

    expect(result.cards).toHaveLength(3);
    expect(result.cards.map((card) => card.data.actionType)).toEqual([
      'send_invite',
      'connect_candidate',
      'activity.confirm_create',
    ]);
  });

  it('keeps only the latest covering process card inside a final result package', () => {
    const firstProcess = {
      id: 'social-codex:summary:understand',
      type: 'audit_update',
      schemaType: 'generic.card',
      title: '正在理解你的需求',
      body: '我会先识别这是普通聊天，还是需要进入约练流程。',
      data: {
        taskId: 101,
        runId: 'run-covering-process',
        processType: 'run_summary',
        displayMode: 'covering_status',
        title: '正在理解你的需求',
      },
      actions: [],
    } satisfies FitMeetAlphaCard;
    const latestProcess = {
      ...firstProcess,
      id: 'social-codex:summary:candidate-search',
      title: '正在筛选公开可发现的人',
      body: '我会优先看公开资料和自愿公开标签。',
      data: {
        ...firstProcess.data,
        title: '正在筛选公开可发现的人',
        currentSeq: 3,
      },
    } satisfies FitMeetAlphaCard;

    const result = dedupeUserFacingResponseCards(
      userFacingResponseWithCards([firstProcess, latestProcess]),
    );

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]).toMatchObject({
      id: 'social-codex:summary:candidate-search',
      title: '正在筛选公开可发现的人',
    });
  });

  it('dedupes replayed cards when ids move between nested data and action payloads', () => {
    const firstCandidate = {
      ...approvalDispatchCard({
        id: 'candidate-target-user-replay-1',
        approvalId: 0,
        actionType: 'send_invite',
      }),
      data: {
        taskId: 101,
        targetUserId: 22,
        actionType: 'send_invite',
      },
      actions: [
        {
          id: 'send-invite-1',
          action: 'send_message',
          schemaAction: 'opener.confirm_send',
          label: '发送邀请',
          requiresConfirmation: true,
          payload: {
            taskId: 101,
            candidateRecordId: 501,
            actionType: 'send_invite',
          },
        },
      ],
    } satisfies FitMeetAlphaCard;
    const replayedCandidate = {
      ...approvalDispatchCard({
        id: 'candidate-target-user-replay-2',
        approvalId: 0,
        actionType: 'send_invite',
      }),
      data: {
        taskId: 101,
        candidate: {
          candidateRecordId: 501,
          targetUserId: 22,
        },
      },
      actions: [
        {
          id: 'send-invite-2',
          action: 'send_message',
          schemaAction: 'opener.confirm_send',
          label: '发送邀请',
          requiresConfirmation: true,
          payload: {
            taskId: 101,
            targetUserId: 22,
            actionType: 'send_invite',
          },
        },
      ],
    } satisfies FitMeetAlphaCard;
    const firstOpportunity = {
      ...approvalDispatchCard({
        id: 'opportunity-nested-replay-1',
        approvalId: 0,
        actionType: 'activity.confirm_create',
      }),
      schemaType: 'social_match.activity' as const,
      data: {
        taskId: 101,
        opportunity: {
          id: 'opp-2',
        },
      },
    } satisfies FitMeetAlphaCard;
    const replayedOpportunity = {
      ...approvalDispatchCard({
        id: 'opportunity-nested-replay-2',
        approvalId: 0,
        actionType: 'activity.confirm_create',
      }),
      schemaType: 'social_match.activity' as const,
      data: {
        taskId: 101,
      },
      actions: [
        {
          id: 'publish-discover-1',
          action: 'create_activity',
          schemaAction: 'activity.confirm_create',
          label: '发布到发现',
          requiresConfirmation: true,
          payload: {
            taskId: 101,
            opportunityId: 'opp-2',
          },
        },
      ],
    } satisfies FitMeetAlphaCard;

    const result = dedupeUserFacingResponseCards(
      userFacingResponseWithCards([
        firstCandidate,
        replayedCandidate,
        firstOpportunity,
        replayedOpportunity,
      ]),
    );

    expect(result.cards).toHaveLength(2);
    expect(result.cards.map((card) => card.id)).toEqual([
      'candidate-target-user-replay-1',
      'opportunity-nested-replay-1',
    ]);
  });

  it('keeps a candidate action result separate from the base candidate card', () => {
    const candidate = {
      id: 'candidate-detail-501',
      type: 'candidate_card',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.candidate',
      title: '陈砚',
      body: '公开资料显示她也喜欢轻松散步。',
      data: {
        schemaName: 'CandidateCard',
        taskId: 101,
        candidateRecordId: 501,
        targetUserId: 22,
      },
      actions: [
        {
          id: 'candidate-view-501',
          action: 'save_candidate',
          schemaAction: 'candidate.view_detail',
          label: '查看',
          requiresConfirmation: false,
          payload: { taskId: 101, candidateRecordId: 501, targetUserId: 22 },
        },
        {
          id: 'candidate-send-501',
          action: 'send_message',
          schemaAction: 'opener.confirm_send',
          label: '发送邀请',
          requiresConfirmation: true,
          payload: {
            taskId: 101,
            candidateRecordId: 501,
            targetUserId: 22,
            actionType: 'send_invite',
          },
        },
      ],
    } satisfies FitMeetAlphaCard;
    const replayedCandidate = {
      ...candidate,
      id: 'candidate-detail-501-replay',
    } satisfies FitMeetAlphaCard;
    const openerDraft = {
      id: 'opener-draft-501',
      type: 'candidate_card',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.candidate',
      title: '开场白预览',
      body: '这条开场白需要你确认后才会发送。',
      data: {
        schemaName: 'OpenerDraftCard',
        taskId: 101,
        candidateRecordId: 501,
        targetUserId: 22,
        openerDraftReady: true,
        message: '你好，我也想今天上午在青岛大学附近散步。',
      },
      actions: [
        {
          id: 'opener-confirm-send-501',
          action: 'send_message',
          schemaAction: 'opener.confirm_send',
          label: '发送邀请',
          requiresConfirmation: true,
          payload: {
            taskId: 101,
            candidateRecordId: 501,
            targetUserId: 22,
            actionType: 'send_invite',
          },
        },
      ],
    } satisfies FitMeetAlphaCard;
    const replayedOpenerDraft = {
      ...openerDraft,
      id: 'opener-draft-501-replay',
    } satisfies FitMeetAlphaCard;

    const result = dedupeUserFacingResponseCards(
      userFacingResponseWithCards([candidate, replayedCandidate, openerDraft, replayedOpenerDraft]),
    );

    expect(result.cards).toHaveLength(2);
    expect(result.cards.map((card) => card.id)).toEqual([
      'candidate-detail-501',
      'opener-draft-501',
    ]);
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

  it('does not expose auto-retry merged messages as branch variants', () => {
    const messages = reduceSingleRunAssistantMessages([
      userMessage('user-1', '继续刚才的约练任务'),
      {
        id: 'assistant-auto-retry-stream',
        role: 'assistant',
        content: '正在继续刚才的约练任务…',
        status: 'streaming',
        runId: 'run-auto-retry',
        messageId: 'message-auto-retry',
        branchable: false,
      },
      {
        id: 'assistant-auto-retry-final',
        role: 'assistant',
        content: '我会沿用刚才的时间、地点和活动，不重新追问。',
        status: 'done',
        runId: 'run-auto-retry',
        messageId: 'message-auto-retry',
        branchable: true,
      },
    ]);

    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      id: 'assistant-auto-retry-stream',
      branchable: false,
    });
    expect(buildBranchSnapshot(messages, {})).toBeNull();
    expect(decorateAssistantBranches(messages, {})).toEqual(messages);
  });

  it('does not turn adjacent assistant answers into a branch unless regeneration explicitly marks them', () => {
    const messages: AgentThreadMessage[] = [
      userMessage('user-1', '帮我找青岛大学附近散步搭子'),
      {
        id: 'assistant-first-pass',
        role: 'assistant',
        content: '我先按青岛大学附近、散步来整理你的需求。',
        status: 'done',
        branchable: true,
      },
      {
        id: 'assistant-auto-followup',
        role: 'assistant',
        content: '我会继续补齐时间和安全边界，不重新开一个版本。',
        status: 'done',
        branchable: true,
      },
    ];

    expect(buildBranchSnapshot(messages, {})).toBeNull();
    expect(decorateAssistantBranches(messages, {})).toEqual(messages);
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

  it('keeps useful restored cards while hiding generic recovery assistant text', () => {
    const restored: UserFacingAgentResponse = {
      assistantMessage: 'FitMeet Agent 暂时没有顺利完成。我已经保留当前对话，请稍后再试。',
      assistantMessageSource: 'fallback',
      lightStatus: '已整理回复',
      cards: [
        {
          id: 'candidate-card-chen',
          type: 'candidate_card',
          schemaType: 'social_match.candidate',
          title: '陈砚',
          body: '公开资料里有散步和青岛大学附近相关信息。',
          status: 'ready',
          data: {
            candidateRecordId: 501,
            targetUserId: 22,
          },
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
    };

    const messages = messagesFromSessionSnapshot(
      {
        hasSession: true,
        activeTaskId: 42,
        task: { id: 42, status: 'active' },
        messages: [{ id: 'user-1', role: 'user', content: '继续找今晚青岛大学散步搭子' }],
      },
      restored,
      42,
    );

    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      role: 'assistant',
      content: '',
      surfaceKind: 'recovery',
      branchable: false,
      showSocialResult: true,
    });
    expect(messages[1].result?.cards).toHaveLength(1);
    expect(JSON.stringify(messages)).not.toContain('稍后再试');
    expect(JSON.stringify(messages)).not.toContain('FitMeet Agent 暂时没有顺利完成');
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

  it('attaches restored latest result to the existing run message instead of appending a duplicate', () => {
    const restored = {
      ...userFacingResponseWithCards([
        approvalDispatchCard({
          id: 'approval-88-meet-loop',
          approvalId: 88,
          actionType: 'send_invite',
        }),
      ]),
      assistantMessage: '已按你的确认建立站内沟通入口。接下来等待对方回复。',
      workflow: {
        workflowId: 'agent-task:42',
        state: 'CONVERSATION_ACTIVE',
        requiredAction: null,
        retryable: false,
        recoveryMessage: null,
      },
    } satisfies UserFacingAgentResponse;

    const messages = messagesFromSessionSnapshot(
      {
        hasSession: true,
        activeTaskId: 42,
        task: { id: 42, status: 'waiting_reply' },
        result: restored,
        messages: [
          { id: 'user-1', role: 'user', content: '同意发送邀请' },
          {
            id: 'assistant-db-1',
            role: 'assistant',
            content: '邀约已经确认，后续会保存在这条进展里。',
            result: restored,
          },
        ],
      },
      restored,
      42,
    );

    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.id)).toEqual(['user-1', 'assistant-db-1']);
    expect(messages[1]).toMatchObject({
      result: expect.objectContaining({
        assistantMessage: restored.assistantMessage,
        cards: expect.arrayContaining([
          expect.objectContaining({
            id: 'approval-88-meet-loop',
          }),
        ]),
      }),
      showSocialResult: true,
    });
  });

  it('restores user-facing opportunity cards from server session snapshots', () => {
    const restored = {
      ...userFacingResponseWithCards([
        {
          id: 'activity_plan:42:2',
          type: 'activity_plan',
          schemaType: 'social_match.activity',
          title: '青岛五四广场晚散步搭子',
          body: '确认后这张约练卡才会出现在发现页。',
          status: 'waiting_confirmation',
          data: {
            taskId: 42,
            socialRequestId: 2,
            schemaType: 'social_match.activity',
          },
          actions: [
            {
              id: 'publish_to_discover:42:2',
              label: '确认发布',
              action: 'publish_to_discover',
              schemaAction: 'publish_to_discover',
              requiresConfirmation: true,
              payload: { taskId: 42, socialRequestId: 2 },
            },
            {
              id: 'modify_activity_plan:42:2',
              label: '修改卡片',
              action: 'reschedule_meet_loop',
              schemaAction: 'activity.modify_time',
              requiresConfirmation: false,
              payload: { taskId: 42, socialRequestId: 2 },
            },
            {
              id: 'skip_publish_activity:42:2',
              label: '暂不发布',
              action: 'activity.skip_publish',
              schemaAction: 'activity.skip_publish',
              requiresConfirmation: false,
              payload: { taskId: 42, socialRequestId: 2 },
            },
          ],
        },
      ]),
      assistantMessage: '我已经把这次约练整理成发布确认卡。你点确认前不会公开到发现页。',
      workflow: {
        workflowId: 'agent-task:42',
        state: 'INTENT_DRAFT',
        requiredAction: 'publish_confirmation_required',
        retryable: false,
        recoveryMessage: null,
      },
    } satisfies UserFacingAgentResponse;
    const snapshot = {
      hasSession: true,
      activeTaskId: 42,
      task: { id: 42, status: 'awaiting_confirmation' },
      userFacingResult: restored,
      result: {
        taskId: 42,
        assistantMessage: restored.assistantMessage,
        cards: [],
      },
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content:
            '发布约练卡片，明天晚上7点在青岛五四广场散步，按默认安全设置处理',
        },
        {
          id: 'assistant-db-1',
          role: 'assistant',
          content: restored.assistantMessage,
        },
      ],
    };

    const response = responseFromSessionSnapshot(snapshot);
    const messages = messagesFromSessionSnapshot(snapshot, response, 42);

    expect(response?.cards[0]).toMatchObject({
      schemaType: 'social_match.activity',
      data: expect.objectContaining({ socialRequestId: 2 }),
    });
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      id: 'assistant-db-1',
      result: expect.objectContaining({
        cards: [
          expect.objectContaining({
            schemaType: 'social_match.activity',
          }),
        ],
      }),
      showSocialResult: true,
      conversationIntent: 'social',
    });
  });

  it('collapses duplicate assistant messages from restored snapshots for the same run', () => {
    const restored = {
      ...userFacingResponseWithCards([
        approvalDispatchCard({
          id: 'approval-99-send-invite',
          approvalId: 99,
          actionType: 'send_invite',
        }),
      ]),
      assistantMessage: '我已经整理好这次约练邀请，发送前会先让你确认。',
      runtime: {
        runId: 'restore-run-duplicate',
        messageId: 'restore-message-duplicate',
        threadId: 'agent-task:42',
      },
    };

    const messages = messagesFromSessionSnapshot(
      {
        hasSession: true,
        activeTaskId: 42,
        task: { id: 42, status: 'waiting_approval' },
        messages: [
          { id: 'user-1', role: 'user', content: '帮我给陈砚发邀请' },
          {
            id: 'assistant-streaming-copy',
            role: 'assistant',
            content: '我已经整理好这次约练邀请，发送前会先让你确认。',
            runtime: {
              runId: 'restore-run-duplicate',
              messageId: 'restore-message-duplicate',
            },
          },
          {
            id: 'assistant-final-copy',
            role: 'assistant',
            content: '我已经整理好这次约练邀请，发送前会先让你确认。',
            result: restored,
            runtime: {
              runId: 'restore-run-duplicate',
              messageId: 'restore-message-duplicate',
            },
          },
        ],
      },
      restored,
      42,
    );

    const assistantMessages = messages.filter((message) => message.role === 'assistant');
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0]).toMatchObject({
      id: 'assistant-streaming-copy',
      runId: 'restore-run-duplicate',
      messageId: 'restore-message-duplicate',
      result: expect.objectContaining({
        cards: [
          expect.objectContaining({
            id: 'approval-99-send-invite',
          }),
        ],
      }),
      showSocialResult: true,
    });
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

  it('keeps workflow recovery on the assistant surface so recovery copy can render', () => {
    const response: UserFacingAgentResponse = {
      assistantMessage: '这一步没有完成，但我已经保存了进度。',
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
      workflow: {
        workflowId: 'agent-task:321',
        state: 'RECOVERY',
        requiredAction: null,
        retryable: true,
        recoveryMessage: '我保留了这段需求，可以从这里继续。',
      },
    };

    expect(responseHasCheckpointRuntime(response)).toBe(true);
    expect(isNonAnswerFallbackResponse(response)).toBe(false);
    expect(assistantMessageForUserFacingResult(response, '已保留')).toBe(
      '我保留了这段需求，可以从这里继续。',
    );
  });

  it('describes workflow recovery as a saved alternative instead of a generic failure', () => {
    const response: UserFacingAgentResponse = {
      assistantMessage: '这一步已经完成，并且保存了可恢复状态。',
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
      workflow: {
        workflowId: 'agent-task:123',
        state: 'RECOVERY',
        requiredAction: null,
        retryable: true,
        recoveryMessage: '这个步骤已经保存，可以重新整理或换一种方案。',
      },
    };

    expect(responseHasCheckpointRuntime(response)).toBe(true);
    expect(isNonAnswerFallbackResponse(response)).toBe(false);
    expect(assistantMessageForUserFacingResult(response, '已保存')).toBe(
      '这个步骤已经保存，可以重新整理或换一种方案。',
    );
  });

  it('prefers structured recoveryNotice over fallback copy detection', () => {
    const response: UserFacingAgentResponse = {
      assistantMessage: '',
      assistantMessageSource: 'fallback',
      recoveryNotice: {
        kind: 'timeout',
        title: '这次处理时间有点久',
        message: '可以继续处理，也可以补充新的要求。',
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
      title: '这段需求还在',
      message: '可以继续处理，也可以补充新的要求。',
      prompt: '继续找人',
      retryable: true,
    });
  });

  it('sanitizes generic recoveryNotice copy before showing recovery UI', () => {
    const response: UserFacingAgentResponse = {
      assistantMessage: 'FitMeet Agent 暂时没有顺利完成。我已经保留当前对话，请稍后再试。',
      assistantMessageSource: 'fallback',
      recoveryNotice: {
        kind: 'interrupted',
        title: '这次处理没有完成',
        message: 'FitMeet Agent 暂时没有顺利完成。我已经保留当前对话，请稍后再试。',
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

    expect(recoveryFromUserFacingResponse(response, '继续找人')).toMatchObject({
      title: '这段需求还在',
      message: '可以继续处理，我会从这里接着处理；也可以补充新的要求。',
      prompt: '继续找人',
      retryable: true,
    });
  });

  it('does not treat fallback recovery as the primary answer when useful social cards exist', () => {
    const response: UserFacingAgentResponse = {
      assistantMessage: 'FitMeet Agent 暂时没有顺利完成。我已经保留当前对话，请稍后再试。',
      assistantMessageSource: 'fallback',
      recoveryNotice: {
        kind: 'interrupted',
        title: '这次处理没有完成',
        message: '可以继续处理，也可以补充新的要求。',
        retryable: true,
        source: 'stream_error',
      },
      lightStatus: '已整理回复',
      cards: [
        {
          id: 'candidate-card-1',
          type: 'candidate_card',
          title: '合适候选',
          body: '已整理公开可发现候选。',
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
    };

    expect(isNonAnswerFallbackResponse(response)).toBe(false);
    expect(recoveryFromUserFacingResponse(response, '继续找人')).toMatchObject({
      title: '这段需求还在',
    });
  });

  it('does not treat fallback recovery as primary when useful schema-driven cards exist', () => {
    const response: UserFacingAgentResponse = {
      assistantMessage: 'FitMeet Agent 暂时没有顺利完成。我已经保留当前对话，请稍后再试。',
      assistantMessageSource: 'fallback',
      recoveryNotice: {
        kind: 'interrupted',
        title: '这次处理没有完成',
        message: '可以继续处理，也可以补充新的要求。',
        retryable: true,
        source: 'stream_error',
      },
      lightStatus: '已整理回复',
      cards: [
        {
          id: 'schema-candidate-card-1',
          type: 'tool_ui',
          schemaType: 'social_match.candidate',
          title: '合适候选',
          body: '已整理公开可发现候选。',
          data: {
            schemaType: 'social_match.candidate',
            candidateRecordId: 501,
          },
          actions: [],
        } as unknown as UserFacingAgentResponse['cards'][number],
        {
          id: 'schema-opportunity-card-1',
          type: 'tool_ui',
          schemaType: 'social_match.activity',
          title: '青岛大学散步约练',
          body: '这张约练卡可以发布到发现。',
          data: {
            schemaType: 'social_match.activity',
            taskId: 77,
            opportunityId: 'walk-qdu',
          },
          actions: [],
        } as unknown as UserFacingAgentResponse['cards'][number],
      ],
      pendingConfirmations: [],
      safeStatus: {
        blocked: false,
        level: 'low',
        boundaryNotes: [],
        requiredConfirmations: [],
      },
      permissionMode: 'confirm',
    };

    expect(isNonAnswerFallbackResponse(response)).toBe(false);
    expect(recoveryFromUserFacingResponse(response, '继续找人')).toMatchObject({
      title: '这段需求还在',
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
    expect(intentForPrompt('帮我分析一下我的理想型，先不要搜索候选人')).toBe('conversation');
  });

  it('still treats explicit opportunity discovery as social execution', () => {
    expect(intentForPrompt('今天晚上青岛大学附近散步，帮我找人')).toBe('social');
    expect(intentForPrompt('推荐几个公开可发现的篮球搭子')).toBe('social');
  });

  it('continues opportunity clarification only for slot answers or explicit social execution', () => {
    expect(continuesOpportunityClarification('今天晚上，青岛大学，散步')).toBe(true);
    expect(continuesOpportunityClarification('女生，最好是舞蹈生')).toBe(true);
    expect(continuesOpportunityClarification('可以，帮我找人')).toBe(true);
    expect(continuesOpportunityClarification('可以，帮我看看')).toBe(true);
    expect(continuesOpportunityClarification('那就看看')).toBe(true);
    expect(continuesOpportunityClarification('按默认安全设置处理')).toBe(true);
    expect(continuesOpportunityClarification('为什么你没懂我的意思')).toBe(false);
    expect(continuesOpportunityClarification('帮我找一下设置入口')).toBe(false);
    expect(continuesOpportunityClarification('我想找回之前的聊天记录')).toBe(false);
  });

  it('recognizes publish slot clarification replies that mention safety boundary', () => {
    expect(
      responseAwaitsOpportunityClarification({
        assistantMessage:
          '发布约练卡前我先一次性确认：还差 安全边界。你可以一句话补齐；如果安全边界不确定，可以说“按默认安全设置处理”。',
        assistantMessageSource: 'deterministic',
        cards: [],
        candidateGroups: [],
        nextActions: [],
        profileUpdates: [],
        taskId: 101,
      } as unknown as UserFacingAgentResponse),
    ).toBe(true);
  });

  it('keeps opportunity clarification pending when the backend returns a slot completion card', () => {
    expect(
      responseAwaitsOpportunityClarification({
        assistantMessage: '生成约练卡前还差：安全边界。',
        assistantMessageSource: 'deterministic',
        cards: [
          {
            id: 'activity_slot_completion:101',
            type: 'safety_boundary',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'social_match.slot_completion',
            title: '补齐约练卡信息',
            data: {
              schemaType: 'social_match.slot_completion',
              waitingFor: 'safety_boundary',
            },
            actions: [],
          },
        ],
        candidateGroups: [],
        nextActions: [],
        profileUpdates: [],
        taskId: 101,
      } as unknown as UserFacingAgentResponse),
    ).toBe(true);
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
      label: '正在理解你的需求…',
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
        type: 'agent_loop_step',
        id: 'legacy-loop',
        phase: 'tool',
        title: 'legacy agent loop event',
        status: 'running',
      } as AgentStreamEvent),
    ).toBe(false);
    expect(
      streamEventReplacesLocalCoveringStatus({
        type: 'tool_call',
        id: 'legacy-tool-call',
        toolName: 'search_public_candidates',
        title: 'legacy tool call event',
      } as AgentStreamEvent),
    ).toBe(false);
    expect(
      streamEventReplacesLocalCoveringStatus({
        type: 'tool_result',
        id: 'legacy-tool-result',
        toolName: 'search_public_candidates',
        title: 'legacy tool result event',
        status: 'done',
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

function approvalDispatchCard(input: {
  id: string;
  approvalId: number;
  actionType: string;
}): FitMeetAlphaCard {
  return {
    id: input.id,
    type: 'review_card',
    schemaVersion: 'fitmeet.tool-ui.v1',
    schemaType: 'meet_loop.timeline',
    title: '邀约进展',
    body: '确认已完成，后续状态会继续保存在同一条进展里。',
    status: 'completed',
    data: {
      schemaName: 'MeetLoopTimelineCard',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'meet_loop.timeline',
      approvalId: input.approvalId,
      actionType: input.actionType,
      taskId: 101,
      candidateRecordId: 501,
      targetUserId: 22,
      candidateUserId: 22,
    },
    actions: [],
  };
}

function userFacingResponseWithCards(cards: FitMeetAlphaCard[]): UserFacingAgentResponse {
  return {
    assistantMessage: '已整理当前结果。',
    lightStatus: '已整理回复',
    cards,
    safeStatus: {
      blocked: false,
      level: 'medium',
      boundaryNotes: [],
      requiredConfirmations: [],
    },
    pendingConfirmations: [],
    permissionMode: 'limited_auto',
  };
}

function replayPackage(
  overrides: Partial<SocialCodexReplayPackage> = {},
): SocialCodexReplayPackage {
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
