import { CandidateRiskLevel } from '../match/social-request-candidate.entity';
import type { CandidateProfileDataQuality } from './social-agent-candidate-profile-presenter';

export type CandidateSceneRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type CandidateRiskSnapshot = {
  riskWarnings: string[];
  risk: { level: CandidateRiskLevel; warnings: string[] };
};

const INCOMPLETE_PROFILE_WARNING = '资料较少，建议先站内沟通确认。';

export function candidateRiskLevelFromSceneRisk(
  riskLevel: CandidateSceneRiskLevel,
): CandidateRiskLevel {
  if (riskLevel === 'high' || riskLevel === 'critical') {
    return CandidateRiskLevel.High;
  }
  if (riskLevel === 'medium') return CandidateRiskLevel.Medium;
  return CandidateRiskLevel.Low;
}

export function buildCandidateRiskSnapshot(input: {
  dataQuality: CandidateProfileDataQuality;
  sceneRiskLevel: CandidateSceneRiskLevel;
  safetyPrompts: string[];
}): CandidateRiskSnapshot {
  const riskWarnings = [
    ...(input.dataQuality === 'incomplete' ? [INCOMPLETE_PROFILE_WARNING] : []),
    ...input.safetyPrompts,
  ];
  return {
    riskWarnings,
    risk: {
      level: candidateRiskLevelFromSceneRisk(input.sceneRiskLevel),
      warnings: riskWarnings,
    },
  };
}

export function firstCandidateRiskWarning(input: {
  boundaryNotes: string[];
  riskWarnings: string[];
}): string {
  return input.boundaryNotes[0] ?? input.riskWarnings[0] ?? '';
}
