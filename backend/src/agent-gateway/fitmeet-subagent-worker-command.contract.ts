import type { FitMeetAlphaAgentName } from './fitmeet-alpha-agent.types';
import {
  createSocialCodexRuntimeIdentity,
  type SocialCodexRuntimeIdentity,
} from './social-codex-runtime-model';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import type { LongTermMemorySnapshot } from './social-agent-long-term-memory.service';
import { selectSocialAgentContextWindow } from './social-agent-context-window';
import { buildSocialAgentKnownTaskSlotConstraints } from './social-agent-task-slot-constraints.presenter';

export const FITMEET_SUBAGENT_WORKER_COMMAND_CONTRACT =
  'fitmeet.subagent.worker.command';
export const FITMEET_SUBAGENT_WORKER_COMMAND_VERSION = 1;
const FITMEET_SUBAGENT_WORKER_AGENT_NAMES: readonly FitMeetAlphaAgentName[] = [
  'FitMeet Main Agent',
  'Agent Brain',
  'Life Graph Agent',
  'Social Match Agent',
  'Meet Loop Agent',
  'Math Agent',
];
const FITMEET_SUBAGENT_HIGH_RISK_TOOL_NAME_PATTERNS: readonly RegExp[] = [
  /\bsend_message_to_candidate\b/,
  /\bsend_candidate_message\b/,
  /\bsend_invite\b/,
  /\bfitmeet_send_invite\b/,
  /\bsend_message\b/,
  /\breply_message\b/,
  /\bconnect_candidate\b/,
  /\badd_friend\b/,
  /\bcreate_activity\b/,
  /\bfitmeet_create_activity\b/,
  /\binvite_activity\b/,
  /\binvite_candidate\b/,
  /\bjoin_activity\b/,
  /\boffline_meeting\b/,
  /\bpublish_social_request\b/,
  /\bpublic_publish\b/,
  /\bpublish_activity\b/,
  /\bexchange_contact\b/,
  /\bcontact_exchange\b/,
  /\breveal_precise_location\b/,
  /\bshare_location\b/,
  /\bupdate_sensitive_profile\b/,
  /\bsensitive_profile\b/,
  /\blife_graph_writeback\b/,
  /\bpayment\b/,
  /\bpay\b/,
];

export type FitMeetSubagentWorkerCommandType = 'route_branch.execute';

export type FitMeetSubagentWorkerToolCommand = {
  toolName: string;
  input: Record<string, unknown>;
  requiresApproval?: boolean;
};

export type FitMeetSubagentWorkerRuntimeCommand = {
  workerId?: string | null;
  mode?: string | null;
  queueName?: string | null;
  timeoutMs?: number | null;
  crashIsolation?: boolean;
  scalable?: boolean;
  modelUseCase?: string | null;
  model?: string | null;
  runId?: string | null;
};

export type FitMeetSubagentRouteBranchCommand = {
  route: SocialAgentIntentRouterResult;
  taskContext?: Record<string, unknown> | null;
  contextSnapshot?: FitMeetSubagentWorkerContextSnapshot | null;
  contextTurnLimit?: number | null;
  profile?: Record<string, unknown> | null;
  longTermSnapshot?: LongTermMemorySnapshot | null;
  brainToolResults?: Array<Record<string, unknown>>;
  state?: {
    assistantMessage?: string | null;
  };
};

export type FitMeetSubagentWorkerContextSnapshot = {
  threadId?: string | null;
  taskId?: number | null;
  recentMessages?: Array<Record<string, unknown>>;
  taskMemory?: Record<string, unknown> | null;
  taskSlots?: Record<string, unknown> | null;
  taskSlotSummary?: Record<string, unknown> | null;
  knownTaskSlotConstraints?: Record<string, unknown> | null;
  pendingApprovals?: unknown[];
  candidateActions?: Record<string, unknown> | null;
  lifeGraphSummary?: Record<string, unknown> | null;
  taskContext?: Record<string, unknown> | null;
  profile?: Record<string, unknown> | null;
  longTermSnapshot?: LongTermMemorySnapshot | null;
};

