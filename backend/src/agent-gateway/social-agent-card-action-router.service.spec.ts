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
  const draftPublication = {
    publishDraft: jest.fn(),
    dismissDraft: jest.fn().mockResolvedValue({
      success: true,
      status: 'dismissed',
      message: '已取消发布，这张约练卡不会出现在发现页，也不会继续匹配。',
    }),
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
  const metrics = {
    recordDeterministicAction: jest.fn(),
  };
  const workoutLoop = {
    startWorkoutIntake: jest.fn(),
    performWorkoutAction: jest.fn(),
  };
  const friendLoop = {
    startFriendIntake: jest.fn(),
    performFriendAction: jest.fn(),
  };
  const travelLoop = {
    startTravelIntake: jest.fn(),
    performTravelAction: jest.fn(),
  };
  const clarificationActions = {
    perform: jest.fn(),
  };
  const service = new SocialAgentCardActionRouterService(
    candidateActions as never,
    meetLoop as never,
    lifeGraphActions as never,
    agentLoop as never,
    draftPublication as never,
    metrics as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    workoutLoop as never,
    clarificationActions as never,
    friendLoop as never,
    travelLoop as never,
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
    metrics,
    draftPublication,
    workoutLoop,
    friendLoop,
    travelLoop,
    clarificationActions,
    service,
  };
}

