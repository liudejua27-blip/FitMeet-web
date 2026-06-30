import { Injectable } from '@nestjs/common';

import { AgentTask, AgentTaskStatus } from '../entities/agent-task.entity';
import type { SocialAgentIntentRouteResult } from '../social-agent-chat.types';
import { SocialAgentMessageLogService } from '../social-agent-message-log.service';
import { SocialAgentProfileEnrichmentService } from '../social-agent-profile-enrichment.service';

@Injectable()
export class ProfileLoopService {
  constructor(
    private readonly profileEnrichment: SocialAgentProfileEnrichmentService,
    private readonly messageLog: SocialAgentMessageLogService,
  ) {}

  async tryHandleEntrance(input: {
    ownerUserId: number;
    task: AgentTask;
    message: string;
  }): Promise<{
    task: AgentTask;
    result: SocialAgentIntentRouteResult;
  } | null> {
    const handled = await this.profileEnrichment.handleTurn({
      ownerUserId: input.ownerUserId,
      task: input.task,
      message: input.message,
      intent: 'profile_enrichment_request',
      buildMemoryContext: () => null,
    });
    const hasCompletionCard = handled.cards?.some(
      (card) => card.schemaType === 'profile.completion',
    );
    if (!hasCompletionCard) return null;

    handled.task.status = AgentTaskStatus.AwaitingFeedback;
    handled.task.statusReason = 'profile_loop_clarify';
    const result: SocialAgentIntentRouteResult = {
      intent: 'profile_enrichment_request',
      confidence: 1,
      entities: {
        city: '',
        activityType: '',
        targetGender: '',
        timePreference: '',
        locationPreference: '',
      },
      shouldSearch: false,
      shouldReplan: false,
      shouldUpdateProfile: false,
      shouldExecuteAction: false,
      replyStrategy: 'ask_clarifying_question',
      source: 'rules',
      action: 'clarify',
      taskId: handled.task.id,
      assistantMessage: handled.assistantMessage,
      assistantMessageSource:
        handled.assistantMessageSource ?? 'deterministic_route',
      savedContext: handled.savedContext,
      profileUpdated: handled.profileUpdated,
      shouldQueueRun: false,
      runMode: null,
      queuedRun: null,
      pendingApproval: null,
      activityResults: [],
      profileUpdateProposal: handled.profileUpdateProposal ?? null,
      cards: handled.cards,
      permissionMode: handled.task.permissionMode,
      structuredIntent: {
        schemaVersion: 'fitmeet.profile-loop.v1',
        mode: 'profile_loop',
        stage: 'profile_completion',
      },
    };
    await this.messageLog.recordAssistantMessage(
      handled.task,
      handled.assistantMessage,
      result,
    );
    return { task: handled.task, result };
  }
}
