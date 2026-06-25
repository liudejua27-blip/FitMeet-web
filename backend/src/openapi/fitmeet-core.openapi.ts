type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
type JsonSchema = Record<string, unknown>;
type RequestContentType = 'application/json' | 'multipart/form-data';
type OpenApiParameter = {
  name: string;
  in: 'path' | 'header';
  required: boolean;
  schema: JsonSchema;
};
type OpenApiOperation = {
  tags: string[];
  operationId: string;
  summary?: string;
  security?: Array<Record<string, unknown[]>>;
  parameters?: OpenApiParameter[];
  requestBody?: {
    required: boolean;
    content: Record<string, { schema: JsonSchema }>;
  };
  responses: Record<string, unknown>;
};
type OperationPathItem = Partial<Record<HttpMethod, OpenApiOperation>>;

type OperationOptions = {
  summary?: string;
  requestSchema?: JsonSchema;
  requestContentType?: RequestContentType;
  responseSchema?: JsonSchema;
  parameters?: OpenApiParameter[];
  auth?: boolean;
  status?: '200' | '201' | '204';
};

const httpMethods = ['get', 'post', 'put', 'patch', 'delete'] as const;
const bearerSecurity: Array<Record<string, unknown[]>> = [{ bearerAuth: [] }];

export const fitMeetCoreOpenApi = {
  openapi: '3.1.0',
  info: {
    title: 'FitMeet Core API',
    version: '2026-06-25-core-contract-hardening',
    description:
      'Core contract for FitMeet Web, Agent, Discover, messages, profile, safety, uploads, and admin essentials.',
  },
  servers: [{ url: '/api' }],
  security: bearerSecurity,
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
  paths: withPathParameters({
    '/health': path('get', 'system', 'getHealth', {
      auth: false,
      responseSchema: ref('SystemHealth'),
    }),
    '/ready': path('get', 'system', 'getReadiness', {
      auth: false,
      responseSchema: ref('SystemHealth'),
    }),
    '/auth/register': path('post', 'auth', 'register', {
      auth: false,
      requestSchema: ref('AuthCredentialsRequest'),
      responseSchema: ref('AuthTokenResponse'),
    }),
    '/auth/login': path('post', 'auth', 'login', {
      auth: false,
      requestSchema: ref('AuthCredentialsRequest'),
      responseSchema: ref('AuthTokenResponse'),
    }),
    '/auth/sms/send': path('post', 'auth', 'sendSmsCode', {
      auth: false,
      requestSchema: ref('SmsSendRequest'),
      responseSchema: ref('ActionAccepted'),
    }),
    '/auth/sms/verify': path('post', 'auth', 'verifySmsCode', {
      auth: false,
      requestSchema: ref('SmsVerifyRequest'),
      responseSchema: ref('AuthTokenResponse'),
    }),
    '/auth/wechat/url': path('get', 'auth', 'getWechatLoginUrl', {
      auth: false,
      responseSchema: ref('WechatLoginUrlResponse'),
    }),
    '/auth/wechat/login': path('post', 'auth', 'wechatLogin', {
      auth: false,
      requestSchema: ref('WechatLoginRequest'),
      responseSchema: ref('AuthTokenResponse'),
    }),
    '/auth/refresh': path('post', 'auth', 'refreshToken', {
      auth: false,
      requestSchema: ref('RefreshTokenRequest'),
      responseSchema: ref('AuthTokenResponse'),
    }),
    '/auth/profile': path('get', 'auth', 'getProfile', {
      responseSchema: ref('AuthProfile'),
    }),
    '/users/{id}': path('get', 'users', 'getPublicUser', {
      auth: false,
      responseSchema: ref('PublicUserProfile'),
    }),
    '/users/profile': path('put', 'users', 'updateProfile', {
      requestSchema: ref('UpdateProfileRequest'),
      responseSchema: ref('AuthProfile'),
    }),
    '/users/me/location': path('put', 'users', 'updateLocation', {
      requestSchema: ref('UpdateLocationRequest'),
      responseSchema: ref('ActionAccepted'),
    }),
    '/users/me/social-profile': operations(
      operation('get', 'social-profile', 'getSocialProfile', {
        responseSchema: ref('SocialProfile'),
      }),
      operation('put', 'social-profile', 'updateSocialProfile', {
        requestSchema: ref('UpdateSocialProfileRequest'),
        responseSchema: ref('SocialProfile'),
      }),
    ),
    '/users/me/social-profile/questions': path(
      'get',
      'social-profile',
      'getSocialProfileQuestions',
      { responseSchema: ref('SocialProfileQuestionList') },
    ),
    '/users/me/social-profile/answers': path(
      'post',
      'social-profile',
      'saveSocialProfileAnswer',
      {
        requestSchema: ref('SocialProfileAnswerRequest'),
        responseSchema: ref('SocialProfile'),
      },
    ),
    '/users/me/social-profile/ai-draft': path(
      'post',
      'social-profile',
      'draftSocialProfile',
      {
        requestSchema: ref('SocialProfileAiDraftRequest'),
        responseSchema: ref('SocialProfileAiDraftResponse'),
      },
    ),
    '/users/me/social-profile/ai-save': path(
      'post',
      'social-profile',
      'saveSocialProfileDraft',
      {
        requestSchema: ref('SocialProfileAiSaveRequest'),
        responseSchema: ref('SocialProfile'),
      },
    ),
    '/users/me/social-profile/completion': path(
      'get',
      'social-profile',
      'getSocialProfileCompletion',
      { responseSchema: ref('SocialProfileCompletion') },
    ),
    '/users/me/social-profile/privacy': operations(
      operation('get', 'social-profile', 'getSocialProfilePrivacy', {
        responseSchema: ref('SocialProfilePrivacy'),
      }),
      operation('patch', 'social-profile', 'updateSocialProfilePrivacy', {
        requestSchema: ref('UpdateSocialProfilePrivacyRequest'),
        responseSchema: ref('SocialProfilePrivacy'),
      }),
    ),
    '/users/me/social-profile/sensitive-tags/pending': path(
      'get',
      'social-profile',
      'getPendingSensitiveTags',
      { responseSchema: ref('SensitiveTagList') },
    ),
    '/users/me/social-profile/sensitive-tags/confirm': path(
      'post',
      'social-profile',
      'confirmSensitiveTag',
      {
        requestSchema: ref('SensitiveTagActionRequest'),
        responseSchema: ref('SocialProfile'),
      },
    ),
    '/users/me/social-profile/sensitive-tags/reject': path(
      'post',
      'social-profile',
      'rejectSensitiveTag',
      {
        requestSchema: ref('SensitiveTagActionRequest'),
        responseSchema: ref('SocialProfile'),
      },
    ),
    '/public/social-intents': path(
      'get',
      'discover',
      'listPublicSocialIntents',
      {
        auth: false,
        responseSchema: ref('PublicSocialIntentPage'),
      },
    ),
    '/public/social-intents/{id}': path(
      'get',
      'discover',
      'getPublicSocialIntent',
      {
        auth: false,
        responseSchema: ref('PublicSocialIntent'),
      },
    ),
    '/public/social-intents/{id}/matches': path(
      'get',
      'discover',
      'getPublicSocialIntentMatches',
      { auth: false, responseSchema: ref('PublicSocialIntentMatchList') },
    ),
    '/meets': operations(
      operation('get', 'meets', 'listMeets', {
        responseSchema: ref('MeetPage'),
      }),
      operation('post', 'meets', 'createMeet', {
        requestSchema: ref('CreateMeetRequest'),
        responseSchema: ref('Meet'),
      }),
    ),
    '/meets/{id}': path('get', 'meets', 'getMeet', {
      responseSchema: ref('Meet'),
    }),
    '/meets/{id}/join': path('post', 'meets', 'joinMeet', {
      responseSchema: ref('MeetJoinResponse'),
    }),
    '/meets/records/me': path('get', 'meets', 'getMyMeetRecords', {
      responseSchema: ref('MeetRecordPage'),
    }),
    '/messages/start': path('post', 'messages', 'startConversation', {
      requestSchema: ref('StartConversationRequest'),
      responseSchema: ref('Conversation'),
    }),
    '/messages/conversations': path('get', 'messages', 'listConversations', {
      responseSchema: ref('ConversationPage'),
    }),
    '/messages/conversations/{conversationId}': path(
      'get',
      'messages',
      'listMessages',
      {
        responseSchema: ref('MessagePage'),
      },
    ),
    '/messages/conversations/{conversationId}/send': path(
      'post',
      'messages',
      'sendMessage',
      {
        requestSchema: ref('SendMessageRequest'),
        responseSchema: ref('Message'),
      },
    ),
    '/messages/public-intents/{id}/start': path(
      'post',
      'messages',
      'startPublicIntentConversation',
      { responseSchema: ref('Conversation') },
    ),
    '/messages/unread': path('get', 'messages', 'getUnreadCount', {
      responseSchema: ref('UnreadCountResponse'),
    }),
    '/friends': path('get', 'friends', 'listFriends', {
      responseSchema: ref('FriendPage'),
    }),
    '/users/{id}/follow': path('post', 'friends', 'toggleFollow', {
      responseSchema: ref('FollowState'),
    }),
    '/users/{id}/following': path('get', 'friends', 'isFollowing', {
      responseSchema: ref('FollowingState'),
    }),
    '/following/ids': path('get', 'friends', 'getFollowingIds', {
      responseSchema: ref('IdListResponse'),
    }),
    '/social-agent/chat/session': path(
      'get',
      'social-agent',
      'restoreChatSession',
      {
        responseSchema: ref('SocialAgentSession'),
      },
    ),
    '/social-agent/chat/run': path('post', 'social-agent', 'runChat', {
      requestSchema: ref('SocialAgentRunRequest'),
      responseSchema: ref('SocialAgentRunResponse'),
    }),
    '/social-agent/chat/run-async': path(
      'post',
      'social-agent',
      'runChatAsync',
      {
        requestSchema: ref('SocialAgentRunRequest'),
        responseSchema: ref('SocialAgentAsyncRunResponse'),
      },
    ),
    '/social-agent/chat/messages/stream': path(
      'post',
      'social-agent',
      'streamChatMessage',
      {
        requestSchema: ref('SocialAgentMessageRequest'),
        responseSchema: ref('StreamResponse'),
      },
    ),
    '/social-agent/chat/route-message/stream': path(
      'post',
      'social-agent',
      'streamRoutedChatMessage',
      {
        requestSchema: ref('SocialAgentMessageRequest'),
        responseSchema: ref('StreamResponse'),
      },
    ),
    '/social-agent/chat/tasks/{taskId}/session': path(
      'get',
      'social-agent',
      'restoreTaskSession',
      { responseSchema: ref('SocialAgentSession') },
    ),
    '/social-agent/chat/tasks/{taskId}/messages/stream': path(
      'post',
      'social-agent',
      'streamTaskMessage',
      {
        requestSchema: ref('SocialAgentMessageRequest'),
        responseSchema: ref('StreamResponse'),
      },
    ),
    '/social-agent/chat/tasks/{taskId}/publish-social-request': path(
      'post',
      'social-agent',
      'publishOpportunityCard',
      { responseSchema: ref('ActionAccepted') },
    ),
    '/social-agent/chat/tasks/{taskId}/save-candidate': path(
      'post',
      'social-agent',
      'saveCandidate',
      { responseSchema: ref('CandidateActionResponse') },
    ),
    '/social-agent/chat/tasks/{taskId}/send-message': path(
      'post',
      'social-agent',
      'sendCandidateMessage',
      {
        requestSchema: ref('CandidateMessageRequest'),
        responseSchema: ref('CandidateActionResponse'),
      },
    ),
    '/social-agent/chat/tasks/{taskId}/connect-candidate': path(
      'post',
      'social-agent',
      'connectCandidate',
      { responseSchema: ref('CandidateActionResponse') },
    ),
    '/social-agent/chat/checkpoints/{checkpointId}/retry/stream': path(
      'post',
      'social-agent',
      'retryCheckpoint',
      { responseSchema: ref('StreamResponse') },
    ),
    '/social-agent/chat/checkpoints/{checkpointId}/replay/stream': path(
      'post',
      'social-agent',
      'replayCheckpoint',
      { responseSchema: ref('StreamResponse') },
    ),
    '/social-agent/chat/checkpoints/{checkpointId}/fork/stream': path(
      'post',
      'social-agent',
      'forkCheckpoint',
      { responseSchema: ref('StreamResponse') },
    ),
    '/social-agent/tasks/current': path(
      'get',
      'social-agent',
      'getCurrentTask',
      {
        responseSchema: ref('SocialAgentTask'),
      },
    ),
    '/social-agent/tasks/{taskId}/timeline': path(
      'get',
      'social-agent',
      'getTaskTimeline',
      { responseSchema: ref('SocialAgentTimeline') },
    ),
    '/social-agent/tasks/{taskId}/events': path(
      'get',
      'social-agent',
      'getTaskEvents',
      {
        responseSchema: ref('SocialAgentEventPage'),
      },
    ),
    '/social-agent/tasks/{taskId}/replan': path(
      'post',
      'social-agent',
      'replanTask',
      {
        responseSchema: ref('ActionAccepted'),
      },
    ),
    '/social-agent/reminders': path('get', 'social-agent', 'listReminders', {
      responseSchema: ref('ReminderPage'),
    }),
    '/social-agent/reminders/preferences': path(
      'get',
      'social-agent',
      'getReminderPreferences',
      { responseSchema: ref('ReminderPreferences') },
    ),
    '/agent/checkpoints/tasks/{taskId}/latest': path(
      'get',
      'agent-control',
      'getLatestCheckpoint',
      { responseSchema: ref('AgentCheckpoint') },
    ),
    '/agent/checkpoints/{checkpointId}/retry': path(
      'post',
      'agent-control',
      'retryCheckpoint',
      { responseSchema: ref('ActionAccepted') },
    ),
    '/agent/checkpoints/{checkpointId}/replay': path(
      'post',
      'agent-control',
      'replayCheckpoint',
      { responseSchema: ref('ActionAccepted') },
    ),
    '/agent/checkpoints/{checkpointId}/fork': path(
      'post',
      'agent-control',
      'forkCheckpoint',
      { responseSchema: ref('ActionAccepted') },
    ),
    '/social-agent/l5/dashboard': path('get', 'admin', 'getAgentL5Dashboard', {
      responseSchema: ref('AdminDashboard'),
    }),
    '/social-agent/l5/replay-samples': path(
      'get',
      'admin',
      'listAgentL5ReplaySamples',
      {
        responseSchema: ref('AdminListResponse'),
      },
    ),
    '/social-agent/l5/subagent-memory': path(
      'get',
      'admin',
      'listSubagentMemory',
      {
        responseSchema: ref('AdminListResponse'),
      },
    ),
    '/social-agent/l5/meet-loop-states': path(
      'get',
      'admin',
      'listMeetLoopStates',
      {
        responseSchema: ref('AdminListResponse'),
      },
    ),
    '/safety/reports': path('post', 'safety', 'createReport', {
      requestSchema: ref('CreateReportRequest'),
      responseSchema: ref('SafetyReport'),
    }),
    '/safety/blocks/{id}': operations(
      operation('post', 'safety', 'blockUser', {
        responseSchema: ref('SafetyBlockActionResponse'),
      }),
      operation('delete', 'safety', 'unblockUser', {
        responseSchema: ref('SafetyBlockActionResponse'),
      }),
    ),
    '/safety/blocks/ids': path('get', 'safety', 'getBlockedUserIds', {
      responseSchema: ref('IdListResponse'),
    }),
    '/uploads/image': path('post', 'uploads', 'uploadImage', {
      requestSchema: ref('UploadImageRequest'),
      requestContentType: 'multipart/form-data',
      responseSchema: ref('UploadImageResponse'),
    }),
    '/uploads/video': path('post', 'uploads', 'uploadVideo', {
      requestSchema: ref('UploadVideoRequest'),
      requestContentType: 'multipart/form-data',
      responseSchema: ref('UploadVideoResponse'),
    }),
    '/waitlist': path('post', 'waitlist', 'joinWaitlist', {
      auth: false,
      requestSchema: ref('WaitlistRequest'),
      responseSchema: ref('WaitlistEntry'),
    }),
    '/waitlist/admin/entries': path('get', 'admin', 'listWaitlistEntries', {
      responseSchema: ref('WaitlistEntryPage'),
    }),
  }),
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      ActionAccepted: objectSchema({
        success: { type: 'boolean' },
        message: { type: 'string' },
      }),
      AdminDashboard: objectSchema({
        generatedAt: { type: 'string', format: 'date-time' },
      }),
      AdminListResponse: arraySchema({
        type: 'object',
        additionalProperties: true,
      }),
      AgentCheckpoint: objectSchema({
        id: { oneOf: [{ type: 'string' }, { type: 'number' }] },
        taskId: { oneOf: [{ type: 'string' }, { type: 'number' }] },
        status: { type: 'string' },
      }),
      AuthCredentialsRequest: objectSchema(
        {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
        ['email', 'password'],
      ),
      AuthProfile: objectSchema({
        id: { type: 'number' },
        email: { type: 'string' },
        name: { type: 'string' },
        avatar: { type: ['string', 'null'] },
        city: { type: ['string', 'null'] },
      }),
      AuthTokenResponse: objectSchema({
        access_token: { type: 'string' },
        refresh_token: { type: 'string' },
        user: ref('AuthProfile'),
      }),
      CandidateActionResponse: objectSchema({
        success: { type: 'boolean' },
        candidateId: { oneOf: [{ type: 'number' }, { type: 'string' }] },
        status: { type: 'string' },
      }),
      CandidateMessageRequest: objectSchema({
        candidateId: { oneOf: [{ type: 'number' }, { type: 'string' }] },
        message: { type: 'string' },
      }),
      Conversation: objectSchema({
        id: { oneOf: [{ type: 'number' }, { type: 'string' }] },
        participants: arraySchema(ref('PublicUserProfile')),
        updatedAt: { type: 'string', format: 'date-time' },
      }),
      ConversationPage: pageSchema(ref('Conversation')),
      CreateMeetRequest: objectSchema({
        title: { type: 'string' },
        activityType: { type: 'string' },
        scheduledAt: { type: 'string' },
      }),
      CreateReportRequest: objectSchema(
        {
          targetType: { type: 'string' },
          targetId: { oneOf: [{ type: 'string' }, { type: 'number' }] },
          reason: { type: 'string' },
          description: { type: 'string' },
        },
        ['targetType', 'targetId', 'reason'],
      ),
      ErrorEnvelope: objectSchema(
        {
          statusCode: { type: 'number' },
          timestamp: { type: 'string', format: 'date-time' },
          path: { type: 'string' },
          code: { type: 'string' },
          message: { type: 'string' },
          details: { type: 'object', additionalProperties: true },
          error: objectSchema({
            code: { type: 'string' },
            message: { type: 'string' },
            retryable: { type: 'boolean' },
          }),
        },
        ['statusCode', 'code', 'message'],
      ),
      FollowState: objectSchema({
        userId: { type: 'number' },
        targetUserId: { type: 'number' },
        following: { type: 'boolean' },
      }),
      FollowingState: objectSchema({
        targetUserId: { type: 'number' },
        following: { type: 'boolean' },
      }),
      FriendPage: pageSchema(ref('PublicUserProfile')),
      IdListResponse: objectSchema({ ids: arraySchema({ type: 'number' }) }),
      Meet: objectSchema({
        id: { oneOf: [{ type: 'number' }, { type: 'string' }] },
        title: { type: 'string' },
        status: { type: 'string' },
      }),
      MeetJoinResponse: objectSchema({
        meetId: { oneOf: [{ type: 'number' }, { type: 'string' }] },
        status: { type: 'string' },
      }),
      MeetPage: pageSchema(ref('Meet')),
      MeetRecordPage: pageSchema(ref('Meet')),
      Message: objectSchema({
        id: { oneOf: [{ type: 'number' }, { type: 'string' }] },
        text: { type: 'string' },
        senderId: { type: 'number' },
        createdAt: { type: 'string', format: 'date-time' },
      }),
      MessagePage: pageSchema(ref('Message')),
      PaginationMeta: objectSchema(
        {
          total: { type: 'number' },
          page: { type: 'number' },
          lastPage: { type: 'number' },
        },
        ['total', 'page', 'lastPage'],
      ),
      PublicSocialIntent: objectSchema({
        id: { oneOf: [{ type: 'number' }, { type: 'string' }] },
        title: { type: 'string' },
        type: { type: 'string' },
        status: { type: 'string' },
      }),
      PublicSocialIntentMatchList: objectSchema({
        data: arraySchema({ type: 'object', additionalProperties: true }),
      }),
      PublicSocialIntentPage: pageSchema(ref('PublicSocialIntent')),
      PublicUserProfile: objectSchema({
        id: { type: 'number' },
        name: { type: 'string' },
        avatar: { type: ['string', 'null'] },
        city: { type: ['string', 'null'] },
      }),
      RefreshTokenRequest: objectSchema({ refresh_token: { type: 'string' } }, [
        'refresh_token',
      ]),
      ReminderPage: pageSchema({ type: 'object', additionalProperties: true }),
      ReminderPreferences: objectSchema({
        enabled: { type: 'boolean' },
      }),
      SafetyBlockActionResponse: objectSchema({
        targetUserId: { type: 'number' },
        blocked: { type: 'boolean' },
      }),
      SafetyReport: objectSchema({
        id: { oneOf: [{ type: 'number' }, { type: 'string' }] },
        status: { type: 'string' },
      }),
      SendMessageRequest: objectSchema({ text: { type: 'string' } }, ['text']),
      SensitiveTagActionRequest: objectSchema({ tag: { type: 'string' } }, [
        'tag',
      ]),
      SensitiveTagList: objectSchema({ tags: arraySchema({ type: 'string' }) }),
      SmsSendRequest: objectSchema({ phone: { type: 'string' } }, ['phone']),
      SmsVerifyRequest: objectSchema(
        { phone: { type: 'string' }, code: { type: 'string' } },
        ['phone', 'code'],
      ),
      SocialAgentAsyncRunResponse: objectSchema({
        taskId: { oneOf: [{ type: 'number' }, { type: 'string' }] },
        runId: { type: 'string' },
        status: { type: 'string' },
      }),
      SocialAgentEventPage: pageSchema({
        type: 'object',
        additionalProperties: true,
      }),
      SocialAgentMessageRequest: objectSchema({ message: { type: 'string' } }, [
        'message',
      ]),
      SocialAgentRunRequest: objectSchema({ message: { type: 'string' } }, [
        'message',
      ]),
      SocialAgentRunResponse: objectSchema({
        taskId: { oneOf: [{ type: 'number' }, { type: 'string' }] },
        assistantMessage: { type: 'string' },
        status: { type: 'string' },
      }),
      SocialAgentSession: objectSchema({
        taskId: {
          oneOf: [{ type: 'number' }, { type: 'string' }, { type: 'null' }],
        },
        messages: arraySchema({ type: 'object', additionalProperties: true }),
      }),
      SocialAgentTask: objectSchema({
        id: { oneOf: [{ type: 'number' }, { type: 'string' }] },
        status: { type: 'string' },
      }),
      SocialAgentTimeline: objectSchema({
        items: arraySchema({ type: 'object', additionalProperties: true }),
      }),
      SocialProfile: objectSchema({
        userId: { type: 'number' },
        profileVersion: { type: 'number' },
        purpose: { type: ['string', 'null'] },
        interests: arraySchema({ type: 'string' }),
        updatedAt: { type: ['string', 'null'], format: 'date-time' },
      }),
      SocialProfileAiDraftRequest: objectSchema({
        rawText: { type: 'string' },
        answers: arraySchema({ type: 'object', additionalProperties: true }),
      }),
      SocialProfileAiDraftResponse: objectSchema({
        proposalId: { oneOf: [{ type: 'number' }, { type: 'string' }] },
        profile: ref('SocialProfile'),
      }),
      SocialProfileAiSaveRequest: objectSchema({
        proposalId: { oneOf: [{ type: 'number' }, { type: 'string' }] },
        profile: { type: 'object', additionalProperties: true },
        expectedProfileVersion: { type: 'number' },
      }),
      SocialProfileAnswerRequest: objectSchema(
        { key: { type: 'string' }, answer: { type: 'string' } },
        ['key', 'answer'],
      ),
      SocialProfileCompletion: objectSchema({
        completed: { type: 'boolean' },
        missing: arraySchema({ type: 'string' }),
        profileVersion: { type: 'number' },
      }),
      SocialProfilePrivacy: objectSchema({
        profileVisibility: { type: 'string' },
        matchingEnabled: { type: 'boolean' },
      }),
      SocialProfileQuestionList: objectSchema({
        questions: arraySchema({ type: 'object', additionalProperties: true }),
      }),
      StartConversationRequest: objectSchema(
        { otherUserId: { type: 'number' } },
        ['otherUserId'],
      ),
      StreamResponse: objectSchema({
        stream: { type: 'string' },
      }),
      SystemHealth: objectSchema({
        status: { type: 'string' },
      }),
      UpdateLocationRequest: objectSchema(
        {
          lat: { type: 'number' },
          lng: { type: 'number' },
          acceptNearbyMatch: { type: 'boolean' },
        },
        ['lat', 'lng'],
      ),
      UpdateProfileRequest: objectSchema({
        name: { type: 'string' },
        avatar: { type: 'string' },
        city: { type: 'string' },
      }),
      UpdateSocialProfilePrivacyRequest: objectSchema({
        profileVisibility: { type: 'string' },
        matchingEnabled: { type: 'boolean' },
      }),
      UpdateSocialProfileRequest: objectSchema({
        purpose: { type: 'string' },
        interests: arraySchema({ type: 'string' }),
        profileVersion: { type: 'number' },
      }),
      UploadImageRequest: objectSchema({
        file: { type: 'string', format: 'binary' },
      }),
      UploadImageResponse: objectSchema({
        url: { type: 'string' },
        assetId: { type: ['string', 'null'] },
        width: { type: ['number', 'null'] },
        height: { type: ['number', 'null'] },
        moderationStatus: {
          type: 'string',
          enum: ['pending', 'approved', 'rejected', 'unknown'],
        },
      }),
      UploadVideoRequest: objectSchema({
        file: { type: 'string', format: 'binary' },
      }),
      UploadVideoResponse: objectSchema({
        url: { type: 'string' },
      }),
      UnreadCountResponse: objectSchema({ count: { type: 'number' } }),
      WaitlistEntry: objectSchema({
        id: { oneOf: [{ type: 'number' }, { type: 'string' }] },
        email: { type: 'string' },
      }),
      WaitlistEntryPage: pageSchema(ref('WaitlistEntry')),
      WaitlistRequest: objectSchema(
        { email: { type: 'string', format: 'email' } },
        ['email'],
      ),
      WechatLoginRequest: objectSchema({ code: { type: 'string' } }, ['code']),
      WechatLoginUrlResponse: objectSchema({ url: { type: 'string' } }, [
        'url',
      ]),
    },
    responses: {
      ErrorResponse: {
        description: 'Structured API error',
        content: jsonContent(ref('ErrorEnvelope')),
      },
    },
  },
} as const;

