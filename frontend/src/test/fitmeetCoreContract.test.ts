import { describe, expect, it } from 'vitest';

import { fitMeetCoreOpenApi } from '../../../backend/src/openapi/fitmeet-core.openapi';
import {
  fitMeetCoreEndpointMethods,
  fitMeetCoreEndpoints,
  fitMeetCoreEndpointTemplates,
} from '../api/fitmeetCoreContract';

describe('fitMeetCoreEndpoints', () => {
  it('keeps the App core smoke read-back endpoints in the typed registry', () => {
    expect(fitMeetCoreEndpoints.auth.getProfile).toBe('/auth/profile');
    expect(fitMeetCoreEndpoints.system.health).toBe('/health');
    expect(fitMeetCoreEndpoints.system.readiness).toBe('/ready');
    expect(fitMeetCoreEndpoints.users.getPublicUser('user:42')).toBe('/users/user%3A42');
    expect(fitMeetCoreEndpoints.users.updateProfile).toBe('/users/profile');
    expect(fitMeetCoreEndpoints.users.updateLocation).toBe('/users/me/location');
    expect(fitMeetCoreEndpoints.socialProfile.current).toBe('/users/me/social-profile');
    expect(fitMeetCoreEndpoints.socialProfile.privacy).toBe('/users/me/social-profile/privacy');
    expect(fitMeetCoreEndpoints.uploads.image).toBe('/uploads/image');
    expect(fitMeetCoreEndpoints.discover.publicSocialIntents).toBe('/public/social-intents');
    expect(fitMeetCoreEndpoints.discover.publicSocialIntent('intent:city run')).toBe(
      '/public/social-intents/intent%3Acity%20run',
    );
    expect(fitMeetCoreEndpoints.discover.publicSocialIntentMatches('intent:city run')).toBe(
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
    expect(fitMeetCoreEndpoints.friends.followUser('user:42')).toBe('/users/user%3A42/follow');
    expect(fitMeetCoreEndpoints.friends.isFollowing('user:42')).toBe('/users/user%3A42/following');
    expect(fitMeetCoreEndpoints.friends.followingIds).toBe('/following/ids');
    expect(fitMeetCoreEndpoints.safety.blockUser('user:42')).toBe('/safety/blocks/user%3A42');
    expect(fitMeetCoreEndpoints.safety.unblockUser('user:42')).toBe('/safety/blocks/user%3A42');
    expect(fitMeetCoreEndpoints.safety.blockedIds).toBe('/safety/blocks/ids');
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
    const templates = new Set(flattenEndpointTemplates());
    for (const path of Object.keys(fitMeetCoreEndpointMethods)) {
      expect(templates).toContain(path);
    }
    expect(templates).not.toContain('/friends/users/{id}/follow');
    expect(templates).not.toContain('/friends/following-ids');
    expect(templates).not.toContain('/safety/blocks');
  });

  it('keeps OpenAPI paths and methods aligned with the frontend method registry', () => {
    const openApiMethods = Object.fromEntries(
      Object.entries(fitMeetCoreOpenApi.paths).map(([path, item]) => [
        path,
        Object.keys(item).sort(),
      ]),
    );
    const registryMethods = Object.fromEntries(
      Object.entries(fitMeetCoreEndpointMethods).map(([path, methods]) => [
        path,
        [...methods].sort(),
      ]),
    );

    expect(openApiMethods).toEqual(registryMethods);
    expect(openApiMethods['/users/me/social-profile']).toEqual(['get', 'put']);
    expect(openApiMethods['/users/me/social-profile/privacy']).toEqual(['get', 'patch']);
    expect(openApiMethods['/users/{id}/follow']).toEqual(['post']);
    expect(openApiMethods['/safety/blocks/{id}']).toEqual(['delete', 'post']);
  });

  it('keeps OpenAPI request bodies and path parameters structurally valid', () => {
    expect(requestContentTypes('/uploads/image', 'post')).toContain('multipart/form-data');
    expect(requestContentTypes('/uploads/video', 'post')).toContain('multipart/form-data');
    expect(requestContentTypes('/auth/login', 'post')).toContain('application/json');

    for (const [path, item] of Object.entries(fitMeetCoreOpenApi.paths)) {
      const requiredPathParams = Array.from(path.matchAll(/\{([^/}]+)\}/g), (match) => match[1]);
      if (requiredPathParams.length === 0) continue;

      for (const method of Object.keys(item)) {
        const operation = item[method as keyof typeof item] as {
          parameters?: Array<{ name?: string; in?: string; required?: boolean }>;
        };
        for (const paramName of requiredPathParams) {
          expect(operation.parameters).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                name: paramName,
                in: 'path',
                required: true,
              }),
            ]),
          );
        }
      }
    }
  });

  it('normalizes dynamic endpoint builders back to their OpenAPI templates', () => {
    const examples = [
      {
        built: fitMeetCoreEndpoints.discover.publicSocialIntent('intent:city run'),
        template: fitMeetCoreEndpointTemplates.discover.publicSocialIntent,
      },
      {
        built: fitMeetCoreEndpoints.discover.publicSocialIntentMatches('intent:city run'),
        template: fitMeetCoreEndpointTemplates.discover.publicSocialIntentMatches,
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
        built: fitMeetCoreEndpoints.users.getPublicUser('user:42'),
        template: fitMeetCoreEndpointTemplates.users.getPublicUser,
      },
      {
        built: fitMeetCoreEndpoints.friends.followUser('user:42'),
        template: fitMeetCoreEndpointTemplates.friends.followUser,
      },
      {
        built: fitMeetCoreEndpoints.friends.isFollowing('user:42'),
        template: fitMeetCoreEndpointTemplates.friends.isFollowing,
      },
      {
        built: fitMeetCoreEndpoints.safety.blockUser('user:42'),
        template: fitMeetCoreEndpointTemplates.safety.blockUser,
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

function requestContentTypes(path: string, method: string): string[] {
  const paths = fitMeetCoreOpenApi.paths as Record<
    string,
    Record<string, { requestBody?: { content?: Record<string, unknown> } }>
  >;
  const operation = paths[path]?.[method];
  return Object.keys(operation?.requestBody?.content ?? {});
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
    .replace(/\/rem%3A101(?=\/|$)/g, '/:param')
    .replace(/\/user%3A42(?=\/|$)/g, '/:param');
}
