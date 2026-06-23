import { AgentMessageEventSchema } from './agent-message-event.schema';
import { ConversationSchema } from './conversation.schema';
import { MessageSchema } from './message.schema';

describe('message Mongo schema indexes', () => {
  it('keeps release-critical conversation list indexes', () => {
    expect(schemaIndexKeys(ConversationSchema)).toEqual(
      expect.arrayContaining([
        'directKey',
        'agentConnectionId',
        'participantIds,lastMessageTime',
        'agentConnectionId,lastMessageTime',
        'participantAgentIds,lastMessageTime',
        'ownerUserId,lastMessageTime',
      ]),
    );
  });

  it('keeps release-critical message history and agent message event signal indexes', () => {
    expect(schemaIndexKeys(MessageSchema)).toEqual(
      expect.arrayContaining([
        'agentConnectionId',
        'conversationId,createdAt',
        'agentConnectionId,conversationId',
        'agentConnectionId,createdAt',
        'ownerUserId,createdAt',
        'senderAgentId,conversationId',
        'receiverAgentId,conversationId',
      ]),
    );
  });

  it('keeps release-critical agent message event event query indexes', () => {
    expect(schemaIndexKeys(AgentMessageEventSchema)).toEqual(
      expect.arrayContaining([
        'agentConnectionId',
        'ownerUserId',
        'eventType',
        'conversationId',
        'messageId',
        'requestId',
        'unread',
        'dedupeKey',
        'agentConnectionId,unread,eventType,createdAt',
        'ownerUserId,unread,eventType,createdAt',
      ]),
    );
  });
});

function schemaIndexKeys(schema: {
  indexes(): Array<[Record<string, unknown>, Record<string, unknown>]>;
}): string[] {
  return schema.indexes().map(([fields]) => Object.keys(fields).join(','));
}