function path(
  method: HttpMethod,
  tag: string,
  operationId: string,
  options: OperationOptions = {},
) {
  return operation(method, tag, operationId, options);
}

function operations(...items: OperationPathItem[]): OperationPathItem {
  const result: OperationPathItem = {};
  for (const item of items) {
    for (const method of httpMethods) {
      const op = item[method];
      if (op) result[method] = op;
    }
  }
  return result;
}

function operation(
  method: HttpMethod,
  tag: string,
  operationId: string,
  options: OperationOptions = {},
) {
  const status =
    options.status ??
    (method === 'post' ? '201' : method === 'delete' ? '200' : '200');
  const schema = options.responseSchema ?? ref('ActionAccepted');
  const contentType = options.requestContentType ?? 'application/json';
  const operationObject: OpenApiOperation = {
    tags: [tag],
    operationId,
    ...(options.summary ? { summary: options.summary } : {}),
    ...(options.auth === false
      ? { security: [] }
      : { security: bearerSecurity }),
    ...(options.parameters ? { parameters: options.parameters } : {}),
    ...(options.requestSchema
      ? {
          requestBody: {
            required: true,
            content: typedContent(contentType, options.requestSchema),
          },
        }
      : {}),
    responses: {
      [status]: {
        description: status === '204' ? 'No content' : 'Successful response',
        ...(status === '204' ? {} : { content: jsonContent(schema) }),
      },
      default: { $ref: '#/components/responses/ErrorResponse' },
    },
  };

  return {
    [method]: operationObject,
  };
}

