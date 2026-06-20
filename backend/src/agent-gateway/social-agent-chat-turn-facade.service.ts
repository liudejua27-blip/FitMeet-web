import { Injectable } from '@nestjs/common';

import type { SocialAgentCardActionBody } from './social-agent-action.types';
import type {
  SocialAgentRouteMessageBody,
  SocialAgentStreamOptions,
  StreamEmit,
} from './social-agent-chat.types';
import { SocialAgentCardActionRouterService } from './social-agent-card-action-router.service';
import { SocialAgentChatTurnCallbacksService } from './social-agent-chat-turn-callbacks.service';
import { SocialAgentRouteTurnService } from './social-agent-route-turn.service';

@Injectable()
export class SocialAgentChatTurnFacadeService {
  constructor(
    private readonly routeTurns: SocialAgentRouteTurnService,
    private readonly cardActionRouter: SocialAgentCardActionRouterService,
    private readonly turnCallbacks: SocialAgentChatTurnCallbacksService,
  ) {}

  routeMessage(ownerUserId: number, body: SocialAgentRouteMessageBody) {
    return this.handleMessage(ownerUserId, body);
  }

  handleMessage(ownerUserId: number, body: SocialAgentRouteMessageBody) {
    return this.handleMessageInternal(ownerUserId, body);
  }

  handleMessageStream(
    ownerUserId: number,
    body: SocialAgentRouteMessageBody,
    emit: StreamEmit,
    options: SocialAgentStreamOptions = {},
  ) {
    return this.handleMessageInternal(ownerUserId, body, emit, options);
  }

  private handleMessageInternal(
    ownerUserId: number,
    body: SocialAgentRouteMessageBody,
    emit?: StreamEmit,
    options: SocialAgentStreamOptions = {},
  ) {
    const callbacks = this.turnCallbacks.forOwner(ownerUserId);
    // prettier-ignore
    return this.routeTurns.handleMessage({ ownerUserId, body, emit, signal: options.signal, streamOptions: options, ...callbacks });
  }

  performCardAction(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentCardActionBody,
  ) {
    return this.cardActionRouter.perform({
      ownerUserId,
      taskId,
      body,
      handleMessage: (routeBody) => this.handleMessage(ownerUserId, routeBody),
    });
  }

  performCardActionStream(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentCardActionBody,
    emit: StreamEmit,
    options: SocialAgentStreamOptions = {},
  ) {
    // prettier-ignore
    return this.cardActionRouter.perform({
      ownerUserId, taskId, body, emit, options,
      handleMessage: (routeBody, nextEmit, nextOptions) =>
        this.handleMessageInternal(ownerUserId, routeBody, nextEmit, nextOptions),
    });
  }
}
