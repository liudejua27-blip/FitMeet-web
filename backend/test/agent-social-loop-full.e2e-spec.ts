import { fitMeetCoreOpenApi } from '../src/openapi/fitmeet-core.openapi';
import {
  FitMeetAgentToolRegistryService,
  type FitMeetAgentToolDefinition,
} from '../src/agent-gateway/fitmeet-agent-tool-registry.service';
import {
  type FitMeetAgentSchemaAction,
  type FitMeetAlphaCard,
} from '../src/agent-gateway/fitmeet-alpha-agent.types';
import {
  type UserFacingAgentPublicLoopStage,
  type UserFacingAgentWorkflowState,
} from '../src/agent-gateway/user-facing-agent-response';
import {
  type SocialAgentLoopState,
  type SocialAgentLoopTransitionPatch,
  transitionSocialAgentLoopState,
} from '../src/agent-gateway/social-agent-loop-state.machine';

type Operation = {
  parameters?: Array<{ name: string; in: string; required: boolean }>;
  requestBody?: unknown;
  responses?: Record<string, unknown>;
};

type LoopStep = {
  name: string;
  reason: string;
  patch?: SocialAgentLoopTransitionPatch;
  expectedState: SocialAgentLoopState;
  publicLoopStage?: UserFacingAgentPublicLoopStage;
  requiredAction?: FitMeetAgentSchemaAction;
  requiredCard?: NonNullable<FitMeetAlphaCard['schemaType']>;
  sideEffects?: string[];
  approvalRequired?: boolean;
};

function operation(path: string, method: string): Operation {
  const item =
    fitMeetCoreOpenApi.paths[path as keyof typeof fitMeetCoreOpenApi.paths];
  if (!item) throw new Error(`Missing OpenAPI path ${path}`);
  const op = item[method as keyof typeof item] as Operation | undefined;
  if (!op) {
    throw new Error(
      `Missing OpenAPI operation ${method.toUpperCase()} ${path}`,
    );
  }
  return op;
}

function expectIdempotencyKey(path: string, method = 'post') {
  expect(operation(path, method).parameters).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'Idempotency-Key',
        in: 'header',
        required: true,
      }),
    ]),
  );
}

function requireTool(
  registry: FitMeetAgentToolRegistryService,
  name: string,
): FitMeetAgentToolDefinition {
  const tool = registry.getTool(name);
  if (!tool) throw new Error(`Missing FitMeet Agent tool ${name}`);
  return tool;
}

