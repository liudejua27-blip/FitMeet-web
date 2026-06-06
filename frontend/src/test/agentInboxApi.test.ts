import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

  it('uses the shared endpoint registry for Agent inbox event polling', async () => {
    requestMock.mockResolvedValue({ events: [] });

    await agentInboxApi.events({ limit: 25, unreadOnly: true });

    expect(requestMock).toHaveBeenCalledWith(
      '/agents/inbox/events?limit=25&unreadOnly=true',
    );
  });

  it('uses the shared endpoint registry for Agent inbox event acknowledgements', async () => {
    requestProtectedMock.mockResolvedValue({
      ok: true,
      requested: 2,
      acknowledged: 2,
      eventIds: ['evt-1', 'evt-2'],
    });

    await agentInboxApi.ackEvents(['evt-1', 'evt-2'], 7);

    expect(requestProtectedMock).toHaveBeenCalledWith(
      '/agents/inbox/events/ack',
      {
        method: 'POST',
        body: JSON.stringify({
          eventIds: ['evt-1', 'evt-2'],
          agentProfileId: 7,
        }),
      },
    );
  });

  it('uses the shared endpoint registry for profile match review flows', async () => {
    requestMock.mockResolvedValue({ recommendations: [] });
    requestProtectedMock
      .mockResolvedValueOnce({ ok: true, status: 'ignored' })
      .mockResolvedValueOnce({
        ok: true,
        draft: { type: 'message', tone: 'friendly', content: 'hello' },
        requiresOwnerConfirmation: true,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 'requested',
        approvalId: 12,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 'sent',
        conversationId: 'conversation-1',
        messageId: 'message-1',
      });

    await agentInboxApi.profileMatches(12);
    await agentInboxApi.ignoreProfileMatch(101);
    await agentInboxApi.draftProfileMatchOpener(101);
    await agentInboxApi.requestContactExchange(101);
    await agentInboxApi.sendIntro(101, 'hello');

    expect(requestMock).toHaveBeenCalledWith(
      '/agents/profile-matches?limit=12',
    );
    expect(requestProtectedMock).toHaveBeenNthCalledWith(
      1,
      '/agents/profile-matches/101/ignore',
      { method: 'POST' },
    );
    expect(requestProtectedMock).toHaveBeenNthCalledWith(
      2,
      '/agents/profile-matches/101/draft-opener',
      {
        method: 'POST',
        body: JSON.stringify({ tone: 'friendly' }),
      },
    );
    expect(requestProtectedMock).toHaveBeenNthCalledWith(
      3,
      '/agents/profile-matches/101/request-contact-exchange',
      {
        method: 'POST',
        body: JSON.stringify({
          ownerConfirmed: true,
          note: 'Owner requested contact exchange from Agent Inbox.',
        }),
      },
    );
    expect(requestProtectedMock).toHaveBeenNthCalledWith(
      4,
      '/agents/profile-matches/101/send-intro',
      {
        method: 'POST',
        body: JSON.stringify({ ownerConfirmed: true, text: 'hello' }),
      },
    );
  });

  it('uses the shared core endpoint registry for contracted Agent inbox paths', () => {
    const source = readFileSync(
      resolve(__dirname, '../api/agentInboxApi.ts'),
      'utf8',
    );

    expect(source).toContain('fitMeetCoreEndpoints.agentInbox.conversations');
    expect(source).toContain('fitMeetCoreEndpoints.agentInbox.messages');
    expect(source).toContain('fitMeetCoreEndpoints.agentInbox.reply');
    expect(source).toContain('fitMeetCoreEndpoints.agentInbox.events');
    expect(source).toContain('fitMeetCoreEndpoints.agentInbox.ackEvents');
    expect(source).toContain('fitMeetCoreEndpoints.agentProfileMatches.list');
    expect(source).toContain('fitMeetCoreEndpoints.agentProfileMatches.ignore');
    expect(source).toContain(
      'fitMeetCoreEndpoints.agentProfileMatches.draftOpener',
    );
    expect(source).toContain(
      'fitMeetCoreEndpoints.agentProfileMatches.requestContactExchange',
    );
    expect(source).toContain(
      'fitMeetCoreEndpoints.agentProfileMatches.sendIntro',
    );
    expect(source).not.toContain('`/agents/inbox/conversations/${');
    expect(source).not.toContain('`/agents/inbox/events${');
    expect(source).not.toContain("'/agents/inbox/events/ack'");
    expect(source).not.toContain('`/agents/profile-matches/${');
  });
});
