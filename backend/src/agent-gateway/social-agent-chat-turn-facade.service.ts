import { Injectable } from '@nestjs/common';

import type { SocialAgentCardActionBody } from './social-agent-action.types';
import type {
  SocialAgentIntentRouteResult,
  SocialAgentRouteMessageBody,
} from './social-agent-chat.types';
import { SocialAgentCardActionRouterService } from './social-agent-card-action-router.service';
import { SocialAgentInitialSearchQueueService } from './social-agent-initial-search-queue.service';
import { SocialAgentReplanFacadeService } from './social-agent-replan-facade.service';
import { SocialAgentRouteTurnService } from './social-agent-route-turn.service';

@Injectable()
export class SocialAgentChatTurnFacadeService {
  constructor(
    private readonly routeTurns: SocialAgentRouteTurnService,
    private readonly cardActionRouter: SocialAgentCardActionRouterService,
    private readonly replanFacade: SocialAgentReplanFacadeService,
    private readonly initialSearchQueue: SocialAgentInitialSearchQueueService,
  ) {}

  routeMessage(
    ownerUserId: number,
    body: SocialAgentRouteMessageBody,
  ): Promise<SocialAgentIntentRouteResult> {
    return this.handleMessage(ownerUserId, body);
  }

  handleMessage(
    ownerUserId: number,
    body: SocialAgentRouteMessageBody,
  ): Promise<SocialAgentIntentRouteResult> {
    return this.routeTurns.handleMessage({
      ownerUserId,
      body,
      replanAndRefresh: (currentOwnerUserId, taskId, replanBody) =>
        this.replanFacade.replanAndRefresh(
          currentOwnerUserId,
          taskId,
          replanBody,
        ),
      queueInitialSearchForTask: (currentOwnerUserId, task, goal) =>
        this.initialSearchQueue.queueInitialSearchForTask({
          ownerUserId: currentOwnerUserId,
          task,
          goal,
        }),
    });
  }

  performCardAction(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentCardActionBody,
  ): Promise<SocialAgentIntentRouteResult> {
    return this.cardActionRouter.perform({
      ownerUserId,
      taskId,
      body,
      handleMessage: (routeBody) => this.handleMessage(ownerUserId, routeBody),
    });
  }
}
