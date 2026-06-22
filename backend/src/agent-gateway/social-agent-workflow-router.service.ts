import { Injectable } from '@nestjs/common';

import type {
  SocialAgentIntentRouterInput,
  SocialAgentIntentRouterResult,
} from './social-agent-intent-router.service';
import { SocialAgentIntentRouterService } from './social-agent-intent-router.service';
import type { SocialAgentRouteMessageBody } from './social-agent-chat.types';
import {
  enforceExplicitSocialExecutionRoute,
  hasExistingPublishContext,
  hasExistingSocialActionContext,
  hasExistingSocialExecutionContext,
  hasExplicitCandidateRefinementIntent,
  hasExplicitEmptyCandidateRecoveryIntent,
  hasExplicitSocialExecutionIntent,
  hasExplicitSocialSideEffectIntent,
  isSocialExecutionIntent,
} from './social-agent-social-intent-gate';

export type SocialAgentWorkflowRouterDecision = {
  route: SocialAgentIntentRouterResult;
  reason:
    | 'explicit_social_workflow'
    | 'candidate_refinement_workflow'
    | 'empty_candidate_recovery_workflow'
    | 'social_continuation_workflow'
    | 'social_action_workflow';
  skipBrain: true;
};

const socialContinuationPattern =
  /^(?:(?:可以|好|好的|行|嗯|对)[，,、\s]*)?(继续|继续处理|继续找|继续找人|帮我继续|那继续|就这样|按这个来|开始找|开始推荐|继续推荐|继续看看|继续搜|继续搜索)[。.!！\s]*$/i;

@Injectable()
export class SocialAgentWorkflowRouterService {
  constructor(private readonly intentRouter: SocialAgentIntentRouterService) {}

  route(
    input: SocialAgentIntentRouterInput & {
      conversationIntent?: SocialAgentRouteMessageBody['conversationIntent'];
    },
  ): SocialAgentWorkflowRouterDecision | null {
    const message = input.message.trim();
    if (!message) return null;

    const contextInput = { taskContext: input.taskContext };
    const hasExecutionContext =
      hasExistingSocialExecutionContext(contextInput) ||
      hasWorkflowSlotContext(input.taskContext);
    const hasActionContext = hasExistingSocialActionContext(contextInput);
    const explicitSocial = hasExplicitSocialExecutionIntent(message);
    const explicitAction = hasExplicitSocialSideEffectIntent(message);
    const candidateRefinement =
      hasExplicitCandidateRefinementIntent(message) && hasExecutionContext;
    const emptyCandidateRecovery =
      hasExplicitEmptyCandidateRecoveryIntent(message) &&
      hasEmptyCandidateContext(input.taskContext);
    const socialContinuation =
      socialContinuationPattern.test(message) && hasExecutionContext;

    if (
      !explicitSocial &&
      !explicitAction &&
      !candidateRefinement &&
      !emptyCandidateRecovery &&
      !socialContinuation
    ) {
      return null;
    }

    if (emptyCandidateRecovery) {
      const route = this.socialContinuationRoute(input);
      return {
        route,
        reason: 'empty_candidate_recovery_workflow',
        skipBrain: true,
      };
    }

    if (socialContinuation) {
      const route = this.socialContinuationRoute(input);
      return {
        route,
        reason: 'social_continuation_workflow',
        skipBrain: true,
      };
    }

    const route = enforceExplicitSocialExecutionRoute(
      input,
      this.intentRouter.routeByRules(input),
    );
    if (!isSocialExecutionIntent(route.intent)) return null;

    if (route.intent === 'action_request') {
      if (
        !explicitAction ||
        (!hasActionContext &&
          !hasExistingPublishContext(message, input.taskContext))
      ) {
        return null;
      }
      return {
        route,
        reason: 'social_action_workflow',
        skipBrain: true,
      };
    }

    if (candidateRefinement) {
      return {
        route,
        reason: 'candidate_refinement_workflow',
        skipBrain: true,
      };
    }

    if (explicitSocial) {
      return {
        route,
        reason: 'explicit_social_workflow',
        skipBrain: true,
      };
    }

    return null;
  }

  private socialContinuationRoute(
    input: SocialAgentIntentRouterInput & {
      conversationIntent?: SocialAgentRouteMessageBody['conversationIntent'];
    },
  ): SocialAgentIntentRouterResult {
    const routed = this.intentRouter.routeByRules(input);
    return {
      ...routed,
      intent: 'social_search',
      confidence: Math.max(routed.confidence, 0.9),
      shouldSearch: true,
      shouldReplan: false,
      shouldUpdateProfile: false,
      shouldExecuteAction: false,
      replyStrategy: 'search_candidates',
      source: routed.source,
    };
  }
}

function hasWorkflowSlotContext(
  taskContext?: SocialAgentIntentRouterInput['taskContext'],
): boolean {
  if (!taskContext) return false;
  return (
    hasSlotValue(taskContext.taskSlots, 'activity') ||
    hasSlotValue(taskContext.taskSlots, 'time_window') ||
    hasSlotValue(taskContext.taskSlots, 'location_text') ||
    hasSlotValue(taskContext.taskSlots, 'geo_area') ||
    hasKnownSlotConstraint(taskContext.knownTaskSlotConstraints)
  );
}

function hasSlotValue(value: unknown, key: string): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const slot = (value as Record<string, unknown>)[key];
  if (!slot || typeof slot !== 'object' || Array.isArray(slot)) return false;
  const text = primitiveText((slot as Record<string, unknown>).value);
  return Boolean(text);
}

function hasKnownSlotConstraint(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const knownSlots = (value as Record<string, unknown>).knownSlots;
  return Array.isArray(knownSlots) && knownSlots.length > 0;
}

function hasEmptyCandidateContext(
  taskContext?: SocialAgentIntentRouterInput['taskContext'],
): boolean {
  if (!taskContext) return false;
  return (
    isNoRealCandidates(taskContext.emptyReason) ||
    isNoRealCandidates(taskContext.lastSearchEmptyReason) ||
    isNoRealCandidates(recordValue(taskContext.lastSearch, 'emptyReason')) ||
    isNoRealCandidates(
      recordValue(taskContext.shortTermMemory, 'lastSearchEmptyReason'),
    )
  );
}

function recordValue(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return (value as Record<string, unknown>)[key];
}

function isNoRealCandidates(value: unknown): boolean {
  return primitiveText(value) === 'no_real_candidates';
}

function primitiveText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return '';
}
