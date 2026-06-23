import { Injectable } from '@nestjs/common';

import type { AgentTask } from './entities/agent-task.entity';
import type { FitMeetAlphaCard } from './fitmeet-alpha-agent.types';
import type { SocialAgentPendingApprovalSnapshot } from './social-agent-chat.types';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import { recordSocialAgentPendingAction } from './social-agent-memory.util';
import { SocialAgentCandidateActionService } from './social-agent-candidate-action.service';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import type { SocialAgentActionApprovalRuntimeContext } from './social-agent-candidate-action-approval.presenter';
import { cleanDisplayText } from '../common/display-text.util';
import {
  buildSocialAgentOpportunityDraftFromTask,
  buildSocialAgentPublishConfirmationCard,
} from './social-agent-opportunity-card-draft';

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
  cards?: FitMeetAlphaCard[];
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

    if (this.isPublishToDiscoverIntent(input.message)) {
      const publishDraft = buildSocialAgentOpportunityDraftFromTask(
        input.task,
        input.message,
      );
      if (!publishDraft.ready) {
        return {
          handled: true,
          assistantMessage: publishDraft.assistantMessage,
          pendingApproval: null,
          cards: [],
        };
      }
      return {
        handled: true,
        assistantMessage:
          '我已经把这次约练整理成发布确认卡。你点确认前不会公开到发现页。',
        pendingApproval: null,
        cards: [
          buildSocialAgentPublishConfirmationCard({
            task: input.task,
            draft: publishDraft.draft,
          }),
        ],
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

  private isPublishToDiscoverIntent(message: string): boolean {
    const text = cleanDisplayText(message, '').toLowerCase();
    if (!text) return false;
    if (/(不|别|先不|暂不|不要|不用|无需).{0,12}(发布|公开|发现)/i.test(text)) {
      return false;
    }
    return /(帮我发布|帮我发到发现|发布到发现|发布约练|发布卡片|公开发布|确认发布|发到发现|同步到发现)/i.test(
      text,
    );
  }

  private withApprovalCopy(input: {
    task: AgentTask;
    assistantMessage: string;
    pendingApproval: SocialAgentPendingApprovalSnapshot;
  }): string {
    const draft = this.candidateActions.candidateMessageDraft(input.task);
    return draft
      ? `${input.assistantMessage}\n我先给你拟一条开场白：${draft}\n已放进确认卡片。你确认前我不会发送，取消也不会联系对方。`
      : `${input.assistantMessage}\n这个动作需要你确认。我已经放进确认卡片；你确认前不会执行。`;
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
