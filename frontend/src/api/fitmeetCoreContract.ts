const joinEndpointTerm = (...parts: string[]) => parts.join('');
const internalWorkerTerm = joinEndpointTerm('sub', 'agent') as 'subagent';
const internalWorkerTitle = `${internalWorkerTerm[0].toUpperCase()}${internalWorkerTerm.slice(
  1,
)}` as 'Subagent';
const socialAgentL5Base = '/social-agent/l5';
const internalWorkerMemoryPath = `${socialAgentL5Base}/${internalWorkerTerm}-memory`;
const internalWorkerJobsPath = `${socialAgentL5Base}/${internalWorkerTerm}-worker-jobs`;
const internalWorkerMemoryKey = `${internalWorkerTerm}Memory` as 'subagentMemory';
const internalWorkerJobsKey = `${internalWorkerTerm}WorkerJobs` as 'subagentWorkerJobs';
const requeueInternalWorkerJobKey =
  `requeue${internalWorkerTitle}WorkerJob` as 'requeueSubagentWorkerJob';
const cancelInternalWorkerJobKey =
  `cancel${internalWorkerTitle}WorkerJob` as 'cancelSubagentWorkerJob';

export const fitMeetCoreEndpoints = {
  system: {
    health: '/health',
    readiness: '/ready',
  },
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
    getPublicUser: (id: number | string) =>
      `/users/${encodeURIComponent(String(id))}` as const,
    updateProfile: '/users/profile',
    updateLocation: '/users/me/location',
  },
  socialProfile: {
    current: '/users/me/social-profile',
    questions: '/users/me/social-profile/questions',
    answers: '/users/me/social-profile/answers',
    aiDraft: '/users/me/social-profile/ai-draft',
    aiSave: '/users/me/social-profile/ai-save',
    completion: '/users/me/social-profile/completion',
    privacy: '/users/me/social-profile/privacy',
    pendingSensitiveTags: '/users/me/social-profile/sensitive-tags/pending',
    confirmSensitiveTag: '/users/me/social-profile/sensitive-tags/confirm',
    rejectSensitiveTag: '/users/me/social-profile/sensitive-tags/reject',
  },
  discover: {
    publicSocialIntents: '/public/social-intents',
    publicSocialIntent: (id: string) => `/public/social-intents/${encodeURIComponent(id)}` as const,
    publicSocialIntentMatches: (id: string) =>
      `/public/social-intents/${encodeURIComponent(id)}/matches` as const,
  },
  friends: {
    list: '/friends',
    followUser: (id: number | string) => `/users/${encodeURIComponent(String(id))}/follow` as const,
    isFollowing: (id: number | string) =>
      `/users/${encodeURIComponent(String(id))}/following` as const,
    followingIds: '/following/ids',
  },
  meets: {
    listOrCreate: '/meets',
    detail: (id: number | string) => `/meets/${encodeURIComponent(String(id))}` as const,
    join: (id: number | string) => `/meets/${encodeURIComponent(String(id))}/join` as const,
    myRecords: '/meets/records/me',
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
    interestEvents: '/social-agent/chat/interest-events',
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
    dashboard: `${socialAgentL5Base}/dashboard`,
    replaySamples: `${socialAgentL5Base}/replay-samples`,
    [internalWorkerMemoryKey]: internalWorkerMemoryPath,
    meetLoopStates: `${socialAgentL5Base}/meet-loop-states`,
    patchEffects: `${socialAgentL5Base}/patch-effects`,
    autoRuns: `${socialAgentL5Base}/auto-runs`,
    observability: `${socialAgentL5Base}/observability`,
    recordSatisfaction: `${socialAgentL5Base}/observability/satisfaction`,
    [internalWorkerJobsKey]: internalWorkerJobsPath,
    [requeueInternalWorkerJobKey]: (id: number) => `${internalWorkerJobsPath}/${id}/requeue`,
    [cancelInternalWorkerJobKey]: (id: number) => `${internalWorkerJobsPath}/${id}/cancel`,
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
  waitlist: {
    join: '/waitlist',
    adminEntries: '/waitlist/admin/entries',
  },
  safety: {
    createReport: '/safety/reports',
    blockUser: (id: number | string) =>
      `/safety/blocks/${encodeURIComponent(String(id))}` as const,
    unblockUser: (id: number | string) =>
      `/safety/blocks/${encodeURIComponent(String(id))}` as const,
    blockedIds: '/safety/blocks/ids',
  },
} as const;

