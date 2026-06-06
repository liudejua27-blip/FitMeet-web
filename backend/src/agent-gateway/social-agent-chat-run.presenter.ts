import type { AgentTask } from './entities/agent-task.entity';
import type { FitMeetAlphaTurnDecision } from './fitmeet-alpha-agent.types';
import type {
  SocialAgentChatRunResult,
  SocialAgentVisibleStep,
} from './social-agent-chat.types';
export {
  readLatestSocialAgentStoredRun,
  readSocialAgentStoredRun,
  withSocialAgentStoredRun,
} from './social-agent-chat-run-store.presenter';

export function createSocialAgentRunId(): string {
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  return `sar_${Date.now()}_${randomSuffix}`;
}

export function socialAgentSafetyBlockedStep(): SocialAgentVisibleStep {
  return {
    id: 'main_agent_safety',
    label: 'Main Agent 已拦截不安全请求',
    status: 'failed',
  };
}

export function socialAgentClarificationStep(
  label: string,
): SocialAgentVisibleStep {
  return {
    id: 'clarify',
    label,
    status: 'done',
  };
}

export function buildSocialAgentBlockedRunResult(input: {
  task: AgentTask;
  visibleSteps: SocialAgentVisibleStep[];
  alphaTurn: FitMeetAlphaTurnDecision;
  events: Array<Record<string, unknown>>;
}): SocialAgentChatRunResult {
  const { alphaTurn, task, visibleSteps } = input;
  return {
    taskId: task.id,
    status: task.status,
    visibleSteps,
    assistantMessage:
      alphaTurn.assistantMessage ||
      '这个请求不符合 FitMeet 的安全边界，我不能继续执行。',
    emptyReason: null,
    message: null,
    debugReasons: null,
    socialRequestDraft: null,
    candidates: [],
    approvalRequiredActions: [],
    events: input.events,
    cards: alphaTurn.cards,
    safety: alphaTurn.safety,
    traceId: alphaTurn.traceId,
    agentTrace: alphaTurn.agentTrace,
    structuredIntent: alphaTurn.structuredIntent,
  };
}

export function buildSocialAgentClarificationRunResult(input: {
  task: AgentTask;
  visibleSteps: SocialAgentVisibleStep[];
  assistantMessage: string;
  alphaTurn?: FitMeetAlphaTurnDecision;
  events: Array<Record<string, unknown>>;
}): SocialAgentChatRunResult {
  const { alphaTurn, task } = input;
  return {
    taskId: task.id,
    status: task.status,
    visibleSteps: input.visibleSteps,
    assistantMessage: input.assistantMessage,
    emptyReason: null,
    message: null,
    debugReasons: null,
    socialRequestDraft: null,
    candidates: [],
    approvalRequiredActions: [],
    events: input.events,
    cards: alphaTurn?.cards ?? [],
    safety: alphaTurn?.safety,
    traceId: alphaTurn?.traceId,
    agentTrace: alphaTurn?.agentTrace,
    structuredIntent: alphaTurn?.structuredIntent,
  };
}
