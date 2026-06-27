import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import {
  readSocialAgentTaskMemory,
  transitionSocialAgentState,
} from './social-agent-memory.util';

function makeTask(): AgentTask {
  return {
    id: 1,
    ownerUserId: 7,
    goal: 'chat',
    memory: {},
    status: AgentTaskStatus.Pending,
    permissionMode: AgentTaskPermissionMode.Confirm,
  } as AgentTask;
}

describe('Social Agent state machine', () => {
  it('keeps an explicit state across profile, search and confirmation transitions', () => {
    const task = makeTask();

    transitionSocialAgentState(task, 'casual_chat');
    expect(readSocialAgentTaskMemory(task).currentTask.state).toBe(
      'casual_chatting',
    );

    transitionSocialAgentState(task, 'profile_detected', {
      objective: 'profile_enrichment',
      waitingFor: 'profile_save_or_search_confirmation',
    });
    let memory = readSocialAgentTaskMemory(task);
    expect(memory.currentTask.state).toBe('profile_building');
    expect(memory.currentTask.loopState).toBe('PROFILE_REQUIRED');
    expect(memory.currentTask.previousState).toBe('casual_chatting');

    transitionSocialAgentState(task, 'profile_saved', {
      profileSaved: true,
      waitingFor: 'availability_boundaries_or_search_confirmation',
    });
    memory = readSocialAgentTaskMemory(task);
    expect(memory.currentTask.state).toBe('profile_saved');
    expect(memory.currentTask.profileSaved).toBe(true);

    transitionSocialAgentState(task, 'search_started');
    memory = readSocialAgentTaskMemory(task);
    expect(memory.currentTask.state).toBe('searching_candidates');
    expect(memory.currentTask.loopState).toBe('MATCHING_QUEUED');

    transitionSocialAgentState(task, 'candidates_returned', {
      waitingFor: 'candidate_selection',
    });
    memory = readSocialAgentTaskMemory(task);
    expect(memory.currentTask.state).toBe('showing_candidates');
    expect(memory.currentTask.loopState).toBe('CANDIDATES_READY');

    transitionSocialAgentState(task, 'confirmation_required', {
      waitingFor: 'action_confirmation',
    });
    expect(readSocialAgentTaskMemory(task).currentTask.state).toBe(
      'waiting_confirmation',
    );
  });

  it('uses error_recovery for corrections but keeps empty search as a normal refinement state', () => {
    const task = makeTask();

    transitionSocialAgentState(task, 'user_correction', {
      objective: 'profile_enrichment',
    });
    expect(readSocialAgentTaskMemory(task).currentTask.state).toBe(
      'error_recovery',
    );

    transitionSocialAgentState(task, 'candidates_returned', {
      waitingFor: 'search_refinement',
    });
    const memory = readSocialAgentTaskMemory(task);
    expect(memory.currentTask.state).toBe('showing_candidates');
    expect(memory.currentTask.loopState).toBe('NO_CANDIDATES');
    expect(memory.currentTask.waitingFor).toBe('search_refinement');
  });

  it('rejects illegal public-loop jumps while keeping legacy state logic intact', () => {
    const task = makeTask();

    transitionSocialAgentState(task, 'activity_planning', {
      waitingFor: 'opportunity_slot_completion',
      lastCompletedStep: 'activity_slots_partial',
    });
    expect(readSocialAgentTaskMemory(task).currentTask.loopState).toBe(
      'INTENT_DRAFT',
    );

    expect(() =>
      transitionSocialAgentState(task, 'message_action', {
        waitingFor: 'candidate_reply',
        lastCompletedStep: 'message_sent',
      }),
    ).toThrow(/illegal_social_agent_loop_transition/);
  });
});
