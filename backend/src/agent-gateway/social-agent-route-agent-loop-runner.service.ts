import { Injectable, Optional } from '@nestjs/common';

import { AgentTask } from './entities/agent-task.entity';
import type {
  AgentLoopRun,
  AgentLoopStep,
  AgentLoopToolPlan,
  SubagentHandoffResult,
} from './agent-loop.types';
import { AgentLoopService } from './agent-loop.service';
import { FitMeetSubagentRuntimeService } from './fitmeet-subagent-runtime.service';
import { FitMeetSubagentWorkerService } from './fitmeet-subagent-worker.service';
import type { FitMeetAlphaAgentName } from './fitmeet-alpha-agent.types';
import type {
  SocialAgentAsyncRunSnapshot,
  SocialAgentChatReplanRunBody,
  StreamEmit,
} from './social-agent-chat.types';
import { SocialAgentRouteContextService } from './social-agent-route-context.service';
import { SocialAgentTaskLifecycleService } from './social-agent-task-lifecycle.service';
import { SocialAgentRouteConversationTurnService } from './social-agent-route-conversation-turn.service';
import { SocialAgentRouteProfileTurnService } from './social-agent-route-profile-turn.service';
import { SocialAgentRouteSearchTurnService } from './social-agent-route-search-turn.service';
import { SocialAgentRouteActionTurnService } from './social-agent-route-action-turn.service';
import { SocialAgentRouteDecisionService } from './social-agent-route-decision.service';
import {
  applyConversationTurnState,
  applyProfileTurnState,
  applySearchTurnState,
  createSocialAgentRouteTurnState,
  type SocialAgentRouteTurnState,
} from './social-agent-route-turn-state';

type RouteBranchToolName =
  | 'route_conversation_turn'
  | 'route_profile_turn'
  | 'route_search_turn'
  | 'route_action_turn';

type RouteDecision = Awaited<
  ReturnType<SocialAgentRouteDecisionService['prepare']>
>;
type RouteBranchActionTurn = Awaited<
  ReturnType<SocialAgentRouteActionTurnService['handle']>
>;
type RouteBranchExecutionResult = {
  task: AgentTask;
  state: SocialAgentRouteTurnState;
  actionTurn?: RouteBranchActionTurn;
  observation: Record<string, unknown>;
  handoff?: SubagentHandoffResult;
};

type QueueInitialSearchForTask = (
  ownerUserId: number,
  task: AgentTask,
  goal: string,
) => Promise<SocialAgentAsyncRunSnapshot>;

type ReplanAndRefresh = (
  ownerUserId: number,
  taskId: number,
  body: SocialAgentChatReplanRunBody,
) => Promise<SocialAgentAsyncRunSnapshot>;

@Injectable()
export class SocialAgentRouteAgentLoopRunnerService {
  constructor(
    private readonly taskLifecycle: SocialAgentTaskLifecycleService,
    private readonly routeContext: SocialAgentRouteContextService,
    private readonly conversationTurns: SocialAgentRouteConversationTurnService,
    private readonly profileTurns: SocialAgentRouteProfileTurnService,
    private readonly searchTurns: SocialAgentRouteSearchTurnService,
    private readonly actionTurns: SocialAgentRouteActionTurnService,
    @Optional()
    private readonly subagentWorker?: FitMeetSubagentWorkerService,
    @Optional() private readonly agentLoop?: AgentLoopService,
    @Optional() private readonly subagents?: FitMeetSubagentRuntimeService,
  ) {}

