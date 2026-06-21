import {
  AgentTask,
  AgentTaskPermissionMode,
} from './entities/agent-task.entity';
import { SocialAgentInboxToolService } from './social-agent-inbox-tool.service';
import { SocialAgentToolInputParserService } from './social-agent-tool-input-parser.service';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 100,
    ownerUserId: 1,
    agentConnectionId: 7,
    permissionMode: AgentTaskPermissionMode.LimitedAuto,
    goal: 'meet someone nearby',
    memory: {},
    ...overrides,
  } as AgentTask;
}

function makeService() {
  const messages = {
    createAgentInboxEvent: jest.fn(),
    getAgentInboxMessages: jest.fn(),
    getAgentInboxConversations: jest.fn(),
    getAgentInboxEvents: jest.fn(),
    getAgentInboxEventsForOwner: jest.fn(),
    getConversations: jest.fn(),
  };
  const service = new SocialAgentInboxToolService(
    messages as never,
    new SocialAgentToolInputParserService(),
  );

  return { service, messages };
}

describe('SocialAgentInboxToolService', () => {
  it('writes inbox events with task metadata and fallback dedupe keys', async () => {
    const { service, messages } = makeService();
    messages.createAgentInboxEvent.mockResolvedValue({ id: 'evt_1' });

    await expect(
      service.writeInbox(
        makeTask(),
        {
          eventType: 'agent.task.updated',
          conversationId: 'conv_1',
          messageId: 'msg_1',
          socialRequestId: 11,
          candidateRecordId: 22,
          fromUserId: 2,
          summary: 'New reply',
          metadata: { source: 'planner' },
        },
        'step_1',
      ),
    ).resolves.toEqual({ id: 'evt_1' });

    expect(messages.createAgentInboxEvent).toHaveBeenCalledWith({
      agentConnectionId: 7,
      ownerUserId: 1,
      eventType: 'agent.task.updated',
      conversationId: 'conv_1',
      messageId: 'msg_1',
      requestId: 11,
      candidateRecordId: 22,
      fromUserId: 2,
      contentPreview: 'New reply',
      unread: true,
      dedupeKey: '7:agent.task:100:step_1',
      metadata: {
        source: 'planner',
        agentTaskId: 100,
        stepId: 'step_1',
      },
    });
  });

  it('reads conversation messages when a conversation id is provided', async () => {
    const { service, messages } = makeService();
    messages.getAgentInboxMessages.mockResolvedValue([{ id: 'msg_1' }]);

    await expect(
      service.readInbox(makeTask(), { conversationId: 'conv_1', limit: '25' }),
    ).resolves.toEqual({ messages: [{ id: 'msg_1' }] });

    expect(messages.getAgentInboxMessages).toHaveBeenCalledWith('conv_1', 7, {
      limit: 25,
    });
    expect(messages.getAgentInboxEvents).not.toHaveBeenCalled();
  });

  it('reads filtered inbox events without a conversation id', async () => {
    const { service, messages } = makeService();
    messages.getAgentInboxEvents.mockResolvedValue([{ id: 'evt_1' }]);

    await expect(
      service.readInbox(makeTask(), {
        unreadOnly: 'true',
        eventType: 'social_agent.message.received',
      }),
    ).resolves.toEqual({ events: [{ id: 'evt_1' }] });

    expect(messages.getAgentInboxEvents).toHaveBeenCalledWith(7, {
      limit: undefined,
      unreadOnly: true,
      eventType: 'social_agent.message.received',
    });
  });

  it('reads owner inbox events without an agent connection when no conversation is scoped', async () => {
    const { service, messages } = makeService();
    messages.getAgentInboxEventsForOwner.mockResolvedValue([{ id: 'evt_1' }]);

    await expect(
      service.readInbox(makeTask({ agentConnectionId: null }), {
        unreadOnly: 'true',
        eventType: 'social_agent.message.received',
      }),
    ).resolves.toEqual({ events: [{ id: 'evt_1' }] });

    expect(messages.getAgentInboxEvents).not.toHaveBeenCalled();
    expect(messages.getAgentInboxEventsForOwner).toHaveBeenCalledWith(1, {
      limit: undefined,
      unreadOnly: true,
      eventType: 'social_agent.message.received',
    });
  });

  it('returns user conversations with optional limits', async () => {
    const { service, messages } = makeService();
    messages.getConversations.mockResolvedValue([
      { id: 'conv_1' },
      { id: 'conv_2' },
    ]);

    await expect(
      service.getConversations(makeTask(), { limit: 1 }),
    ).resolves.toEqual({ conversations: [{ id: 'conv_1' }] });

    expect(messages.getConversations).toHaveBeenCalledWith(1);
  });

  it('combines agent inbox conversations with events when an agent is bound', async () => {
    const { service, messages } = makeService();
    messages.getAgentInboxConversations.mockResolvedValue([{ id: 'conv_1' }]);
    messages.getAgentInboxEvents.mockResolvedValue([{ id: 'evt_1' }]);

    await expect(
      service.getAgentInbox(makeTask(), {
        limit: 5,
        unreadOnly: false,
      }),
    ).resolves.toEqual({
      conversations: [{ id: 'conv_1' }],
      events: [{ id: 'evt_1' }],
    });

    expect(messages.getAgentInboxConversations).toHaveBeenCalledWith(7, {
      limit: 5,
      unreadOnly: false,
    });
    expect(messages.getAgentInboxEvents).toHaveBeenCalledWith(7, {
      limit: 5,
      unreadOnly: false,
      eventType: undefined,
    });
    expect(messages.getAgentInboxEventsForOwner).not.toHaveBeenCalled();
  });

  it('falls back to owner inbox events when no agent is bound', async () => {
    const { service, messages } = makeService();
    messages.getAgentInboxEventsForOwner.mockResolvedValue([{ id: 'evt_1' }]);

    await expect(
      service.getAgentInbox(makeTask({ agentConnectionId: null }), {
        unreadOnly: true,
      }),
    ).resolves.toEqual({
      conversations: [],
      events: [{ id: 'evt_1' }],
    });

    expect(messages.getAgentInboxConversations).not.toHaveBeenCalled();
    expect(messages.getAgentInboxEventsForOwner).toHaveBeenCalledWith(1, {
      limit: undefined,
      unreadOnly: true,
      eventType: undefined,
    });
  });

  it('requires an agent connection for conversation-scoped inbox reads and safely skips without retry loops', async () => {
    const { service, messages } = makeService();

    await expect(
      service.getAgentInbox(makeTask({ agentConnectionId: null }), {
        conversationId: 'conv_1',
      }),
    ).resolves.toMatchObject({
      status: 'skipped',
      skipped: true,
      retryable: false,
      reason: 'missing_agent_connection',
      toolName: 'get_agent_inbox',
    });
    await expect(
      service.readInbox(makeTask({ agentConnectionId: null }), {
        conversationId: 'conv_1',
      }),
    ).resolves.toMatchObject({
      status: 'skipped',
      skipped: true,
      retryable: false,
      reason: 'missing_agent_connection',
      toolName: 'read_agent_inbox',
    });

    expect(messages.getAgentInboxMessages).not.toHaveBeenCalled();
  });
});
