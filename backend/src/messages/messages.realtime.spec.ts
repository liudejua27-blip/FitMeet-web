import { Types } from 'mongoose';
import { MessagesService } from './messages.service';

describe('MessagesService realtime events', () => {
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
});
