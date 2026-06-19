import { CandidateRiskLevel } from '../match/social-request-candidate.entity';
import {
  buildCandidateRiskSnapshot,
  candidateRiskLevelFromSceneRisk,
  firstCandidateRiskWarning,
} from './social-agent-candidate-risk';

describe('social-agent-candidate-risk', () => {
  it('maps scene risk levels into candidate card risk levels', () => {
    expect(candidateRiskLevelFromSceneRisk('low')).toBe(CandidateRiskLevel.Low);
    expect(candidateRiskLevelFromSceneRisk('medium')).toBe(
      CandidateRiskLevel.Medium,
    );
    expect(candidateRiskLevelFromSceneRisk('high')).toBe(
      CandidateRiskLevel.High,
    );
    expect(candidateRiskLevelFromSceneRisk('critical')).toBe(
      CandidateRiskLevel.High,
    );
  });

  it('adds incomplete-profile warning and preserves safety prompts', () => {
    expect(
      buildCandidateRiskSnapshot({
        dataQuality: 'incomplete',
        sceneRiskLevel: 'medium',
        safetyPrompts: ['麻将局建议选择公开地点。'],
      }),
    ).toEqual({
      riskWarnings: [
        '资料较少，建议先站内沟通确认。',
        '麻将局建议选择公开地点。',
      ],
      risk: {
        level: CandidateRiskLevel.Medium,
        warnings: [
          '资料较少，建议先站内沟通确认。',
          '麻将局建议选择公开地点。',
        ],
      },
    });
  });

  it('uses boundary notes before generic warnings for primary risk copy', () => {
    expect(
      firstCandidateRiskWarning({
        boundaryNotes: ['建议公共地点见面。'],
        riskWarnings: ['资料较少，建议先站内沟通确认。'],
      }),
    ).toBe('建议公共地点见面。');
    expect(
      firstCandidateRiskWarning({
        boundaryNotes: [],
        riskWarnings: ['资料较少，建议先站内沟通确认。'],
      }),
    ).toBe('资料较少，建议先站内沟通确认。');
  });
});
