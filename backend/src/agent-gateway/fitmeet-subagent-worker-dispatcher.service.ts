import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { AgentLoopRun } from './agent-loop.types';
import { AgentLoopService } from './agent-loop.service';
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
import type { SocialAgentHydratedContext } from './social-agent-context-hydrator.service';
import { buildSocialAgentKnownTaskSlotConstraints } from './social-agent-task-slot-constraints.presenter';
import { SocialAgentRouteConversationTurnService } from './social-agent-route-conversation-turn.service';
import { SocialAgentRouteProfileTurnService } from './social-agent-route-profile-turn.service';
import { SocialAgentRouteSearchTurnService } from './social-agent-route-search-turn.service';
import { SocialAgentRouteActionTurnService } from './social-agent-route-action-turn.service';
import { SocialAgentInitialSearchQueueService } from './social-agent-initial-search-queue.service';
import { SocialAgentReplanFacadeService } from './social-agent-replan-facade.service';
import type { SocialAgentSlotKey } from './social-agent-task-memory-state-machine.service';
import type { FitMeetAlphaAgentName } from './fitmeet-alpha-agent.types';
import { shouldAllowSocialExecution } from './social-agent-social-intent-gate';
import { SOCIAL_AGENT_QUALITY_TOOL_TIMEOUT_MS } from './social-agent-model-router.service';

export type SerializedSubagentWorkerPayload = LegacySubagentRouteBranchPayload;

export type SerializedSubagentWorkerDispatchResult = {
  task: AgentTask;
  state: SocialAgentRouteTurnState;
  actionTurn?: Awaited<ReturnType<SocialAgentRouteActionTurnService['handle']>>;
  observation: Record<string, unknown>;
  loop?: AgentLoopRun;
};

type SerializedSubagentWorkerBranchTool =
  | 'life_graph_conversation_turn'
  | 'life_graph_profile_turn'
  | 'social_match_search_turn'
  | 'meet_loop_action_turn';

type SerializedSubagentLoopTool =
  | 'route_conversation_turn'
  | 'route_profile_turn'
  | 'route_search_turn'
  | 'route_action_turn';

const CONTEXT_STATE_SLOT_ORDER: Array<{
  key: SocialAgentSlotKey;
  label: string;
}> = [
  { key: 'time_window', label: '时间' },
  { key: 'activity', label: '活动' },
  { key: 'location_text', label: '地点' },
  { key: 'geo_area', label: '区域' },
  { key: 'candidate_preference', label: '候选偏好' },
  { key: 'safety_boundary', label: '安全边界' },
];

