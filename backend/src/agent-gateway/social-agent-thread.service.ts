import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';

import { cleanDisplayText } from '../common/display-text.util';
import {
  REDACTED_VALUE,
  redactSensitiveText,
} from '../common/privacy-redaction.util';
import {
  AgentTask,
  type AgentTaskMemory,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentSessionQueryService } from './social-agent-session-query.service';
import { SocialAgentTaskLifecycleService } from './social-agent-task-lifecycle.service';
import {
  inferSocialAgentThreadTitle,
  isGenericSocialAgentThreadTitle,
} from './social-agent-thread-title.util';
import { socialCodexThreadIdForTask } from './social-codex-runtime-model';

const CHAT_TASK_TYPES = [
  'social_agent',
  'social_agent_chat',
  'social_search',
  'activity_search',
];
const GENERIC_RECOVERY_PREVIEW_RE =
  /保留当前(?:对话|方向|上下文|需求)|稍后再试|暂时没有顺利完成|连接中断|连接恢复|处理时间有点久|可以稍后再试|我已经恢复了(?:上一次|这段|当前)|我可以继续上次的话题，也可以重新开始|从已保存的(?:步骤|工具步骤|Agent 状态)|继续刚才保存的 Agent 步骤|原始目标|已从刚才的确认点继续处理/;

type BranchSnapshotInput = {
  activeBranchId?: string | null;
  branchSelections?: Record<string, number> | null;
  branchCount?: number | null;
  parentMessageId?: string | null;
  updatedAt?: string | null;
  metadata?: Record<string, unknown> | null;
} | null;

