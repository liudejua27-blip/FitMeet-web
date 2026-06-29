import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import {
  ApprovalRiskLevel,
  ApprovalType,
} from './entities/agent-approval-request.entity';
import { SocialAgentCandidateActionService } from './social-agent-candidate-action.service';
import { SocialAgentToolName } from './social-agent-tool-executor.service';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    taskType: 'social_agent_chat',
    title: 'FitMeet Social Agent 聊天任务',
    goal: '找跑步搭子',
    result: {},
    memory: {},
    status: AgentTaskStatus.Pending,
    permissionMode: AgentTaskPermissionMode.Confirm,
    ...overrides,
  } as AgentTask;
}

function makeHarness(
  initialTask = makeTask(),
  workoutOpenerDrafts?: { draft: jest.Mock },
  agentLoop?: { execute: jest.Mock },
) {
  const savedEvents: Array<Record<string, unknown>> = [];
  let task = initialTask;
  const taskRepo = {
    findOne: jest.fn().mockImplementation(() => Promise.resolve(task)),
    save: jest.fn().mockImplementation((input: AgentTask) => {
      task = input;
      return Promise.resolve(input);
    }),
  };
  const eventRepo = {
    create: jest.fn((input: Record<string, unknown>) => input),
    save: jest.fn((input: Record<string, unknown>) => {
      savedEvents.push(input);
      return Promise.resolve(input);
    }),
  };
  const approvals = {
    create: jest.fn().mockImplementation((input: Record<string, unknown>) =>
      Promise.resolve({
        id: 9001,
        type: input.type,
        actionType: input.actionType,
        summary: input.summary,
        riskLevel: input.riskLevel,
        payload: input.payload,
        expiresAt: new Date('2026-06-06T00:00:00.000Z'),
      }),
    ),
    approve: jest.fn().mockResolvedValue({
      approval: { id: 9001, status: 'approved' },
      dispatched: false,
    }),
    reject: jest.fn().mockResolvedValue({
      id: 9001,
      status: 'rejected',
    }),
  };
  const longTermMemory = {
    summarizeTask: jest.fn().mockResolvedValue(undefined),
  };
  const l5Runtime = {
    transitionMeetLoop: jest.fn().mockResolvedValue(undefined),
  };
  const loopStateEvents = {
    writeCurrentTaskTransition: jest.fn().mockResolvedValue(undefined),
  };
  const executor = {
    resolveCandidateTargetUser: jest.fn((input: Record<string, unknown>) => {
      const candidate =
        typeof input.candidate === 'object' && input.candidate !== null
          ? (input.candidate as Record<string, unknown>)
          : {};
      return Promise.resolve(
        Number(
          input.targetUserId ??
            input.candidateUserId ??
            input.userId ??
            candidate.targetUserId ??
            candidate.candidateUserId ??
            candidate.userId,
        ),
      );
    }),
    executeToolAction: jest.fn(
      (_taskId: number, toolName: SocialAgentToolName) => {
        if (toolName === SocialAgentToolName.AddFriend) {
          return Promise.resolve({
            id: 'action_add_friend_1',
            toolName,
            status: 'succeeded',
            output: {
              id: '601',
              friendRequestId: '601',
              conversationId: 'conv-22',
            },
            error: null,
          });
        }
        if (toolName === SocialAgentToolName.SendMessage) {
          return Promise.resolve({
            id: 'action_send_message_1',
            toolName,
            status: 'succeeded',
            output: {
              id: 'msg-22',
              messageId: 'msg-22',
              conversationId: 'conv-22',
              candidate: { status: 'messaged' },
            },
            error: null,
          });
        }
        return Promise.resolve({
          id: 'action_send_candidate_message_1',
          toolName,
          status: 'succeeded',
          output: {
            id: 'msg-1',
            messageId: 'msg-1',
            conversationId: 'conv-1',
          },
          error: null,
        });
      },
    ),
  };
  const service = new SocialAgentCandidateActionService(
    taskRepo as never,
    eventRepo as never,
    approvals as never,
    executor as never,
    undefined,
    longTermMemory as never,
    l5Runtime as never,
    undefined,
    undefined,
    undefined,
    loopStateEvents as never,
    workoutOpenerDrafts as never,
    agentLoop as never,
  );
  return {
    agentLoop,
    approvals,
    eventRepo,
    executor,
    l5Runtime,
    longTermMemory,
    loopStateEvents,
    savedEvents,
    service,
    taskRepo,
    workoutOpenerDrafts,
    get task() {
      return task;
    },
  };
}

