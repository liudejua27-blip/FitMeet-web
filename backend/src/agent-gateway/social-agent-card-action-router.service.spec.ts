import { SocialAgentCardActionRouterService } from './social-agent-card-action-router.service';
import type { SocialAgentIntentRouteResult } from './social-agent-chat.types';

function routeResult(
  overrides: Partial<SocialAgentIntentRouteResult> = {},
): SocialAgentIntentRouteResult {
  return {
    intent: 'action_request',
    confidence: 1,
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
    shouldExecuteAction: true,
    replyStrategy: 'execute_action',
    source: 'rules',
    action: 'reply',
    taskId: 101,
    assistantMessage: '完成',
    savedContext: true,
    profileUpdated: false,
    shouldQueueRun: false,
    runMode: null,
    queuedRun: null,
    pendingApproval: null,
    activityResults: [],
    profileUpdateProposal: null,
    cards: [],
    permissionMode: 'confirm' as never,
    ...overrides,
  };
}

function makeHarness(options: { runRunner?: boolean } = {}) {
  const runRunner = options.runRunner ?? true;
  const candidateActions = {
    confirmOpenerSendFromCardAction: jest.fn(),
    rejectOpenerSendFromCardAction: jest.fn(),
    regenerateOpenerDraftFromCardAction: jest.fn(),
    performCandidatePreferenceAction: jest.fn(),
    createOpenerDraftFromCardAction: jest.fn(),
    connectCandidateFromCardAction: jest.fn(),
  };
  const meetLoop = {
    performActivityAction: jest.fn(),
  };
  const lifeGraphActions = {
    performUpdateAction: jest.fn(),
  };
  const executeCalls: Array<Record<string, unknown>> = [];
  const agentLoop = {
    execute: jest.fn(async (input: Record<string, unknown>) => {
      executeCalls.push(input);
      if (runRunner) {
        const runner = input.runner as () => Promise<Record<string, unknown>>;
        await runner();
      }
      return {
        loop: {
          runId: 'loop:101:test',
          traceId: 'trace:test',
          taskId: 101,
          status: 'completed',
          steps: [],
        },
      };
    }),
  };
  const service = new SocialAgentCardActionRouterService(
    candidateActions as never,
    meetLoop as never,
    lifeGraphActions as never,
    agentLoop as never,
  );
  const handleMessage = jest.fn().mockResolvedValue(
    routeResult({
      assistantMessage: 'fallback handled',
    }),
  );
  return {
    agentLoop,
    candidateActions,
    executeCalls,
    handleMessage,
    lifeGraphActions,
    meetLoop,
    service,
  };
}