export type FitMeetSubagentWorkerCommand = {
  contract: typeof FITMEET_SUBAGENT_WORKER_COMMAND_CONTRACT;
  version: typeof FITMEET_SUBAGENT_WORKER_COMMAND_VERSION;
  commandId: string;
  commandType: FitMeetSubagentWorkerCommandType;
  runId: string;
  traceId: string;
  submittedAt: string;
  agentName: FitMeetAlphaAgentName;
  queueName: string;
  runtimeIdentity: SocialCodexRuntimeIdentity;
  owner: {
    userId: number;
  };
  task: {
    taskId: number;
  };
  execution: {
    goal: string;
    memoryScope?: string | null;
    maxToolCalls?: number | null;
    maxRetries?: number | null;
    timeoutMs?: number | null;
    workerRuntime: FitMeetSubagentWorkerRuntimeCommand;
  };
  plannerInput: Record<string, unknown>;
  toolPlan: {
    tools: FitMeetSubagentWorkerToolCommand[];
  };
  routeBranch: FitMeetSubagentRouteBranchCommand;
  safety: {
    highRiskToolsRequireApproval: true;
    answerFromObservationsOnly: true;
  };
};

export type LegacySubagentRouteBranchPayload = {
  kind: 'route_branch';
  ownerUserId: number;
  taskId: number;
  agent: FitMeetAlphaAgentName;
  goal: string;
  plannerInput: Record<string, unknown>;
  tools: FitMeetSubagentWorkerToolCommand[];
  memoryScope?: string | null;
  maxToolCalls?: number | null;
  maxRetries?: number | null;
  timeoutMs?: number | null;
  route: SocialAgentIntentRouterResult;
  taskContext?: Record<string, unknown> | null;
  profile?: Record<string, unknown> | null;
  longTermSnapshot?: LongTermMemorySnapshot | null;
  brainToolResults?: Array<Record<string, unknown>>;
  state?: {
    assistantMessage?: string | null;
  };
  runtimeIdentity?: SocialCodexRuntimeIdentity;
  contextSnapshot?: FitMeetSubagentWorkerContextSnapshot | null;
  workerRuntime?: FitMeetSubagentWorkerRuntimeCommand;
  runId?: string;
  traceId?: string;
  submittedAt?: string;
};

export function buildFitMeetSubagentWorkerCommand(input: {
  runId: string;
  traceId?: string | null;
  commandId?: string | null;
  submittedAt?: string | null;
  agentName: FitMeetAlphaAgentName;
  queueName: string;
  ownerUserId: number;
  taskId: number;
  threadId?: string | number | null;
  goal: string;
  plannerInput: Record<string, unknown>;
  tools: FitMeetSubagentWorkerToolCommand[];
  memoryScope?: string | null;
  maxToolCalls?: number | null;
  maxRetries?: number | null;
  timeoutMs?: number | null;
  route: SocialAgentIntentRouterResult;
  taskContext?: Record<string, unknown> | null;
  contextSnapshot?: FitMeetSubagentWorkerContextSnapshot | null;
  contextTurnLimit?: number | null;
  profile?: Record<string, unknown> | null;
  longTermSnapshot?: LongTermMemorySnapshot | null;
  brainToolResults?: Array<Record<string, unknown>>;
  state?: { assistantMessage?: string | null };
  workerRuntime: FitMeetSubagentWorkerRuntimeCommand;
}): FitMeetSubagentWorkerCommand {
  const submittedAt = input.submittedAt ?? new Date().toISOString();
  const tools = normalizeToolCommands(input.tools);
  const runtimeIdentity = createSocialCodexRuntimeIdentity({
    threadId: input.threadId,
    taskId: input.taskId,
    runId: input.runId,
  });
  const taskContext = mergeTaskContexts(
    input.taskContext,
    ...taskContextsFromPlannerInput(input.plannerInput),
    ...tools.map((tool) => taskContextFromToolInput(tool.input)),
  );
  const contextSnapshot = normalizeContextSnapshot({
    snapshot: input.contextSnapshot,
    runtimeIdentity,
    taskContext,
    profile: input.profile ?? null,
    longTermSnapshot: input.longTermSnapshot ?? null,
    contextTurnLimit: input.contextTurnLimit ?? null,
  });
  const command: FitMeetSubagentWorkerCommand = {
    contract: FITMEET_SUBAGENT_WORKER_COMMAND_CONTRACT,
    version: FITMEET_SUBAGENT_WORKER_COMMAND_VERSION,
    commandId:
      input.commandId ??
      `cmd:${slug(input.agentName)}:${input.taskId}:${hash([
        input.runId,
        input.goal,
        tools,
      ])}`,
    commandType: 'route_branch.execute',
    runId: input.runId,
    traceId: input.traceId ?? input.runId,
    submittedAt,
    agentName: input.agentName,
    queueName: input.queueName,
    runtimeIdentity,
    owner: { userId: input.ownerUserId },
    task: { taskId: input.taskId },
    execution: {
      goal: input.goal,
      memoryScope: input.memoryScope ?? null,
      maxToolCalls: input.maxToolCalls ?? null,
      maxRetries: input.maxRetries ?? null,
      timeoutMs: input.timeoutMs ?? null,
      workerRuntime: jsonRecord(input.workerRuntime, 'workerRuntime'),
    },
    plannerInput: jsonRecord(input.plannerInput, 'plannerInput'),
    toolPlan: {
      tools,
    },
    routeBranch: {
      route: input.route,
      taskContext: taskContext ? jsonRecord(taskContext, 'taskContext') : null,
      contextSnapshot,
      profile: input.profile ? jsonRecord(input.profile, 'profile') : null,
      longTermSnapshot: input.longTermSnapshot
        ? (jsonRecord(
            input.longTermSnapshot,
            'longTermSnapshot',
          ) as LongTermMemorySnapshot)
        : null,
      brainToolResults: jsonRecordArray(
        input.brainToolResults ?? [],
        'brainToolResults',
      ),
      state: {
        assistantMessage: input.state?.assistantMessage ?? null,
      },
    },
    safety: {
      highRiskToolsRequireApproval: true,
      answerFromObservationsOnly: true,
    },
  };
  assertJsonSerializable(command, 'subagentWorkerCommand');
  return command;
}

