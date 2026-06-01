import { Types } from 'mongoose';
import { MessagesService } from './messages.service';

describe('MessagesService realtime events', () => {
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
