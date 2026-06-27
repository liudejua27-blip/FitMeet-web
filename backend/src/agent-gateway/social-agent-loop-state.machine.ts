export const SOCIAL_AGENT_LOOP_STATES = [
  'PROFILE_REQUIRED',
  'INTENT_DRAFT',
  'PUBLISH_CONFIRMATION_REQUIRED',
  'DISCOVER_VISIBLE',
  'MATCHING_QUEUED',
  'CANDIDATES_READY',
  'NO_CANDIDATES',
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
  'RECOVERY',
  'IDLE',
] as const;

export type SocialAgentLoopState = (typeof SOCIAL_AGENT_LOOP_STATES)[number];

export interface SocialAgentLoopTransitionPatch {
  loopState?: unknown;
  waitingFor?: unknown;
  lastCompletedStep?: unknown;
  state?: unknown;
  objective?: unknown;
}

export interface SocialAgentLoopTransition {
  from: SocialAgentLoopState;
  to: SocialAgentLoopState;
  reason: string;
  sideEffects: string[];
  requiresApproval: boolean;
  idempotencyScope: string;
  allowed: boolean;
  violations: string[];
}

export function isSocialAgentLoopState(
  value: unknown,
): value is SocialAgentLoopState {
  return (
    typeof value === 'string' &&
    (SOCIAL_AGENT_LOOP_STATES as readonly string[]).includes(value)
  );
}

export function transitionSocialAgentLoopState(input: {
  previous: SocialAgentLoopState;
  reason: string;
  patch?: SocialAgentLoopTransitionPatch;
}): SocialAgentLoopTransition {
  const patch = input.patch ?? {};
  const from = isSocialAgentLoopState(input.previous) ? input.previous : 'IDLE';
  const to = inferNextLoopState(from, input.reason, patch);
  const violations = validateLoopTransition(from, to, input.reason, patch);
  return {
    from,
    to,
    reason: input.reason,
    sideEffects: sideEffectsForLoopState(to),
    requiresApproval: requiresApprovalForLoopState(to),
    idempotencyScope: idempotencyScopeForLoopTransition(
      to,
      input.reason,
      patch,
    ),
    allowed: violations.length === 0,
    violations,
  };
}

function inferNextLoopState(
  previous: SocialAgentLoopState,
  reason: string,
  patch: SocialAgentLoopTransitionPatch,
): SocialAgentLoopState {
  if (isSocialAgentLoopState(patch.loopState)) return patch.loopState;

  const waitingFor = normalizeToken(patch.waitingFor);
  const step = normalizeToken(patch.lastCompletedStep);

  if (/meet_loop_resume_confirmation/.test(waitingFor)) {
    return 'ACTIVITY_CONFIRMATION_REQUIRED';
  }
  if (step === 'social_intent_publish_dismissed') return 'CLOSED';
  if (step === 'activity_slots_cancelled') return 'CLOSED';
  if (step === 'message_send_rejected' || step === 'message_send_reject_noop') {
    return 'CANDIDATES_READY';
  }
  if (step === 'life_graph_profile_proposed') {
    return 'LIFE_GRAPH_UPDATE_PROPOSED';
  }
  if (
    step === 'life_graph_profile_confirmed' ||
    step === 'meet_loop_life_graph_influence_kept'
  ) {
    return 'LIFE_GRAPH_UPDATED';
  }
  if (
    step === 'life_graph_profile_rejected' ||
    step === 'meet_loop_life_graph_influence_revoked'
  ) {
    return 'CLOSED';
  }
  if (step === 'published_to_discover') {
    return waitingFor === 'matching_job'
      ? 'MATCHING_QUEUED'
      : 'DISCOVER_VISIBLE';
  }
  if (step === 'matching_job_queued') return 'MATCHING_QUEUED';
  if (step === 'no_candidates' || step === 'matching_no_candidates') {
    return 'NO_CANDIDATES';
  }
  if (step === 'opener_draft_created') return 'OPENER_DRAFT_CREATED';
  if (
    step === 'message_approval_created' ||
    step === 'connect_approval_created' ||
    step === 'approval_created'
  ) {
    return 'CONTACT_CONFIRMATION_REQUIRED';
  }
  if (step === 'message_sent') {
    return /candidate_reply|counterpart_reply|reply/.test(waitingFor)
      ? 'WAITING_COUNTERPART_REPLY'
      : 'MESSAGE_SENT';
  }
  if (step === 'counterpart_reply_received') return 'COUNTERPART_REPLIED';
  if (step === 'application_pending') return 'APPLICATION_PENDING';
  if (step === 'application_accepted') return 'APPLICATION_ACCEPTED';
  if (step === 'conversation_opened' || step === 'conversation_active') {
    return 'CONVERSATION_ACTIVE';
  }
  if (step === 'activity_draft_created' && !/publish/.test(waitingFor)) {
    return 'ACTIVITY_DRAFT_CREATED';
  }
  if (step === 'activity_confirmed') return 'ACTIVITY_CONFIRMED';
  if (step === 'activity_checked_in') return 'ACTIVITY_CHECKED_IN';
  if (step === 'activity_completed') return 'ACTIVITY_COMPLETED';
  if (step === 'review_submitted') return 'REVIEW_SUBMITTED';

  if (
    /profile_completion|profile_save|profile_match|profile_/.test(waitingFor)
  ) {
    return 'PROFILE_REQUIRED';
  }
  if (
    /opportunity_slot|safety_boundary|opportunity_clarification/.test(
      waitingFor,
    )
  ) {
    return 'INTENT_DRAFT';
  }
  if (/publish_confirmation/.test(waitingFor)) {
    return 'PUBLISH_CONFIRMATION_REQUIRED';
  }
  if (/matching_job|search_results/.test(waitingFor)) return 'MATCHING_QUEUED';
  if (/search_refinement|more_candidates/.test(waitingFor)) {
    return 'NO_CANDIDATES';
  }
  if (/candidate_selection/.test(waitingFor)) return 'CANDIDATES_READY';
  if (
    /message_confirmation|connect_confirmation|invite_confirmation/.test(
      waitingFor,
    )
  ) {
    return 'CONTACT_CONFIRMATION_REQUIRED';
  }
  if (/counterpart_reply|candidate_reply/.test(waitingFor)) {
    return 'WAITING_COUNTERPART_REPLY';
  }
  if (/activity_confirmation/.test(waitingFor)) {
    return 'ACTIVITY_CONFIRMATION_REQUIRED';
  }
  if (/activity_check_in/.test(waitingFor)) return 'ACTIVITY_CHECKED_IN';
  if (/activity_completion|activity_proof|activity_detail/.test(waitingFor)) {
    return 'ACTIVITY_COMPLETED';
  }
  if (/review/.test(waitingFor)) return 'REVIEW_SUBMITTED';
  if (/continue_conversation|user_next_message/.test(waitingFor)) {
    return 'CONVERSATION_ACTIVE';
  }

  switch (reason) {
    case 'profile_detected':
    case 'profile_saved':
      return 'PROFILE_REQUIRED';
    case 'activity_planning':
      return 'INTENT_DRAFT';
    case 'confirmation_required':
      return 'PUBLISH_CONFIRMATION_REQUIRED';
    case 'search_started':
      return 'MATCHING_QUEUED';
    case 'candidates_returned':
    case 'activity_search_returned':
      return 'CANDIDATES_READY';
    case 'message_action':
      return 'CONTACT_CONFIRMATION_REQUIRED';
    case 'activity_confirmed':
      return 'ACTIVITY_CONFIRMED';
    case 'activity_checked_in':
      return 'ACTIVITY_CHECKED_IN';
    case 'activity_completed':
      return 'ACTIVITY_COMPLETED';
    case 'life_graph_updated':
      return 'LIFE_GRAPH_UPDATED';
    case 'user_correction':
    case 'error':
      return 'RECOVERY';
    case 'reset':
      return 'IDLE';
    case 'casual_chat':
    case 'workflow_help':
    case 'user_message':
    default:
      return previous || 'IDLE';
  }
}

