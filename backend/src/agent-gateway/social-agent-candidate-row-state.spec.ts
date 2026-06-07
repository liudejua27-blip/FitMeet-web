import {
  CandidateMatchLevel,
  CandidateRiskLevel,
  SocialRequestCandidate,
  SocialRequestCandidateStatus,
} from '../match/social-request-candidate.entity';
import {
  applySavedSocialAgentCandidateRow,
  applySocialAgentCandidateRowState,
} from './social-agent-candidate-row-state';

describe('social-agent-candidate-row-state', () => {
  it('maps candidate scoring and risk fields onto a persisted row', () => {
    const row = {
      socialRequestId: 301,
      candidateUserId: 2,
    } as SocialRequestCandidate;

    expect(
      applySocialAgentCandidateRowState({
        row,
        candidate: {
          matchScore: 84,
          level: CandidateMatchLevel.High,
          scoreBreakdown: { distance: 18, interestSimilarity: 20 },
          matchReasons: ['城市匹配：青岛。'],
          commonTags: ['咖啡'],
          risk: {
            level: CandidateRiskLevel.Medium,
            warnings: ['需要确认公开地点'],
          },
          suggestedOpener: '要不要周末一起喝咖啡？',
        },
      }),
    ).toMatchObject({
      score: 84,
      level: CandidateMatchLevel.High,
      scoreBreakdown: { distance: 18, interestSimilarity: 20 },
      reasons: ['城市匹配：青岛。'],
      commonTags: ['咖啡'],
      distanceKm: null,
      riskLevel: CandidateRiskLevel.Medium,
      riskWarnings: ['需要确认公开地点'],
      suggestedMessage: '要不要周末一起喝咖啡？',
      status: SocialRequestCandidateStatus.Suggested,
    });
  });

  it('preserves an existing review status while refreshing score fields', () => {
    const row = {
      status: SocialRequestCandidateStatus.Rejected,
    } as SocialRequestCandidate;

    applySocialAgentCandidateRowState({
      row,
      existingStatus: SocialRequestCandidateStatus.Rejected,
      candidate: {
        matchScore: 55,
        level: CandidateMatchLevel.Low,
        scoreBreakdown: {},
        matchReasons: [],
        commonTags: [],
        risk: { level: CandidateRiskLevel.Low, warnings: [] },
        suggestedOpener: 'hello',
      },
    });

    expect(row.status).toBe(SocialRequestCandidateStatus.Rejected);
    expect(row.score).toBe(55);
  });

  it('copies saved row identity back onto the API candidate object', () => {
    const candidate = { candidateRecordId: null, socialRequestId: null };

    applySavedSocialAgentCandidateRow({
      candidate,
      saved: { id: 777 },
      socialRequestId: 301,
    });

    expect(candidate).toEqual({
      candidateRecordId: 777,
      socialRequestId: 301,
    });
  });
});
