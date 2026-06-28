import { SocialAgentLoopStateTransitionEventService } from './social-agent-loop-state-transition-event.service';
import {
  AgentTaskEventActor,
  AgentTaskEventType,
} from './entities/agent-task.entity';
import { transitionSocialAgentState } from './social-agent-memory.util';

describe('SocialAgentLoopStateTransitionEventService', () => {
  function makeRepo() {
    return {
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue({ id: 1 }),
    };
  }

  it('writes loop-state transition events with sanitized payload', async () => {
    const repo = makeRepo();
    const service = new SocialAgentLoopStateTransitionEventService(
      repo as never,
    );

    await service.writeTransition({
      task: { id: 100, ownerUserId: 7 },
      fromState: 'matching_queued',
      toState: 'no_candidates',
      publicLoopStage: 'no_candidates',
      workflowState: 'NO_CANDIDATES',
      reason: 'matching_job_zero_candidates',
      payload: {
        phone: '13812345678',
        matchingJobId: 55,
      },
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 100,
        ownerUserId: 7,
        eventType: AgentTaskEventType.LoopStateTransition,
        actor: AgentTaskEventActor.System,
        summary: 'Loop state transition: matching_queued -> no_candidates',
        payload: expect.objectContaining({
          fromState: 'matching_queued',
          toState: 'no_candidates',
          publicLoopStage: 'no_candidates',
          workflowState: 'NO_CANDIDATES',
          reason: 'matching_job_zero_candidates',
          matchingJobId: 55,
        }),
      }),
    );
    expect(repo.save).toHaveBeenCalledTimes(1);
    const payload = repo.create.mock.calls[0]?.[0]?.payload;
    expect(JSON.stringify(payload)).not.toContain('13812345678');
  });

  it('does not throw when event persistence fails', async () => {
    const repo = makeRepo();
    repo.save.mockRejectedValueOnce(new Error('enum missing'));
    const service = new SocialAgentLoopStateTransitionEventService(
      repo as never,
    );

    await expect(
      service.writeTransition({
        task: { id: 100, ownerUserId: 7 },
        toState: 'discover_visible',
      }),
    ).resolves.toBeUndefined();
  });

  it('writes the latest transition stored on task memory', async () => {
    const repo = makeRepo();
    const service = new SocialAgentLoopStateTransitionEventService(
      repo as never,
    );
    const task = { id: 100, ownerUserId: 7, memory: {} } as never;
    transitionSocialAgentState(task, 'message_action', {
      waitingFor: 'counterpart_reply',
      lastCompletedStep: 'message_sent',
    });

    await service.writeCurrentTaskTransition({
      task,
      publicLoopStage: 'messages_handoff',
      workflowState: 'CONTACT_CONFIRMATION_REQUIRED',
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AgentTaskEventType.LoopStateTransition,
        actor: AgentTaskEventActor.System,
        summary: 'Loop state transition: IDLE -> WAITING_COUNTERPART_REPLY',
        payload: expect.objectContaining({
          fromState: 'IDLE',
          toState: 'WAITING_COUNTERPART_REPLY',
          reason: 'message_action',
          publicLoopStage: 'messages_handoff',
          workflowState: 'CONTACT_CONFIRMATION_REQUIRED',
        }),
      }),
    );
  });
});
