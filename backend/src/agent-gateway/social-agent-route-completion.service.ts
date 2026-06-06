import { Injectable } from '@nestjs/common';

import type { LifeGraphProposalDto } from '../life-graph/dto/life-graph.dto';
import type { AgentTask } from './entities/agent-task.entity';
import type {
  SocialAgentActivityResult,
  SocialAgentAsyncRunSnapshot,
  SocialAgentIntentRouteResult,
  SocialAgentPendingApprovalSnapshot,
} from './social-agent-chat.types';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import { SocialAgentMessageLogService } from './social-agent-message-log.service';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import { socialAgentRouteAction } from './social-agent-route-response.presenter';

type CompleteRouteTurnInput = {
  task: AgentTask;
  route: SocialAgentIntentRouterResult;
  assistantMessage: string;
  savedContext: boolean;
  profileUpdated: boolean;
  queuedRun: SocialAgentAsyncRunSnapshot | null;
  runMode: SocialAgentIntentRouteResult['runMode'];
  pendingApproval: SocialAgentPendingApprovalSnapshot | null;
  activityResults: SocialAgentActivityResult[];
  profileUpdateProposal: LifeGraphProposalDto | null;
  startedAt: number;
};

@Injectable()
export class SocialAgentRouteCompletionService {
  constructor(
    private readonly messageLog: SocialAgentMessageLogService,
    private readonly metrics: SocialAgentMetricsService,
  ) {}

  async complete(
    input: CompleteRouteTurnInput,
  ): Promise<SocialAgentIntentRouteResult> {
    const result: SocialAgentIntentRouteResult = {
      ...input.route,
      shouldReplan: input.queuedRun
        ? input.runMode === 'follow_up'
        : input.route.shouldReplan,
      action: socialAgentRouteAction(
        input.route,
        input.queuedRun,
        input.runMode,
      ),
      taskId: input.task.id,
      assistantMessage: input.assistantMessage,
      savedContext: input.savedContext,
      profileUpdated: input.profileUpdated,
      shouldQueueRun: Boolean(input.queuedRun),
      runMode: input.runMode,
      queuedRun: input.queuedRun,
      pendingApproval: input.pendingApproval,
      activityResults: input.activityResults,
      profileUpdateProposal: input.profileUpdateProposal,
      permissionMode: input.task.permissionMode,
    };

    if (input.queuedRun && input.runMode) {
      this.metrics.recordQueuedRun(input.runMode);
    }
    this.metrics.recordAction(result.action);
    await this.messageLog.recordAssistantMessage(
      input.task,
      input.assistantMessage,
      result,
    );
    this.metrics.observeRouteLatency(Date.now() - input.startedAt);
    return result;
  }
}