describe('Agent social loop full E2E contract matrix', () => {
  const happyPath: LoopStep[] = [
    {
      name: 'User A profile completion is required before durable matching',
      reason: 'profile_detected',
      patch: { waitingFor: 'profile_completion' },
      expectedState: 'PROFILE_REQUIRED',
      publicLoopStage: 'profile_completion',
      requiredCard: 'profile.completion',
    },
    {
      name: 'User A creates an opportunity draft card',
      reason: 'activity_planning',
      patch: { waitingFor: 'opportunity_slot_completion' },
      expectedState: 'INTENT_DRAFT',
      requiredCard: 'social_match.slot_completion',
    },
    {
      name: 'A must confirm before publishing to Discover',
      reason: 'confirmation_required',
      patch: { waitingFor: 'publish_confirmation' },
      expectedState: 'PUBLISH_CONFIRMATION_REQUIRED',
      publicLoopStage: 'publish_confirmation_required',
      requiredAction: 'publish_to_discover',
      requiredCard: 'safety.approval',
      approvalRequired: true,
    },
    {
      name: 'Discover read-back queues matching only after public visibility',
      reason: 'publish_to_discover',
      patch: {
        lastCompletedStep: 'published_to_discover',
        waitingFor: 'matching_job',
      },
      expectedState: 'MATCHING_QUEUED',
      publicLoopStage: 'matching_queued',
      sideEffects: ['public_social_intent', 'matching_job'],
    },
    {
      name: 'matching job returns candidates to A',
      reason: 'candidates_returned',
      patch: { waitingFor: 'candidate_selection' },
      expectedState: 'CANDIDATES_READY',
      publicLoopStage: 'candidates_recommended',
      requiredCard: 'social_match.candidate',
    },
    {
      name: 'A generates an opener draft for a candidate',
      reason: 'candidate_action',
      patch: { lastCompletedStep: 'opener_draft_created' },
      expectedState: 'OPENER_DRAFT_CREATED',
      requiredAction: 'opener.confirm_send',
      requiredCard: 'social_match.candidate',
    },
    {
      name: 'A must confirm before sending an opener message',
      reason: 'message_action',
      patch: { lastCompletedStep: 'message_approval_created' },
      expectedState: 'CONTACT_CONFIRMATION_REQUIRED',
      publicLoopStage: 'contact_confirmation_required',
      requiredAction: 'opener.confirm_send',
      approvalRequired: true,
    },
    {
      name: 'confirmed opener creates the station message side effect',
      reason: 'contact_confirmed',
      patch: { lastCompletedStep: 'message_sent' },
      expectedState: 'MESSAGE_SENT',
      publicLoopStage: 'messages_handoff',
      sideEffects: ['conversation', 'message'],
    },
    {
      name: 'B can receive and reply to the message',
      reason: 'counterpart_message',
      patch: {
        lastCompletedStep: 'message_sent',
        waitingFor: 'candidate_reply',
      },
      expectedState: 'WAITING_COUNTERPART_REPLY',
    },
    {
      name: 'counterpart reply moves the loop forward',
      reason: 'counterpart_message',
      patch: { lastCompletedStep: 'counterpart_reply_received' },
      expectedState: 'COUNTERPART_REPLIED',
    },
    {
      name: 'B can apply to A public intent',
      reason: 'application_created',
      patch: { lastCompletedStep: 'application_pending' },
      expectedState: 'APPLICATION_PENDING',
      requiredCard: 'public_intent.application',
    },
    {
      name: 'owner accepts the application',
      reason: 'application_action',
      patch: { lastCompletedStep: 'application_accepted' },
      expectedState: 'APPLICATION_ACCEPTED',
      requiredAction: 'public_intent_application.accept',
      requiredCard: 'public_intent.application',
    },
    {
      name: 'outbox creates the conversation for both users',
      reason: 'conversation_ready',
      patch: { lastCompletedStep: 'conversation_opened' },
      expectedState: 'CONVERSATION_ACTIVE',
      publicLoopStage: 'messages_handoff',
    },
    {
      name: 'A creates an activity draft',
      reason: 'activity_planning',
      patch: { lastCompletedStep: 'activity_draft_created' },
      expectedState: 'ACTIVITY_DRAFT_CREATED',
      requiredCard: 'social_match.activity',
    },
    {
      name: 'activity creation needs explicit confirmation',
      reason: 'activity_confirmation',
      patch: { waitingFor: 'activity_confirmation' },
      expectedState: 'ACTIVITY_CONFIRMATION_REQUIRED',
      requiredAction: 'activity.confirm_create',
      requiredCard: 'safety.approval',
      approvalRequired: true,
    },
    {
      name: 'confirmed activity is persisted',
      reason: 'activity_action',
      patch: { lastCompletedStep: 'activity_confirmed' },
      expectedState: 'ACTIVITY_CONFIRMED',
      sideEffects: ['activity'],
    },
    {
      name: 'check-in is recorded',
      reason: 'activity_check_in',
      patch: { lastCompletedStep: 'activity_checked_in' },
      expectedState: 'ACTIVITY_CHECKED_IN',
      requiredAction: 'activity.check_in',
      requiredCard: 'meet_loop.timeline',
      sideEffects: ['activity'],
    },
    {
      name: 'activity completion is recorded',
      reason: 'activity_completed',
      patch: { lastCompletedStep: 'activity_completed' },
      expectedState: 'ACTIVITY_COMPLETED',
      requiredAction: 'activity.complete',
      requiredCard: 'meet_loop.timeline',
      sideEffects: ['activity'],
    },
    {
      name: 'review is submitted after completion',
      reason: 'review_submitted',
      patch: { lastCompletedStep: 'review_submitted' },
      expectedState: 'REVIEW_SUBMITTED',
      requiredAction: 'review.submit',
      requiredCard: 'meet_loop.timeline',
    },
    {
      name: 'Life Graph update is proposed, not written directly',
      reason: 'life_graph_proposal',
      patch: { lastCompletedStep: 'life_graph_profile_proposed' },
      expectedState: 'LIFE_GRAPH_UPDATE_PROPOSED',
      requiredAction: 'life_graph.accept_update',
      requiredCard: 'life_graph.diff',
      approvalRequired: true,
    },
    {
      name: 'Life Graph proposal is confirmed by the user',
      reason: 'life_graph_updated',
      patch: { lastCompletedStep: 'life_graph_profile_confirmed' },
      expectedState: 'LIFE_GRAPH_UPDATED',
      sideEffects: ['life_graph'],
    },
    {
      name: 'loop can close after review and memory confirmation',
      reason: 'loop_closed',
      patch: { loopState: 'CLOSED' },
      expectedState: 'CLOSED',
    },
  ];

  const cancelAndRecoveryPath: LoopStep[] = [
    {
      name: 'reject publish closes the draft without Discover visibility',
      reason: 'user_cancelled_publish',
      patch: { lastCompletedStep: 'social_intent_publish_dismissed' },
      expectedState: 'CLOSED',
      requiredAction: 'social_intent.decline_publish',
    },
    {
      name: 'no candidates produces a recoverable no-candidates state',
      reason: 'matching_result',
      patch: { lastCompletedStep: 'matching_no_candidates' },
      expectedState: 'NO_CANDIDATES',
      publicLoopStage: 'no_candidates',
      requiredCard: 'social_match.no_candidates',
    },
    {
      name: 'relax distance keeps the loop in matching recovery',
      reason: 'search_started',
      patch: { waitingFor: 'matching_job' },
      expectedState: 'MATCHING_QUEUED',
      publicLoopStage: 'matching_queued',
      requiredAction: 'matching.relax_distance',
    },
    {
      name: 'relax time keeps the loop in matching recovery',
      reason: 'search_started',
      patch: { waitingFor: 'matching_job' },
      expectedState: 'MATCHING_QUEUED',
      publicLoopStage: 'matching_queued',
      requiredAction: 'matching.relax_time',
    },
    {
      name: 'relax tags keeps the loop in matching recovery',
      reason: 'search_started',
      patch: { waitingFor: 'matching_job' },
      expectedState: 'MATCHING_QUEUED',
      publicLoopStage: 'matching_queued',
      requiredAction: 'matching.relax_tags',
    },
    {
      name: 'reject application remains an owner-side application decision',
      reason: 'application_action',
      patch: { lastCompletedStep: 'application_pending' },
      expectedState: 'APPLICATION_PENDING',
      requiredAction: 'public_intent_application.reject',
      requiredCard: 'public_intent.application',
    },
    {
      name: 'reject opener approval returns to candidate review',
      reason: 'message_rejected',
      patch: { lastCompletedStep: 'message_send_rejected' },
      expectedState: 'CANDIDATES_READY',
      requiredAction: 'opener.reject',
    },
    {
      name: 'blocked or unsafe contact falls into recovery instead of side effect',
      reason: 'error',
      patch: { waitingFor: 'safety_boundary' },
      expectedState: 'INTENT_DRAFT',
      requiredCard: 'safety.approval',
    },
  ];

  it('keeps every required happy-path step reachable through the canonical state machine', () => {
    let current: SocialAgentLoopState = 'IDLE';
    const visited = new Set<SocialAgentLoopState>();

    for (const step of happyPath) {
      const transition = transitionSocialAgentLoopState({
        previous: current,
        reason: step.reason,
        patch: step.patch,
      });
      expect(transition).toEqual(
        expect.objectContaining({
          from: current,
          to: step.expectedState,
          allowed: true,
          requiresApproval: step.approvalRequired ?? false,
        }),
      );
      expect(transition.violations).toEqual([]);
      if (step.sideEffects) {
        expect(transition.sideEffects).toEqual(
          expect.arrayContaining(step.sideEffects),
        );
      }
      expect(transition.idempotencyScope).toMatch(/^agent-loop:/);
      visited.add(transition.to);
      current = transition.to;
    }

    const requiredStates: UserFacingAgentWorkflowState[] = [
      'PROFILE_REQUIRED',
      'INTENT_DRAFT',
      'PUBLISH_CONFIRMATION_REQUIRED',
      'MATCHING_QUEUED',
      'CANDIDATES_READY',
      'OPENER_DRAFT_CREATED',
      'CONTACT_CONFIRMATION_REQUIRED',
      'MESSAGE_SENT',
      'WAITING_COUNTERPART_REPLY',
      'COUNTERPART_REPLIED',
      'APPLICATION_PENDING',
      'APPLICATION_ACCEPTED',
      'CONVERSATION_ACTIVE',
      'ACTIVITY_DRAFT_CREATED',
      'ACTIVITY_CONFIRMATION_REQUIRED',
      'ACTIVITY_CONFIRMED',
      'ACTIVITY_CHECKED_IN',
      'ACTIVITY_COMPLETED',
      'REVIEW_SUBMITTED',
      'LIFE_GRAPH_UPDATE_PROPOSED',
      'LIFE_GRAPH_UPDATED',
      'CLOSED',
    ];
    expect([...visited]).toEqual(expect.arrayContaining(requiredStates));
  });

  it('keeps cancel, no-candidates, relaxation, rejection, and safety paths executable', () => {
    for (const step of cancelAndRecoveryPath) {
      const previous: SocialAgentLoopState =
        step.expectedState === 'MATCHING_QUEUED' ? 'NO_CANDIDATES' : 'IDLE';
      const transition = transitionSocialAgentLoopState({
        previous,
        reason: step.reason,
        patch: step.patch,
      });
      expect(transition.to).toBe(step.expectedState);
      expect(transition.allowed).toBe(true);
      expect(transition.idempotencyScope).toMatch(/^agent-loop:/);
    }
  });

  it('has user-facing stages, cards, and schema actions for each full-loop step', () => {
    const stages: UserFacingAgentPublicLoopStage[] = [
      'profile_completion',
      'opportunity_card_generated',
      'publish_confirmation_required',
      'discover_visible',
      'matching_queued',
      'exploring_index',
      'ranking_candidates',
      'safety_checking',
      'no_candidates',
      'candidates_recommended',
      'contact_confirmation_required',
      'messages_handoff',
      'dismissed',
    ];
    const actions: FitMeetAgentSchemaAction[] = [
      'publish_to_discover',
      'social_intent.decline_publish',
      'social_intent.dismiss',
      'matching.relax_distance',
      'matching.relax_time',
      'matching.relax_tags',
      'candidate.generate_opener',
      'opener.confirm_send',
      'opener.reject',
      'candidate.connect',
      'public_intent_application.accept',
      'public_intent_application.reject',
      'public_intent_application.open_conversation',
      'activity.confirm_create',
      'activity.check_in',
      'activity.complete',
      'review.submit',
      'life_graph.accept_update',
      'life_graph.reject_update',
    ];
    const schemaTypes: Array<NonNullable<FitMeetAlphaCard['schemaType']>> = [
      'profile.completion',
      'social_match.slot_completion',
      'social_match.activity',
      'social_match.candidate',
      'social_match.no_candidates',
      'social_match.privacy_guard',
      'social_match.rate_limited',
      'public_intent.application',
      'meet_loop.timeline',
      'life_graph.diff',
      'safety.approval',
    ];

    for (const step of [...happyPath, ...cancelAndRecoveryPath]) {
      if (step.publicLoopStage) expect(stages).toContain(step.publicLoopStage);
      if (step.requiredAction) expect(actions).toContain(step.requiredAction);
      if (step.requiredCard) expect(schemaTypes).toContain(step.requiredCard);
    }
  });

  it('keeps P0 side-effect tools implemented, gated, and auditable', () => {
    const registry = new FitMeetAgentToolRegistryService();
    const requiredTools = [
      {
        name: 'create_social_request',
        approval: true,
        sideEffect: 'social_request_create_or_draft',
      },
      {
        name: 'publish_social_request',
        approval: true,
        sideEffect: 'social_request_create',
      },
      { name: 'search_real_candidates', approval: false },
      { name: 'generate_opener', approval: false },
      {
        name: 'send_message_to_candidate',
        approval: true,
        sideEffect: 'message_send',
      },
      {
        name: 'connect_candidate',
        approval: true,
        sideEffect: 'friend_request_or_follow',
      },
      {
        name: 'create_activity',
        approval: true,
        sideEffect: 'activity_create',
      },
      {
        name: 'join_activity',
        approval: true,
        sideEffect: 'activity_join',
      },
      {
        name: 'approve_action',
        approval: true,
        sideEffect: 'approval_status_update',
      },
      {
        name: 'reject_action',
        approval: false,
        sideEffect: 'approval_status_update',
      },
      { name: 'check_safety_policy', approval: false },
      { name: 'report_safety_issue', approval: true, sideEffect: 'safety' },
      { name: 'redact_sensitive_output', approval: false },
    ];

    for (const item of requiredTools) {
      const tool = requireTool(registry, item.name);
      expect(tool.runtimeStatus).toBe('implemented');
      expect(tool.plannerEnabled).toBe(true);
      expect(tool.requiresApproval).toBe(item.approval);
      expect(tool.dataScope).toBeTruthy();
      expect(tool.failureFallback).toBeTruthy();
      if (item.sideEffect) {
        expect(tool.sideEffects.join('|')).toContain(item.sideEffect);
      }
    }
  });

  it('keeps public Discover, application, message, meet, and Agent endpoints in the contract', () => {
    [
      '/public/social-intents',
      '/public/social-intents/{id}',
      '/public/social-intents/{id}/matches',
      '/public/social-intents/{id}/applications',
      '/users/me/public-intent-applications',
      '/messages/conversations',
      '/messages/conversations/{conversationId}/send',
      '/social-agent/chat/run',
      '/social-agent/chat/messages/stream',
      '/social-agent/chat/tasks/{taskId}/messages/stream',
      '/social-agent/tasks/{taskId}/timeline',
      '/social-agent/tasks/{taskId}/events',
      '/meets',
      '/meets/{id}/join',
      '/social-agent/chat/tasks/{taskId}/publish-social-request',
      '/social-agent/chat/tasks/{taskId}/save-candidate',
      '/social-agent/chat/tasks/{taskId}/send-message',
      '/social-agent/chat/tasks/{taskId}/connect-candidate',
    ].forEach((path) => {
      expect(fitMeetCoreOpenApi.paths).toHaveProperty(path);
    });

    [
      '/connections/requests',
      '/connections/requests/{id}/accept',
      '/connections/requests/{id}/reject',
      '/connections/requests/{id}/cancel',
      '/public/social-intents/{id}/applications',
      '/public-intent-applications/{id}/accept',
      '/public-intent-applications/{id}/reject',
      '/public-intent-applications/{id}/cancel',
      '/messages/start',
    ].forEach((path) => expectIdempotencyKey(path));

    expect(
      operation('/public/social-intents/{id}', 'get').responses,
    ).toHaveProperty('200');
    expect(
      operation('/messages/conversations/{conversationId}', 'get').responses,
    ).toHaveProperty('200');
  });
});
