import { Injectable } from '@nestjs/common';

import type { AgentTask } from './entities/agent-task.entity';
import type { SocialAgentPendingApprovalSnapshot } from './social-agent-chat.types';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import { recordSocialAgentPendingAction } from './social-agent-memory.util';
import { SocialAgentCandidateActionService } from './social-agent-candidate-action.service';
import { SocialAgentMetricsService } from './social-agent-metrics.service';

type HandleRouteActionTurnInput = {
  ownerUserId: number;
  task: AgentTask;
  route: SocialAgentIntentRouterResult;
  message: string;
  assistantMessage: string;
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
    if (input.route.intent !== 'action_request') {
      return {
        handled: false,
        assistantMessage: input.assistantMessage,
        pendingApproval: null,
      };
    }

    const pendingApproval = await this.candidateActions.createActionApproval({
      ownerUserId: input.ownerUserId,
      task: input.task,
      message: input.message,
      route: input.route,
    });
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
    });
    return {
      handled: true,
      assistantMessage,
      pendingApproval,
    };
  }

  private withApprovalCopy(input: {
    task: AgentTask;
    assistantMessage: string;
    pendingApproval: SocialAgentPendingApprovalSnapshot;
  }): string {
    const draft = this.candidateActions.candidateMessageDraft(input.task);
    return draft
      ? `${input.assistantMessage}\n我先给你拟一条开场白：${draft}\n确认后我再发送。待确认动作 #${input.pendingApproval.id} 已创建。`
      : `${input.assistantMessage}\n（已创建待确认动作 #${input.pendingApproval.id}，请在卡片上点击“批准/拒绝”。）`;
  }
}
