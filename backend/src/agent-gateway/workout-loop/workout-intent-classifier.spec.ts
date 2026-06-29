import { classifyWorkoutIntent } from './workout-intent-classifier';

describe('classifyWorkoutIntent', () => {
  it('detects explicit workout requests', () => {
    expect(classifyWorkoutIntent('周末想找一个跑步搭子')).toBe('workout');
  });

  it('detects activity plus time and place context', () => {
    expect(classifyWorkoutIntent('今晚青岛大学附近散步')).toBe('workout');
  });

  it('honors negative workout intent', () => {
    expect(classifyWorkoutIntent('先不找人约练了')).toBe('negative');
  });
});
