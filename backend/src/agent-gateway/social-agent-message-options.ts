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

function text(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function compactKey(value: string): string {
  return value
    .replace(/[^A-Za-z0-9:._-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 180);
}

function messageSideEffectKey(
  prefix: string,
  task: AgentTask,
  stepId: string,
  input: Record<string, unknown>,
): string {
  const metadata = metadataRecord(input.metadata);
  const explicit = text(input.idempotencyKey) || text(metadata.idempotencyKey);
  if (explicit) return compactKey(explicit);
  const target = text(
    input.targetUserId ??
      input.candidateUserId ??
      input.toUserId ??
      metadata.targetUserId ??
      metadata.candidateUserId ??
      metadata.toUserId ??
      'conversation',
  );
  const body = text(input.text ?? input.message ?? input.content).slice(0, 48);
  return compactKey(
    [prefix, task.id, stepId || 'step', target, body || 'message'].join(':'),
  );
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
  const target = text(
    metadata.targetUserId ?? metadata.candidateUserId ?? 'target',
  );
  const idempotencyKey =
    text(metadata.idempotencyKey) ||
    compactKey(
      ['start_conversation', task.id, stepId || 'step', target].join(':'),
    );
  return {
    agentConnectionId: task.agentConnectionId,
    ownerUserId: task.ownerUserId,
    actorUserId: task.ownerUserId,
    agentTaskId: task.id,
    idempotencyKey,
    metadata: buildSocialAgentMessageMetadata(task, stepId, {
      ...metadata,
      idempotencyKey,
    }),
  };
}

export function buildSocialAgentMessageSendOptions(
  task: AgentTask,
  stepId: string,
  input: Record<string, unknown>,
  canRunAsConfirmedUserAction: ConfirmationPredicate,
  toolName: SocialAgentToolName = SocialAgentToolName.SendMessage,
) {
  const metadata = buildSocialAgentMessageMetadata(task, stepId, {
    ...metadataRecord(input.metadata),
    idempotencyKey: messageSideEffectKey('send_message', task, stepId, input),
  });
  if (!task.agentConnectionId && canRunAsConfirmedUserAction(toolName, input)) {
    return {
      senderType: 'user' as const,
      senderAgentId: null,
      agentConnectionId: null,
      ownerUserId: task.ownerUserId,
      actorUserId: task.ownerUserId,
      agentTaskId: task.id,
      idempotencyKey: text(metadata.idempotencyKey),
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
    agentTaskId: task.id,
    idempotencyKey: text(metadata.idempotencyKey),
    source: 'ai_delegate' as const,
    metadata,
  };
}

export function buildSocialAgentDelegateMessageOptions(
  task: AgentTask,
  stepId: string,
  rawMetadata: unknown,
) {
  const metadata = buildSocialAgentMessageMetadata(task, stepId, {
    ...metadataRecord(rawMetadata),
    idempotencyKey:
      text(metadataRecord(rawMetadata).idempotencyKey) ||
      compactKey(['send_agent_reply', task.id, stepId || 'step'].join(':')),
  });
  return {
    senderType: 'agent' as const,
    senderAgentId: task.agentConnectionId,
    agentConnectionId: task.agentConnectionId,
    ownerUserId: task.ownerUserId,
    actorUserId: task.ownerUserId,
    agentTaskId: task.id,
    idempotencyKey: text(metadata.idempotencyKey),
    source: 'ai_delegate' as const,
    metadata,
  };
}