function ref(name: string) {
  return { $ref: `#/components/schemas/${name}` };
}

function jsonContent(schema: JsonSchema) {
  return typedContent('application/json', schema);
}

function typedContent(contentType: RequestContentType, schema: JsonSchema) {
  return {
    [contentType]: {
      schema,
    },
  };
}

function withPathParameters<T extends Record<string, OperationPathItem>>(
  paths: T,
): T {
  for (const route of Object.keys(paths) as Array<keyof T & string>) {
    const params = pathParameters(route);
    if (params.length === 0) continue;

    const pathItem = paths[route];
    for (const method of httpMethods) {
      const op = pathItem[method];
      if (!op) continue;
      const existing = op.parameters ?? [];
      const existingNames = new Set(existing.map((param) => param.name));
      op.parameters = [
        ...params.filter((param) => !existingNames.has(param.name)),
        ...existing,
      ];
    }
  }
  return paths;
}

function pathParameters(route: string): OpenApiParameter[] {
  return Array.from(route.matchAll(/\{([^/}]+)\}/g), (match) => ({
    name: match[1],
    in: 'path' as const,
    required: true,
    schema: { type: 'string' },
  }));
}

function objectSchema(
  properties: Record<string, JsonSchema>,
  required: string[] = [],
  additionalProperties = false,
) {
  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties,
  };
}

function arraySchema(items: JsonSchema) {
  return {
    type: 'array',
    items,
  };
}

function pageSchema(item: JsonSchema) {
  return objectSchema(
    {
      data: arraySchema(item),
      metadata: ref('PaginationMeta'),
    },
    ['data', 'metadata'],
  );
}
