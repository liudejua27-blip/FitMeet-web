export const fitMeetCoreOpenApi = {
  openapi: '3.1.0',
  info: {
    title: 'FitMeet Core Web/App API',
    version: '2026-06-05',
    description:
      'Shared contract for FitMeet Web and App auth, users, feed, messages, Social Agent chat, and uploads.',
  },
  servers: [{ url: '/api' }],
  tags: [
    { name: 'system' },
    { name: 'auth' },
    { name: 'users' },
    { name: 'feed' },
    { name: 'messages' },
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
          type: { type: 'string' },
          sport: { type: 'string' },
          title: { type: 'string' },
          text: { type: 'string' },
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
          type: { type: 'string' },
          sport: { type: 'string' },
          title: { type: 'string' },
          text: { type: 'string' },
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
      UnreadCount: {
        type: 'object',
        required: ['unreadCount'],
        additionalProperties: true,
        properties: { unreadCount: { type: 'integer' } },
      },
      SocialAgentRunInput: {
        type: 'object',
        required: ['goal', 'permissionMode'],
        properties: {
          goal: { type: 'string' },
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
