import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { cleanDisplayText } from '../common/display-text.util';
import { CreateSocialRequestDto } from '../social-requests/dto/create-social-request.dto';
import {
  AgentTask,
  AgentTaskPermissionMode,
} from './entities/agent-task.entity';
import { SocialAgentToolCallRecord } from './social-agent-tool-executor.service';
import { transitionSocialAgentState } from './social-agent-memory.util';
import { TonePolicyService } from './response-quality/tone-policy.service';
import type {
  CandidateTargetBody,
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
import { SocialAgentCandidateCommandService } from './social-agent-candidate-command.service';
export type * from './social-agent-chat.types';

@Injectable()
export class SocialAgentChatService {
  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    private readonly routeTurns: SocialAgentRouteTurnService,
    private readonly queuedRuns: SocialAgentQueuedRunService,
    private readonly runOrchestrator: SocialAgentRunOrchestratorService,
    private readonly sessionQueries: SocialAgentSessionQueryService,
    private readonly cardActionRouter: SocialAgentCardActionRouterService,
    private readonly replanFacade: SocialAgentReplanFacadeService,
    private readonly candidateCommands: SocialAgentCandidateCommandService,
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
        this.queueInitialSearchForTask(currentOwnerUserId, task, goal),
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

  async publishDraft(
    ownerUserId: number,
    taskId: number,
    draft: CreateSocialRequestDto & { socialRequestId?: number | null },
  ) {
    return this.candidateCommands.publishDraft(ownerUserId, taskId, draft);
  }

  async saveCandidate(
    ownerUserId: number,
    taskId: number,
    body: CandidateTargetBody & {
      candidateRecordId?: number | null;
      socialRequestId?: number | null;
      targetUserId?: number | null;
      candidateUserId?: number | null;
      candidate?: Record<string, unknown>;
    },
  ): Promise<SocialAgentToolCallRecord> {
    return this.candidateCommands.saveCandidate(ownerUserId, taskId, body);
  }

  async sendCandidateMessage(
    ownerUserId: number,
    taskId: number,
    body: CandidateTargetBody & {
      targetUserId?: number;
      candidateUserId?: number;
      message?: string;
      suggestedOpener?: string;
      candidateRecordId?: number | null;
      socialRequestId?: number | null;
      candidate?: Record<string, unknown>;
    },
  ): Promise<Record<string, unknown>> {
    return this.candidateCommands.sendCandidateMessage(
      ownerUserId,
      taskId,
      body,
    );
  }

  async connectCandidate(
    ownerUserId: number,
    taskId: number,
    body: CandidateTargetBody & {
      targetUserId?: number | null;
      candidateUserId?: number | null;
      candidateRecordId?: number | null;
      socialRequestId?: number | null;
      candidate?: Record<string, unknown>;
    },
  ): Promise<Record<string, unknown>> {
    return this.candidateCommands.connectCandidate(ownerUserId, taskId, body);
  }

  private userVisibleStepLabel(id: string, label: string): string {
    return this.tonePolicy?.userStatus(id, label) ?? label;
  }

  private async queueInitialSearchForTask(
    ownerUserId: number,
    task: AgentTask,
    goal: string,
  ): Promise<SocialAgentAsyncRunSnapshot> {
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
    return this.runQueued(ownerUserId, {
      goal,
      permissionMode: task.permissionMode ?? AgentTaskPermissionMode.Confirm,
      idempotencyKey,
    });
  }
}
