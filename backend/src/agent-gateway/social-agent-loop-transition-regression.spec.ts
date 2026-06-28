import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import {
  readSocialAgentTaskMemory,
  transitionSocialAgentState,
  type SocialAgentStateTransitionReason,
  type SocialAgentTaskMemory,
} from './social-agent-memory.util';
import type { SocialAgentLoopState } from './social-agent-loop-state.machine';

function makeTask(): AgentTask {
  return {
    id: 1,
    ownerUserId: 7,
    goal: 'social loop regression',
    memory: {},
    status: AgentTaskStatus.Pending,
    permissionMode: AgentTaskPermissionMode.Confirm,
  } as AgentTask;
}

type TransitionStep = {
  reason: SocialAgentStateTransitionReason;
  patch?: Partial<SocialAgentTaskMemory['currentTask']>;
};

type RegressionCase = {
  action: string;
  steps: TransitionStep[];
  expectedLoopState: SocialAgentLoopState;
  expectedSideEffects?: string[];
  expectedRequiresApproval?: boolean;
};

function runSteps(steps: TransitionStep[]): SocialAgentTaskMemory {
  const task = makeTask();
  for (const step of steps) {
    transitionSocialAgentState(task, step.reason, step.patch);
  }
  return readSocialAgentTaskMemory(task);
}

const PUBLISH_DRAFT_STEPS: TransitionStep[] = [
  {
    reason: 'activity_planning',
    patch: {
      waitingFor: 'opportunity_slot_completion',
      lastCompletedStep: 'activity_slots_partial',
    },
  },
  {
    reason: 'confirmation_required',
    patch: {
      waitingFor: 'publish_confirmation',
      lastCompletedStep: 'activity_draft_created',
    },
  },
];

const PUBLISHED_WITH_MATCHING_STEPS: TransitionStep[] = [
  ...PUBLISH_DRAFT_STEPS,
  {
    reason: 'activity_planning',
    patch: {
      waitingFor: 'matching_job',
      lastCompletedStep: 'published_to_discover',
    },
  },
];

const CANDIDATES_READY_STEPS: TransitionStep[] = [
  ...PUBLISHED_WITH_MATCHING_STEPS,
  {
    reason: 'candidates_returned',
    patch: {
      waitingFor: 'candidate_selection',
      lastCompletedStep: 'matching_candidates_ready',
    },
  },
];

const CONTACT_CONFIRMATION_STEPS: TransitionStep[] = [
  ...CANDIDATES_READY_STEPS,
  {
    reason: 'message_action',
    patch: {
      waitingFor: 'message_confirmation',
      lastCompletedStep: 'message_approval_created',
    },
  },
];

const APPLICATION_PENDING_STEPS: TransitionStep[] = [
  {
    reason: 'user_message',
    patch: {
      waitingFor: 'public_intent_application_review',
      lastCompletedStep: 'application_pending',
    },
  },
];

const ACTIVITY_CONFIRMATION_STEPS: TransitionStep[] = [
  ...CANDIDATES_READY_STEPS,
  {
    reason: 'activity_planning',
    patch: {
      waitingFor: 'activity_confirmation',
      lastCompletedStep: 'activity_draft_created',
    },
  },
];

const ACTIVITY_CONFIRMED_STEPS: TransitionStep[] = [
  ...ACTIVITY_CONFIRMATION_STEPS,
  {
    reason: 'activity_confirmed',
    patch: {
      lastCompletedStep: 'activity_confirmed',
    },
  },
];

const ACTIVITY_CHECKED_IN_STEPS: TransitionStep[] = [
  ...ACTIVITY_CONFIRMED_STEPS,
  {
    reason: 'activity_checked_in',
    patch: {
      lastCompletedStep: 'activity_checked_in',
    },
  },
];

const ACTIVITY_COMPLETED_STEPS: TransitionStep[] = [
  ...ACTIVITY_CHECKED_IN_STEPS,
  {
    reason: 'activity_completed',
    patch: {
      lastCompletedStep: 'activity_completed',
    },
  },
];

const LIFE_GRAPH_PROPOSED_STEPS: TransitionStep[] = [
  {
    reason: 'profile_saved',
    patch: {
      waitingFor: 'life_graph_profile_confirmation',
      lastCompletedStep: 'life_graph_profile_proposed',
    },
  },
];

