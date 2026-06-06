import { Injectable } from '@nestjs/common';

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
import { SocialAgentSessionQueryService } from './social-agent-session-query.service';
import { SocialAgentReplanFacadeService } from './social-agent-replan-facade.service';
import { SocialAgentChatTurnFacadeService } from './social-agent-chat-turn-facade.service';
import { SocialAgentChatRunFacadeService } from './social-agent-chat-run-facade.service';

@Injectable()
export class SocialAgentChatService {
  constructor(
    private readonly runFacade: SocialAgentChatRunFacadeService,
    private readonly turnFacade: SocialAgentChatTurnFacadeService,
    private readonly sessionQueries: SocialAgentSessionQueryService,
    private readonly replanFacade: SocialAgentReplanFacadeService,
  ) {}

  run(
    ownerUserId: number,
    body: SocialAgentChatRunBody,
  ): Promise<SocialAgentChatRunResult> {
    return this.runFacade.run(ownerUserId, body);
  }

  async routeMessage(
    ownerUserId: number,
    body: SocialAgentRouteMessageBody,
  ): Promise<SocialAgentIntentRouteResult> {
    return this.turnFacade.routeMessage(ownerUserId, body);
  }

  async handleMessage(
    ownerUserId: number,
    body: SocialAgentRouteMessageBody,
  ): Promise<SocialAgentIntentRouteResult> {
    return this.turnFacade.handleMessage(ownerUserId, body);
  }

  async performCardAction(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentCardActionBody,
  ): Promise<SocialAgentIntentRouteResult> {
    return this.turnFacade.performCardAction(ownerUserId, taskId, body);
  }

  async runQueued(
    ownerUserId: number,
    body: SocialAgentChatRunBody,
  ): Promise<SocialAgentAsyncRunSnapshot> {
    return this.runFacade.runQueued(ownerUserId, body);
  }

  runStream(
    ownerUserId: number,
    body: SocialAgentChatRunBody,
    emit: StreamEmit,
  ): Promise<SocialAgentChatRunResult> {
    return this.runFacade.runStream(ownerUserId, body, emit);
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
}
