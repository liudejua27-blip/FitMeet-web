import { Injectable } from '@nestjs/common';

import type {
  SocialAgentAsyncRunSnapshot,
  SocialAgentCurrentTaskSnapshot,
  SocialAgentSessionSnapshot,
  SocialAgentTaskTimelineSnapshot,
} from './social-agent-chat.types';
import { SocialAgentSessionQueryService } from './social-agent-session-query.service';

@Injectable()
export class SocialAgentChatSessionFacadeService {
  constructor(
    private readonly sessionQueries: SocialAgentSessionQueryService,
  ) {}

  getRunStatus(
    ownerUserId: number,
    taskId: number,
    runId: string,
  ): Promise<SocialAgentAsyncRunSnapshot> {
    return this.sessionQueries.getRunStatus(ownerUserId, taskId, runId);
  }

  getLatestSession(ownerUserId: number): Promise<SocialAgentSessionSnapshot> {
    return this.sessionQueries.getLatestSession(ownerUserId);
  }

  getTaskSession(
    ownerUserId: number,
    taskId: number,
  ): Promise<SocialAgentSessionSnapshot> {
    return this.sessionQueries.getTaskSession(ownerUserId, taskId);
  }

  getCurrentTask(
    ownerUserId: number,
  ): Promise<SocialAgentCurrentTaskSnapshot | null> {
    return this.sessionQueries.getCurrentTask(ownerUserId);
  }

  getTaskTimeline(
    ownerUserId: number,
    taskId: number,
  ): Promise<SocialAgentTaskTimelineSnapshot> {
    return this.sessionQueries.getTaskTimeline(ownerUserId, taskId);
  }
}