function taskContextsFromPlannerInput(
  plannerInput: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const hydratedContext = readRecord(plannerInput, 'hydratedContext');
  return [
    hydratedContext,
    readRecord(hydratedContext, 'taskContext'),
    readRecord(plannerInput, 'taskContext'),
  ].filter(isRecord);
}

function taskContextFromToolInput(
  toolInput: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  return readRecord(toolInput, 'taskContext');
}

function mergeTaskContexts(
  ...contexts: Array<Record<string, unknown> | null | undefined>
): Record<string, unknown> | null {
  const records = contexts.filter(isRecord);
  if (!records.length) return null;
  const merged: Record<string, unknown> = {};
  const mergedTaskMemory: Record<string, unknown> = {};
  const mergedTaskSlots: Record<string, unknown> = {};
  const mergedTaskSlotSummary: Record<string, unknown> = {};
  const mergedKnownTaskSlotConstraints: Record<string, unknown> = {};
  const mergedCandidateActions: Record<string, unknown> = {};
  const mergedLifeGraphSummary: Record<string, unknown> = {};
  const mergedPendingApprovals: unknown[] = [];
  const mergedRecentMessages: Array<Record<string, unknown>> = [];
  const seenPendingApprovals = new Set<string>();
  for (const context of records) {
    Object.assign(merged, context);
    mergedRecentMessages.push(
      ...readRecordArray(context, 'recentMessages'),
      ...readRecordArray(context, 'conversationHistory'),
    );
    const taskMemory = readRecord(context, 'taskMemory');
    if (taskMemory) Object.assign(mergedTaskMemory, taskMemory);
    const taskSlots =
      readRecord(context, 'taskSlots') ?? readRecord(taskMemory, 'taskSlots');
    if (taskSlots) Object.assign(mergedTaskSlots, taskSlots);
    const taskSlotSummary =
      readRecord(context, 'taskSlotSummary') ??
      readRecord(taskMemory, 'taskSlotSummary');
    if (taskSlotSummary) Object.assign(mergedTaskSlotSummary, taskSlotSummary);
    const knownTaskSlotConstraints =
      readRecord(context, 'knownTaskSlotConstraints') ??
      readRecord(taskMemory, 'knownTaskSlotConstraints');
    if (knownTaskSlotConstraints) {
      Object.assign(mergedKnownTaskSlotConstraints, knownTaskSlotConstraints);
    }
    const candidateActions =
      readRecord(context, 'candidateActions') ??
      readRecord(context, 'candidateState') ??
      readRecord(taskMemory, 'candidateActions') ??
      readRecord(taskMemory, 'candidateState');
    if (candidateActions) Object.assign(mergedCandidateActions, candidateActions);
    const lifeGraphSummary =
      readRecord(context, 'lifeGraphSummary') ??
      readRecord(taskMemory, 'lifeGraphSummary');
    if (lifeGraphSummary) Object.assign(mergedLifeGraphSummary, lifeGraphSummary);
    const pendingApprovals = [
      ...(Array.isArray(context.pendingApprovals)
        ? context.pendingApprovals
        : []),
      ...(Array.isArray(context.pendingActions)
        ? context.pendingActions
        : []),
      ...(Array.isArray(taskMemory?.pendingApprovals)
        ? taskMemory.pendingApprovals
        : []),
      ...(Array.isArray(taskMemory?.pendingActions)
        ? taskMemory.pendingActions
        : []),
    ];
    if (pendingApprovals.length > 0) {
      const normalized = jsonRoundTrip(
        pendingApprovals,
        'taskContext.pendingApprovals',
      ) as unknown[];
      for (const approval of normalized) {
        const key = JSON.stringify(approval);
        if (seenPendingApprovals.has(key)) continue;
        seenPendingApprovals.add(key);
        mergedPendingApprovals.push(approval);
      }
    }
  }
  if (Object.keys(mergedTaskMemory).length > 0) {
    merged.taskMemory = mergedTaskMemory;
  }
  if (Object.keys(mergedTaskSlots).length > 0) {
    merged.taskSlots = mergedTaskSlots;
    merged.knownTaskSlotConstraints =
      buildSocialAgentKnownTaskSlotConstraints(mergedTaskSlots) ??
      readRecord(merged, 'knownTaskSlotConstraints');
  }
  if (
    Object.keys(mergedTaskSlots).length === 0 &&
    Object.keys(mergedKnownTaskSlotConstraints).length > 0
  ) {
    merged.knownTaskSlotConstraints = mergedKnownTaskSlotConstraints;
  }
  if (Object.keys(mergedTaskSlotSummary).length > 0) {
    merged.taskSlotSummary = mergedTaskSlotSummary;
  }
  if (Object.keys(mergedCandidateActions).length > 0) {
    merged.candidateActions = mergedCandidateActions;
  }
  if (Object.keys(mergedLifeGraphSummary).length > 0) {
    merged.lifeGraphSummary = mergedLifeGraphSummary;
  }
  if (mergedPendingApprovals.length > 0) {
    merged.pendingApprovals = mergedPendingApprovals;
  }
  if (mergedRecentMessages.length > 0) {
    merged.recentMessages = selectSocialAgentContextWindow(
      mergeRecentMessageSources(mergedRecentMessages),
    );
  }
  return merged;
}

