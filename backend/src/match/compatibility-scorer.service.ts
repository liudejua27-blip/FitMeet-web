import { Injectable } from '@nestjs/common';

export type CompatibilityScoreResult = {
  score: number;
  breakdown: Record<string, number>;
  publicReasons: string[];
  privateReasons: string[];
  riskTips: string[];
  commonTags: string[];
};

type RequestCandidateInput = {
  desiredTags: string[];
  candidatePublicTags: string[];
  candidatePrivateTags?: string[];
  candidateTraits?: string[];
  ownerPreferredTraits?: string[];
  candidatePreferredTraits?: string[];
  ownerPublicTags?: string[];
  candidateAvoidTraits?: string[];
  agentAllowedRequired?: boolean;
  candidateAcceptsAgentMessages?: boolean | null;
};

type ProfilePairInput = {
  ownerPublicTags: string[];
  candidatePublicTags: string[];
  ownerPrivateTags: string[];
  candidatePrivateTags: string[];
  ownerTraits?: string[];
  candidateTraits?: string[];
  ownerScenes?: string[];
  candidateScenes?: string[];
  ownerCity?: string;
  candidateCity?: string;
  ownerNearbyArea?: string;
  candidateNearbyArea?: string;
  ownerMbti?: string;
  candidateMbti?: string;
  ownerZodiac?: string;
  candidateZodiac?: string;
  ownerPrivacyBoundary?: string;
  candidateAvoidTraits?: string[];
  candidateAgentCanRecommendMe?: boolean;
};

@Injectable()
export class CompatibilityScorerService {
  scoreRequestCandidate(
    input: RequestCandidateInput,
  ): CompatibilityScoreResult {
    const desired = new Set(
      input.desiredTags.flatMap((tag) => this.expandMatchTag(tag)),
    );
    const publicOverlap = this.overlapExpanded(input.candidatePublicTags, [
      ...desired,
    ]);
    const privateOverlap = this.overlapExpanded(
      input.candidatePrivateTags ?? [],
      [...desired],
    );
    const traitOverlap = this.overlapExpanded(input.candidateTraits ?? [], [
      ...(input.ownerPreferredTraits ?? []),
      ...input.desiredTags,
    ]);
    const candidateWantsOwner = this.overlapExpanded(
      input.candidatePreferredTraits ?? [],
      input.ownerPublicTags ?? [],
    );
    const commonTags = this.unique(publicOverlap).slice(0, 8);
    const overlapCount = new Set(
      [...publicOverlap, ...privateOverlap].flatMap((tag) =>
        this.expandMatchTag(tag),
      ),
    ).size;

    const interest = this.scoreInterest(overlapCount, desired.size);
    const personality = Math.min(10, 3 + Math.min(traitOverlap.length, 3) * 2);
    const bidirectionalIntent = Math.min(
      10,
      Math.min(privateOverlap.length, 3) * 2 +
        Math.min(candidateWantsOwner.length, 2) * 2 +
        Math.min(commonTags.length, 2),
    );
    const agentAcceptance =
      input.candidateAcceptsAgentMessages === false
        ? 0
        : input.agentAllowedRequired || input.candidateAcceptsAgentMessages
          ? 5
          : 3;

    return {
      score: interest + personality + bidirectionalIntent + agentAcceptance,
      breakdown: {
        interest,
        personality,
        bidirectionalIntent,
        agentAcceptance,
      },
      publicReasons: [
        commonTags.length
          ? `Shared public tags: ${commonTags.slice(0, 3).join(', ')}`
          : '',
        traitOverlap.length
          ? `Similar traits: ${traitOverlap.slice(0, 3).join(', ')}`
          : '',
        input.candidateAcceptsAgentMessages
          ? 'Candidate accepts agent-mediated messages.'
          : '',
      ].filter(Boolean),
      privateReasons: [
        privateOverlap.length
          ? 'Owner-approved private matching signals align with this request.'
          : '',
        candidateWantsOwner.length
          ? 'Candidate preferences appear compatible with the owner profile.'
          : '',
      ].filter(Boolean),
      riskTips: (input.candidateAvoidTraits ?? []).length
        ? ['Candidate has avoid rules; keep the first contact low-pressure.']
        : [],
      commonTags,
    };
  }

