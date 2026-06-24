import { BadRequestException, Injectable, Optional } from '@nestjs/common';

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
import { AgentL5RuntimeService } from './agent-l5-runtime.service';

export type SocialAgentConversationToolMessageEvent = {
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
  messageEvent?: SocialAgentConversationToolMessageEvent;
  taskEvent?: SocialAgentConversationToolTaskEvent;
};

type SocialAgentConversationToolOptions = {
  signal?: AbortSignal | null;
};

@Injectable()
export class SocialAgentConversationToolService {
  constructor(
    private readonly messages: MessagesService,
    private readonly toolJsonModel: SocialAgentToolJsonModelService,
    private readonly toolInput: SocialAgentToolInputParserService,
    private readonly taskMemory: SocialAgentTaskMemoryService,
    @Optional()
    private readonly l5Runtime?: AgentL5RuntimeService,
  ) {}

  async readTaskConversationMessages(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<SocialAgentConversationToolResult> {
    const loop = this.taskMemory.socialLoopMemory(task);
    const limit = this.toolInput.number(input.limit) ?? 50;
    const conversationId =
      this.toolInput.string(input.conversationId) ?? loop.conversationId;
    const agentConnectionId =
      task.agentConnectionId ?? this.toolInput.number(input.agentConnectionId);
    const rawMessages =
      agentConnectionId && conversationId
        ? await this.messages.getAgentConversationMessages(
            conversationId,
            agentConnectionId,
            { limit },
          )
        : task.id
          ? await this.messages.getTaskConversationMessages(task.id, {
              conversationId,
              limit,
            })
          : [];
    const messages = toSocialAgentMessageArray(rawMessages);
    const effectiveConversationId =
      conversationId ??
      messages.find((message) => message.conversationId)?.conversationId;
    if (!effectiveConversationId) {
      return this.skippedReadResult(
        task,
        loop,
        'task_conversation_unbound',
        'Task has no agent connection or bound conversation messages.',
      );
    }
    if (!agentConnectionId && messages.length === 0) {
      return this.skippedReadResult(
        task,
        loop,
        'task_conversation_not_found',
        'No task-bound conversation messages were found.',
      );
    }
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
    if (latest) {
      await this.persistReplyReceivedState({
        task,
        conversationId: effectiveConversationId,
        latest,
        newMessageCount: newMessages.length,
      });
    }
    const output = {
      conversationId: effectiveConversationId,
      cursor,
      newMessageCount: newMessages.length,
      newMessages,
      latestMessage: latest,
    };

    return {
      output,
      loopUpdates: {
        conversationId: effectiveConversationId,
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
                conversationId: effectiveConversationId,
                messageId: latest.id,
                newMessageCount: newMessages.length,
              },
            },
          }
        : undefined,
      messageEvent: latest
        ? {
            eventType: 'social_agent.message.received',
            input: {
              conversationId: effectiveConversationId,
              messageId: latest.id ?? null,
              fromUserId:
                this.toolInput.number(latest.senderId) ??
                loop.targetUserId ??
                null,
              contentPreview: this.taskMemory.preview(latest.text),
              metadata: {
                agentTaskId: task.id,
                conversationId: effectiveConversationId,
                latestMessage: latest,
                newMessages,
                newMessageCount: newMessages.length,
              },
            },
          }
        : undefined,
    };
  }

  private skippedReadResult(
    task: AgentTask,
    loop: SocialAgentLoopMemory,
    code: string,
    reason: string,
  ): SocialAgentConversationToolResult {
    return {
      output: {
        status: 'skipped',
        code,
        reason,
        retryable: false,
        taskId: task.id,
        conversationId: loop.conversationId ?? null,
        cursor: loop.lastReadMessageId ?? loop.lastMessageId ?? null,
        newMessageCount: 0,
        newMessages: [],
        latestMessage: null,
      },
      loopUpdates: {
        latestReceivedMessage: null,
        latestReceivedMessages: [],
        sourceTool: SocialAgentToolName.ReadTaskConversationMessages,
      },
      receivedMessages: [],
    };
  }

  async summarizeReply(
    task: AgentTask,
    input: Record<string, unknown>,
    options: SocialAgentConversationToolOptions = {},
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
      signal: options.signal ?? null,
    });
    await this.persistReplySummaryState({ task, messages, summary });

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
      messageEvent: {
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

  private async persistReplySummaryState(input: {
    task: AgentTask;
    messages: SocialAgentMessageRecord[];
    summary: Record<string, unknown>;
  }): Promise<void> {
    if (!this.l5Runtime) return;
    const loop = this.taskMemory.socialLoopMemory(input.task);
    const latest = input.messages[input.messages.length - 1] ?? null;
    const targetUserId =
      this.toolInput.number(latest?.senderId) ?? loop.targetUserId ?? null;
    await this.l5Runtime.transitionMeetLoop({
      ownerUserId: input.task.ownerUserId,
      agentTaskId: input.task.id,
      activityId: null,
      candidateUserId: targetUserId,
      stage: 'reply_received',
      waitingFor: 'next_action_decision',
      state: {
        conversationId: loop.conversationId ?? latest?.conversationId ?? null,
        targetUserId,
        candidateUserId: targetUserId,
        latestMessageId: latest?.id ?? loop.lastReceivedMessageId ?? null,
        replySummary: input.summary,
        replyIntent: this.toolInput.string(input.summary.intent) ?? null,
        replySentiment: this.toolInput.string(input.summary.sentiment) ?? null,
        needsReply: input.summary.needsReply,
        messageCount: input.messages.length,
        loopStage: 'reply_received',
      },
      review: null,
    });
  }

  private async persistReplyReceivedState(input: {
    task: AgentTask;
    conversationId: string;
    latest: SocialAgentMessageRecord;
    newMessageCount: number;
  }): Promise<void> {
    if (!this.l5Runtime) return;
    const loop = this.taskMemory.socialLoopMemory(input.task);
    const targetUserId =
      this.toolInput.number(input.latest.senderId) ?? loop.targetUserId ?? null;
    await this.l5Runtime.transitionMeetLoop({
      ownerUserId: input.task.ownerUserId,
      agentTaskId: input.task.id,
      activityId: null,
      candidateUserId: targetUserId,
      stage: 'reply_received',
      waitingFor: 'reply_summary',
      state: {
        conversationId: input.conversationId,
        targetUserId,
        candidateUserId: targetUserId,
        latestMessageId: input.latest.id,
        latestMessagePreview: this.taskMemory.preview(input.latest.text),
        newMessageCount: input.newMessageCount,
        loopStage: 'reply_received',
      },
      review: null,
    });
  }
}
