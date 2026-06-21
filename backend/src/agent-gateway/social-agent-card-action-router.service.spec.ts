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
  it('keeps low-risk candidate card actions approval-free while still dispatching through AgentLoop', async () => {
    const { candidateActions, executeCalls, handleMessage, service } =
      makeHarness();
    candidateActions.performCandidatePreferenceAction.mockResolvedValue(
      routeResult({
        action: 'reply',
        assistantMessage: '已收藏这个候选，后续推荐会参考。',
        pendingApproval: null,
      }),
    );
    candidateActions.createOpenerDraftFromCardAction.mockResolvedValue(
      routeResult({
        action: 'reply',
        assistantMessage: '我先帮你写了一条低压力的开场白。确认前不会发送。',
        pendingApproval: null,
        cards: [
          {
            id: 'opener-draft-501',
            type: 'candidate_card',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'social_match.candidate',
            title: '陈砚',
            body: '开场白已准备好。',
            data: { candidateRecordId: 501 },
            actions: [],
          },
        ],
      }),
    );

    const saveResult = await service.perform({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'candidate.like' as never,
        payload: { candidateRecordId: 501, targetUserId: 22 },
      },
      handleMessage,
    });
    const openerResult = await service.perform({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'candidate.generate_opener' as never,
        payload: { candidateRecordId: 501, targetUserId: 22 },
      },
      handleMessage,
    });

    expect(handleMessage).not.toHaveBeenCalled();
    expect(saveResult.pendingApproval).toBeNull();
    expect(openerResult.pendingApproval).toBeNull();
    expect(candidateActions.performCandidatePreferenceAction).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({ action: 'candidate.like' }),
    );
    expect(candidateActions.createOpenerDraftFromCardAction).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({ action: 'candidate.generate_opener' }),
    );
    expect(executeCalls).toHaveLength(2);
    expect(
      executeCalls.map((call) => ({
        goal: call.goal,
        tool: (
          call.plan as {
            tools: Array<{ agent: string; toolName: string; input: Record<string, unknown> }>;
          }
        ).tools[0],
      })),
    ).toEqual([
      {
        goal: 'card_action:candidate.like',
        tool: expect.objectContaining({
          agent: 'Social Match Agent',
          toolName: 'card_action_dispatch',
          input: expect.objectContaining({ action: 'candidate.like' }),
        }),
      },
      {
        goal: 'card_action:candidate.generate_opener',
        tool: expect.objectContaining({
          agent: 'Social Match Agent',
          toolName: 'card_action_dispatch',
          input: expect.objectContaining({ action: 'candidate.generate_opener' }),
        }),
      },
    ]);
  });

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
        assistantMessage: '加好友并聊天前还需要你确认。',
        pendingApproval: {
          id: 9001,
          type: 'contact_request' as never,
          actionType: 'connect_candidate',
          summary: '加好友并聊天：这位用户',
          riskLevel: 'high' as never,
          payload: {
            schemaAction: 'candidate.connect',
            checkpointRequired: true,
            resumeMode: 'resume_after_approval',
          },
          expiresAt: null,
        },
      }),
    );
    meetLoop.performActivityAction.mockImplementation((_owner, _task, body) => {
      if (body.action === 'activity.confirm_create') {
        return Promise.resolve(
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
      }
      if (body.action === 'activity.skip_publish') {
        return Promise.resolve(
          routeResult({
            action: 'reply',
            assistantMessage: '已保留为草稿，暂不发布到发现。',
          }),
        );
      }
      return Promise.resolve(
        routeResult({
          action: 'reply',
          assistantMessage: '我已恢复到上次保存的邀约进度。下一步仍需要你确认。',
          cards: [
            {
              id: 'meet-loop-resume',
              type: 'meet_loop_timeline',
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
    });
    lifeGraphActions.performUpdateAction.mockResolvedValue(
      routeResult({
        action: 'reply',
        profileUpdated: true,
        assistantMessage: '已保存 Life Graph 信息。',
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
        action: 'activity.skip_publish',
        payload: {
          candidateUserId: 22,
          checkpointRequired: false,
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
    expect(meetLoop.performActivityAction).toHaveBeenCalledTimes(3);
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
    expect(results[2]).toMatchObject({
      action: 'reply',
      assistantMessage: expect.stringContaining('暂不发布到发现'),
      pendingApproval: null,
    });
    expect(results[4].cards).toEqual(
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

  it('keeps opener send and candidate connect actions on separate handlers', async () => {
    const { candidateActions, executeCalls, handleMessage, service } =
      makeHarness();
    candidateActions.confirmOpenerSendFromCardAction.mockResolvedValue(
      routeResult({
        action: 'await_confirmation',
        assistantMessage: '发送邀请前需要你确认。',
        pendingApproval: {
          id: 8801,
          type: 'send_message' as never,
          actionType: 'send_invite',
          summary: '发送邀请给这位用户',
          riskLevel: 'medium' as never,
          payload: {
            schemaAction: 'opener.confirm_send',
            checkpointRequired: true,
            resumeMode: 'resume_after_approval',
          },
          expiresAt: null,
        },
      }),
    );
    candidateActions.connectCandidateFromCardAction.mockResolvedValue(
      routeResult({
        action: 'await_confirmation',
        assistantMessage: '加好友并聊天前需要你确认。',
        pendingApproval: {
          id: 8802,
          type: 'contact_request' as never,
          actionType: 'connect_candidate',
          summary: '加好友并聊天：这位用户',
          riskLevel: 'high' as never,
          payload: {
            schemaAction: 'candidate.connect',
            checkpointRequired: true,
            resumeMode: 'resume_after_approval',
          },
          expiresAt: null,
        },
      }),
    );

    const sendInviteResult = await service.perform({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'opener.confirm_send' as never,
        payload: {
          actionType: 'send_invite',
          candidateUserId: 22,
          message: '你好，要不要一起散步？',
        },
      },
      handleMessage,
    });
    const connectResult = await service.perform({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'candidate.connect' as never,
        payload: {
          actionType: 'connect_candidate',
          targetUserId: 22,
        },
      },
      handleMessage,
    });

    expect(handleMessage).not.toHaveBeenCalled();
    expect(
      candidateActions.confirmOpenerSendFromCardAction,
    ).toHaveBeenCalledTimes(1);
    expect(
      candidateActions.connectCandidateFromCardAction,
    ).toHaveBeenCalledTimes(1);
    expect(sendInviteResult.pendingApproval).toEqual(
      expect.objectContaining({
        actionType: 'send_invite',
        payload: expect.objectContaining({
          schemaAction: 'opener.confirm_send',
        }),
      }),
    );
    expect(connectResult.pendingApproval).toEqual(
      expect.objectContaining({
        actionType: 'connect_candidate',
        payload: expect.objectContaining({
          schemaAction: 'candidate.connect',
        }),
      }),
    );
    expect(executeCalls).toHaveLength(2);
    expect(
      executeCalls.map((call) => ({
        goal: call.goal,
        toolInput: (
          call.plan as {
            tools: Array<{ agent: string; input: Record<string, unknown> }>;
          }
        ).tools[0],
      })),
    ).toEqual([
      {
        goal: 'card_action:opener.confirm_send',
        toolInput: expect.objectContaining({
          agent: 'Social Match Agent',
          input: expect.objectContaining({
            action: 'opener.confirm_send',
          }),
        }),
      },
      {
        goal: 'card_action:candidate.connect',
        toolInput: expect.objectContaining({
          agent: 'Social Match Agent',
          input: expect.objectContaining({
            action: 'candidate.connect',
          }),
        }),
      },
    ]);
  });

  it('normalizes legacy raw card actions before dispatching to subagent handlers', async () => {
    const { candidateActions, executeCalls, handleMessage, meetLoop, service } =
      makeHarness();
    candidateActions.performCandidatePreferenceAction.mockResolvedValue(
      routeResult({
        action: 'reply',
        assistantMessage: '已收藏这个候选。',
        pendingApproval: null,
      }),
    );
    candidateActions.createOpenerDraftFromCardAction.mockResolvedValue(
      routeResult({
        action: 'reply',
        assistantMessage: '已生成开场白草稿。',
        pendingApproval: null,
      }),
    );
    candidateActions.confirmOpenerSendFromCardAction.mockResolvedValue(
      routeResult({
        action: 'await_confirmation',
        assistantMessage: '发送邀请前需要你确认。',
        pendingApproval: {
          id: 8801,
          type: 'send_message' as never,
          actionType: 'send_invite',
          summary: '发送邀请给这位用户',
          riskLevel: 'medium' as never,
          payload: {
            schemaAction: 'opener.confirm_send',
            checkpointRequired: true,
          },
          expiresAt: null,
        },
      }),
    );
    candidateActions.connectCandidateFromCardAction.mockResolvedValue(
      routeResult({
        action: 'await_confirmation',
        assistantMessage: '加好友并聊天前需要你确认。',
        pendingApproval: {
          id: 8802,
          type: 'contact_request' as never,
          actionType: 'connect_candidate',
          summary: '加好友并聊天：这位用户',
          riskLevel: 'high' as never,
          payload: {
            schemaAction: 'candidate.connect',
            checkpointRequired: true,
          },
          expiresAt: null,
        },
      }),
    );
    meetLoop.performActivityAction.mockResolvedValue(
      routeResult({
        action: 'await_confirmation',
        assistantMessage: '发布到发现前需要你确认。',
        pendingApproval: {
          id: 8803,
          type: 'post_publish' as never,
          actionType: 'publish_social_request',
          summary: '发布约练卡到发现',
          riskLevel: 'medium' as never,
          payload: {
            schemaAction: 'activity.confirm_create',
            checkpointRequired: true,
          },
          expiresAt: null,
        },
      }),
    );

    const rawActions = [
      'save_candidate',
      'generate_opener',
      'send_invite',
      'connect_candidate',
      'publish_social_request',
    ];
    const results: SocialAgentIntentRouteResult[] = [];
    for (const action of rawActions) {
      results.push(
        await service.perform({
          ownerUserId: 7,
          taskId: 101,
          body: {
            action: action as never,
            payload: {
              candidateRecordId: 501,
              targetUserId: 22,
              opportunityId: 'walk-qdu',
            },
          },
          handleMessage,
        }),
      );
    }

    expect(handleMessage).not.toHaveBeenCalled();
    expect(candidateActions.performCandidatePreferenceAction).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({ action: 'candidate.like' }),
    );
    expect(candidateActions.createOpenerDraftFromCardAction).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({ action: 'candidate.generate_opener' }),
    );
    expect(candidateActions.confirmOpenerSendFromCardAction).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({ action: 'opener.confirm_send' }),
      { signal: null },
    );
    expect(candidateActions.connectCandidateFromCardAction).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({ action: 'candidate.connect' }),
    );
    expect(meetLoop.performActivityAction).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({ action: 'activity.confirm_create' }),
    );
    expect(results[0].pendingApproval).toBeNull();
    expect(results[1].pendingApproval).toBeNull();
    expect(results[2].pendingApproval).toEqual(
      expect.objectContaining({ actionType: 'send_invite' }),
    );
    expect(results[3].pendingApproval).toEqual(
      expect.objectContaining({ actionType: 'connect_candidate' }),
    );
    expect(results[4].pendingApproval).toEqual(
      expect.objectContaining({ actionType: 'publish_social_request' }),
    );
    expect(executeCalls.map((call) => call.goal)).toEqual([
      'card_action:candidate.like',
      'card_action:candidate.generate_opener',
      'card_action:opener.confirm_send',
      'card_action:candidate.connect',
      'card_action:activity.confirm_create',
    ]);
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
