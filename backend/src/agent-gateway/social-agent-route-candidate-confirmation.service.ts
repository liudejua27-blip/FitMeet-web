import { Injectable } from '@nestjs/common';

import { AgentTask } from './entities/agent-task.entity';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import type { SocialAgentIntentRouteResult } from './social-agent-chat.types';
import { SocialAgentCandidateActionService } from './social-agent-candidate-action.service';
import { SocialAgentMessageLogService } from './social-agent-message-log.service';
import { SocialAgentMetricsService } from './social-agent-metrics.service';

type HandleRouteCandidateConfirmationInput = {
  ownerUserId: number;
  task: AgentTask;
  message: string;
  route: SocialAgentIntentRouterResult;
  startedAt: number;
};

type HandleRouteCandidateConfirmationResult =
  | {
      handled: false;
      task: AgentTask;
      result: null;
    }
  | {
      handled: true;
      task: AgentTask;
      result: SocialAgentIntentRouteResult;
    };

@Injectable()
export class SocialAgentRouteCandidateConfirmationService {
  constructor(
    private readonly candidateActions: SocialAgentCandidateActionService,
    private readonly messageLog: SocialAgentMessageLogService,
    private readonly metrics: SocialAgentMetricsService,
  ) {}

  async handle(
    input: HandleRouteCandidateConfirmationInput,
  ): Promise<HandleRouteCandidateConfirmationResult> {
    const confirmedCandidateMessage =
      await this.candidateActions.confirmPendingCandidateMessageIfRequested(
        input.ownerUserId,
        input.task,
        input.message,
      );

    if (!confirmedCandidateMessage) {
      return {
        handled: false,
        task: input.task,
        result: null,
      };
    }

    const task = confirmedCandidateMessage.task;
    const assistantMessage = confirmedCandidateMessage.assistantMessage;
    const result: SocialAgentIntentRouteResult = {
      ...input.route,
      intent: 'action_request',
      action: 'reply',
      taskId: task.id,
      assistantMessage,
      savedContext: false,
      profileUpdated: false,
      shouldExecuteAction: true,
      shouldQueueRun: false,
      runMode: null,
      queuedRun: null,
      pendingApproval: null,
      activityResults: [],
      cards: confirmedCandidateMessage.cards,
      permissionMode: task.permissionMode,
    };

    this.metrics.recordAction(result.action);
    await this.messageLog.recordAssistantMessage(
      task,
      assistantMessage,
      result,
    );
    this.metrics.observeRouteLatency(Date.now() - input.startedAt);

    return {
      handled: true,
      task,
      result,
    };
  }
}
