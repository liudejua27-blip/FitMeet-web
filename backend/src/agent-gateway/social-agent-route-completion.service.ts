import { Injectable, Optional } from '@nestjs/common';

import type { LifeGraphProposalDto } from '../life-graph/dto/life-graph.dto';
import type { AgentTask } from './entities/agent-task.entity';
import type {
  SocialAgentActivityResult,
  SocialAgentAsyncRunSnapshot,
  SocialAgentIntentRouteResult,
  SocialAgentPendingApprovalSnapshot,
} from './social-agent-chat.types';
import type { AgentLoopRun, SubagentHandoffResult } from './agent-loop.types';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import { SocialAgentMessageLogService } from './social-agent-message-log.service';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import { socialAgentRouteAction } from './social-agent-route-response.presenter';
import { AgentSelfImproveService } from './agent-self-improve.service';

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
  assistantStreamed?: boolean;
  agentLoop?: AgentLoopRun | null;
  subagentHandoffs?: SubagentHandoffResult[];
  startedAt: number;
};

@Injectable()
export class SocialAgentRouteCompletionService {
  constructor(
    private readonly messageLog: SocialAgentMessageLogService,
    private readonly metrics: SocialAgentMetricsService,
    @Optional() private readonly selfImprove?: AgentSelfImproveService,
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
      assistantStreamed: input.assistantStreamed ?? false,
      agentLoop: input.agentLoop ?? undefined,
      subagentHandoffs: input.subagentHandoffs ?? [],
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
    await this.selfImprove?.recordOnlineReplayFromRoute({
      ownerUserId: input.task.ownerUserId,
      taskId: input.task.id,
      userMessage: input.task.goal,
      assistantMessage: input.assistantMessage,
      route: input.route as unknown as Record<string, unknown>,
      result: result as unknown as Record<string, unknown>,
    });
    this.metrics.observeRouteLatency(Date.now() - input.startedAt);
    return result;
  }
}
