import { CompatibilityScorerService } from './compatibility-scorer.service';

describe('CompatibilityScorerService', () => {
  let scorer: CompatibilityScorerService;

  beforeEach(() => {
    scorer = new CompatibilityScorerService();
  });

  it('scores social request candidates with shared card signals and private reasons separated', () => {
    const result = scorer.scoreRequestCandidate({
      desiredTags: ['running', 'wealth_resource'],
      candidatePublicTags: ['running', 'coffee'],
      candidatePrivateTags: ['high income'],
      candidateTraits: ['calm'],
      ownerPreferredTraits: ['calm'],
      candidatePreferredTraits: ['runner'],
      ownerPublicTags: ['runner'],
      agentAllowedRequired: true,
      candidateAcceptsAgentMessages: true,
    });

    expect(result.score).toBeGreaterThan(30);
    expect(result.commonTags).toEqual(['running']);
    expect(result.publicReasons.join(' ')).toContain('running');
    expect(result.privateReasons.join(' ')).toContain(
      'Owner-approved private matching signals',
    );
    expect(result.publicReasons.join(' ')).not.toContain('high income');
  });

  it('scores profile pairs without exposing private tag values in private reasons', () => {
    const result = scorer.scoreProfilePair({
      ownerPublicTags: ['running', 'coffee'],
      candidatePublicTags: ['running', 'yoga'],
      ownerPrivateTags: ['founder'],
      candidatePrivateTags: ['business_builder'],
      ownerTraits: ['calm'],
      candidateTraits: ['calm'],
      ownerScenes: ['weekend'],
      candidateScenes: ['weekend'],
      ownerCity: 'Shanghai',
      candidateCity: 'Shanghai',
      ownerPrivacyBoundary: 'chat first',
      candidateAgentCanRecommendMe: true,
    });

    expect(result.score).toBeGreaterThan(55);
    expect(result.breakdown.bidirectionalIntent).toBeGreaterThan(0);
    expect(result.publicReasons.join(' ')).toContain('Shared tags: running');
    expect(result.privateReasons.length).toBeGreaterThan(0);
    expect(result.privateReasons.join(' ')).not.toContain('founder');
    expect(result.privateReasons.join(' ')).not.toContain('business_builder');
  });

  it('keeps users without overlapping request intent lower ranked', () => {
    const strong = scorer.scoreRequestCandidate({
      desiredTags: ['running', 'weekend'],
      candidatePublicTags: ['running', 'weekend'],
      candidateTraits: ['calm'],
      ownerPreferredTraits: ['calm'],
      candidateAcceptsAgentMessages: true,
    });
    const weak = scorer.scoreRequestCandidate({
      desiredTags: ['running', 'weekend'],
      candidatePublicTags: ['gaming'],
      candidateTraits: ['spontaneous'],
      ownerPreferredTraits: ['calm'],
      candidateAcceptsAgentMessages: false,
    });

    expect(strong.score).toBeGreaterThan(weak.score);
    expect(weak.breakdown.agentAcceptance).toBe(0);
  });
});
