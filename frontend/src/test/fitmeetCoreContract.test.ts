import { describe, expect, it } from 'vitest';

import {
  fitMeetCoreEndpoints,
  fitMeetCoreEndpointTemplates,
} from '../api/fitmeetCoreContract';

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
    expect(fitMeetCoreEndpoints.socialAgentTasks.current).toBe(
      '/social-agent/tasks/current',
    );
    expect(fitMeetCoreEndpoints.socialAgentTasks.timeline(101)).toBe(
      '/social-agent/tasks/101/timeline',
    );
  });

  it('keeps the frontend endpoint templates aligned with the shared OpenAPI path set', () => {
    expect(new Set(flattenEndpointTemplates())).toEqual(
      new Set([
        '/auth/register',
        '/auth/login',
        '/auth/sms/send',
        '/auth/sms/verify',
        '/auth/wechat/url',
        '/auth/wechat/login',
        '/auth/refresh',
        '/auth/profile',
        '/users/profile',
        '/feed',
        '/feed/interactions',
        '/feed/{id}/like',
        '/feed/{id}/save',
        '/feed/{postId}/comments',
        '/feed/comments/{commentId}/like',
        '/messages/start',
        '/messages/conversations',
        '/messages/conversations/{conversationId}',
        '/messages/conversations/{conversationId}/send',
        '/messages/public-intents/{id}/start',
        '/messages/unread',
        '/social-agent/chat/messages',
        '/social-agent/chat/route-message',
        '/social-agent/chat/stream',
        '/social-agent/chat/stream-user',
        '/social-agent/chat/session',
        '/social-agent/chat/tasks/{taskId}/session',
        '/social-agent/chat/tasks/{taskId}/messages',
        '/social-agent/chat/tasks/{taskId}/actions',
        '/social-agent/chat/tasks/{taskId}/save-candidate',
        '/social-agent/chat/tasks/{taskId}/send-message',
        '/social-agent/chat/tasks/{taskId}/connect-candidate',
        '/social-agent/tasks/current',
        '/social-agent/tasks/{taskId}/timeline',
        '/uploads/image',
        '/uploads/video',
      ]),
    );
  });

  it('normalizes dynamic endpoint builders back to their OpenAPI templates', () => {
    const examples = [
      {
        built: fitMeetCoreEndpoints.feed.likePost(123),
        template: fitMeetCoreEndpointTemplates.feed.likePost,
      },
      {
        built: fitMeetCoreEndpoints.feed.savePost(123),
        template: fitMeetCoreEndpointTemplates.feed.savePost,
      },
      {
        built: fitMeetCoreEndpoints.feed.getComments(123),
        template: fitMeetCoreEndpointTemplates.feed.getComments,
      },
      {
        built: fitMeetCoreEndpoints.feed.addComment(123),
        template: fitMeetCoreEndpointTemplates.feed.addComment,
      },
      {
        built: fitMeetCoreEndpoints.feed.likeComment(456),
        template: fitMeetCoreEndpointTemplates.feed.likeComment,
      },
      {
        built: fitMeetCoreEndpoints.messages.getConversationMessages(
          'conv-123',
        ),
        template: fitMeetCoreEndpointTemplates.messages.getConversationMessages,
      },
      {
        built: fitMeetCoreEndpoints.messages.sendConversationMessage(
          'conv-123',
        ),
        template: fitMeetCoreEndpointTemplates.messages.sendConversationMessage,
      },
      {
        built: fitMeetCoreEndpoints.messages.startPublicIntentConversation(
          'intent:city run',
        ),
        template:
          fitMeetCoreEndpointTemplates.messages.startPublicIntentConversation,
      },
      {
        built: fitMeetCoreEndpoints.socialAgentChat.taskSession(101),
        template: fitMeetCoreEndpointTemplates.socialAgentChat.taskSession,
      },
      {
        built: fitMeetCoreEndpoints.socialAgentChat.taskMessages(101),
        template: fitMeetCoreEndpointTemplates.socialAgentChat.taskMessages,
      },
      {
        built: fitMeetCoreEndpoints.socialAgentChat.taskActions(101),
        template: fitMeetCoreEndpointTemplates.socialAgentChat.taskActions,
      },
      {
        built: fitMeetCoreEndpoints.socialAgentChat.saveCandidate(101),
        template: fitMeetCoreEndpointTemplates.socialAgentChat.saveCandidate,
      },
      {
        built: fitMeetCoreEndpoints.socialAgentChat.sendCandidateMessage(101),
        template:
          fitMeetCoreEndpointTemplates.socialAgentChat.sendCandidateMessage,
      },
      {
        built: fitMeetCoreEndpoints.socialAgentChat.connectCandidate(101),
        template: fitMeetCoreEndpointTemplates.socialAgentChat.connectCandidate,
      },
      {
        built: fitMeetCoreEndpoints.socialAgentTasks.timeline(101),
        template: fitMeetCoreEndpointTemplates.socialAgentTasks.timeline,
      },
    ];

    for (const example of examples) {
      expect(normalizeBuiltPath(example.built)).toBe(
        normalizeTemplatePath(example.template),
      );
    }
    expect(
      fitMeetCoreEndpoints.messages.startPublicIntentConversation(
        'intent:city run',
      ),
    ).toContain('intent%3Acity%20run');
  });
});

function flattenEndpointTemplates(): string[] {
  return Object.values(fitMeetCoreEndpointTemplates).flatMap((group) =>
    Object.values(group),
  );
}

function normalizeTemplatePath(path: string): string {
  return path.replace(/\{[^/}]+\}/g, ':param');
}

function normalizeBuiltPath(path: string): string {
  return path
    .replace(/\/\d+(?=\/|$)/g, '/:param')
    .replace(/\/conv-[^/]+(?=\/|$)/g, '/:param')
    .replace(/\/intent%3Acity%20run(?=\/|$)/g, '/:param');
}
