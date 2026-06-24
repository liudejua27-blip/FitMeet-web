export const fitMeetCoreOpenApi = {
  openapi: '3.1.0',
  info: {
    title: 'FitMeet Core API',
    version: '2026-06-23-core',
    description:
      'Core contract for FitMeet Web, Agent, Discover, messages, profile, safety, uploads, and admin essentials.',
  },
  servers: [{ url: '/api' }],
  tags: [
    { name: 'system' },
    { name: 'auth' },
    { name: 'users' },
    { name: 'social-profile' },
    { name: 'discover' },
    { name: 'messages' },
    { name: 'friends' },
    { name: 'meets' },
    { name: 'social-agent' },
    { name: 'agent-control' },
    { name: 'safety' },
    { name: 'uploads' },
    { name: 'waitlist' },
    { name: 'admin' },
  ],
  paths: {
    '/health': path('system', 'getHealth'),
    '/ready': path('system', 'getReadiness'),
    '/auth/register': path('auth', 'register', 'post'),
    '/auth/login': path('auth', 'login', 'post'),
    '/auth/sms/send': path('auth', 'sendSmsCode', 'post'),
    '/auth/sms/verify': path('auth', 'verifySmsCode', 'post'),
    '/auth/wechat/url': path('auth', 'getWechatLoginUrl'),
    '/auth/wechat/login': path('auth', 'wechatLogin', 'post'),
    '/auth/refresh': path('auth', 'refreshToken', 'post'),
    '/auth/profile': path('auth', 'getProfile'),
    '/users/{id}': path('users', 'getPublicUser'),
    '/users/profile': path('users', 'updateProfile', 'put'),
    '/users/me/location': path('users', 'updateLocation', 'put'),
    '/users/me/social-profile': path(
      'social-profile',
      'getOrUpdateSocialProfile',
    ),
    '/users/me/social-profile/questions': path(
      'social-profile',
      'getSocialProfileQuestions',
    ),
    '/users/me/social-profile/ai-draft': path(
      'social-profile',
      'draftSocialProfile',
      'post',
    ),
    '/users/me/social-profile/ai-save': path(
      'social-profile',
      'saveSocialProfileDraft',
      'post',
    ),
    '/users/me/social-profile/completion': path(
      'social-profile',
      'getSocialProfileCompletion',
    ),
    '/users/me/social-profile/privacy': path(
      'social-profile',
      'getOrUpdateSocialProfilePrivacy',
    ),
    '/users/me/social-profile/sensitive-tags/pending': path(
      'social-profile',
      'getPendingSensitiveTags',
    ),
    '/users/me/social-profile/sensitive-tags/confirm': path(
      'social-profile',
      'confirmSensitiveTag',
      'post',
    ),
    '/users/me/social-profile/sensitive-tags/reject': path(
      'social-profile',
      'rejectSensitiveTag',
      'post',
    ),
    '/public/social-intents': path('discover', 'listPublicSocialIntents'),
    '/public/social-intents/{id}': path('discover', 'getPublicSocialIntent'),
    '/public/social-intents/{id}/matches': path(
      'discover',
      'getPublicSocialIntentMatches',
    ),
    '/meets': path('meets', 'listOrCreateMeets'),
    '/meets/{id}': path('meets', 'getMeet'),
    '/meets/{id}/join': path('meets', 'joinMeet', 'post'),
    '/meets/records/me': path('meets', 'getMyMeetRecords'),
    '/messages/start': path('messages', 'startConversation', 'post'),
    '/messages/conversations': path('messages', 'listConversations'),
    '/messages/conversations/{conversationId}': path(
      'messages',
      'listMessages',
    ),
    '/messages/conversations/{conversationId}/send': path(
      'messages',
      'sendMessage',
      'post',
    ),
    '/messages/public-intents/{id}/start': path(
      'messages',
      'startPublicIntentConversation',
      'post',
    ),
    '/messages/unread': path('messages', 'getUnreadCount'),
    '/friends': path('friends', 'listFriends'),
    '/friends/users/{id}/follow': path('friends', 'toggleFollow', 'post'),
    '/friends/following-ids': path('friends', 'getFollowingIds'),
    '/social-agent/chat/session': path('social-agent', 'restoreChatSession'),
    '/social-agent/chat/run': path('social-agent', 'runChat', 'post'),
    '/social-agent/chat/run-async': path(
      'social-agent',
      'runChatAsync',
      'post',
    ),
    '/social-agent/chat/messages/stream': path(
      'social-agent',
      'streamChatMessage',
      'post',
    ),
    '/social-agent/chat/route-message/stream': path(
      'social-agent',
      'streamRoutedChatMessage',
      'post',
    ),
    '/social-agent/chat/tasks/{taskId}/session': path(
      'social-agent',
      'restoreTaskSession',
    ),
    '/social-agent/chat/tasks/{taskId}/messages/stream': path(
      'social-agent',
      'streamTaskMessage',
      'post',
    ),
    '/social-agent/chat/tasks/{taskId}/publish-social-request': path(
      'social-agent',
      'publishOpportunityCard',
      'post',
    ),
    '/social-agent/chat/tasks/{taskId}/save-candidate': path(
      'social-agent',
      'saveCandidate',
      'post',
    ),
    '/social-agent/chat/tasks/{taskId}/send-message': path(
      'social-agent',
      'sendCandidateMessage',
      'post',
    ),
    '/social-agent/chat/tasks/{taskId}/connect-candidate': path(
      'social-agent',
      'connectCandidate',
      'post',
    ),
    '/social-agent/chat/checkpoints/{checkpointId}/retry/stream': path(
      'social-agent',
      'retryCheckpoint',
      'post',
    ),
    '/social-agent/chat/checkpoints/{checkpointId}/replay/stream': path(
      'social-agent',
      'replayCheckpoint',
      'post',
    ),
    '/social-agent/chat/checkpoints/{checkpointId}/fork/stream': path(
      'social-agent',
      'forkCheckpoint',
      'post',
    ),
    '/social-agent/tasks/current': path('social-agent', 'getCurrentTask'),
    '/social-agent/tasks/{taskId}/timeline': path(
      'social-agent',
      'getTaskTimeline',
    ),
    '/social-agent/tasks/{taskId}/events': path(
      'social-agent',
      'getTaskEvents',
    ),
    '/social-agent/tasks/{taskId}/replan': path(
      'social-agent',
      'replanTask',
      'post',
    ),
    '/social-agent/reminders': path('social-agent', 'listReminders'),
    '/social-agent/reminders/preferences': path(
      'social-agent',
      'getReminderPreferences',
    ),
    '/agent/checkpoints/tasks/{taskId}/latest': path(
      'agent-control',
      'getLatestCheckpoint',
    ),
    '/agent/checkpoints/{checkpointId}/retry': path(
      'agent-control',
      'retryCheckpoint',
      'post',
    ),
    '/agent/checkpoints/{checkpointId}/replay': path(
      'agent-control',
      'replayCheckpoint',
      'post',
    ),
    '/agent/checkpoints/{checkpointId}/fork': path(
      'agent-control',
      'forkCheckpoint',
      'post',
    ),
    '/social-agent/l5/dashboard': path('admin', 'getAgentL5Dashboard'),
    '/social-agent/l5/replay-samples': path(
      'admin',
      'listAgentL5ReplaySamples',
    ),
    '/social-agent/l5/subagent-memory': path('admin', 'listSubagentMemory'),
    '/social-agent/l5/meet-loop-states': path('admin', 'listMeetLoopStates'),
    '/safety/settings': path('safety', 'getOrUpdateSafetySettings'),
    '/safety/reports': path('safety', 'createOrListSafetyReports'),
    '/safety/blocks': path('safety', 'createOrListBlocks'),
    '/uploads/image': path('uploads', 'uploadImage', 'post'),
    '/uploads/video': path('uploads', 'uploadVideo', 'post'),
    '/waitlist': path('waitlist', 'joinWaitlist', 'post'),
    '/waitlist/admin/entries': path('admin', 'listWaitlistEntries'),
  },
  components: {
    schemas: {
      Ok: { type: 'object', additionalProperties: true },
    },
    responses: {
      Ok: {
        description: 'Successful response',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Ok' },
          },
        },
      },
    },
  },
} as const;

function path(
  tag: string,
  operationId: string,
  method: 'get' | 'post' | 'put' | 'patch' = 'get',
) {
  return {
    [method]: {
      tags: [tag],
      operationId,
      responses: {
        '200': { $ref: '#/components/responses/Ok' },
        '201': { $ref: '#/components/responses/Ok' },
      },
    },
  };
}