  scoreProfilePair(input: ProfilePairInput): CompatibilityScoreResult {
    const sharedPublic = this.overlapExpanded(
      input.ownerPublicTags,
      input.candidatePublicTags,
    );
    const ownerWantsCandidate = this.overlapExpanded(input.ownerPrivateTags, [
      ...input.candidatePublicTags,
      ...input.candidatePrivateTags,
    ]);
    const candidateWantsOwner = this.overlapExpanded(
      input.candidatePrivateTags,
      [...input.ownerPublicTags, ...input.ownerPrivateTags],
    );
    const traitOverlap = this.overlapExpanded(
      input.ownerTraits ?? [],
      input.candidateTraits ?? [],
    );
    const sceneOverlap = this.overlapExpanded(
      input.ownerScenes ?? [],
      input.candidateScenes ?? [],
    );
    const cityMatch = Boolean(
      input.ownerCity &&
      input.candidateCity &&
      input.ownerCity.trim() === input.candidateCity.trim(),
    );
    const nearbyMatch = Boolean(
      input.ownerNearbyArea &&
      input.candidateNearbyArea &&
      input.ownerNearbyArea.trim() === input.candidateNearbyArea.trim(),
    );
    const geography = (cityMatch ? 14 : 0) + (nearbyMatch ? 6 : 0);
    const interest = Math.min(sharedPublic.length, 4) * 6;
    const bidirectionalIntent =
      Math.min(ownerWantsCandidate.length, 4) * 8 +
      Math.min(candidateWantsOwner.length, 3) * 5;
    const personality = Math.min(traitOverlap.length, 3) * 4;
    const scene = Math.min(sceneOverlap.length, 2) * 4;
    const agentAcceptance = input.candidateAgentCanRecommendMe ? 5 : 0;
    const base = 18;
    const score = Math.max(
      0,
      Math.min(
        96,
        Math.round(
          base +
            geography +
            interest +
            bidirectionalIntent +
            personality +
            scene +
            agentAcceptance,
        ),
      ),
    );

    return {
      score,
      breakdown: {
        base,
        geography,
        interest,
        bidirectionalIntent,
        personality,
        scene,
        agentAcceptance,
      },
      publicReasons: [
        cityMatch && input.candidateCity
          ? `Same city: ${input.candidateCity}`
          : '',
        nearbyMatch ? 'Nearby activity area aligns.' : '',
        sharedPublic.length
          ? `Shared tags: ${sharedPublic.slice(0, 3).join(', ')}`
          : '',
        traitOverlap.length
          ? `Similar traits: ${traitOverlap.slice(0, 3).join(', ')}`
          : '',
        sceneOverlap.length
          ? `Similar activity scenes: ${sceneOverlap.slice(0, 2).join(', ')}`
          : '',
      ].filter(Boolean),
      privateReasons: [
        ownerWantsCandidate.length
          ? 'Owner-approved private preference signals align with this profile.'
          : '',
        candidateWantsOwner.length
          ? 'The candidate profile is open to this type of match.'
          : '',
      ].filter(Boolean),
      riskTips: [
        (input.candidateAvoidTraits ?? []).length
          ? 'Candidate has stated avoid rules; keep the first interaction low-pressure.'
          : '',
        input.ownerPrivacyBoundary
          ? 'Owner privacy boundaries must be respected before any intro or contact exchange.'
          : '',
        input.ownerCity &&
        input.candidateCity &&
        input.ownerCity !== input.candidateCity
          ? 'Cities differ; avoid suggesting offline plans until both sides confirm logistics.'
          : '',
      ].filter(Boolean),
      commonTags: this.unique(sharedPublic).slice(0, 8),
    };
  }

  scoreInterest(overlapCount: number, desiredSize: number): number {
    if (desiredSize === 0) return 6;
    if (overlapCount >= 4) return 20;
    if (overlapCount === 3) return 16;
    if (overlapCount === 2) return 12;
    if (overlapCount === 1) return 8;
    return 0;
  }

  overlapExpanded(a: string[], b: string[]): string[] {
    const bSet = new Set(
      this.cleanTags(b).flatMap((item) => this.expandMatchTag(item)),
    );
    return this.cleanTags(a).filter((item) =>
      this.expandMatchTag(item).some((tag) => bSet.has(tag)),
    );
  }

  expandMatchTag(value: string | null | undefined): string[] {
    const normalized = (value ?? '').trim().toLowerCase();
    if (!normalized) return [];
    const tags = new Set([normalized]);
    if (
      /(rich|wealth|money|income|salary|resource|resources|asset|net.?worth|wealth_resource)/i.test(
        normalized,
      )
    ) {
      tags.add('wealth_resource');
    }
    if (
      /(founder|entrepreneur|startup|business|ceo|business_builder)/i.test(
        normalized,
      )
    ) {
      tags.add('business_builder');
    }
    if (/(high.?status|elite|vip|status_signal)/i.test(normalized)) {
      tags.add('status_signal');
    }
    return Array.from(tags);
  }

  cleanTags(tags: string[]): string[] {
    return this.unique(
      tags.map((tag) => (tag ?? '').trim()).filter(Boolean),
    ).slice(0, 80);
  }

  private unique<T>(items: T[]): T[] {
    return Array.from(new Set(items));
  }
}
