import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { cleanDisplayText } from '../common/display-text.util';
import {
  AgentTask,
  AgentTaskPermissionMode,
} from './entities/agent-task.entity';
import { transitionSocialAgentState } from './social-agent-memory.util';
import type {
  SocialAgentAsyncRunSnapshot,
  SocialAgentChatRunBody,
} from './social-agent-chat.types';
import { SocialAgentQueuedRunService } from './social-agent-queued-run.service';
import { SocialAgentRunOrchestratorService } from './social-agent-run-orchestrator.service';
import { TonePolicyService } from './response-quality/tone-policy.service';

@Injectable()
export class SocialAgentInitialSearchQueueService {
  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    private readonly queuedRuns: SocialAgentQueuedRunService,
    private readonly runOrchestrator: SocialAgentRunOrchestratorService,
    private readonly tonePolicy?: TonePolicyService,
  ) {}

  async queueInitialSearchForTask(input: {
    ownerUserId: number;
    task: AgentTask;
    goal: string;
    signal?: AbortSignal | null;
  }): Promise<SocialAgentAsyncRunSnapshot> {
    this.assertNotAborted(input.signal);
    const { ownerUserId, task, goal } = input;
    const idempotencyKey =
      cleanDisplayText(task.idempotencyKey, '') ||
      `social-agent-chat:${task.id}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    task.goal = goal;
    task.taskType = 'social_agent_chat';
    task.idempotencyKey = idempotencyKey;
    task.input = {
      ...(task.input ?? {}),
      source: 'social_agent_chat',
      executionBoundary: 'conversation_then_tools',
      latestSearchMessage: goal,
    };
    transitionSocialAgentState(task, 'search_started', {
      objective: 'search',
      nextStep: '搜索真实候选人并展示结果',
      shouldSearchNow: true,
      awaitingSearchConfirmation: false,
      waitingFor: 'search_results',
    });
    await this.taskRepo.save(task);
    this.assertNotAborted(input.signal);
    return this.runQueued(
      ownerUserId,
      {
        goal,
        permissionMode: task.permissionMode ?? AgentTaskPermissionMode.Confirm,
        idempotencyKey,
      },
      { signal: input.signal ?? null },
    );
  }

  private runQueued(
    ownerUserId: number,
    body: SocialAgentChatRunBody,
    options: { signal?: AbortSignal | null } = {},
  ): Promise<SocialAgentAsyncRunSnapshot> {
    return this.queuedRuns.runQueued({
      ownerUserId,
      body,
      executeRun: (runBody, emit) =>
        this.runOrchestrator.run(ownerUserId, runBody, emit, {
          signal: options.signal ?? null,
        }),
      signal: options.signal ?? null,
      visibleStepLabel: (id, label) => this.userVisibleStepLabel(id, label),
    });
  }

  private userVisibleStepLabel(id: string, label: string): string {
    return this.tonePolicy?.userStatus(id, label) ?? label;
  }

  private assertNotAborted(signal?: AbortSignal | null): void {
    if (signal?.aborted) throw new Error('Subagent worker job cancelled.');
  }
}
