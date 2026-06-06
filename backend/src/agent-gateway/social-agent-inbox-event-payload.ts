import { AgentTask } from './entities/agent-task.entity';

export type SocialAgentInboxEventInput = {
  conversationId?: string | null;
  messageId?: string | null;
  fromUserId?: number | null;
  contentPreview?: string;
  metadata?: Record<string, unknown>;
};

export type SocialAgentInboxEventPayload = {
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

export function buildSocialAgentInboxEventPayload(input: {
  task: Pick<AgentTask, 'id' | 'ownerUserId' | 'agentConnectionId'>;
  eventType: string;
  inboxEvent: SocialAgentInboxEventInput;
  preview: (value?: string) => string;
}): SocialAgentInboxEventPayload | null {
  const { task, eventType, inboxEvent, preview } = input;
  if (!task.agentConnectionId) return null;

  const stable =
    inboxEvent.messageId ?? inboxEvent.conversationId ?? `task_${task.id}`;

  return {
    agentConnectionId: task.agentConnectionId,
    ownerUserId: task.ownerUserId,
    eventType,
    conversationId: inboxEvent.conversationId ?? null,
    messageId: inboxEvent.messageId ?? null,
    fromUserId: inboxEvent.fromUserId ?? null,
    contentPreview: preview(inboxEvent.contentPreview),
    unread: true,
    dedupeKey: `${task.agentConnectionId}:${eventType}:${task.id}:${stable}`,
    metadata: {
      ...(inboxEvent.metadata ?? {}),
      agentTaskId: task.id,
      eventType,
    },
  };
}
