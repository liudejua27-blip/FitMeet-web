import type { CandidateExplanation } from './candidate-explanation.service';
import { buildCandidateEmotionalInsight } from './social-agent-candidate-emotional-insight';

function explanation(
  overrides: Partial<CandidateExplanation> = {},
): CandidateExplanation {
  return {
    fitReasons: ['共同兴趣明确'],
    awkwardPoints: ['时间还需要确认'],
    suggestedOpener: '周末一起跑步吗？',
    nextActionSuggestion: '先发一条轻量消息',
    safeFirstStep: '先在站内聊一下时间',
    requiresConfirmation: false,
    lifeGraphExplanation: undefined,
    ...overrides,
  };
}

describe('buildCandidateEmotionalInsight', () => {
  it('uses the strongest explanation signals for candidate card copy', () => {
    expect(
      buildCandidateEmotionalInsight({
        explanation: explanation(),
        highRisk: false,
      }),
    ).toEqual({
      fitReason: '共同兴趣明确',
      openerAdvice: '周末一起跑步吗？',
      possibleAwkwardness: '时间还需要确认',
      safeFirstStep: '先在站内聊一下时间',
      tone: 'gentle',
    });
  });

  it('keeps safe fallback copy when explanation arrays are empty', () => {
    const result = buildCandidateEmotionalInsight({
      explanation: explanation({ fitReasons: [], awkwardPoints: [] }),
      highRisk: false,
    });

    expect(result).toMatchObject({
      fitReason: 'TA 和这次需求有可对齐的地方，适合先轻量沟通。',
      possibleAwkwardness: '对方资料或时间偏好还需要进一步确认。',
      tone: 'gentle',
    });
  });

  it('uses careful tone for high-risk or confirmation-required candidates', () => {
    expect(
      buildCandidateEmotionalInsight({
        explanation: explanation(),
        highRisk: true,
      }).tone,
    ).toBe('careful');
    expect(
      buildCandidateEmotionalInsight({
        explanation: explanation({ requiresConfirmation: true }),
        highRisk: false,
      }).tone,
    ).toBe('careful');
  });
});
