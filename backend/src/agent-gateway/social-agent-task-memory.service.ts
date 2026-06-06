import { Injectable } from '@nestjs/common';

import { AgentTask } from './entities/agent-task.entity';
import {
  appendShortTermMemoryItem,
  readSocialAgentTaskMemory,
  rememberSocialAgentShortTerm,
  shortTermMemoryList,
} from './social-agent-memory.util';
import {
  appendSocialAgentLoopValue,
  socialAgentLoopStringArray,
  type SocialAgentLoopKeyField,
  type SocialAgentLoopMemory,
  type SocialAgentMessageRecord,
} from './social-agent-loop-state';
import { SocialAgentToolInputParserService } from './social-agent-tool-input-parser.service';
import { SocialAgentToolName } from './social-agent-tool.types';

export type SocialAgentSentMessageMemoryInput = {
  id?: string | null;
  conversationId: string;
  targetUserId?: number | null;
  textPreview: string;
  toolName: SocialAgentToolName;
  stepId: string;
};

@Injectable()
export class SocialAgentTaskMemoryService {
  constructor(private readonly toolInput: SocialAgentToolInputParserService) {}

  currentTaskMemory(task: AgentTask): Record<string, unknown> {
    const memory = this.toolInput.isRecord(task.memory) ? task.memory : {};
    return {
      taskId: task.id,
      ownerUserId: task.ownerUserId,
      status: task.status,
      goal: task.goal,
      permissionMode: task.permissionMode,
      taskMemory: readSocialAgentTaskMemory(task),
      shortTerm: this.toolInput.isRecord(memory.shortTerm)
        ? memory.shortTerm
        : {},
      socialLoop: this.socialLoopMemory(task),
      recentToolCalls: Array.isArray(task.toolCalls)
        ? task.toolCalls.slice(-10)
        : [],
      result: this.toolInput.isRecord(task.result) ? task.result : {},
    };
  }

  shouldWaitForReply(task: AgentTask): boolean {
    const loop = this.socialLoopMemory(task);
    return Boolean(loop.conversationId && loop.lastAgentMessageId);
  }

  rememberConversation(
    task: AgentTask,
    updates: Partial<SocialAgentLoopMemory>,
  ): void {
    const memory = this.toolInput.isRecord(task.memory) ? task.memory : {};
    const previous = this.toolInput.isRecord(memory.socialLoop)
      ? (memory.socialLoop as SocialAgentLoopMemory)
      : {};
    const next: SocialAgentLoopMemory = {
      ...previous,
      ...updates,
      taskId: task.id,
      updatedAt: new Date().toISOString(),
    };
    task.memory = {
      ...memory,
      socialLoop: next,
    };
    rememberSocialAgentShortTerm(task, {
      conversationId: next.conversationId ?? null,
      targetUserId: next.targetUserId ?? null,
      lastMessageId: next.lastMessageId ?? null,
      lastAgentMessageId: next.lastAgentMessageId ?? null,
      lastReceivedMessageId: next.lastReceivedMessageId ?? null,
      lastReadMessageId: next.lastReadMessageId ?? null,
    });
  }

  rememberSentMessage(
    task: AgentTask,
    input: SocialAgentSentMessageMemoryInput,
  ): void {
    const message = {
      id: input.id ?? `${input.stepId}:${Date.now()}`,
      conversationId: input.conversationId,
      targetUserId: input.targetUserId ?? null,
      textPreview: input.textPreview,
      toolName: input.toolName,
      stepId: input.stepId,
      sentAt: new Date().toISOString(),
    };
    rememberSocialAgentShortTerm(task, {
      conversationId: input.conversationId,
      targetUserId: input.targetUserId ?? null,
      currentStep: this.shortTermStep(
        input.stepId,
        `已执行 ${input.toolName}`,
        'done',
      ),
      sentMessages: appendShortTermMemoryItem(
        task,
        'sentMessages',
        message,
        30,
      ),
    });
  }

  rememberReceivedReplies(
    task: AgentTask,
    messages: SocialAgentMessageRecord[],
    stepId: string,
  ): void {
    let receivedReplies = shortTermMemoryList<Record<string, unknown>>(
      task,
      'receivedReplies',
    );
    for (const message of messages) {
      const id =
        this.toolInput.string(message.id) ??
        `${stepId}:${receivedReplies.length}`;
      const reply = {
        id,
        conversationId:
          this.toolInput.string(message.conversationId) ??
          this.socialLoopMemory(task).conversationId ??
          null,
        fromUserId: this.toolInput.number(message.senderId) ?? null,
        textPreview: this.preview(message.text),
        receivedAt: new Date().toISOString(),
      };
      receivedReplies = [
        ...receivedReplies.filter((item) => item.id !== id),
        reply,
      ].slice(-30);
    }
    rememberSocialAgentShortTerm(task, {
      receivedReplies,
      currentStep: this.shortTermStep(stepId, '已读取对方回复', 'done'),
    });
  }

  socialLoopMemory(task: AgentTask): SocialAgentLoopMemory {
    const memory = this.toolInput.isRecord(task.memory) ? task.memory : {};
    return this.toolInput.isRecord(memory.socialLoop)
      ? (memory.socialLoop as SocialAgentLoopMemory)
      : {};
  }

  memoryTargetUserId(task: AgentTask): number | null {
    return this.socialLoopMemory(task).targetUserId ?? null;
  }

  hasSocialLoopKey(
    task: AgentTask,
    field: SocialAgentLoopKeyField,
    key: string,
  ): boolean {
    const values = socialAgentLoopStringArray(
      this.socialLoopMemory(task)[field],
    );
    return values.includes(key);
  }

  appendSocialLoopKey(
    task: AgentTask,
    field: SocialAgentLoopKeyField,
    key: string,
  ): string[] {
    return appendSocialAgentLoopValue(
      socialAgentLoopStringArray(this.socialLoopMemory(task)[field]),
      key,
    );
  }

  shortTermStep(id: string, label: string, status: string) {
    return {
      id,
      label,
      status,
      updatedAt: new Date().toISOString(),
    };
  }

  preview(value: unknown, max = 160): string {
    const text = this.toolInput.string(value) ?? '';
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1)}…`;
  }
}
