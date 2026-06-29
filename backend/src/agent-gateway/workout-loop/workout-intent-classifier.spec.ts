import { classifyWorkoutIntent } from './workout-intent-classifier';

describe('classifyWorkoutIntent', () => {
  it('detects explicit workout requests', () => {
    expect(classifyWorkoutIntent('周末想找一个跑步搭子')).toBe('workout');
    expect(classifyWorkoutIntent('想找个健身伙伴')).toBe('workout');
    expect(classifyWorkoutIntent('约个球')).toBe('workout');
    expect(classifyWorkoutIntent('附近有人一起练吗')).toBe('workout');
    expect(
      classifyWorkoutIntent(
        '我想发布约练，我明天在北京大学有一场篮球赛，想找个朋友一块，最好是男生，明天下午3点',
      ),
    ).toBe('workout');
  });

  it('detects activity plus time and place context', () => {
    expect(classifyWorkoutIntent('今晚青岛大学附近散步')).toBe('workout');
  });

  it('honors negative workout intent', () => {
    expect(classifyWorkoutIntent('先不找人约练了')).toBe('negative');
  });
});
