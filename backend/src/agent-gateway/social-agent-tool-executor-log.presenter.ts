import type { AgentTask } from './entities/agent-task.entity';
import type {
  SocialAgentToolCallRecord,
  SocialAgentToolName,
} from './social-agent-tool.types';

export function buildSocialAgentToolFailureLogPayload(input: {
  task: AgentTask;
  toolName: SocialAgentToolName;
  stepId: string;
  call: SocialAgentToolCallRecord;
}): Record<string, unknown> {
  const { task, toolName, stepId, call } = input;
  return {
    event: 'agent.task.tool_failed',
    taskId: task.id,
    ownerUserId: task.ownerUserId,
    agentConnectionId: task.agentConnectionId,
    permissionMode: task.permissionMode,
    stepId,
    toolCallId: call.id,
    toolName,
    status: call.status,
    error: call.error,
  };
}

export function buildSocialAgentTaskFailureLogPayload(input: {
  task: AgentTask;
  call: SocialAgentToolCallRecord;
}): Record<string, unknown> {
  const { task, call } = input;
  return {
    event: 'agent.task.failed',
    taskId: task.id,
    ownerUserId: task.ownerUserId,
    agentConnectionId: task.agentConnectionId,
    permissionMode: task.permissionMode,
    statusReason: task.statusReason,
    failedToolCallId: call.id,
    failedStepId: call.stepId,
    failedToolName: call.toolName,
    failedStatus: call.status,
    error: call.error,
  };
}
