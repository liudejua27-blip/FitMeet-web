import { describe, expect, it } from 'vitest';

import { fitMeetCoreEndpoints, fitMeetCoreEndpointTemplates } from '../api/fitmeetCoreContract';

describe('fitMeetCoreEndpoints', () => {
  it('keeps the App core smoke read-back endpoints in the typed registry', () => {
    expect(fitMeetCoreEndpoints.auth.getProfile).toBe('/auth/profile');
    expect(fitMeetCoreEndpoints.users.updateProfile).toBe('/users/profile');
    expect(fitMeetCoreEndpoints.uploads.image).toBe('/uploads/image');
    expect(fitMeetCoreEndpoints.feed.getFeed).toBe('/feed');
    expect(fitMeetCoreEndpoints.feed.createPost).toBe('/feed');
    expect(fitMeetCoreEndpoints.feed.publicSocialIntents).toBe('/public/social-intents');
    expect(fitMeetCoreEndpoints.feed.publicSocialIntent('intent:city run')).toBe(
      '/public/social-intents/intent%3Acity%20run',
    );
    expect(fitMeetCoreEndpoints.feed.publicSocialIntentMatches('intent:city run')).toBe(
      '/public/social-intents/intent%3Acity%20run/matches',
    );
    expect(fitMeetCoreEndpoints.messages.startConversation).toBe('/messages/start');
    expect(fitMeetCoreEndpoints.messages.getConversations).toBe('/messages/conversations');
    expect(fitMeetCoreEndpoints.messages.getConversationMessages('conv-123')).toBe(
      '/messages/conversations/conv-123',
    );
    expect(fitMeetCoreEndpoints.messages.getConversationMessages('conversation:city run')).toBe(
      '/messages/conversations/conversation%3Acity%20run',
    );
    expect(fitMeetCoreEndpoints.messages.sendConversationMessage('conv-123')).toBe(
      '/messages/conversations/conv-123/send',
    );
    expect(fitMeetCoreEndpoints.messages.sendConversationMessage('conversation:city run')).toBe(
      '/messages/conversations/conversation%3Acity%20run/send',
    );
    expect(fitMeetCoreEndpoints.messages.startPublicIntentConversation('intent:city run')).toBe(
      '/messages/public-intents/intent%3Acity%20run/start',
    );
    expect(fitMeetCoreEndpoints.messages.getUnreadCount).toBe('/messages/unread');
    expect(fitMeetCoreEndpoints.agentInbox.conversations).toBe('/agents/inbox/conversations');
    expect(fitMeetCoreEndpoints.agentInbox.events).toBe('/agents/inbox/events');
    expect(fitMeetCoreEndpoints.agentInbox.ackEvents).toBe('/agents/inbox/events/ack');
    expect(fitMeetCoreEndpoints.agentProfileMatches.list).toBe('/agents/profile-matches');
    expect(fitMeetCoreEndpoints.agentProfileMatches.ignore(101)).toBe(
      '/agents/profile-matches/101/ignore',
    );
    expect(fitMeetCoreEndpoints.agentProfileMatches.favorite(101)).toBe(
      '/agents/profile-matches/101/favorite',
    );
    expect(fitMeetCoreEndpoints.agentProfileMatches.draftOpener(101)).toBe(
      '/agents/profile-matches/101/draft-opener',
    );
    expect(fitMeetCoreEndpoints.agentProfileMatches.confirmContact(101)).toBe(
      '/agents/profile-matches/101/confirm-contact',
    );
    expect(fitMeetCoreEndpoints.agentProfileMatches.requestContactExchange(101)).toBe(
      '/agents/profile-matches/101/request-contact-exchange',
    );
    expect(fitMeetCoreEndpoints.agentProfileMatches.sendIntro(101)).toBe(
      '/agents/profile-matches/101/send-intro',
    );
    expect(fitMeetCoreEndpoints.agentInbox.messages('conversation:city run')).toBe(
      '/agents/inbox/conversations/conversation%3Acity%20run/messages',
    );
    expect(fitMeetCoreEndpoints.agentInbox.reply('conversation:city run')).toBe(
      '/agents/inbox/conversations/conversation%3Acity%20run/reply',
    );
    expect(fitMeetCoreEndpoints.socialAgentChat.session).toBe('/social-agent/chat/session');
    expect(fitMeetCoreEndpoints.socialAgentChat.run).toBe('/social-agent/chat/run');
    expect(fitMeetCoreEndpoints.socialAgentChat.runAsync).toBe('/social-agent/chat/run-async');
    expect(fitMeetCoreEndpoints.socialAgentChat.taskSession(101)).toBe(
      '/social-agent/chat/tasks/101/session',
    );
    expect(fitMeetCoreEndpoints.socialAgentChat.taskRunStatus(101, 'sar:city run')).toBe(
      '/social-agent/chat/tasks/101/runs/sar%3Acity%20run',
    );
    expect(fitMeetCoreEndpoints.socialAgentChat.taskMessages(101)).toBe(
      '/social-agent/chat/tasks/101/messages',
    );
    expect(fitMeetCoreEndpoints.socialAgentChat.publishSocialRequest(101)).toBe(
      '/social-agent/chat/tasks/101/publish-social-request',
    );
    expect(fitMeetCoreEndpoints.socialAgentChat.replanRun(101)).toBe(
      '/social-agent/chat/tasks/101/replan-run',
    );
    expect(fitMeetCoreEndpoints.socialAgentChat.appendContext(101)).toBe(
      '/social-agent/chat/tasks/101/append-context',
    );
    expect(fitMeetCoreEndpoints.socialAgentChat.taskActions(101)).toBe(
      '/social-agent/chat/tasks/101/actions',
    );
    expect(fitMeetCoreEndpoints.socialAgentChat.taskActionsStream(101)).toBe(
      '/social-agent/chat/tasks/101/actions/stream',
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
    expect(fitMeetCoreEndpoints.socialAgentChat.checkpointResumeStream('cp:101')).toBe(
      '/social-agent/chat/checkpoints/cp%3A101/resume/stream',
    );
    expect(fitMeetCoreEndpoints.socialAgentChat.checkpointReplayStream('cp:101')).toBe(
      '/social-agent/chat/checkpoints/cp%3A101/replay/stream',
    );
    expect(fitMeetCoreEndpoints.socialAgentChat.checkpointRetryStream('cp:101')).toBe(
      '/social-agent/chat/checkpoints/cp%3A101/retry/stream',
    );
    expect(fitMeetCoreEndpoints.socialAgentChat.checkpointForkStream('cp:101')).toBe(
      '/social-agent/chat/checkpoints/cp%3A101/fork/stream',
    );
    expect(
      fitMeetCoreEndpoints.socialAgentChat.checkpointStepRetryStream('cp:101', 'search candidates'),
    ).toBe('/social-agent/chat/checkpoints/cp%3A101/steps/search%20candidates/retry/stream');
    expect(
      fitMeetCoreEndpoints.socialAgentChat.checkpointStepReplayStream(
        'cp:101',
        'search candidates',
      ),
    ).toBe('/social-agent/chat/checkpoints/cp%3A101/steps/search%20candidates/replay/stream');
    expect(
      fitMeetCoreEndpoints.socialAgentChat.checkpointStepForkStream('cp:101', 'search candidates'),
    ).toBe('/social-agent/chat/checkpoints/cp%3A101/steps/search%20candidates/fork/stream');
    expect(fitMeetCoreEndpoints.agentControl.latestCheckpointForTask('task:101')).toBe(
      '/agent/checkpoints/tasks/task%3A101/latest',
    );
    expect(fitMeetCoreEndpoints.agentControl.checkpointRetry('cp:101')).toBe(
      '/agent/checkpoints/cp%3A101/retry',
    );
    expect(fitMeetCoreEndpoints.agentControl.checkpointReplay('cp:101')).toBe(
      '/agent/checkpoints/cp%3A101/replay',
    );
    expect(fitMeetCoreEndpoints.agentControl.checkpointFork('cp:101')).toBe(
      '/agent/checkpoints/cp%3A101/fork',
    );
    expect(
      fitMeetCoreEndpoints.agentControl.checkpointStepRetry('cp:101', 'search candidates'),
    ).toBe('/agent/checkpoints/cp%3A101/steps/search%20candidates/retry');
    expect(
      fitMeetCoreEndpoints.agentControl.checkpointStepReplay('cp:101', 'search candidates'),
    ).toBe('/agent/checkpoints/cp%3A101/steps/search%20candidates/replay');
    expect(
      fitMeetCoreEndpoints.agentControl.checkpointStepFork('cp:101', 'search candidates'),
    ).toBe('/agent/checkpoints/cp%3A101/steps/search%20candidates/fork');
    expect(fitMeetCoreEndpoints.socialAgentChat.messages).toBe('/social-agent/chat/messages');
    expect(fitMeetCoreEndpoints.socialAgentChat.messagesStream).toBe(
      '/social-agent/chat/messages/stream',
    );
    expect(fitMeetCoreEndpoints.socialAgentChat.routeMessage).toBe(
      '/social-agent/chat/route-message',
    );
    expect(fitMeetCoreEndpoints.socialAgentChat.routeMessageStream).toBe(
      '/social-agent/chat/route-message/stream',
    );
    expect(fitMeetCoreEndpoints.socialAgentChat.taskMessagesStream(101)).toBe(
      '/social-agent/chat/tasks/101/messages/stream',
    );
    expect(fitMeetCoreEndpoints.socialAgentTasks.current).toBe('/social-agent/tasks/current');
    expect(fitMeetCoreEndpoints.socialAgentTasks.timeline(101)).toBe(
      '/social-agent/tasks/101/timeline',
    );
    expect(fitMeetCoreEndpoints.socialAgentTasks.events(101)).toBe(
      '/social-agent/tasks/101/events',
    );
    expect(fitMeetCoreEndpoints.socialAgentTasks.eventsEval(101)).toBe(
      '/social-agent/tasks/101/events/eval',
    );
    expect(fitMeetCoreEndpoints.socialAgentTasks.eventsReplay(101)).toBe(
      '/social-agent/tasks/101/events/replay',
    );
    expect(fitMeetCoreEndpoints.socialAgentTasks.replan(101)).toBe(
      '/social-agent/tasks/101/replan',
    );
    expect(fitMeetCoreEndpoints.socialAgentReminders.list).toBe('/social-agent/reminders');
    expect(fitMeetCoreEndpoints.socialAgentReminders.preferences).toBe(
      '/social-agent/reminders/preferences',
    );
    expect(fitMeetCoreEndpoints.socialAgentReminders.runOnce).toBe(
      '/social-agent/reminders/run-once',
    );
    expect(fitMeetCoreEndpoints.socialAgentReminders.disable).toBe(
      '/social-agent/reminders/disable',
    );
    expect(fitMeetCoreEndpoints.socialAgentReminders.open('rem:101')).toBe(
      '/social-agent/reminders/rem%3A101/open',
    );
    expect(fitMeetCoreEndpoints.socialAgentReminders.dismiss('rem:101')).toBe(
      '/social-agent/reminders/rem%3A101/dismiss',
    );
    expect(fitMeetCoreEndpoints.socialAgentL5.dashboard).toBe('/social-agent/l5/dashboard');
    expect(fitMeetCoreEndpoints.socialAgentL5.replaySamples).toBe(
      '/social-agent/l5/replay-samples',
    );
    expect(fitMeetCoreEndpoints.socialAgentL5.subagentMemory).toBe(
      '/social-agent/l5/subagent-memory',
    );
    expect(fitMeetCoreEndpoints.socialAgentL5.meetLoopStates).toBe(
      '/social-agent/l5/meet-loop-states',
    );
    expect(fitMeetCoreEndpoints.socialAgentL5.patchEffects).toBe('/social-agent/l5/patch-effects');
    expect(fitMeetCoreEndpoints.socialAgentL5.autoRuns).toBe('/social-agent/l5/auto-runs');
    expect(fitMeetCoreEndpoints.socialAgentL5.observability).toBe('/social-agent/l5/observability');
    expect(fitMeetCoreEndpoints.socialAgentL5.recordSatisfaction).toBe(
      '/social-agent/l5/observability/satisfaction',
    );
    expect(fitMeetCoreEndpoints.socialAgentSelfImprove.runnerRunOnce).toBe(
      '/social-agent/self-improve/runner/run-once',
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
        '/public/social-intents',
        '/public/social-intents/{id}',
        '/public/social-intents/{id}/matches',
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
        '/agents/inbox/conversations',
        '/agents/inbox/events',
        '/agents/inbox/events/ack',
        '/agents/inbox/conversations/{conversationId}/messages',
        '/agents/inbox/conversations/{conversationId}/reply',
        '/agents/profile-matches',
        '/agents/profile-matches/{id}/ignore',
        '/agents/profile-matches/{id}/favorite',
        '/agents/profile-matches/{id}/draft-opener',
        '/agents/profile-matches/{id}/confirm-contact',
        '/agents/profile-matches/{id}/request-contact-exchange',
        '/agents/profile-matches/{id}/send-intro',
        '/social-agent/chat/run',
        '/social-agent/chat/run-async',
        '/social-agent/chat/messages',
        '/social-agent/chat/messages/stream',
        '/social-agent/chat/route-message',
        '/social-agent/chat/route-message/stream',
        '/social-agent/chat/stream',
        '/social-agent/chat/stream-user',
        '/social-agent/chat/session',
        '/social-agent/chat/tasks/{taskId}/session',
        '/social-agent/chat/tasks/{taskId}/runs/{runId}',
        '/social-agent/chat/tasks/{taskId}/messages',
        '/social-agent/chat/tasks/{taskId}/messages/stream',
        '/social-agent/chat/tasks/{taskId}/publish-social-request',
        '/social-agent/chat/tasks/{taskId}/replan-run',
        '/social-agent/chat/tasks/{taskId}/append-context',
        '/social-agent/chat/tasks/{taskId}/actions',
        '/social-agent/chat/tasks/{taskId}/actions/stream',
        '/social-agent/chat/tasks/{taskId}/save-candidate',
        '/social-agent/chat/tasks/{taskId}/send-message',
        '/social-agent/chat/tasks/{taskId}/connect-candidate',
        '/social-agent/chat/checkpoints/{checkpointId}/resume/stream',
        '/social-agent/chat/checkpoints/{checkpointId}/replay/stream',
        '/social-agent/chat/checkpoints/{checkpointId}/retry/stream',
        '/social-agent/chat/checkpoints/{checkpointId}/steps/{stepId}/retry/stream',
        '/social-agent/chat/checkpoints/{checkpointId}/steps/{stepId}/replay/stream',
        '/social-agent/chat/checkpoints/{checkpointId}/steps/{stepId}/fork/stream',
        '/social-agent/chat/checkpoints/{checkpointId}/fork/stream',
        '/agent/checkpoints/tasks/{taskId}/latest',
        '/agent/checkpoints/{checkpointId}/retry',
        '/agent/checkpoints/{checkpointId}/replay',
        '/agent/checkpoints/{checkpointId}/fork',
        '/agent/checkpoints/{checkpointId}/steps/{stepId}/retry',
        '/agent/checkpoints/{checkpointId}/steps/{stepId}/replay',
        '/agent/checkpoints/{checkpointId}/steps/{stepId}/fork',
        '/social-agent/tasks/current',
        '/social-agent/tasks/{taskId}/timeline',
        '/social-agent/tasks/{taskId}/events',
        '/social-agent/tasks/{taskId}/events/eval',
        '/social-agent/tasks/{taskId}/events/replay',
        '/social-agent/tasks/{taskId}/replan',
        '/social-agent/tasks/{taskId}/run-next',
        '/social-agent/reminders',
        '/social-agent/reminders/preferences',
        '/social-agent/reminders/run-once',
        '/social-agent/reminders/disable',
        '/social-agent/reminders/{id}/open',
        '/social-agent/reminders/{id}/dismiss',
        '/social-agent/l5/dashboard',
        '/social-agent/l5/replay-samples',
        '/social-agent/l5/subagent-memory',
        '/social-agent/l5/meet-loop-states',
        '/social-agent/l5/patch-effects',
        '/social-agent/l5/auto-runs',
        '/social-agent/l5/observability',
        '/social-agent/l5/observability/satisfaction',
        '/social-agent/l5/subagent-worker-jobs',
        '/social-agent/l5/subagent-worker-jobs/{id}/requeue',
        '/social-agent/l5/subagent-worker-jobs/{id}/cancel',
        '/social-agent/self-improve/runner/run-once',
        '/admin/rbac/roles',
        '/admin/rbac/users/{userId}/roles',
        '/admin/rbac/audit-logs',
        '/uploads/image',
        '/uploads/video',
      ]),
    );
  });

  it('normalizes dynamic endpoint builders back to their OpenAPI templates', () => {
    const examples = [
      {
        built: fitMeetCoreEndpoints.feed.publicSocialIntent('intent:city run'),
        template: fitMeetCoreEndpointTemplates.feed.publicSocialIntent,
      },
      {
        built: fitMeetCoreEndpoints.feed.publicSocialIntentMatches('intent:city run'),
        template: fitMeetCoreEndpointTemplates.feed.publicSocialIntentMatches,
      },
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
        built: fitMeetCoreEndpoints.messages.getConversationMessages('conversation:city run'),
        template: fitMeetCoreEndpointTemplates.messages.getConversationMessages,
      },
      {
        built: fitMeetCoreEndpoints.messages.sendConversationMessage('conversation:city run'),
        template: fitMeetCoreEndpointTemplates.messages.sendConversationMessage,
      },
      {
        built: fitMeetCoreEndpoints.messages.startPublicIntentConversation('intent:city run'),
        template: fitMeetCoreEndpointTemplates.messages.startPublicIntentConversation,
      },
      {
        built: fitMeetCoreEndpoints.agentInbox.messages('conversation:city run'),
        template: fitMeetCoreEndpointTemplates.agentInbox.messages,
      },
      {
        built: fitMeetCoreEndpoints.agentInbox.reply('conversation:city run'),
        template: fitMeetCoreEndpointTemplates.agentInbox.reply,
      },
      {
        built: fitMeetCoreEndpoints.agentProfileMatches.ignore(101),
        template: fitMeetCoreEndpointTemplates.agentProfileMatches.ignore,
      },
      {
        built: fitMeetCoreEndpoints.agentProfileMatches.favorite(101),
        template: fitMeetCoreEndpointTemplates.agentProfileMatches.favorite,
      },
      {
        built: fitMeetCoreEndpoints.agentProfileMatches.draftOpener(101),
        template: fitMeetCoreEndpointTemplates.agentProfileMatches.draftOpener,
      },
      {
        built: fitMeetCoreEndpoints.agentProfileMatches.confirmContact(101),
        template: fitMeetCoreEndpointTemplates.agentProfileMatches.confirmContact,
      },
      {
        built: fitMeetCoreEndpoints.agentProfileMatches.requestContactExchange(101),
        template: fitMeetCoreEndpointTemplates.agentProfileMatches.requestContactExchange,
      },
      {
        built: fitMeetCoreEndpoints.agentProfileMatches.sendIntro(101),
        template: fitMeetCoreEndpointTemplates.agentProfileMatches.sendIntro,
      },
      {
        built: fitMeetCoreEndpoints.socialAgentChat.taskSession(101),
        template: fitMeetCoreEndpointTemplates.socialAgentChat.taskSession,
      },
      {
        built: fitMeetCoreEndpoints.socialAgentChat.taskRunStatus(101, 'sar:city run'),
        template: fitMeetCoreEndpointTemplates.socialAgentChat.taskRunStatus,
      },
      {
        built: fitMeetCoreEndpoints.socialAgentChat.taskMessages(101),
        template: fitMeetCoreEndpointTemplates.socialAgentChat.taskMessages,
      },
      {
        built: fitMeetCoreEndpoints.socialAgentChat.publishSocialRequest(101),
        template: fitMeetCoreEndpointTemplates.socialAgentChat.publishSocialRequest,
      },
      {
        built: fitMeetCoreEndpoints.socialAgentChat.replanRun(101),
        template: fitMeetCoreEndpointTemplates.socialAgentChat.replanRun,
      },
      {
        built: fitMeetCoreEndpoints.socialAgentChat.appendContext(101),
        template: fitMeetCoreEndpointTemplates.socialAgentChat.appendContext,
      },
      {
        built: fitMeetCoreEndpoints.socialAgentChat.taskActions(101),
        template: fitMeetCoreEndpointTemplates.socialAgentChat.taskActions,
      },
      {
        built: fitMeetCoreEndpoints.socialAgentChat.taskActionsStream(101),
        template: fitMeetCoreEndpointTemplates.socialAgentChat.taskActionsStream,
      },
      {
        built: fitMeetCoreEndpoints.socialAgentChat.saveCandidate(101),
        template: fitMeetCoreEndpointTemplates.socialAgentChat.saveCandidate,
      },
      {
        built: fitMeetCoreEndpoints.socialAgentChat.sendCandidateMessage(101),
        template: fitMeetCoreEndpointTemplates.socialAgentChat.sendCandidateMessage,
      },
      {
        built: fitMeetCoreEndpoints.socialAgentChat.connectCandidate(101),
        template: fitMeetCoreEndpointTemplates.socialAgentChat.connectCandidate,
      },
      {
        built: fitMeetCoreEndpoints.socialAgentTasks.timeline(101),
        template: fitMeetCoreEndpointTemplates.socialAgentTasks.timeline,
      },
      {
        built: fitMeetCoreEndpoints.socialAgentTasks.events(101),
        template: fitMeetCoreEndpointTemplates.socialAgentTasks.events,
      },
      {
        built: fitMeetCoreEndpoints.socialAgentTasks.eventsEval(101),
        template: fitMeetCoreEndpointTemplates.socialAgentTasks.eventsEval,
      },
      {
        built: fitMeetCoreEndpoints.socialAgentTasks.eventsReplay(101),
        template: fitMeetCoreEndpointTemplates.socialAgentTasks.eventsReplay,
      },
      {
        built: fitMeetCoreEndpoints.socialAgentTasks.replan(101),
        template: fitMeetCoreEndpointTemplates.socialAgentTasks.replan,
      },
      {
        built: fitMeetCoreEndpoints.socialAgentReminders.open('rem:101'),
        template: fitMeetCoreEndpointTemplates.socialAgentReminders.open,
      },
      {
        built: fitMeetCoreEndpoints.socialAgentReminders.dismiss('rem:101'),
        template: fitMeetCoreEndpointTemplates.socialAgentReminders.dismiss,
      },
    ];

    for (const example of examples) {
      expect(normalizeBuiltPath(example.built)).toBe(normalizeTemplatePath(example.template));
    }
    expect(
      fitMeetCoreEndpoints.messages.startPublicIntentConversation('intent:city run'),
    ).toContain('intent%3Acity%20run');
  });
});

function flattenEndpointTemplates(): string[] {
  return Object.values(fitMeetCoreEndpointTemplates).flatMap((group) => Object.values(group));
}

function normalizeTemplatePath(path: string): string {
  return path.replace(/\{[^/}]+\}/g, ':param');
}

function normalizeBuiltPath(path: string): string {
  return path
    .replace(/\/\d+(?=\/|$)/g, '/:param')
    .replace(/\/conv-[^/]+(?=\/|$)/g, '/:param')
    .replace(/\/conversation%3Acity%20run(?=\/|$)/g, '/:param')
    .replace(/\/sar%3Acity%20run(?=\/|$)/g, '/:param')
    .replace(/\/intent%3Acity%20run(?=\/|$)/g, '/:param')
    .replace(/\/rem%3A101(?=\/|$)/g, '/:param');
}
