import type { FitMeetAlphaAgentName } from './fitmeet-alpha-agent.types';

export type AgentLoopPhase = 'plan' | 'tool' | 'observe' | 'replan' | 'answer';

export interface AgentLoopStep {
  phase: AgentLoopPhase;
  agent: FitMeetAlphaAgentName;
  toolName?: string | null;
  input?: Record<string, unknown> | null;
  observation?: Record<string, unknown> | null;
  critique?: string | null;
  status?:
    | 'planned'
    | 'running'
    | 'observed'
    | 'completed'
    | 'failed'
    | 'blocked';
  latencyMs?: number | null;
  error?: string | null;
  nextPhase?: AgentLoopPhase | null;
  createdAt: string;
}

export interface AgentLoopRun {
  runId: string;
  traceId: string;
  taskId: number | null;
  goal: string;
  steps: AgentLoopStep[];
  status: 'running' | 'completed' | 'failed';
  finalObservation?: Record<string, unknown> | null;
  toolBudget?: {
    maxToolCalls: number;
    usedToolCalls: number;
    maxRetries: number;
    timeoutMs: number;
  };
}

export interface SubagentHandoffResult {
  agent: FitMeetAlphaAgentName;
  memoryScope?: string | null;
  input: Record<string, unknown>;
  toolCalls: Array<{
    toolName: string;
    input: Record<string, unknown>;
    status: 'planned' | 'observed' | 'skipped';
  }>;
  plannerInput?: Record<string, unknown>;
  observations?: Array<Record<string, unknown>>;
  observation: Record<string, unknown>;
  critique: string;
  handoffOutput: Record<string, unknown>;
  evalHints?: Record<string, unknown>;
}

export interface AgentLoopToolPlan {
  agent: FitMeetAlphaAgentName;
  toolName: string;
  input?: Record<string, unknown> | null;
  requiresApproval?: boolean;
}

export interface AgentLoopExecutionResult {
  loop: AgentLoopRun;
  observations: Array<Record<string, unknown>>;
  answerBoundary: {
    fromObservationsOnly: boolean;
    requiresApproval: boolean;
    canContinue: boolean;
    status: 'ready' | 'approval_required' | 'tool_failed';
    userSafeMessage?: string | null;
  };
}
