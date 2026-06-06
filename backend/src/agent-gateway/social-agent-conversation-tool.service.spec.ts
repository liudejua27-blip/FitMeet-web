import { BadRequestException } from '@nestjs/common';

import {
  AgentTask,
  AgentTaskEventType,
  AgentTaskPermissionMode,
} from './entities/agent-task.entity';
import { SocialAgentConversationToolService } from './social-agent-conversation-tool.service';
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
  };
  const toolJsonModel = {
    callJson: jest.fn(),
  };
  const service = new SocialAgentConversationToolService(
    messages as never,
    toolJsonModel as never,
    new SocialAgentToolInputParserService(),
  );

  return { service, messages, toolJsonModel };
}

describe('SocialAgentConversationToolService', () => {
  it('returns memory and event patches for unread counterpart messages', async () => {
    const { service, messages } = makeService();
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
  });

  it('does not emit task or inbox events when there are no new messages', async () => {
    const { service, messages } = makeService();
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
  });

  it('summarizes replies with model fallback wiring and inbox event patches', async () => {
    const { service, toolJsonModel } = makeService();
    toolJsonModel.callJson.mockResolvedValue({
      summary: 'Counterpart wants a meeting point.',
      sentiment: 'positive',
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
    });
    expect(result.loopUpdates).toMatchObject({
      replySummary: {
        summary: 'Counterpart wants a meeting point.',
        sentiment: 'positive',
      },
      sourceTool: SocialAgentToolName.SummarizeReply,
    });
    expect(result.shortTermUpdates).toMatchObject({
      replySummary: {
        summary: 'Counterpart wants a meeting point.',
        sentiment: 'positive',
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
  });

  it('requires an agent connection and bound conversation before reading', async () => {
    const { service } = makeService();

    await expect(
      service.readTaskConversationMessages(
        makeTask({ agentConnectionId: null }),
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.readTaskConversationMessages(
        makeTask({ memory: { socialLoop: {} } }),
        {},
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires messages before summarizing replies', async () => {
    const { service } = makeService();

    await expect(
      service.summarizeReply(makeTask({ memory: { socialLoop: {} } }), {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
