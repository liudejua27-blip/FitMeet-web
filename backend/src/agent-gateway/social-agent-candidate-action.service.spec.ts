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
  const executor = {
    executeToolAction: jest.fn().mockResolvedValue({
      id: 'action_send_candidate_message_1',
      toolName: SocialAgentToolName.SendMessageToCandidate,
      status: 'succeeded',
      output: {
        id: 'msg-1',
        messageId: 'msg-1',
        conversationId: 'conv-1',
      },
      error: null,
    }),
  };
  const service = new SocialAgentCandidateActionService(
    taskRepo as never,
    eventRepo as never,
    approvals as never,
    executor as never,
  );
  return {
    approvals,
    eventRepo,
    executor,
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
    const { approvals, service } = makeHarness(task);

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
    expect(task.result).toMatchObject({
      candidateActions: {
        '22': expect.objectContaining({
          send: 'sent',
          conversationId: 'conv-1',
          messageId: 'msg-1',
        }),
      },
    });
  });
});
