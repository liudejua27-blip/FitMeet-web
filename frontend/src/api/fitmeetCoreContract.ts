export const fitMeetCoreEndpoints = {
  auth: {
    register: '/auth/register',
    login: '/auth/login',
    sendSmsCode: '/auth/sms/send',
    loginWithPhone: '/auth/sms/verify',
    getWechatLoginUrl: '/auth/wechat/url',
    loginWithWechat: '/auth/wechat/login',
    refreshToken: '/auth/refresh',
    getProfile: '/auth/profile',
  },
  users: {
    updateProfile: '/users/profile',
  },
  feed: {
    getFeed: '/feed',
    createPost: '/feed',
    getPostInteractions: '/feed/interactions',
    likePost: (id: number) => `/feed/${id}/like` as const,
    savePost: (id: number) => `/feed/${id}/save` as const,
    getComments: (postId: number) => `/feed/${postId}/comments` as const,
    addComment: (postId: number) => `/feed/${postId}/comments` as const,
    likeComment: (commentId: number) => `/feed/comments/${commentId}/like` as const,
  },
  messages: {
    startConversation: '/messages/start',
    getConversations: '/messages/conversations',
    getConversationMessages: (conversationId: string) =>
      `/messages/conversations/${encodeURIComponent(conversationId)}` as const,
    sendConversationMessage: (conversationId: string) =>
      `/messages/conversations/${encodeURIComponent(conversationId)}/send` as const,
    startPublicIntentConversation: (publicIntentId: string) =>
      `/messages/public-intents/${encodeURIComponent(
        publicIntentId,
    )}/start` as const,
    getUnreadCount: '/messages/unread',
  },
  agentInbox: {
    conversations: '/agents/inbox/conversations',
    messages: (conversationId: string) =>
      `/agents/inbox/conversations/${encodeURIComponent(
        conversationId,
      )}/messages` as const,
    reply: (conversationId: string) =>
      `/agents/inbox/conversations/${encodeURIComponent(
        conversationId,
      )}/reply` as const,
  },
  socialAgentChat: {
    run: '/social-agent/chat/run',
    runAsync: '/social-agent/chat/run-async',
    messages: '/social-agent/chat/messages',
    routeMessage: '/social-agent/chat/route-message',
    stream: '/social-agent/chat/stream',
    streamUser: '/social-agent/chat/stream-user',
    session: '/social-agent/chat/session',
    taskSession: (taskId: number) =>
      `/social-agent/chat/tasks/${taskId}/session` as const,
    taskRunStatus: (taskId: number, runId: string) =>
      `/social-agent/chat/tasks/${taskId}/runs/${encodeURIComponent(
        runId,
      )}` as const,
    taskMessages: (taskId: number) =>
      `/social-agent/chat/tasks/${taskId}/messages` as const,
    publishSocialRequest: (taskId: number) =>
      `/social-agent/chat/tasks/${taskId}/publish-social-request` as const,
    replanRun: (taskId: number) =>
      `/social-agent/chat/tasks/${taskId}/replan-run` as const,
    appendContext: (taskId: number) =>
      `/social-agent/chat/tasks/${taskId}/append-context` as const,
    taskActions: (taskId: number) =>
      `/social-agent/chat/tasks/${taskId}/actions` as const,
    saveCandidate: (taskId: number) =>
      `/social-agent/chat/tasks/${taskId}/save-candidate` as const,
    sendCandidateMessage: (taskId: number) =>
      `/social-agent/chat/tasks/${taskId}/send-message` as const,
    connectCandidate: (taskId: number) =>
      `/social-agent/chat/tasks/${taskId}/connect-candidate` as const,
  },
  socialAgentTasks: {
    current: '/social-agent/tasks/current',
    timeline: (taskId: number) =>
      `/social-agent/tasks/${taskId}/timeline` as const,
    events: (taskId: number) =>
      `/social-agent/tasks/${taskId}/events` as const,
    replan: (taskId: number) =>
      `/social-agent/tasks/${taskId}/replan` as const,
  },
  uploads: {
    image: '/uploads/image',
    video: '/uploads/video',
  },
} as const;

