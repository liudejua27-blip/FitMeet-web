import { BadRequestException } from '@nestjs/common';

import {
  AgentTask,
  AgentTaskEventType,
  AgentTaskPermissionMode,
} from './entities/agent-task.entity';
import { SocialAgentConversationToolService } from './social-agent-conversation-tool.service';
import { SocialAgentTaskMemoryService } from './social-agent-task-memory.service';
import { SocialAgentToolInputParserService } from './social-agent-tool-input-parser.service';
import { SocialAgentToolName } from './social-agent-tool.types';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 100,
    ownerUserId: 1,
    agentConnectionId: 7,
    permissionMode: AgentTaskPermissionMode.LimitedAuto,
    goal: 'meet someone nearby',
    memory: {
      socialLoop: {
        conversationId: 'conv_1',
        targetUserId: 2,
        lastMessageId: 'msg_1',
      },
    },
    ...overrides,
  } as AgentTask;
}

function makeService() {
  const messages = {
    getAgentInboxMessages: jest.fn(),
    getTaskConversationMessages: jest.fn(),
  };
  const toolJsonModel = {
    callJson: jest.fn(),
  };
  const toolInput = new SocialAgentToolInputParserService();
  const l5Runtime = {
    transitionMeetLoop: jest.fn().mockResolvedValue(undefined),
  };
  const service = new SocialAgentConversationToolService(
    messages as never,
    toolJsonModel as never,
    toolInput,
    new SocialAgentTaskMemoryService(toolInput),
    l5Runtime as never,
  );

  return { service, messages, toolJsonModel, l5Runtime };
}

