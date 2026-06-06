export const fitMeetCoreOpenApi = {
  openapi: '3.1.0',
  info: {
    title: 'FitMeet Core Web/App API',
    version: '2026-06-05',
    description:
      'Shared contract for FitMeet Web and App auth, users, feed, messages, Agent inbox, Social Agent chat, and uploads.',
  },
  servers: [{ url: '/api' }],
  tags: [
    { name: 'system' },
    { name: 'auth' },
    { name: 'users' },
    { name: 'feed' },
    { name: 'messages' },
    { name: 'agent-inbox' },
    { name: 'social-agent-chat' },
    { name: 'uploads' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['system'],
        operationId: 'getHealth',
        responses: {
          '200': {
            description: 'Process liveness check',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthPayload' },
              },
            },
          },
        },
      },
    },
    '/ready': {
      get: {
        tags: ['system'],
        operationId: 'getReadiness',
        responses: {
          '200': {
            description: 'Dependency readiness check',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ReadinessPayload' },
              },
            },
          },
          '503': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/auth/register': {
      post: {
        tags: ['auth'],
        operationId: 'register',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RegisterInput' },
            },
          },
        },
        responses: {
          '201': { $ref: '#/components/responses/AuthResult' },
          '400': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['auth'],
        operationId: 'login',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginInput' },
            },
          },
        },
        responses: {
          '200': { $ref: '#/components/responses/AuthResult' },
          '401': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/auth/sms/send': {
      post: {
        tags: ['auth'],
        operationId: 'sendSmsCode',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SendSmsInput' },
            },
          },
        },
        responses: {
          '200': {
            description: 'SMS code metadata',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SendSmsResult' },
              },
            },
          },
          '400': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/auth/sms/verify': {
      post: {
        tags: ['auth'],
        operationId: 'loginWithPhone',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PhoneLoginInput' },
            },
          },
        },
        responses: {
          '200': { $ref: '#/components/responses/AuthResult' },
          '400': { $ref: '#/components/responses/Error' },
          '401': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/auth/wechat/url': {
      get: {
        tags: ['auth'],
        operationId: 'getWechatLoginUrl',
        responses: {
          '200': {
            description: 'WeChat login URL',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['url'],
                  properties: { url: { type: 'string', format: 'uri' } },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/auth/wechat/login': {
      post: {
        tags: ['auth'],
        operationId: 'loginWithWechat',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/WechatLoginInput' },
            },
          },
        },
        responses: {
          '200': { $ref: '#/components/responses/AuthResult' },
          '400': { $ref: '#/components/responses/Error' },
          '401': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['auth'],
        operationId: 'refreshToken',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RefreshTokenInput' },
            },
          },
        },
        responses: {
          '200': { $ref: '#/components/responses/AuthResult' },
          '400': { $ref: '#/components/responses/Error' },
          '401': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/auth/profile': {
      get: {
        tags: ['auth'],
        operationId: 'getProfile',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Current user profile',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UserProfile' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/users/profile': {
      put: {
        tags: ['users'],
        operationId: 'updateProfile',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateProfileInput' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated current user profile',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UserProfile' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/feed': {
      get: {
        tags: ['feed'],
        operationId: 'getFeed',
        parameters: [
          { name: 'category', in: 'query', schema: { type: 'string' } },
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', minimum: 1 },
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 50 },
          },
          { name: 'lat', in: 'query', schema: { type: 'number' } },
          { name: 'lng', in: 'query', schema: { type: 'number' } },
        ],
        responses: {
          '200': {
            description: 'Unified social feed',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/FeedPage' },
              },
            },
          },
          '400': { $ref: '#/components/responses/Error' },
        },
      },
      post: {
        tags: ['feed'],
        operationId: 'createPost',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreatePostInput' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Created post',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Post' },
              },
            },
          },
          '400': { $ref: '#/components/responses/Error' },
          '401': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/feed/interactions': {
      get: {
        tags: ['feed'],
        operationId: 'getPostInteractions',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Current user feed interactions',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PostInteractions' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/feed/{id}/like': {
      post: {
        tags: ['feed'],
        operationId: 'likePost',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        responses: {
          '201': {
            description: 'Like state',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['liked'],
                  properties: { liked: { type: 'boolean' } },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/Error' },
          '401': { $ref: '#/components/responses/Error' },
          '404': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/feed/{id}/save': {
      post: {
        tags: ['feed'],
        operationId: 'savePost',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        responses: {
          '201': {
            description: 'Save state',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['saved'],
                  properties: { saved: { type: 'boolean' } },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/Error' },
          '401': { $ref: '#/components/responses/Error' },
          '404': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/feed/{postId}/comments': {
      get: {
        tags: ['feed'],
        operationId: 'getComments',
        parameters: [
          {
            name: 'postId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        responses: {
          '200': {
            description: 'Post comments',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Comment' },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/Error' },
          '404': { $ref: '#/components/responses/Error' },
        },
      },
      post: {
        tags: ['feed'],
        operationId: 'addComment',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'postId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateCommentInput' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Created comment',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Comment' },
              },
            },
          },
          '400': { $ref: '#/components/responses/Error' },
          '401': { $ref: '#/components/responses/Error' },
          '404': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/feed/comments/{commentId}/like': {
      post: {
        tags: ['feed'],
        operationId: 'likeComment',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'commentId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        responses: {
          '201': {
            description: 'Comment like state',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['liked'],
                  properties: { liked: { type: 'boolean' } },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/messages/start': {
      post: {
        tags: ['messages'],
        operationId: 'startConversation',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/StartConversationInput' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Conversation start result',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ConversationStartResult',
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/Error' },
          '401': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/messages/conversations': {
      get: {
        tags: ['messages'],
        operationId: 'getConversations',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Current user conversations',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/ConversationSummary' },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/messages/conversations/{conversationId}': {
      get: {
        tags: ['messages'],
        operationId: 'getConversationMessages',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'conversationId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Conversation messages',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/ConversationHistoryMessage',
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/Error' },
          '401': { $ref: '#/components/responses/Error' },
          '404': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/messages/conversations/{conversationId}/send': {
      post: {
        tags: ['messages'],
        operationId: 'sendConversationMessage',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'conversationId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SendMessageInput' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Sent message',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ConversationMessage' },
              },
            },
          },
          '400': { $ref: '#/components/responses/Error' },
          '401': { $ref: '#/components/responses/Error' },
          '404': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/messages/public-intents/{id}/start': {
      post: {
        tags: ['messages'],
        operationId: 'startPublicIntentConversation',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/StartPublicIntentConversationInput',
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Public intent conversation start result',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/PublicIntentConversationStartResult',
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/Error' },
          '401': { $ref: '#/components/responses/Error' },
          '404': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/messages/unread': {
      get: {
        tags: ['messages'],
        operationId: 'getUnreadCount',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Unread message count',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UnreadCount' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/agents/inbox/conversations': {
      get: {
        tags: ['agent-inbox'],
        operationId: 'listAgentInboxConversations',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'agentProfileId',
            in: 'query',
            schema: { type: 'integer', minimum: 1 },
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100 },
          },
          { name: 'unreadOnly', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: {
          '200': {
            description: 'Agent inbox conversation list for the owner',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/AgentInboxConversationsResult',
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/Error' },
          '401': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/agents/inbox/conversations/{conversationId}/messages': {
      get: {
        tags: ['agent-inbox'],
        operationId: 'listAgentInboxMessages',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'conversationId',
            in: 'path',
            required: true,
            schema: { type: 'string', minLength: 1 },
          },
          {
            name: 'agentProfileId',
            in: 'query',
            schema: { type: 'integer', minimum: 1 },
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100 },
          },
        ],
        responses: {
          '200': {
            description: 'Agent inbox conversation messages',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/AgentInboxMessagesResult',
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/Error' },
          '401': { $ref: '#/components/responses/Error' },
          '404': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/agents/inbox/conversations/{conversationId}/reply': {
      post: {
        tags: ['agent-inbox'],
        operationId: 'replyToAgentInboxConversation',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'conversationId',
            in: 'path',
            required: true,
            schema: { type: 'string', minLength: 1 },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AgentInboxReplyInput' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Agent inbox reply result',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AgentInboxReplyResult' },
              },
            },
          },
          '400': { $ref: '#/components/responses/Error' },
          '401': { $ref: '#/components/responses/Error' },
          '404': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/social-agent/chat/run': {
      post: {
        tags: ['social-agent-chat'],
        operationId: 'socialAgentRun',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SocialAgentRunInput' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Synchronous Social Agent run result',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SocialAgentChatRunResult',
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/Error' },
          '401': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/social-agent/chat/run-async': {
      post: {
        tags: ['social-agent-chat'],
        operationId: 'socialAgentRunAsync',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SocialAgentRunInput' },
            },
          },
        },
        responses: {
          '202': {
            description: 'Queued Social Agent async run snapshot',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SocialAgentAsyncRunSnapshot',
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/Error' },
          '401': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/social-agent/chat/messages': {
      post: {
        tags: ['social-agent-chat'],
        operationId: 'socialAgentHandleMessage',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SocialAgentRouteMessageInput',
              },
            },
          },
        },
        responses: {
          '200': { $ref: '#/components/responses/UserFacingAgentResponse' },
          '400': { $ref: '#/components/responses/Error' },
          '401': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/social-agent/chat/route-message': {
      post: {
        tags: ['social-agent-chat'],
        operationId: 'socialAgentRouteMessage',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SocialAgentRouteMessageInput',
              },
            },
          },
        },
        responses: {
          '200': { $ref: '#/components/responses/UserFacingAgentResponse' },
          '400': { $ref: '#/components/responses/Error' },
          '401': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/social-agent/chat/stream': {
      post: {
        tags: ['social-agent-chat'],
        operationId: 'socialAgentStream',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SocialAgentRunInput' },
            },
          },
        },
        responses: {
          '200': {
            description:
              'Server-sent events with raw Social Agent status, progress, result, and error events',
            content: { 'text/event-stream': { schema: { type: 'string' } } },
          },
          '400': { $ref: '#/components/responses/Error' },
          '401': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/social-agent/chat/stream-user': {
      post: {
        tags: ['social-agent-chat'],
        operationId: 'socialAgentStreamUser',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SocialAgentRunInput' },
            },
          },
        },
        responses: {
          '200': {
            description:
              'Server-sent events with status, progress, result, and error events',
            content: { 'text/event-stream': { schema: { type: 'string' } } },
          },
          '400': { $ref: '#/components/responses/Error' },
          '401': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/social-agent/chat/session': {
      get: {
        tags: ['social-agent-chat'],
        operationId: 'socialAgentGetLatestSession',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Latest restorable Social Agent chat session',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SocialAgentSessionSnapshot',
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/social-agent/chat/tasks/{taskId}/session': {
      get: {
        tags: ['social-agent-chat'],
        operationId: 'socialAgentGetTaskSession',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'taskId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        responses: {
          '200': {
            description: 'Restorable Social Agent task session',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SocialAgentSessionSnapshot',
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Error' },
          '404': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/social-agent/chat/tasks/{taskId}/runs/{runId}': {
      get: {
        tags: ['social-agent-chat'],
        operationId: 'socialAgentGetRunStatus',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'taskId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
          {
            name: 'runId',
            in: 'path',
            required: true,
            schema: { type: 'string', minLength: 1 },
          },
        ],
        responses: {
          '200': {
            description:
              'Async Social Agent run status for the authenticated task owner',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SocialAgentAsyncRunSnapshot',
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Error' },
          '404': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/social-agent/tasks/current': {
      get: {
        tags: ['social-agent-chat'],
        operationId: 'socialAgentGetCurrentTask',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description:
              'Current restorable Social Agent task for the authenticated user',
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    {
                      $ref: '#/components/schemas/SocialAgentCurrentTaskSnapshot',
                    },
                    { type: 'null' },
                  ],
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/social-agent/tasks/{taskId}/timeline': {
      get: {
        tags: ['social-agent-chat'],
        operationId: 'socialAgentGetTaskTimeline',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'taskId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        responses: {
          '200': {
            description:
              'Restored Social Agent task timeline for the authenticated owner',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SocialAgentTaskTimelineSnapshot',
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Error' },
          '404': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/social-agent/tasks/{taskId}/events': {
      get: {
        tags: ['social-agent-chat'],
        operationId: 'socialAgentGetTaskEvents',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'taskId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        responses: {
          '200': {
            description:
              'Persisted Social Agent task events for the authenticated owner',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SocialAgentTaskEventsResult',
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Error' },
          '404': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/social-agent/tasks/{taskId}/replan': {
      post: {
        tags: ['social-agent-chat'],
        operationId: 'socialAgentReplanTask',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'taskId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SocialAgentReplanInput',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated Social Agent plan for a follow-up task',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SocialAgentReplanResult',
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/Error' },
          '401': { $ref: '#/components/responses/Error' },
          '404': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/social-agent/chat/tasks/{taskId}/messages': {
      post: {
        tags: ['social-agent-chat'],
        operationId: 'socialAgentHandleTaskMessage',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'taskId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SocialAgentRouteMessageInput',
              },
            },
          },
        },
        responses: {
          '200': { $ref: '#/components/responses/UserFacingAgentResponse' },
          '400': { $ref: '#/components/responses/Error' },
          '401': { $ref: '#/components/responses/Error' },
          '404': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/social-agent/chat/tasks/{taskId}/publish-social-request': {
      post: {
        tags: ['social-agent-chat'],
        operationId: 'socialAgentPublishSocialRequest',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'taskId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SocialAgentPublishSocialRequestInput',
              },
            },
          },
        },
        responses: {
          '200': {
            description:
              'Published Social Agent social request synced to the real feed model',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SocialAgentPublishResult',
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/Error' },
          '401': { $ref: '#/components/responses/Error' },
          '404': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/social-agent/chat/tasks/{taskId}/replan-run': {
      post: {
        tags: ['social-agent-chat'],
        operationId: 'socialAgentReplanAndRunTask',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'taskId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SocialAgentReplanInput',
              },
            },
          },
        },
        responses: {
          '202': {
            description: 'Queued Social Agent replan-and-run snapshot',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SocialAgentAsyncRunSnapshot',
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/Error' },
          '401': { $ref: '#/components/responses/Error' },
          '404': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/social-agent/chat/tasks/{taskId}/append-context': {
      post: {
        tags: ['social-agent-chat'],
        operationId: 'socialAgentAppendTaskContext',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'taskId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SocialAgentReplanInput',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Saved follow-up context for a Social Agent task',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SocialAgentAppendContextResult',
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/Error' },
          '401': { $ref: '#/components/responses/Error' },
          '404': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/social-agent/chat/tasks/{taskId}/save-candidate': {
      post: {
        tags: ['social-agent-chat'],
        operationId: 'socialAgentSaveCandidate',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'taskId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SocialAgentCandidateActionInput',
              },
            },
          },
        },
        responses: {
          '200': { $ref: '#/components/responses/JsonObject' },
          '401': { $ref: '#/components/responses/Error' },
          '404': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/social-agent/chat/tasks/{taskId}/send-message': {
      post: {
        tags: ['social-agent-chat'],
        operationId: 'socialAgentSendCandidateMessage',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'taskId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                allOf: [
                  {
                    $ref: '#/components/schemas/SocialAgentCandidateActionInput',
                  },
                  {
                    type: 'object',
                    required: ['message'],
                    properties: { message: { type: 'string', minLength: 1 } },
                  },
                ],
              },
            },
          },
        },
        responses: {
          '200': { $ref: '#/components/responses/JsonObject' },
          '400': { $ref: '#/components/responses/Error' },
          '401': { $ref: '#/components/responses/Error' },
          '404': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/social-agent/chat/tasks/{taskId}/connect-candidate': {
      post: {
        tags: ['social-agent-chat'],
        operationId: 'socialAgentConnectCandidate',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'taskId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SocialAgentCandidateActionInput',
              },
            },
          },
        },
        responses: {
          '200': { $ref: '#/components/responses/JsonObject' },
          '400': { $ref: '#/components/responses/Error' },
          '401': { $ref: '#/components/responses/Error' },
          '404': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/social-agent/chat/tasks/{taskId}/actions': {
      post: {
        tags: ['social-agent-chat'],
        operationId: 'socialAgentPerformAction',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'taskId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SocialAgentCardActionInput',
              },
            },
          },
        },
        responses: {
          '200': { $ref: '#/components/responses/UserFacingAgentResponse' },
          '400': { $ref: '#/components/responses/Error' },
          '401': { $ref: '#/components/responses/Error' },
          '404': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/uploads/image': {
      post: {
        tags: ['uploads'],
        operationId: 'uploadImage',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          description:
            'Accepts jpg, jpeg, png, gif, and webp image files up to 10MB.',
          content: {
            'multipart/form-data': {
              schema: { $ref: '#/components/schemas/FileUploadInput' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Image upload result',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ImageUploadResult' },
              },
            },
          },
          '400': { $ref: '#/components/responses/Error' },
          '401': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/uploads/video': {
      post: {
        tags: ['uploads'],
        operationId: 'uploadVideo',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          description:
            'Accepts mp4, mov/quicktime, webm, and m4v video files up to 100MB.',
          content: {
            'multipart/form-data': {
              schema: { $ref: '#/components/schemas/FileUploadInput' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Video upload result',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/VideoUploadResult' },
              },
            },
          },
          '400': { $ref: '#/components/responses/Error' },
          '401': { $ref: '#/components/responses/Error' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    responses: {
      AuthResult: {
        description: 'Authentication result',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AuthResult' },
          },
        },
      },
      UserFacingAgentResponse: {
        description: 'User-facing Social Agent response',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UserFacingAgentResponse' },
          },
        },
      },
      JsonObject: {
        description: 'Generic JSON object result',
        content: {
          'application/json': {
            schema: { type: 'object', additionalProperties: true },
          },
        },
      },
      Error: {
        description: 'API error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
    },
    schemas: {
      HealthPayload: {
        type: 'object',
        required: ['status', 'uptime', 'timestamp'],
        additionalProperties: false,
        properties: {
          status: { type: 'string', enum: ['ok'] },
          uptime: { type: 'number' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      ReadinessCheck: {
        type: 'object',
        required: ['status', 'latencyMs'],
        additionalProperties: false,
        properties: {
          status: { type: 'string', enum: ['ok', 'error'] },
          latencyMs: { type: 'integer', minimum: 0 },
        },
      },
      ReadinessPayload: {
        type: 'object',
        required: ['status', 'uptime', 'timestamp', 'checks'],
        additionalProperties: false,
        properties: {
          status: { type: 'string', enum: ['ok'] },
          uptime: { type: 'number' },
          timestamp: { type: 'string', format: 'date-time' },
          checks: {
            type: 'object',
            required: ['postgres', 'mongo', 'redis'],
            additionalProperties: false,
            properties: {
              postgres: { $ref: '#/components/schemas/ReadinessCheck' },
              mongo: { $ref: '#/components/schemas/ReadinessCheck' },
              redis: { $ref: '#/components/schemas/ReadinessCheck' },
            },
          },
        },
      },
      RegisterInput: {
        type: 'object',
        required: ['email', 'password', 'name'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
          name: { type: 'string' },
        },
      },
      LoginInput: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
      SendSmsInput: {
        type: 'object',
        required: ['phone'],
        properties: { phone: { type: 'string' } },
      },
      SendSmsResult: {
        type: 'object',
        required: ['message', 'expiresIn'],
        properties: {
          message: { type: 'string' },
          expiresIn: { type: 'integer' },
        },
      },
      PhoneLoginInput: {
        type: 'object',
        required: ['phone', 'code'],
        properties: { phone: { type: 'string' }, code: { type: 'string' } },
      },
      WechatLoginInput: {
        type: 'object',
        required: ['code'],
        properties: { code: { type: 'string' } },
      },
      RefreshTokenInput: {
        type: 'object',
        required: ['refreshToken'],
        properties: { refreshToken: { type: 'string' } },
      },
      AuthResult: {
        type: 'object',
        required: ['access_token', 'user'],
        properties: {
          access_token: { type: 'string' },
          refresh_token: { type: 'string' },
          user: { $ref: '#/components/schemas/UserProfile' },
        },
      },
      UserProfile: {
        type: 'object',
        required: ['id'],
        additionalProperties: true,
        properties: {
          id: { type: 'integer' },
          email: { type: 'string' },
          name: { type: 'string' },
          avatar: { type: 'string' },
          city: { type: 'string' },
        },
      },
      UpdateProfileInput: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', maxLength: 30 },
          bio: { type: 'string', maxLength: 200 },
          gender: { type: 'string', enum: ['♂', '♀', ''] },
          city: { type: 'string', maxLength: 50 },
          avatar: { type: 'string', format: 'uri' },
        },
      },
      FeedPage: {
        type: 'object',
        required: ['data', 'metadata'],
        properties: {
          data: { type: 'array', items: { $ref: '#/components/schemas/Post' } },
          metadata: { $ref: '#/components/schemas/FeedMetadata' },
        },
      },
      FeedMetadata: {
        type: 'object',
        required: ['total', 'page', 'lastPage'],
        properties: {
          total: { type: 'integer' },
          page: { type: 'integer' },
          lastPage: { type: 'integer' },
        },
      },
      Post: {
        type: 'object',
        required: ['id'],
        additionalProperties: true,
        properties: {
          id: { type: 'integer' },
          sourceId: { type: 'integer' },
          userId: { type: 'integer' },
          type: { type: 'string', minLength: 1 },
          sport: { type: 'string', minLength: 1 },
          title: { type: 'string' },
          text: { type: 'string', minLength: 1 },
          username: { type: 'string' },
          gender: { type: 'string' },
          age: { type: 'integer' },
          city: { type: 'string' },
          loc: { type: 'string' },
          address: { type: 'string' },
          poiId: { type: ['string', 'null'] },
          lat: { type: ['number', 'null'] },
          lng: { type: ['number', 'null'] },
          dist: { type: 'string' },
          distanceMeters: { type: 'integer' },
          color: { type: 'string' },
          colorBg: { type: 'string' },
          emoji: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          likes: { type: 'integer' },
          comments: { type: 'integer' },
          viewCount: { type: 'integer' },
          slots: { type: 'string' },
          cert: { type: 'boolean' },
          level: { type: 'string' },
          images: {
            type: 'array',
            items: { $ref: '#/components/schemas/FeedImage' },
          },
          videoUrl: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      FeedImage: {
        type: 'object',
        required: ['url'],
        additionalProperties: true,
        properties: {
          url: { type: 'string' },
          width: { type: 'integer' },
          height: { type: 'integer' },
        },
      },
      CreatePostInput: {
        type: 'object',
        required: ['type', 'sport', 'text'],
        additionalProperties: true,
        properties: {
          type: { type: 'string', minLength: 1 },
          sport: { type: 'string', minLength: 1 },
          title: { type: 'string' },
          text: { type: 'string', minLength: 1 },
          emoji: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          images: {
            type: 'array',
            items: { $ref: '#/components/schemas/FeedImage' },
          },
          videoUrl: { type: 'string' },
          level: { type: 'string' },
          slots: { type: 'string' },
          dist: { type: 'string' },
          city: { type: 'string' },
          loc: { type: 'string' },
          address: { type: 'string' },
          poiId: { type: 'string' },
          lat: { type: 'number' },
          lng: { type: 'number' },
        },
      },
      PostInteractions: {
        type: 'object',
        required: ['likedPostIds', 'savedPostIds'],
        properties: {
          likedPostIds: { type: 'array', items: { type: 'integer' } },
          savedPostIds: { type: 'array', items: { type: 'integer' } },
        },
      },
      Comment: {
        type: 'object',
        required: ['id'],
        additionalProperties: true,
        properties: {
          id: { type: 'integer' },
          text: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateCommentInput: {
        type: 'object',
        required: ['text'],
        properties: { text: { type: 'string' } },
      },
      StartConversationInput: {
        type: 'object',
        required: ['otherUserId'],
        properties: { otherUserId: { type: 'integer', minimum: 1 } },
      },
      ConversationStartResult: {
        type: 'object',
        required: ['conversationId', 'preexisting', 'targetUserId'],
        properties: {
          conversationId: { type: 'string' },
          preexisting: { type: 'boolean' },
          targetUserId: { type: 'integer' },
        },
      },
      SendMessageInput: {
        type: 'object',
        required: ['text'],
        properties: { text: { type: 'string', minLength: 1 } },
      },
      StartPublicIntentConversationInput: {
        type: 'object',
        additionalProperties: false,
        properties: { text: { type: 'string', minLength: 1 } },
      },
      PublicIntentConversationStartResult: {
        allOf: [
          { $ref: '#/components/schemas/ConversationStartResult' },
          {
            type: 'object',
            required: ['publicIntentId', 'agentConnectionId', 'message'],
            properties: {
              publicIntentId: { type: 'string' },
              agentConnectionId: { type: ['integer', 'null'] },
              message: {
                oneOf: [
                  { $ref: '#/components/schemas/ConversationMessage' },
                  { type: 'null' },
                ],
              },
            },
          },
        ],
      },
      ConversationMessage: {
        type: 'object',
        required: ['id', 'text', 'conversationId', 'isMine'],
        additionalProperties: true,
        properties: {
          id: { type: 'string' },
          text: { type: 'string' },
          source: { type: 'string' },
          senderId: { type: 'integer' },
          senderType: { type: 'string' },
          conversationId: { type: 'string' },
          time: { type: 'string' },
          isMine: { type: 'boolean' },
        },
      },
      ConversationHistoryMessage: {
        type: 'object',
        required: ['id', 'text', 'isMine'],
        additionalProperties: true,
        properties: {
          id: { type: 'string' },
          text: { type: 'string' },
          source: { type: 'string' },
          card: {
            type: ['object', 'null'],
            additionalProperties: true,
          },
          time: { type: 'string' },
          isMine: { type: 'boolean' },
        },
      },
      ConversationSummary: {
        type: 'object',
        required: ['id', 'conversationId'],
        additionalProperties: true,
        properties: {
          id: { type: 'string' },
          conversationId: { type: 'string' },
          title: { type: 'string' },
          lastMessage: { type: 'string' },
          unread: { type: 'integer' },
          updatedAt: { type: 'string' },
        },
      },
      AgentInboxUser: {
        type: 'object',
        required: ['id', 'name'],
        additionalProperties: true,
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          avatar: { type: 'string' },
          color: { type: 'string' },
        },
      },
      AgentInboxAgent: {
        type: 'object',
        required: ['id', 'name'],
        additionalProperties: true,
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          provider: { type: ['string', 'null'] },
          agentType: { type: ['string', 'null'] },
        },
      },
      AgentInboxConversation: {
        type: 'object',
        required: ['id', 'lastMessage', 'unread'],
        additionalProperties: true,
        properties: {
          id: { type: 'string' },
          participantUserIds: { type: 'array', items: { type: 'integer' } },
          participantAgentIds: { type: 'array', items: { type: 'integer' } },
          users: {
            type: 'array',
            items: { $ref: '#/components/schemas/AgentInboxUser' },
          },
          agents: {
            type: 'array',
            items: { $ref: '#/components/schemas/AgentInboxAgent' },
          },
          lastMessage: { type: 'string' },
          lastMessageTime: { type: ['string', 'null'], format: 'date-time' },
          time: { type: 'string' },
          unread: { type: 'integer' },
        },
      },
      AgentInboxMessage: {
        allOf: [
          { $ref: '#/components/schemas/ConversationMessage' },
          {
            type: 'object',
            additionalProperties: true,
            properties: {
              senderAgentId: { type: ['integer', 'null'] },
              receiverAgentId: { type: ['integer', 'null'] },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        ],
      },
      AgentInboxConversationsResult: {
        type: 'object',
        required: ['agentProfileId', 'agentName', 'conversations'],
        additionalProperties: false,
        properties: {
          agentProfileId: { type: ['integer', 'null'] },
          agentName: { type: ['string', 'null'] },
          conversations: {
            type: 'array',
            items: { $ref: '#/components/schemas/AgentInboxConversation' },
          },
        },
      },
      AgentInboxMessagesResult: {
        type: 'object',
        required: ['agentProfileId', 'agentName', 'conversationId', 'messages'],
        additionalProperties: false,
        properties: {
          agentProfileId: { type: ['integer', 'null'] },
          agentName: { type: ['string', 'null'] },
          conversationId: { type: 'string' },
          messages: {
            type: 'array',
            items: { $ref: '#/components/schemas/AgentInboxMessage' },
          },
        },
      },
      AgentInboxReplyInput: {
        type: 'object',
        required: ['content'],
        additionalProperties: false,
        properties: {
          agentProfileId: { type: 'integer', minimum: 1 },
          content: { type: 'string', minLength: 1 },
        },
      },
      AgentInboxReplyResult: {
        type: 'object',
        required: [
          'status',
          'agentProfileId',
          'agentName',
          'conversationId',
          'socketPushed',
          'message',
        ],
        additionalProperties: false,
        properties: {
          status: { type: 'string', enum: ['sent'] },
          agentProfileId: { type: ['integer', 'null'] },
          agentName: { type: ['string', 'null'] },
          conversationId: { type: 'string' },
          socketPushed: { type: 'boolean' },
          message: { $ref: '#/components/schemas/AgentInboxMessage' },
        },
      },
      UnreadCount: {
        type: 'object',
        required: ['unreadCount'],
        additionalProperties: true,
        properties: { unreadCount: { type: 'integer' } },
      },
      SocialAgentRunInput: {
        type: 'object',
        required: ['goal'],
        properties: {
          goal: { type: 'string', minLength: 1 },
          permissionMode: {
            type: 'string',
            enum: [
              'assist',
              'confirm',
              'manual_confirm',
              'limited_auto',
              'open',
              'lab',
            ],
          },
          idempotencyKey: { type: 'string' },
        },
      },
      SocialAgentChatRunResult: {
        type: 'object',
        required: [
          'taskId',
          'status',
          'visibleSteps',
          'assistantMessage',
          'socialRequestDraft',
          'candidates',
          'approvalRequiredActions',
          'events',
        ],
        additionalProperties: true,
        properties: {
          taskId: { type: 'integer' },
          status: { type: 'string' },
          visibleSteps: {
            type: 'array',
            items: { type: 'object', additionalProperties: true },
          },
          assistantMessage: { type: 'string' },
          emptyReason: { type: ['string', 'null'] },
          message: { type: ['string', 'null'] },
          debugReasons: {
            type: ['object', 'null'],
            additionalProperties: true,
          },
          socialRequestDraft: {
            type: ['object', 'null'],
            additionalProperties: true,
          },
          candidates: {
            type: 'array',
            items: { type: 'object', additionalProperties: true },
          },
          approvalRequiredActions: {
            type: 'array',
            items: { type: 'object', additionalProperties: true },
          },
          events: {
            type: 'array',
            items: { type: 'object', additionalProperties: true },
          },
          cards: {
            type: 'array',
            items: { type: 'object', additionalProperties: true },
          },
          safety: {
            type: 'object',
            additionalProperties: true,
          },
          traceId: { type: 'string' },
          agentTrace: {
            type: 'object',
            additionalProperties: true,
          },
          structuredIntent: {
            type: 'object',
            additionalProperties: true,
          },
        },
      },
      SocialAgentRouteMessageInput: {
        type: 'object',
        required: ['message'],
        properties: {
          message: { type: 'string' },
          taskId: { type: 'integer' },
          hasCandidates: { type: 'boolean' },
        },
      },
      SocialAgentCardActionInput: {
        type: 'object',
        required: ['action'],
        properties: {
          action: { type: 'string' },
          payload: { type: 'object', additionalProperties: true },
        },
      },
      SocialAgentCandidateActionInput: {
        type: 'object',
        additionalProperties: true,
        properties: {
          targetUserId: { type: 'integer' },
          candidateUserId: { type: 'integer' },
          candidateRecordId: { type: 'integer' },
          publicIntentId: { type: 'string' },
          socialRequestId: { type: 'integer' },
          candidate: { type: 'object', additionalProperties: true },
          suggestedOpener: { type: 'string' },
        },
      },
      SocialAgentReplanInput: {
        type: 'object',
        required: ['userMessage'],
        additionalProperties: true,
        properties: {
          userMessage: { type: 'string', minLength: 1 },
          reason: {
            type: 'string',
            enum: [
              'user_follow_up',
              'failure_recovery',
              'manual_replan',
              'initial',
            ],
          },
          failure: {
            type: ['object', 'null'],
            additionalProperties: true,
          },
        },
      },
      SocialAgentReplanResult: {
        type: 'object',
        required: [
          'taskId',
          'permissionMode',
          'allowedActions',
          'plan',
          'source',
          'fallbackReason',
          'reason',
          'replanAttempt',
        ],
        additionalProperties: true,
        properties: {
          taskId: { type: 'integer' },
          permissionMode: { type: 'string' },
          allowedActions: {
            type: 'array',
            items: { type: 'string' },
          },
          plan: {
            type: 'array',
            items: { type: 'object', additionalProperties: true },
          },
          source: { type: 'string', enum: ['deepseek', 'fallback'] },
          fallbackReason: { type: ['string', 'null'] },
          reason: {
            type: 'string',
            enum: [
              'initial',
              'user_follow_up',
              'failure_recovery',
              'manual_replan',
            ],
          },
          replanAttempt: { type: 'integer', minimum: 0 },
        },
      },
      SocialAgentAppendContextResult: {
        type: 'object',
        required: [
          'taskId',
          'saved',
          'eventType',
          'userMessage',
          'previousGoal',
          'refreshedGoal',
          'appendedAt',
        ],
        additionalProperties: true,
        properties: {
          taskId: { type: 'integer' },
          saved: { type: 'boolean', enum: [true] },
          eventType: {
            type: 'string',
            enum: ['social_agent.context.appended'],
          },
          userMessage: { type: 'string' },
          previousGoal: { type: 'string' },
          refreshedGoal: { type: 'string' },
          appendedAt: { type: 'string', format: 'date-time' },
        },
      },
      SocialAgentTaskEventsResult: {
        type: 'object',
        required: ['taskId', 'events'],
        additionalProperties: true,
        properties: {
          taskId: { type: 'integer' },
          events: {
            type: 'array',
            items: { type: 'object', additionalProperties: true },
          },
        },
      },
      SocialAgentPublishSocialRequestInput: {
        type: 'object',
        additionalProperties: true,
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          requestType: { type: 'string' },
          city: { type: 'string' },
          locationText: { type: 'string' },
          timePreference: { type: 'string' },
          interestTags: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
      SocialAgentPublishResult: {
        type: 'object',
        required: [
          'success',
          'taskId',
          'socialRequestId',
          'publicIntentId',
          'status',
          'taskStatus',
          'synced',
          'socialRequest',
        ],
        additionalProperties: true,
        properties: {
          success: { type: 'boolean' },
          taskId: { type: 'integer' },
          socialRequestId: { type: 'integer' },
          publicIntentId: { type: ['string', 'null'] },
          status: { type: 'string' },
          taskStatus: { type: 'string' },
          synced: { type: 'boolean' },
          toolCallId: { type: 'string' },
          socialRequest: { type: 'object', additionalProperties: true },
        },
      },
      SocialAgentSessionSnapshot: {
        type: 'object',
        required: ['hasSession', 'activeTaskId', 'messages'],
        additionalProperties: true,
        properties: {
          hasSession: { type: 'boolean' },
          activeTaskId: { type: 'integer', nullable: true },
          task: { type: 'object', nullable: true, additionalProperties: true },
          messages: {
            type: 'array',
            items: { type: 'object', additionalProperties: true },
          },
          events: {
            type: 'array',
            items: { type: 'object', additionalProperties: true },
          },
          result: {
            type: 'object',
            nullable: true,
            additionalProperties: true,
          },
          latestRun: {
            type: 'object',
            nullable: true,
            additionalProperties: true,
          },
          pendingApprovals: {
            type: 'array',
            items: { type: 'object', additionalProperties: true },
          },
          restoredAt: { type: 'string', format: 'date-time' },
        },
      },
      SocialAgentAsyncRunSnapshot: {
        type: 'object',
        required: [
          'taskId',
          'runId',
          'status',
          'phase',
          'message',
          'pollAfterMs',
        ],
        additionalProperties: true,
        properties: {
          taskId: { type: 'integer' },
          runId: { type: 'string' },
          status: {
            type: 'string',
            enum: ['queued', 'running', 'completed', 'failed'],
          },
          phase: { type: 'string' },
          message: { type: 'string' },
          visibleSteps: {
            type: 'array',
            items: { type: 'object', additionalProperties: true },
          },
          pollAfterMs: { type: 'integer' },
          taskStatus: { type: 'string' },
          queuedAt: { type: ['string', 'null'], format: 'date-time' },
          startedAt: { type: ['string', 'null'], format: 'date-time' },
          updatedAt: { type: ['string', 'null'], format: 'date-time' },
          completedAt: { type: ['string', 'null'], format: 'date-time' },
          failedAt: { type: ['string', 'null'], format: 'date-time' },
          error: {
            type: ['object', 'null'],
            additionalProperties: true,
          },
          result: {
            type: ['object', 'null'],
            additionalProperties: true,
          },
          replan: {
            type: ['object', 'null'],
            additionalProperties: true,
          },
        },
      },
      SocialAgentCurrentTaskSnapshot: {
        type: 'object',
        required: [
          'taskId',
          'status',
          'taskType',
          'title',
          'goal',
          'memory',
          'result',
          'updatedAt',
          'createdAt',
        ],
        additionalProperties: true,
        properties: {
          taskId: { type: 'integer' },
          status: { type: 'string' },
          agentState: { type: 'string' },
          taskType: { type: 'string' },
          title: { type: 'string' },
          goal: { type: 'string' },
          memory: { type: 'object', additionalProperties: true },
          result: { type: 'object', additionalProperties: true },
          updatedAt: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      SocialAgentTaskTimelineSnapshot: {
        type: 'object',
        required: ['taskId', 'messages', 'task', 'restoredAt'],
        additionalProperties: true,
        properties: {
          taskId: { type: 'integer' },
          messages: {
            type: 'array',
            items: { type: 'object', additionalProperties: true },
          },
          task: { type: 'object', additionalProperties: true },
          memory: { type: 'object', additionalProperties: true },
          result: {
            type: 'object',
            nullable: true,
            additionalProperties: true,
          },
          events: {
            type: 'array',
            items: { type: 'object', additionalProperties: true },
          },
          latestRun: {
            type: 'object',
            nullable: true,
            additionalProperties: true,
          },
          pendingApprovals: {
            type: 'array',
            items: { type: 'object', additionalProperties: true },
          },
          candidateActions: { type: 'object', additionalProperties: true },
          restoredAt: { type: 'string', format: 'date-time' },
        },
      },
      UserFacingAgentResponse: {
        type: 'object',
        required: [
          'assistantMessage',
          'lightStatus',
          'cards',
          'safeStatus',
          'pendingConfirmations',
          'permissionMode',
        ],
        additionalProperties: true,
        properties: {
          assistantMessage: { type: 'string' },
          lightStatus: { type: 'string' },
          cards: {
            type: 'array',
            items: { type: 'object', additionalProperties: true },
          },
          safeStatus: { type: 'object', additionalProperties: true },
          pendingConfirmations: {
            type: 'array',
            items: { type: 'object', additionalProperties: true },
          },
          permissionMode: { type: 'string' },
        },
      },
      FileUploadInput: {
        type: 'object',
        required: ['file'],
        properties: { file: { type: 'string', format: 'binary' } },
      },
      ImageUploadResult: {
        type: 'object',
        required: ['url', 'width', 'height'],
        properties: {
          url: { type: 'string' },
          width: { type: 'integer' },
          height: { type: 'integer' },
        },
      },
      VideoUploadResult: {
        type: 'object',
        required: ['url'],
        properties: { url: { type: 'string' } },
      },
      Error: {
        type: 'object',
        properties: {
          statusCode: { type: 'integer' },
          timestamp: { type: 'string', format: 'date-time' },
          path: { type: 'string' },
          code: { type: 'string' },
          message: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
          },
          details: { type: 'object', additionalProperties: true },
          error: {
            type: 'object',
            required: ['code', 'message', 'retryable'],
            additionalProperties: true,
            properties: {
              code: { type: 'string' },
              message: {
                oneOf: [
                  { type: 'string' },
                  { type: 'array', items: { type: 'string' } },
                ],
              },
              retryable: { type: 'boolean' },
            },
          },
        },
      },
    },
  },
} as const;
