import { AgentTask } from './entities/agent-task.entity';

export type SocialAgentMessageEventInput = {
  conversationId?: string | null;
  messageId?: string | null;
  fromUserId?: number | null;
  contentPreview?: string;
  metadata?: Record<string, unknown>;
};

export type SocialAgentMessageEventPayload = {
  agentConnectionId: number;
  ownerUserId: number;
  eventType: string;
  conversationId: string | null;
  messageId: string | null;
  fromUserId: number | null;
  contentPreview: string;
  unread: true;
  dedupeKey: string;
  metadata: Record<string, unknown>;
};

export function buildSocialAgentMessageEventPayload(input: {
  task: Pick<AgentTask, 'id' | 'ownerUserId' | 'agentConnectionId'>;
  eventType: string;
  messageEvent: SocialAgentMessageEventInput;
  preview: (value?: string) => string;
}): SocialAgentMessageEventPayload | null {
  const { task, eventType, messageEvent, preview } = input;
  if (!task.agentConnectionId) return null;

  const stable =
    messageEvent.messageId ?? messageEvent.conversationId ?? `task_${task.id}`;

  return {
    agentConnectionId: task.agentConnectionId,
    ownerUserId: task.ownerUserId,
    eventType,
    conversationId: messageEvent.conversationId ?? null,
    messageId: messageEvent.messageId ?? null,
    fromUserId: messageEvent.fromUserId ?? null,
    contentPreview: preview(messageEvent.contentPreview),
    unread: true,
    dedupeKey: `${task.agentConnectionId}:${eventType}:${task.id}:${stable}`,
    metadata: {
      ...(messageEvent.metadata ?? {}),
      agentTaskId: task.id,
      eventType,
    },
  };
}
