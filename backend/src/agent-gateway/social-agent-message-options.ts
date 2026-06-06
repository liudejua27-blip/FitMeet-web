import { AgentTask } from './entities/agent-task.entity';
import { SocialAgentToolName } from './social-agent-tool.types';

type ConfirmationPredicate = (
  toolName: SocialAgentToolName,
  input: Record<string, unknown>,
) => boolean;

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function buildSocialAgentMessageMetadata(
  task: AgentTask,
  stepId: string,
  raw: unknown,
): Record<string, unknown> {
  return {
    ...metadataRecord(raw),
    agentTaskId: task.id,
    stepId,
    userId: task.ownerUserId,
    source: 'social_agent_tool_executor',
  };
}

export function buildSocialAgentConversationOptions(
  task: AgentTask,
  stepId: string,
  metadata: Record<string, unknown> = {},
) {
  return {
    agentConnectionId: task.agentConnectionId,
    ownerUserId: task.ownerUserId,
    actorUserId: task.ownerUserId,
    metadata: buildSocialAgentMessageMetadata(task, stepId, metadata),
  };
}

export function buildSocialAgentMessageSendOptions(
  task: AgentTask,
  stepId: string,
  input: Record<string, unknown>,
  canRunAsConfirmedUserAction: ConfirmationPredicate,
) {
  const metadata = buildSocialAgentMessageMetadata(
    task,
    stepId,
    input.metadata,
  );
  if (
    !task.agentConnectionId &&
    canRunAsConfirmedUserAction(SocialAgentToolName.SendMessage, input)
  ) {
    return {
      senderType: 'user' as const,
      senderAgentId: null,
      agentConnectionId: null,
      ownerUserId: task.ownerUserId,
      actorUserId: task.ownerUserId,
      source: 'user' as const,
      metadata,
    };
  }
  return {
    senderType: 'agent' as const,
    senderAgentId: task.agentConnectionId,
    agentConnectionId: task.agentConnectionId,
    ownerUserId: task.ownerUserId,
    actorUserId: task.ownerUserId,
    source: 'ai_delegate' as const,
    metadata,
  };
}

export function buildSocialAgentDelegateMessageOptions(
  task: AgentTask,
  stepId: string,
  rawMetadata: unknown,
) {
  return {
    senderType: 'agent' as const,
    senderAgentId: task.agentConnectionId,
    agentConnectionId: task.agentConnectionId,
    ownerUserId: task.ownerUserId,
    actorUserId: task.ownerUserId,
    source: 'ai_delegate' as const,
    metadata: buildSocialAgentMessageMetadata(task, stepId, rawMetadata),
  };
}
