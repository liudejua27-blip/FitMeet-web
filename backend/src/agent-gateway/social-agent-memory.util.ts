import { AgentTask } from './entities/agent-task.entity';

export type SocialAgentShortTermStep = Record<string, unknown> & {
  id: string;
  label: string;
  status: string;
  updatedAt: string;
};

export type SocialAgentShortTermMemory = Record<string, unknown> & {
  taskId?: number;
  currentGoal?: string;
  permissionMode?: string;
  currentStatus?: string;
  currentStep?: SocialAgentShortTermStep | null;
  steps?: SocialAgentShortTermStep[];
  candidates?: Record<string, unknown>[];
  sentMessages?: Record<string, unknown>[];
  receivedReplies?: Record<string, unknown>[];
  updatedAt?: string;
};

export function rememberSocialAgentShortTerm(
  task: AgentTask,
  updates: Partial<SocialAgentShortTermMemory>,
): SocialAgentShortTermMemory {
  const memory = isRecord(task.memory) ? task.memory : {};
  const previous = isRecord(memory.shortTerm)
    ? (memory.shortTerm as SocialAgentShortTermMemory)
    : {};
  const next: SocialAgentShortTermMemory = {
    ...previous,
    ...updates,
    taskId: task.id,
    currentGoal: task.goal,
    permissionMode: task.permissionMode,
    currentStatus: task.status,
    updatedAt: new Date().toISOString(),
  };
  task.memory = {
    ...memory,
    shortTerm: next,
  };
  return next;
}

export function shortTermMemoryList<T extends Record<string, unknown>>(
  task: AgentTask,
  key: keyof Pick<SocialAgentShortTermMemory, 'steps' | 'candidates' | 'sentMessages' | 'receivedReplies'>,
): T[] {
  const memory = isRecord(task.memory) ? task.memory : {};
  const shortTerm = isRecord(memory.shortTerm)
    ? (memory.shortTerm as SocialAgentShortTermMemory)
    : {};
  const value = shortTerm[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

export function appendShortTermMemoryItem<T extends Record<string, unknown>>(
  task: AgentTask,
  key: keyof Pick<SocialAgentShortTermMemory, 'steps' | 'sentMessages' | 'receivedReplies'>,
  item: T,
  limit = 20,
): T[] {
  const id = typeof item.id === 'string' ? item.id : null;
  const previous = shortTermMemoryList<T>(task, key).filter(
    (entry) => !id || entry.id !== id,
  );
  return [...previous, item].slice(-limit);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
