export const fitMeetCoreOpenApi = {
  openapi: '3.1.0',
  info: {
    title: 'FitMeet Core Web/App API',
    version: '2026-06-05',
    description:
      'Shared contract for FitMeet Web and App auth, feed, Social Agent chat, and uploads.',
  },
  servers: [{ url: '/api' }],
  tags: [
    { name: 'auth' },
    { name: 'feed' },
    { name: 'social-agent-chat' },
    { name: 'uploads' },
  ],
  paths: {
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
        responses: { '200': { $ref: '#/components/responses/AuthResult' } },
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
        responses: { '200': { $ref: '#/components/responses/AuthResult' } },
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
        responses: { '200': { $ref: '#/components/responses/AuthResult' } },
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
            schema: { type: 'integer', minimum: 1, maximum: 100 },
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
      FeedPage: {
        type: 'object',
        required: ['data'],
        properties: {
          data: { type: 'array', items: { $ref: '#/components/schemas/Post' } },
          page: { type: 'integer' },
          limit: { type: 'integer' },
          total: { type: 'integer' },
        },
      },
      Post: {
        type: 'object',
        required: ['id'],
        additionalProperties: true,
        properties: {
          id: { type: 'integer' },
          text: { type: 'string' },
          content: { type: 'string' },
          image: { type: 'string' },
          video: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      CreatePostInput: {
        type: 'object',
        additionalProperties: true,
        properties: {
          text: { type: 'string' },
          content: { type: 'string' },
          image: { type: 'string' },
          video: { type: 'string' },
          category: { type: 'string' },
          visibility: { type: 'string' },
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
          message: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
          },
          error: { type: 'string' },
        },
      },
    },
  },
} as const;
