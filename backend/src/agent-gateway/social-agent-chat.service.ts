import { Injectable } from '@nestjs/common';

import { TonePolicyService } from './response-quality/tone-policy.service';
import type {
  SocialAgentAppendContextResult,
  SocialAgentAsyncRunSnapshot,
  SocialAgentCardActionBody,
  SocialAgentChatReplanRunBody,
  SocialAgentChatRunBody,
  SocialAgentChatRunResult,
  SocialAgentCurrentTaskSnapshot,
  SocialAgentIntentRouteResult,
  SocialAgentRouteMessageBody,
  SocialAgentSessionSnapshot,
  SocialAgentTaskTimelineSnapshot,
  StreamEmit,
} from './social-agent-chat.types';
import { SocialAgentRouteTurnService } from './social-agent-route-turn.service';
import { SocialAgentQueuedRunService } from './social-agent-queued-run.service';
import { SocialAgentRunOrchestratorService } from './social-agent-run-orchestrator.service';
import { SocialAgentSessionQueryService } from './social-agent-session-query.service';
import { SocialAgentCardActionRouterService } from './social-agent-card-action-router.service';
import { SocialAgentReplanFacadeService } from './social-agent-replan-facade.service';
import { SocialAgentInitialSearchQueueService } from './social-agent-initial-search-queue.service';

@Injectable()
export class SocialAgentChatService {
  constructor(
    private readonly routeTurns: SocialAgentRouteTurnService,
    private readonly queuedRuns: SocialAgentQueuedRunService,
    private readonly runOrchestrator: SocialAgentRunOrchestratorService,
    private readonly sessionQueries: SocialAgentSessionQueryService,
    private readonly cardActionRouter: SocialAgentCardActionRouterService,
    private readonly replanFacade: SocialAgentReplanFacadeService,
    private readonly initialSearchQueue: SocialAgentInitialSearchQueueService,
    private readonly tonePolicy?: TonePolicyService,
  ) {}

  run(
    ownerUserId: number,
    body: SocialAgentChatRunBody,
  ): Promise<SocialAgentChatRunResult> {
    return this.runOrchestrator.run(ownerUserId, body);
  }

  async routeMessage(
    ownerUserId: number,
    body: SocialAgentRouteMessageBody,
  ): Promise<SocialAgentIntentRouteResult> {
    return this.handleMessage(ownerUserId, body);
  }

  async handleMessage(
    ownerUserId: number,
    body: SocialAgentRouteMessageBody,
  ): Promise<SocialAgentIntentRouteResult> {
    return this.routeTurns.handleMessage({
      ownerUserId,
      body,
      replanAndRefresh: (currentOwnerUserId, taskId, replanBody) =>
        this.replanAndRefresh(currentOwnerUserId, taskId, replanBody),
      queueInitialSearchForTask: (currentOwnerUserId, task, goal) =>
        this.initialSearchQueue.queueInitialSearchForTask({
          ownerUserId: currentOwnerUserId,
          task,
          goal,
        }),
    });
  }

  async performCardAction(
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

  async runQueued(
    ownerUserId: number,
    body: SocialAgentChatRunBody,
  ): Promise<SocialAgentAsyncRunSnapshot> {
    return this.queuedRuns.runQueued({
      ownerUserId,
      body,
      executeRun: (runBody, emit) =>
        this.runOrchestrator.run(ownerUserId, runBody, emit),
      visibleStepLabel: (id, label) => this.userVisibleStepLabel(id, label),
    });
  }

  runStream(
    ownerUserId: number,
    body: SocialAgentChatRunBody,
    emit: StreamEmit,
  ): Promise<SocialAgentChatRunResult> {
    return this.runOrchestrator.run(ownerUserId, body, emit);
  }

  async replanAndRefresh(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentChatReplanRunBody,
  ): Promise<SocialAgentAsyncRunSnapshot> {
    return this.replanFacade.replanAndRefresh(ownerUserId, taskId, body);
  }

  async appendContext(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentChatReplanRunBody,
  ): Promise<SocialAgentAppendContextResult> {
    return this.replanFacade.appendContext(ownerUserId, taskId, body);
  }

  async getRunStatus(
    ownerUserId: number,
    taskId: number,
    runId: string,
  ): Promise<SocialAgentAsyncRunSnapshot> {
    return this.sessionQueries.getRunStatus(ownerUserId, taskId, runId);
  }

  async getLatestSession(
    ownerUserId: number,
  ): Promise<SocialAgentSessionSnapshot> {
    return this.sessionQueries.getLatestSession(ownerUserId);
  }

  async getTaskSession(
    ownerUserId: number,
    taskId: number,
  ): Promise<SocialAgentSessionSnapshot> {
    return this.sessionQueries.getTaskSession(ownerUserId, taskId);
  }

  async getCurrentTask(
    ownerUserId: number,
  ): Promise<SocialAgentCurrentTaskSnapshot | null> {
    return this.sessionQueries.getCurrentTask(ownerUserId);
  }

  async getTaskTimeline(
    ownerUserId: number,
    taskId: number,
  ): Promise<SocialAgentTaskTimelineSnapshot> {
    return this.sessionQueries.getTaskTimeline(ownerUserId, taskId);
  }

  private userVisibleStepLabel(id: string, label: string): string {
    return this.tonePolicy?.userStatus(id, label) ?? label;
  }
}
