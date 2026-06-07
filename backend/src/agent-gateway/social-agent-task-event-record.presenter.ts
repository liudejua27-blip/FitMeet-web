import {
  AgentTask,
  AgentTaskEventActor,
  AgentTaskEventType,
} from './entities/agent-task.entity';

export type SocialAgentTaskEventRecordInput = {
  summary: string;
  payload?: Record<string, unknown>;
  stepId?: string | null;
  toolCallId?: string | null;
};

export type SocialAgentTaskEventRecord = {
  taskId: number;
  ownerUserId: number;
  eventType: AgentTaskEventType;
  actor: AgentTaskEventActor;
  summary: string;
  payload: Record<string, unknown>;
  stepId: string | null;
  toolCallId: string | null;
};

export function buildSocialAgentTaskEventRecord(input: {
  task: AgentTask;
  type: AgentTaskEventType;
  event: SocialAgentTaskEventRecordInput;
  safeVarchar: (value: unknown, max?: number) => string;
}): SocialAgentTaskEventRecord {
  const { task, type, event, safeVarchar } = input;
  const actor = socialAgentTaskEventActor(type);
  return {
    taskId: task.id,
    ownerUserId: task.ownerUserId,
    eventType: safeVarchar(type, 80) as AgentTaskEventType,
    actor: safeVarchar(actor, 80) as AgentTaskEventActor,
    summary: safeVarchar(event.summary, 500),
    payload: event.payload ?? {},
    stepId: event.stepId == null ? null : safeVarchar(event.stepId, 80),
    toolCallId:
      event.toolCallId == null ? null : safeVarchar(event.toolCallId, 80),
  };
}

function socialAgentTaskEventActor(
  type: AgentTaskEventType,
): AgentTaskEventActor {
  return type === AgentTaskEventType.ToolReturned ||
    type === AgentTaskEventType.ToolFailed
    ? AgentTaskEventActor.Tool
    : AgentTaskEventActor.Agent;
}
