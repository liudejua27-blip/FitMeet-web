import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
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

function makeHarness(initialTask = makeTask()) {
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
  };
  const longTermMemory = {
    summarizeTask: jest.fn().mockResolvedValue(undefined),
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
  );
  return {
    approvals,
    eventRepo,
    executor,
    longTermMemory,
    savedEvents,
    service,
    taskRepo,
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
    const { approvals, service, taskRepo } = makeHarness(task);

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
        actionType: 'send_candidate_message',
        relatedCandidateId: 501,
      }),
    );
    expect(approval).toMatchObject({
      id: 9001,
      actionType: 'send_candidate_message',
      riskLevel: 'medium',
    });
    expect(taskRepo.save).toHaveBeenCalledWith(task);
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
            actionType: 'send_candidate_message',
            summary: expect.stringContaining('候选人 #22'),
            riskLevel: 'medium',
          }),
        ],
      },
    });
  });

  it('creates an opener approval card without sending the message', async () => {
    const { approvals, savedEvents, service, task } = makeHarness();

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

    expect(approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'send_message',
        actionType: 'send_candidate_message',
        relatedCandidateId: 501,
      }),
    );
    expect(result).toMatchObject({
      action: 'await_confirmation',
      pendingApproval: expect.objectContaining({
        actionType: 'send_candidate_message',
      }),
      cards: [
        expect.objectContaining({
          type: 'opener_approval',
          status: 'waiting_confirmation',
          actions: [
            expect.objectContaining({
              schemaAction: 'opener.confirm_send',
              requiresConfirmation: true,
            }),
            expect.objectContaining({
              schemaAction: 'opener.regenerate',
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
    expect(savedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'confirmation.requested',
        }),
        expect.objectContaining({
          eventType: 'social_agent.message.assistant',
        }),
      ]),
    );
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
        taskMemory: {
          pendingActions: [
            {
              id: 9001,
              actionType: 'send_candidate_message',
              type: 'send_message',
              summary: '发送开场白',
              riskLevel: 'medium',
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
    const { executor, service } = makeHarness(task);

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
      }),
      7,
    );
    expect(result).toMatchObject({
      assistantMessage: '已确认发送给小林：今晚先在青岛大学操场轻松跑一段吗？',
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

  it('connects a candidate through AddFriend and records the conversation', async () => {
    const { executor, longTermMemory, savedEvents, service, task } =
      makeHarness();

    const result = await service.connectCandidate(7, 101, {
      socialRequestId: 301,
      candidateRecordId: 501,
      targetUserId: 22,
    });

    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.AddFriend,
      expect.objectContaining({
        targetUserId: 22,
        candidateRecordId: 501,
        openConversation: true,
      }),
      7,
    );
    expect(result).toMatchObject({
      success: true,
      taskId: 101,
      targetUserId: 22,
      candidateUserId: 22,
      status: 'connected',
      following: true,
      friendRequestId: '601',
      conversationId: 'conv-22',
      friendAction: {
        success: true,
        status: 'connected',
        targetUserId: 22,
        candidateUserId: 22,
        following: true,
        conversationId: 'conv-22',
        friendRequestId: '601',
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
            connect: 'connected',
            conversationId: 'conv-22',
          }),
        },
      },
    });
    expect(savedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'confirmation.received',
        }),
      ]),
    );
    expect(longTermMemory.summarizeTask).toHaveBeenCalledWith(task);
  });

  it('persists pending approval state when connecting a candidate requires confirmation', async () => {
    const { executor, longTermMemory, savedEvents, service, task } =
      makeHarness();
    executor.executeToolAction.mockResolvedValueOnce({
      id: 'action_add_friend_pending_1',
      toolName: SocialAgentToolName.AddFriend,
      status: 'succeeded',
      output: {
        status: 'pending_approval',
        requiresApproval: true,
        approvalId: 701,
      },
      error: null,
    } as never);

    const result = await service.connectCandidate(7, 101, {
      socialRequestId: 301,
      candidateRecordId: 501,
      targetUserId: 22,
    });

    expect(result).toMatchObject({
      success: true,
      status: 'pending_approval',
      following: false,
      approvalId: 701,
      requiresApproval: true,
      message: '加好友/连接候选人需要你确认',
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
            id: 701,
            type: 'contact_request',
            actionType: 'connect_candidate',
            summary: '加好友/连接候选人 #22',
            riskLevel: 'medium',
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

  it('resolves nested candidate user ids when connecting from a card payload', async () => {
    const { executor, service } = makeHarness();

    await service.connectCandidate(7, 101, {
      socialRequestId: 301,
      candidateRecordId: 501,
      candidate: { candidateUserId: 23 },
    });

    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.AddFriend,
      expect.objectContaining({
        targetUserId: 23,
        candidateRecordId: 501,
        socialRequestId: 301,
        openConversation: true,
      }),
      7,
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
            actionType: 'send_candidate_message',
            summary: '发送消息给候选人 #22',
            riskLevel: 'medium',
          }),
        ],
      },
    });
  });
});
