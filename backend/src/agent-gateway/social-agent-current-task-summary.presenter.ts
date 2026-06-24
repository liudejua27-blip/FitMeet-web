import type { AgentTask } from './entities/agent-task.entity';
import { selectSocialAgentContextWindow } from './social-agent-context-window';

export function buildSocialAgentCurrentTaskSummary(input: {
  task: AgentTask;
  memory: unknown;
  isRecord: (value: unknown) => value is Record<string, unknown>;
  contextLimit?: number;
}): Record<string, unknown> {
  const { task, memory, isRecord } = input;
  return {
    taskId: task.id,
    title: task.title,
    goal: task.goal,
    status: task.status,
    statusReason: task.statusReason,
    permissionMode: task.permissionMode,
    riskLevel: task.riskLevel,
    plan: contextWindow(task.plan, input.contextLimit),
    recentToolCalls: contextWindow(task.toolCalls, input.contextLimit),
    result: isRecord(task.result) ? task.result : {},
    memory,
  };
}

export function shouldPersistSocialAgentCurrentTaskSummary(input: {
  request: Record<string, unknown>;
  bool: (value: unknown) => boolean | undefined;
}): boolean {
  return (
    input.bool(input.request.persistLongTerm ?? input.request.writeLongTerm) ===
    true
  );
}

function contextWindow(value: unknown, limit?: number): unknown[] {
  return Array.isArray(value)
    ? selectSocialAgentContextWindow(value, limit)
    : [];
}
