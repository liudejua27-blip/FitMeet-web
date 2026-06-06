import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentTaskMemoryService } from './social-agent-task-memory.service';
import { SocialAgentToolInputParserService } from './social-agent-tool-input-parser.service';
import { SocialAgentToolName } from './social-agent-tool.types';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    agentConnectionId: 9,
    taskType: 'social_goal',
    title: 'Find partner',
    goal: 'find a running partner',
    input: {},
    plan: [],
    toolCalls: [],
    result: {},
    memory: {},
    status: AgentTaskStatus.Executing,
    permissionMode: AgentTaskPermissionMode.Assist,
    riskLevel: 'low' as never,
    idempotencyKey: null,
    statusReason: null,
    error: null,
    startedAt: null,
    awaitingConfirmationAt: null,
    completedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  } as AgentTask;
}

describe('SocialAgentTaskMemoryService', () => {
  const service = new SocialAgentTaskMemoryService(
    new SocialAgentToolInputParserService(),
  );

  it('detects when a task should wait for a counterpart reply', () => {
    expect(service.shouldWaitForReply(makeTask())).toBe(false);
    expect(
      service.shouldWaitForReply(
        makeTask({
          memory: {
            socialLoop: {
              conversationId: 'conv-1',
              lastAgentMessageId: 'msg-1',
            },
          },
        }),
      ),
    ).toBe(true);
  });

  it('records conversation and sent message memory without dropping existing fields', () => {
    const task = makeTask({
      memory: {
        socialLoop: {
          conversationId: 'old-conv',
          custom: 'keep',
        },
      },
    });

    service.rememberConversation(task, {
      conversationId: 'conv-2',
      targetUserId: 88,
      lastAgentMessageId: 'msg-2',
    });
    service.rememberSentMessage(task, {
      id: 'msg-2',
      conversationId: 'conv-2',
      targetUserId: 88,
      textPreview: 'hello',
      toolName: SocialAgentToolName.SendMessage,
      stepId: 'step-1',
    });

    expect(service.socialLoopMemory(task)).toMatchObject({
      conversationId: 'conv-2',
      custom: 'keep',
      targetUserId: 88,
      lastAgentMessageId: 'msg-2',
      taskId: 101,
    });
    expect(task.memory).toMatchObject({
      shortTerm: {
        conversationId: 'conv-2',
        targetUserId: 88,
        lastAgentMessageId: 'msg-2',
        sentMessages: [
          expect.objectContaining({
            id: 'msg-2',
            conversationId: 'conv-2',
            targetUserId: 88,
            textPreview: 'hello',
          }),
        ],
      },
    });
  });

  it('records received replies by message id and keeps the latest preview', () => {
    const task = makeTask({
      memory: {
        socialLoop: {
          conversationId: 'conv-3',
        },
        shortTerm: {
          receivedReplies: [{ id: 'incoming-1', textPreview: 'old' }],
        },
      },
    });

    service.rememberReceivedReplies(
      task,
      [
        {
          id: 'incoming-1',
          conversationId: 'conv-3',
          senderId: 99,
          text: 'updated reply',
        },
      ],
      'read-step',
    );

    expect(task.memory).toMatchObject({
      shortTerm: {
        receivedReplies: [
          expect.objectContaining({
            id: 'incoming-1',
            conversationId: 'conv-3',
            fromUserId: 99,
            textPreview: 'updated reply',
          }),
        ],
        currentStep: expect.objectContaining({
          id: 'read-step',
          status: 'done',
        }),
      },
    });
  });
});