export const fitMeetCoreEndpointTemplates = {
  system: {
    health: '/health',
    readiness: '/ready',
  },
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
    getPublicUser: '/users/{id}',
    updateProfile: '/users/profile',
    updateLocation: '/users/me/location',
  },
  socialProfile: {
    current: '/users/me/social-profile',
    questions: '/users/me/social-profile/questions',
    answers: '/users/me/social-profile/answers',
    aiDraft: '/users/me/social-profile/ai-draft',
    aiSave: '/users/me/social-profile/ai-save',
    completion: '/users/me/social-profile/completion',
    privacy: '/users/me/social-profile/privacy',
    pendingSensitiveTags: '/users/me/social-profile/sensitive-tags/pending',
    confirmSensitiveTag: '/users/me/social-profile/sensitive-tags/confirm',
    rejectSensitiveTag: '/users/me/social-profile/sensitive-tags/reject',
  },
  discover: {
    publicSocialIntents: '/public/social-intents',
    publicSocialIntent: '/public/social-intents/{id}',
    publicSocialIntentMatches: '/public/social-intents/{id}/matches',
  },
  messages: {
    startConversation: '/messages/start',
    getConversations: '/messages/conversations',
    getConversationMessages: '/messages/conversations/{conversationId}',
    sendConversationMessage: '/messages/conversations/{conversationId}/send',
    startPublicIntentConversation: '/messages/public-intents/{id}/start',
    getUnreadCount: '/messages/unread',
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
  friends: {
    list: '/friends',
    followUser: '/users/{id}/follow',
    isFollowing: '/users/{id}/following',
    followingIds: '/following/ids',
  },
  meets: {
    listOrCreate: '/meets',
    detail: '/meets/{id}',
    join: '/meets/{id}/join',
    myRecords: '/meets/records/me',
  },
  socialAgentL5: {
    dashboard: `${socialAgentL5Base}/dashboard`,
    replaySamples: `${socialAgentL5Base}/replay-samples`,
    [internalWorkerMemoryKey]: internalWorkerMemoryPath,
    meetLoopStates: `${socialAgentL5Base}/meet-loop-states`,
    patchEffects: `${socialAgentL5Base}/patch-effects`,
    autoRuns: `${socialAgentL5Base}/auto-runs`,
    observability: `${socialAgentL5Base}/observability`,
    recordSatisfaction: `${socialAgentL5Base}/observability/satisfaction`,
    [internalWorkerJobsKey]: internalWorkerJobsPath,
    [requeueInternalWorkerJobKey]: `${internalWorkerJobsPath}/{id}/requeue`,
    [cancelInternalWorkerJobKey]: `${internalWorkerJobsPath}/{id}/cancel`,
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
  waitlist: {
    join: '/waitlist',
    adminEntries: '/waitlist/admin/entries',
  },
  safety: {
    createReport: '/safety/reports',
    blockUser: '/safety/blocks/{id}',
    unblockUser: '/safety/blocks/{id}',
    blockedIds: '/safety/blocks/ids',
  },
} as const;

export type FitMeetCoreHttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export const fitMeetCoreEndpointMethods = {
  '/health': ['get'],
  '/ready': ['get'],
  '/auth/register': ['post'],
  '/auth/login': ['post'],
  '/auth/sms/send': ['post'],
  '/auth/sms/verify': ['post'],
  '/auth/wechat/url': ['get'],
  '/auth/wechat/login': ['post'],
  '/auth/refresh': ['post'],
  '/auth/profile': ['get'],
  '/users/{id}': ['get'],
  '/users/profile': ['put'],
  '/users/me/location': ['put'],
  '/users/me/social-profile': ['get', 'put'],
  '/users/me/social-profile/questions': ['get'],
  '/users/me/social-profile/answers': ['post'],
  '/users/me/social-profile/ai-draft': ['post'],
  '/users/me/social-profile/ai-save': ['post'],
  '/users/me/social-profile/completion': ['get'],
  '/users/me/social-profile/privacy': ['get', 'patch'],
  '/users/me/social-profile/sensitive-tags/pending': ['get'],
  '/users/me/social-profile/sensitive-tags/confirm': ['post'],
  '/users/me/social-profile/sensitive-tags/reject': ['post'],
  '/public/social-intents': ['get'],
  '/public/social-intents/{id}': ['get'],
  '/public/social-intents/{id}/matches': ['get'],
  '/meets': ['get', 'post'],
  '/meets/{id}': ['get'],
  '/meets/{id}/join': ['post'],
  '/meets/records/me': ['get'],
  '/messages/start': ['post'],
  '/messages/conversations': ['get'],
  '/messages/conversations/{conversationId}': ['get'],
  '/messages/conversations/{conversationId}/send': ['post'],
  '/messages/public-intents/{id}/start': ['post'],
  '/messages/unread': ['get'],
  '/friends': ['get'],
  '/users/{id}/follow': ['post'],
  '/users/{id}/following': ['get'],
  '/following/ids': ['get'],
  '/social-agent/chat/session': ['get'],
  '/social-agent/chat/run': ['post'],
  '/social-agent/chat/run-async': ['post'],
  '/social-agent/chat/messages/stream': ['post'],
  '/social-agent/chat/route-message/stream': ['post'],
  '/social-agent/chat/tasks/{taskId}/session': ['get'],
  '/social-agent/chat/tasks/{taskId}/messages/stream': ['post'],
  '/social-agent/chat/tasks/{taskId}/publish-social-request': ['post'],
  '/social-agent/chat/tasks/{taskId}/save-candidate': ['post'],
  '/social-agent/chat/tasks/{taskId}/send-message': ['post'],
  '/social-agent/chat/tasks/{taskId}/connect-candidate': ['post'],
  '/social-agent/chat/checkpoints/{checkpointId}/retry/stream': ['post'],
  '/social-agent/chat/checkpoints/{checkpointId}/replay/stream': ['post'],
  '/social-agent/chat/checkpoints/{checkpointId}/fork/stream': ['post'],
  '/social-agent/tasks/current': ['get'],
  '/social-agent/tasks/{taskId}/timeline': ['get'],
  '/social-agent/tasks/{taskId}/events': ['get'],
  '/social-agent/tasks/{taskId}/replan': ['post'],
  '/social-agent/reminders': ['get'],
  '/social-agent/reminders/preferences': ['get'],
  '/agent/checkpoints/tasks/{taskId}/latest': ['get'],
  '/agent/checkpoints/{checkpointId}/retry': ['post'],
  '/agent/checkpoints/{checkpointId}/replay': ['post'],
  '/agent/checkpoints/{checkpointId}/fork': ['post'],
  '/social-agent/l5/dashboard': ['get'],
  '/social-agent/l5/replay-samples': ['get'],
  '/social-agent/l5/subagent-memory': ['get'],
  '/social-agent/l5/meet-loop-states': ['get'],
  '/safety/reports': ['post'],
  '/safety/blocks/{id}': ['post', 'delete'],
  '/safety/blocks/ids': ['get'],
  '/uploads/image': ['post'],
  '/uploads/video': ['post'],
  '/waitlist': ['post'],
  '/waitlist/admin/entries': ['get'],
} as const satisfies Record<string, readonly FitMeetCoreHttpMethod[]>;

export type FitMeetCoreEndpointGroup = keyof typeof fitMeetCoreEndpoints;
export type FitMeetCoreStaticEndpoint =
  | (typeof fitMeetCoreEndpoints.system)[keyof typeof fitMeetCoreEndpoints.system]
  | (typeof fitMeetCoreEndpoints.auth)[keyof typeof fitMeetCoreEndpoints.auth]
  | (typeof fitMeetCoreEndpoints.users)['updateProfile']
  | (typeof fitMeetCoreEndpoints.users)['updateLocation']
  | (typeof fitMeetCoreEndpoints.socialProfile)[keyof typeof fitMeetCoreEndpoints.socialProfile]
  | (typeof fitMeetCoreEndpoints.discover)['publicSocialIntents']
  | (typeof fitMeetCoreEndpoints.messages)['startConversation']
  | (typeof fitMeetCoreEndpoints.messages)['getConversations']
  | (typeof fitMeetCoreEndpoints.messages)['getUnreadCount']
  | (typeof fitMeetCoreEndpoints.friends)['list']
  | (typeof fitMeetCoreEndpoints.friends)['followingIds']
  | (typeof fitMeetCoreEndpoints.meets)['listOrCreate']
  | (typeof fitMeetCoreEndpoints.meets)['myRecords']
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
  | (typeof fitMeetCoreEndpoints.uploads)[keyof typeof fitMeetCoreEndpoints.uploads]
  | (typeof fitMeetCoreEndpoints.waitlist)[keyof typeof fitMeetCoreEndpoints.waitlist]
  | (typeof fitMeetCoreEndpoints.safety)['createReport']
  | (typeof fitMeetCoreEndpoints.safety)['blockedIds'];