const GENERIC_WORKER_ASSISTANT_MESSAGES = [
  '我会继续处理',
  '我会继续帮你找',
  '我会按这些信息继续',
  '我会继续按已补齐的信息找',
  '我会先按安全边界处理当前进度',
];

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
    @Optional()
    private readonly agentLoop?: AgentLoopService,
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
    signal?: AbortSignal | null;
  }): Promise<SerializedSubagentWorkerDispatchResult> {
    this.assertNotAborted(input.signal);
    const task = await this.loadTask(
      input.payload.taskId,
      input.payload.ownerUserId,
    );
    this.assertNotAborted(input.signal);
    const state = createSocialAgentRouteTurnState(
      this.assistantStateMessageForPayload(input.payload, input.toolName),
    );
    const branchTool = this.serializedBranchToolName(input.toolName);
    if (branchTool) {
      return this.runBranchThroughAgentLoop({
        toolName: branchTool,
        payload: input.payload,
        task,
        state,
        job: input.job ?? null,
        signal: input.signal ?? null,
      });
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

  private async runBranchThroughAgentLoop(input: {
    toolName: SerializedSubagentWorkerBranchTool;
    payload: SerializedSubagentWorkerPayload;
    task: AgentTask;
    state: SocialAgentRouteTurnState;
    job?: SubagentWorkerJob | null;
    signal?: AbortSignal | null;
  }): Promise<SerializedSubagentWorkerDispatchResult> {
    let branchResult: SerializedSubagentWorkerDispatchResult | null = null;
    const loopToolName = this.loopToolNameForWorkerTool(input.toolName);
    const agent = this.agentForWorkerTool(input.toolName, input.payload);
    const loopResult = await this.loopRuntime().execute({
      taskId: input.task.id,
      goal: input.payload.goal,
      agent,
      traceId:
        this.string(input.payload.traceId) ??
        this.string(input.payload.runId) ??
        this.string(input.job?.traceId),
      maxToolCalls: 1,
      maxRetries: 0,
      timeoutMs:
        this.positiveInt(input.payload.timeoutMs) ??
        this.positiveInt(input.payload.workerRuntime?.timeoutMs) ??
        SOCIAL_AGENT_QUALITY_TOOL_TIMEOUT_MS,
      signal: input.signal ?? null,
      plan: {
        reason:
          'Serialized subagent worker branch executes through the unified AgentLoop.',
        tools: [
          {
            agent,
            toolName: loopToolName,
            input: this.loopToolInput({
              toolName: input.toolName,
              payload: input.payload,
              job: input.job ?? null,
            }),
            requiresApproval: false,
          },
        ],
      },
      runner: async () => {
        branchResult = await this.runBranchDirect(
          input.toolName,
          input.payload,
          input.task,
          input.state,
          input.signal ?? null,
        );
        return branchResult.observation;
      },
    });

    const result =
      branchResult ??
      ({
        task: input.task,
        state: input.state,
        observation: {
          branch: input.toolName,
          handled: false,
          error: 'serialized_subagent_worker_branch_did_not_return',
        },
      } satisfies SerializedSubagentWorkerDispatchResult);
    const loopObservation = this.agentLoopObservation(
      loopResult.loop,
      input.toolName,
      loopToolName,
    );
    return {
      ...result,
      loop: loopResult.loop,
      state: {
        ...result.state,
        agentLoop: loopResult.loop,
      },
      observation: {
        ...result.observation,
        agentLoop: loopObservation,
      },
    };
  }

  private runBranchDirect(
    toolName: SerializedSubagentWorkerBranchTool,
    payload: SerializedSubagentWorkerPayload,
    task: AgentTask,
    state: SocialAgentRouteTurnState,
    signal?: AbortSignal | null,
  ): Promise<SerializedSubagentWorkerDispatchResult> {
    const blocked = this.blockedWorkerBranch(toolName, payload, task, state);
    if (blocked) return Promise.resolve(blocked);
    if (toolName === 'life_graph_conversation_turn') {
      return this.runConversationBranch(payload, task, state, signal);
    }
    if (toolName === 'life_graph_profile_turn') {
      return this.runProfileBranch(payload, task, state, signal);
    }
    if (toolName === 'social_match_search_turn') {
      return this.runSearchBranch(payload, task, state, signal);
    }
    return this.runActionBranch(payload, task, state, signal);
  }

  private blockedWorkerBranch(
    toolName: SerializedSubagentWorkerBranchTool,
    payload: SerializedSubagentWorkerPayload,
    task: AgentTask,
    state: SocialAgentRouteTurnState,
  ): SerializedSubagentWorkerDispatchResult | null {
    if (
      toolName === 'social_match_search_turn' &&
      !this.shouldExecuteSearchWorkerBranch(payload)
    ) {
      return this.skippedWorkerBranch(task, state, {
        branch: 'search',
        workerToolName: toolName,
        reason: 'social_intent_gate_blocked',
      });
    }
    if (
      toolName === 'meet_loop_action_turn' &&
      !this.shouldExecuteActionWorkerBranch(payload)
    ) {
      return this.skippedWorkerBranch(task, state, {
        branch: 'action',
        workerToolName: toolName,
        reason: 'side_effect_intent_gate_blocked',
      });
    }
    return null;
  }

  private skippedWorkerBranch(
    task: AgentTask,
    state: SocialAgentRouteTurnState,
    output: {
      branch: 'search' | 'action';
      workerToolName: SerializedSubagentWorkerBranchTool;
      reason: string;
    },
  ): SerializedSubagentWorkerDispatchResult {
    return {
      task,
      state,
      observation: {
        branch: output.branch,
        handled: false,
        workerToolName: output.workerToolName,
        reason: output.reason,
        skipped: true,
        subagentWorkerPolicy: 'blocked_before_branch_execution',
      },
    };
  }

  private shouldExecuteSearchWorkerBranch(
    payload: SerializedSubagentWorkerPayload,
  ): boolean {
    const intent = this.string(payload.route.intent);
    if (
      intent !== 'social_search' &&
      intent !== 'activity_search' &&
      intent !== 'candidate_followup'
    ) {
      return false;
    }
    if (
      payload.route.shouldSearch !== true &&
      payload.route.shouldReplan !== true &&
      intent !== 'candidate_followup'
    ) {
      return false;
    }
    return shouldAllowSocialExecution({
      message: payload.goal,
      intent,
      taskContext: this.taskContextForIntentGate(payload),
    });
  }

  private shouldExecuteActionWorkerBranch(
    payload: SerializedSubagentWorkerPayload,
  ): boolean {
    if (
      payload.route.intent !== 'action_request' ||
      payload.route.shouldExecuteAction !== true
    ) {
      return false;
    }
    return shouldAllowSocialExecution({
      message: payload.goal,
      intent: payload.route.intent,
      taskContext: this.taskContextForIntentGate(payload, {
        sideEffect: true,
      }),
    });
  }

  private taskContextForIntentGate(
    payload: SerializedSubagentWorkerPayload,
    options?: { sideEffect?: boolean },
  ):
    | Parameters<typeof shouldAllowSocialExecution>[0]['taskContext']
    | undefined {
    const snapshot = this.recordOrNull(payload.contextSnapshot);
    const taskContext =
      this.recordOrNull(payload.taskContext) ??
      this.recordOrNull(snapshot?.taskContext);
    const taskMemory =
      this.recordOrNull(snapshot?.taskMemory) ??
      this.recordOrNull(taskContext?.taskMemory);
    const taskSlots =
      this.recordOrNull(snapshot?.taskSlots) ??
      this.recordOrNull(taskContext?.taskSlots) ??
      this.recordOrNull(taskMemory?.taskSlots);
    const candidateActions =
      this.recordOrNull(snapshot?.candidateActions) ??
      this.recordOrNull(snapshot?.['candidateState']) ??
      this.recordOrNull(taskContext?.candidateActions) ??
      this.recordOrNull(taskContext?.candidateState) ??
      this.recordOrNull(taskMemory?.candidateActions) ??
      this.recordOrNull(taskMemory?.candidateState);
    if (!taskContext && !taskSlots && !candidateActions) return undefined;
    const hasTaskSlotContext = Boolean(
      taskSlots && Object.keys(taskSlots).length > 0,
    );
    return {
      ...(taskContext ?? {}),
      hasSearchContext:
        taskContext?.hasSearchContext === true ||
        (!options?.sideEffect && hasTaskSlotContext),
      hasCandidates:
        taskContext?.hasCandidates === true ||
        Boolean(candidateActions && Object.keys(candidateActions).length > 0),
    } as Parameters<typeof shouldAllowSocialExecution>[0]['taskContext'];
  }

  private async runConversationBranch(
    payload: SerializedSubagentWorkerPayload,
    task: AgentTask,
    state: SocialAgentRouteTurnState,
    signal?: AbortSignal | null,
  ): Promise<SerializedSubagentWorkerDispatchResult> {
    const turn = await this.conversationTurns.handle({
      ownerUserId: payload.ownerUserId,
      task,
      message: payload.goal,
      route: payload.route,
      profile: payload.profile ?? null,
      longTermSnapshot: payload.longTermSnapshot ?? null,
      hydratedContext: this.hydratedContextFromPayload(payload),
      brainToolResults: payload.brainToolResults ?? [],
      signal: signal ?? null,
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
    signal?: AbortSignal | null,
  ): Promise<SerializedSubagentWorkerDispatchResult> {
    const turn = await this.profileTurns.handle({
      ownerUserId: payload.ownerUserId,
      task,
      message: payload.goal,
      route: payload.route,
      hydratedContext: this.hydratedContextFromPayload(payload),
      signal: signal ?? null,
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
    signal?: AbortSignal | null,
  ): Promise<SerializedSubagentWorkerDispatchResult> {
    const turn = await this.searchTurns.handle({
      ownerUserId: payload.ownerUserId,
      task,
      route: payload.route,
      message: payload.goal,
      signal: signal ?? null,
      buildMemoryContext: (currentTask) =>
        this.buildMemoryContextFromPayload(currentTask, payload),
      queueInitialSearchForTask: (_ownerUserId, currentTask, goal, options) =>
        this.initialSearchQueue.queueInitialSearchForTask({
          ownerUserId: payload.ownerUserId,
          task: currentTask,
          goal,
          signal: options?.signal ?? signal ?? null,
          waitForCompletionMs: options?.waitForCompletionMs,
        }),
      replanAndRefresh: (_ownerUserId, taskId, body) =>
        this.replanFacade.replanAndRefresh(payload.ownerUserId, taskId, body, {
          signal: signal ?? null,
        }),
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
    signal?: AbortSignal | null,
  ): Promise<SerializedSubagentWorkerDispatchResult> {
    const actionTurn = await this.actionTurns.handle({
      ownerUserId: payload.ownerUserId,
      task,
      route: payload.route,
      message: payload.goal,
      assistantMessage: state.assistantMessage,
      signal: signal ?? null,
      runtimeContext: {
        taskContext: payload.taskContext ?? null,
        hydratedContext: this.hydratedContextFromPayload(payload),
        profile: payload.profile ?? null,
        longTermSnapshot: payload.longTermSnapshot ?? null,
        brainToolResults: payload.brainToolResults ?? [],
        resumeContext: null,
      },
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
        hasTaskContext: Boolean(payload.taskContext),
        hasLongTermMemoryContext: Boolean(payload.longTermSnapshot),
        brainToolResultCount: payload.brainToolResults?.length ?? 0,
      },
    };
  }

  private serializedBranchToolName(
    toolName: string,
  ): SerializedSubagentWorkerBranchTool | null {
    if (
      toolName === 'life_graph_conversation_turn' ||
      toolName === 'life_graph_profile_turn' ||
      toolName === 'social_match_search_turn' ||
      toolName === 'meet_loop_action_turn'
    ) {
      return toolName;
    }
    return null;
  }

  private loopToolNameForWorkerTool(
    toolName: SerializedSubagentWorkerBranchTool,
  ): SerializedSubagentLoopTool {
    if (toolName === 'life_graph_conversation_turn') {
      return 'route_conversation_turn';
    }
    if (toolName === 'life_graph_profile_turn') {
      return 'route_profile_turn';
    }
    if (toolName === 'social_match_search_turn') {
      return 'route_search_turn';
    }
    return 'route_action_turn';
  }

  private agentForWorkerTool(
    toolName: SerializedSubagentWorkerBranchTool,
    payload: SerializedSubagentWorkerPayload,
  ): FitMeetAlphaAgentName {
    if (payload.agent) return payload.agent;
    if (
      toolName === 'life_graph_conversation_turn' ||
      toolName === 'life_graph_profile_turn'
    ) {
      return 'Life Graph Agent';
    }
    if (toolName === 'social_match_search_turn') return 'Match Agent';
    return 'Match Agent';
  }

  private loopToolInput(input: {
    toolName: SerializedSubagentWorkerBranchTool;
    payload: SerializedSubagentWorkerPayload;
    job?: SubagentWorkerJob | null;
  }): Record<string, unknown> {
    return {
      workerToolName: input.toolName,
      taskId: input.payload.taskId,
      ownerUserId: input.payload.ownerUserId,
      runId: this.string(input.payload.runId) ?? null,
      traceId: this.string(input.payload.traceId) ?? null,
      queueName:
        this.string(input.job?.queueName) ??
        this.string(input.payload.workerRuntime?.queueName) ??
        null,
      workerMode: this.string(input.payload.workerRuntime?.mode) ?? null,
      memoryScope: this.string(input.payload.memoryScope) ?? null,
      routeIntent: input.payload.route.intent,
      replyStrategy: input.payload.route.replyStrategy,
      shouldSearch: input.payload.route.shouldSearch,
      shouldUpdateProfile: input.payload.route.shouldUpdateProfile,
      shouldExecuteAction: input.payload.route.shouldExecuteAction,
      hasHydratedContext: Boolean(
        input.payload.contextSnapshot ?? input.payload.taskContext,
      ),
      brainToolResultCount: input.payload.brainToolResults?.length ?? 0,
    };
  }

  private agentLoopObservation(
    loop: AgentLoopRun,
    workerToolName: SerializedSubagentWorkerBranchTool,
    loopToolName: SerializedSubagentLoopTool,
  ): Record<string, unknown> {
    return {
      runId: loop.runId,
      traceId: loop.traceId,
      status: loop.status,
      workerToolName,
      toolName: loopToolName,
      stepCount: loop.steps.length,
      usedToolCalls: loop.toolBudget?.usedToolCalls ?? null,
    };
  }

  private loopRuntime(): AgentLoopService {
    return this.agentLoop ?? new AgentLoopService();
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

  private assertNotAborted(signal?: AbortSignal | null): void {
    if (signal?.aborted) throw new Error('Subagent worker job cancelled.');
  }

  private string(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null;
  }

  private positiveInt(value: unknown): number | null {
    return typeof value === 'number' && Number.isInteger(value) && value > 0
      ? value
      : null;
  }

  private assistantStateMessageForPayload(
    payload: SerializedSubagentWorkerPayload,
    toolName: string,
  ): string {
    const provided = this.string(payload.state?.assistantMessage);
    if (provided && !this.isGenericAssistantStateMessage(provided)) {
      return provided;
    }

    const contextItems = this.contextStateItems(
      this.hydratedContextFromPayload(payload),
    );
    const contextText = contextItems.length
      ? `已确认的信息（${contextItems.join('、')}）`
      : null;

    if (
      toolName === 'meet_loop_action_turn' ||
      payload.route.shouldExecuteAction ||
      payload.route.intent === 'action_request'
    ) {
      return contextText
        ? `我会基于${contextText}准备确认卡片；你确认前不会联系对方。`
        : '我会先准备确认卡片；你确认前不会联系对方。';
    }

    if (
      toolName === 'social_match_search_turn' ||
      payload.route.shouldSearch ||
      payload.route.intent === 'social_search'
    ) {
      return contextText
        ? `我会按${contextText}继续筛选公开可发现的人。`
        : '我会继续筛选公开可发现的人。';
    }

    if (
      toolName === 'life_graph_profile_turn' ||
      payload.route.shouldUpdateProfile
    ) {
      return contextText
        ? `我会根据${contextText}整理画像提案，保存前会让你确认。`
        : '我会整理画像提案，保存前会让你确认。';
    }

    return contextText
      ? `我会基于${contextText}继续回答。`
      : '我会基于已有上下文继续回答。';
  }

  private isGenericAssistantStateMessage(value: string): boolean {
    const normalized = value.replace(/\s+/g, '').replace(/[，。！？!?,.]/g, '');
    return GENERIC_WORKER_ASSISTANT_MESSAGES.some(
      (message) => normalized === message,
    );
  }

  private contextStateItems(
    hydrated: SocialAgentHydratedContext | null,
  ): string[] {
    if (!hydrated) return [];
    return CONTEXT_STATE_SLOT_ORDER.map(({ key, label }) => {
      const slot = this.recordOrNull(hydrated.taskSlots?.[key]);
      const value =
        this.string(slot?.value) ??
        this.string(hydrated.taskSlotSummary?.[label]);
      return value ? `${label}：${value}` : null;
    })
      .filter((item): item is string => Boolean(item))
      .slice(0, 5);
  }

  private buildMemoryContextFromPayload(
    task: AgentTask,
    payload: SerializedSubagentWorkerPayload,
  ) {
    const hydrated = this.hydratedContextFromPayload(payload);
    return hydrated
      ? this.routeContext.buildMemoryContext(
          task,
          payload.longTermSnapshot ?? null,
          hydrated,
        )
      : this.routeContext.buildMemoryContext(
          task,
          payload.longTermSnapshot ?? null,
        );
  }

  private hydratedContextFromPayload(
    payload: SerializedSubagentWorkerPayload,
  ): SocialAgentHydratedContext | null {
    const snapshot = this.isRecord(payload.contextSnapshot)
      ? payload.contextSnapshot
      : this.isRecord(payload.taskContext)
        ? payload.taskContext
        : null;
    if (!snapshot) return null;
    const nestedTaskContext = this.recordOrNull(snapshot.taskContext);
    const payloadTaskContext = this.recordOrNull(payload.taskContext);
    const recentMessages = this.recordArray(
      snapshot.recentMessages ??
        snapshot['conversationHistory'] ??
        nestedTaskContext?.recentMessages ??
        nestedTaskContext?.conversationHistory ??
        payloadTaskContext?.recentMessages ??
        payloadTaskContext?.conversationHistory,
    );
    const taskMemory =
      this.recordOrNull(snapshot.taskMemory) ??
      this.recordOrNull(nestedTaskContext?.taskMemory) ??
      this.recordOrNull(payloadTaskContext?.taskMemory);
    const taskSlots = this.recordOrEmpty(
      snapshot.taskSlots ??
        nestedTaskContext?.taskSlots ??
        payloadTaskContext?.taskSlots ??
        taskMemory?.taskSlots,
    );
    const taskSlotSummary =
      this.recordOrNull(snapshot.taskSlotSummary) ??
      this.recordOrNull(nestedTaskContext?.taskSlotSummary) ??
      this.recordOrNull(payloadTaskContext?.taskSlotSummary) ??
      this.recordOrNull(taskMemory?.taskSlotSummary) ??
      {};
    const knownTaskSlotConstraints = (this.recordOrNull(
      snapshot.knownTaskSlotConstraints,
    ) ??
      this.recordOrNull(nestedTaskContext?.knownTaskSlotConstraints) ??
      this.recordOrNull(payloadTaskContext?.knownTaskSlotConstraints) ??
      this.recordOrNull(taskMemory?.knownTaskSlotConstraints) ??
      buildSocialAgentKnownTaskSlotConstraints(taskSlots)) as
      | SocialAgentHydratedContext['knownTaskSlotConstraints']
      | null;
    const pendingApprovals =
      this.arrayOrNull(snapshot.pendingApprovals) ??
      this.arrayOrNull(snapshot['pendingActions']) ??
      this.arrayOrNull(nestedTaskContext?.pendingApprovals) ??
      this.arrayOrNull(nestedTaskContext?.pendingActions) ??
      this.arrayOrNull(payloadTaskContext?.pendingApprovals) ??
      this.arrayOrNull(payloadTaskContext?.pendingActions) ??
      this.arrayOrNull(taskMemory?.pendingApprovals) ??
      this.arrayOrNull(taskMemory?.pendingActions) ??
      [];
    const lifeGraphSummary =
      this.recordOrNull(snapshot.lifeGraphSummary) ??
      this.recordOrNull(nestedTaskContext?.lifeGraphSummary) ??
      this.recordOrNull(payloadTaskContext?.lifeGraphSummary) ??
      this.recordOrNull(taskMemory?.lifeGraphSummary);
    const candidateActions =
      this.recordOrNull(snapshot.candidateActions) ??
      this.recordOrNull(snapshot['candidateState']) ??
      this.recordOrNull(nestedTaskContext?.candidateActions) ??
      this.recordOrNull(nestedTaskContext?.candidateState) ??
      this.recordOrNull(payloadTaskContext?.candidateActions) ??
      this.recordOrNull(payloadTaskContext?.candidateState) ??
      this.recordOrNull(taskMemory?.candidateActions) ??
      this.recordOrNull(taskMemory?.candidateState);
    return {
      userId: payload.ownerUserId,
      threadId:
        this.string(payload.runtimeIdentity?.threadId) ??
        this.string(snapshot.threadId) ??
        `agent-task:${payload.taskId}`,
      taskId: payload.taskId,
      recentMessages,
      taskMemory: taskMemory as SocialAgentHydratedContext['taskMemory'],
      taskSlots: taskSlots as SocialAgentHydratedContext['taskSlots'],
      taskSlotSummary:
        taskSlotSummary as SocialAgentHydratedContext['taskSlotSummary'],
      knownTaskSlotConstraints,
      lifeGraphFactProposals: [],
      lifeGraphFactDisplaySummaries: [],
      lifeGraphGovernanceSummary: {
        total: 0,
        autoSaveCount: 0,
        confirmationRequiredCount: 0,
        blockedCount: 0,
        sensitiveCount: 0,
        expiringFactKeys: [],
      },
      lifeGraphSummary,
      pendingApprovals:
        pendingApprovals as SocialAgentHydratedContext['pendingApprovals'],
      candidateActions: candidateActions,
    };
  }

  private recordOrEmpty(value: unknown): Record<string, unknown> {
    return this.isRecord(value) ? value : {};
  }

  private recordOrNull(value: unknown): Record<string, unknown> | null {
    return this.isRecord(value) ? value : null;
  }

  private recordArray(value: unknown): Array<Record<string, unknown>> {
    return Array.isArray(value)
      ? value.filter((item): item is Record<string, unknown> =>
          this.isRecord(item),
        )
      : [];
  }

  private arrayOrNull(value: unknown): unknown[] | null {
    return Array.isArray(value) ? value : null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }
}
