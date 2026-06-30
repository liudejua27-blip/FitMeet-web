import {
  isLoopKind,
  loopMemoryKey,
  loopStageKey,
  type LoopMatchingResultStage,
} from './loop-agent.types';

describe('loop agent contract helpers', () => {
  it.each([
    ['workout', 'workoutLoop', 'workoutLoopStage'],
    ['friend', 'friendLoop', 'friendLoopStage'],
    ['travel', 'travelLoop', 'travelLoopStage'],
  ] as const)(
    'maps %s loops to canonical memory and stage keys',
    (kind, memoryKey, stageKey) => {
      expect(isLoopKind(kind)).toBe(true);
      expect(loopMemoryKey(kind)).toBe(memoryKey);
      expect(loopStageKey(kind)).toBe(stageKey);
    },
  );

  it('keeps unknown loop names out of shared loop routing', () => {
    expect(isLoopKind('profile')).toBe(false);
    expect(isLoopKind('legacy')).toBe(false);
  });

  it('defines the shared matching result stages used by all loops', () => {
    const stages: LoopMatchingResultStage[] = [
      'candidates_ready',
      'no_candidates',
      'no_candidates_final',
    ];

    expect(stages).toEqual([
      'candidates_ready',
      'no_candidates',
      'no_candidates_final',
    ]);
  });
});
