import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AgentTask } from './entities/agent-task.entity';
import type { FitMeetAlphaCard } from './fitmeet-alpha-agent.types';
import type { SocialAgentPendingApprovalSnapshot } from './social-agent-chat.types';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import { recordSocialAgentPendingAction } from './social-agent-memory.util';
import { SocialAgentCandidateActionService } from './social-agent-candidate-action.service';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import { SocialAgentDraftPublicationService } from './social-agent-draft-publication.service';
import type { SocialAgentActionApprovalRuntimeContext } from './social-agent-candidate-action-approval.presenter';
import { hasExplicitPublishSideEffectIntent } from './social-agent-social-intent-gate';
import {
  buildSocialAgentOpportunityDraftFromTask,
  buildSocialAgentPublishConfirmationCard,
  buildSocialAgentSlotCompletionCard,
} from './social-agent-opportunity-card-draft';
import {
  clearSocialAgentOpportunityDraftClarification,
  readSocialAgentOpportunityDraftClarification,
  rememberSocialAgentOpportunityDraft,
  rememberSocialAgentOpportunityDraftClarification,
} from './social-agent-opportunity-draft-memory';

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
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    private readonly candidateActions: SocialAgentCandidateActionService,
    private readonly metrics: SocialAgentMetricsService,
    @Optional()
    private readonly draftPublication?: SocialAgentDraftPublicationService,
  ) {}

  async handle(
    input: HandleRouteActionTurnInput,
  ): Promise<HandleRouteActionTurnResult> {
    this.assertNotAborted(input.signal);
    const pendingOpportunityDraft =
      readSocialAgentOpportunityDraftClarification(input.task);
    if (input.route.intent !== 'action_request' && !pendingOpportunityDraft) {
      return {
        handled: false,
        assistantMessage: input.assistantMessage,
        pendingApproval: null,
      };
    }

    if (
      this.isPublishToDiscoverIntent(input.message) ||
      pendingOpportunityDraft
    ) {
      if (
        pendingOpportunityDraft &&
        this.isCancelPendingOpportunityDraft(input.message)
      ) {
        clearSocialAgentOpportunityDraftClarification(input.task);
        await this.taskRepo.save(input.task);
        return {
          handled: true,
          assistantMessage: '已取消这次约练卡草稿，不会发布到发现页。',
          pendingApproval: null,
          cards: [],
        };
      }
      const publishDraft = buildSocialAgentOpportunityDraftFromTask(
        input.task,
        input.message,
      );
      if (!publishDraft.ready) {
        rememberSocialAgentOpportunityDraftClarification(input.task, {
          missing: publishDraft.missing,
          sourceText: [
            input.message,
            input.task.goal,
            pendingOpportunityDraft?.sourceText,
          ]
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter(Boolean)
            .join(' '),
        });
        await this.taskRepo.save(input.task);
        return {
          handled: true,
          assistantMessage: publishDraft.assistantMessage,
          pendingApproval: null,
          cards: [
            buildSocialAgentSlotCompletionCard({
              task: input.task,
              missing: publishDraft.missing,
              sourceText: pendingOpportunityDraft?.sourceText ?? input.message,
            }),
          ],
        };
      }
      const staged = this.draftPublication
        ? await this.draftPublication.stagePrivateDraftForPublish(
            input.ownerUserId,
            input.task.id,
            publishDraft.draft,
          )
        : null;
      const task = input.task;
      const draft = staged?.draft ?? publishDraft.draft;
      rememberSocialAgentOpportunityDraft(task, draft);
      await this.taskRepo.save(task);
      return {
        handled: true,
        assistantMessage:
          '我已经把这次约练整理成发布确认卡。你点确认前不会公开到发现页。',
        pendingApproval: null,
        cards: [
          buildSocialAgentPublishConfirmationCard({
            task,
            draft,
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
    return hasExplicitPublishSideEffectIntent(message);
  }

  private isCancelPendingOpportunityDraft(message: string): boolean {
    return /(取消|不用了|算了|先不发布|暂不发布|不要发布|不发了|取消这次)/i.test(
      message,
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