describe('SocialAgentCardActionRouterService', () => {
  it('dispatches high-risk schema actions only through AgentLoop and preserves pending approval results', async () => {
    const {
      candidateActions,
      executeCalls,
      handleMessage,
      lifeGraphActions,
      meetLoop,
      service,
    } = makeHarness();
    candidateActions.connectCandidateFromCardAction.mockResolvedValue(
      routeResult({
        action: 'await_confirmation',
        assistantMessage: '发送邀请前还需要你确认。',
        pendingApproval: {
          id: 9001,
          type: 'contact_request' as never,
          actionType: 'connect_candidate',
          summary: '发送邀请给候选人 #22',
          riskLevel: 'medium' as never,
          payload: {
            schemaAction: 'candidate.connect',
            checkpointRequired: true,
            resumeMode: 'resume_after_approval',
          },
          expiresAt: null,
        },
      }),
    );
    meetLoop.performActivityAction.mockResolvedValueOnce(
      routeResult({
        action: 'await_confirmation',
        assistantMessage: '确认前不会创建活动。',
        pendingApproval: {
          id: 9002,
          type: 'create_activity' as never,
          actionType: 'create_activity',
          summary: '创建线下约练计划',
          riskLevel: 'medium' as never,
          payload: {
            schemaAction: 'activity.confirm_create',
            checkpointRequired: true,
            resumeMode: 'resume_after_approval',
          },
          expiresAt: null,
        },
      }),
    );
    lifeGraphActions.performUpdateAction.mockResolvedValue(
      routeResult({
        action: 'reply',
        profileUpdated: true,
        assistantMessage: '已保存 Life Graph 信息。',
      }),
    );
    meetLoop.performActivityAction.mockResolvedValueOnce(
      routeResult({
        action: 'reply',
        assistantMessage: '我已恢复到上次保存的邀约进度。下一步仍需要你确认。',
        cards: [
          {
            id: 'meet-loop-resume',
            type: 'review_card',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'meet_loop.timeline',
            title: '邀约进展',
            status: 'waiting_confirmation',
            body: '确认前不会发送消息、连接候选人或创建活动。',
            data: {
              loopStage: 'activity_draft_created',
              waitingFor: 'meet_loop_resume_confirmation',
            },
            actions: [],
          },
        ],
      }),
    );

    const cases = [
      {
        action: 'candidate.connect',
        payload: {
          targetUserId: 22,
          checkpointRequired: true,
          resumeMode: 'resume_after_approval',
        },
        expectedAgent: 'Social Match Agent',
        expectedHandler: candidateActions.connectCandidateFromCardAction,
      },
      {
        action: 'activity.confirm_create',
        payload: {
          candidateUserId: 22,
          checkpointRequired: true,
          resumeMode: 'resume_after_approval',
        },
        expectedAgent: 'Meet Loop Agent',
        expectedHandler: meetLoop.performActivityAction,
      },
      {
        action: 'life_graph.accept_update',
        payload: {
          proposalId: 3301,
          checkpointRequired: true,
          resumeMode: 'resume_after_approval',
        },
        expectedAgent: 'Life Graph Agent',
        expectedHandler: lifeGraphActions.performUpdateAction,
      },
      {
        action: 'meet_loop.resume',
        payload: {
          loopStage: 'activity_draft_created',
          checkpointRequired: true,
          resumeMode: 'resume_after_approval',
        },
        expectedAgent: 'Meet Loop Agent',
        expectedHandler: meetLoop.performActivityAction,
      },
    ];

    const results: SocialAgentIntentRouteResult[] = [];
    for (const item of cases) {
      results.push(
        await service.perform({
          ownerUserId: 7,
          taskId: 101,
          body: {
            action: item.action as never,
            payload: item.payload,
          },
          handleMessage,
        }),
      );
    }

    expect(handleMessage).not.toHaveBeenCalled();
    expect(
      candidateActions.connectCandidateFromCardAction,
    ).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({ action: 'candidate.connect' }),
    );
    expect(lifeGraphActions.performUpdateAction).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({ action: 'life_graph.accept_update' }),
    );
    expect(meetLoop.performActivityAction).toHaveBeenCalledTimes(2);
    expect(results[0]).toMatchObject({
      action: 'await_confirmation',
      pendingApproval: expect.objectContaining({
        actionType: 'connect_candidate',
        payload: expect.objectContaining({
          checkpointRequired: true,
          resumeMode: 'resume_after_approval',
        }),
      }),
      agentLoop: expect.objectContaining({ runId: 'loop:101:test' }),
    });
    expect(results[1]).toMatchObject({
      action: 'await_confirmation',
      pendingApproval: expect.objectContaining({
        actionType: 'create_activity',
        payload: expect.objectContaining({
          checkpointRequired: true,
          resumeMode: 'resume_after_approval',
        }),
      }),
      agentLoop: expect.objectContaining({ runId: 'loop:101:test' }),
    });
    expect(results[3].cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          schemaType: 'meet_loop.timeline',
          status: 'waiting_confirmation',
          data: expect.objectContaining({
            waitingFor: 'meet_loop_resume_confirmation',
          }),
        }),
      ]),
    );

    for (const [index, item] of cases.entries()) {
      expect(executeCalls[index]).toMatchObject({
        taskId: 101,
        goal: `card_action:${item.action}`,
        plan: {
          reason: 'Card actions dispatch only through AgentLoop.',
          tools: [
            {
              agent: item.expectedAgent,
              toolName: 'card_action_dispatch',
              input: expect.objectContaining({
                action: item.action,
                taskId: 101,
              }),
            },
          ],
        },
        maxToolCalls: 1,
        maxRetries: 0,
      });
      expect(item.expectedHandler).toHaveBeenCalled();
    }
  });

  it('keeps fallback card actions bound to the active thread context', async () => {
    const { handleMessage, service } = makeHarness();

    await service.perform({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'candidate.more_context' as never,
        idempotencyKey: 'card-fallback-1',
        clientContext: {
          threadId: 'agent-task:101',
          timezone: 'Asia/Shanghai',
          locale: 'zh-CN',
        },
      },
      handleMessage,
    });

    expect(handleMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 101,
        hasCandidates: true,
        idempotencyKey: 'card-fallback-1',
        clientContext: expect.objectContaining({
          threadId: 'agent-task:101',
          source: 'card_action',
          timezone: 'Asia/Shanghai',
          locale: 'zh-CN',
        }),
      }),
      undefined,
      undefined,
    );
  });

  it('does not dispatch fallback card actions when AgentLoop does not execute the tool runner', async () => {
    const {
      candidateActions,
      executeCalls,
      handleMessage,
      lifeGraphActions,
      meetLoop,
      service,
    } = makeHarness({ runRunner: false });

    await expect(
      service.perform({
        ownerUserId: 7,
        taskId: 101,
        body: {
          action: 'candidate.more_context' as never,
          idempotencyKey: 'card-fallback-loop-boundary',
          clientContext: { threadId: 'agent-task:101' },
        },
        handleMessage,
      }),
    ).rejects.toThrow('Card action AgentLoop completed without result.');

    expect(executeCalls[0]).toMatchObject({
      taskId: 101,
      goal: 'card_action:candidate.more_context',
      plan: {
        reason: 'Card actions dispatch only through AgentLoop.',
        tools: [
          {
            agent: 'Social Match Agent',
            toolName: 'card_action_dispatch',
            input: expect.objectContaining({
              action: 'candidate.more_context',
              taskId: 101,
            }),
          },
        ],
      },
      maxToolCalls: 1,
      maxRetries: 0,
    });
    expect(handleMessage).not.toHaveBeenCalled();
    expect(
      candidateActions.performCandidatePreferenceAction,
    ).not.toHaveBeenCalled();
    expect(candidateActions.connectCandidateFromCardAction).not.toHaveBeenCalled();
    expect(meetLoop.performActivityAction).not.toHaveBeenCalled();
    expect(lifeGraphActions.performUpdateAction).not.toHaveBeenCalled();
  });

  it('forwards card action abort signals into opener confirmation actions', async () => {
    const { candidateActions, executeCalls, handleMessage, service } =
      makeHarness();
    const abortController = new AbortController();
    candidateActions.confirmOpenerSendFromCardAction.mockResolvedValue(
      routeResult({
        action: 'await_confirmation',
        assistantMessage: '发送前需要你确认。',
      }),
    );

    await service.perform({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'opener.confirm_send' as never,
        payload: {
          candidateUserId: 22,
          message: '你好，要不要一起散步？',
        },
      },
      handleMessage,
      options: { signal: abortController.signal },
    });

    expect(handleMessage).not.toHaveBeenCalled();
    expect(executeCalls[0]).toEqual(
      expect.objectContaining({
        signal: abortController.signal,
      }),
    );
    expect(
      candidateActions.confirmOpenerSendFromCardAction,
    ).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({ action: 'opener.confirm_send' }),
      { signal: abortController.signal },
    );
  });
});