export function isFitMeetSubagentWorkerCommand(
  value: unknown,
): value is FitMeetSubagentWorkerCommand {
  if (!isRecord(value)) return false;
  if (value.contract !== FITMEET_SUBAGENT_WORKER_COMMAND_CONTRACT) {
    return false;
  }
  if (value.version !== FITMEET_SUBAGENT_WORKER_COMMAND_VERSION) return false;
  if (value.commandType !== 'route_branch.execute') return false;
  if (!string(value.runId) || !string(value.traceId)) return false;
  if (!knownAgentName(value.agentName) || !string(value.queueName))
    return false;
  if (!string(value.commandId) || !string(value.submittedAt)) return false;
  if (!isRecord(value.runtimeIdentity)) return false;
  if (!string(value.runtimeIdentity.threadId)) return false;
  if (!string(value.runtimeIdentity.sessionId)) return false;
  if (!isRecord(value.owner) || !positiveNumber(value.owner.userId)) {
    return false;
  }
  if (!isRecord(value.task) || !positiveNumber(value.task.taskId)) {
    return false;
  }
  if (!isRecord(value.execution) || !string(value.execution.goal)) {
    return false;
  }
  if (!isRecord(value.plannerInput)) return false;
  if (
    !isRecord(value.toolPlan) ||
    !Array.isArray(value.toolPlan.tools) ||
    value.toolPlan.tools.length === 0 ||
    !value.toolPlan.tools.every(isToolCommand)
  ) {
    return false;
  }
  if (!isRecord(value.routeBranch) || !isRecord(value.routeBranch.route)) {
    return false;
  }
  if (!isRecord(value.safety)) return false;
  if (value.safety.highRiskToolsRequireApproval !== true) return false;
  if (value.safety.answerFromObservationsOnly !== true) return false;
  if (!isJsonSerializable(value)) return false;
  return true;
}