export const fitMeetCoreEndpointTemplates = {
  auth: {
    register: '/auth/register',
    login: '/auth/login',
    sendSmsCode: '/auth/sms/send',
    loginWithPhone: '/auth/sms/verify',
    getWechatLoginUrl: '/auth/wechat/url',
    loginWithWechat: '/auth/wechat/login',
    refreshToken: '/auth/refresh',
    getProfile: '/auth/profile',
  },
  users: {
    updateProfile: '/users/profile',
  },
  feed: {
    getFeed: '/feed',
    createPost: '/feed',
    getPostInteractions: '/feed/interactions',
    likePost: '/feed/{id}/like',
    savePost: '/feed/{id}/save',
    getComments: '/feed/{postId}/comments',
    addComment: '/feed/{postId}/comments',
    likeComment: '/feed/comments/{commentId}/like',
  },
  messages: {
    startConversation: '/messages/start',
    getConversations: '/messages/conversations',
    getConversationMessages: '/messages/conversations/{conversationId}',
    sendConversationMessage: '/messages/conversations/{conversationId}/send',
    startPublicIntentConversation: '/messages/public-intents/{id}/start',
    getUnreadCount: '/messages/unread',
  },
  agentInbox: {
    conversations: '/agents/inbox/conversations',
    messages: '/agents/inbox/conversations/{conversationId}/messages',
    reply: '/agents/inbox/conversations/{conversationId}/reply',
  },
  socialAgentChat: {
    run: '/social-agent/chat/run',
    runAsync: '/social-agent/chat/run-async',
    messages: '/social-agent/chat/messages',
    routeMessage: '/social-agent/chat/route-message',
    stream: '/social-agent/chat/stream',
    streamUser: '/social-agent/chat/stream-user',
    session: '/social-agent/chat/session',
    taskSession: '/social-agent/chat/tasks/{taskId}/session',
    taskRunStatus: '/social-agent/chat/tasks/{taskId}/runs/{runId}',
    taskMessages: '/social-agent/chat/tasks/{taskId}/messages',
    publishSocialRequest:
      '/social-agent/chat/tasks/{taskId}/publish-social-request',
    replanRun: '/social-agent/chat/tasks/{taskId}/replan-run',
    appendContext: '/social-agent/chat/tasks/{taskId}/append-context',
    taskActions: '/social-agent/chat/tasks/{taskId}/actions',
    saveCandidate: '/social-agent/chat/tasks/{taskId}/save-candidate',
    sendCandidateMessage: '/social-agent/chat/tasks/{taskId}/send-message',
    connectCandidate: '/social-agent/chat/tasks/{taskId}/connect-candidate',
  },
  socialAgentTasks: {
    current: '/social-agent/tasks/current',
    timeline: '/social-agent/tasks/{taskId}/timeline',
    events: '/social-agent/tasks/{taskId}/events',
    replan: '/social-agent/tasks/{taskId}/replan',
  },
  uploads: {
    image: '/uploads/image',
    video: '/uploads/video',
  },
} as const;

export type FitMeetCoreEndpointGroup = keyof typeof fitMeetCoreEndpoints;
export type FitMeetCoreStaticEndpoint =
  | (typeof fitMeetCoreEndpoints.auth)[keyof typeof fitMeetCoreEndpoints.auth]
  | (typeof fitMeetCoreEndpoints.users)[keyof typeof fitMeetCoreEndpoints.users]
  | (typeof fitMeetCoreEndpoints.feed)['getFeed']
  | (typeof fitMeetCoreEndpoints.feed)['createPost']
  | (typeof fitMeetCoreEndpoints.feed)['getPostInteractions']
  | (typeof fitMeetCoreEndpoints.messages)['startConversation']
  | (typeof fitMeetCoreEndpoints.messages)['getConversations']
  | (typeof fitMeetCoreEndpoints.messages)['getUnreadCount']
  | (typeof fitMeetCoreEndpoints.agentInbox)['conversations']
  | (typeof fitMeetCoreEndpoints.socialAgentChat)['messages']
  | (typeof fitMeetCoreEndpoints.socialAgentChat)['run']
  | (typeof fitMeetCoreEndpoints.socialAgentChat)['runAsync']
  | (typeof fitMeetCoreEndpoints.socialAgentChat)['routeMessage']
  | (typeof fitMeetCoreEndpoints.socialAgentChat)['stream']
  | (typeof fitMeetCoreEndpoints.socialAgentChat)['streamUser']
  | (typeof fitMeetCoreEndpoints.socialAgentChat)['session']
  | (typeof fitMeetCoreEndpoints.socialAgentTasks)['current']
  | (typeof fitMeetCoreEndpoints.uploads)[keyof typeof fitMeetCoreEndpoints.uploads];
