import type { CandidateExplanation } from './candidate-explanation.service';

export type CandidateEmotionalInsight = {
  fitReason: string;
  openerAdvice: string;
  possibleAwkwardness: string;
  safeFirstStep: string;
  tone: 'gentle' | 'active' | 'careful';
};

export function buildCandidateEmotionalInsight(input: {
  explanation: CandidateExplanation;
  highRisk: boolean;
}): CandidateEmotionalInsight {
  const { explanation, highRisk } = input;
  return {
    fitReason:
      explanation.fitReasons[0] ||
      'TA 和这次需求有可对齐的地方，适合先轻量沟通。',
    openerAdvice: explanation.suggestedOpener,
    possibleAwkwardness:
      explanation.awkwardPoints[0] || '对方资料或时间偏好还需要进一步确认。',
    safeFirstStep: explanation.safeFirstStep,
    tone: highRisk || explanation.requiresConfirmation ? 'careful' : 'gentle',
  };
}
