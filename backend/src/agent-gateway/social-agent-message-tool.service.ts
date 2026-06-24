import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { MatchService } from '../match/match.service';
import { SocialRequestCandidateStatus } from '../match/social-request-candidate.entity';
import { MessagesService } from '../messages/messages.service';
import { AgentTask } from './entities/agent-task.entity';
import {
  buildSocialAgentMessageDedupeKey,
  type SocialAgentLoopMemory,
} from './social-agent-loop-state';
import {
  buildSocialAgentConversationOptions,
  buildSocialAgentDelegateMessageOptions,
  buildSocialAgentMessageSendOptions,
} from './social-agent-message-options';
import { SocialAgentConfirmationPolicyService } from './social-agent-confirmation-policy.service';
import {
  SocialAgentTaskMemoryService,
  type SocialAgentSentMessageMemoryInput,
} from './social-agent-task-memory.service';
import { SocialAgentToolInputParserService } from './social-agent-tool-input-parser.service';
import { SocialAgentToolName } from './social-agent-tool.types';

export type SocialAgentMessageToolMessageEvent = {
  eventType: string;
  input: {
    conversationId?: string | null;
    messageId?: string | null;
    fromUserId?: number | null;
    contentPreview?: string;
    metadata?: Record<string, unknown>;
  };
};

export type SocialAgentMessageToolResult = {
  output: unknown;
  loopUpdates?: Partial<SocialAgentLoopMemory>;
  sentMessage?: SocialAgentSentMessageMemoryInput;
  messageEvent?: SocialAgentMessageToolMessageEvent;
};

@Injectable()
export class SocialAgentMessageToolService {
  private readonly logger = new Logger(SocialAgentMessageToolService.name);

  constructor(
    private readonly messages: MessagesService,
    private readonly matchService: MatchService,
    private readonly confirmationPolicy: SocialAgentConfirmationPolicyService,
    private readonly toolInput: SocialAgentToolInputParserService,
    private readonly taskMemory: SocialAgentTaskMemoryService,
  ) {}

  async sendMessage(
    task: AgentTask,
    input: Record<string, unknown>,
    stepId: string,
  ): Promise<SocialAgentMessageToolResult> {
    const text = this.toolInput.string(
      input.text ?? input.message ?? input.content,
    );
    if (!text) throw new BadRequestException('text is required');

    let conversationId = this.toolInput.string(input.conversationId);
    const targetUserId = this.toolInput.number(
      input.targetUserId ?? input.toUserId,
    );
    const targetForDedupe =
      targetUserId ?? this.taskMemory.memoryTargetUserId(task);
    const duplicateKey = buildSocialAgentMessageDedupeKey(
      targetForDedupe,
      text,
    );
    if (
      this.taskMemory.hasSocialLoopKey(task, 'sentMessageKeys', duplicateKey)
    ) {
      return {
        output: {
          skipped: true,
          duplicate: true,
          reason: 'duplicate_message_content',
          conversationId:
            conversationId ??
            this.taskMemory.socialLoopMemory(task).conversationId ??
            null,
          targetUserId: targetForDedupe ?? null,
          textPreview: this.taskMemory.preview(text),
        },
      };
    }

    if (!conversationId) {
      if (!targetUserId) {
        throw new BadRequestException(
          'targetUserId or conversationId is required',
        );
      }
      const conversation = await this.messages.startConversation(
        task.ownerUserId,
        targetUserId,
        buildSocialAgentConversationOptions(task, stepId, {
          targetUserId,
          candidateRecordId: this.toolInput.number(input.candidateRecordId),
          socialRequestId: this.toolInput.number(
            input.socialRequestId ?? input.requestId,
          ),
          toolName: SocialAgentToolName.SendMessage,
        }),
      );
      conversationId = conversation.conversationId;
    }

    const message = await this.messages.sendMessage(
      conversationId,
      task.ownerUserId,
      text,
      buildSocialAgentMessageSendOptions(
        task,
        stepId,
        input,
        (toolName, currentInput) =>
          this.confirmationPolicy.canRunAsConfirmedUserAction(
            toolName,
            currentInput,
          ),
      ),
    );
    const output = this.toolInput.asRecord(message);
    const candidate = await this.markCandidateMessaged(task, input);
    const messageId = this.toolInput.string(output.id ?? output.messageId);
    const memoryTargetUserId =
      targetUserId ?? this.taskMemory.memoryTargetUserId(task);

    return {
      output: candidate ? { ...output, candidate } : output,
      loopUpdates: {
        conversationId,
        targetUserId: memoryTargetUserId,
        lastMessageId: messageId,
        lastAgentMessageId: messageId,
        sentMessageKeys: this.taskMemory.appendSocialLoopKey(
          task,
          'sentMessageKeys',
          duplicateKey,
        ),
        sourceTool: SocialAgentToolName.SendMessage,
      },
      sentMessage: {
        id: messageId,
        conversationId,
        targetUserId: memoryTargetUserId,
        textPreview: this.taskMemory.preview(text),
        toolName: SocialAgentToolName.SendMessage,
        stepId,
      },
    };
  }

