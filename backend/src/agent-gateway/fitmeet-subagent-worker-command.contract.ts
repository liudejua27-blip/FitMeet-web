import type { FitMeetAlphaAgentName } from './fitmeet-alpha-agent.types';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import type { LongTermMemorySnapshot } from './social-agent-long-term-memory.service';

export const FITMEET_SUBAGENT_WORKER_COMMAND_CONTRACT =
  'fitmeet.subagent.worker.command';
export const FITMEET_SUBAGENT_WORKER_COMMAND_VERSION = 1;

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
  profile?: Record<string, unknown> | null;
  longTermSnapshot?: LongTermMemorySnapshot | null;
  brainToolResults?: Array<Record<string, unknown>>;
  state?: {
    assistantMessage?: string | null;
  };
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
  profile?: Record<string, unknown> | null;
  longTermSnapshot?: LongTermMemorySnapshot | null;
  brainToolResults?: Array<Record<string, unknown>>;
  state?: {
    assistantMessage?: string | null;
  };
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
  goal: string;
  plannerInput: Record<string, unknown>;
  tools: FitMeetSubagentWorkerToolCommand[];
  memoryScope?: string | null;
  maxToolCalls?: number | null;
  maxRetries?: number | null;
  timeoutMs?: number | null;
  route: SocialAgentIntentRouterResult;
  profile?: Record<string, unknown> | null;
  longTermSnapshot?: LongTermMemorySnapshot | null;
  brainToolResults?: Array<Record<string, unknown>>;
  state?: { assistantMessage?: string | null };
  workerRuntime: FitMeetSubagentWorkerRuntimeCommand;
}): FitMeetSubagentWorkerCommand {
  const submittedAt = input.submittedAt ?? new Date().toISOString();
  return {
    contract: FITMEET_SUBAGENT_WORKER_COMMAND_CONTRACT,
    version: FITMEET_SUBAGENT_WORKER_COMMAND_VERSION,
    commandId:
      input.commandId ??
      `cmd:${slug(input.agentName)}:${input.taskId}:${hash([
        input.runId,
        input.goal,
        input.tools,
      ])}`,
    commandType: 'route_branch.execute',
    runId: input.runId,
    traceId: input.traceId ?? input.runId,
    submittedAt,
    agentName: input.agentName,
    queueName: input.queueName,
    owner: { userId: input.ownerUserId },
    task: { taskId: input.taskId },
    execution: {
      goal: input.goal,
      memoryScope: input.memoryScope ?? null,
      maxToolCalls: input.maxToolCalls ?? null,
      maxRetries: input.maxRetries ?? null,
      timeoutMs: input.timeoutMs ?? null,
      workerRuntime: input.workerRuntime,
    },
    plannerInput: input.plannerInput,
    toolPlan: {
      tools: input.tools.map((tool) => ({
        toolName: tool.toolName,
        input: isRecord(tool.input) ? tool.input : {},
        requiresApproval: tool.requiresApproval,
      })),
    },
    routeBranch: {
      route: input.route,
      profile: input.profile ?? null,
      longTermSnapshot: input.longTermSnapshot ?? null,
      brainToolResults: input.brainToolResults ?? [],
      state: {
        assistantMessage: input.state?.assistantMessage ?? null,
      },
    },
    safety: {
      highRiskToolsRequireApproval: true,
      answerFromObservationsOnly: true,
    },
  };
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
  if (!string(value.agentName) || !string(value.queueName)) return false;
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
  if (!isRecord(value.toolPlan) || !Array.isArray(value.toolPlan.tools)) {
    return false;
  }
  if (!isRecord(value.routeBranch) || !isRecord(value.routeBranch.route)) {
    return false;
  }
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
    Array.isArray(value.tools)
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
    memoryScope: command.execution.memoryScope ?? null,
    maxToolCalls: command.execution.maxToolCalls ?? null,
    maxRetries: command.execution.maxRetries ?? null,
    timeoutMs: command.execution.timeoutMs ?? null,
    route: command.routeBranch.route,
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