describe('SocialAgentConversationToolService', () => {
  it('returns memory and event patches for unread counterpart messages', async () => {
    const { service, messages, l5Runtime } = makeService();
    messages.getAgentInboxMessages.mockResolvedValue([
      {
        id: 'msg_1',
        conversationId: 'conv_1',
        text: 'Agent opener',
        senderType: 'agent',
        senderId: 1,
      },
      {
        id: 'msg_2',
        conversationId: 'conv_1',
        text: 'Sure, where should we meet?',
        senderType: 'user',
        senderId: 2,
      },
    ]);

    const result = await service.readTaskConversationMessages(makeTask(), {});

    expect(messages.getAgentInboxMessages).toHaveBeenCalledWith('conv_1', 7, {
      limit: 50,
    });
    expect(result.output).toMatchObject({
      conversationId: 'conv_1',
      cursor: 'msg_1',
      newMessageCount: 1,
      latestMessage: { id: 'msg_2' },
    });
    expect(result.loopUpdates).toMatchObject({
      conversationId: 'conv_1',
      targetUserId: 2,
      lastReceivedMessageId: 'msg_2',
      lastReadMessageId: 'msg_2',
      pendingMessageId: null,
      processedMessageIds: ['msg_2'],
      sourceTool: SocialAgentToolName.ReadTaskConversationMessages,
    });
    expect(result.receivedMessages).toEqual([
      expect.objectContaining({ id: 'msg_2' }),
    ]);
    expect(result.taskEvent).toMatchObject({
      type: AgentTaskEventType.FeedbackReceived,
      input: {
        payload: {
          conversationId: 'conv_1',
          messageId: 'msg_2',
          newMessageCount: 1,
        },
      },
    });
    expect(result.inboxEvent).toMatchObject({
      eventType: 'social_agent.message.received',
      input: {
        conversationId: 'conv_1',
        messageId: 'msg_2',
        fromUserId: 2,
        contentPreview: 'Sure, where should we meet?',
      },
    });
    expect(l5Runtime.transitionMeetLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 1,
        agentTaskId: 100,
        candidateUserId: 2,
        stage: 'reply_received',
        waitingFor: 'reply_summary',
        state: expect.objectContaining({
          conversationId: 'conv_1',
          targetUserId: 2,
          latestMessageId: 'msg_2',
          latestMessagePreview: 'Sure, where should we meet?',
          newMessageCount: 1,
          loopStage: 'reply_received',
        }),
      }),
    );
  });

  it('does not emit task or inbox events when there are no new messages', async () => {
    const { service, messages, l5Runtime } = makeService();
    messages.getAgentInboxMessages.mockResolvedValue([
      {
        id: 'msg_1',
        conversationId: 'conv_1',
        text: 'Agent opener',
        senderType: 'agent',
        senderId: 1,
      },
    ]);

    const result = await service.readTaskConversationMessages(makeTask(), {});

    expect(result.output).toMatchObject({ newMessageCount: 0 });
    expect(result.receivedMessages).toEqual([]);
    expect(result.taskEvent).toBeUndefined();
    expect(result.inboxEvent).toBeUndefined();
    expect(result.loopUpdates).toMatchObject({
      latestReceivedMessage: null,
      latestReceivedMessages: [],
      processedMessageIds: [],
    });
    expect(l5Runtime.transitionMeetLoop).not.toHaveBeenCalled();
  });

  it('summarizes replies with model fallback wiring and inbox event patches', async () => {
    const { service, toolJsonModel, l5Runtime } = makeService();
    toolJsonModel.callJson.mockResolvedValue({
      summary: 'Counterpart wants a meeting point.',
      sentiment: 'positive',
      intent: 'ask_question',
      needsReply: true,
    });

    const result = await service.summarizeReply(
      makeTask({
        memory: {
          socialLoop: {
            conversationId: 'conv_1',
            targetUserId: 2,
            lastReceivedMessageId: 'msg_2',
            latestReceivedMessages: [
              {
                id: 'msg_2',
                conversationId: 'conv_1',
                text: 'Where should we meet?',
                senderType: 'user',
                senderId: 2,
              },
            ],
          },
        },
      }),
      {},
    );

    expect(toolJsonModel.callJson).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'summarize_reply',
        taskId: 100,
        prompt: expect.stringContaining('Where should we meet?'),
      }),
    );
    expect(result.output).toEqual({
      summary: 'Counterpart wants a meeting point.',
      sentiment: 'positive',
      intent: 'ask_question',
      needsReply: true,
    });
    expect(result.loopUpdates).toMatchObject({
      replySummary: {
        summary: 'Counterpart wants a meeting point.',
        sentiment: 'positive',
        intent: 'ask_question',
        needsReply: true,
      },
      sourceTool: SocialAgentToolName.SummarizeReply,
    });
    expect(result.shortTermUpdates).toMatchObject({
      replySummary: {
        summary: 'Counterpart wants a meeting point.',
        sentiment: 'positive',
        intent: 'ask_question',
        needsReply: true,
      },
      currentStep: {
        id: 'summarize_reply',
        label: '已总结对方回复',
        status: 'done',
      },
    });
    expect(result.inboxEvent).toMatchObject({
      eventType: 'social_agent.reply.summarized',
      input: {
        conversationId: 'conv_1',
        messageId: 'msg_2',
        fromUserId: 2,
        contentPreview: 'Counterpart wants a meeting point.',
      },
    });
    expect(l5Runtime.transitionMeetLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 1,
        agentTaskId: 100,
        candidateUserId: 2,
        stage: 'reply_received',
        waitingFor: 'next_action_decision',
        state: expect.objectContaining({
          conversationId: 'conv_1',
          targetUserId: 2,
          latestMessageId: 'msg_2',
          replySummary: expect.objectContaining({
            summary: 'Counterpart wants a meeting point.',
            intent: 'ask_question',
          }),
          replyIntent: 'ask_question',
          replySentiment: 'positive',
          needsReply: true,
          messageCount: 1,
          loopStage: 'reply_received',
        }),
      }),
    );
  });

  it('reads task conversation messages by taskId when agent connection is missing', async () => {
    const { service, messages, l5Runtime } = makeService();
    messages.getTaskConversationMessages.mockResolvedValue([
      {
        id: 'msg_1',
        conversationId: 'conv_1',
        text: 'Agent opener',
        senderType: 'agent',
        senderId: 1,
        metadata: { agentTaskId: 100 },
      },
      {
        id: 'msg_2',
        conversationId: 'conv_1',
        text: '可以，几点？',
        senderType: 'user',
        senderId: 2,
        metadata: { agentTaskId: 100 },
      },
    ]);

    const result = await service.readTaskConversationMessages(
      makeTask({ agentConnectionId: null }),
      {},
    );

    expect(messages.getAgentInboxMessages).not.toHaveBeenCalled();
    expect(messages.getTaskConversationMessages).toHaveBeenCalledWith(100, {
      conversationId: 'conv_1',
      limit: 50,
    });
    expect(result.output).toMatchObject({
      conversationId: 'conv_1',
      newMessageCount: 1,
      latestMessage: { id: 'msg_2' },
    });
    expect(l5Runtime.transitionMeetLoop).toHaveBeenCalled();
  });

  it('returns a non-retryable skipped result for unbound old tasks', async () => {
    const { service, messages, l5Runtime } = makeService();
    messages.getTaskConversationMessages.mockResolvedValue([]);

    const result = await service.readTaskConversationMessages(
      makeTask({ agentConnectionId: null, memory: { socialLoop: {} } }),
      {},
    );

    expect(result.output).toMatchObject({
      status: 'skipped',
      code: 'task_conversation_unbound',
      retryable: false,
      newMessageCount: 0,
    });
    expect(result.receivedMessages).toEqual([]);
    expect(l5Runtime.transitionMeetLoop).not.toHaveBeenCalled();
  });

  it('requires messages before summarizing replies', async () => {
    const { service } = makeService();

    await expect(
      service.summarizeReply(makeTask({ memory: { socialLoop: {} } }), {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