describe('SocialAgentCandidateActionService', () => {
  it('creates a send-message approval from an action request intent', async () => {
    const task = makeTask({
      memory: {
        shortTerm: {
          candidates: [
            {
              userId: 22,
              candidateUserId: 22,
              candidateRecordId: 501,
              nickname: '小林',
            },
          ],
        },
      },
    });
    const { approvals, loopStateEvents, service, taskRepo } = makeHarness(task);

    const approval = await service.createActionApproval({
      ownerUserId: 7,
      task,
      message: '帮我给她发消息',
      route: {
        intent: 'action_request',
        entities: {
          city: '',
          activityType: '',
          targetGender: '',
          timePreference: '',
          locationPreference: '',
        },
      },
    });

    expect(approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        agentTaskId: 101,
        type: 'send_message',
        actionType: 'send_invite',
        relatedCandidateId: 501,
      }),
    );
    expect(approval).toMatchObject({
      id: 9001,
      actionType: 'send_invite',
      riskLevel: 'high',
    });
    expect(taskRepo.save).toHaveBeenCalledWith(task);
    expect(loopStateEvents.writeCurrentTaskTransition).toHaveBeenCalledWith({
      task,
      publicLoopStage: 'contact_confirmation_required',
      workflowState: 'CONTACT_CONFIRMATION_REQUIRED',
    });
    expect(task.memory).toMatchObject({
      taskMemory: {
        currentTask: {
          objective: 'candidate_action',
          state: 'waiting_confirmation',
          stateReason: 'confirmation_required',
          waitingFor: 'action_confirmation',
          lastCompletedStep: 'approval_created',
        },
        pendingActions: [
          expect.objectContaining({
            id: 9001,
            actionType: 'send_invite',
            summary: '发送消息给小林',
            riskLevel: 'high',
          }),
        ],
      },
    });
  });

  it('does not create approval records for low-risk generic action requests', async () => {
    const task = makeTask();
    const { approvals, service, taskRepo } = makeHarness(task);

    const approval = await service.createActionApproval({
      ownerUserId: 7,
      task,
      message: '帮我想想下一步',
      route: {
        intent: 'action_request',
        entities: {
          city: '',
          activityType: '',
          targetGender: '',
          timePreference: '',
          locationPreference: '',
        },
      },
    });

    expect(approval).toBeNull();
    expect(approvals.create).not.toHaveBeenCalled();
    expect(taskRepo.save).not.toHaveBeenCalled();
  });

  it('creates an opener draft card without creating approval before the user sends it', async () => {
    const task = makeTask({
      memory: {
        workoutLoop: {
          stage: 'candidates_ready',
          socialRequestId: 301,
          publicIntentId: 'public-intent:workout-501',
          candidateCount: 1,
        },
      },
    });
    const { approvals, savedEvents, service } = makeHarness(task);

    const result = await service.createOpenerDraftFromCardAction(7, 101, {
      action: 'candidate.generate_opener',
      payload: {
        taskId: 101,
        targetUserId: 22,
        candidate: {
          userId: 22,
          candidateRecordId: 501,
          displayName: '小林',
          suggestedMessage: '今晚先在青岛大学操场轻松跑一段吗？',
        },
      },
    });

    expect(approvals.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      action: 'reply',
      pendingApproval: null,
      cards: [
        expect.objectContaining({
          type: 'candidate_card',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'social_match.candidate',
          status: 'ready',
          title: '小林 的开场白草稿',
          body: '今晚先在青岛大学操场轻松跑一段吗？',
          data: expect.objectContaining({
            schemaName: 'OpportunityCard',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'social_match.candidate',
            openerDraftReady: true,
            suggestedOpener: '今晚先在青岛大学操场轻松跑一段吗？',
          }),
          actions: [
            expect.objectContaining({
              label: '发送邀请',
              schemaAction: 'opener.confirm_send',
              requiresConfirmation: true,
              payload: expect.objectContaining({
                approvalRequired: true,
                checkpointRequired: true,
                resumeMode: 'resume_after_approval',
              }),
            }),
            expect.objectContaining({
              schemaAction: 'opener.regenerate',
            }),
            expect.objectContaining({
              schemaAction: 'opener.reject',
              requiresConfirmation: false,
            }),
          ],
        }),
      ],
    });
    expect(task.result).toMatchObject({
      cardActionDraft: expect.objectContaining({
        targetUserId: 22,
        message: '今晚先在青岛大学操场轻松跑一段吗？',
      }),
    });
    expect(task.memory).toMatchObject({
      workoutLoop: expect.objectContaining({
        stage: 'opener_ready',
        targetUserId: 22,
        candidateRecordId: 501,
        socialRequestId: 301,
      }),
      taskMemory: {
        currentTask: expect.objectContaining({
          state: 'messaging_candidate',
          stateReason: 'message_action',
          waitingFor: 'message_confirmation',
          lastCompletedStep: 'opener_draft_created',
        }),
        pendingActions: [],
      },
    });
    expect(savedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'step.completed',
        }),
        expect.objectContaining({
          eventType: 'social_agent.message.assistant',
        }),
      ]),
    );
  });

  it('uses the workout opener draft service before falling back to the template draft', async () => {
    const task = makeTask({
      memory: {
        workoutLoop: {
          stage: 'candidates_ready',
          socialRequestId: 301,
          publicIntentId: 'public-intent:workout-501',
          candidateCount: 1,
        },
      },
    });
    const workoutOpenerDrafts = {
      draft: jest
        .fn()
        .mockResolvedValue('看到你也喜欢轻松跑，今晚可以先站内聊聊节奏吗？'),
    };
    const { service } = makeHarness(task, workoutOpenerDrafts);

    const result = await service.createOpenerDraftFromCardAction(7, 101, {
      action: 'candidate.generate_opener',
      payload: {
        taskId: 101,
        targetUserId: 22,
        candidate: {
          userId: 22,
          candidateRecordId: 501,
          displayName: '小林',
          suggestedMessage: '今晚先在青岛大学操场轻松跑一段吗？',
        },
      },
    });

    expect(workoutOpenerDrafts.draft).toHaveBeenCalledWith({
      task,
      candidate: expect.objectContaining({
        displayName: '小林',
      }),
      payload: expect.objectContaining({
        taskId: 101,
        targetUserId: 22,
      }),
      fallbackDraft: '今晚先在青岛大学操场轻松跑一段吗？',
    });
    expect(result.cards?.[0]).toMatchObject({
      body: '看到你也喜欢轻松跑，今晚可以先站内聊聊节奏吗？',
      data: expect.objectContaining({
        suggestedOpener: '看到你也喜欢轻松跑，今晚可以先站内聊聊节奏吗？',
      }),
    });
    expect(task.result).toMatchObject({
      cardActionDraft: expect.objectContaining({
        message: '看到你也喜欢轻松跑，今晚可以先站内聊聊节奏吗？',
      }),
    });
  });

  it('routes workout opener drafting through AgentLoop brain runtime when available', async () => {
    const task = makeTask({
      memory: {
        workoutLoop: {
          stage: 'candidates_ready',
          socialRequestId: 301,
          publicIntentId: 'public-intent:workout-501',
          candidateCount: 1,
        },
      },
    });
    const workoutOpenerDrafts = {
      draft: jest
        .fn()
        .mockResolvedValue('看到你也想夜跑，可以先站内聊聊节奏吗？'),
    };
    const agentLoop = {
      execute: jest.fn(async (input: Record<string, unknown>) => {
        const brain = input.brain as {
          decide: (decisionInput: Record<string, unknown>) => Promise<{
            tool?: {
              agent: string;
              toolName: string;
              input: Record<string, unknown>;
            };
            done?: boolean;
            finalObservation?: Record<string, unknown>;
          }>;
        };
        const observations: Record<string, unknown>[] = [];
        const firstDecision = await brain.decide({
          loop: {},
          observations,
          remainingToolCalls: 2,
        });
        const runner = input.runner as (
          runnerInput: Record<string, unknown>,
        ) => Promise<Record<string, unknown>>;
        observations.push(
          await runner({
            runId: 'run-1',
            traceId: 'trace-1',
            taskId: task.id,
            agent: firstDecision.tool?.agent,
            toolName: firstDecision.tool?.toolName,
            input: firstDecision.tool?.input ?? {},
            attempt: 1,
          }),
        );
        const finalDecision = await brain.decide({
          loop: {},
          observations,
          remainingToolCalls: 1,
        });
        if (finalDecision.finalObservation) {
          observations.push(finalDecision.finalObservation);
        }
        return {
          loop: {},
          observations,
          answerBoundary: {
            fromObservationsOnly: true,
            requiresApproval: false,
            canContinue: true,
            status: 'ready',
          },
        };
      }),
    };
    const { service } = makeHarness(task, workoutOpenerDrafts, agentLoop);

    const result = await service.createOpenerDraftFromCardAction(7, 101, {
      action: 'candidate.generate_opener',
      payload: {
        taskId: 101,
        targetUserId: 22,
        candidate: {
          userId: 22,
          candidateRecordId: 501,
          displayName: '小林',
          suggestedMessage: '今晚先在青岛大学操场轻松跑一段吗？',
        },
      },
    });

    expect(agentLoop.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 101,
        goal: 'Workout agent drafts a safe opener before user send approval.',
        brain: expect.any(Object),
        maxToolCalls: 2,
      }),
    );
    expect(workoutOpenerDrafts.draft).toHaveBeenCalledTimes(1);
    expect(result.cards?.[0]).toMatchObject({
      body: '看到你也想夜跑，可以先站内聊聊节奏吗？',
      data: expect.objectContaining({
        suggestedOpener: '看到你也想夜跑，可以先站内聊聊节奏吗？',
      }),
    });
  });

  it('creates a send approval when the user clicks send on a low-risk opener draft', async () => {
    const task = makeTask({
      result: {
        cardActionDraft: {
          action: 'candidate.generate_opener',
          targetUserId: 22,
          candidateRecordId: 501,
          socialRequestId: 301,
          candidate: {
            userId: 22,
            candidateUserId: 22,
            candidateRecordId: 501,
            socialRequestId: 301,
            displayName: '小林',
          },
          message: '今晚先在青岛大学操场轻松跑一段吗？',
          idempotencyKey: 'opener-confirm-1',
        },
      },
      memory: {
        workoutLoop: {
          stage: 'opener_ready',
          socialRequestId: 301,
          publicIntentId: 'public-intent:workout-501',
          candidateCount: 1,
          targetUserId: 22,
          candidateRecordId: 501,
        },
        taskMemory: {
          pendingActions: [],
          candidateState: {
            recommendedIds: [],
            rejectedIds: [],
            savedIds: [],
            contactedIds: [],
          },
          activityState: { recommendedIds: [], rejectedIds: [] },
          activeEntities: {},
          stableProfileFacts: {},
          boundaries: [],
          preferences: [],
          misunderstandings: [],
          lastUserMessages: [],
          recentActions: [],
          updatedAt: '2026-06-06T00:00:00.000Z',
        },
      },
    });
    const { approvals, executor, savedEvents, service, taskRepo } =
      makeHarness(task);

    const result = await service.confirmOpenerSendFromCardAction(7, 101, {
      action: 'opener.confirm_send',
      idempotencyKey: 'opener-confirm-1',
      payload: {
        taskId: 101,
        targetUserId: 22,
      },
    });

    expect(executor.executeToolAction).not.toHaveBeenCalled();
    expect(approvals.approve).not.toHaveBeenCalled();
    expect(approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: ApprovalType.SendMessage,
        actionType: 'send_invite',
        relatedCandidateId: 501,
        payload: expect.objectContaining({
          source: 'agent_card_action',
          schemaAction: 'opener.confirm_send',
          targetUserId: 22,
          candidateUserId: 22,
          message: '今晚先在青岛大学操场轻松跑一段吗？',
          approvalRequired: true,
          checkpointRequired: true,
          resumeMode: 'resume_after_approval',
          idempotencyKey: 'opener-confirm-1',
          riskReasons: expect.arrayContaining([
            '这个动作会向真实用户发送消息',
            '发送前需要你确认语气和内容',
          ]),
        }),
        riskLevel: ApprovalRiskLevel.High,
      }),
    );
    expect(result).toMatchObject({
      action: 'await_confirmation',
      pendingApproval: expect.objectContaining({
        id: 9001,
        actionType: 'send_invite',
      }),
      cards: [
        expect.objectContaining({
          type: 'candidate_card',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'social_match.candidate',
          status: 'ready',
          title: '小林 的开场白草稿',
          data: expect.objectContaining({
            schemaName: 'OpportunityCard',
            openerDraftReady: true,
            targetUserId: 22,
            candidateRecordId: 501,
            socialRequestId: 301,
            suggestedOpener: '今晚先在青岛大学操场轻松跑一段吗？',
          }),
          actions: expect.arrayContaining([
            expect.objectContaining({
              schemaAction: 'opener.confirm_send',
              requiresConfirmation: true,
            }),
          ]),
        }),
      ],
      assistantMessage: '发送邀请前需要你确认。确认前不会触达对方。',
    });
    expect(taskRepo.save).toHaveBeenCalledWith(task);
    expect(task.result).toMatchObject({
      cardActionDraft: expect.objectContaining({
        action: 'opener.confirm_send',
        targetUserId: 22,
        candidateRecordId: 501,
        socialRequestId: 301,
        message: '今晚先在青岛大学操场轻松跑一段吗？',
        approvalId: 9001,
      }),
    });
    expect(task.memory).toMatchObject({
      workoutLoop: expect.objectContaining({
        stage: 'message_confirming',
        targetUserId: 22,
        candidateRecordId: 501,
        socialRequestId: 301,
        approvalId: 9001,
      }),
      taskMemory: {
        pendingActions: [
          expect.objectContaining({
            id: 9001,
            actionType: 'send_invite',
            type: ApprovalType.SendMessage,
            riskLevel: ApprovalRiskLevel.High,
          }),
        ],
        currentTask: expect.objectContaining({
          state: 'waiting_confirmation',
          stateReason: 'confirmation_required',
          waitingFor: 'message_confirmation',
          lastCompletedStep: 'opener_draft_created',
        }),
      },
    });
    expect(savedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'confirmation.requested',
          summary: 'Agent card action created opener send approval',
        }),
        expect.objectContaining({
          eventType: 'social_agent.message.assistant',
        }),
      ]),
    );
  });

  it('returns a schema-driven candidate detail card from view detail', async () => {
    const { savedEvents, service, task } = makeHarness();

    const result = await service.performCandidatePreferenceAction(7, 101, {
      action: 'candidate.view_detail',
      payload: {
        taskId: 101,
        candidate: {
          userId: 22,
          candidateUserId: 22,
          candidateRecordId: 501,
          socialRequestId: 301,
          displayName: '小林',
          city: '青岛',
          distanceLabel: '同城 3km 内',
          interests: ['跑步', '羽毛球'],
          matchReasons: ['运动时间接近', '都偏低压力社交'],
          suggestedOpener: '这周末想一起轻松跑一段吗？',
          safetyBoundary: '先站内沟通，确认后再邀请。',
        },
      },
    });

    expect(result).toMatchObject({
      action: 'reply',
      pendingApproval: null,
      cards: [
        expect.objectContaining({
          type: 'candidate_card',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'social_match.candidate',
          data: expect.objectContaining({
            schemaName: 'OpportunityCard',
            detailExpanded: true,
            displayName: '小林',
            targetUserId: 22,
            candidateRecordId: 501,
            socialRequestId: 301,
            opportunity: expect.objectContaining({
              name: '小林',
              area: '青岛',
              distanceLabel: '同城 3km 内',
              interests: ['跑步', '羽毛球'],
              reasons: ['运动时间接近', '都偏低压力社交'],
              suggestedOpener: '这周末想一起轻松跑一段吗？',
              safetyBoundary: '先站内沟通，确认后再邀请。',
              confirmedContext: [
                '公开可发现资料',
                '低风险站内沟通',
                '发送前确认',
              ],
            }),
          }),
        }),
      ],
    });
    const detailCard = result.cards?.[0];
    expect(detailCard?.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          schemaAction: 'candidate.view_detail',
          requiresConfirmation: false,
        }),
        expect.objectContaining({
          schemaAction: 'candidate.like',
          requiresConfirmation: false,
        }),
        expect.objectContaining({
          schemaAction: 'candidate.generate_opener',
          requiresConfirmation: false,
        }),
        expect.objectContaining({
          schemaAction: 'candidate.connect',
          label: '确认后邀请Ta',
          requiresConfirmation: true,
          payload: expect.objectContaining({
            approvalRequired: true,
            checkpointRequired: true,
            resumeMode: 'resume_after_approval',
            idempotencyKey: 'candidate-connect:101:22',
          }),
        }),
        expect.objectContaining({
          schemaAction: 'candidate.more_like_this',
          requiresConfirmation: false,
        }),
      ]),
    );
    expect(savedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'step.completed',
        }),
        expect.objectContaining({
          eventType: 'social_agent.message.assistant',
        }),
      ]),
    );
    expect(task.memory).toMatchObject({
      shortTerm: {
        lastCandidatePreference: expect.objectContaining({
          action: 'candidate.view_detail',
          targetUserId: 22,
        }),
      },
    });
  });

  it('sends a pending candidate message only after explicit confirmation', async () => {
    const task = makeTask({
      result: {
        cardActionDraft: {
          candidate: {
            userId: 22,
            candidateUserId: 22,
            candidateRecordId: 501,
            socialRequestId: 301,
            nickname: '小林',
          },
          message: '今晚先在青岛大学操场轻松跑一段吗？',
        },
      },
      memory: {
        workoutLoop: {
          stage: 'message_confirming',
          socialRequestId: 301,
          publicIntentId: 'public-intent:workout-501',
          candidateCount: 1,
          targetUserId: 22,
          candidateRecordId: 501,
          approvalId: 9001,
        },
        taskMemory: {
          pendingActions: [
            {
              id: 9001,
              actionType: 'send_candidate_message',
              type: 'send_message',
              summary: '发送开场白',
              riskLevel: 'high',
              at: '2026-06-06T00:00:00.000Z',
            },
          ],
          candidateState: {
            recommendedIds: [],
            rejectedIds: [],
            savedIds: [],
            contactedIds: [],
          },
          activityState: { recommendedIds: [], rejectedIds: [] },
          activeEntities: {},
          stableProfileFacts: {},
          boundaries: [],
          preferences: [],
          misunderstandings: [],
          lastUserMessages: [],
          recentActions: [],
          updatedAt: '2026-06-06T00:00:00.000Z',
        },
      },
    });
    const { approvals, executor, l5Runtime, service } = makeHarness(task);

    expect(
      await service.confirmPendingCandidateMessageIfRequested(
        7,
        task,
        '还不发',
      ),
    ).toBeNull();

    const result = await service.confirmPendingCandidateMessageIfRequested(
      7,
      task,
      '确认发送',
    );

    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.SendMessageToCandidate,
      expect.objectContaining({
        candidateUserId: 22,
        targetUserId: 22,
        message: '今晚先在青岛大学操场轻松跑一段吗？',
        candidateRecordId: 501,
        socialRequestId: 301,
        idempotencyKey: 'opener-send:101:22',
        metadata: expect.objectContaining({
          checkpointRequired: true,
          resumeMode: 'resume_after_approval',
        }),
      }),
      7,
    );
    expect(approvals.approve).toHaveBeenCalledWith(9001, 7);
    expect(approvals.approve.mock.invocationCallOrder[0]).toBeLessThan(
      executor.executeToolAction.mock.invocationCallOrder[0],
    );
    expect(result).toMatchObject({
      assistantMessage: '已确认发送给小林：今晚先在青岛大学操场轻松跑一段吗？',
      cards: [
        expect.objectContaining({
          schemaType: 'meet_loop.timeline',
          data: expect.objectContaining({
            schemaName: 'MeetLoopTimelineCard',
            candidateUserId: 22,
            loopStage: 'message_sent',
            messagePreview: '今晚先在青岛大学操场轻松跑一段吗？',
            connectionState: 'waiting_reply',
            waitingFor: 'counterpart_reply',
            nextRecoverableActions: expect.arrayContaining([
              'meet_loop.resume',
              'activity.modify_time',
              'activity.modify_location',
            ]),
            sideEffectPolicy: 'no_followup_without_user_confirmation',
          }),
        }),
      ],
    });
    expect(task.memory).toMatchObject({
      shortTerm: {
        candidateActions: {
          '22': expect.objectContaining({
            send: 'sent',
            conversationId: 'conv-1',
            messageId: 'msg-1',
          }),
        },
      },
      taskMemory: {
        pendingActions: [],
        currentTask: expect.objectContaining({
          objective: 'candidate_messaging',
          state: 'messaging_candidate',
          stateReason: 'message_action',
          waitingFor: 'candidate_reply',
          lastCompletedStep: 'message_sent',
        }),
      },
    });
    expect(l5Runtime.transitionMeetLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        agentTaskId: 101,
        candidateUserId: 22,
        stage: 'invite_sent',
        waitingFor: 'counterpart_reply',
        state: expect.objectContaining({
          candidateUserId: 22,
          targetUserId: 22,
          candidateRecordId: 501,
          socialRequestId: 301,
          conversationId: 'conv-1',
          status: 'message_sent',
          loopStage: 'invite_sent',
          connectionState: 'waiting_reply',
          nextRecoverableActions: expect.arrayContaining([
            'meet_loop.resume',
            'activity.modify_time',
            'activity.modify_location',
          ]),
          sideEffectPolicy: 'no_followup_without_user_confirmation',
          publicPlaceOnly: true,
          noPreciseLocation: true,
        }),
      }),
    );
  });

  it('confirms an opener card action from the stored approval without re-routing through chat text', async () => {
    const task = makeTask({
      result: {
        cardActionDraft: {
          approvalId: 9001,
          targetUserId: 22,
          candidate: {
            userId: 22,
            candidateUserId: 22,
            candidateRecordId: 501,
            socialRequestId: 301,
            displayName: '小林',
          },
          message: '今晚先在青岛大学操场轻松跑一段吗？',
        },
      },
      memory: {
        workoutLoop: {
          stage: 'message_confirming',
          socialRequestId: 301,
          publicIntentId: 'public-intent:workout-501',
          candidateCount: 1,
          targetUserId: 22,
          candidateRecordId: 501,
          approvalId: 9001,
        },
        taskMemory: {
          pendingActions: [
            {
              id: 9001,
              actionType: 'send_candidate_message',
              type: 'send_message',
              summary: '发送开场白',
              riskLevel: 'high',
              at: '2026-06-06T00:00:00.000Z',
            },
          ],
          candidateState: {
            recommendedIds: [],
            rejectedIds: [],
            savedIds: [],
            contactedIds: [],
          },
          activityState: { recommendedIds: [], rejectedIds: [] },
          activeEntities: {},
          stableProfileFacts: {},
          boundaries: [],
          preferences: [],
          misunderstandings: [],
          lastUserMessages: [],
          recentActions: [],
          updatedAt: '2026-06-06T00:00:00.000Z',
        },
      },
    });
    const { approvals, executor, l5Runtime, savedEvents, service } =
      makeHarness(task);

    const result = await service.confirmOpenerSendFromCardAction(7, 101, {
      action: 'opener.confirm_send',
      idempotencyKey: 'opener-confirm-1',
      payload: {
        taskId: 101,
        approvalId: 9001,
      },
    });

    expect(approvals.approve).toHaveBeenCalledWith(9001, 7);
    expect(approvals.approve.mock.invocationCallOrder[0]).toBeLessThan(
      executor.executeToolAction.mock.invocationCallOrder[0],
    );
    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.SendMessageToCandidate,
      expect.objectContaining({
        candidateUserId: 22,
        targetUserId: 22,
        message: '今晚先在青岛大学操场轻松跑一段吗？',
        candidateRecordId: 501,
        socialRequestId: 301,
        idempotencyKey: 'opener-confirm-1',
        metadata: expect.objectContaining({
          confirmationSource: 'agent_card_action',
          pendingApprovalId: 9001,
          schemaAction: 'opener.confirm_send',
        }),
      }),
      7,
      { signal: null },
    );
    expect(result).toMatchObject({
      action: 'reply',
      pendingApproval: null,
      cards: [
        expect.objectContaining({
          type: 'meet_loop_timeline',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'meet_loop.timeline',
          data: expect.objectContaining({
            schemaName: 'MeetLoopTimelineCard',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'meet_loop.timeline',
            candidateUserId: 22,
            loopStage: 'message_sent',
            messageActionId: expect.any(String),
            messagePreview: '今晚先在青岛大学操场轻松跑一段吗？',
            connectionState: 'waiting_reply',
            waitingFor: 'counterpart_reply',
            sideEffectPolicy: 'no_followup_without_user_confirmation',
            timeline: expect.objectContaining({
              title: '约练进展',
              nextAction: expect.stringContaining('等待对方回复'),
            }),
          }),
          actions: expect.arrayContaining([
            expect.objectContaining({
              schemaAction: 'meet_loop.resume',
              requiresConfirmation: true,
            }),
            expect.objectContaining({
              schemaAction: 'meet_loop.reschedule',
              requiresConfirmation: true,
            }),
          ]),
        }),
      ],
      assistantMessage: '已确认发送给小林：今晚先在青岛大学操场轻松跑一段吗？',
    });
    expect(task.memory).toMatchObject({
      workoutLoop: expect.objectContaining({
        stage: 'messages_handoff',
        targetUserId: 22,
        candidateRecordId: 501,
        socialRequestId: 301,
        conversationId: 'conv-1',
        messageActionId: 'action_send_candidate_message_1',
      }),
      taskMemory: {
        pendingActions: [],
        currentTask: expect.objectContaining({
          waitingFor: 'candidate_reply',
          lastCompletedStep: 'message_sent',
        }),
      },
    });
    expect(l5Runtime.transitionMeetLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        agentTaskId: 101,
        candidateUserId: 22,
        stage: 'invite_sent',
        waitingFor: 'counterpart_reply',
        state: expect.objectContaining({
          candidateUserId: 22,
          targetUserId: 22,
          candidateRecordId: 501,
          socialRequestId: 301,
          conversationId: 'conv-1',
          status: 'message_sent',
          loopStage: 'invite_sent',
          connectionState: 'waiting_reply',
          nextRecoverableActions: expect.arrayContaining([
            'meet_loop.resume',
            'activity.modify_time',
            'activity.modify_location',
          ]),
          sideEffectPolicy: 'no_followup_without_user_confirmation',
          publicPlaceOnly: true,
          noPreciseLocation: true,
        }),
      }),
    );
    expect(savedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'confirmation.received',
          actor: 'user',
        }),
        expect.objectContaining({
          eventType: 'social_agent.message.assistant',
        }),
      ]),
    );
  });

  it('treats repeated opener confirmation as an idempotent no-op without sending twice', async () => {
    const task = makeTask({
      result: {
        cardActionDraft: {
          approvalId: 9001,
          targetUserId: 22,
          candidate: {
            userId: 22,
            candidateUserId: 22,
            candidateRecordId: 501,
            socialRequestId: 301,
            displayName: '小林',
          },
          message: '今晚先在青岛大学操场轻松跑一段吗？',
        },
      },
      memory: {
        taskMemory: {
          pendingActions: [
            {
              id: 9001,
              actionType: 'send_candidate_message',
              type: 'send_message',
              summary: '发送开场白',
              riskLevel: 'high',
              at: '2026-06-06T00:00:00.000Z',
            },
          ],
          candidateState: {
            recommendedIds: [],
            rejectedIds: [],
            savedIds: [],
            contactedIds: [],
          },
          activityState: { recommendedIds: [], rejectedIds: [] },
          activeEntities: {},
          stableProfileFacts: {},
          boundaries: [],
          preferences: [],
          misunderstandings: [],
          lastUserMessages: [],
          recentActions: [],
          updatedAt: '2026-06-06T00:00:00.000Z',
        },
      },
    });
    const { approvals, executor, service } = makeHarness(task);

    const first = await service.confirmOpenerSendFromCardAction(7, 101, {
      action: 'opener.confirm_send',
      idempotencyKey: 'opener-confirm-1',
      payload: {
        taskId: 101,
        approvalId: 9001,
      },
    });
    const repeated = await service.confirmOpenerSendFromCardAction(7, 101, {
      action: 'opener.confirm_send',
      idempotencyKey: 'opener-confirm-1',
      payload: {
        taskId: 101,
        approvalId: 9001,
      },
    });

    expect(first.assistantMessage).toContain('已确认发送给小林');
    expect(repeated.assistantMessage).toContain('不会重复发送');
    expect(repeated.cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          schemaType: 'meet_loop.timeline',
          data: expect.objectContaining({
            connectionState: 'waiting_reply',
            sideEffectPolicy: 'idempotent_no_duplicate_send',
          }),
        }),
      ]),
    );
    expect(approvals.approve).toHaveBeenCalledTimes(1);
    expect(executor.executeToolAction).toHaveBeenCalledTimes(1);
  });

  it('does not send an opener card action if the saved approval cannot be approved', async () => {
    const task = makeTask({
      result: {
        cardActionDraft: {
          approvalId: 9001,
          targetUserId: 22,
          candidate: {
            userId: 22,
            candidateUserId: 22,
            candidateRecordId: 501,
            socialRequestId: 301,
            displayName: '小林',
          },
          message: '今晚先在青岛大学操场轻松跑一段吗？',
        },
      },
      memory: {
        taskMemory: {
          pendingActions: [
            {
              id: 9001,
              actionType: 'send_candidate_message',
              type: 'send_message',
              summary: '发送开场白',
              riskLevel: 'high',
              at: '2026-06-06T00:00:00.000Z',
            },
          ],
          candidateState: {
            recommendedIds: [],
            rejectedIds: [],
            savedIds: [],
            contactedIds: [],
          },
          activityState: { recommendedIds: [], rejectedIds: [] },
          activeEntities: {},
          stableProfileFacts: {},
          boundaries: [],
          preferences: [],
          misunderstandings: [],
          lastUserMessages: [],
          recentActions: [],
          updatedAt: '2026-06-06T00:00:00.000Z',
        },
      },
    });
    const { approvals, executor, service } = makeHarness(task);
    approvals.approve.mockRejectedValueOnce(new Error('approval expired'));

    await expect(
      service.confirmOpenerSendFromCardAction(7, 101, {
        action: 'opener.confirm_send',
        payload: {
          taskId: 101,
          approvalId: 9001,
        },
      }),
    ).rejects.toThrow('approval expired');

    expect(approvals.approve).toHaveBeenCalledWith(9001, 7);
    expect(executor.executeToolAction).not.toHaveBeenCalled();
  });

  it('rejects an opener send from the approval card without contacting the candidate', async () => {
    const task = makeTask({
      result: {
        cardActionDraft: {
          approvalId: 9001,
          targetUserId: 22,
          candidate: {
            userId: 22,
            candidateUserId: 22,
            candidateRecordId: 501,
            socialRequestId: 301,
            displayName: '小林',
          },
          message: '今晚先在青岛大学操场轻松跑一段吗？',
        },
      },
      memory: {
        taskMemory: {
          pendingActions: [
            {
              id: 9001,
              actionType: 'send_candidate_message',
              type: 'send_message',
              summary: '发送开场白',
              riskLevel: 'high',
              at: '2026-06-06T00:00:00.000Z',
            },
          ],
          candidateState: {
            recommendedIds: [],
            rejectedIds: [],
            savedIds: [],
            contactedIds: [],
          },
          activityState: { recommendedIds: [], rejectedIds: [] },
          activeEntities: {},
          stableProfileFacts: {},
          boundaries: [],
          preferences: [],
          misunderstandings: [],
          lastUserMessages: [],
          recentActions: [],
          updatedAt: '2026-06-06T00:00:00.000Z',
        },
      },
    });
    const { approvals, executor, savedEvents, service } = makeHarness(task);

    const result = await service.rejectOpenerSendFromCardAction(7, 101, {
      action: 'opener.reject',
      payload: {
        taskId: 101,
        approvalId: 9001,
      },
    });

    expect(approvals.reject).toHaveBeenCalledWith(9001, 7);
    expect(executor.executeToolAction).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      action: 'reply',
      pendingApproval: null,
      cards: [],
      assistantMessage: expect.stringContaining('已取消这次发送'),
    });
    expect(result.assistantMessage).toContain('未联系对方');
    expect(task.result).toMatchObject({
      cardActionDraft: expect.objectContaining({
        status: 'rejected',
        rejectedAt: expect.any(String),
      }),
    });
    expect(task.memory).toMatchObject({
      taskMemory: {
        pendingActions: [],
        currentTask: expect.objectContaining({
          state: 'showing_candidates',
          waitingFor: 'user_next_instruction',
          lastCompletedStep: 'message_send_rejected',
        }),
      },
    });
    expect(savedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'confirmation.received',
          actor: 'user',
          summary: 'Agent card action rejected opener send',
        }),
        expect.objectContaining({
          eventType: 'social_agent.message.assistant',
        }),
      ]),
    );
  });

  it('regenerates an opener draft without creating a new approval until the user sends it', async () => {
    const previousMessage = '今晚先在青岛大学操场轻松跑一段吗？';
    const task = makeTask({
      result: {
        cardActionDraft: {
          approvalId: 9001,
          targetUserId: 22,
          candidate: {
            userId: 22,
            candidateUserId: 22,
            candidateRecordId: 501,
            socialRequestId: 301,
            displayName: '小林',
            interests: ['跑步'],
            timePreference: '周末下午',
            city: '青岛',
          },
          message: previousMessage,
        },
      },
      memory: {
        taskMemory: {
          pendingActions: [
            {
              id: 9001,
              actionType: 'send_candidate_message',
              type: 'send_message',
              summary: '发送开场白',
              riskLevel: 'high',
              at: '2026-06-06T00:00:00.000Z',
            },
          ],
          candidateState: {
            recommendedIds: [],
            rejectedIds: [],
            savedIds: [],
            contactedIds: [],
          },
          activityState: { recommendedIds: [], rejectedIds: [] },
          activeEntities: {},
          stableProfileFacts: {},
          boundaries: [],
          preferences: [],
          misunderstandings: [],
          lastUserMessages: [],
          recentActions: [],
          updatedAt: '2026-06-06T00:00:00.000Z',
        },
      },
    });
    const { approvals, executor, savedEvents, service } = makeHarness(task);

    const result = await service.regenerateOpenerDraftFromCardAction(7, 101, {
      action: 'opener.regenerate',
      payload: {
        taskId: 101,
        approvalId: 9001,
        message: previousMessage,
      },
    });

    expect(approvals.reject).toHaveBeenCalledWith(9001, 7);
    expect(approvals.create).not.toHaveBeenCalled();
    expect(executor.executeToolAction).not.toHaveBeenCalled();
    expect(task.result).toMatchObject({
      cardActionDraft: expect.objectContaining({
        action: 'opener.regenerate',
        targetUserId: 22,
        previousMessage,
        regeneratedFromApprovalId: 9001,
        message: expect.stringContaining('站内确认时间和公共地点'),
      }),
    });
    expect(
      (task.result as { cardActionDraft?: { message?: string } })
        .cardActionDraft?.message,
    ).not.toBe(previousMessage);
    expect(result).toMatchObject({
      action: 'reply',
      pendingApproval: null,
      assistantMessage: expect.stringContaining('只有你点发送邀请并确认后'),
      cards: [
        expect.objectContaining({
          type: 'candidate_card',
          schemaType: 'social_match.candidate',
          body: expect.stringContaining('站内确认时间和公共地点'),
          actions: [
            expect.objectContaining({
              schemaAction: 'opener.confirm_send',
              requiresConfirmation: true,
            }),
            expect.objectContaining({
              schemaAction: 'opener.regenerate',
              payload: expect.objectContaining({
                previousMessage,
              }),
            }),
            expect.objectContaining({
              schemaAction: 'opener.reject',
              requiresConfirmation: false,
            }),
          ],
        }),
      ],
    });
    expect(task.memory).toMatchObject({
      taskMemory: {
        pendingActions: [],
        currentTask: expect.objectContaining({
          state: 'messaging_candidate',
          stateReason: 'message_action',
          waitingFor: 'message_confirmation',
          lastCompletedStep: 'opener_draft_created',
        }),
      },
    });
    expect(savedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'step.completed',
          summary: 'Agent card action regenerated opener draft',
        }),
        expect.objectContaining({
          eventType: 'social_agent.message.assistant',
        }),
      ]),
    );
  });

  it('saves a persisted candidate through the SaveCandidate tool', async () => {
    const { executor, service } = makeHarness();

    await service.saveCandidate(7, 101, {
      socialRequestId: 301,
      candidateRecordId: 501,
      targetUserId: 22,
    });

    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.SaveCandidate,
      expect.objectContaining({
        candidateRecordId: 501,
        socialRequestId: 301,
        targetUserId: 22,
      }),
      7,
    );
  });

  it('records candidate.like from a schema card action through the SaveCandidate tool', async () => {
    const { executor, savedEvents, service, task } = makeHarness();

    const result = await service.performCandidatePreferenceAction(7, 101, {
      action: 'candidate.like',
      payload: {
        taskId: 101,
        candidateRecordId: 501,
        socialRequestId: 301,
        targetUserId: 22,
        candidate: {
          userId: 22,
          candidateRecordId: 501,
          socialRequestId: 301,
          displayName: '小林',
          reasons: ['都偏好晚上跑步'],
        },
      },
    });

    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.SaveCandidate,
      expect.objectContaining({
        candidateRecordId: 501,
        socialRequestId: 301,
        targetUserId: 22,
      }),
      7,
    );
    expect(result.assistantMessage).toContain('已收藏 小林');
    expect(task.memory).toMatchObject({
      shortTerm: {
        candidateActions: {
          '22': expect.objectContaining({
            save: 'saved',
          }),
        },
        lastCandidatePreference: expect.objectContaining({
          action: 'candidate.like',
          targetUserId: 22,
        }),
      },
      taskMemory: {
        candidateState: expect.objectContaining({
          savedIds: [22],
        }),
      },
    });
    expect(savedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'step.completed',
          actor: 'user',
        }),
        expect.objectContaining({
          eventType: 'social_agent.message.assistant',
        }),
      ]),
    );
  });

  it.each([
    ['candidate.skip' as const, '已跳过 小林', 'candidate_preference_recorded'],
    [
      'candidate.more_like_this' as const,
      '继续找更多类似机会',
      'candidate_preference_recorded',
    ],
  ])(
    'handles %s as a deterministic card action without rerouting chat text',
    async (action, expectedMessage, expectedStep) => {
      const { executor, service, task } = makeHarness();

      const result = await service.performCandidatePreferenceAction(7, 101, {
        action,
        payload: {
          taskId: 101,
          targetUserId: 22,
          candidate: {
            userId: 22,
            candidateRecordId: 501,
            displayName: '小林',
            reasons: ['都偏好晚上跑步'],
            risk: { warnings: ['首次见面建议选择公共操场'] },
          },
        },
      });

      expect(executor.executeToolAction).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        action: 'reply',
        cards: [],
      });
      expect(result.assistantMessage).toContain(expectedMessage);
      expect(task.memory).toMatchObject({
        shortTerm: {
          lastCandidatePreference: expect.objectContaining({
            action,
            targetUserId: 22,
          }),
          currentStep: expect.objectContaining({
            id: action,
            status: 'done',
          }),
        },
      });
      if (action === 'candidate.skip') {
        expect(task.memory).toMatchObject({
          taskMemory: {
            candidateState: expect.objectContaining({
              rejectedIds: [22],
            }),
          },
        });
      }
      if (action === 'candidate.more_like_this') {
        expect(task.memory).toMatchObject({
          taskMemory: {
            currentTask: expect.objectContaining({
              shouldSearchNow: true,
              waitingFor: 'more_candidates',
              lastCompletedStep: expectedStep,
            }),
          },
        });
      }
    },
  );

  it('creates a contact approval before connecting a candidate', async () => {
    const { approvals, executor, longTermMemory, savedEvents, service, task } =
      makeHarness();

    const result = await service.connectCandidate(7, 101, {
      socialRequestId: 301,
      candidateRecordId: 501,
      targetUserId: 22,
    });

    expect(executor.executeToolAction).not.toHaveBeenCalled();
    expect(approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'contact_request',
        actionType: 'connect_candidate',
        relatedCandidateId: 501,
        relatedSocialRequestId: 301,
        payload: expect.objectContaining({
          targetUserId: 22,
          candidateRecordId: 501,
          socialRequestId: 301,
          approvalRequired: true,
          checkpointRequired: true,
          resumeMode: 'resume_after_approval',
          idempotencyKey: 'candidate-connect:101:22',
        }),
      }),
    );
    expect(result).toMatchObject({
      success: true,
      taskId: 101,
      targetUserId: 22,
      candidateUserId: 22,
      status: 'pending_approval',
      following: false,
      approvalId: 9001,
      requiresApproval: true,
      friendAction: {
        success: true,
        status: 'pending_approval',
        targetUserId: 22,
        candidateUserId: 22,
        following: false,
      },
      toolCall: expect.objectContaining({
        toolName: SocialAgentToolName.AddFriend,
        status: 'succeeded',
      }),
    });
    expect(task.memory).toMatchObject({
      shortTerm: {
        candidateActions: {
          '22': expect.objectContaining({
            connect: 'pendingApproval',
            candidateRecordId: 501,
            socialRequestId: 301,
          }),
        },
      },
      taskMemory: {
        pendingActions: [
          expect.objectContaining({
            id: 9001,
            type: 'contact_request',
            actionType: 'connect_candidate',
          }),
        ],
      },
    });
    expect(savedEvents).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'confirmation.received',
        }),
      ]),
    );
    expect(longTermMemory.summarizeTask).not.toHaveBeenCalled();
  });

  it('reuses a pending connect_candidate approval on duplicate clicks', async () => {
    const { approvals, executor, service, taskRepo } = makeHarness();

    const first = await service.connectCandidate(7, 101, {
      socialRequestId: 301,
      candidateRecordId: 501,
      targetUserId: 22,
      idempotencyKey: 'candidate-connect:101:22',
    });
    const repeated = await service.connectCandidate(7, 101, {
      socialRequestId: 301,
      candidateRecordId: 501,
      targetUserId: 22,
      idempotencyKey: 'candidate-connect:101:22',
    });

    expect(first).toMatchObject({
      status: 'pending_approval',
      approvalId: 9001,
      requiresApproval: true,
    });
    expect(repeated).toMatchObject({
      status: 'pending_approval',
      approvalId: 9001,
      requiresApproval: true,
      toolCall: expect.objectContaining({
        output: expect.objectContaining({
          idempotentReuse: true,
        }),
      }),
    });
    expect(approvals.create).toHaveBeenCalledTimes(1);
    expect(executor.executeToolAction).not.toHaveBeenCalled();
    expect(taskRepo.save).toHaveBeenCalledTimes(1);
  });

  it('wraps connect_candidate card actions as an approval-first assistant route result', async () => {
    const { approvals, executor, l5Runtime, service } = makeHarness();

    const result = await service.connectCandidateFromCardAction(7, 101, {
      action: 'connect_candidate',
      payload: {
        socialRequestId: 301,
        candidateRecordId: 501,
        targetUserId: 22,
      },
    });

    expect(executor.executeToolAction).not.toHaveBeenCalled();
    expect(approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'contact_request',
        actionType: 'connect_candidate',
        payload: expect.objectContaining({
          targetUserId: 22,
          candidateRecordId: 501,
          socialRequestId: 301,
          checkpointRequired: true,
          resumeMode: 'resume_after_approval',
        }),
      }),
    );
    expect(result).toMatchObject({
      intent: 'action_request',
      action: 'await_confirmation',
      cards: [
        expect.objectContaining({
          type: 'candidate_card',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'social_match.candidate',
          data: expect.objectContaining({
            schemaName: 'OpportunityCard',
            targetUserId: 22,
            candidateUserId: 22,
            candidateRecordId: 501,
            socialRequestId: 301,
          }),
          actions: expect.arrayContaining([
            expect.objectContaining({
              schemaAction: 'candidate.connect',
              requiresConfirmation: true,
            }),
          ]),
        }),
      ],
      pendingApproval: expect.objectContaining({
        id: 9001,
        type: 'contact_request',
        actionType: 'connect_candidate',
      }),
      assistantMessage: expect.stringContaining('还需要你确认'),
    });
    expect(l5Runtime.transitionMeetLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        agentTaskId: 101,
        candidateUserId: 22,
        stage: 'invite_sent',
        waitingFor: 'invite_confirmation',
        state: expect.objectContaining({
          candidateRecordId: 501,
          socialRequestId: 301,
          status: 'pending_approval',
          loopStage: 'invite_sent',
          publicPlaceOnly: true,
          noPreciseLocation: true,
        }),
      }),
    );
  });

  it('wraps pending connect_candidate card actions with pending approval metadata', async () => {
    const { approvals, executor, l5Runtime, service, task } = makeHarness();
    approvals.create.mockResolvedValueOnce({
      id: 9901,
      type: ApprovalType.ContactRequest,
      actionType: 'connect_candidate',
      summary: '加好友并聊天：这位用户',
      riskLevel: ApprovalRiskLevel.Medium,
      payload: {
        source: 'candidate_opportunity_card',
        taskId: 101,
        targetUserId: 22,
        candidateUserId: 22,
        candidateRecordId: 501,
        socialRequestId: 301,
        idempotencyKey: 'candidate-connect:101:22',
        checkpointRequired: true,
        resumeMode: 'resume_after_approval',
      },
      expiresAt: new Date('2026-06-06T00:00:00.000Z'),
    });

    const result = await service.connectCandidateFromCardAction(7, 101, {
      action: 'connect_candidate',
      payload: {
        socialRequestId: 301,
        candidateRecordId: 501,
        targetUserId: 22,
        opportunityId: 'opportunity:101:22',
        idempotencyKey: 'candidate-connect:101:22',
        approvalRequired: true,
        checkpointRequired: true,
        resumeMode: 'resume_after_approval',
        schemaAction: 'candidate.connect',
        sourceStepId: 'step-candidate-connect-1',
        safetyBoundary: '第一次建议选择公共场所，先站内沟通。',
        suggestedOpener: '周末下午可以先在公共路线轻松跑一圈。',
        riskLevel: 'high',
        riskReasons: ['这一步会联系真实用户', '发送邀请前必须由你确认'],
      },
    });

    expect(executor.executeToolAction).not.toHaveBeenCalled();
    expect(approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'contact_request',
        actionType: 'connect_candidate',
        payload: expect.objectContaining({
          source: 'candidate_opportunity_card',
          opportunityId: 'opportunity:101:22',
          approvalRequired: true,
          checkpointRequired: true,
          resumeMode: 'resume_after_approval',
          schemaAction: 'candidate.connect',
          safetyBoundary: '第一次建议选择公共场所，先站内沟通。',
          suggestedOpener: '周末下午可以先在公共路线轻松跑一圈。',
        }),
      }),
    );

    expect(result).toMatchObject({
      action: 'await_confirmation',
      cards: [
        expect.objectContaining({
          type: 'candidate_card',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'social_match.candidate',
          data: expect.objectContaining({
            schemaName: 'OpportunityCard',
            targetUserId: 22,
            candidateUserId: 22,
            candidateRecordId: 501,
            socialRequestId: 301,
          }),
          actions: expect.arrayContaining([
            expect.objectContaining({
              schemaAction: 'candidate.connect',
              requiresConfirmation: true,
            }),
          ]),
        }),
      ],
      pendingApproval: expect.objectContaining({
        id: 9901,
        type: 'contact_request',
        actionType: 'connect_candidate',
        riskLevel: 'high',
        payload: expect.objectContaining({
          idempotencyKey: 'candidate-connect:101:22',
          checkpointRequired: true,
          resumeMode: 'resume_after_approval',
        }),
      }),
      assistantMessage: expect.stringContaining('还需要你确认'),
    });
    expect(task.memory).toMatchObject({
      taskMemory: {
        pendingActions: [
          expect.objectContaining({
            id: 9901,
            actionType: 'connect_candidate',
            payload: expect.objectContaining({
              source: 'candidate_opportunity_card',
              taskId: 101,
              targetUserId: 22,
              candidateUserId: 22,
              candidateRecordId: 501,
              socialRequestId: 301,
              approvalId: 9901,
              toolCallId: 'approval_connect_candidate:101:22',
              actionType: 'connect_candidate',
              sideEffect: 'connect_candidate',
              schemaAction: 'candidate.connect',
              approvalRequired: true,
              checkpointRequired: true,
              checkpointAction: 'resume',
              resumeMode: 'resume_after_approval',
              resumeIdempotencyKey: 'candidate-connect:101:22',
              sourceStepId: 'step-candidate-connect-1',
              idempotencyKey: 'candidate-connect:101:22',
              opportunityId: 'opportunity:101:22',
              safetyBoundary: '第一次建议选择公共场所，先站内沟通。',
              suggestedOpener: '周末下午可以先在公共路线轻松跑一圈。',
              riskLevel: 'high',
              riskReasons: ['这一步会联系真实用户', '发送邀请前必须由你确认'],
              auditEvent: 'social_agent.candidate.connect.approval_required',
            }),
          }),
        ],
      },
    });
    expect(l5Runtime.transitionMeetLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        agentTaskId: 101,
        candidateUserId: 22,
        stage: 'invite_sent',
        waitingFor: 'invite_confirmation',
        state: expect.objectContaining({
          candidateRecordId: 501,
          socialRequestId: 301,
          status: 'pending_approval',
          loopStage: 'invite_sent',
        }),
      }),
    );
  });

  it('persists pending approval state when connecting a candidate requires confirmation', async () => {
    const { executor, longTermMemory, savedEvents, service, task } =
      makeHarness();

    const result = await service.connectCandidate(7, 101, {
      socialRequestId: 301,
      candidateRecordId: 501,
      targetUserId: 22,
    });

    expect(result).toMatchObject({
      success: true,
      status: 'pending_approval',
      following: false,
      approvalId: 9001,
      requiresApproval: true,
      message: '加好友并聊天需要你确认',
      friendAction: {
        status: 'pending_approval',
        targetUserId: 22,
        following: false,
      },
    });
    expect(task.memory).toMatchObject({
      shortTerm: {
        candidateActions: {
          '22': expect.objectContaining({
            connect: 'pendingApproval',
            candidateRecordId: 501,
            socialRequestId: 301,
          }),
        },
      },
      taskMemory: {
        currentTask: expect.objectContaining({
          objective: 'candidate_messaging',
          state: 'waiting_confirmation',
          stateReason: 'confirmation_required',
          waitingFor: 'connect_confirmation',
          lastCompletedStep: 'connect_approval_created',
        }),
        pendingActions: [
          expect.objectContaining({
            id: 9001,
            type: 'contact_request',
            actionType: 'connect_candidate',
            summary: '加好友并聊天：这位用户',
            riskLevel: 'high',
          }),
        ],
      },
    });
    expect(savedEvents).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'confirmation.received',
        }),
      ]),
    );
    expect(executor.executeToolAction).not.toHaveBeenCalled();
    expect(longTermMemory.summarizeTask).not.toHaveBeenCalled();
  });

  it('resolves nested candidate user ids when connecting from a card payload', async () => {
    const { approvals, executor, service } = makeHarness();

    await service.connectCandidate(7, 101, {
      socialRequestId: 301,
      candidateRecordId: 501,
      candidate: { candidateUserId: 23 },
    });

    expect(executor.executeToolAction).not.toHaveBeenCalled();
    expect(approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'contact_request',
        actionType: 'connect_candidate',
        payload: expect.objectContaining({
          targetUserId: 23,
          candidateRecordId: 501,
          socialRequestId: 301,
        }),
      }),
    );
  });

  it('surfaces send-message tool failures to callers', async () => {
    const { executor, service } = makeHarness();
    executor.executeToolAction.mockResolvedValueOnce({
      id: 'action_send_message_1',
      toolName: SocialAgentToolName.SendMessage,
      status: 'failed',
      output: undefined,
      error: { message: 'Mongo conversation write failed' },
    } as never);

    await expect(
      service.sendCandidateMessage(7, 101, {
        targetUserId: 22,
        message: '你好，今晚一起跑步吗？',
      }),
    ).rejects.toThrow('Mongo conversation write failed');
  });

  it('returns normalized send candidate message success details', async () => {
    const { service, task } = makeHarness();

    const result = await service.sendCandidateMessage(7, 101, {
      targetUserId: 22,
      candidateUserId: 22,
      message: 'hello, run tonight?',
    });

    expect(result).toMatchObject({
      success: true,
      taskId: 101,
      targetUserId: 22,
      candidateUserId: 22,
      messageId: 'msg-22',
      conversationId: 'conv-22',
      status: 'sent',
      candidateStatus: 'messaged',
      messageAction: {
        status: 'sent',
        conversationId: 'conv-22',
        messageId: 'msg-22',
      },
      toolCall: expect.objectContaining({
        id: 'action_send_message_1',
        status: 'succeeded',
      }),
    });
    expect(task.memory).toMatchObject({
      shortTerm: {
        candidateActions: {
          '22': expect.objectContaining({
            send: 'sent',
            conversationId: 'conv-22',
            messageId: 'msg-22',
          }),
        },
      },
    });
  });

  it('persists pending approval state when direct candidate message requires confirmation', async () => {
    const { executor, service, task } = makeHarness();
    executor.executeToolAction.mockResolvedValueOnce({
      id: 'action_send_message_pending_1',
      toolName: SocialAgentToolName.SendMessage,
      status: 'succeeded',
      output: {
        status: 'pending_approval',
        requiresApproval: true,
        approvalId: 501,
        candidate: { status: 'pending_approval' },
      },
      error: null,
    } as never);

    const result = await service.sendCandidateMessage(7, 101, {
      targetUserId: 22,
      candidateUserId: 22,
      candidateRecordId: 601,
      socialRequestId: 301,
      message: '今晚先在青岛大学操场轻松跑一段吗？',
    });

    expect(result).toMatchObject({
      success: true,
      status: 'pending_approval',
      approvalId: 501,
      requiresApproval: true,
      message: '发送消息需要你确认',
      messageAction: {
        status: 'pending_approval',
      },
    });
    expect(task.memory).toMatchObject({
      shortTerm: {
        candidateActions: {
          '22': expect.objectContaining({
            send: 'pendingApproval',
            candidateRecordId: 601,
            socialRequestId: 301,
          }),
        },
      },
      taskMemory: {
        currentTask: expect.objectContaining({
          objective: 'candidate_messaging',
          state: 'waiting_confirmation',
          stateReason: 'confirmation_required',
          waitingFor: 'message_confirmation',
          lastCompletedStep: 'message_approval_created',
        }),
        pendingActions: [
          expect.objectContaining({
            id: 501,
            type: 'send_message',
            actionType: 'send_invite',
            summary: '发送消息给这位用户',
            riskLevel: 'high',
          }),
        ],
      },
    });
  });
});
