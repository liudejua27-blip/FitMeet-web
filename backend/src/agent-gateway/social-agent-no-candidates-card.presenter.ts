import type { FitMeetAlphaCard } from './fitmeet-alpha-agent.types';
import type {
  SocialAgentMatchingFallback,
  SocialAgentRelaxationStrategy,
} from './social-agent-match-relaxation.types';

export function buildSocialAgentNoCandidatesCard(input: {
  taskId: number;
  socialRequestId: number;
  publicIntentId: string;
  matchingJobId: number;
  fallback: SocialAgentMatchingFallback;
  message?: string | null;
}): FitMeetAlphaCard {
  const strategies = input.fallback.strategies;
  const recommended =
    strategies.find(
      (strategy) => strategy.id === input.fallback.recommendedStrategyId,
    ) ?? strategies[0];
  return {
    id: `matching:no-candidates:${input.matchingJobId}`,
    type: 'candidate_empty_state',
    schemaVersion: 'fitmeet.tool-ui.v1',
    schemaType: 'social_match.no_candidates',
    title: '暂时没有找到合适候选',
    body:
      input.message ??
      recommended?.previewText ??
      '这次没有找到真实且符合安全边界的候选。我准备了几个可以继续推进的调整方向。',
    status: 'ready',
    data: {
      schemaName: 'NoCandidatesRecoveryCard',
      schemaType: 'social_match.no_candidates',
      taskId: input.taskId,
      socialRequestId: input.socialRequestId,
      publicIntentId: input.publicIntentId,
      matchingJobId: input.matchingJobId,
      matchingFallback: input.fallback,
      criteria: criteriaFromFallback(input.fallback),
      recoveryOptions: strategies.map((strategy) =>
        recoveryOptionForStrategy(strategy),
      ),
      safetyBoundary:
        '只放宽距离、时间或非核心偏好；不会放宽公共场所、站内沟通和联系方式保护。',
      nextBestStep: recommended?.previewText ?? null,
    },
    actions: [
      ...strategies.map((strategy) =>
        actionForStrategy({
          strategy,
          taskId: input.taskId,
          socialRequestId: input.socialRequestId,
          publicIntentId: input.publicIntentId,
          matchingJobId: input.matchingJobId,
        }),
      ),
      {
        id: `matching:no-candidates:${input.matchingJobId}:modify`,
        label: '修改卡片',
        action: 'activity.modify_time',
        schemaAction: 'activity.modify_time',
        requiresConfirmation: false,
        payload: {
          taskId: input.taskId,
          socialRequestId: input.socialRequestId,
          publicIntentId: input.publicIntentId,
          matchingJobId: input.matchingJobId,
          sourceAction: 'matching.modify_card',
        },
      },
      {
        id: `matching:no-candidates:${input.matchingJobId}:dismiss`,
        label: '暂不发布',
        action: 'social_intent.decline_publish',
        schemaAction: 'social_intent.decline_publish',
        requiresConfirmation: false,
        payload: {
          taskId: input.taskId,
          socialRequestId: input.socialRequestId,
          publicIntentId: input.publicIntentId,
          matchingJobId: input.matchingJobId,
          sourceAction: 'social_intent.decline_publish',
        },
      },
    ],
  };
}

function actionForStrategy(input: {
  strategy: SocialAgentRelaxationStrategy;
  taskId: number;
  socialRequestId: number;
  publicIntentId: string;
  matchingJobId: number;
}): FitMeetAlphaCard['actions'][number] {
  return {
    id: `matching:no-candidates:${input.matchingJobId}:${input.strategy.id}`,
    label: input.strategy.label,
    action: input.strategy.action,
    schemaAction: input.strategy.action,
    requiresConfirmation: false,
    payload: {
      taskId: input.taskId,
      socialRequestId: input.socialRequestId,
      publicIntentId: input.publicIntentId,
      matchingJobId: input.matchingJobId,
      strategyId: input.strategy.id,
      changedConstraints: input.strategy.changedConstraints,
    },
  };
}

function recoveryOptionForStrategy(strategy: SocialAgentRelaxationStrategy) {
  return {
    key: strategy.id,
    label: strategy.label,
    detail: strategy.previewText,
    candidateCount: strategy.candidateCount,
    requiresConfirmation: false,
  };
}

function criteriaFromFallback(fallback: SocialAgentMatchingFallback): string[] {
  const constraints = fallback.originalConstraints;
  return [
    textLine('城市', constraints.city),
    textLine('活动', constraints.activityType),
    textLine('时间', constraints.timePreference),
    textLine('范围', radiusLabel(constraints.radiusKm)),
  ].filter((value): value is string => Boolean(value));
}

function textLine(label: string, value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text && typeof value !== 'number') return null;
  return `${label}：${text || String(value)}`;
}

function radiusLabel(value: unknown): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return '';
  return `${Math.round(parsed)}km`;
}
