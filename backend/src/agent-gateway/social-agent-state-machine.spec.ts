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
    expect(memory.currentTask.previousState).toBe('casual_chatting');

    transitionSocialAgentState(task, 'profile_saved', {
      profileSaved: true,
      waitingFor: 'availability_boundaries_or_search_confirmation',
    });
    memory = readSocialAgentTaskMemory(task);
    expect(memory.currentTask.state).toBe('profile_saved');
    expect(memory.currentTask.profileSaved).toBe(true);

    transitionSocialAgentState(task, 'search_started');
    expect(readSocialAgentTaskMemory(task).currentTask.state).toBe(
      'searching_candidates',
    );

    transitionSocialAgentState(task, 'candidates_returned', {
      waitingFor: 'candidate_selection',
    });
    expect(readSocialAgentTaskMemory(task).currentTask.state).toBe(
      'showing_candidates',
    );

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
    expect(readSocialAgentTaskMemory(task).currentTask.state).toBe(
      'showing_candidates',
    );
    expect(readSocialAgentTaskMemory(task).currentTask.waitingFor).toBe(
      'search_refinement',
    );
  });
});