  async run(input: {
    ownerUserId: number;
    task: AgentTask;
    state: SocialAgentRouteTurnState;
    message: string;
    decision: RouteDecision;
    emit?: StreamEmit;
    signal?: AbortSignal | null;
    replanAndRefresh: ReplanAndRefresh;
    queueInitialSearchForTask: QueueInitialSearchForTask;
  }): Promise<{
    task: AgentTask;
    state: SocialAgentRouteTurnState;
    loop: AgentLoopRun;
    actionTurn: RouteBranchActionTurn;
    subagentHandoffs: SubagentHandoffResult[];
  }> {
    const loopService = this.agentLoop ?? new AgentLoopService();
    const { ownerUserId, message, decision } = input;
    const { route, profile, longTermSnapshot, brainToolResults } = decision;
    let task = input.task;
    let state = input.state;
    const observations: Array<Record<string, unknown>> = [];
    let actionTurn: RouteBranchActionTurn = {
      handled: false,
      assistantMessage: state.assistantMessage,
      pendingApproval: null,
    };
    const workerHandoffs: SubagentHandoffResult[] = [];
    const execution = await loopService.execute({
      taskId: task.id,
      goal: message,
      agent: 'FitMeet Main Agent',
      plan: {
        reason:
          decision.brainDecision?.reason ??
          'Route turn branches are executed through AgentLoop.',
        tools: this.routeBranchTools(decision),
      },
      maxToolCalls: 4,
      maxRetries: 0,
      signal: input.signal,
      emit: (event) => {
        void this.emitLoopStep(input.emit, event.step);
      },
      runner: async ({ toolName }) => {
        const branch = await this.runRouteBranchTool({
          toolName: toolName as RouteBranchToolName,
          ownerUserId,
          task,
          state,
          message,
          route,
          profile,
          longTermSnapshot,
          brainToolResults,
          emit: input.emit,
          signal: input.signal,
          replanAndRefresh: input.replanAndRefresh,
          queueInitialSearchForTask: input.queueInitialSearchForTask,
        });
        task = branch.task;
        state = branch.state;
        if (branch.actionTurn) actionTurn = branch.actionTurn;
        if (branch.handoff && branch.observation.handled === true) {
          workerHandoffs.push(branch.handoff);
        }
        observations.push(branch.observation);
        return branch.observation;
      },
    });

    return {
      task,
      state: { ...state, agentLoop: execution.loop },
      loop: execution.loop,
      actionTurn,
      subagentHandoffs: [
        ...workerHandoffs,
        ...this.handoffsFromObservations({
          ownerUserId,
          taskId: task.id,
          message,
          decision,
          observations: observations.filter(
            (observation) => observation.subagentWorker !== true,
          ),
        }),
      ],
    };
  }

  private async runRouteBranchTool(input: {
    toolName: RouteBranchToolName;
    ownerUserId: number;
    task: AgentTask;
    state: SocialAgentRouteTurnState;
    message: string;
    route: RouteDecision['route'];
    profile: RouteDecision['profile'];
    longTermSnapshot: RouteDecision['longTermSnapshot'];
    brainToolResults: Array<Record<string, unknown>>;
    emit?: StreamEmit;
    signal?: AbortSignal | null;
    replanAndRefresh: ReplanAndRefresh;
    queueInitialSearchForTask: QueueInitialSearchForTask;
  }): Promise<{
    task: AgentTask;
    state: SocialAgentRouteTurnState;
    actionTurn?: RouteBranchActionTurn;
    observation: Record<string, unknown>;
    handoff?: SubagentHandoffResult;
  }> {
    if (input.toolName === 'route_conversation_turn') {
      if (this.shouldRunWorkerForBranch(input.toolName, input.route)) {
        return this.runWorkerBranch(input, {
          agent: 'Life Graph Agent',
          workerToolName: 'life_graph_conversation_turn',
          memoryScope: 'life_graph.worker_conversation_turn',
          run: () => this.runConversationBranch(input),
        });
      }
      return this.runConversationBranch(input);
    }
    if (input.toolName === 'route_profile_turn') {
      if (!this.shouldRunWorkerForBranch(input.toolName, input.route)) {
        return this.runProfileBranch(input);
      }
      return this.runWorkerBranch(input, {
        agent: 'Life Graph Agent',
        workerToolName: 'life_graph_profile_turn',
        memoryScope: 'life_graph.worker_profile_turn',
        run: () => this.runProfileBranch(input),
      });
    }
    if (input.toolName === 'route_search_turn') {
      if (!this.shouldRunWorkerForBranch(input.toolName, input.route)) {
        return this.runSearchBranch(input);
      }
      return this.runWorkerBranch(input, {
        agent: 'Social Match Agent',
        workerToolName: 'social_match_search_turn',
        memoryScope: 'matching.worker_search_turn',
        run: () => this.runSearchBranch(input),
      });
    }
    if (!this.shouldRunWorkerForBranch(input.toolName, input.route)) {
      return this.runActionBranch(input);
    }
    return this.runWorkerBranch(input, {
      agent: 'Meet Loop Agent',
      workerToolName: 'meet_loop_action_turn',
      memoryScope: 'meet_loop.worker_action_turn',
      run: () => this.runActionBranch(input),
    });
  }

  private async runConversationBranch(input: {
    ownerUserId: number;
    task: AgentTask;
    state: SocialAgentRouteTurnState;
    message: string;
    route: RouteDecision['route'];
    profile: RouteDecision['profile'];
    longTermSnapshot: RouteDecision['longTermSnapshot'];
    brainToolResults: Array<Record<string, unknown>>;
    emit?: StreamEmit;
    signal?: AbortSignal | null;
  }): Promise<{
    task: AgentTask;
    state: SocialAgentRouteTurnState;
    observation: Record<string, unknown>;
  }> {
    const turn = await this.conversationTurns.handle(input);
    return {
      task: turn.task,
      state: turn.handled
        ? applyConversationTurnState(input.state, turn)
        : input.state,
      observation: {
        branch: 'conversation',
        handled: turn.handled,
        assistantStreamed: turn.assistantStreamed ?? false,
        savedContext: turn.savedContext,
        profileUpdated: turn.profileUpdated,
      },
    };
  }

