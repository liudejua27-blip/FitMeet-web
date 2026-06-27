import { transitionSocialAgentLoopState } from './social-agent-loop-state.machine';

describe('Social Agent public loop state machine', () => {
  it('models the publish and matching spine as deterministic states', () => {
    let transition = transitionSocialAgentLoopState({
      previous: 'IDLE',
      reason: 'profile_detected',
      patch: { waitingFor: 'profile_completion_answers' },
    });
    expect(transition.to).toBe('PROFILE_REQUIRED');
    expect(transition.allowed).toBe(true);

    transition = transitionSocialAgentLoopState({
      previous: transition.to,
      reason: 'activity_planning',
      patch: { waitingFor: 'opportunity_slot_completion' },
    });
    expect(transition.to).toBe('INTENT_DRAFT');

    transition = transitionSocialAgentLoopState({
      previous: transition.to,
      reason: 'activity_planning',
      patch: {
        waitingFor: 'publish_confirmation',
        lastCompletedStep: 'activity_draft_created',
      },
    });
    expect(transition.to).toBe('PUBLISH_CONFIRMATION_REQUIRED');
    expect(transition.requiresApproval).toBe(true);

    transition = transitionSocialAgentLoopState({
      previous: transition.to,
      reason: 'message_action',
      patch: {
        waitingFor: 'matching_job',
        lastCompletedStep: 'published_to_discover',
      },
    });
    expect(transition.to).toBe('MATCHING_QUEUED');
    expect(transition.sideEffects).toEqual([
      'public_social_intent',
      'matching_job',
    ]);

    transition = transitionSocialAgentLoopState({
      previous: transition.to,
      reason: 'candidates_returned',
      patch: { waitingFor: 'candidate_selection' },
    });
    expect(transition.to).toBe('CANDIDATES_READY');
  });

  it('keeps no-candidate recovery in the matching lane', () => {
    let transition = transitionSocialAgentLoopState({
      previous: 'MATCHING_QUEUED',
      reason: 'candidates_returned',
      patch: { waitingFor: 'search_refinement' },
    });
    expect(transition.to).toBe('NO_CANDIDATES');
    expect(transition.allowed).toBe(true);

    transition = transitionSocialAgentLoopState({
      previous: transition.to,
      reason: 'search_started',
      patch: { waitingFor: 'matching_job' },
    });
    expect(transition.to).toBe('MATCHING_QUEUED');
  });

  it('models candidate contact and message handoff', () => {
    let transition = transitionSocialAgentLoopState({
      previous: 'CANDIDATES_READY',
      reason: 'message_action',
      patch: {
        waitingFor: 'message_confirmation',
        lastCompletedStep: 'opener_draft_created',
      },
    });
    expect(transition.to).toBe('OPENER_DRAFT_CREATED');

    transition = transitionSocialAgentLoopState({
      previous: transition.to,
      reason: 'confirmation_required',
      patch: {
        waitingFor: 'message_confirmation',
        lastCompletedStep: 'message_approval_created',
      },
    });
    expect(transition.to).toBe('CONTACT_CONFIRMATION_REQUIRED');
    expect(transition.requiresApproval).toBe(true);

    transition = transitionSocialAgentLoopState({
      previous: transition.to,
      reason: 'message_action',
      patch: {
        waitingFor: 'candidate_reply',
        lastCompletedStep: 'message_sent',
      },
    });
    expect(transition.to).toBe('WAITING_COUNTERPART_REPLY');
    expect(transition.sideEffects).toEqual([]);

    transition = transitionSocialAgentLoopState({
      previous: transition.to,
      reason: 'message_action',
      patch: { lastCompletedStep: 'counterpart_reply_received' },
    });
    expect(transition.to).toBe('COUNTERPART_REPLIED');
  });

  it('models application and meet-loop lifecycle states', () => {
    let transition = transitionSocialAgentLoopState({
      previous: 'COUNTERPART_REPLIED',
      reason: 'message_action',
      patch: { lastCompletedStep: 'application_pending' },
    });
    expect(transition.to).toBe('APPLICATION_PENDING');

    transition = transitionSocialAgentLoopState({
      previous: transition.to,
      reason: 'message_action',
      patch: { lastCompletedStep: 'application_accepted' },
    });
    expect(transition.to).toBe('APPLICATION_ACCEPTED');

    transition = transitionSocialAgentLoopState({
      previous: transition.to,
      reason: 'message_action',
      patch: { lastCompletedStep: 'conversation_opened' },
    });
    expect(transition.to).toBe('CONVERSATION_ACTIVE');

    transition = transitionSocialAgentLoopState({
      previous: transition.to,
      reason: 'activity_planning',
      patch: { lastCompletedStep: 'activity_draft_created' },
    });
    expect(transition.to).toBe('ACTIVITY_DRAFT_CREATED');

    transition = transitionSocialAgentLoopState({
      previous: transition.to,
      reason: 'confirmation_required',
      patch: { waitingFor: 'activity_confirmation' },
    });
    expect(transition.to).toBe('ACTIVITY_CONFIRMATION_REQUIRED');

    transition = transitionSocialAgentLoopState({
      previous: transition.to,
      reason: 'activity_confirmed',
      patch: { lastCompletedStep: 'activity_confirmed' },
    });
    expect(transition.to).toBe('ACTIVITY_CONFIRMED');

    transition = transitionSocialAgentLoopState({
      previous: transition.to,
      reason: 'activity_checked_in',
      patch: { lastCompletedStep: 'activity_checked_in' },
    });
    expect(transition.to).toBe('ACTIVITY_CHECKED_IN');

    transition = transitionSocialAgentLoopState({
      previous: transition.to,
      reason: 'activity_completed',
      patch: { lastCompletedStep: 'activity_completed' },
    });
    expect(transition.to).toBe('ACTIVITY_COMPLETED');

    transition = transitionSocialAgentLoopState({
      previous: transition.to,
      reason: 'message_action',
      patch: { lastCompletedStep: 'review_submitted' },
    });
    expect(transition.to).toBe('REVIEW_SUBMITTED');

    transition = transitionSocialAgentLoopState({
      previous: transition.to,
      reason: 'message_action',
      patch: { lastCompletedStep: 'life_graph_profile_proposed' },
    });
    expect(transition.to).toBe('LIFE_GRAPH_UPDATE_PROPOSED');

    transition = transitionSocialAgentLoopState({
      previous: transition.to,
      reason: 'life_graph_updated',
      patch: { lastCompletedStep: 'life_graph_profile_confirmed' },
    });
    expect(transition.to).toBe('LIFE_GRAPH_UPDATED');

    transition = transitionSocialAgentLoopState({
      previous: transition.to,
      reason: 'reset',
      patch: { loopState: 'CLOSED' },
    });
    expect(transition.to).toBe('CLOSED');
  });

  it('blocks publish-draft and no-candidate jumps into contact side effects', () => {
    const draftToMessage = transitionSocialAgentLoopState({
      previous: 'INTENT_DRAFT',
      reason: 'message_action',
      patch: {
        waitingFor: 'candidate_reply',
        lastCompletedStep: 'message_sent',
      },
    });
    expect(draftToMessage.allowed).toBe(false);
    expect(draftToMessage.violations.join(' ')).toContain('INTENT_DRAFT');

    const noCandidateToOpener = transitionSocialAgentLoopState({
      previous: 'NO_CANDIDATES',
      reason: 'message_action',
      patch: {
        waitingFor: 'message_confirmation',
        lastCompletedStep: 'opener_draft_created',
      },
    });
    expect(noCandidateToOpener.allowed).toBe(false);
    expect(noCandidateToOpener.violations.join(' ')).toContain('NO_CANDIDATES');
  });

  it('treats meet-loop resume confirmation as a non-side-effect confirmation state', () => {
    const transition = transitionSocialAgentLoopState({
      previous: 'IDLE',
      reason: 'confirmation_required',
      patch: {
        waitingFor: 'meet_loop_resume_confirmation',
        lastCompletedStep: 'message_sent',
      },
    });

    expect(transition.allowed).toBe(true);
    expect(transition.to).toBe('ACTIVITY_CONFIRMATION_REQUIRED');
    expect(transition.sideEffects).toEqual([]);
    expect(transition.requiresApproval).toBe(true);
  });
});
