import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AgentTask } from './entities/agent-task.entity';
import type { SubagentWorkerJob } from './entities/agent-l5-runtime.entity';
import {
  normalizeSubagentWorkerPayload,
  type LegacySubagentRouteBranchPayload,
} from './fitmeet-subagent-worker-command.contract';
import {
  applyConversationTurnState,
  applyProfileTurnState,
  applySearchTurnState,
  createSocialAgentRouteTurnState,
  type SocialAgentRouteTurnState,
} from './social-agent-route-turn-state';
import { SocialAgentRouteContextService } from './social-agent-route-context.service';
import { SocialAgentRouteConversationTurnService } from './social-agent-route-conversation-turn.service';
import { SocialAgentRouteProfileTurnService } from './social-agent-route-profile-turn.service';
import { SocialAgentRouteSearchTurnService } from './social-agent-route-search-turn.service';
import { SocialAgentRouteActionTurnService } from './social-agent-route-action-turn.service';
import { SocialAgentInitialSearchQueueService } from './social-agent-initial-search-queue.service';
import { SocialAgentReplanFacadeService } from './social-agent-replan-facade.service';

export type SerializedSubagentWorkerPayload = LegacySubagentRouteBranchPayload;

export type SerializedSubagentWorkerDispatchResult = {
  task: AgentTask;
  state: SocialAgentRouteTurnState;
  actionTurn?: Awaited<ReturnType<SocialAgentRouteActionTurnService['handle']>>;
  observation: Record<string, unknown>;
};

@Injectable()
export class FitMeetSubagentWorkerDispatcherService {
  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    private readonly routeContext: SocialAgentRouteContextService,
    private readonly conversationTurns: SocialAgentRouteConversationTurnService,
    private readonly profileTurns: SocialAgentRouteProfileTurnService,
    private readonly searchTurns: SocialAgentRouteSearchTurnService,
    private readonly actionTurns: SocialAgentRouteActionTurnService,
    private readonly initialSearchQueue: SocialAgentInitialSearchQueueService,
    private readonly replanFacade: SocialAgentReplanFacadeService,
  ) {}

  isSerializedPayload(
    value: Record<string, unknown>,
  ): value is SerializedSubagentWorkerPayload {
    return this.normalizePayload(value) !== null;
  }

  normalizePayload(
    value: Record<string, unknown>,
  ): SerializedSubagentWorkerPayload | null {
    return normalizeSubagentWorkerPayload(value);
  }

  async dispatch(input: {
    payload: SerializedSubagentWorkerPayload;
    toolName: string;
    job?: SubagentWorkerJob | null;
  }): Promise<SerializedSubagentWorkerDispatchResult> {
    const task = await this.loadTask(
      input.payload.taskId,
      input.payload.ownerUserId,
    );
    const state = createSocialAgentRouteTurnState(
      this.string(input.payload.state?.assistantMessage) ??
        '我会先按安全边界处理这一步。',
    );
    if (input.toolName === 'life_graph_conversation_turn') {
      return this.runConversationBranch(input.payload, task, state);
    }
    if (input.toolName === 'life_graph_profile_turn') {
      return this.runProfileBranch(input.payload, task, state);
    }
    if (input.toolName === 'social_match_search_turn') {
      return this.runSearchBranch(input.payload, task, state);
    }
    if (input.toolName === 'meet_loop_action_turn') {
      return this.runActionBranch(input.payload, task, state);
    }
    return {
      task,
      state,
      observation: {
        branch: input.toolName,
        handled: false,
        error: 'unsupported_serialized_subagent_tool',
      },
    };
  }

  private async runConversationBranch(
    payload: SerializedSubagentWorkerPayload,
    task: AgentTask,
    state: SocialAgentRouteTurnState,
  ): Promise<SerializedSubagentWorkerDispatchResult> {
    const turn = await this.conversationTurns.handle({
      ownerUserId: payload.ownerUserId,
      task,
      message: payload.goal,
      route: payload.route,
      profile: payload.profile ?? null,
      longTermSnapshot: payload.longTermSnapshot ?? null,
      brainToolResults: payload.brainToolResults ?? [],
    });
    return {
      task: turn.task,
      state: turn.handled ? applyConversationTurnState(state, turn) : state,
      observation: {
        branch: 'conversation',
        handled: turn.handled,
        assistantStreamed: false,
        savedContext: turn.savedContext,
        profileUpdated: turn.profileUpdated,
      },
    };
  }

  private async runProfileBranch(
    payload: SerializedSubagentWorkerPayload,
    task: AgentTask,
    state: SocialAgentRouteTurnState,
  ): Promise<SerializedSubagentWorkerDispatchResult> {
    const turn = await this.profileTurns.handle({
      ownerUserId: payload.ownerUserId,
      task,
      message: payload.goal,
      route: payload.route,
    });
    return {
      task: turn.task,
      state: turn.handled ? applyProfileTurnState(state, turn) : state,
      observation: {
        branch: 'profile',
        handled: turn.handled,
        savedContext: turn.savedContext,
        profileUpdated: turn.profileUpdated,
        hasProposal: Boolean(turn.profileUpdateProposal),
      },
    };
  }

  private async runSearchBranch(
    payload: SerializedSubagentWorkerPayload,
    task: AgentTask,
    state: SocialAgentRouteTurnState,
  ): Promise<SerializedSubagentWorkerDispatchResult> {
    const turn = await this.searchTurns.handle({
      ownerUserId: payload.ownerUserId,
      task,
      route: payload.route,
      message: payload.goal,
      buildMemoryContext: (currentTask) =>
        this.routeContext.buildMemoryContext(currentTask, null),
      queueInitialSearchForTask: (_ownerUserId, currentTask, goal) =>
        this.initialSearchQueue.queueInitialSearchForTask({
          ownerUserId: payload.ownerUserId,
          task: currentTask,
          goal,
        }),
      replanAndRefresh: (_ownerUserId, taskId, body) =>
        this.replanFacade.replanAndRefresh(payload.ownerUserId, taskId, body),
    });
    return {
      task,
      state: turn.handled ? applySearchTurnState(state, turn) : state,
      observation: {
        branch: 'search',
        handled: turn.handled,
        queuedRun: turn.queuedRun?.runId ?? null,
        runMode: turn.runMode,
        activityResultCount: turn.activityResults.length,
      },
    };
  }

  private async runActionBranch(
    payload: SerializedSubagentWorkerPayload,
    task: AgentTask,
    state: SocialAgentRouteTurnState,
  ): Promise<SerializedSubagentWorkerDispatchResult> {
    const actionTurn = await this.actionTurns.handle({
      ownerUserId: payload.ownerUserId,
      task,
      route: payload.route,
      message: payload.goal,
      assistantMessage: state.assistantMessage,
    });
    return {
      task,
      state: {
        ...state,
        assistantMessage: actionTurn.assistantMessage,
      },
      actionTurn,
      observation: {
        branch: 'action',
        handled: actionTurn.handled,
        pendingApprovalId: actionTurn.pendingApproval?.id ?? null,
        requiresConfirmation: Boolean(actionTurn.pendingApproval),
      },
    };
  }

  private async loadTask(
    taskId: number,
    ownerUserId: number,
  ): Promise<AgentTask> {
    const task = await this.taskRepo.findOne({
      where: { id: taskId, ownerUserId },
    });
    if (!task) throw new NotFoundException(`Agent task ${taskId} not found`);
    return task;
  }

  private string(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }
}
