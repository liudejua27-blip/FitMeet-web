import { describe, expect, it } from 'vitest';

import { fitMeetCoreEndpoints } from '../api/fitmeetCoreContract';

describe('fitMeetCoreEndpoints', () => {
  it('keeps the App core smoke read-back endpoints in the typed registry', () => {
    expect(fitMeetCoreEndpoints.auth.getProfile).toBe('/auth/profile');
    expect(fitMeetCoreEndpoints.users.updateProfile).toBe('/users/profile');
    expect(fitMeetCoreEndpoints.uploads.image).toBe('/uploads/image');
    expect(fitMeetCoreEndpoints.feed.getFeed).toBe('/feed');
    expect(fitMeetCoreEndpoints.feed.createPost).toBe('/feed');
    expect(fitMeetCoreEndpoints.messages.startConversation).toBe(
      '/messages/start',
    );
    expect(fitMeetCoreEndpoints.messages.getConversations).toBe(
      '/messages/conversations',
    );
    expect(
      fitMeetCoreEndpoints.messages.getConversationMessages('conv-123'),
    ).toBe('/messages/conversations/conv-123');
    expect(
      fitMeetCoreEndpoints.messages.sendConversationMessage('conv-123'),
    ).toBe('/messages/conversations/conv-123/send');
    expect(
      fitMeetCoreEndpoints.messages.startPublicIntentConversation(
        'intent:city run',
      ),
    ).toBe('/messages/public-intents/intent%3Acity%20run/start');
    expect(fitMeetCoreEndpoints.messages.getUnreadCount).toBe(
      '/messages/unread',
    );
    expect(fitMeetCoreEndpoints.socialAgentChat.session).toBe(
      '/social-agent/chat/session',
    );
    expect(fitMeetCoreEndpoints.socialAgentChat.taskSession(101)).toBe(
      '/social-agent/chat/tasks/101/session',
    );
    expect(fitMeetCoreEndpoints.socialAgentChat.taskMessages(101)).toBe(
      '/social-agent/chat/tasks/101/messages',
    );
    expect(fitMeetCoreEndpoints.socialAgentChat.taskActions(101)).toBe(
      '/social-agent/chat/tasks/101/actions',
    );
    expect(fitMeetCoreEndpoints.socialAgentChat.saveCandidate(101)).toBe(
      '/social-agent/chat/tasks/101/save-candidate',
    );
    expect(fitMeetCoreEndpoints.socialAgentChat.sendCandidateMessage(101)).toBe(
      '/social-agent/chat/tasks/101/send-message',
    );
    expect(fitMeetCoreEndpoints.socialAgentChat.connectCandidate(101)).toBe(
      '/social-agent/chat/tasks/101/connect-candidate',
    );
    expect(fitMeetCoreEndpoints.socialAgentChat.messages).toBe(
      '/social-agent/chat/messages',
    );
    expect(fitMeetCoreEndpoints.socialAgentChat.routeMessage).toBe(
      '/social-agent/chat/route-message',
    );
  });
});
