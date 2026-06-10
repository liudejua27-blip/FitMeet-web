import { BadRequestException, Injectable, Optional } from '@nestjs/common';

import { AgentLoopService } from './agent-loop.service';
import { SocialAgentCandidateActionService } from './social-agent-candidate-action.service';
import { messageForSocialAgentSchemaAction } from './social-agent-card-action.presenter';
import type { SocialAgentCardActionBody } from './social-agent-action.types';
import type {
  SocialAgentIntentRouteResult,
  SocialAgentRouteMessageBody,
  SocialAgentStreamOptions,
  StreamEmit,
} from './social-agent-chat.types';
import { SocialAgentLifeGraphCardActionService } from './social-agent-life-graph-card-action.service';
import { SocialAgentMeetLoopService } from './social-agent-meet-loop.service';

type HandleMessage = (
  body: SocialAgentRouteMessageBody,
  emit?: StreamEmit,
  options?: SocialAgentStreamOptions,
) => Promise<SocialAgentIntentRouteResult>;

@Injectable()
export class SocialAgentCardActionRouterService {
  constructor(
    private readonly candidateActions: SocialAgentCandidateActionService,
    private readonly meetLoop: SocialAgentMeetLoopService,
    private readonly lifeGraphActions: SocialAgentLifeGraphCardActionService,
    @Optional() private readonly agentLoop?: AgentLoopService,
  ) {}

  async perform(input: {
    ownerUserId: number;
    taskId: number;
    body: SocialAgentCardActionBody;
    handleMessage: HandleMessage;
    emit?: StreamEmit;
    options?: SocialAgentStreamOptions;
  }): Promise<SocialAgentIntentRouteResult> {
    const action = input.body.action;
    if (!action) throw new BadRequestException('Missing agent action');
    let result: SocialAgentIntentRouteResult | null = null;
    const loopService = this.agentLoop ?? new AgentLoopService();
    const execution = await loopService.execute({
      taskId: input.taskId,
      goal: `card_action:${action}`,
      agent: 'FitMeet Main Agent',
      plan: {
        reason: 'Card actions dispatch only through AgentLoop.',
        tools: [
          {
            agent: this.agentForAction(action),
            toolName: 'card_action_dispatch',
            input: {
              action,
              taskId: input.taskId,
              idempotencyKey: input.body.idempotencyKey ?? null,
            },
          },
        ],
      },
      maxToolCalls: 1,
      maxRetries: 0,
      signal: input.options?.signal,
      runner: async () => {
        result = await this.performActionTool(input);
        return {
          handled: true,
          action,
          pendingApproval: result.pendingApproval ?? null,
          assistantStreamed: result.assistantStreamed === true,
        };
      },
    });
    const finalResult = result as SocialAgentIntentRouteResult | null;
    if (!finalResult) {
      throw new Error('Card action AgentLoop completed without result.');
    }
    finalResult.agentLoop = finalResult.agentLoop ?? execution.loop;
    return finalResult;
  }

  private async performActionTool(input: {
    ownerUserId: number;
    taskId: number;
    body: SocialAgentCardActionBody;
    handleMessage: HandleMessage;
    emit?: StreamEmit;
    options?: SocialAgentStreamOptions;
  }): Promise<SocialAgentIntentRouteResult> {
    const { ownerUserId, taskId, body, handleMessage, emit, options } = input;
    const action = body.action;
    if (!action) throw new BadRequestException('Missing agent action');

    if (action === 'opener.confirm_send') {
      return handleMessage(
        {
          taskId,
          message: '确认发送',
          hasCandidates: true,
          idempotencyKey: body.idempotencyKey ?? null,
        },
        emit,
        options,
      );
    }

    if (
      action === 'candidate.more_like_this' ||
      action === 'candidate.skip' ||
      action === 'candidate.like'
    ) {
      return handleMessage(
        {
          taskId,
          message:
            action === 'candidate.skip'
              ? '不喜欢这个推荐，换一个低压力的人'
              : action === 'candidate.like'
                ? '我喜欢这个推荐，继续下一步'
                : '看看更多类似的人',
          hasCandidates: true,
          idempotencyKey: body.idempotencyKey ?? null,
        },
        emit,
        options,
      );
    }

    if (action === 'candidate.generate_opener') {
      return this.candidateActions.createOpenerDraftFromCardAction(
        ownerUserId,
        taskId,
        body,
      );
    }

    if (this.isActivityAction(action)) {
      return this.meetLoop.performActivityAction(ownerUserId, taskId, body);
    }

    if (this.isLifeGraphAction(action)) {
      return this.lifeGraphActions.performUpdateAction(
        ownerUserId,
        taskId,
        body,
      );
    }

    return handleMessage(
      {
        taskId,
        message: messageForSocialAgentSchemaAction(action),
        hasCandidates: true,
        idempotencyKey: body.idempotencyKey ?? null,
      },
      emit,
      options,
    );
  }

  private isActivityAction(action: string) {
    return (
      action === 'activity.confirm_create' ||
      action === 'activity.check_in' ||
      action === 'activity.complete' ||
      action === 'activity.view_detail' ||
      action === 'activity.upload_proof' ||
      action === 'review.submit'
    );
  }

  private isLifeGraphAction(action: string) {
    return (
      action === 'life_graph.accept_update' ||
      action === 'life_graph.reject_update'
    );
  }

  private agentForAction(action: string) {
    if (action.startsWith('life_graph.')) return 'Life Graph Agent' as const;
    if (action.startsWith('activity.') || action.startsWith('review.')) {
      return 'Meet Loop Agent' as const;
    }
    if (action.startsWith('candidate.') || action.startsWith('opener.')) {
      return 'Social Match Agent' as const;
    }
    return 'FitMeet Main Agent' as const;
  }
}
