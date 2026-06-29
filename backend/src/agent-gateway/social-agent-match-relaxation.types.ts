export type SocialAgentRelaxationStrategyId =
  | 'expand_distance'
  | 'expand_time'
  | 'relax_tags';

export type SocialAgentRelaxationAction =
  | 'matching.relax_distance'
  | 'matching.relax_time'
  | 'matching.relax_tags';

export type SocialAgentRelaxationStrategy = {
  id: SocialAgentRelaxationStrategyId;
  label: string;
  changedConstraints: Record<string, unknown>;
  candidateCount: number;
  previewText: string;
  action: SocialAgentRelaxationAction;
};

export type SocialAgentMatchingFallback = {
  version: 'fitmeet.matching-fallback.v1';
  generatedAt: string;
  originalConstraints: Record<string, unknown>;
  strategies: SocialAgentRelaxationStrategy[];
  recommendedStrategyId: SocialAgentRelaxationStrategyId;
  agentDecision?: {
    source: 'workout_agent_brain';
    reason: string;
    recommendedStrategyId: SocialAgentRelaxationStrategyId;
    observedCandidateCounts: Record<SocialAgentRelaxationStrategyId, number>;
  };
};