type AssistantThreadMemory = {
  activeBranchId?: string | null;
  branchSelections?: Record<string, number>;
  branchCount?: number;
  parentMessageId?: string | null;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class SocialAgentThreadService {
  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    private readonly sessionQueries: SocialAgentSessionQueryService,
    private readonly taskLifecycle: SocialAgentTaskLifecycleService,
  ) {}

  async list(ownerUserId: number, limit = 40) {
    const take = Math.min(Math.max(Math.trunc(limit) || 40, 1), 80);
    const tasks = await this.taskRepo.find({
      where: {
        ownerUserId,
        taskType: In(CHAT_TASK_TYPES),
        status: Not(AgentTaskStatus.Cancelled),
      },
      order: { updatedAt: 'DESC' },
      take,
    });
    return {
      threads: tasks
        .filter((task) => this.isDisplayableThreadTask(task))
        .map((task) => this.toThreadDto(task)),
    };
  }

  async create(ownerUserId: number, title?: string | null) {
    const safeTitle = cleanDisplayText(title, '').slice(0, 120);
    const task = await this.taskLifecycle.createOrReuseTask({
      ownerUserId,
      goal: safeTitle || '新对话',
      permissionMode: AgentTaskPermissionMode.Confirm,
      idempotencyKey: `agent-thread:${ownerUserId}:${Date.now()}:${Math.random()
        .toString(36)
        .slice(2, 10)}`,
    });
    task.title = safeTitle || '新对话';
    task.goal = '';
    task.status = AgentTaskStatus.AwaitingFeedback;
    await this.taskRepo.save(task);
    return { thread: this.toThreadDto(task) };
  }

  async get(ownerUserId: number, threadId: number) {
    const task = await this.taskLifecycle.assertTaskOwner(
      threadId,
      ownerUserId,
    );
    if (!this.isDisplayableThreadTask(task)) {
      throw new NotFoundException(`Social agent thread ${threadId} not found`);
    }
    const session = await this.sessionQueries.getTaskSession(
      ownerUserId,
      task.id,
    );
    return {
      thread: this.toThreadDto(task),
      session,
    };
  }

  async update(
    ownerUserId: number,
    threadId: number,
    title?: string | null,
    branchSnapshot?: BranchSnapshotInput,
    metadata?: Record<string, unknown> | null,
  ) {
    const task = await this.taskLifecycle.assertTaskOwner(
      threadId,
      ownerUserId,
    );
    if (title !== undefined) {
      task.title =
        cleanDisplayText(title, task.title).slice(0, 120) || task.title;
    }
    if (branchSnapshot !== undefined) {
      task.memory = this.writeAssistantThreadMemory(
        task.memory,
        branchSnapshot,
        metadata,
      );
    } else if (metadata !== undefined) {
      task.memory = this.writeAssistantThreadMemory(
        task.memory,
        this.readAssistantThreadMemory(task.memory) ?? {
          activeBranchId: null,
          branchSelections: {},
          branchCount: 0,
          parentMessageId: null,
          updatedAt: new Date().toISOString(),
        },
        metadata,
      );
    }
    await this.taskRepo.save(task);
    return { thread: this.toThreadDto(task) };
  }

  async delete(ownerUserId: number, threadId: number) {
    const task = await this.taskLifecycle.assertTaskOwner(
      threadId,
      ownerUserId,
    );
    task.status = AgentTaskStatus.Cancelled;
    task.statusReason = 'user_deleted_thread';
    await this.taskRepo.save(task);
    return { ok: true };
  }

  private toThreadDto(task: AgentTask) {
    const goal = cleanDisplayText(task.goal, '');
    const firstMessage = this.firstMessageFromTask(task);
    const threadId = socialCodexThreadIdForTask(task.id);
    const title = isGenericSocialAgentThreadTitle(task.title)
      ? inferSocialAgentThreadTitle({
          title: task.title,
          goal,
          firstMessage,
        })
      : cleanDisplayText(task.title, '') || inferSocialAgentThreadTitle({ goal, firstMessage });
    return {
      id: threadId,
      threadId,
      taskId: task.id,
      title,
      preview: this.threadPreview(goal, firstMessage),
      status: task.status,
      goal,
      messageCount: this.messageCount(task),
      updatedAt: task.updatedAt.toISOString(),
      createdAt: task.createdAt.toISOString(),
      branch: this.readAssistantThreadMemory(task.memory),
      custom: {
        permissionMode: task.permissionMode,
        taskType: task.taskType,
        assistantThread: this.readAssistantThreadMemory(task.memory),
      },
    };
  }

  private isDisplayableThreadTask(task: AgentTask): boolean {
    if (task.status === AgentTaskStatus.Cancelled) return false;
    return !(
      task.status === AgentTaskStatus.Failed &&
      cleanDisplayText(task.statusReason, '').trim() ===
        'task_conversation_unbound'
    );
  }

  private messageCount(task: AgentTask): number {
    const memoryMessages = task.memory?.messages;
    if (Array.isArray(memoryMessages)) return memoryMessages.length;
    const conversationTurns = this.turnArray(task.memory?.socialAgentConversation);
    if (conversationTurns.length > 0) return conversationTurns.length;
    const recentTurns = this.turnArray(task.memory?.shortTerm);
    if (recentTurns.length > 0) return recentTurns.length;
    const resultMessages = task.result?.messages;
    if (Array.isArray(resultMessages)) return resultMessages.length;
    return 0;
  }

  private firstMessageFromTask(task: AgentTask): string {
    const inputFirstMessage =
      typeof task.input?.firstMessage === 'string' ? task.input.firstMessage : '';
    if (inputFirstMessage.trim()) return cleanDisplayText(inputFirstMessage, '');
    const memoryMessages = task.memory?.messages;
    if (Array.isArray(memoryMessages)) {
      const userMessage = memoryMessages.find(
        (message) =>
          message &&
          typeof message === 'object' &&
          (message as { role?: unknown }).role === 'user',
      ) as { content?: unknown; text?: unknown } | undefined;
      const text =
        typeof userMessage?.content === 'string'
          ? userMessage.content
          : typeof userMessage?.text === 'string'
            ? userMessage.text
            : '';
      return cleanDisplayText(text, '');
    }
    const conversationText = this.firstUserTextFromTurns(
      this.turnArray(task.memory?.socialAgentConversation),
    );
    if (conversationText) return conversationText;
    const shortTermText = this.firstUserTextFromTurns(
      this.turnArray(task.memory?.shortTerm),
    );
    if (shortTermText) return shortTermText;
    return '';
  }

  private turnArray(value: unknown): Array<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const turns =
      (value as { turns?: unknown; recentTurns?: unknown }).turns ??
      (value as { recentTurns?: unknown }).recentTurns;
    return Array.isArray(turns)
      ? turns.filter(
          (turn): turn is Record<string, unknown> =>
            Boolean(turn) && typeof turn === 'object' && !Array.isArray(turn),
        )
      : [];
  }

  private firstUserTextFromTurns(turns: Array<Record<string, unknown>>): string {
    const userTurn = turns.find((turn) => turn.role === 'user');
    const text =
      typeof userTurn?.content === 'string'
        ? userTurn.content
        : typeof userTurn?.text === 'string'
          ? userTurn.text
          : '';
    return cleanDisplayText(text, '');
  }

  private threadPreview(goal: string, firstMessage: string): string | null {
    const cleanFirstMessage = cleanDisplayText(firstMessage, '');
    if (cleanFirstMessage) return cleanFirstMessage;
    const cleanGoal = cleanDisplayText(goal, '');
    if (!cleanGoal || GENERIC_RECOVERY_PREVIEW_RE.test(cleanGoal)) return null;
    return cleanGoal;
  }

  private readAssistantThreadMemory(
    memory: AgentTaskMemory | null | undefined,
  ): AssistantThreadMemory | null {
    const value = memory?.assistantThread;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const record = value as Record<string, unknown>;
    const branchSelections =
      record.branchSelections &&
      typeof record.branchSelections === 'object' &&
      !Array.isArray(record.branchSelections)
        ? Object.fromEntries(
            Object.entries(record.branchSelections as Record<string, unknown>)
              .map(([key, raw]) => [key, Number(raw)] as const)
              .filter((entry) => Number.isFinite(entry[1]) && entry[1] > 0),
          )
        : {};
    return {
      activeBranchId: cleanDisplayText(record.activeBranchId, '') || null,
      branchSelections,
      branchCount: Number.isFinite(Number(record.branchCount))
        ? Math.max(0, Math.trunc(Number(record.branchCount)))
        : 0,
      parentMessageId: cleanDisplayText(record.parentMessageId, '') || null,
      updatedAt:
        cleanDisplayText(record.updatedAt, '') || new Date().toISOString(),
      metadata: this.readMetadata(record.metadata),
    };
  }

  private writeAssistantThreadMemory(
    memory: AgentTaskMemory | null | undefined,
    snapshot: BranchSnapshotInput,
    metadata?: Record<string, unknown> | null,
  ): AgentTaskMemory {
    const current = { ...(memory ?? {}) } as AgentTaskMemory & {
      assistantThread?: AssistantThreadMemory;
    };
    if (!snapshot) {
      delete current.assistantThread;
      return current;
    }
    const branchSelections =
      snapshot.branchSelections && typeof snapshot.branchSelections === 'object'
        ? Object.fromEntries(
            Object.entries(snapshot.branchSelections)
              .map(
                ([key, raw]) =>
                  [cleanDisplayText(key, ''), Number(raw)] as const,
              )
              .filter(
                (entry) =>
                  entry[0] && Number.isFinite(entry[1]) && entry[1] > 0,
              ),
          )
        : {};
    current.assistantThread = {
      activeBranchId: cleanDisplayText(snapshot.activeBranchId, '') || null,
      branchSelections,
      branchCount: Number.isFinite(Number(snapshot.branchCount))
        ? Math.max(0, Math.trunc(Number(snapshot.branchCount)))
        : Object.keys(branchSelections).length,
      parentMessageId: cleanDisplayText(snapshot.parentMessageId, '') || null,
      updatedAt:
        cleanDisplayText(snapshot.updatedAt, '') || new Date().toISOString(),
      metadata: this.mergeAssistantThreadMetadata(
        current.assistantThread?.metadata,
        snapshot.metadata,
        metadata,
      ),
    };
    return current;
  }

  private mergeAssistantThreadMetadata(
    current: Record<string, unknown> | undefined,
    snapshot: Record<string, unknown> | null | undefined,
    incoming: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> {
    return {
      ...(current ? this.readMetadata(current) : {}),
      ...(snapshot !== undefined ? this.readMetadata(snapshot) : {}),
      ...(incoming !== undefined ? this.readMetadata(incoming) : {}),
    };
  }

  private readMetadata(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return this.sanitizeMetadataRecord(value as Record<string, unknown>);
  }

  private sanitizeMetadataRecord(
    value: Record<string, unknown>,
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(value)
        .map(
          ([key, item]) =>
            [
              cleanDisplayText(key, ''),
              this.sanitizeMetadataValue(key, item),
            ] as const,
        )
        .filter(([key]) => Boolean(key)),
    );
  }

  private sanitizeMetadataValue(key: string, value: unknown): unknown {
    if (this.shouldFullyRedactMetadataKey(key)) return REDACTED_VALUE;
    if (value == null) return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      return cleanDisplayText(redactSensitiveText(value), '');
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeMetadataValue(key, item));
    }
    if (typeof value === 'object') {
      return this.sanitizeMetadataRecord(value as Record<string, unknown>);
    }
    return null;
  }

  private shouldFullyRedactMetadataKey(key: string): boolean {
    return /token|password|secret|authorization|openid|idcard|identity|realname|legalname|bank|card/i.test(
      key,
    );
  }
}
