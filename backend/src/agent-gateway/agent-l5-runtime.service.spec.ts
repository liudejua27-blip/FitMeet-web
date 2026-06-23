import { AgentL5RuntimeService } from './agent-l5-runtime.service';
import {
  AgentMeetLoopState,
  AgentOnlineReplaySample,
  AgentSkillPatchEffect,
  AgentSubagentMemory,
} from './entities/agent-l5-runtime.entity';

function makeRepo<T extends object>() {
  return {
    create: jest.fn((value: Partial<T>) => value),
    save: jest.fn((value: Partial<T>) => Promise.resolve({ id: 1, ...value })),
    find: jest.fn(() => Promise.resolve([])),
    findOne: jest.fn(() => Promise.resolve(null)),
  };
}

describe('AgentL5RuntimeService', () => {
  it('persists subagent memory and meet-loop transitions', async () => {
    const replayRepo = makeRepo<AgentOnlineReplaySample>();
    const memoryRepo = makeRepo<AgentSubagentMemory>();
    const meetLoopRepo = makeRepo<AgentMeetLoopState>();
    const effectRepo = makeRepo<AgentSkillPatchEffect>();
    const service = new AgentL5RuntimeService(
      replayRepo as never,
      memoryRepo as never,
      meetLoopRepo as never,
      effectRepo as never,
    );

    await service.recordSubagentMemory({
      ownerUserId: 7,
      agentTaskId: 101,
      agentName: 'Match Agent',
      memoryScope: 'matching.candidate_memory',
      input: { message: '找跑步搭子' },
      observation: { candidateCount: 2, rankingScore: 0.91 },
      critique: 'usable observation',
      handoffOutput: { nextAgent: 'FitMeet Main Agent' },
      evalHints: {
        evalRunner: 'match_recall_ranking_and_meet_loop_eval_v1',
        failureReviewPolicy:
          'cluster_recall_ranking_or_state_transition_failures',
      },
    });

    expect(memoryRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        agentTaskId: 101,
        agentName: 'Match Agent',
        memoryScope: 'matching.candidate_memory',
        critique: expect.objectContaining({
          text: 'usable observation',
          eval: expect.objectContaining({
            agentName: 'Match Agent',
            runner: 'match_recall_ranking_and_meet_loop_eval_v1',
            passed: true,
            checks: expect.objectContaining({
              candidateRecall: true,
              rankingSignal: true,
            }),
          }),
          failureReview: expect.objectContaining({
            required: false,
            policy: 'cluster_recall_ranking_or_state_transition_failures',
            nextAction: 'store_as_success_trace',
          }),
        }),
        handoffOutput: expect.objectContaining({
          eval: expect.objectContaining({
            runner: 'match_recall_ranking_and_meet_loop_eval_v1',
          }),
          failureReview: expect.objectContaining({
            required: false,
          }),
        }),
      }),
    );

    await service.transitionMeetLoop({
      ownerUserId: 7,
      agentTaskId: 101,
      activityId: 700,
      candidateUserId: 22,
      stage: 'activity_confirmed',
      waitingFor: 'activity_check_in',
      state: { activityId: 700 },
    });

    expect(meetLoopRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        agentTaskId: 101,
        activityId: 700,
        stage: 'activity_confirmed',
        transitionHistory: [
          expect.objectContaining({
            from: null,
            to: 'activity_confirmed',
          }),
        ],
      }),
    );
  });

  it('decides canary promotion and rollback from online effects', () => {
    const service = new AgentL5RuntimeService(
      makeRepo<AgentOnlineReplaySample>() as never,
      makeRepo<AgentSubagentMemory>() as never,
      makeRepo<AgentMeetLoopState>() as never,
      makeRepo<AgentSkillPatchEffect>() as never,
    );

    expect(
      service.decideCanary({
        effects: [
          { metric: 'quality_score', value: 0.92, sampleSize: 25 },
        ] as AgentSkillPatchEffect[],
      }),
    ).toBe('promote');

    expect(
      service.decideCanary({
        effects: [
          { metric: 'quality_drop', value: 0.12, sampleSize: 30 },
        ] as AgentSkillPatchEffect[],
      }),
    ).toBe('rollback');
  });

  it('builds an admin dashboard from recent L5 runtime records', async () => {
    const replayRepo = makeRepo<AgentOnlineReplaySample>();
    const memoryRepo = makeRepo<AgentSubagentMemory>();
    const meetLoopRepo = makeRepo<AgentMeetLoopState>();
    const effectRepo = makeRepo<AgentSkillPatchEffect>();
    (replayRepo.find as jest.Mock).mockResolvedValue([
      { id: 1, status: 'captured' },
      { id: 2, status: 'used_for_eval' },
    ] as AgentOnlineReplaySample[]);
    (memoryRepo.find as jest.Mock).mockResolvedValue([
      { id: 1, agentName: 'Life Graph Agent' },
      { id: 2, agentName: 'Match Agent' },
      { id: 3, agentName: 'Match Agent' },
    ] as AgentSubagentMemory[]);
    (meetLoopRepo.find as jest.Mock).mockResolvedValue([
      { id: 1, completedAt: null },
      { id: 2, completedAt: new Date() },
    ] as AgentMeetLoopState[]);
    (effectRepo.find as jest.Mock).mockResolvedValue([
      { id: 1, decision: 'observe' },
      { id: 2, decision: 'rollback' },
    ] as AgentSkillPatchEffect[]);

    const service = new AgentL5RuntimeService(
      replayRepo as never,
      memoryRepo as never,
      meetLoopRepo as never,
      effectRepo as never,
    );

    const dashboard = await service.dashboard(20);

    expect(dashboard.summary).toEqual({
      replayCases: 2,
      replayUsedForEval: 1,
      subagentMemories: 3,
      activeSubagents: 2,
      meetLoopStates: 2,
      activeMeetLoops: 1,
      canarySignals: 2,
      rollbackSignals: 1,
    });
    expect(replayRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 }),
    );
  });
});
