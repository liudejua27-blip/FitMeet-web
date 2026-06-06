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
      `/messages/conversations/${conversationId}` as const,
    sendConversationMessage: (conversationId: string) =>
      `/messages/conversations/${conversationId}/send` as const,
    getUnreadCount: '/messages/unread',
  },
  socialAgentChat: {
    messages: '/social-agent/chat/messages',
    routeMessage: '/social-agent/chat/route-message',
    streamUser: '/social-agent/chat/stream-user',
    session: '/social-agent/chat/session',
    taskSession: (taskId: number) =>
      `/social-agent/chat/tasks/${taskId}/session` as const,
    taskMessages: (taskId: number) => `/social-agent/chat/tasks/${taskId}/messages` as const,
    taskActions: (taskId: number) => `/social-agent/chat/tasks/${taskId}/actions` as const,
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
  | (typeof fitMeetCoreEndpoints.socialAgentChat)['messages']
  | (typeof fitMeetCoreEndpoints.socialAgentChat)['routeMessage']
  | (typeof fitMeetCoreEndpoints.socialAgentChat)['streamUser']
  | (typeof fitMeetCoreEndpoints.socialAgentChat)['session']
  | (typeof fitMeetCoreEndpoints.uploads)[keyof typeof fitMeetCoreEndpoints.uploads];
