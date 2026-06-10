import type { AgentTask } from './entities/agent-task.entity';

export function buildSocialAgentCurrentTaskSummary(input: {
  task: AgentTask;
  memory: unknown;
  isRecord: (value: unknown) => value is Record<string, unknown>;
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
    plan: Array.isArray(task.plan) ? task.plan.slice(-10) : [],
    recentToolCalls: Array.isArray(task.toolCalls)
      ? task.toolCalls.slice(-10)
      : [],
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
