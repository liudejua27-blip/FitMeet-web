import { Injectable } from '@nestjs/common';

import { AgentTask } from './entities/agent-task.entity';
import type {
  SocialAgentAsyncRunSnapshot,
  SocialAgentChatReplanRunBody,
} from './social-agent-chat.types';
import { SocialAgentInitialSearchQueueService } from './social-agent-initial-search-queue.service';
import { SocialAgentReplanFacadeService } from './social-agent-replan-facade.service';

export type SocialAgentRouteTurnCallbacks = {
  replanAndRefresh: (
    ownerUserId: number,
    taskId: number,
    body: SocialAgentChatReplanRunBody,
  ) => Promise<SocialAgentAsyncRunSnapshot>;
  queueInitialSearchForTask: (
    ownerUserId: number,
    task: AgentTask,
    goal: string,
    options?: { signal?: AbortSignal | null; waitForCompletionMs?: number },
  ) => Promise<SocialAgentAsyncRunSnapshot>;
};

@Injectable()
export class SocialAgentChatTurnCallbacksService {
  constructor(
    private readonly replanFacade: SocialAgentReplanFacadeService,
    private readonly initialSearchQueue: SocialAgentInitialSearchQueueService,
  ) {}

  forOwner(ownerUserId: number): SocialAgentRouteTurnCallbacks {
    return {
      replanAndRefresh: (_currentOwnerUserId, taskId, body) =>
        this.replanFacade.replanAndRefresh(ownerUserId, taskId, body),
      queueInitialSearchForTask: (_currentOwnerUserId, task, goal, options) =>
        this.initialSearchQueue.queueInitialSearchForTask({
          ownerUserId,
          task,
          goal,
          signal: options?.signal ?? null,
          waitForCompletionMs: options?.waitForCompletionMs,
        }),
    };
  }
}
