import { buildCandidateMatchedSignals } from './social-agent-candidate-display-fields';

describe('social-agent-candidate-display-fields', () => {
  it('builds stable matched signals from common tags and dynamic reasons', () => {
    expect(
      buildCandidateMatchedSignals({
        commonTags: ['跑步', '咖啡', '跑步'],
        dynamicSignalReasons: ['低压力运动社交', '咖啡', ''],
      }),
    ).toEqual(['跑步', '咖啡', '低压力运动社交']);
  });

  it('deduplicates case-insensitive English signals while preserving copy', () => {
    expect(
      buildCandidateMatchedSignals({
        commonTags: ['Running'],
        dynamicSignalReasons: ['running', '周末下午'],
      }),
    ).toEqual(['Running', '周末下午']);
  });
});