  private async runProfileBranch(input: {
    ownerUserId: number;
    task: AgentTask;
    state: SocialAgentRouteTurnState;
    message: string;
    route: RouteDecision['route'];
  }): Promise<{
    task: AgentTask;
    state: SocialAgentRouteTurnState;
    observation: Record<string, unknown>;
  }> {
    const turn = await this.profileTurns.handle(input);
    const state = turn.handled
      ? applyProfileTurnState(input.state, turn)
      : input.state;
    const task =
      turn.handled && !state.profileUpdateProposal
        ? await this.taskLifecycle.assertTaskOwner(
            turn.task.id,
            input.ownerUserId,
          )
        : turn.task;
    return {
      task,
      state,
      observation: {
        branch: 'profile',
        handled: turn.handled,
        savedContext: turn.savedContext,
        profileUpdated: turn.profileUpdated,
        hasProposal: Boolean(turn.profileUpdateProposal),
      },
    };
  }

  private async runSearchBranch(input: {
    ownerUserId: number;
    task: AgentTask;
    state: SocialAgentRouteTurnState;
    message: string;
    route: RouteDecision['route'];
    replanAndRefresh: ReplanAndRefresh;
    queueInitialSearchForTask: QueueInitialSearchForTask;
  }): Promise<{
    task: AgentTask;
    state: SocialAgentRouteTurnState;
    observation: Record<string, unknown>;
  }> {
    const turn = await this.searchTurns.handle({
      ownerUserId: input.ownerUserId,
      task: input.task,
      route: input.route,
      message: input.message,
      replanAndRefresh: input.replanAndRefresh,
      queueInitialSearchForTask: input.queueInitialSearchForTask,
      buildMemoryContext: (task) =>
        this.routeContext.buildMemoryContext(task, null),
    });
    const state = turn.handled
      ? applySearchTurnState(input.state, turn)
      : input.state;
    const task = state.queuedRun
      ? await this.taskLifecycle.assertTaskOwner(
          input.task.id,
          input.ownerUserId,
        )
      : input.task;
    return {
      task,
      state,
      observation: {
        branch: 'search',
        handled: turn.handled,
        queuedRun: turn.queuedRun?.runId ?? null,
        runMode: turn.runMode,
        activityResultCount: turn.activityResults.length,
      },
    };
  }

