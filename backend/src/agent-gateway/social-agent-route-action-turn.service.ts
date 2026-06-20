import { Injectable } from '@nestjs/common';

import type { AgentTask } from './entities/agent-task.entity';
import type { SocialAgentPendingApprovalSnapshot } from './social-agent-chat.types';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import { recordSocialAgentPendingAction } from './social-agent-memory.util';
import { SocialAgentCandidateActionService } from './social-agent-candidate-action.service';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import type { SocialAgentActionApprovalRuntimeContext } from './social-agent-candidate-action-approval.presenter';

type HandleRouteActionTurnInput = {
  ownerUserId: number;
  task: AgentTask;
  route: SocialAgentIntentRouterResult;
  message: string;
  assistantMessage: string;
  runtimeContext?: SocialAgentActionApprovalRuntimeContext | null;
  signal?: AbortSignal | null;
};

type HandleRouteActionTurnResult = {
  handled: boolean;
  assistantMessage: string;
  pendingApproval: SocialAgentPendingApprovalSnapshot | null;
};

@Injectable()
export class SocialAgentRouteActionTurnService {
  constructor(
    private readonly candidateActions: SocialAgentCandidateActionService,
    private readonly metrics: SocialAgentMetricsService,
  ) {}

  async handle(
    input: HandleRouteActionTurnInput,
  ): Promise<HandleRouteActionTurnResult> {
    this.assertNotAborted(input.signal);
    if (input.route.intent !== 'action_request') {
      return {
        handled: false,
        assistantMessage: input.assistantMessage,
        pendingApproval: null,
      };
    }

    this.assertNotAborted(input.signal);
    const pendingApproval = await this.candidateActions.createActionApproval({
      ownerUserId: input.ownerUserId,
      task: input.task,
      message: input.message,
      route: input.route,
      runtimeContext: input.runtimeContext ?? null,
    });
    this.assertNotAborted(input.signal);
    if (!pendingApproval) {
      return {
        handled: true,
        assistantMessage: input.assistantMessage,
        pendingApproval: null,
      };
    }

    const assistantMessage = this.withApprovalCopy({
      task: input.task,
      assistantMessage: input.assistantMessage,
      pendingApproval,
    });
    this.metrics.recordApproval(pendingApproval.type);
    recordSocialAgentPendingAction(input.task, {
      id: pendingApproval.id,
      type: pendingApproval.type,
      actionType: pendingApproval.actionType,
      summary: pendingApproval.summary,
      riskLevel: pendingApproval.riskLevel,
      at: new Date().toISOString(),
      ...(input.runtimeContext
        ? { runtimeContext: this.runtimeContextTelemetry(input.runtimeContext) }
        : {}),
    });
    return {
      handled: true,
      assistantMessage,
      pendingApproval,
    };
  }

  private assertNotAborted(signal?: AbortSignal | null): void {
    if (signal?.aborted) throw new Error('Subagent worker job cancelled.');
  }

  private withApprovalCopy(input: {
    task: AgentTask;
    assistantMessage: string;
    pendingApproval: SocialAgentPendingApprovalSnapshot;
  }): string {
    const draft = this.candidateActions.candidateMessageDraft(input.task);
    return draft
      ? `${input.assistantMessage}\n我先给你拟一条开场白：${draft}\n这一步已经放进确认卡片。你确认前我不会发送，取消也不会联系对方。`
      : `${input.assistantMessage}\n这一步需要你确认。我已经放进确认卡片；你确认前不会执行。`;
  }

  private runtimeContextTelemetry(
    context: SocialAgentActionApprovalRuntimeContext,
  ): Record<string, unknown> {
    return {
      hasTaskContext: Boolean(context.taskContext),
      hasHydratedContext: Boolean(context.hydratedContext),
      hasProfileContext: Boolean(context.profile),
      hasLongTermMemoryContext: Boolean(context.longTermSnapshot),
      brainToolResultCount: Array.isArray(context.brainToolResults)
        ? context.brainToolResults.length
        : 0,
      hasResumeContext: Boolean(context.resumeContext),
      pendingApprovalCount: Array.isArray(
        context.hydratedContext?.pendingApprovals,
      )
        ? context.hydratedContext.pendingApprovals.length
        : 0,
    };
  }
}