const REGRESSION_CASES: RegressionCase[] = [
  {
    action: 'publish_to_discover',
    steps: PUBLISHED_WITH_MATCHING_STEPS,
    expectedLoopState: 'MATCHING_QUEUED',
    expectedSideEffects: ['public_social_intent', 'matching_job'],
  },
  {
    action: 'social_intent.decline_publish',
    steps: [
      ...PUBLISH_DRAFT_STEPS,
      {
        reason: 'user_correction',
        patch: {
          lastCompletedStep: 'social_intent_publish_dismissed',
        },
      },
    ],
    expectedLoopState: 'CLOSED',
  },
  {
    action: 'matching.relax_distance',
    steps: [
      ...PUBLISHED_WITH_MATCHING_STEPS,
      {
        reason: 'candidates_returned',
        patch: {
          waitingFor: 'search_refinement',
          lastCompletedStep: 'matching_no_candidates',
        },
      },
      {
        reason: 'search_started',
        patch: {
          waitingFor: 'matching_job',
          lastCompletedStep: 'matching_job_queued',
        },
      },
    ],
    expectedLoopState: 'MATCHING_QUEUED',
    expectedSideEffects: ['public_social_intent', 'matching_job'],
  },
  {
    action: 'candidate.generate_opener',
    steps: [
      ...CANDIDATES_READY_STEPS,
      {
        reason: 'message_action',
        patch: {
          lastCompletedStep: 'opener_draft_created',
        },
      },
    ],
    expectedLoopState: 'OPENER_DRAFT_CREATED',
  },
  {
    action: 'opener.confirm_send',
    steps: [
      ...CONTACT_CONFIRMATION_STEPS,
      {
        reason: 'message_action',
        patch: {
          lastCompletedStep: 'message_sent',
        },
      },
    ],
    expectedLoopState: 'MESSAGE_SENT',
    expectedSideEffects: ['conversation', 'message'],
  },
  {
    action: 'candidate.connect',
    steps: CONTACT_CONFIRMATION_STEPS,
    expectedLoopState: 'CONTACT_CONFIRMATION_REQUIRED',
    expectedRequiresApproval: true,
  },
  {
    action: 'public_intent_application.accept',
    steps: [
      ...APPLICATION_PENDING_STEPS,
      {
        reason: 'message_action',
        patch: {
          lastCompletedStep: 'application_accepted',
        },
      },
    ],
    expectedLoopState: 'APPLICATION_ACCEPTED',
  },
  {
    action: 'public_intent_application.reject',
    steps: [
      ...APPLICATION_PENDING_STEPS,
      {
        reason: 'user_correction',
        patch: {
          loopState: 'CLOSED',
          lastCompletedStep: 'application_rejected',
        },
      },
    ],
    expectedLoopState: 'CLOSED',
  },
  {
    action: 'activity.confirm_create',
    steps: ACTIVITY_CONFIRMED_STEPS,
    expectedLoopState: 'ACTIVITY_CONFIRMED',
    expectedSideEffects: ['activity'],
  },
  {
    action: 'activity.check_in',
    steps: ACTIVITY_CHECKED_IN_STEPS,
    expectedLoopState: 'ACTIVITY_CHECKED_IN',
    expectedSideEffects: ['activity'],
  },
  {
    action: 'activity.complete',
    steps: ACTIVITY_COMPLETED_STEPS,
    expectedLoopState: 'ACTIVITY_COMPLETED',
    expectedSideEffects: ['activity'],
  },
  {
    action: 'review.submit',
    steps: [
      ...ACTIVITY_COMPLETED_STEPS,
      {
        reason: 'activity_completed',
        patch: {
          lastCompletedStep: 'review_submitted',
        },
      },
    ],
    expectedLoopState: 'REVIEW_SUBMITTED',
  },
  {
    action: 'life_graph.accept_update',
    steps: [
      ...LIFE_GRAPH_PROPOSED_STEPS,
      {
        reason: 'life_graph_updated',
        patch: {
          lastCompletedStep: 'life_graph_profile_confirmed',
        },
      },
    ],
    expectedLoopState: 'LIFE_GRAPH_UPDATED',
    expectedSideEffects: ['life_graph'],
  },
  {
    action: 'life_graph.reject_update',
    steps: [
      ...LIFE_GRAPH_PROPOSED_STEPS,
      {
        reason: 'life_graph_updated',
        patch: {
          lastCompletedStep: 'life_graph_profile_rejected',
        },
      },
    ],
    expectedLoopState: 'CLOSED',
  },
];

describe('Social Agent loop transition regression matrix', () => {
  it.each(REGRESSION_CASES)(
    'keeps %s on a legal public-loop path',
    (testCase) => {
      const memory = runSteps(testCase.steps);
      const currentTask = memory.currentTask;

      expect(currentTask.loopState).toBe(testCase.expectedLoopState);
      expect(currentTask.loopValidationWarnings ?? []).toEqual([]);
      expect(currentTask.lastLoopStateTransitionEvent).toEqual(
        expect.objectContaining({
          from: expect.any(String),
          to: testCase.expectedLoopState,
          validationWarnings: [],
        }),
      );
      if (testCase.expectedSideEffects) {
        expect(currentTask.loopSideEffects).toEqual(
          expect.arrayContaining(testCase.expectedSideEffects),
        );
      }
      if (typeof testCase.expectedRequiresApproval === 'boolean') {
        expect(currentTask.loopRequiresApproval).toBe(
          testCase.expectedRequiresApproval,
        );
      }
    },
  );
});
