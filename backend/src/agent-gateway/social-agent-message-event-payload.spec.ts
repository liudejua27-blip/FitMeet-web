import { buildSocialAgentMessageEventPayload } from './social-agent-message-event-payload';

describe('buildSocialAgentMessageEventPayload', () => {
  it('builds a stable message event payload for agent task events', () => {
    const payload = buildSocialAgentMessageEventPayload({
      task: { id: 100, ownerUserId: 1, agentConnectionId: 7 },
      eventType: 'agent.reply.sent',
      messageEvent: {
        conversationId: 'conversation_1',
        messageId: 'message_1',
        fromUserId: 2,
        contentPreview: 'This is a long reply',
        metadata: {
          source: 'run_next',
          eventType: 'caller_supplied_type',
          agentTaskId: 999,
        },
      },
      preview: (value) => `preview:${value ?? ''}`,
    });

    expect(payload).toEqual({
      agentConnectionId: 7,
      ownerUserId: 1,
      eventType: 'agent.reply.sent',
      conversationId: 'conversation_1',
      messageId: 'message_1',
      fromUserId: 2,
      contentPreview: 'preview:This is a long reply',
      unread: true,
      dedupeKey: '7:agent.reply.sent:100:message_1',
      metadata: {
        source: 'run_next',
        eventType: 'agent.reply.sent',
        agentTaskId: 100,
      },
    });
  });

  it('falls back dedupe stability to conversation id and then task id', () => {
    const conversationPayload = buildSocialAgentMessageEventPayload({
      task: { id: 101, ownerUserId: 1, agentConnectionId: 7 },
      eventType: 'agent.message.updated',
      messageEvent: { conversationId: 'conversation_2' },
      preview: () => '',
    });
    const taskPayload = buildSocialAgentMessageEventPayload({
      task: { id: 102, ownerUserId: 1, agentConnectionId: 7 },
      eventType: 'agent.message.updated',
      messageEvent: {},
      preview: () => '',
    });

    expect(conversationPayload?.dedupeKey).toBe(
      '7:agent.message.updated:101:conversation_2',
    );
    expect(taskPayload?.dedupeKey).toBe('7:agent.message.updated:102:task_102');
  });

  it('returns null when the task is not bound to an agent connection', () => {
    expect(
      buildSocialAgentMessageEventPayload({
        task: { id: 100, ownerUserId: 1, agentConnectionId: null },
        eventType: 'agent.message.updated',
        messageEvent: { contentPreview: 'No connection' },
        preview: (value) => value ?? '',
      }),
    ).toBeNull();
  });
});
