import { BadRequestException } from '@nestjs/common';

import {
  AgentTask,
  AgentTaskPermissionMode,
} from './entities/agent-task.entity';
import { SocialAgentMessageToolService } from './social-agent-message-tool.service';
import { SocialAgentToolInputParserService } from './social-agent-tool-input-parser.service';
import { SocialAgentToolName } from './social-agent-tool.types';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 100,
    ownerUserId: 1,
    agentConnectionId: 7,
    permissionMode: AgentTaskPermissionMode.LimitedAuto,
    goal: 'meet someone for coffee',
    memory: {},
    ...overrides,
  } as AgentTask;
}

function makeService() {
  const messages = {
    startConversation: jest.fn(),
    sendMessage: jest.fn(),
    sendAgentReply: jest.fn(),
  };
  const matchService = {
    markCandidateMessaged: jest.fn(),
  };
  const confirmationPolicy = {
    canRunAsConfirmedUserAction: jest.fn(() => false),
  };
  const service = new SocialAgentMessageToolService(
    messages as never,
    matchService as never,
    confirmationPolicy as never,
    new SocialAgentToolInputParserService(),
  );

  return { service, messages, matchService, confirmationPolicy };
}

describe('SocialAgentMessageToolService', () => {
  it('sends user-confirmed candidate messages as the user when no agent is bound', async () => {
    const { service, messages, confirmationPolicy } = makeService();
    confirmationPolicy.canRunAsConfirmedUserAction.mockReturnValue(true);
    messages.startConversation.mockResolvedValue({ conversationId: 'conv_1' });
    messages.sendMessage.mockResolvedValue({
      id: 'msg_1',
      conversationId: 'conv_1',
    });

    const result = await service.sendMessage(
      makeTask({
        agentConnectionId: null,
        permissionMode: AgentTaskPermissionMode.Confirm,
      }),
      {
        targetUserId: 2,
        text: 'Hi, want to grab coffee?',
        metadata: { confirmationSource: 'social_agent_chat' },
      },
      'step_1',
    );

    expect(messages.startConversation).toHaveBeenCalledWith(
      1,
      2,
      expect.objectContaining({ agentConnectionId: null, ownerUserId: 1 }),
    );
    expect(messages.sendMessage).toHaveBeenCalledWith(
      'conv_1',
      1,
      'Hi, want to grab coffee?',
      expect.objectContaining({
        senderType: 'user',
        senderAgentId: null,
        agentConnectionId: null,
        ownerUserId: 1,
        actorUserId: 1,
        source: 'user',
      }),
    );
    expect(result.output).toMatchObject({
      id: 'msg_1',
      conversationId: 'conv_1',
    });
    expect(result.loopUpdates).toMatchObject({
      conversationId: 'conv_1',
      targetUserId: 2,
      lastMessageId: 'msg_1',
      lastAgentMessageId: 'msg_1',
      sourceTool: SocialAgentToolName.SendMessage,
    });
    expect(result.sentMessage).toMatchObject({
      id: 'msg_1',
      conversationId: 'conv_1',
      targetUserId: 2,
      toolName: SocialAgentToolName.SendMessage,
      stepId: 'step_1',
    });
  });

  it('skips duplicate outgoing messages from social loop memory', async () => {
    const { service, messages } = makeService();

    const result = await service.sendMessage(
      makeTask({
        memory: {
          socialLoop: {
            conversationId: 'conv_existing',
            sentMessageKeys: ['message:2:hello there'],
          },
        },
      }),
      { targetUserId: 2, text: ' hello   there ' },
      'step_1',
    );

    expect(messages.startConversation).not.toHaveBeenCalled();
    expect(messages.sendMessage).not.toHaveBeenCalled();
    expect(result).toEqual({
      output: {
        skipped: true,
        duplicate: true,
        reason: 'duplicate_message_content',
        conversationId: 'conv_existing',
        targetUserId: 2,
        textPreview: 'hello   there',
      },
    });
  });

  it('marks matched candidates as messaged when IDs are present', async () => {
    const { service, messages, matchService } = makeService();
    messages.startConversation.mockResolvedValue({ conversationId: 'conv_1' });
    messages.sendMessage.mockResolvedValue({ id: 'msg_1' });
    matchService.markCandidateMessaged.mockResolvedValue({
      id: 33,
      status: 'messaged',
    });

    const result = await service.sendMessage(
      makeTask(),
      {
        targetUserId: 2,
        text: 'hello',
        socialRequestId: 10,
        candidateRecordId: 33,
      },
      'step_1',
    );

    expect(matchService.markCandidateMessaged).toHaveBeenCalledWith(10, 33, 1);
    expect(result.output).toMatchObject({
      id: 'msg_1',
      candidate: { id: 33, status: 'messaged' },
    });
  });

  it('returns inbox event patches for agent replies', async () => {
    const { service, messages } = makeService();
    messages.sendAgentReply.mockResolvedValue({
      id: 'reply_1',
      recipientUserId: 2,
      conversationId: 'conv_1',
    });

    const result = await service.replyMessage(
      makeTask(),
      { conversationId: 'conv_1', targetUserId: 2, text: 'Thanks!' },
      'reply_step',
    );

    expect(messages.sendAgentReply).toHaveBeenCalledWith(
      'conv_1',
      7,
      'Thanks!',
      expect.objectContaining({
        ownerUserId: 1,
        metadata: expect.objectContaining({
          agentTaskId: 100,
          stepId: 'reply_step',
          source: 'social_agent_tool_executor',
        }),
      }),
    );
    expect(result.loopUpdates).toMatchObject({
      conversationId: 'conv_1',
      targetUserId: 2,
      lastMessageId: 'reply_1',
      lastAgentMessageId: 'reply_1',
      sourceTool: SocialAgentToolName.ReplyMessage,
    });
    expect(result.inboxEvent).toMatchObject({
      eventType: 'social_agent.reply.sent',
      input: {
        conversationId: 'conv_1',
        messageId: 'reply_1',
        fromUserId: 2,
        contentPreview: 'Thanks!',
      },
    });
  });

  it('rejects empty messages and replies without a conversation', async () => {
    const { service } = makeService();

    await expect(
      service.sendMessage(makeTask(), { targetUserId: 2, text: ' ' }, 'step_1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.replyMessage(makeTask(), { text: 'hello' }, 'step_1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
