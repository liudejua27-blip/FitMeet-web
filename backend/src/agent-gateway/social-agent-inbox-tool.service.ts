import { BadRequestException, Injectable } from '@nestjs/common';

import { MessagesService } from '../messages/messages.service';
import { AgentTask } from './entities/agent-task.entity';
import { SocialAgentToolInputParserService } from './social-agent-tool-input-parser.service';

@Injectable()
export class SocialAgentInboxToolService {
  constructor(
    private readonly messages: MessagesService,
    private readonly toolInput: SocialAgentToolInputParserService,
  ) {}

  async writeInbox(
    task: AgentTask,
    input: Record<string, unknown>,
    stepId: string,
  ): Promise<unknown> {
    const agentConnectionId =
      task.agentConnectionId ?? this.toolInput.number(input.agentConnectionId);
    if (!agentConnectionId) {
      throw new BadRequestException('agentConnectionId is required');
    }

    return this.messages.createAgentInboxEvent({
      agentConnectionId,
      ownerUserId: task.ownerUserId,
      eventType: this.toolInput.string(input.eventType) || 'agent.task.updated',
      conversationId: this.toolInput.string(input.conversationId) || null,
      messageId: this.toolInput.string(input.messageId) || null,
      requestId:
        this.toolInput.number(input.requestId ?? input.socialRequestId) ?? null,
      candidateRecordId: this.toolInput.number(input.candidateRecordId) ?? null,
      fromUserId: this.toolInput.number(input.fromUserId) ?? null,
      contentPreview: this.toolInput.string(
        input.contentPreview ?? input.summary ?? input.text,
      ),
      unread: this.toolInput.bool(input.unread) ?? true,
      dedupeKey:
        this.toolInput.string(input.dedupeKey) ||
        `${agentConnectionId}:agent.task:${task.id}:${stepId}`,
      metadata: {
        ...(this.toolInput.isRecord(input.metadata) ? input.metadata : {}),
        agentTaskId: task.id,
        stepId,
      },
    });
  }

  async readInbox(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const agentConnectionId =
      task.agentConnectionId ?? this.toolInput.number(input.agentConnectionId);

    const conversationId = this.toolInput.string(input.conversationId);
    if (conversationId) {
      if (!agentConnectionId) {
        throw new BadRequestException('agentConnectionId is required');
      }
      return {
        messages: await this.messages.getAgentInboxMessages(
          conversationId,
          agentConnectionId,
          {
            limit: this.toolInput.number(input.limit) ?? undefined,
          },
        ),
      };
    }

    return {
      events: agentConnectionId
        ? await this.messages.getAgentInboxEvents(agentConnectionId, {
            limit: this.toolInput.number(input.limit) ?? undefined,
            unreadOnly: this.toolInput.bool(input.unreadOnly) ?? undefined,
            eventType: this.toolInput.string(input.eventType) || undefined,
          })
        : await this.messages.getAgentInboxEventsForOwner(task.ownerUserId, {
            limit: this.toolInput.number(input.limit) ?? undefined,
            unreadOnly: this.toolInput.bool(input.unreadOnly) ?? undefined,
            eventType: this.toolInput.string(input.eventType) || undefined,
          }),
    };
  }

  async getConversations(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const limit = this.toolInput.number(input.limit);
    const conversations = await this.messages.getConversations(
      task.ownerUserId,
    );
    return {
      conversations: limit ? conversations.slice(0, limit) : conversations,
    };
  }

  async getAgentInbox(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const agentConnectionId =
      task.agentConnectionId ?? this.toolInput.number(input.agentConnectionId);
    const limit = this.toolInput.number(input.limit) ?? undefined;
    const conversationId = this.toolInput.string(input.conversationId);

    if (conversationId) {
      if (!agentConnectionId) {
        throw new BadRequestException('agentConnectionId is required');
      }
      return {
        messages: await this.messages.getAgentInboxMessages(
          conversationId,
          agentConnectionId,
          { limit },
        ),
      };
    }

    const unreadOnly = this.toolInput.bool(input.unreadOnly) ?? undefined;
    const eventType = this.toolInput.string(input.eventType) || undefined;

    const [conversations, events] = await Promise.all([
      agentConnectionId
        ? this.messages.getAgentInboxConversations(agentConnectionId, {
            limit,
            unreadOnly,
          })
        : Promise.resolve([]),
      agentConnectionId
        ? this.messages.getAgentInboxEvents(agentConnectionId, {
            limit,
            unreadOnly,
            eventType,
          })
        : this.messages.getAgentInboxEventsForOwner(task.ownerUserId, {
            limit,
            unreadOnly,
            eventType,
          }),
    ]);

    return { conversations, events };
  }
}
