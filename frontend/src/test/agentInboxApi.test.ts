import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.hoisted(() => vi.fn());
const requestProtectedMock = vi.hoisted(() => vi.fn());

vi.mock('../api/client', () => ({
  request: requestMock,
  requestProtected: requestProtectedMock,
}));

import { agentInboxApi } from '../api/agentInboxApi';

describe('agentInboxApi', () => {
  beforeEach(() => {
    requestMock.mockReset();
    requestProtectedMock.mockReset();
  });

  it('encodes Agent inbox conversation IDs for message history reads', async () => {
    requestMock.mockResolvedValue({
      agentProfileId: null,
      agentName: null,
      conversationId: 'conversation:city run',
      messages: [],
    });

    await agentInboxApi.messages('conversation:city run', {
      agentProfileId: 7,
      limit: 50,
    });

    expect(requestMock).toHaveBeenCalledWith(
      '/agents/inbox/conversations/conversation%3Acity%20run/messages?agentProfileId=7&limit=50',
    );
  });

  it('encodes Agent inbox conversation IDs for replies', async () => {
    requestMock.mockResolvedValue({
      status: 'sent',
      agentProfileId: null,
      agentName: null,
      conversationId: 'conversation:city run',
      socketPushed: true,
      message: {
        id: 'message-1',
        conversationId: 'conversation:city run',
        text: 'hello',
        source: 'ai_delegate',
        senderType: 'agent',
        receiverType: 'user',
        senderId: 1,
        senderAgentId: 7,
        receiverAgentId: null,
        isMine: true,
        time: 'now',
      },
    });

    await agentInboxApi.reply('conversation:city run', {
      agentProfileId: 7,
      content: 'hello',
    });

    expect(requestMock).toHaveBeenCalledWith(
      '/agents/inbox/conversations/conversation%3Acity%20run/reply',
      {
        method: 'POST',
        body: JSON.stringify({ agentProfileId: 7, content: 'hello' }),
      },
    );
  });
});