function validateLoopTransition(
  from: SocialAgentLoopState,
  to: SocialAgentLoopState,
  reason: string,
  patch: SocialAgentLoopTransitionPatch,
): string[] {
  const violations: string[] = [];
  if (
    (from === 'INTENT_DRAFT' || from === 'NO_CANDIDATES') &&
    [
      'OPENER_DRAFT_CREATED',
      'CONTACT_CONFIRMATION_REQUIRED',
      'MESSAGE_SENT',
      'WAITING_COUNTERPART_REPLY',
      'APPLICATION_ACCEPTED',
      'CONVERSATION_ACTIVE',
    ].includes(to)
  ) {
    violations.push(
      `${from} cannot jump to ${to} before discover visibility and candidates are ready`,
    );
  }
  if (
    from === 'PUBLISH_CONFIRMATION_REQUIRED' &&
    [
      'OPENER_DRAFT_CREATED',
      'CONTACT_CONFIRMATION_REQUIRED',
      'MESSAGE_SENT',
    ].includes(to)
  ) {
    violations.push(
      `${from} cannot start candidate contact before publish confirmation completes`,
    );
  }
  if (
    to === 'MESSAGE_SENT' &&
    !['CONTACT_CONFIRMATION_REQUIRED', 'MESSAGE_SENT'].includes(from)
  ) {
    violations.push(
      `MESSAGE_SENT requires a prior contact confirmation state, got ${from}`,
    );
  }
  if (
    to === 'MATCHING_QUEUED' &&
    from === 'INTENT_DRAFT' &&
    normalizeToken(patch.lastCompletedStep) !== 'published_to_discover' &&
    reason !== 'search_started'
  ) {
    violations.push(
      'MATCHING_QUEUED requires publish/read-back or an explicit search start',
    );
  }
  return violations;
}

function sideEffectsForLoopState(state: SocialAgentLoopState): string[] {
  switch (state) {
    case 'DISCOVER_VISIBLE':
      return ['public_social_intent'];
    case 'MATCHING_QUEUED':
      return ['public_social_intent', 'matching_job'];
    case 'MESSAGE_SENT':
      return ['conversation', 'message'];
    case 'ACTIVITY_CONFIRMED':
    case 'ACTIVITY_CHECKED_IN':
    case 'ACTIVITY_COMPLETED':
      return ['activity'];
    case 'LIFE_GRAPH_UPDATED':
      return ['life_graph'];
    default:
      return [];
  }
}

function requiresApprovalForLoopState(state: SocialAgentLoopState): boolean {
  return [
    'PUBLISH_CONFIRMATION_REQUIRED',
    'CONTACT_CONFIRMATION_REQUIRED',
    'ACTIVITY_CONFIRMATION_REQUIRED',
    'LIFE_GRAPH_UPDATE_PROPOSED',
  ].includes(state);
}

function idempotencyScopeForLoopTransition(
  state: SocialAgentLoopState,
  reason: string,
  patch: SocialAgentLoopTransitionPatch,
): string {
  const discriminator =
    normalizeToken(patch.lastCompletedStep) ||
    normalizeToken(patch.waitingFor) ||
    reason ||
    'transition';
  return `agent-loop:${state}:${discriminator}`;
}

function normalizeToken(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