  async replyMessage(
    task: AgentTask,
    input: Record<string, unknown>,
    stepId: string,
  ): Promise<SocialAgentMessageToolResult> {
    const conversationId = this.toolInput.string(input.conversationId);
    const text = this.toolInput.string(
      input.text ?? input.message ?? input.content,
    );
    if (!conversationId) {
      throw new BadRequestException('conversationId is required');
    }
    if (!text) throw new BadRequestException('text is required');
    if (
      !task.agentConnectionId &&
      !this.confirmationPolicy.canRunAsConfirmedUserAction(
        SocialAgentToolName.ReplyMessage,
        input,
      )
    ) {
      throw new BadRequestException('agentConnectionId is required');
    }

    const targetForDedupe =
      this.toolInput.number(input.targetUserId) ??
      this.taskMemory.memoryTargetUserId(task);
    const duplicateKey = buildSocialAgentMessageDedupeKey(
      targetForDedupe,
      text,
    );
    if (
      this.taskMemory.hasSocialLoopKey(task, 'sentMessageKeys', duplicateKey)
    ) {
      return {
        output: {
          skipped: true,
          duplicate: true,
          reason: 'duplicate_message_content',
          conversationId,
          targetUserId: targetForDedupe ?? null,
          textPreview: this.taskMemory.preview(text),
        },
      };
    }

    const message = task.agentConnectionId
      ? await this.messages.sendAgentReply(
          conversationId,
          task.agentConnectionId,
          text,
          buildSocialAgentDelegateMessageOptions(task, stepId, {
            ...(this.toolInput.isRecord(input.metadata) ? input.metadata : {}),
            targetUserId: targetForDedupe,
            toolName: SocialAgentToolName.ReplyMessage,
            textPreview: this.taskMemory.preview(text),
          }),
        )
      : await this.messages.sendMessage(
          conversationId,
          task.ownerUserId,
          text,
          buildSocialAgentMessageSendOptions(
            task,
            stepId,
            input,
            (toolName, currentInput) =>
              this.confirmationPolicy.canRunAsConfirmedUserAction(
                toolName,
                currentInput,
              ),
            SocialAgentToolName.ReplyMessage,
          ),
        );
    const output = this.toolInput.asRecord(message);
    const targetUserId =
      this.toolInput.number(output.recipientUserId) ??
      this.toolInput.number(input.targetUserId) ??
      this.taskMemory.memoryTargetUserId(task);
    const messageId = this.toolInput.string(output.id ?? output.messageId);

    return {
      output: message,
      loopUpdates: {
        conversationId,
        targetUserId,
        lastMessageId: messageId,
        lastAgentMessageId: messageId,
        sentMessageKeys: this.taskMemory.appendSocialLoopKey(
          task,
          'sentMessageKeys',
          duplicateKey,
        ),
        sourceTool: SocialAgentToolName.ReplyMessage,
      },
      sentMessage: {
        id: messageId,
        conversationId,
        targetUserId,
        textPreview: this.taskMemory.preview(text),
        toolName: SocialAgentToolName.ReplyMessage,
        stepId,
      },
      messageEvent: {
        eventType: 'social_agent.reply.sent',
        input: {
          conversationId,
          messageId: messageId ?? null,
          fromUserId: targetUserId ?? null,
          contentPreview: this.taskMemory.preview(text),
          metadata: {
            agentTaskId: task.id,
            stepId,
            toolName: SocialAgentToolName.ReplyMessage,
            textPreview: this.taskMemory.preview(text),
            output,
          },
        },
      },
    };
  }

  private async markCandidateMessaged(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<{ id: number; status: SocialRequestCandidateStatus } | null> {
    const candidateInput = this.toolInput.isRecord(input.candidate)
      ? input.candidate
      : {};
    const candidateRecordId = this.toolInput.number(
      input.candidateRecordId ??
        input.candidateId ??
        candidateInput.candidateRecordId,
    );
    const socialRequestId = this.toolInput.number(
      input.socialRequestId ??
        input.requestId ??
        candidateInput.socialRequestId,
    );
    if (!candidateRecordId || !socialRequestId) return null;

    try {
      return await this.matchService.markCandidateMessaged(
        socialRequestId,
        candidateRecordId,
        task.ownerUserId,
      );
    } catch (error) {
      this.logger.warn(
        `markCandidateMessaged failed for task=${task.id}, candidate=${candidateRecordId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}
