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
    const action = this.normalizeCardAction(input.body.action);
    if (!action) throw new BadRequestException('Missing agent action');
    const body =
      action === input.body.action ? input.body : { ...input.body, action };
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
        result = await this.performActionTool({ ...input, body });
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
    const action = this.normalizeCardAction(body.action);
    if (!action) throw new BadRequestException('Missing agent action');
    const normalizedBody = action === body.action ? body : { ...body, action };

    if (action === 'opener.confirm_send') {
      return this.candidateActions.confirmOpenerSendFromCardAction(
        ownerUserId,
        taskId,
        normalizedBody,
        { signal: options?.signal ?? null },
      );
    }

    if (action === 'opener.reject') {
      return this.candidateActions.rejectOpenerSendFromCardAction(
        ownerUserId,
        taskId,
        normalizedBody,
      );
    }

    if (action === 'opener.regenerate') {
      return this.candidateActions.regenerateOpenerDraftFromCardAction(
        ownerUserId,
        taskId,
        normalizedBody,
      );
    }

    if (
      action === 'candidate.view_detail' ||
      action === 'candidate.more_like_this' ||
      action === 'candidate.skip' ||
      action === 'candidate.like'
    ) {
      return this.candidateActions.performCandidatePreferenceAction(
        ownerUserId,
        taskId,
        normalizedBody,
      );
    }

    if (action === 'candidate.generate_opener') {
      return this.candidateActions.createOpenerDraftFromCardAction(
        ownerUserId,
        taskId,
        normalizedBody,
      );
    }

    if (action === 'connect_candidate' || action === 'candidate.connect') {
      return this.candidateActions.connectCandidateFromCardAction(
        ownerUserId,
        taskId,
        normalizedBody,
      );
    }

    if (this.isActivityAction(action)) {
      return this.meetLoop.performActivityAction(ownerUserId, taskId, normalizedBody);
    }

    if (this.isLifeGraphAction(action)) {
      return this.lifeGraphActions.performUpdateAction(
        ownerUserId,
        taskId,
        normalizedBody,
      );
    }

    return handleMessage(
      {
        taskId,
        message: messageForSocialAgentSchemaAction(action),
        hasCandidates: true,
        idempotencyKey: body.idempotencyKey ?? null,
        clientContext: this.clientContextForCardAction(body, taskId),
      },
      emit,
      options,
    );
  }

  private isActivityAction(action: string) {
    return (
      action === 'activity.confirm_create' ||
      action === 'activity.skip_publish' ||
      action === 'activity.modify_time' ||
      action === 'activity.modify_location' ||
      action === 'activity.check_in' ||
      action === 'activity.complete' ||
      action === 'activity.view_detail' ||
      action === 'activity.upload_proof' ||
      action === 'review.submit' ||
      action === 'meet_loop.resume' ||
      action === 'meet_loop.reschedule'
    );
  }

  private isLifeGraphAction(action: string) {
    return (
      action === 'life_graph.accept_update' ||
      action === 'life_graph.reject_update'
    );
  }

  private normalizeCardAction(
    action: SocialAgentCardActionBody['action'] | string | null | undefined,
  ): SocialAgentCardActionBody['action'] {
    if (!action) return null;
    const normalized = String(action).trim().toLowerCase();
    if (
      normalized === 'send_invite' ||
      normalized === 'send_message' ||
      normalized === 'send_message_to_candidate'
    ) {
      return 'opener.confirm_send';
    }
    if (normalized === 'add_friend' || normalized === 'connect_candidate') {
      return 'candidate.connect';
    }
    if (
      normalized === 'save_candidate' ||
      normalized === 'favorite_candidate' ||
      normalized === 'bookmark_candidate' ||
      normalized === 'collect_candidate'
    ) {
      return 'candidate.like';
    }
    if (normalized === 'generate_opener' || normalized === 'draft_opener') {
      return 'candidate.generate_opener';
    }
    if (
      normalized === 'publish_social_request' ||
      normalized === 'publish_to_discover' ||
      normalized === 'create_activity'
    ) {
      return 'activity.confirm_create';
    }
    if (normalized === 'modify_activity' || normalized === 'change_time') {
      return 'activity.modify_time';
    }
    if (normalized === 'change_location') {
      return 'activity.modify_location';
    }
    if (normalized === 'skip_publish') {
      return 'activity.skip_publish';
    }
    return action as SocialAgentCardActionBody['action'];
  }

  private agentForAction(action: string) {
    if (action.startsWith('life_graph.')) return 'Life Graph Agent' as const;
    if (
      action.startsWith('activity.') ||
      action.startsWith('review.') ||
      action.startsWith('meet_loop.')
    ) {
      return 'Meet Loop Agent' as const;
    }
    if (
      action === 'connect_candidate' ||
      action.startsWith('candidate.') ||
      action.startsWith('opener.')
    ) {
      return 'Social Match Agent' as const;
    }
    return 'FitMeet Main Agent' as const;
  }

  private clientContextForCardAction(
    body: SocialAgentCardActionBody,
    taskId: number,
  ): SocialAgentRouteMessageBody['clientContext'] {
    return {
      ...(body.clientContext ?? {}),
      threadId: body.clientContext?.threadId ?? `agent-task:${taskId}`,
      source: body.clientContext?.source ?? 'card_action',
    };
  }
}