  private async runActionBranch(input: {
    ownerUserId: number;
    task: AgentTask;
    state: SocialAgentRouteTurnState;
    message: string;
    route: RouteDecision['route'];
  }): Promise<{
    task: AgentTask;
    state: SocialAgentRouteTurnState;
    actionTurn: RouteBranchActionTurn;
    observation: Record<string, unknown>;
  }> {
    const actionTurn = await this.actionTurns.handle({
      ownerUserId: input.ownerUserId,
      task: input.task,
      route: input.route,
      message: input.message,
      assistantMessage: input.state.assistantMessage,
    });
    return {
      task: input.task,
      state: {
        ...input.state,
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

  private async runWorkerBranch(
    input: {
      ownerUserId: number;
      task: AgentTask;
      state: SocialAgentRouteTurnState;
      message: string;
      route: RouteDecision['route'];
      profile?: RouteDecision['profile'];
      longTermSnapshot?: RouteDecision['longTermSnapshot'];
      brainToolResults?: Array<Record<string, unknown>>;
      signal?: AbortSignal | null;
    },
    options: {
      agent: FitMeetAlphaAgentName;
      workerToolName: string;
      memoryScope: string;
      run: () => Promise<RouteBranchExecutionResult>;
    },
  ): Promise<RouteBranchExecutionResult> {
    if (!this.subagentWorker) return options.run();
    let branchResult: RouteBranchExecutionResult | null = null;
    const worker = await this.subagentWorker.run({
      ownerUserId: input.ownerUserId,
      taskId: input.task.id,
      agent: options.agent,
      goal: input.message,
      plannerInput: {
        message: input.message,
        intent: input.route.intent,
        routeSource: input.route.source,
        route: input.route,
        profile: input.profile ?? null,
        longTermSnapshot: input.longTermSnapshot ?? null,
        brainToolResults: input.brainToolResults ?? [],
        assistantMessage: input.state.assistantMessage,
        branchToolName: options.workerToolName,
      },
      memoryScope: options.memoryScope,
      maxToolCalls: 1,
      maxRetries: options.agent === 'Meet Loop Agent' ? 1 : 0,
      signal: input.signal,
      tools: [
        {
          toolName: options.workerToolName,
          input: {
            taskId: input.task.id,
            intent: input.route.intent,
            message: input.message,
          },
        },
      ],
      runner: async () => {
        branchResult = await options.run();
        return {
          ...branchResult.observation,
          subagentWorker: true,
        };
      },
    });
    if (!branchResult) {
      branchResult = this.branchResultFromWorkerOutput(
        input.task,
        worker.workerOutput,
        options.workerToolName,
      );
    }
    return {
      ...branchResult,
      observation: {
        ...branchResult.observation,
        subagentWorker: true,
        subagentWorkerRunId: worker.loop.runId,
      },
      handoff: worker.handoff,
    };
  }

  private branchResultFromWorkerOutput(
    task: AgentTask,
    workerOutput: Record<string, unknown> | undefined,
    workerToolName: string,
  ): RouteBranchExecutionResult {
    const output = this.isRecord(workerOutput) ? workerOutput : {};
    return {
      task,
      state: this.isRecord(output.state)
        ? (output.state as unknown as SocialAgentRouteTurnState)
        : createSocialAgentRouteTurnState('我已经完成这一步处理。'),
      actionTurn: this.isRecord(output.actionTurn)
        ? (output.actionTurn as RouteBranchActionTurn)
        : undefined,
      observation: this.isRecord(output.observation)
        ? output.observation
        : {
            branch: workerToolName,
            handled: false,
            error: 'subagent_worker_no_observation',
            subagentWorker: true,
          },
    };
  }

  private routeBranchTools(decision: RouteDecision): AgentLoopToolPlan[] {
    return [
      this.branchTool('route_conversation_turn', decision),
      this.branchTool('route_profile_turn', decision),
      this.branchTool('route_search_turn', decision),
      this.branchTool('route_action_turn', decision),
    ];
  }

  private shouldRunWorkerForBranch(
    toolName: RouteBranchToolName,
    route: RouteDecision['route'],
  ): boolean {
    if (toolName === 'route_conversation_turn') {
      return (
        route.intent === 'profile_enrichment' ||
        route.intent === 'profile_enrichment_request' ||
        route.intent === 'correction_or_clarification'
      );
    }
    if (toolName === 'route_profile_turn') {
      return (
        route.intent === 'profile_update' ||
        route.intent === 'safety_or_boundary'
      );
    }
    if (toolName === 'route_search_turn') {
      return (
        route.intent === 'social_search' ||
        route.intent === 'activity_search' ||
        route.intent === 'candidate_followup'
      );
    }
    if (toolName === 'route_action_turn') {
      return route.intent === 'action_request';
    }
    return false;
  }

  private branchTool(
    toolName: RouteBranchToolName,
    decision: RouteDecision,
  ): AgentLoopToolPlan {
    return {
      agent: this.agentForBranch(toolName, decision),
      toolName,
      input: { intent: decision.route.intent },
    };
  }

  private agentForBranch(
    toolName: RouteBranchToolName,
    decision: RouteDecision,
  ): AgentLoopToolPlan['agent'] {
    if (toolName === 'route_profile_turn') return 'Life Graph Agent';
    if (toolName === 'route_search_turn') return 'Social Match Agent';
    if (toolName === 'route_action_turn') return 'Meet Loop Agent';
    if (decision.route.intent === 'fitness_math') return 'Math Agent';
    return 'Agent Brain';
  }

  private handoffsFromObservations(input: {
    ownerUserId: number;
    taskId: number;
    message: string;
    decision: RouteDecision;
    observations: Array<Record<string, unknown>>;
  }): SubagentHandoffResult[] {
    if (!this.subagents) return [];
    return input.observations
      .filter((observation) => observation.handled === true)
      .map((observation) =>
        this.subagents!.handoffFromObservation({
          ownerUserId: input.ownerUserId,
          taskId: input.taskId,
          message: input.message,
          route: input.decision.route,
          brainDecision: input.decision.brainDecision,
          observation,
        }),
      );
  }

  private async emitLoopStep(
    emit: StreamEmit | undefined,
    step: AgentLoopStep,
  ): Promise<void> {
    await emit?.({
      type: 'step',
      step: {
        id: `agent_loop.${step.phase}.${step.toolName ?? step.agent}`,
        label: this.loopStepLabel(step),
        status:
          step.status === 'failed'
            ? 'failed'
            : step.status === 'running'
              ? 'running'
              : 'done',
      },
    });
  }

  private loopStepLabel(step: AgentLoopStep): string {
    if (step.phase === 'tool') return `执行 ${step.toolName ?? step.agent}`;
    if (step.phase === 'observe') return `观察 ${step.toolName ?? step.agent}`;
    if (step.phase === 'replan') return '根据结果重新规划';
    if (step.phase === 'answer') return '生成最终回复';
    return '理解用户需求';
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }
}
