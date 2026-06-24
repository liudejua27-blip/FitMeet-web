import { Types } from 'mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MessagesService } from './messages.service';

describe('MessagesService realtime events', () => {
  it('drops stale agentConnectionId before writing activity logs', async () => {
    const connectionRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const activityLogRepo = {
      create: jest.fn((input) => input),
      save: jest.fn().mockResolvedValue({}),
    };
    const actionLogRepo = {
      create: jest.fn((input) => input),
      save: jest.fn().mockResolvedValue({}),
    };
    const service = new MessagesService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      connectionRepo as never,
      activityLogRepo as never,
      actionLogRepo as never,
      {} as never,
      {} as never,
    );

    await (
      service as unknown as {
        logAgentActivityEvent(input: {
          agentConnectionId: number;
          ownerUserId: number;
          eventType: string;
          status: string;
        }): Promise<void>;
      }
    ).logAgentActivityEvent({
      agentConnectionId: 999,
      ownerUserId: 1,
      eventType: 'agent.message.created',
      status: 'sent',
    });

    expect(activityLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ agentConnectionId: null }),
    );
    expect(actionLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: null }),
    );
  });

  it('returns an explicit conversationId in conversation summaries for iOS', async () => {
    const conversationId = new Types.ObjectId();
    const exec = jest.fn().mockResolvedValue([
      {
        _id: conversationId,
        participantIds: [1, 2],
        lastMessage: 'FitMeet staging E2E message',
        lastMessageTime: new Date('2026-06-06T00:00:00.000Z'),
        unreadCount: { '1': 2 },
      },
    ]);
    const lean = jest.fn().mockReturnValue({ exec });
    const sort = jest.fn().mockReturnValue({ lean });
    const convModel = {
      find: jest.fn().mockReturnValue({ sort }),
    };
    const userRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 2,
          name: 'Mia',
          avatar: 'https://cdn.fitmeet.test/mia.jpg',
          color: '#38BDF8',
        },
      ]),
    };
    const service = new MessagesService(
      convModel as never,
      {} as never,
      {} as never,
      userRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const summaries = await service.getConversations(1);

    expect(summaries).toEqual([
      expect.objectContaining({
        id: conversationId.toString(),
        conversationId: conversationId.toString(),
        userId: 2,
        username: 'Mia',
        unread: 2,
      }),
    ]);
  });

  it('emits message:new after a message is persisted', async () => {
    const conversationId = new Types.ObjectId();
    const conv = {
      _id: conversationId,
      participantIds: [1, 2],
      unreadCount: {},
      unreadAgentCount: {},
      agentConnectionId: null,
      ownerUserId: null,
      actorUserId: null,
    };
    const convModel = {
      findById: jest.fn().mockResolvedValue(conv),
      updateOne: jest.fn().mockResolvedValue({}),
    };
    const messageId = new Types.ObjectId();
    const msgModel = {
      create: jest.fn().mockResolvedValue({
        _id: messageId,
        text: 'hello',
        source: 'user',
        card: null,
        senderAgentId: null,
        receiverAgentId: null,
      }),
    };
    const realtime = { emitToUser: jest.fn() };
    const service = new MessagesService(
      convModel as never,
      msgModel as never,
      {} as never,
      {} as never,
      { findOne: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      realtime as never,
    );

    await service.sendMessage(conversationId.toString(), 1, 'hello');

    expect(realtime.emitToUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 2,
        eventType: 'message:new',
        rooms: [`conversation:${conversationId.toString()}`],
      }),
    );
  });

  it('accepts test-like user text as message content instead of treating it as blank', async () => {
    const conversationId = new Types.ObjectId();
    const conv = {
      _id: conversationId,
      participantIds: [1, 2],
      unreadCount: {},
      unreadAgentCount: {},
      agentConnectionId: null,
      ownerUserId: null,
      actorUserId: null,
    };
    const convModel = {
      findById: jest.fn().mockResolvedValue(conv),
      updateOne: jest.fn().mockResolvedValue({}),
    };
    const messageId = new Types.ObjectId();
    const msgModel = {
      create: jest.fn().mockImplementation((value) =>
        Promise.resolve({
          _id: messageId,
          text: value.text,
          source: 'user',
          card: null,
          senderAgentId: null,
          receiverAgentId: null,
        }),
      ),
    };
    const service = new MessagesService(
      convModel as never,
      msgModel as never,
      {} as never,
      {} as never,
      { findOne: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.sendMessage(
      conversationId.toString(),
      1,
      '你好，E2E 消息测试',
    );

    expect(msgModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ text: '你好，E2E 消息测试' }),
    );
    expect(result.text).toBe('你好，E2E 消息测试');
  });

  it('rejects invalid conversation ids before reading messages', async () => {
    const convModel = {
      findOne: jest.fn(),
      updateOne: jest.fn(),
    };
    const msgModel = {
      find: jest.fn(),
    };
    const service = new MessagesService(
      convModel as never,
      msgModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.getMessages('not-an-object-id', 1)).rejects.toThrow(
      BadRequestException,
    );
    expect(convModel.findOne).not.toHaveBeenCalled();
    expect(msgModel.find).not.toHaveBeenCalled();
  });

  it('does not read messages when the user is not a conversation participant', async () => {
    const conversationId = new Types.ObjectId();
    const exec = jest.fn().mockResolvedValue(null);
    const lean = jest.fn().mockReturnValue({ exec });
    const convModel = {
      findOne: jest.fn().mockReturnValue({ lean }),
      updateOne: jest.fn(),
    };
    const msgModel = {
      find: jest.fn(),
    };
    const service = new MessagesService(
      convModel as never,
      msgModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.getMessages(conversationId.toString(), 99),
    ).rejects.toThrow(NotFoundException);
    expect(convModel.findOne).toHaveBeenCalledWith({
      _id: conversationId,
      participantIds: 99,
    });
    expect(convModel.updateOne).not.toHaveBeenCalled();
    expect(msgModel.find).not.toHaveBeenCalled();
  });

  it('rejects invalid conversation ids before sending messages', async () => {
    const convModel = {
      findById: jest.fn(),
      updateOne: jest.fn(),
    };
    const msgModel = {
      create: jest.fn(),
    };
    const service = new MessagesService(
      convModel as never,
      msgModel as never,
      {} as never,
      {} as never,
      { findOne: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.sendMessage('not-an-object-id', 1, 'hello'),
    ).rejects.toThrow(BadRequestException);
    expect(convModel.findById).not.toHaveBeenCalled();
    expect(msgModel.create).not.toHaveBeenCalled();
  });

  it('rejects blank message content before loading a conversation', async () => {
    const conversationId = new Types.ObjectId();
    const convModel = {
      findById: jest.fn(),
      updateOne: jest.fn(),
    };
    const msgModel = {
      create: jest.fn(),
    };
    const service = new MessagesService(
      convModel as never,
      msgModel as never,
      {} as never,
      {} as never,
      { findOne: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.sendMessage(conversationId.toString(), 1, '   '),
    ).rejects.toThrow(BadRequestException);
    expect(convModel.findById).not.toHaveBeenCalled();
    expect(msgModel.create).not.toHaveBeenCalled();
  });

  it('rejects invalid agent message event conversation ids before querying messages', async () => {
    const convModel = {
      findById: jest.fn(),
      updateOne: jest.fn(),
    };
    const msgModel = {
      find: jest.fn(),
      findOne: jest.fn(),
    };
    const service = new MessagesService(
      convModel as never,
      msgModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.getAgentConversationMessages('not-an-object-id', 7),
    ).rejects.toThrow(BadRequestException);
    expect(convModel.findById).not.toHaveBeenCalled();
    expect(convModel.updateOne).not.toHaveBeenCalled();
    expect(msgModel.find).not.toHaveBeenCalled();
  });

  it('rejects invalid agent reply conversation ids before loading a conversation', async () => {
    const convModel = {
      findById: jest.fn(),
      updateOne: jest.fn(),
    };
    const msgModel = {
      create: jest.fn(),
      findOne: jest.fn(),
    };
    const service = new MessagesService(
      convModel as never,
      msgModel as never,
      {} as never,
      {} as never,
      { findOne: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.sendAgentReply('not-an-object-id', 7, 'hello'),
    ).rejects.toThrow(BadRequestException);
    expect(convModel.findById).not.toHaveBeenCalled();
    expect(msgModel.create).not.toHaveBeenCalled();
  });
});