export function isLegacySubagentRouteBranchPayload(
  value: unknown,
): value is LegacySubagentRouteBranchPayload {
  return (
    isRecord(value) &&
    value.kind === 'route_branch' &&
    positiveNumber(value.ownerUserId) &&
    positiveNumber(value.taskId) &&
    string(value.goal) !== null &&
    isRecord(value.route) &&
    Array.isArray(value.tools) &&
    value.tools.length > 0 &&
    value.tools.every(isToolCommand)
  );
}

export function subagentCommandToLegacyPayload(
  command: FitMeetSubagentWorkerCommand,
): LegacySubagentRouteBranchPayload {
  return {
    kind: 'route_branch',
    ownerUserId: command.owner.userId,
    taskId: command.task.taskId,
    agent: command.agentName,
    goal: command.execution.goal,
    plannerInput: command.plannerInput,
    tools: command.toolPlan.tools,
    runtimeIdentity: command.runtimeIdentity,
    contextSnapshot: command.routeBranch.contextSnapshot ?? null,
    memoryScope: command.execution.memoryScope ?? null,
    maxToolCalls: command.execution.maxToolCalls ?? null,
    maxRetries: command.execution.maxRetries ?? null,
    timeoutMs: command.execution.timeoutMs ?? null,
    route: command.routeBranch.route,
    taskContext: command.routeBranch.taskContext ?? null,
    profile: command.routeBranch.profile ?? null,
    longTermSnapshot: command.routeBranch.longTermSnapshot ?? null,
    brainToolResults: command.routeBranch.brainToolResults ?? [],
    state: command.routeBranch.state ?? { assistantMessage: null },
    workerRuntime: command.execution.workerRuntime,
    runId: command.runId,
    traceId: command.traceId,
    submittedAt: command.submittedAt,
  };
}

export function normalizeSubagentWorkerPayload(
  value: Record<string, unknown>,
): LegacySubagentRouteBranchPayload | null {
  if (isFitMeetSubagentWorkerCommand(value)) {
    return subagentCommandToLegacyPayload(value);
  }
  if (isLegacySubagentRouteBranchPayload(value)) return value;
  return null;
}

