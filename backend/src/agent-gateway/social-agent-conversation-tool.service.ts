import { BadRequestException, Injectable } from '@nestjs/common';

import { MessagesService } from '../messages/messages.service';
import { AgentTask, AgentTaskEventType } from './entities/agent-task.entity';
import {
  appendSocialAgentLoopValue,
  filterPendingSocialAgentCounterpartMessages,
  toSocialAgentMessageArray,
  type SocialAgentLoopMemory,
  type SocialAgentMessageRecord,
} from './social-agent-loop-state';
import {
  buildFallbackSocialAgentReplySummary,
  buildSocialAgentReplySummaryPrompt,
} from './social-agent-next-action-decision';
import { SocialAgentTaskMemoryService } from './social-agent-task-memory.service';
import { SocialAgentToolInputParserService } from './social-agent-tool-input-parser.service';
import { SocialAgentToolJsonModelService } from './social-agent-tool-json-model.service';
import { SocialAgentToolName } from './social-agent-tool.types';
import type { SocialAgentShortTermMemory } from './social-agent-memory.util';

export type SocialAgentConversationToolInboxEvent = {
  eventType: string;
  input: {
    conversationId?: string | null;
    messageId?: string | null;
    fromUserId?: number | null;
    contentPreview?: string;
    metadata?: Record<string, unknown>;
  };
};

export type SocialAgentConversationToolTaskEvent = {
  type: AgentTaskEventType;
  input: {
    summary: string;
    payload?: Record<string, unknown>;
  };
};

export type SocialAgentConversationToolResult = {
  output: unknown;
  loopUpdates?: Partial<SocialAgentLoopMemory>;
  shortTermUpdates?: Partial<SocialAgentShortTermMemory>;
  receivedMessages?: SocialAgentMessageRecord[];
  inboxEvent?: SocialAgentConversationToolInboxEvent;
  taskEvent?: SocialAgentConversationToolTaskEvent;
};

@Injectable()
export class SocialAgentConversationToolService {
  constructor(
    private readonly messages: MessagesService,
    private readonly toolJsonModel: SocialAgentToolJsonModelService,
    private readonly toolInput: SocialAgentToolInputParserService,
    private readonly taskMemory: SocialAgentTaskMemoryService,
  ) {}

  async readTaskConversationMessages(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<SocialAgentConversationToolResult> {
    const agentConnectionId =
      task.agentConnectionId ?? this.toolInput.number(input.agentConnectionId);
    if (!agentConnectionId) {
      throw new BadRequestException('agentConnectionId is required');
    }

    const loop = this.taskMemory.socialLoopMemory(task);
    const conversationId =
      this.toolInput.string(input.conversationId) ?? loop.conversationId;
    if (!conversationId) {
      throw new BadRequestException('task memory has no bound conversationId');
    }

    const messages = toSocialAgentMessageArray(
      await this.messages.getAgentInboxMessages(
        conversationId,
        agentConnectionId,
        {
          limit: this.toolInput.number(input.limit) ?? 50,
        },
      ),
    );
    const cursor =
      this.toolInput.string(input.afterMessageId) ??
      loop.lastReadMessageId ??
      loop.lastMessageId;
    const newMessages = filterPendingSocialAgentCounterpartMessages(
      messages,
      cursor,
      loop,
      task.ownerUserId,
    );
    const latest = newMessages[newMessages.length - 1] ?? null;
    const output = {
      conversationId,
      cursor,
      newMessageCount: newMessages.length,
      newMessages,
      latestMessage: latest,
    };

    return {
      output,
      loopUpdates: {
        conversationId,
        targetUserId:
          this.toolInput.number(latest?.senderId) ??
          this.toolInput.number(input.targetUserId) ??
          loop.targetUserId ??
          null,
        lastReceivedMessageId: latest?.id ?? loop.lastReceivedMessageId ?? null,
        lastReadMessageId: latest?.id ?? loop.lastReadMessageId ?? null,
        pendingMessageId: null,
        latestReceivedMessage: latest,
        latestReceivedMessages: newMessages,
        processedMessageIds: newMessages.reduce(
          (ids, message) => appendSocialAgentLoopValue(ids, message.id),
          loop.processedMessageIds ?? [],
        ),
        sourceTool: SocialAgentToolName.ReadTaskConversationMessages,
      },
      receivedMessages: newMessages,
      taskEvent: latest
        ? {
            type: AgentTaskEventType.FeedbackReceived,
            input: {
              summary: 'Received counterpart reply for social agent task',
              payload: {
                conversationId,
                messageId: latest.id,
                newMessageCount: newMessages.length,
              },
            },
          }
        : undefined,
      inboxEvent: latest
        ? {
            eventType: 'social_agent.message.received',
            input: {
              conversationId,
              messageId: latest.id ?? null,
              fromUserId:
                this.toolInput.number(latest.senderId) ??
                loop.targetUserId ??
                null,
              contentPreview: this.taskMemory.preview(latest.text),
              metadata: {
                agentTaskId: task.id,
                conversationId,
                latestMessage: latest,
                newMessages,
                newMessageCount: newMessages.length,
              },
            },
          }
        : undefined,
    };
  }

  async summarizeReply(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<SocialAgentConversationToolResult> {
    const loop = this.taskMemory.socialLoopMemory(task);
    const messages = toSocialAgentMessageArray(
      input.messages ?? loop.latestReceivedMessages,
    );
    if (messages.length === 0) {
      throw new BadRequestException('messages are required');
    }

    const summary = await this.toolJsonModel.callJson({
      purpose: 'summarize_reply',
      prompt: buildSocialAgentReplySummaryPrompt(task, messages),
      fallback: () => buildFallbackSocialAgentReplySummary(messages),
      taskId: task.id,
    });

    return {
      output: summary,
      loopUpdates: {
        replySummary: summary,
        sourceTool: SocialAgentToolName.SummarizeReply,
      },
      shortTermUpdates: {
        replySummary: summary,
        currentStep: this.taskMemory.shortTermStep(
          'summarize_reply',
          '已总结对方回复',
          'done',
        ),
      },
      inboxEvent: {
        eventType: 'social_agent.reply.summarized',
        input: {
          conversationId: loop.conversationId ?? null,
          messageId: loop.lastReceivedMessageId ?? null,
          fromUserId: loop.targetUserId ?? null,
          contentPreview:
            this.toolInput.string(summary.summary) ?? 'Reply summarized',
          metadata: {
            agentTaskId: task.id,
            messages,
            summary,
          },
        },
      },
    };
  }
}