describe('SocialAgentCardActionRouterService', () => {
  it('dispatches loop choice workout directly to WorkoutLoop without re-entering chat LLM', async () => {
    const { handleMessage, metrics, service, workoutLoop } = makeHarness();
    workoutLoop.startWorkoutIntake.mockResolvedValue(
      routeResult({
        action: 'clarify',
        assistantMessage: '好的，我们先进入约练流程。',
        cards: [
          {
            id: 'workout_intake:101:missing',
            type: 'workout_intake',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'workout.intake',
            title: '填写本次约练需求',
            data: { taskId: 101 },
            actions: [],
          },
        ],
      }),
    );

    const result = await service.perform({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'loop_choice.workout' as never,
        payload: { source: 'bootstrap' },
      },
      handleMessage,
    });

    expect(handleMessage).not.toHaveBeenCalled();
    expect(workoutLoop.startWorkoutIntake).toHaveBeenCalledWith({
      ownerUserId: 7,
      taskId: 101,
      payload: { source: 'bootstrap' },
    });
    expect(result.cards?.[0]).toMatchObject({ schemaType: 'workout.intake' });
    expect(metrics.recordDeterministicAction).toHaveBeenCalledWith(
      'loop_choice.workout',
      { estimatedAvoidedLlmCalls: 1 },
    );
  });

  it('dispatches loop choice friend directly to FriendLoop without re-entering chat LLM', async () => {
    const { friendLoop, handleMessage, service } = makeHarness();
    friendLoop.startFriendIntake.mockResolvedValue(
      routeResult({
        action: 'clarify',
        assistantMessage: '好的，我们先进入交友流程。',
        cards: [
          {
            id: 'friend_intake:101',
            type: 'friend_intake',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'friend.intake',
            title: '填写本次交友需求',
            data: { taskId: 101 },
            actions: [],
          },
        ],
      }),
    );

    const result = await service.perform({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'loop_choice.friend' as never,
        payload: { source: 'bootstrap' },
      },
      handleMessage,
    });

    expect(handleMessage).not.toHaveBeenCalled();
    expect(friendLoop.startFriendIntake).toHaveBeenCalledWith({
      ownerUserId: 7,
      taskId: 101,
      payload: { source: 'bootstrap' },
    });
    expect(result.cards?.[0]).toMatchObject({ schemaType: 'friend.intake' });
  });

  it('dispatches loop choice travel directly to TravelLoop without re-entering chat LLM', async () => {
    const { handleMessage, service, travelLoop } = makeHarness();
    travelLoop.startTravelIntake.mockResolvedValue(
      routeResult({
        action: 'clarify',
        assistantMessage: '好的，我们先进入旅游闭环。',
        cards: [
          {
            id: 'travel_intake:101',
            type: 'travel_intake',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'travel.intake',
            title: '填写本次结伴旅行需求',
            data: { taskId: 101 },
            actions: [],
          },
        ],
      }),
    );

    const result = await service.perform({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'loop_choice.travel' as never,
        payload: { source: 'bootstrap' },
      },
      handleMessage,
    });

    expect(handleMessage).not.toHaveBeenCalled();
    expect(travelLoop.startTravelIntake).toHaveBeenCalledWith({
      ownerUserId: 7,
      taskId: 101,
      payload: { source: 'bootstrap' },
    });
    expect(result.cards?.[0]).toMatchObject({ schemaType: 'travel.intake' });
  });

  it('dispatches travel card actions to TravelLoop', async () => {
    const { handleMessage, service, travelLoop } = makeHarness();
    travelLoop.performTravelAction.mockResolvedValue(
      routeResult({
        assistantMessage: '已进入私密旅行匹配。',
        publicLoop: {
          stage: 'matching_queued',
          publicIntentId: null,
          discoverHref: null,
          publicIntentHref: null,
          messagesHref: null,
          requiredConfirmation: false,
        },
      }),
    );

    await service.perform({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'travel_draft.private_match' as never,
        payload: { socialRequestId: 801 },
      },
      handleMessage,
    });

    expect(handleMessage).not.toHaveBeenCalled();
    expect(travelLoop.performTravelAction).toHaveBeenCalledWith({
      ownerUserId: 7,
      taskId: 101,
      body: expect.objectContaining({
        action: 'travel_draft.private_match',
        payload: { socialRequestId: 801 },
      }),
    });
  });

  it('delegates clarification card actions to the clarification action service', async () => {
    const { clarificationActions, handleMessage, service } = makeHarness();
    clarificationActions.perform.mockResolvedValue(
      routeResult({
        action: 'await_confirmation',
        assistantMessage: '已按你的确认继续。',
      }),
    );

    await service.perform({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'clarification.yes' as never,
        payload: { yesPatch: { activityType: '跑步' } },
      },
      handleMessage,
    });

    expect(handleMessage).not.toHaveBeenCalled();
    expect(clarificationActions.perform).toHaveBeenCalledWith({
      ownerUserId: 7,
      taskId: 101,
      body: expect.objectContaining({ action: 'clarification.yes' }),
    });
  });

  it('publishes workout drafts through the existing discover publish flow and marks matching queued', async () => {
    const { draftPublication, handleMessage, service } = makeHarness();
    draftPublication.publishDraft.mockResolvedValue({
      success: true,
      status: 'published',
      synced: true,
      socialRequestId: 501,
      publicIntentId: 'public-intent:workout-501',
      discoverHref: '/discover?publicIntentId=public-intent%3Aworkout-501',
      publicIntentHref: '/public-intent/public-intent%3Aworkout-501',
      sourceVersion: 'source-v1',
      matchingJob: { id: 9001, status: 'queued' },
    });

    const result = await service.perform({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'workout_draft.publish' as never,
        payload: {
          confirmedPublish: true,
          socialRequestId: 501,
          socialRequestDraft: {
            title: '今晚青岛大学跑步约练',
            activityType: '跑步',
            city: '青岛',
          },
        },
      },
      handleMessage,
    });

    expect(handleMessage).not.toHaveBeenCalled();
    expect(draftPublication.publishDraft).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({
        socialRequestId: 501,
        title: '今晚青岛大学跑步约练',
        visibility: expect.any(String),
      }),
    );
    expect(result.publicLoop).toMatchObject({
      stage: 'matching_queued',
      publicIntentId: 'public-intent:workout-501',
    });
    expect(result.assistantMessage).toContain('进入约练匹配队列');
  });

  it('does not publish workout drafts with an empty city or default them to Qingdao', async () => {
    const { draftPublication, handleMessage, service } = makeHarness();

    const result = await service.perform({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'workout_draft.publish' as never,
        payload: {
          confirmedPublish: true,
          socialRequestId: 501,
          slots: {
            activityType: '跑步',
            timePreference: '明晚',
            locationText: '学校附近',
          },
          socialRequestDraft: {
            title: '明晚学校附近跑步约练',
            activityType: '跑步',
            metadata: { loop: 'workout' },
          },
        },
      },
      handleMessage,
    });

    expect(handleMessage).not.toHaveBeenCalled();
    expect(draftPublication.publishDraft).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      action: 'reply',
      publicLoop: expect.objectContaining({
        stage: 'publish_confirmation_required',
      }),
      cards: [
        expect.objectContaining({
          schemaType: 'workout.intake',
          data: expect.objectContaining({
            city: null,
            missingFields: expect.arrayContaining(['city']),
          }),
        }),
      ],
    });
  });

  it('keeps low-risk candidate card actions approval-free while still dispatching through AgentLoop', async () => {
    const { candidateActions, executeCalls, handleMessage, metrics, service } =
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
    expect(
      candidateActions.performCandidatePreferenceAction,
    ).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({ action: 'candidate.like' }),
    );
    expect(
      candidateActions.createOpenerDraftFromCardAction,
    ).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({ action: 'candidate.generate_opener' }),
    );
    expect(executeCalls).toHaveLength(2);
    expect(metrics.recordDeterministicAction).toHaveBeenCalledWith(
      'candidate.like',
      { estimatedAvoidedLlmCalls: 1 },
    );
    expect(metrics.recordDeterministicAction).toHaveBeenCalledWith(
      'candidate.generate_opener',
      { estimatedAvoidedLlmCalls: 1 },
    );
    expect(
      executeCalls.map((call) => ({
        goal: call.goal,
        tool: (
          call.plan as {
            tools: Array<{
              agent: string;
              toolName: string;
              input: Record<string, unknown>;
            }>;
          }
        ).tools[0],
      })),
    ).toEqual([
      {
        goal: 'card_action:candidate.like',
        tool: expect.objectContaining({
          agent: 'Match Agent',
          toolName: 'card_action_dispatch',
          input: expect.objectContaining({ action: 'candidate.like' }),
        }),
      },
      {
        goal: 'card_action:candidate.generate_opener',
        tool: expect.objectContaining({
          agent: 'Match Agent',
          toolName: 'card_action_dispatch',
          input: expect.objectContaining({
            action: 'candidate.generate_opener',
          }),
        }),
      },
    ]);
  });

  it('does not continue private candidate search after publish is skipped', async () => {
    const { candidateActions, handleMessage, metrics, service } = makeHarness();
    candidateActions.performCandidatePreferenceAction.mockResolvedValue(
      routeResult({
        action: 'reply',
        assistantMessage: '已记录这次私密匹配偏好。',
      }),
    );

    const result = await service.perform({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'candidate.more_like_this' as never,
        idempotencyKey: 'private-more-like-this-101',
        payload: {
          privateMatchMode: true,
          publicDiscoverPublishSkipped: true,
          candidateSearchMode: 'private_match_without_discover_publish',
          sourceAction: 'activity.skip_publish',
          city: '青岛',
          title: '青岛大学轻松散步',
          timePreference: '今天晚上',
          locationPreference: '青岛大学附近',
          activityType: '散步',
          targetGender: '女生',
        },
        clientContext: { threadId: 'agent-task:101' },
      },
      handleMessage,
    });

    expect(
      candidateActions.performCandidatePreferenceAction,
    ).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({ action: 'candidate.more_like_this' }),
    );
    expect(handleMessage).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      action: 'reply',
      assistantMessage: '已记录这次私密匹配偏好。',
    });
    expect(result.structuredIntent).toBeUndefined();
    expect(metrics.recordDeterministicAction).toHaveBeenCalledWith(
      'candidate.more_like_this',
      expect.objectContaining({ estimatedAvoidedLlmCalls: 1 }),
    );
  });

  it('normalizes legacy low-risk action aliases before dispatching', async () => {
    const { candidateActions, handleMessage, meetLoop, service } =
      makeHarness();
    candidateActions.performCandidatePreferenceAction.mockResolvedValue(
      routeResult({
        action: 'reply',
        assistantMessage: '已记录这个偏好。',
        pendingApproval: null,
      }),
    );
    candidateActions.regenerateOpenerDraftFromCardAction.mockResolvedValue(
      routeResult({
        action: 'reply',
        assistantMessage: '已重新生成开场白草稿。',
        pendingApproval: null,
      }),
    );
    meetLoop.performActivityAction.mockResolvedValue(
      routeResult({
        action: 'reply',
        assistantMessage: '当前活动详情已整理好。',
        pendingApproval: null,
      }),
    );

    for (const [action, canonical] of [
      ['save_candidate', 'candidate.like'],
      ['dislike_candidate', 'candidate.skip'],
      ['see_more', 'candidate.more_like_this'],
      ['expand_radius', 'candidate.more_like_this'],
      ['relax_preference', 'candidate.more_like_this'],
      ['filter_school', 'candidate.more_like_this'],
      ['filter_gender_female', 'candidate.more_like_this'],
      ['refine_request', 'candidate.more_like_this'],
    ] as const) {
      await service.perform({
        ownerUserId: 7,
        taskId: 101,
        body: {
          action: action as never,
          payload: { candidateRecordId: 501, targetUserId: 22 },
        },
        handleMessage,
      });
      expect(
        candidateActions.performCandidatePreferenceAction,
      ).toHaveBeenLastCalledWith(
        7,
        101,
        expect.objectContaining({ action: canonical }),
      );
    }

    await service.perform({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'regenerate_opener' as never,
        payload: { candidateRecordId: 501, targetUserId: 22 },
      },
      handleMessage,
    });
    expect(
      candidateActions.regenerateOpenerDraftFromCardAction,
    ).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({ action: 'opener.regenerate' }),
    );

    await service.perform({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'view_activity' as never,
        payload: { activityId: 700 },
      },
      handleMessage,
    });
    expect(meetLoop.performActivityAction).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({ action: 'activity.view_detail' }),
    );
    expect(handleMessage).not.toHaveBeenCalled();
  });

  it('dispatches high-risk schema actions only through AgentLoop and preserves pending approval results', async () => {
    const {
      candidateActions,
      executeCalls,
      handleMessage,
      lifeGraphActions,
      meetLoop,
      metrics,
      draftPublication,
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
      return Promise.resolve(
        routeResult({
          action: 'reply',
          assistantMessage:
            '我已恢复到上次保存的邀约进度。下一步仍需要你确认。',
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
        assistantMessage: '已保存画像信息。',
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
        expectedAgent: 'Match Agent',
        expectedHandler: candidateActions.connectCandidateFromCardAction,
      },
      {
        action: 'activity.confirm_create',
        payload: {
          candidateUserId: 22,
          checkpointRequired: true,
          resumeMode: 'resume_after_approval',
        },
        expectedAgent: 'Match Agent',
        expectedHandler: meetLoop.performActivityAction,
      },
      {
        action: 'social_intent.decline_publish',
        payload: {
          candidateUserId: 22,
          checkpointRequired: false,
        },
        expectedAgent: 'FitMeet Main Agent',
        expectedHandler: draftPublication.dismissDraft,
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
        expectedAgent: 'Match Agent',
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
    expect(results[2]).toMatchObject({
      action: 'reply',
      assistantMessage: expect.stringContaining('不会出现在发现页'),
      pendingApproval: null,
      publicLoop: expect.objectContaining({ stage: 'dismissed' }),
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
    for (const action of [
      'candidate.connect',
      'activity.confirm_create',
      'social_intent.decline_publish',
      'life_graph.accept_update',
      'meet_loop.resume',
    ]) {
      expect(metrics.recordDeterministicAction).toHaveBeenCalledWith(action, {
        estimatedAvoidedLlmCalls: 1,
      });
    }
  });

  it('handles unknown card actions deterministically without re-entering chat LLM', async () => {
    const { handleMessage, metrics, service } = makeHarness();

    const result = await service.perform({
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

    expect(handleMessage).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      action: 'reply',
      taskId: 101,
      pendingApproval: null,
      assistantMessage: expect.stringContaining('暂时不可用'),
    });
    expect(metrics.recordDeterministicAction).toHaveBeenCalledWith(
      'unsupported_card_action',
      { estimatedAvoidedLlmCalls: 1 },
    );
  });

  it('keeps opener send and candidate connect actions on separate handlers', async () => {
    const { candidateActions, executeCalls, handleMessage, metrics, service } =
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
    const directMessageResult = await service.perform({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'send_candidate_message' as never,
        payload: {
          actionType: 'send_invite',
          candidateUserId: 22,
          message: '你好，想约你一起散步。',
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
    ).toHaveBeenCalledTimes(2);
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
    expect(directMessageResult.pendingApproval).toEqual(
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
    expect(executeCalls).toHaveLength(3);
    for (const action of ['opener.confirm_send', 'candidate.connect']) {
      expect(metrics.recordDeterministicAction).toHaveBeenCalledWith(action, {
        estimatedAvoidedLlmCalls: 1,
      });
    }
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
          agent: 'Match Agent',
          input: expect.objectContaining({
            action: 'opener.confirm_send',
          }),
        }),
      },
      {
        goal: 'card_action:opener.confirm_send',
        toolInput: expect.objectContaining({
          agent: 'Match Agent',
          input: expect.objectContaining({
            action: 'opener.confirm_send',
          }),
        }),
      },
      {
        goal: 'card_action:candidate.connect',
        toolInput: expect.objectContaining({
          agent: 'Match Agent',
          input: expect.objectContaining({
            action: 'candidate.connect',
          }),
        }),
      },
    ]);
  });

  it('normalizes legacy raw card actions before dispatching to subagent handlers', async () => {
    const {
      candidateActions,
      draftPublication,
      executeCalls,
      handleMessage,
      meetLoop,
      service,
    } = makeHarness();
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
    draftPublication.publishDraft.mockResolvedValue({
      success: true,
      status: 'published',
      synced: true,
      publicIntentId: 'public-intent:walk-qdu',
      discoverHref: '/discover?publicIntentId=public-intent%3Awalk-qdu',
      publicIntentHref: '/public-intent/public-intent%3Awalk-qdu',
      sourceVersion: 'source-v1',
      matchingJob: {
        id: 9001,
        publicIntentId: 'public-intent:walk-qdu',
        sourceVersion: 'source-v1',
        status: 'queued',
        candidateCount: 0,
      },
    });

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
              title: '青岛大学散步约练',
              city: '青岛',
              activityType: '散步',
              confirmedPublish: action === 'publish_social_request',
            },
          },
          handleMessage,
        }),
      );
    }

    expect(handleMessage).not.toHaveBeenCalled();
    expect(
      candidateActions.performCandidatePreferenceAction,
    ).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({ action: 'candidate.like' }),
    );
    expect(
      candidateActions.createOpenerDraftFromCardAction,
    ).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({ action: 'candidate.generate_opener' }),
    );
    expect(
      candidateActions.confirmOpenerSendFromCardAction,
    ).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({ action: 'opener.confirm_send' }),
      { signal: null },
    );
    expect(
      candidateActions.connectCandidateFromCardAction,
    ).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({ action: 'candidate.connect' }),
    );
    expect(meetLoop.performActivityAction).not.toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({ action: 'publish_to_discover' }),
    );
    expect(draftPublication.publishDraft).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({
        title: '青岛大学散步约练',
        city: '青岛',
        activityType: '散步',
        visibility: 'public',
        status: 'matching',
      }),
    );
    expect(results[0].pendingApproval).toBeNull();
    expect(results[1].pendingApproval).toBeNull();
    expect(results[2].pendingApproval).toEqual(
      expect.objectContaining({ actionType: 'send_invite' }),
    );
    expect(results[3].pendingApproval).toEqual(
      expect.objectContaining({ actionType: 'connect_candidate' }),
    );
    expect(results[4].pendingApproval).toBeNull();
    expect(results[4].assistantMessage).toContain('已发布到发现页');
    expect(results[4].cards?.[0]?.data).toEqual(
      expect.objectContaining({
        publicIntentId: 'public-intent:walk-qdu',
        discoverHref: '/discover?publicIntentId=public-intent%3Awalk-qdu',
        publicIntentHref: '/public-intent/public-intent%3Awalk-qdu',
        matchingJobId: 9001,
        matchingJobStatus: 'queued',
        sourceVersion: 'source-v1',
      }),
    );
    expect(executeCalls.map((call) => call.goal)).toEqual([
      'card_action:candidate.like',
      'card_action:candidate.generate_opener',
      'card_action:opener.confirm_send',
      'card_action:candidate.connect',
      'card_action:publish_to_discover',
    ]);
  });

  it('enqueues matching after a successful Discover publish without natural-language reroute', async () => {
    const { draftPublication, handleMessage, service } = makeHarness();
    draftPublication.publishDraft.mockResolvedValue({
      success: true,
      status: 'published',
      synced: true,
      socialRequestId: 301,
      publicIntentId: 'public-intent:walk-qdu',
      discoverHref: '/discover?publicIntentId=public-intent%3Awalk-qdu',
      publicIntentHref: '/public-intent/public-intent%3Awalk-qdu',
      sourceVersion: 'source-v1',
      matchingJob: {
        id: 9001,
        publicIntentId: 'public-intent:walk-qdu',
        sourceVersion: 'source-v1',
        status: 'queued',
        candidateCount: 0,
      },
    });

    const result = await service.perform({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'publish_to_discover' as never,
        payload: {
          confirmedPublish: true,
          title: '青岛大学散步约练',
          city: '青岛',
          timePreference: '今天晚上',
          locationPreference: '青岛大学附近',
          activityType: '跑步',
          socialRequestId: 301,
        },
        clientContext: { threadId: 'agent-task:101' },
      },
      handleMessage,
    });

    expect(draftPublication.publishDraft).toHaveBeenCalled();
    expect(draftPublication.publishDraft).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({
        title: '青岛大学散步约练',
        city: '青岛',
        activityType: '跑步',
        socialRequestId: 301,
        visibility: 'public',
        status: 'matching',
      }),
    );
    expect(handleMessage).not.toHaveBeenCalled();
    expect(result.intent).toBe('action_request');
    expect(result.assistantMessage).toContain('已发布到发现页');
    expect(result.cards?.map((card) => card.title)).toEqual(['已发布到发现']);
    expect(result.cards?.[0]).toEqual(
      expect.objectContaining({
        schemaType: 'social_match.activity',
        status: 'completed',
        data: expect.objectContaining({
          publicIntentId: 'public-intent:walk-qdu',
          discoverHref: '/discover?publicIntentId=public-intent%3Awalk-qdu',
          matchingJobId: 9001,
          matchingJobStatus: 'queued',
          sourceVersion: 'source-v1',
        }),
      }),
    );
    expect(result.publicLoop).toEqual(
      expect.objectContaining({
        stage: 'discover_visible',
        publicIntentId: 'public-intent:walk-qdu',
        discoverHref: '/discover?publicIntentId=public-intent%3Awalk-qdu',
        publicIntentHref: '/public-intent/public-intent%3Awalk-qdu',
        requiredConfirmation: false,
      }),
    );
  });

  it('returns an inline publish confirmation card before publishing to Discover', async () => {
    const { draftPublication, handleMessage, metrics, service } = makeHarness();

    const result = await service.perform({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'publish_to_discover' as never,
        payload: {
          opportunityId: 'walk-qdu',
          title: '青岛大学散步约练',
          city: '青岛',
          activityType: '散步',
        },
      },
      handleMessage,
    });

    expect(handleMessage).not.toHaveBeenCalled();
    expect(draftPublication.publishDraft).not.toHaveBeenCalled();
    expect(metrics.recordDeterministicAction).toHaveBeenCalledWith(
      'publish_to_discover',
      { estimatedAvoidedLlmCalls: 1 },
    );
    expect(result.pendingApproval).toBeNull();
    expect(result.cards).toEqual([
      expect.objectContaining({
        schemaType: 'safety.approval',
        status: 'waiting_confirmation',
        title: '确认发布到发现',
        data: expect.objectContaining({
          actionType: 'publish_social_request',
          riskLevel: 'medium',
        }),
        actions: expect.arrayContaining([
          expect.objectContaining({
            schemaAction: 'publish_to_discover',
            requiresConfirmation: true,
            payload: expect.objectContaining({
              confirmedPublish: true,
              title: '青岛大学散步约练',
            }),
          }),
          expect.objectContaining({
            schemaAction: 'social_intent.decline_publish',
            requiresConfirmation: false,
          }),
        ]),
      }),
    ]);
  });

  it('keeps publish action waiting when the publish tool returns a pending approval', async () => {
    const { draftPublication, handleMessage, metrics, service } = makeHarness();
    draftPublication.publishDraft.mockResolvedValue({
      success: false,
      status: 'pending_approval',
      taskStatus: 'awaiting_confirmation',
      approvalId: 501,
      pendingApproval: {
        id: 501,
        type: 'post_publish',
        actionType: 'create_social_request',
        summary: '创建社交需求属于高风险动作，需要确认后再执行。',
        riskLevel: 'high',
        payload: { socialRequestId: 301 },
        expiresAt: null,
      },
      synced: false,
    });

    const result = await service.perform({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'publish_to_discover' as never,
        payload: {
          confirmedPublish: true,
          opportunityId: 'walk-qdu',
          title: '青岛大学散步约练',
          city: '青岛',
          activityType: '散步',
          socialRequestId: 301,
        },
      },
      handleMessage,
    });

    expect(handleMessage).not.toHaveBeenCalled();
    expect(metrics.recordDeterministicAction).toHaveBeenCalledWith(
      'publish_to_discover',
      { estimatedAvoidedLlmCalls: 1 },
    );
    expect(result.assistantMessage).toContain('发布到发现前还需要你确认');
    expect(result.pendingApproval).toEqual(
      expect.objectContaining({
        id: 501,
        actionType: 'create_social_request',
      }),
    );
    expect(result.cards).toEqual([
      expect.objectContaining({
        schemaType: 'safety.approval',
        status: 'waiting_confirmation',
        title: '确认发布到发现',
        data: expect.objectContaining({
          approvalId: 501,
          actionType: 'publish_social_request',
        }),
        actions: expect.arrayContaining([
          expect.objectContaining({
            label: '确认发布',
            schemaAction: 'publish_to_discover',
            requiresConfirmation: true,
            payload: expect.objectContaining({
              approvalId: 501,
              confirmedPublish: true,
              socialRequestId: 301,
            }),
          }),
        ]),
      }),
    ]);
  });

  it('routes empty-candidate recovery actions deterministically without chat LLM', async () => {
    const { candidateActions, handleMessage, meetLoop, metrics, service } =
      makeHarness();
    candidateActions.performCandidatePreferenceAction.mockResolvedValue(
      routeResult({
        action: 'reply',
        assistantMessage: '我会按放宽后的条件继续找真实公开候选。',
        pendingApproval: null,
      }),
    );
    meetLoop.performActivityAction.mockResolvedValue(
      routeResult({
        action: 'reply',
        assistantMessage: '我先保留约练卡，等你确认新的时间。',
        pendingApproval: null,
      }),
    );

    const actions = [
      ['expand_radius', candidateActions.performCandidatePreferenceAction],
      ['relax_preference', candidateActions.performCandidatePreferenceAction],
      ['change_time', meetLoop.performActivityAction],
    ] as const;

    for (const [action] of actions) {
      await service.perform({
        ownerUserId: 7,
        taskId: 101,
        body: {
          action: action as never,
          payload: {
            recoveryMode: action,
            socialRequestDraft: {
              title: '青岛大学散步约练',
              city: '青岛',
              activityType: '散步',
            },
          },
        },
        handleMessage,
      });
    }

    expect(handleMessage).not.toHaveBeenCalled();
    expect(
      candidateActions.performCandidatePreferenceAction,
    ).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({ action: 'candidate.more_like_this' }),
    );
    expect(
      candidateActions.performCandidatePreferenceAction,
    ).toHaveBeenCalledTimes(2);
    expect(meetLoop.performActivityAction).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({ action: 'activity.modify_time' }),
    );
    expect(metrics.recordDeterministicAction).toHaveBeenCalledWith(
      'candidate.more_like_this',
      { estimatedAvoidedLlmCalls: 1 },
    );
    expect(metrics.recordDeterministicAction).toHaveBeenCalledWith(
      'activity.modify_time',
      { estimatedAvoidedLlmCalls: 1 },
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
            agent: 'Match Agent',
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
    expect(
      candidateActions.connectCandidateFromCardAction,
    ).not.toHaveBeenCalled();
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
