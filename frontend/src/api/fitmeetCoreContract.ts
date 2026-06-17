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
    publicSocialIntents: '/public/social-intents',
    publicSocialIntent: (id: string) => `/public/social-intents/${encodeURIComponent(id)}` as const,
    publicSocialIntentMatches: (id: string) =>
      `/public/social-intents/${encodeURIComponent(id)}/matches` as const,
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
      `/messages/public-intents/${encodeURIComponent(publicIntentId)}/start` as const,
    getUnreadCount: '/messages/unread',
  },
  agentInbox: {
    conversations: '/agents/inbox/conversations',
    events: '/agents/inbox/events',
    ackEvents: '/agents/inbox/events/ack',
    messages: (conversationId: string) =>
      `/agents/inbox/conversations/${encodeURIComponent(conversationId)}/messages` as const,
    reply: (conversationId: string) =>
      `/agents/inbox/conversations/${encodeURIComponent(conversationId)}/reply` as const,
  },
  agentControl: {
    latestCheckpointForTask: (taskId: number | string) =>
      `/agent/checkpoints/tasks/${encodeURIComponent(String(taskId))}/latest` as const,
    checkpointRetry: (checkpointId: number | string) =>
      `/agent/checkpoints/${encodeURIComponent(String(checkpointId))}/retry` as const,
    checkpointReplay: (checkpointId: number | string) =>
      `/agent/checkpoints/${encodeURIComponent(String(checkpointId))}/replay` as const,
    checkpointFork: (checkpointId: number | string) =>
      `/agent/checkpoints/${encodeURIComponent(String(checkpointId))}/fork` as const,
    checkpointStepRetry: (checkpointId: number | string, stepId: string) =>
      `/agent/checkpoints/${encodeURIComponent(
        String(checkpointId),
      )}/steps/${encodeURIComponent(stepId)}/retry` as const,
    checkpointStepReplay: (checkpointId: number | string, stepId: string) =>
      `/agent/checkpoints/${encodeURIComponent(
        String(checkpointId),
      )}/steps/${encodeURIComponent(stepId)}/replay` as const,
    checkpointStepFork: (checkpointId: number | string, stepId: string) =>
      `/agent/checkpoints/${encodeURIComponent(
        String(checkpointId),
      )}/steps/${encodeURIComponent(stepId)}/fork` as const,
  },
  agentProfileMatches: {
    list: '/agents/profile-matches',
    ignore: (id: number) => `/agents/profile-matches/${id}/ignore` as const,
    favorite: (id: number) => `/agents/profile-matches/${id}/favorite` as const,
    draftOpener: (id: number) => `/agents/profile-matches/${id}/draft-opener` as const,
    confirmContact: (id: number) => `/agents/profile-matches/${id}/confirm-contact` as const,
    requestContactExchange: (id: number) =>
      `/agents/profile-matches/${id}/request-contact-exchange` as const,
    sendIntro: (id: number) => `/agents/profile-matches/${id}/send-intro` as const,
  },
  socialAgentChat: {
    run: '/social-agent/chat/run',
    runAsync: '/social-agent/chat/run-async',
    messages: '/social-agent/chat/messages',
    messagesStream: '/social-agent/chat/messages/stream',
    routeMessage: '/social-agent/chat/route-message',
    routeMessageStream: '/social-agent/chat/route-message/stream',
    stream: '/social-agent/chat/stream',
    streamUser: '/social-agent/chat/stream-user',
    session: '/social-agent/chat/session',
    profileGate: '/social-agent/chat/profile-gate',
    threads: '/social-agent/chat/threads',
    thread: (threadId: string | number) =>
      `/social-agent/chat/threads/${encodeURIComponent(String(threadId))}` as const,
    threadDelete: (threadId: string | number) =>
      `/social-agent/chat/threads/${encodeURIComponent(String(threadId))}/delete` as const,
    messageFeedback: (messageId: string) =>
      `/social-agent/chat/messages/${encodeURIComponent(messageId)}/feedback` as const,
    taskSession: (taskId: number) => `/social-agent/chat/tasks/${taskId}/session` as const,
    taskRunStatus: (taskId: number, runId: string) =>
      `/social-agent/chat/tasks/${taskId}/runs/${encodeURIComponent(runId)}` as const,
    taskMessages: (taskId: number) => `/social-agent/chat/tasks/${taskId}/messages` as const,
    taskMessagesStream: (taskId: number) =>
      `/social-agent/chat/tasks/${taskId}/messages/stream` as const,
    publishSocialRequest: (taskId: number) =>
      `/social-agent/chat/tasks/${taskId}/publish-social-request` as const,
    replanRun: (taskId: number) => `/social-agent/chat/tasks/${taskId}/replan-run` as const,
    appendContext: (taskId: number) => `/social-agent/chat/tasks/${taskId}/append-context` as const,
    taskActions: (taskId: number) => `/social-agent/chat/tasks/${taskId}/actions` as const,
    taskActionsStream: (taskId: number) =>
      `/social-agent/chat/tasks/${taskId}/actions/stream` as const,
    saveCandidate: (taskId: number) => `/social-agent/chat/tasks/${taskId}/save-candidate` as const,
    sendCandidateMessage: (taskId: number) =>
      `/social-agent/chat/tasks/${taskId}/send-message` as const,
    connectCandidate: (taskId: number) =>
      `/social-agent/chat/tasks/${taskId}/connect-candidate` as const,
    checkpointResumeStream: (checkpointId: number | string) =>
      `/social-agent/chat/checkpoints/${encodeURIComponent(
        String(checkpointId),
      )}/resume/stream` as const,
    checkpointReplayStream: (checkpointId: number | string) =>
      `/social-agent/chat/checkpoints/${encodeURIComponent(
        String(checkpointId),
      )}/replay/stream` as const,
    checkpointRetryStream: (checkpointId: number | string) =>
      `/social-agent/chat/checkpoints/${encodeURIComponent(
        String(checkpointId),
      )}/retry/stream` as const,
    checkpointStepRetryStream: (checkpointId: number | string, stepId: string) =>
      `/social-agent/chat/checkpoints/${encodeURIComponent(
        String(checkpointId),
      )}/steps/${encodeURIComponent(stepId)}/retry/stream` as const,
    checkpointStepReplayStream: (checkpointId: number | string, stepId: string) =>
      `/social-agent/chat/checkpoints/${encodeURIComponent(
        String(checkpointId),
      )}/steps/${encodeURIComponent(stepId)}/replay/stream` as const,
    checkpointStepForkStream: (checkpointId: number | string, stepId: string) =>
      `/social-agent/chat/checkpoints/${encodeURIComponent(
        String(checkpointId),
      )}/steps/${encodeURIComponent(stepId)}/fork/stream` as const,
    checkpointForkStream: (checkpointId: number | string) =>
      `/social-agent/chat/checkpoints/${encodeURIComponent(
        String(checkpointId),
      )}/fork/stream` as const,
  },
  socialAgentReminders: {
    list: '/social-agent/reminders',
    preferences: '/social-agent/reminders/preferences',
    runOnce: '/social-agent/reminders/run-once',
    disable: '/social-agent/reminders/disable',
    open: (id: number | string) =>
      `/social-agent/reminders/${encodeURIComponent(String(id))}/open` as const,
    dismiss: (id: number | string) =>
      `/social-agent/reminders/${encodeURIComponent(String(id))}/dismiss` as const,
  },
  socialAgentTasks: {
    current: '/social-agent/tasks/current',
    timeline: (taskId: number) => `/social-agent/tasks/${taskId}/timeline` as const,
    events: (taskId: number) => `/social-agent/tasks/${taskId}/events` as const,
    eventsEval: (taskId: number) => `/social-agent/tasks/${taskId}/events/eval` as const,
    eventsReplay: (taskId: number) => `/social-agent/tasks/${taskId}/events/replay` as const,
    replan: (taskId: number) => `/social-agent/tasks/${taskId}/replan` as const,
    runNext: (taskId: number) => `/social-agent/tasks/${taskId}/run-next` as const,
  },
  socialAgentL5: {
    dashboard: '/social-agent/l5/dashboard',
    replaySamples: '/social-agent/l5/replay-samples',
    subagentMemory: '/social-agent/l5/subagent-memory',
    meetLoopStates: '/social-agent/l5/meet-loop-states',
    patchEffects: '/social-agent/l5/patch-effects',
    autoRuns: '/social-agent/l5/auto-runs',
    observability: '/social-agent/l5/observability',
    recordSatisfaction: '/social-agent/l5/observability/satisfaction',
    subagentWorkerJobs: '/social-agent/l5/subagent-worker-jobs',
    requeueSubagentWorkerJob: (id: number) =>
      `/social-agent/l5/subagent-worker-jobs/${id}/requeue` as const,
    cancelSubagentWorkerJob: (id: number) =>
      `/social-agent/l5/subagent-worker-jobs/${id}/cancel` as const,
  },
  adminRbac: {
    roles: '/admin/rbac/roles',
    userRoles: (userId: number) => `/admin/rbac/users/${userId}/roles` as const,
    auditLogs: '/admin/rbac/audit-logs',
  },
  socialAgentSelfImprove: {
    runnerRunOnce: '/social-agent/self-improve/runner/run-once',
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
    publicSocialIntents: '/public/social-intents',
    publicSocialIntent: '/public/social-intents/{id}',
    publicSocialIntentMatches: '/public/social-intents/{id}/matches',
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
    events: '/agents/inbox/events',
    ackEvents: '/agents/inbox/events/ack',
    messages: '/agents/inbox/conversations/{conversationId}/messages',
    reply: '/agents/inbox/conversations/{conversationId}/reply',
  },
  agentControl: {
    latestCheckpointForTask: '/agent/checkpoints/tasks/{taskId}/latest',
    checkpointRetry: '/agent/checkpoints/{checkpointId}/retry',
    checkpointReplay: '/agent/checkpoints/{checkpointId}/replay',
    checkpointFork: '/agent/checkpoints/{checkpointId}/fork',
    checkpointStepRetry: '/agent/checkpoints/{checkpointId}/steps/{stepId}/retry',
    checkpointStepReplay: '/agent/checkpoints/{checkpointId}/steps/{stepId}/replay',
    checkpointStepFork: '/agent/checkpoints/{checkpointId}/steps/{stepId}/fork',
  },
  agentProfileMatches: {
    list: '/agents/profile-matches',
    ignore: '/agents/profile-matches/{id}/ignore',
    favorite: '/agents/profile-matches/{id}/favorite',
    draftOpener: '/agents/profile-matches/{id}/draft-opener',
    confirmContact: '/agents/profile-matches/{id}/confirm-contact',
    requestContactExchange: '/agents/profile-matches/{id}/request-contact-exchange',
    sendIntro: '/agents/profile-matches/{id}/send-intro',
  },
  socialAgentChat: {
    run: '/social-agent/chat/run',
    runAsync: '/social-agent/chat/run-async',
    messages: '/social-agent/chat/messages',
    messagesStream: '/social-agent/chat/messages/stream',
    routeMessage: '/social-agent/chat/route-message',
    routeMessageStream: '/social-agent/chat/route-message/stream',
    stream: '/social-agent/chat/stream',
    streamUser: '/social-agent/chat/stream-user',
    session: '/social-agent/chat/session',
    taskSession: '/social-agent/chat/tasks/{taskId}/session',
    taskRunStatus: '/social-agent/chat/tasks/{taskId}/runs/{runId}',
    taskMessages: '/social-agent/chat/tasks/{taskId}/messages',
    taskMessagesStream: '/social-agent/chat/tasks/{taskId}/messages/stream',
    publishSocialRequest: '/social-agent/chat/tasks/{taskId}/publish-social-request',
    replanRun: '/social-agent/chat/tasks/{taskId}/replan-run',
    appendContext: '/social-agent/chat/tasks/{taskId}/append-context',
    taskActions: '/social-agent/chat/tasks/{taskId}/actions',
    taskActionsStream: '/social-agent/chat/tasks/{taskId}/actions/stream',
    saveCandidate: '/social-agent/chat/tasks/{taskId}/save-candidate',
    sendCandidateMessage: '/social-agent/chat/tasks/{taskId}/send-message',
    connectCandidate: '/social-agent/chat/tasks/{taskId}/connect-candidate',
    checkpointResumeStream: '/social-agent/chat/checkpoints/{checkpointId}/resume/stream',
    checkpointReplayStream: '/social-agent/chat/checkpoints/{checkpointId}/replay/stream',
    checkpointRetryStream: '/social-agent/chat/checkpoints/{checkpointId}/retry/stream',
    checkpointStepRetryStream:
      '/social-agent/chat/checkpoints/{checkpointId}/steps/{stepId}/retry/stream',
    checkpointStepReplayStream:
      '/social-agent/chat/checkpoints/{checkpointId}/steps/{stepId}/replay/stream',
    checkpointStepForkStream:
      '/social-agent/chat/checkpoints/{checkpointId}/steps/{stepId}/fork/stream',
    checkpointForkStream: '/social-agent/chat/checkpoints/{checkpointId}/fork/stream',
  },
  socialAgentTasks: {
    current: '/social-agent/tasks/current',
    timeline: '/social-agent/tasks/{taskId}/timeline',
    events: '/social-agent/tasks/{taskId}/events',
    eventsEval: '/social-agent/tasks/{taskId}/events/eval',
    eventsReplay: '/social-agent/tasks/{taskId}/events/replay',
    replan: '/social-agent/tasks/{taskId}/replan',
    runNext: '/social-agent/tasks/{taskId}/run-next',
  },
  socialAgentReminders: {
    list: '/social-agent/reminders',
    preferences: '/social-agent/reminders/preferences',
    runOnce: '/social-agent/reminders/run-once',
    disable: '/social-agent/reminders/disable',
    open: '/social-agent/reminders/{id}/open',
    dismiss: '/social-agent/reminders/{id}/dismiss',
  },
  socialAgentL5: {
    dashboard: '/social-agent/l5/dashboard',
    replaySamples: '/social-agent/l5/replay-samples',
    subagentMemory: '/social-agent/l5/subagent-memory',
    meetLoopStates: '/social-agent/l5/meet-loop-states',
    patchEffects: '/social-agent/l5/patch-effects',
    autoRuns: '/social-agent/l5/auto-runs',
    observability: '/social-agent/l5/observability',
    recordSatisfaction: '/social-agent/l5/observability/satisfaction',
    subagentWorkerJobs: '/social-agent/l5/subagent-worker-jobs',
    requeueSubagentWorkerJob: '/social-agent/l5/subagent-worker-jobs/{id}/requeue',
    cancelSubagentWorkerJob: '/social-agent/l5/subagent-worker-jobs/{id}/cancel',
  },
  adminRbac: {
    roles: '/admin/rbac/roles',
    userRoles: '/admin/rbac/users/{userId}/roles',
    auditLogs: '/admin/rbac/audit-logs',
  },
  socialAgentSelfImprove: {
    runnerRunOnce: '/social-agent/self-improve/runner/run-once',
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
  | (typeof fitMeetCoreEndpoints.feed)['publicSocialIntents']
  | (typeof fitMeetCoreEndpoints.messages)['startConversation']
  | (typeof fitMeetCoreEndpoints.messages)['getConversations']
  | (typeof fitMeetCoreEndpoints.messages)['getUnreadCount']
  | (typeof fitMeetCoreEndpoints.agentInbox)['conversations']
  | (typeof fitMeetCoreEndpoints.agentInbox)['events']
  | (typeof fitMeetCoreEndpoints.agentInbox)['ackEvents']
  | (typeof fitMeetCoreEndpoints.agentProfileMatches)['list']
  | (typeof fitMeetCoreEndpoints.socialAgentChat)['messages']
  | (typeof fitMeetCoreEndpoints.socialAgentChat)['messagesStream']
  | (typeof fitMeetCoreEndpoints.socialAgentChat)['run']
  | (typeof fitMeetCoreEndpoints.socialAgentChat)['runAsync']
  | (typeof fitMeetCoreEndpoints.socialAgentChat)['routeMessage']
  | (typeof fitMeetCoreEndpoints.socialAgentChat)['routeMessageStream']
  | (typeof fitMeetCoreEndpoints.socialAgentChat)['stream']
  | (typeof fitMeetCoreEndpoints.socialAgentChat)['streamUser']
  | (typeof fitMeetCoreEndpoints.socialAgentChat)['session']
  | (typeof fitMeetCoreEndpoints.socialAgentTasks)['current']
  | (typeof fitMeetCoreEndpoints.socialAgentReminders)['list']
  | (typeof fitMeetCoreEndpoints.socialAgentReminders)['preferences']
  | (typeof fitMeetCoreEndpoints.socialAgentReminders)['runOnce']
  | (typeof fitMeetCoreEndpoints.socialAgentReminders)['disable']
  | (typeof fitMeetCoreEndpoints.socialAgentL5)[keyof typeof fitMeetCoreEndpoints.socialAgentL5]
  | (typeof fitMeetCoreEndpoints.socialAgentSelfImprove)[keyof typeof fitMeetCoreEndpoints.socialAgentSelfImprove]
  | (typeof fitMeetCoreEndpoints.uploads)[keyof typeof fitMeetCoreEndpoints.uploads];