export function workerRuntimeFromSubagentPayload(
  value: Record<string, unknown>,
): FitMeetSubagentWorkerRuntimeCommand {
  if (isFitMeetSubagentWorkerCommand(value)) {
    return value.execution.workerRuntime;
  }
  if (isLegacySubagentRouteBranchPayload(value)) {
    return isRecord(value.workerRuntime) ? value.workerRuntime : {};
  }
  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function string(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function positiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function knownAgentName(value: unknown): value is FitMeetAlphaAgentName {
  return (
    typeof value === 'string' &&
    FITMEET_SUBAGENT_WORKER_AGENT_NAMES.includes(value as FitMeetAlphaAgentName)
  );
}

function isToolCommand(
  value: unknown,
): value is FitMeetSubagentWorkerToolCommand {
  if (!isRecord(value)) return false;
  const toolName = string(value.toolName);
  if (!toolName) return false;
  if (!isRecord(value.input)) return false;
  if (
    value.requiresApproval !== undefined &&
    typeof value.requiresApproval !== 'boolean'
  ) {
    return false;
  }
  if (
    isHighRiskSubagentToolName(toolName) &&
    value.requiresApproval !== true
  ) {
    return false;
  }
  return isJsonSerializable(value);
}

function normalizeToolCommands(
  tools: FitMeetSubagentWorkerToolCommand[],
): FitMeetSubagentWorkerToolCommand[] {
  if (!Array.isArray(tools) || tools.length === 0) {
    throw new Error('Subagent worker command requires at least one tool.');
  }
  return tools.map((tool, index) => {
    const toolName = string(tool.toolName);
    if (!toolName) {
      throw new Error(
        `Subagent worker command tool ${index + 1} is missing toolName.`,
      );
    }
    const normalized: FitMeetSubagentWorkerToolCommand = {
      toolName,
      input: isRecord(tool.input)
        ? jsonRecord(tool.input, `tools.${index}.input`)
        : {},
    };
    if (isHighRiskSubagentToolName(toolName)) {
      normalized.requiresApproval = true;
    } else if (typeof tool.requiresApproval === 'boolean') {
      normalized.requiresApproval = tool.requiresApproval;
    }
    return normalized;
  });
}

function isHighRiskSubagentToolName(toolName: string): boolean {
  const normalized = toolName.trim().toLowerCase();
  return FITMEET_SUBAGENT_HIGH_RISK_TOOL_NAME_PATTERNS.some((pattern) =>
    pattern.test(normalized),
  );
}

function normalizeContextSnapshot(input: {
  snapshot?: FitMeetSubagentWorkerContextSnapshot | null;
  runtimeIdentity: SocialCodexRuntimeIdentity;
  taskContext?: Record<string, unknown> | null;
  profile?: Record<string, unknown> | null;
  longTermSnapshot?: LongTermMemorySnapshot | null;
  contextTurnLimit?: number | null;
}): FitMeetSubagentWorkerContextSnapshot {
  const source = isRecord(input.snapshot) ? input.snapshot : {};
  const taskContext =
    input.taskContext ??
    (isRecord(source.taskContext) ? source.taskContext : null);
  const taskMemory =
    readRecord(source, 'taskMemory') ?? readRecord(taskContext, 'taskMemory');
  const taskSlots = isRecord(source.taskSlots)
    ? source.taskSlots
    : readRecord(taskContext, 'taskSlots') ?? readRecord(taskMemory, 'taskSlots');
  const taskSlotSummary = isRecord(source.taskSlotSummary)
    ? source.taskSlotSummary
    : readRecord(taskContext, 'taskSlotSummary') ??
      readRecord(taskMemory, 'taskSlotSummary');
  const knownTaskSlotConstraints =
    readRecord(source, 'knownTaskSlotConstraints') ??
    readRecord(taskContext, 'knownTaskSlotConstraints') ??
    readRecord(taskMemory, 'knownTaskSlotConstraints') ??
    buildSocialAgentKnownTaskSlotConstraints(taskSlots);
  const recentMessages = selectSocialAgentContextWindow(
    mergeRecentMessageSources(
      readRecordArray(source, 'recentMessages'),
      readRecordArray(taskContext, 'recentMessages'),
      readRecordArray(taskContext, 'conversationHistory'),
    ),
    input.contextTurnLimit ?? undefined,
  );
  const sourcePendingActions = isRecord(source)
    ? (source as Record<string, unknown>).pendingActions
    : undefined;
  const pendingApprovals = Array.isArray(source.pendingApprovals)
    ? jsonRoundTrip(source.pendingApprovals, 'contextSnapshot.pendingApprovals')
    : Array.isArray(sourcePendingActions)
      ? jsonRoundTrip(
          sourcePendingActions,
          'contextSnapshot.pendingApprovals',
        )
    : Array.isArray(taskContext?.pendingApprovals)
      ? jsonRoundTrip(
          taskContext.pendingApprovals,
          'contextSnapshot.pendingApprovals',
        )
      : Array.isArray(taskContext?.pendingActions)
        ? jsonRoundTrip(
            taskContext.pendingActions,
            'contextSnapshot.pendingApprovals',
          )
      : Array.isArray(taskMemory?.pendingApprovals)
        ? jsonRoundTrip(
            taskMemory.pendingApprovals,
            'contextSnapshot.pendingApprovals',
          )
      : Array.isArray(taskMemory?.pendingActions)
        ? jsonRoundTrip(
            taskMemory.pendingActions,
            'contextSnapshot.pendingApprovals',
          )
      : [];
  return jsonRecord(
    {
      threadId:
        string(source.threadId) ??
        string(taskContext?.threadId) ??
        input.runtimeIdentity.threadId,
      taskId:
        positiveNumber(source.taskId) || positiveNumber(taskContext?.taskId)
          ? Number(source.taskId ?? taskContext?.taskId)
          : input.runtimeIdentity.taskId,
      recentMessages,
      taskMemory,
      taskSlots,
      taskSlotSummary,
      knownTaskSlotConstraints,
      pendingApprovals,
      candidateActions:
        readRecord(source, 'candidateActions') ??
        readRecord(source, 'candidateState') ??
        readRecord(taskContext, 'candidateActions') ??
        readRecord(taskContext, 'candidateState') ??
        readRecord(taskMemory, 'candidateActions') ??
        readRecord(taskMemory, 'candidateState'),
      lifeGraphSummary:
        readRecord(source, 'lifeGraphSummary') ??
        readRecord(taskContext, 'lifeGraphSummary') ??
        readRecord(taskMemory, 'lifeGraphSummary'),
      taskContext,
      profile: input.profile ?? readRecord(source, 'profile'),
      longTermSnapshot:
        input.longTermSnapshot ??
        (readRecord(
          source,
          'longTermSnapshot',
        ) as LongTermMemorySnapshot | null),
    },
    'contextSnapshot',
  ) as FitMeetSubagentWorkerContextSnapshot;
}

function mergeRecentMessageSources(
  ...sources: Array<Array<Record<string, unknown>>>
): Array<Record<string, unknown>> {
  const merged: Array<Record<string, unknown>> = [];
  const indexByKey = new Map<string, number>();
  for (const source of sources) {
    for (const message of source) {
      const key = recentMessageKey(message);
      const existingIndex = indexByKey.get(key);
      if (existingIndex === undefined) {
        indexByKey.set(key, merged.length);
        merged.push(message);
        continue;
      }
      merged[existingIndex] = message;
    }
  }
  return merged;
}

function recentMessageKey(message: Record<string, unknown>): string {
  const role = string(message.role) ?? '';
  const text = string(message.text) ?? string(message.content) ?? '';
  const at =
    string(message.at) ??
    string(message.createdAt) ??
    string(message.timestamp) ??
    '';
  return at ? `${role}:${text}:${at}` : `${role}:${text}`;
}

function jsonRecord(
  value: unknown,
  fieldName: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Subagent worker command ${fieldName} must be an object.`);
  }
  return jsonRoundTrip(value, fieldName) as Record<string, unknown>;
}

function jsonRecordArray(
  value: unknown[],
  fieldName: string,
): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new Error(`Subagent worker command ${fieldName} must be an array.`);
  }
  return value.map((item, index) => jsonRecord(item, `${fieldName}.${index}`));
}

function readRecord(
  root: unknown,
  key: string,
): Record<string, unknown> | null {
  if (!isRecord(root)) return null;
  const value = root[key];
  return isRecord(value) ? jsonRecord(value, key) : null;
}

function readRecordArray(
  root: unknown,
  key: string,
): Array<Record<string, unknown>> {
  if (!isRecord(root)) return [];
  const value = root[key];
  if (!Array.isArray(value)) return [];
  return jsonRecordArray(value, key);
}

function jsonRoundTrip(value: unknown, fieldName: string): unknown {
  if (!isJsonSerializable(value)) {
    throw new Error(
      `Subagent worker command ${fieldName} must be JSON serializable.`,
    );
  }
  return JSON.parse(JSON.stringify(value));
}

function assertJsonSerializable(value: unknown, fieldName: string): void {
  if (!isJsonSerializable(value)) {
    throw new Error(
      `Subagent worker command ${fieldName} must be JSON serializable.`,
    );
  }
}

function isJsonSerializable(value: unknown): boolean {
  return isJsonSerializableValue(value, new WeakSet<object>());
}

function isJsonSerializableValue(
  value: unknown,
  seen: WeakSet<object>,
): boolean {
  if (value === null) return true;
  if (typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (
    typeof value === 'bigint' ||
    typeof value === 'function' ||
    typeof value === 'symbol'
  ) {
    return false;
  }
  if (typeof value === 'undefined') return false;
  if (typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (value instanceof Date) {
    seen.delete(value);
    return Number.isFinite(value.getTime());
  }
  let result = false;
  if (Array.isArray(value)) {
    result = value.every((item) => isJsonSerializableValue(item, seen));
    seen.delete(value);
    return result;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    seen.delete(value);
    return false;
  }
  result = Object.values(value).every((item) =>
    isJsonSerializableValue(item, seen),
  );
  seen.delete(value);
  return result;
}

function hash(value: unknown): string {
  const text = JSON.stringify(value);
  let current = 0;
  for (let index = 0; index < text.length; index += 1) {
    current = (current * 31 + text.charCodeAt(index)) >>> 0;
  }
  return current.toString(36);
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
