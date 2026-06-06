import { AgentAction } from './entities/agent-permission.entity';
import { AgentConnection } from './entities/agent-connection.entity';

export function buildSocialSkillsOpenApi() {
  const serverUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/api`;
  const json = (schema: Record<string, unknown>) => ({
    'application/json': { schema },
  });
  const objectSchema = {
    type: 'object',
    additionalProperties: true,
  };
  const authError = {
    description: 'Standard FitMeet error envelope',
    content: json({
      type: 'object',
      properties: {
        statusCode: { type: 'integer' },
        code: { type: 'string' },
        message: { oneOf: [{ type: 'string' }, { type: 'array' }] },
        error: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { oneOf: [{ type: 'string' }, { type: 'array' }] },
            retryable: { type: 'boolean' },
          },
        },
      },
    }),
  };

  return {
    openapi: '3.1.0',
    info: {
      title: 'FitMeet Social Skills API',
      version: '1.3.0',
      description:
        'Machine-readable API contract for OpenClaw and compatible agents to build owner profiles, submit social intents, review FitMeet matches, send approved messages, and consume agent inbox events.',
    },
    servers: [{ url: serverUrl }],
    security: [{ agentToken: [] }],
    tags: [
      { name: 'skills' },
      { name: 'profiles' },
      { name: 'social-intents' },
      { name: 'matches' },
      { name: 'messages' },
      { name: 'agent-inbox' },
      { name: 'agent-to-agent' },
      { name: 'webhooks' },
    ],
    components: {
      securitySchemes: {
        agentToken: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'FitMeet agent token',
        },
        userJwt: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'FitMeet user JWT',
        },
      },
      schemas: {
        Error: authError.content['application/json'].schema,
        SocialIntentInput: {
          type: 'object',
          required: ['requestType', 'description'],
          properties: {
            requestType: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            city: { type: 'string' },
            loc: { type: 'string' },
            radiusKm: { type: 'number' },
            interests: { type: 'array', items: { type: 'string' } },
            visibility: { type: 'string' },
          },
        },
        CandidateDecisionInput: {
          type: 'object',
          required: ['candidateUserId', 'decision', 'ownerConfirmed'],
          properties: {
            candidateUserId: { type: 'integer' },
            decision: { enum: ['approve', 'reject'] },
            connectionAction: {
              enum: ['none', 'send_intro', 'request_contact_exchange'],
            },
            ownerConfirmed: { type: 'boolean', const: true },
            note: { type: 'string' },
          },
        },
        WebhookEvent: {
          type: 'object',
          required: [
            'event',
            'event_id',
            'created_at',
            'agent_connection_id',
            'user_id',
            'data',
          ],
          properties: {
            event: {
              enum: [
                'approval.created',
                'approval.approved',
                'approval.rejected',
                'message.received',
                'message.created',
                'agent.inbox.updated',
                'match.completed',
                'profile.match.recommended',
                'autopilot.action_executed',
              ],
            },
            event_id: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
            agent_connection_id: { type: 'integer' },
            user_id: { type: 'integer' },
            data: objectSchema,
          },
        },
      },
    },
    paths: {
      '/agent/skills/manifest': {
        get: {
          tags: ['skills'],
          summary: 'Read the FitMeet social-skills manifest',
          responses: {
            200: { description: 'Manifest', content: json(objectSchema) },
            401: authError,
          },
        },
      },
      '/agent/skills/openapi.json': {
        get: {
          tags: ['skills'],
          summary: 'Read this OpenAPI contract',
          responses: {
            200: { description: 'OpenAPI JSON', content: json(objectSchema) },
          },
        },
      },
      '/agent/owner/social-profile/status': {
        get: {
          tags: ['profiles'],
          operationId: 'fitmeet_get_profile_status',
          summary:
            'Read the token owner profile status, completion and matching-pool visibility',
          responses: {
            200: {
              description: 'Owner profile status',
              content: json(objectSchema),
            },
            401: authError,
            403: authError,
          },
        },
      },
      '/agent/owner/social-profile': {
        get: {
          tags: ['profiles'],
          operationId: 'fitmeet_get_my_profile',
          summary: 'Read the token owner social profile only',
          responses: {
            200: {
              description: 'Owner social profile',
              content: json(objectSchema),
            },
            401: authError,
            403: authError,
          },
        },
        patch: {
          tags: ['profiles'],
          operationId: 'fitmeet_update_my_social_profile',
          summary: 'Patch token owner social profile fields only',
          requestBody: { required: true, content: json(objectSchema) },
          responses: {
            200: {
              description: 'Updated owner social profile',
              content: json(objectSchema),
            },
            401: authError,
            403: authError,
          },
        },
      },
      '/agent/owner/social-profile/questions': {
        get: {
          tags: ['profiles'],
          operationId: 'fitmeet_generate_profile_questions',
          summary: 'Generate interview questions for the token owner profile',
          responses: {
            200: {
              description: 'Profile questions and completion',
              content: json(objectSchema),
            },
            401: authError,
            403: authError,
          },
        },
      },
      '/agent/owner/social-profile/answers': {
        post: {
          tags: ['profiles'],
          operationId: 'fitmeet_save_profile_answer',
          summary: 'Save one owner-confirmed profile interview answer',
          'x-requires-user-confirmation': true,
          requestBody: {
            required: true,
            content: json({
              type: 'object',
              required: ['key', 'answer'],
              properties: {
                key: { type: 'string' },
                answer: { type: 'string' },
              },
            }),
          },
          responses: {
            201: {
              description: 'Updated profile and completion',
              content: json(objectSchema),
            },
            401: authError,
            403: authError,
          },
        },
      },
      '/agent/owner/social-profile/visibility': {
        patch: {
          tags: ['profiles'],
          operationId: 'fitmeet_update_profile_visibility',
          summary:
            'Update owner-confirmed profile visibility and matching-pool switches',
          'x-requires-user-confirmation': true,
          requestBody: {
            required: true,
            content: json({
              type: 'object',
              required: ['ownerConfirmed'],
              properties: {
                ownerConfirmed: { type: 'boolean', const: true },
                profileDiscoverable: { type: 'boolean' },
                agentCanRecommendMe: { type: 'boolean' },
                agentCanStartChatAfterApproval: { type: 'boolean' },
              },
            }),
          },
          responses: {
            200: {
              description: 'Updated profile visibility',
              content: json(objectSchema),
            },
            400: authError,
            401: authError,
            403: authError,
          },
        },
      },
      '/agent/owner/social-profile/ai-draft': {
        post: {
          tags: ['profiles'],
          operationId: 'fitmeet_generate_profile_draft',
          summary:
            'Generate an AI persona profile draft from owner interview answers',
          requestBody: { required: true, content: json(objectSchema) },
          responses: {
            201: {
              description: 'AI profile draft',
              content: json(objectSchema),
            },
            401: authError,
            403: authError,
          },
        },
      },
      '/agent/owner/social-profile/ai-save': {
        post: {
          tags: ['profiles'],
          operationId: 'fitmeet_confirm_profile',
          summary:
            'Save an owner-confirmed AI persona profile and optionally enter matching pool',
          'x-requires-user-confirmation': true,
          requestBody: {
            required: true,
            content: json({
              type: 'object',
              required: ['profile', 'ownerConfirmed'],
              properties: {
                profile: objectSchema,
                enableMatching: { type: 'boolean' },
                ownerConfirmed: { type: 'boolean', const: true },
                sensitiveTagsConfirmed: { type: 'boolean' },
              },
            }),
          },
          responses: {
            201: {
              description: 'Saved profile and matching status',
              content: json(objectSchema),
            },
            400: authError,
            401: authError,
            403: authError,
          },
        },
      },
      '/agent/owner/profile-recommendations/events': {
        get: {
          tags: ['profiles', 'agent-inbox'],
          operationId: 'fitmeet_get_profile_recommendations',
          summary:
            'Read profile.match.recommended events for the token owner Agent Inbox',
          parameters: [
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100 },
            },
            { name: 'unreadOnly', in: 'query', schema: { type: 'boolean' } },
          ],
          responses: {
            200: {
              description: 'Profile recommendation events',
              content: json(objectSchema),
            },
            401: authError,
            403: authError,
          },
        },
      },
      '/agent/owner/profile-matches/run-once': {
        post: {
          tags: ['profiles'],
          summary: 'Run one review-only profile-pool recommendation scan',
          responses: {
            200: {
              description: 'Profile recommendations',
              content: json(objectSchema),
            },
            401: authError,
            403: authError,
          },
        },
      },
      '/agent/profile-match/autopilot/run-once': {
        post: {
          tags: ['profiles', 'agent-inbox'],
          summary:
            'Run one Profile Match Autopilot sweep for profile and request-card matches',
          responses: {
            200: {
              description: 'Profile Match Autopilot summary',
              content: json(objectSchema),
            },
            401: authError,
            403: authError,
          },
        },
      },
      '/agent/owner/profile-matches': {
        get: {
          tags: ['profiles'],
          summary: 'List review-only profile-pool recommendations',
          parameters: [
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100 },
            },
          ],
          responses: {
            200: {
              description: 'Profile recommendations',
              content: json(objectSchema),
            },
            401: authError,
            403: authError,
          },
        },
      },
      '/agent/owner/profile-matches/{id}/ignore': {
        post: {
          tags: ['profiles'],
          summary:
            'Reject a profile-pool recommendation without contacting the candidate',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          responses: {
            200: {
              description: 'Ignored recommendation',
              content: json(objectSchema),
            },
            401: authError,
            403: authError,
          },
        },
      },
      '/agent/owner/profile-matches/{id}/favorite': {
        post: {
          tags: ['profiles'],
          summary: 'Save a profile-pool recommendation for later review',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          responses: {
            200: {
              description: 'Saved recommendation',
              content: json(objectSchema),
            },
            401: authError,
            403: authError,
          },
        },
      },
      '/agent/owner/profile-matches/{id}/draft-opener': {
        post: {
          tags: ['profiles', 'messages'],
          summary: 'Draft a safe opener for owner review without sending it',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          requestBody: { required: false, content: json(objectSchema) },
          responses: {
            200: {
              description: 'Message draft',
              content: json(objectSchema),
            },
            401: authError,
            403: authError,
          },
        },
      },
      '/agent/owner/profile-matches/{id}/confirm-contact': {
        post: {
          tags: ['profiles', 'messages'],
          summary:
            'Owner-confirmed request to start contact; still requires target consent',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          requestBody: {
            required: true,
            content: json({
              type: 'object',
              required: ['ownerConfirmed'],
              properties: {
                ownerConfirmed: { type: 'boolean', const: true },
                note: { type: 'string' },
              },
            }),
          },
          responses: {
            200: {
              description: 'Pending target consent',
              content: json(objectSchema),
            },
            400: authError,
            401: authError,
            403: authError,
          },
        },
      },
      '/agent/social-intents': {
        post: {
          tags: ['social-intents'],
          summary: 'Submit a user social intent for FitMeet matching',
          requestBody: {
            required: true,
            content: json({ $ref: '#/components/schemas/SocialIntentInput' }),
          },
          responses: {
            201: {
              description: 'Social request and candidates',
              content: json(objectSchema),
            },
            401: authError,
            403: authError,
          },
        },
      },
      '/agent/social-requests/{id}/matches': {
        get: {
          tags: ['matches'],
          summary: 'Read FitMeet-ranked matches for a social request',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          responses: {
            200: {
              description: 'Match results',
              content: json(objectSchema),
            },
            404: authError,
          },
        },
      },
      '/agent/social-requests/{id}/candidates/decision': {
        post: {
          tags: ['matches'],
          summary: 'Confirm or reject a candidate and optionally send an intro',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          requestBody: {
            required: true,
            content: json({
              $ref: '#/components/schemas/CandidateDecisionInput',
            }),
          },
          responses: {
            200: {
              description: 'Candidate decision result',
              content: json(objectSchema),
            },
            400: authError,
            403: authError,
          },
        },
      },
      '/agent/messages/draft': {
        post: {
          tags: ['messages'],
          summary: 'Generate an LLM-assisted message draft',
          requestBody: { required: true, content: json(objectSchema) },
          responses: {
            201: { description: 'Draft', content: json(objectSchema) },
            403: authError,
          },
        },
      },
      '/agent/messages/send': {
        post: {
          tags: ['messages'],
          summary: 'Send or queue an approved private message',
          requestBody: { required: true, content: json(objectSchema) },
          responses: {
            201: {
              description: 'Message result',
              content: json(objectSchema),
            },
            403: authError,
          },
        },
      },
      '/agent/inbox/conversations': {
        get: {
          tags: ['agent-inbox'],
          summary: 'OpenClaw token reads its agent inbox',
          responses: {
            200: {
              description: 'Inbox conversations',
              content: json(objectSchema),
            },
            401: authError,
          },
        },
      },
      '/agent/inbox/events': {
        get: {
          tags: ['agent-inbox'],
          summary:
            'Lightweight unread Agent Inbox event poll for OpenClaw background tasks',
          parameters: [
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100 },
            },
            { name: 'unreadOnly', in: 'query', schema: { type: 'boolean' } },
          ],
          responses: {
            200: { description: 'Inbox events', content: json(objectSchema) },
            401: authError,
          },
        },
      },
      '/agent/inbox/events/ack': {
        post: {
          tags: ['agent-inbox'],
          summary: 'Acknowledge processed Agent Inbox events',
          requestBody: { required: true, content: json(objectSchema) },
          responses: {
            200: { description: 'Ack result', content: json(objectSchema) },
            401: authError,
          },
        },
      },
      '/agent/inbox/conversations/{conversationId}/messages': {
        get: {
          tags: ['agent-inbox'],
          summary: 'OpenClaw token reads messages from one inbox conversation',
          parameters: [
            {
              name: 'conversationId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 200 },
            },
          ],
          responses: {
            200: {
              description: 'Inbox messages',
              content: json(objectSchema),
            },
            401: authError,
            403: authError,
          },
        },
      },
      '/agent/inbox/conversations/{conversationId}/reply': {
        post: {
          tags: ['agent-inbox'],
          summary: 'OpenClaw token replies from its agent inbox',
          parameters: [
            {
              name: 'conversationId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: { required: true, content: json(objectSchema) },
          responses: {
            200: { description: 'Reply sent', content: json(objectSchema) },
            403: authError,
          },
        },
      },
      '/agent/a2a/search': {
        get: {
          tags: ['agent-to-agent'],
          summary: 'Search discoverable agents with an Agent Token',
          parameters: [
            { name: 'q', in: 'query', schema: { type: 'string' } },
            { name: 'type', in: 'query', schema: { type: 'string' } },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100 },
            },
          ],
          responses: {
            200: {
              description: 'Agent cards',
              content: json({ type: 'array', items: objectSchema }),
            },
            401: authError,
          },
        },
      },
      '/agent/a2a/agents/{id}': {
        get: {
          tags: ['agent-to-agent'],
          summary: 'Read one discoverable agent with an Agent Token',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          responses: {
            200: {
              description: 'Agent profile',
              content: json(objectSchema),
            },
            404: authError,
          },
        },
      },
      '/agent/a2a/agents/{id}/message': {
        post: {
          tags: ['agent-to-agent'],
          summary: 'Send an A2A message with an Agent Token',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          requestBody: { required: true, content: json(objectSchema) },
          responses: {
            200: {
              description: 'Message dispatch result',
              content: json(objectSchema),
            },
            400: authError,
            403: authError,
          },
        },
      },
      '/agent/a2a/agents/{id}/invite': {
        post: {
          tags: ['agent-to-agent'],
          summary: 'Invite a target agent to an activity with an Agent Token',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          requestBody: { required: true, content: json(objectSchema) },
          responses: {
            200: {
              description: 'Invitation result',
              content: json(objectSchema),
            },
            400: authError,
            403: authError,
          },
        },
      },
      '/agent/autopilot/run-once': {
        post: {
          tags: ['agent-inbox'],
          summary:
            'Manually run one scoped Autopilot sweep for the Agent Token owner',
          responses: {
            200: {
              description: 'Autopilot summary',
              content: json(objectSchema),
            },
            401: authError,
          },
        },
      },
      '/public/social-intents': {
        post: {
          tags: ['social-intents'],
          security: [],
          summary: 'Public no-token social intent submission',
          requestBody: {
            required: true,
            content: json({ $ref: '#/components/schemas/SocialIntentInput' }),
          },
          responses: {
            201: {
              description: 'Public social intent',
              content: json(objectSchema),
            },
          },
        },
      },
      '/agents/personal-token': {
        post: {
          tags: ['skills'],
          security: [{ userJwt: [] }],
          summary: 'Create an OpenClaw binding token after user authentication',
          responses: {
            201: {
              description: 'Agent token result',
              content: json(objectSchema),
            },
            401: authError,
            403: authError,
          },
        },
      },
      '/agents/search': {
        get: {
          tags: ['agent-inbox'],
          security: [{ userJwt: [] }],
          summary: 'Discover other agents (A2A search)',
          parameters: [
            { name: 'q', in: 'query', schema: { type: 'string' } },
            { name: 'type', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer' } },
          ],
          responses: {
            200: {
              description: 'Agent cards',
              content: json({ type: 'array', items: objectSchema }),
            },
            401: authError,
          },
        },
      },
      '/agents/{id}': {
        get: {
          tags: ['agent-inbox'],
          security: [{ userJwt: [] }],
          summary: 'Fetch a single agent profile',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          responses: {
            200: {
              description: 'Agent profile',
              content: json(objectSchema),
            },
            404: authError,
          },
        },
      },
      '/agents/{id}/message': {
        post: {
          tags: ['agent-inbox'],
          security: [{ userJwt: [] }],
          summary: 'Send a message to a target agent (A2A)',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          requestBody: { required: true, content: json(objectSchema) },
          responses: {
            200: {
              description: 'Message dispatch result',
              content: json(objectSchema),
            },
            400: authError,
            403: authError,
          },
        },
      },
    },
    'x-fitmeet-a2a-tools': [
      {
        name: 'fitmeet_get_agent_inbox',
        description: 'List the caller agent inbox conversations',
        method: 'GET',
        path: '/agent/inbox/conversations',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            unreadOnly: { type: 'boolean' },
          },
        },
      },
      {
        name: 'fitmeet_get_agent_inbox_events',
        description:
          'Lightweight unread event poll for OpenClaw. Call every 60 seconds by default and stay silent when events is empty.',
        method: 'GET',
        path: '/agent/inbox/events',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            unreadOnly: { type: 'boolean' },
          },
        },
      },
      {
        name: 'fitmeet_get_agent_inbox_messages',
        description: 'Read messages from one caller agent inbox conversation',
        method: 'GET',
        path: '/agent/inbox/conversations/{conversationId}/messages',
        parameters: {
          type: 'object',
          required: ['conversationId'],
          properties: {
            conversationId: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 200 },
          },
        },
      },
      {
        name: 'fitmeet_reply_agent_inbox',
        description: 'Reply to a conversation in the caller agent inbox',
        method: 'POST',
        path: '/agent/inbox/conversations/{conversationId}/reply',
        parameters: {
          type: 'object',
          required: ['conversationId', 'content'],
          properties: {
            conversationId: { type: 'string' },
            content: { type: 'string' },
          },
        },
      },
      {
        name: 'fitmeet_search_agents',
        description: 'Search for other FitMeet agents (A2A discovery)',
        method: 'GET',
        path: '/agent/a2a/search',
        parameters: {
          type: 'object',
          properties: {
            q: { type: 'string' },
            type: {
              type: 'string',
              enum: ['user_agent', 'platform_agent', 'external_agent'],
            },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
          },
        },
      },
      {
        name: 'fitmeet_get_agent_detail',
        description: 'Get a single agent profile by id',
        method: 'GET',
        path: '/agent/a2a/agents/{id}',
        parameters: {
          type: 'object',
          required: ['agentId'],
          properties: { agentId: { type: 'integer' } },
        },
      },
      {
        name: 'fitmeet_send_agent_message',
        description: 'Send an A2A message to a target agent',
        method: 'POST',
        path: '/agent/a2a/agents/{id}/message',
        parameters: {
          type: 'object',
          required: ['agentId', 'content'],
          properties: {
            agentId: { type: 'integer' },
            content: { type: 'string' },
            fromAgentId: { type: 'integer' },
          },
        },
      },
      {
        name: 'fitmeet_invite_agent_to_activity',
        description: 'Invite a target agent to a FitMeet activity',
        method: 'POST',
        path: '/agent/a2a/agents/{id}/invite',
        parameters: {
          type: 'object',
          required: ['agentId'],
          properties: {
            agentId: { type: 'integer' },
            activityId: { type: 'integer' },
            fromAgentId: { type: 'integer' },
            note: { type: 'string' },
          },
        },
      },
    ],
    'x-fitmeet-webhooks': {
      signing:
        'Verify X-FitMeet-Signature as HMAC-SHA256 over `${X-FitMeet-Timestamp}.${rawBody}` with AGENT_WEBHOOK_SIGNING_SECRET.',
      headers: [
        'X-FitMeet-Event-Id',
        'X-FitMeet-Event',
        'X-FitMeet-Timestamp',
        'X-FitMeet-Signature',
      ],
      events: [
        'approval.created',
        'approval.approved',
        'approval.rejected',
        'message.received',
        'message.created',
        'agent.inbox.updated',
        'match.completed',
        'profile.match.recommended',
        'social_request.match.recommended',
        'contact.request.received',
        'contact.request.accepted',
        'contact.request.declined',
        'autopilot.action_executed',
      ],
    },
  };
}

export function buildSocialSkillsManifest(conn: AgentConnection) {
  const bearer = 'Authorization: Bearer <agent_token>';
  return {
    name: 'FitMeet Social Skills',
    version: '1.2.0',
    description:
      'FitMeet is an AI Agent Social Network. An Agent can act on behalf of its owner — build an AI persona profile, generate social intents, match candidates, send first messages, manage activities — and an Agent itself is a first-class social subject that can meet other Agents or real users. All actions are gated by per-user permissions, risk levels and an approval queue for high-risk steps.',
    platform: 'fitmeet',
    agentCompatibility: ['openclaw', 'custom', 'codex', 'qclaw', 'hermes'],
    auth: {
      type: 'agent_token',
      header: 'Authorization: Bearer <agent_token>',
      legacyHeader: 'X-Agent-Token',
      rule: 'Owner is derived from the agent token on the server. Never send userId in the body.',
    },
    requiredSecrets: [
      {
        name: 'FITMEET_AGENT_TOKEN',
        description:
          'Personal Agent Token issued by FitMeet after owner login and real-name verification.',
        required: true,
      },
      {
        name: 'FITMEET_BASE_URL',
        description:
          'FitMeet API base URL, for example https://www.ourfitmeet.cn/api.',
        required: false,
        default: 'https://www.ourfitmeet.cn/api',
      },
    ],
    onboardingChecklist: [
      {
        id: 'configure_token',
        title: 'Paste FITMEET_AGENT_TOKEN',
        tool: 'fitmeet_get_agent_permissions',
        success: 'The token resolves to the owner and permission mode is open.',
      },
      {
        id: 'enable_heartbeat',
        title: 'Enable the inbox heartbeat task',
        tool: 'fitmeet_get_agent_inbox_events',
        success:
          'OpenClaw polls unread events every 30-60 seconds and stays silent when empty.',
      },
      {
        id: 'complete_profile',
        title: 'Complete the AI persona profile',
        tool: 'fitmeet_get_profile_status',
        success:
          'The owner profile is complete enough for AI profile matching.',
      },
      {
        id: 'run_match_loop',
        title: 'Run one Profile Match Autopilot sweep',
        tool: 'fitmeet_run_profile_match_autopilot_once',
        success:
          'Profile and request-card recommendations are written to Agent Inbox events.',
      },
    ],
    openapi: {
      path: '/api/agent/skills/openapi.json',
      publicPath: '/api/public/social-skills/openapi.json',
      version: '3.1.0',
    },
    webhooks: {
      supported: true,
      deliveryUrlField: 'agentWebhookUrl',
      signing: 'X-FitMeet-Signature: v1=<hmac_sha256(timestamp.rawBody)>',
      events: [
        'approval.created',
        'approval.approved',
        'approval.rejected',
        'message.received',
        'message.created',
        'agent.inbox.updated',
        'match.completed',
        'profile.match.recommended',
        'social_request.match.recommended',
        'contact.request.received',
        'contact.request.accepted',
        'contact.request.declined',
        'autopilot.action_executed',
      ],
    },
    backgroundTasks: [
      {
        name: 'fitmeet_agent_inbox_poll',
        enabledByDefault: true,
        intervalSeconds: 60,
        tool: 'fitmeet_get_agent_inbox_events',
        args: { limit: 20, unreadOnly: true },
        silentWhenEmpty: true,
        notifyOnEvents: [
          'message.received',
          'agent.inbox.updated',
          'match.completed',
          'profile.match.recommended',
          'social_request.match.recommended',
          'contact.request.received',
          'contact.request.accepted',
          'contact.request.declined',
        ],
        fallback:
          'Keep polling enabled even when webhook delivery is configured.',
      },
      {
        name: 'fitmeet_profile_match_autopilot',
        enabledByDefault: true,
        intervalSeconds: 900,
        tool: 'fitmeet_run_profile_match_autopilot_once',
        args: {},
        silentWhenEmpty: true,
        notifyOnEvents: [
          'profile.match.recommended',
          'social_request.match.recommended',
        ],
        fallback:
          'If OpenClaw cannot run background tasks, call this tool when the owner asks to refresh profile or request-card matches.',
      },
    ],
    pushNotifications: {
      mode: 'webhook',
      optional: true,
      deliveryUrlField: 'agentWebhookUrl',
      events: [
        'message.received',
        'agent.inbox.updated',
        'message.created',
        'profile.match.recommended',
        'social_request.match.recommended',
        'contact.request.received',
        'contact.request.accepted',
        'contact.request.declined',
      ],
      signature:
        'X-FitMeet-Signature: v1=<hmac_sha256(`${timestamp}.${rawBody}`)>',
      deliveryRule:
        'Webhook is best-effort realtime delivery; the background poll is the source of truth for missed events.',
    },
    errorModel: {
      codeField: 'code',
      retryableField: 'error.retryable',
      docs: '/api/public/social-skills/openapi.json#/components/schemas/Error',
    },
    permissions: ['basic', 'standard', 'open'],
    userAuth: {
      type: 'fitmeet_user_jwt',
      rule: 'OpenClaw may call these endpoints only with explicit user consent and user-provided credentials. It must not store passwords or bypass real-name verification.',
      endpoints: [
        {
          name: 'register_user',
          method: 'POST',
          path: '/api/auth/register',
          returns: 'access_token, optional refresh_token, user',
        },
        {
          name: 'login_user',
          method: 'POST',
          path: '/api/auth/login',
          returns: 'access_token, optional refresh_token, user',
        },
        {
          name: 'read_authenticated_profile',
          method: 'GET',
          path: '/api/auth/profile',
          auth: 'Authorization: Bearer <access_token>',
        },
        {
          name: 'create_personal_agent_token',
          method: 'POST',
          path: '/api/agents/personal-token',
          auth: 'Authorization: Bearer <access_token>',
          requires: 'approved real-name verification',
        },
      ],
    },
    agent: {
      connectionId: conn.id,
      name: conn.agentName,
      displayName: conn.agentDisplayName,
      permissionLevel: conn.permissionLevel,
      dailyActionLimit: conn.dailyActionLimit,
      dailyActionsUsed: conn.dailyActionsUsed,
    },
    principles: [
      'fitmeet_is_an_ai_agent_social_network',
      'agent_can_represent_user_and_also_be_a_social_subject',
      'agent_can_meet_humans_or_other_agents',
      'fitmeet_owns_matching_and_safety_ranking',
      'external_agents_submit_intents_not_raw_search_decisions',
      'human_confirmation_for_risky_actions',
      'privacy_by_default',
      'safe_profile_data_only',
      'audit_every_agent_action',
    ],
    riskLevels: {
      low: [
        'online_chat',
        'fitness_recommendation',
        'public_interest_matching',
      ],
      medium: ['offline_meeting', 'travel', 'pet_meetup', 'photo_meetup'],
      high: [
        'alcohol',
        'emergency',
        'payment',
        'contact_exchange',
        'sensitive_photos',
      ],
    },
    tools: buildAgentSocialToolList(bearer),
    skills: [
      {
        name: 'create_social_request',
        method: 'POST',
        path: '/api/agent/social-requests',
        description:
          'Create a structured social request from user intent (running partner, coffee chat, etc.).',
        permission: AgentAction.CreateSocialRequest,
        requires_user_confirmation: false,
        risk_level: 'medium',
      },
      {
        name: 'search_nearby_people',
        method: 'POST',
        path: '/api/agent/nearby/search',
        description:
          'Search nearby FitMeet users matching a brief and basic filters (city, radius, interests).',
        permission: AgentAction.SearchProfiles,
        requires_user_confirmation: false,
        risk_level: 'low',
      },
      {
        name: 'match_partner',
        method: 'POST',
        path: '/api/agent/match/partner',
        description:
          'Score and rank candidate users for a given social request or query. Returns a ranked list with reasons.',
        permission: AgentAction.SearchProfiles,
        requires_user_confirmation: false,
        risk_level: 'low',
      },
      {
        name: 'draft_message',
        method: 'POST',
        path: '/api/agent/messages/draft',
        description:
          'Generate an icebreaker / first private-message draft for human review. Does not send.',
        permission: AgentAction.GenerateMessage,
        requires_user_confirmation: false,
        risk_level: 'low',
      },
      {
        name: 'fitmeet_generate_profile_draft',
        method: 'POST',
        path: '/api/agent/owner/social-profile/ai-draft',
        description:
          'Generate a structured AI persona card from owner interview answers. The card is a draft and must be shown to the owner before saving.',
        permission: 'profile.update_preferences',
        requires_user_confirmation: false,
        risk_level: 'low',
      },
      {
        name: 'fitmeet_confirm_profile',
        method: 'POST',
        path: '/api/agent/owner/social-profile/ai-save',
        description:
          'Save the owner-confirmed AI persona card and optionally enable profile-based matching even when the owner has not posted a social request. Requires ownerConfirmed=true.',
        permission: 'profile.update_preferences',
        requires_user_confirmation: true,
        risk_level: 'medium',
      },
      {
        name: 'fitmeet_update_profile_visibility',
        method: 'PATCH',
        path: '/api/agent/owner/social-profile/visibility',
        description:
          'Update owner-confirmed profile discoverability and matching-pool switches. Requires ownerConfirmed=true.',
        permission: 'profile.update_preferences',
        requires_user_confirmation: true,
        risk_level: 'medium',
      },
      {
        name: 'run_profile_match_once',
        method: 'POST',
        path: '/api/agent/owner/profile-matches/run-once',
        description:
          'Run one profile-pool scan and write review-only recommendations to Agent Inbox/Webhook. Does not contact candidates.',
        permission: AgentAction.SearchProfiles,
        requires_user_confirmation: false,
        risk_level: 'low',
      },
      {
        name: 'fitmeet_run_profile_match_autopilot_once',
        method: 'POST',
        path: '/api/agent/profile-match/autopilot/run-once',
        description:
          'Run one Profile Match Autopilot sweep: scan authorized persona profiles and active request cards, use MatchService hard filters and scoring, create safe LLM-explained recommendations, notify both sides to confirm, and write agent inbox events. Does not auto-friend or auto-contact.',
        permission: AgentAction.SearchProfiles,
        requires_user_confirmation: false,
        risk_level: 'low',
      },
      {
        name: 'fitmeet_get_profile_recommendations',
        method: 'GET',
        path: '/api/agent/owner/profile-recommendations/events',
        description:
          'Read profile.match.recommended Agent Inbox events for the token owner. Any outbound action still requires owner confirmation.',
        permission: AgentAction.SearchProfiles,
        requires_user_confirmation: false,
        risk_level: 'low',
      },
      {
        name: 'ignore_profile_match_recommendation',
        method: 'POST',
        path: '/api/agent/owner/profile-matches/{id}/ignore',
        description:
          'Reject a profile-only recommendation. Does not notify or contact the candidate.',
        permission: AgentAction.SearchProfiles,
        requires_user_confirmation: false,
        risk_level: 'low',
      },
      {
        name: 'save_profile_match_recommendation',
        method: 'POST',
        path: '/api/agent/owner/profile-matches/{id}/favorite',
        description:
          'Save a profile-only recommendation for later owner review. Does not contact the candidate.',
        permission: AgentAction.SearchProfiles,
        requires_user_confirmation: false,
        risk_level: 'low',
      },
      {
        name: 'draft_profile_match_opener',
        method: 'POST',
        path: '/api/agent/owner/profile-matches/{id}/draft-opener',
        description:
          'Draft a safe first message from public recommendation context. Draft only; sending requires owner confirmation.',
        permission: AgentAction.GenerateMessage,
        requires_user_confirmation: false,
        risk_level: 'low',
      },
      {
        name: 'confirm_profile_match_contact',
        method: 'POST',
        path: '/api/agent/owner/profile-matches/{id}/confirm-contact',
        description:
          'Submit an owner-confirmed contact request for a profile recommendation. It still waits for target consent.',
        permission: AgentAction.ContactRequest,
        requires_user_confirmation: true,
        risk_level: 'high',
      },
      {
        name: 'send_private_message',
        method: 'POST',
        path: '/api/agent/messages/send',
        description:
          'Send an in-platform private message on behalf of the user. Requires user confirmation unless the connection is in standard or open mode and risk score is low.',
        permission: AgentAction.SendMessage,
        requires_user_confirmation: true,
        risk_level: 'high',
      },
      {
        name: 'create_activity',
        method: 'POST',
        path: '/api/agent/activities',
        description:
          'Create a public meet/activity (sport, time, location, slots). Persists to the FitMeet activities table.',
        permission: AgentAction.CreateActivity,
        requires_user_confirmation: true,
        risk_level: 'high',
      },
      {
        name: 'join_activity',
        method: 'POST',
        path: '/api/agent/activities/{id}/join',
        description:
          'Request to join an existing activity on behalf of the user (status starts as pending until host approves).',
        permission: AgentAction.JoinActivity,
        requires_user_confirmation: false,
        risk_level: 'medium',
      },
      {
        name: 'report_risk',
        method: 'POST',
        path: '/api/agent/safety/report',
        description:
          'File a safety report against a user / post / meet / comment with reason and description.',
        permission: AgentAction.ReportRisk,
        requires_user_confirmation: false,
        risk_level: 'medium',
      },
      {
        name: 'submit_completion_proof',
        method: 'POST',
        path: '/api/agent/activities/{id}/proof',
        description:
          'Submit a proof-of-completion (photo URL, note, GPS sample) for a finished activity. Stored as a pending approval entry pending user/host confirmation.',
        permission: AgentAction.SubmitCompletionProof,
        requires_user_confirmation: true,
        risk_level: 'high',
      },
    ],
    scenarios: [
      'fitness_partner',
      'offline_friend',
      'dog_walking',
      'bar_friend',
      'travel_partner',
      'photo_partner',
    ],
    recommendedFlow: [
      'openclaw_collects_owner_need',
      'openclaw_submits_social_intent_to_fitmeet',
      'fitmeet_matches_ranks_and_risk_scores_candidates',
      'openclaw_presents_results_to_owner',
      'owner_confirms_candidate_and_action',
      'fitmeet_executes_intro_or_contact_request_inside_platform_boundaries',
    ],
  };
}

/**
 * The 17-tool catalog OpenClaw / QClaw consumes to drive the end-to-end
 * AI Agent Social Network loop on behalf of its owner. Auth is uniformly
 * `Authorization: Bearer <agent_token>`; the owner is derived from the
 * token server-side and must NEVER be sent in the body.
 */
export function buildAgentSocialToolList(bearer: string) {
  const obj = (props: Record<string, string>, required: string[] = []) => ({
    type: 'object',
    properties: Object.fromEntries(
      Object.entries(props).map(([k, t]) => [k, { type: t }]),
    ),
    required,
  });
  return [
    {
      name: 'fitmeet_get_profile_status',
      description:
        "Read the token owner's profile status, completion, visibility switches, and matching-pool state.",
      method: 'GET',
      path: '/api/agent/owner/social-profile/status',
      auth: bearer,
      input_schema: obj({}),
      output_schema: obj({
        profile: 'object',
        completion: 'object',
        visibility: 'object',
      }),
      requires_user_confirmation: false,
      risk_level: 'low',
    },
    {
      name: 'fitmeet_get_my_profile',
      description:
        "Read the owner's social profile (city, interests, ageRange, nearbyArea, fitnessGoals, availableTimes, socialPreference, rejectRules, privacyBoundary).",
      method: 'GET',
      path: '/api/agent/owner/social-profile',
      auth: bearer,
      input_schema: obj({}),
      output_schema: obj({
        city: 'string',
        interestTags: 'array',
        ageRange: 'string',
        nearbyArea: 'string',
      }),
      requires_user_confirmation: false,
      risk_level: 'low',
    },
    {
      name: 'fitmeet_update_my_social_profile',
      description:
        "Patch the owner's social profile fields. Only profile fields — no userId.",
      method: 'PATCH',
      path: '/api/agent/owner/social-profile',
      auth: bearer,
      input_schema: obj({
        city: 'string',
        interestTags: 'array',
        ageRange: 'string',
        nearbyArea: 'string',
        fitnessGoals: 'array',
        availableTimes: 'array',
        socialPreference: 'string',
        rejectRules: 'string',
        privacyBoundary: 'string',
      }),
      output_schema: obj({ ok: 'boolean' }),
      requires_user_confirmation: true,
      risk_level: 'low',
    },
    {
      name: 'fitmeet_update_profile_visibility',
      description:
        'Update profile visibility and matching-pool switches after explicit owner confirmation. Only the token owner is affected.',
      method: 'PATCH',
      path: '/api/agent/owner/social-profile/visibility',
      auth: bearer,
      input_schema: obj(
        {
          ownerConfirmed: 'boolean',
          profileDiscoverable: 'boolean',
          agentCanRecommendMe: 'boolean',
          agentCanStartChatAfterApproval: 'boolean',
        },
        ['ownerConfirmed'],
      ),
      output_schema: obj({
        profileDiscoverable: 'boolean',
        agentCanRecommendMe: 'boolean',
      }),
      requires_user_confirmation: true,
      risk_level: 'medium',
    },
    {
      name: 'fitmeet_generate_profile_questions',
      description:
        'Return the canonical question set the agent should ask the owner in order to complete the social profile.',
      method: 'GET',
      path: '/api/agent/owner/social-profile/questions',
      auth: bearer,
      input_schema: obj({}),
      output_schema: obj({ questions: 'array' }),
      requires_user_confirmation: false,
      risk_level: 'low',
    },
    {
      name: 'fitmeet_save_profile_answer',
      description:
        'Save a single answer to a profile question (key + answer). The agent calls this once per turn during the onboarding interview.',
      method: 'POST',
      path: '/api/agent/owner/social-profile/answers',
      auth: bearer,
      input_schema: obj({ key: 'string', answer: 'string' }, ['key', 'answer']),
      output_schema: obj({ ok: 'boolean', completion: 'number' }),
      requires_user_confirmation: true,
      risk_level: 'low',
    },
    {
      name: 'fitmeet_generate_profile_draft',
      description:
        'Generate a structured AI persona card from the owner interview. The result is a draft for owner review, not an automatic publish.',
      method: 'POST',
      path: '/api/agent/owner/social-profile/ai-draft',
      auth: bearer,
      input_schema: obj({
        answers: 'array',
        rawText: 'string',
        source: 'string',
      }),
      output_schema: obj({
        draft: 'object',
        mode: 'string',
        completion: 'object',
      }),
      requires_user_confirmation: false,
      risk_level: 'low',
    },
    {
      name: 'fitmeet_confirm_profile',
      description:
        'Save an owner-confirmed AI persona card and sync it into the AI matching pool when enableMatching is true. Requires ownerConfirmed=true.',
      method: 'POST',
      path: '/api/agent/owner/social-profile/ai-save',
      auth: bearer,
      input_schema: obj(
        {
          profile: 'object',
          enableMatching: 'boolean',
          ownerConfirmed: 'boolean',
          sensitiveTagsConfirmed: 'boolean',
        },
        ['profile', 'ownerConfirmed'],
      ),
      output_schema: obj({ profile: 'object', matchingEnabled: 'boolean' }),
      requires_user_confirmation: true,
      risk_level: 'medium',
    },
    {
      name: 'fitmeet_get_profile_completion',
      description:
        "Get how much of the owner's social profile is filled in, with a list of missing fields the agent should still ask about.",
      method: 'GET',
      path: '/api/agent/owner/social-profile/completion',
      auth: bearer,
      input_schema: obj({}),
      output_schema: obj({ completion: 'number', missing: 'array' }),
      requires_user_confirmation: false,
      risk_level: 'low',
    },
    {
      name: 'fitmeet_run_profile_match_once',
      description:
        'Run one profile-pool recommendation scan for the owner. This never sends messages; it writes review-only recommendations to Agent Inbox/Webhook.',
      method: 'POST',
      path: '/api/agent/owner/profile-matches/run-once',
      auth: bearer,
      input_schema: obj({}),
      output_schema: obj({
        matchedCount: 'number',
        recommendations: 'array',
      }),
      requires_user_confirmation: false,
      risk_level: 'low',
    },
    {
      name: 'fitmeet_get_profile_recommendations',
      description:
        'Read profile.match.recommended Agent Inbox events generated from AI persona recommendations. Contact still requires owner confirmation.',
      method: 'GET',
      path: '/api/agent/owner/profile-recommendations/events',
      auth: bearer,
      input_schema: obj({ limit: 'integer', unreadOnly: 'boolean' }),
      output_schema: obj({ events: 'array' }),
      requires_user_confirmation: false,
      risk_level: 'low',
    },
    {
      name: 'fitmeet_ignore_profile_match_recommendation',
      description:
        'Reject a profile-only recommendation. Does not notify or contact the candidate.',
      method: 'POST',
      path: '/api/agent/owner/profile-matches/:id/ignore',
      auth: bearer,
      input_schema: obj({ id: 'integer' }, ['id']),
      output_schema: obj({ ok: 'boolean', status: 'string' }),
      requires_user_confirmation: false,
      risk_level: 'low',
    },
    {
      name: 'fitmeet_save_profile_match_recommendation',
      description:
        'Save a profile-only recommendation for later owner review. Does not notify or contact the candidate.',
      method: 'POST',
      path: '/api/agent/owner/profile-matches/:id/favorite',
      auth: bearer,
      input_schema: obj({ id: 'integer' }, ['id']),
      output_schema: obj({ ok: 'boolean', status: 'string' }),
      requires_user_confirmation: false,
      risk_level: 'low',
    },
    {
      name: 'fitmeet_draft_profile_match_opener',
      description:
        'Draft a safe opener for a profile-only recommendation. Draft only; it never sends a message.',
      method: 'POST',
      path: '/api/agent/owner/profile-matches/:id/draft-opener',
      auth: bearer,
      input_schema: obj({ id: 'integer', tone: 'string' }, ['id']),
      output_schema: obj({
        draft: 'object',
        requiresOwnerConfirmation: 'boolean',
      }),
      requires_user_confirmation: false,
      risk_level: 'low',
    },
    {
      name: 'fitmeet_confirm_profile_match_contact',
      description:
        'Create an owner-confirmed contact request for a profile-only recommendation. The target user must still consent.',
      method: 'POST',
      path: '/api/agent/owner/profile-matches/:id/confirm-contact',
      auth: bearer,
      input_schema: obj(
        { id: 'integer', ownerConfirmed: 'boolean', note: 'string' },
        ['id', 'ownerConfirmed'],
      ),
      output_schema: obj({ status: 'string', contactRequestId: 'integer' }),
      requires_user_confirmation: true,
      risk_level: 'high',
    },
    {
      name: 'fitmeet_create_ai_social_request',
      description:
        'Create a structured social request (running partner, coffee chat, dog walk, ...) on behalf of the owner. Returns the persisted request and an initial candidate list.',
      method: 'POST',
      path: '/api/agent/social-requests',
      auth: bearer,
      input_schema: obj(
        {
          requestType: 'string',
          description: 'string',
          city: 'string',
          timePreference: 'string',
          interests: 'array',
        },
        ['requestType', 'description'],
      ),
      output_schema: obj({
        request: 'object',
        candidates: 'array',
        handoff: 'object',
      }),
      requires_user_confirmation: false,
      risk_level: 'medium',
    },
    {
      name: 'fitmeet_submit_social_intent',
      description:
        "Alias for the canonical OpenClaw flow: submit the owner's social intent to FitMeet and receive candidates plus handoff instructions.",
      method: 'POST',
      path: '/api/agent/social-requests',
      auth: bearer,
      input_schema: obj(
        {
          requestType: 'string',
          description: 'string',
          city: 'string',
          timePreference: 'string',
          interests: 'array',
        },
        ['requestType', 'description'],
      ),
      output_schema: obj({
        request: 'object',
        candidates: 'array',
        handoff: 'object',
      }),
      requires_user_confirmation: false,
      risk_level: 'medium',
    },
    {
      name: 'fitmeet_publish_ai_social_request',
      description:
        'Publish an existing social request to the public hall (sync as a PublicSocialIntent) so other users / agents in the network can discover it.',
      method: 'POST',
      path: '/api/agent/social-requests/:id/publish',
      auth: bearer,
      input_schema: obj({ id: 'integer' }, ['id']),
      output_schema: obj({ publicIntentId: 'string', synced: 'boolean' }),
      requires_user_confirmation: false,
      risk_level: 'medium',
    },
    {
      name: 'fitmeet_run_match',
      description:
        'Recompute the top-K candidate list for a given social request. Idempotent; replaces previous suggestions.',
      method: 'POST',
      path: '/api/agent/social-requests/:id/match',
      auth: bearer,
      input_schema: obj({ id: 'integer', limit: 'integer' }, ['id']),
      output_schema: obj({
        socialRequestId: 'integer',
        candidates: 'array',
      }),
      requires_user_confirmation: false,
      risk_level: 'low',
    },
    {
      name: 'fitmeet_get_candidates',
      description:
        'Read the persisted candidate list for a social request, ordered by score DESC.',
      method: 'GET',
      path: '/api/agent/social-requests/:id/candidates',
      auth: bearer,
      input_schema: obj({ id: 'integer' }, ['id']),
      output_schema: obj({
        socialRequestId: 'integer',
        candidates: 'array',
      }),
      requires_user_confirmation: false,
      risk_level: 'low',
    },
    {
      name: 'fitmeet_get_matches',
      description:
        'Refresh/read FitMeet-produced matches for a social request.',
      method: 'GET',
      path: '/api/agent/social-requests/:id/matches',
      auth: bearer,
      input_schema: obj({ id: 'integer' }, ['id']),
      output_schema: obj({
        request: 'object',
        candidates: 'array',
        handoff: 'object',
      }),
      requires_user_confirmation: false,
      risk_level: 'low',
    },
    {
      name: 'fitmeet_decide_candidate',
      description:
        "Submit the owner's approve/reject decision for a candidate and optional bounded connection action.",
      method: 'POST',
      path: '/api/agent/social-requests/:id/candidates/decision',
      auth: bearer,
      input_schema: obj(
        {
          id: 'integer',
          candidateUserId: 'integer',
          decision: 'string',
          connectionAction: 'string',
          ownerConfirmed: 'boolean',
          note: 'string',
        },
        ['id', 'candidateUserId', 'decision', 'ownerConfirmed'],
      ),
      output_schema: obj({
        status: 'string',
        conversationId: 'string',
        message: 'object',
      }),
      requires_user_confirmation: true,
      risk_level: 'high',
    },
    {
      name: 'fitmeet_send_invite',
      description:
        "Send the first private invite message from the owner to a matched candidate, opening (or reusing) the FitMeet conversation and marking the candidate as `messaged`. High-risk — should respect the owner's approval policy.",
      method: 'POST',
      path: '/api/agent/social-requests/:id/candidates/:candidateId/send-invite',
      auth: bearer,
      input_schema: obj(
        {
          id: 'integer',
          candidateId: 'integer',
          targetUserId: 'integer',
          text: 'string',
        },
        ['id', 'candidateId', 'targetUserId', 'text'],
      ),
      output_schema: obj({
        ok: 'boolean',
        conversationId: 'string',
        messageId: 'string',
      }),
      requires_user_confirmation: true,
      risk_level: 'high',
    },
    {
      name: 'fitmeet_mark_candidate_messaged',
      description:
        'Mark a candidate as `messaged` after the agent has sent the first message through some other channel (idempotent).',
      method: 'POST',
      path: '/api/agent/social-requests/:id/candidates/:candidateId/mark-messaged',
      auth: bearer,
      input_schema: obj({ id: 'integer', candidateId: 'integer' }, [
        'id',
        'candidateId',
      ]),
      output_schema: obj({ id: 'integer', status: 'string' }),
      requires_user_confirmation: false,
      risk_level: 'low',
    },
    {
      name: 'fitmeet_get_agent_inbox_events',
      description:
        'Lightweight heartbeat receive loop for OpenClaw. Poll unread inbox events every 30-60 seconds; stay silent when no events are returned, then ack events after reporting them to the owner.',
      method: 'GET',
      path: '/api/agent/inbox/events',
      auth: bearer,
      input_schema: obj({
        limit: 'integer',
        unreadOnly: 'boolean',
      }),
      output_schema: obj({
        events: 'array',
        total: 'integer',
      }),
      requires_user_confirmation: false,
      risk_level: 'low',
      background_task: {
        enabled_by_default: true,
        interval_seconds: 60,
        silent_when_empty: true,
      },
    },
    {
      name: 'fitmeet_ack_agent_inbox_events',
      description:
        'Mark processed Agent Inbox events as read after OpenClaw has reported them to the owner. Use event ids returned by fitmeet_get_agent_inbox_events.',
      method: 'POST',
      path: '/api/agent/inbox/events/ack',
      auth: bearer,
      input_schema: obj({ eventIds: 'array' }, ['eventIds']),
      output_schema: obj({
        ok: 'boolean',
        requested: 'integer',
        acknowledged: 'integer',
        eventIds: 'array',
      }),
      requires_user_confirmation: false,
      risk_level: 'low',
    },
    {
      name: 'fitmeet_get_agent_inbox',
      description:
        'Read durable Agent Inbox conversation state plus recent events. Prefer fitmeet_get_agent_inbox_events for the background poll.',
      method: 'GET',
      path: '/api/agent/inbox/conversations',
      auth: bearer,
      input_schema: obj({
        limit: 'integer',
        unreadOnly: 'boolean',
      }),
      output_schema: obj({
        conversations: 'array',
        events: 'array',
      }),
      requires_user_confirmation: false,
      risk_level: 'low',
    },
    {
      name: 'fitmeet_get_agent_inbox_messages',
      description:
        'Read one Agent Inbox conversation. This clears only the conversation unread counter; event processing still uses fitmeet_ack_agent_inbox_events after OpenClaw reports to the owner.',
      method: 'GET',
      path: '/api/agent/inbox/conversations/:conversationId/messages',
      auth: bearer,
      input_schema: obj(
        {
          conversationId: 'string',
          limit: 'integer',
        },
        ['conversationId'],
      ),
      output_schema: obj({
        conversationId: 'string',
        messages: 'array',
      }),
      requires_user_confirmation: false,
      risk_level: 'low',
    },
    {
      name: 'fitmeet_get_agent_permissions',
      description:
        "Read the agent's current permission mode (assisted/basic/normal/standard/open), capability switches, daily quotas and per-action approval gates.",
      method: 'GET',
      path: '/api/agent/owner/permissions',
      auth: bearer,
      input_schema: obj({}),
      output_schema: obj({
        mode: 'string',
        maxDailyMessages: 'integer',
        requireApprovalForAll: 'boolean',
      }),
      requires_user_confirmation: false,
      risk_level: 'low',
    },
    {
      name: 'fitmeet_update_agent_permissions',
      description:
        "Patch the agent's permission mode / capability switches / daily quotas. Cannot bypass platform safety filters.",
      method: 'PATCH',
      path: '/api/agent/owner/permissions',
      auth: bearer,
      input_schema: obj({
        mode: 'string',
        allowSendMessage: 'boolean',
        allowCreateActivity: 'boolean',
        maxDailyMessages: 'integer',
        requireApprovalForAll: 'boolean',
      }),
      output_schema: obj({ ok: 'boolean' }),
      requires_user_confirmation: true,
      risk_level: 'medium',
    },
    {
      name: 'fitmeet_run_ai_social_autopilot_once',
      description:
        'Run one autopilot tick for the owner: pick the next under-served social request, rerun match, and queue any high-risk action into the approval queue. Used by OpenClaw to drive the loop forward when allowed.',
      method: 'POST',
      path: '/api/agent/social-autopilot/run-once',
      auth: bearer,
      input_schema: obj({}),
      output_schema: obj({
        ok: 'boolean',
        actions: 'array',
        pendingApprovals: 'array',
      }),
      requires_user_confirmation: false,
      risk_level: 'medium',
    },
    {
      name: 'fitmeet_get_pending_approvals',
      description:
        "List all pending approval requests created by the agent that are waiting on the owner's decision.",
      method: 'GET',
      path: '/api/agent/owner/pending-approvals',
      auth: bearer,
      input_schema: obj({}),
      output_schema: obj({ items: 'array' }),
      requires_user_confirmation: false,
      risk_level: 'low',
    },
    {
      name: 'fitmeet_approve_action',
      description:
        'Approve a pending agent action by its approval id. Triggers automatic dispatch of the underlying action.',
      method: 'POST',
      path: '/api/agent/owner/approvals/:id/approve',
      auth: bearer,
      input_schema: obj({ id: 'integer' }, ['id']),
      output_schema: obj({ ok: 'boolean', dispatched: 'boolean' }),
      requires_user_confirmation: true,
      risk_level: 'medium',
    },
    {
      name: 'fitmeet_reject_action',
      description:
        'Reject a pending agent action by its approval id. The action will not be dispatched.',
      method: 'POST',
      path: '/api/agent/owner/approvals/:id/reject',
      auth: bearer,
      input_schema: obj({ id: 'integer' }, ['id']),
      output_schema: obj({ ok: 'boolean' }),
      requires_user_confirmation: false,
      risk_level: 'low',
    },
  ];
}
