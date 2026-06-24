import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';
import {
  AgentConnection,
  ConnectionStatus,
} from './entities/agent-connection.entity';
import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskEventActor,
  AgentTaskEventType,
  AgentTaskPermissionMode,
  AgentTaskRiskLevel,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { parseSocialAgentThreadTaskId } from './social-agent-thread-id.util';
import { inferSocialAgentThreadTitle } from './social-agent-thread-title.util';

@Injectable()
export class SocialAgentTaskLifecycleService {
  private readonly logger = new Logger(SocialAgentTaskLifecycleService.name);

  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    @InjectRepository(AgentTaskEvent)
    private readonly eventRepo: Repository<AgentTaskEvent>,
    @InjectRepository(AgentConnection)
    private readonly connectionRepo: Repository<AgentConnection>,
  ) {}

  async createOrReuseTask(input: {
    ownerUserId: number;
    goal: string;
    permissionMode: AgentTaskPermissionMode;
    idempotencyKey: string | null;
    taskId?: number | null;
  }): Promise<AgentTask> {
    if (input.taskId) {
      return this.assertTaskOwner(input.taskId, input.ownerUserId);
    }
    if (input.idempotencyKey) {
      const existing = await this.taskRepo.findOne({
        where: {
          ownerUserId: input.ownerUserId,
          idempotencyKey: input.idempotencyKey,
        },
      });
      if (existing) return existing;
    }

    const agent = await this.resolveAgentConnection(input.ownerUserId, null);
    const task = await this.taskRepo.save(
      this.taskRepo.create({
        ownerUserId: input.ownerUserId,
        agentConnectionId: agent?.id ?? null,
        taskType: 'social_agent_chat',
        title: inferSocialAgentThreadTitle({ goal: input.goal }),
        goal: input.goal,
        input: {
          source: 'social_agent_chat',
          executionBoundary: 'recommendation_plus_confirmation',
        },
        plan: [],
        toolCalls: [],
        result: {},
        memory: {},
        status: AgentTaskStatus.Pending,
        permissionMode: input.permissionMode,
        riskLevel: AgentTaskRiskLevel.Low,
        idempotencyKey: input.idempotencyKey,
      }),
    );
    await this.writeEvent(
      task,
      AgentTaskEventType.TaskCreated,
      '已创建 Social Agent 聊天任务',
      {
        permissionMode: input.permissionMode,
      },
    );
    return task;
  }

  async ensureConversationTask(
    ownerUserId: number,
    taskId: number | null,
    message: string,
    idempotencyKeyInput?: string | null,
    threadIdInput?: string | number | null,
  ): Promise<AgentTask> {
    if (taskId) {
      return this.refreshGenericConversationTitle(
        await this.assertTaskOwner(taskId, ownerUserId),
        message,
      );
    }
    const threadId = this.positiveInt(threadIdInput);
    if (threadId) {
      return this.refreshGenericConversationTitle(
        await this.assertTaskOwner(threadId, ownerUserId),
        message,
      );
    }
    const agent = await this.resolveAgentConnection(ownerUserId, null);
    const idempotencyKey =
      cleanDisplayText(idempotencyKeyInput, '').trim() ||
      `social-agent-message:${ownerUserId}:${Date.now()}:${Math.random()
        .toString(36)
        .slice(2, 10)}`;
    const existing = await this.taskRepo.findOne({
      where: { ownerUserId, idempotencyKey },
    });
    if (existing)
      return this.refreshGenericConversationTitle(existing, message);
    const task = await this.taskRepo.save(
      this.taskRepo.create({
        ownerUserId,
        agentConnectionId: agent?.id ?? null,
        taskType: 'social_agent_chat',
        title: inferSocialAgentThreadTitle({
          firstMessage: message,
          goal: message,
        }),
        goal: message,
        input: {
          source: 'social_agent_chat',
          executionBoundary: 'conversation_then_tools',
          firstMessage: message,
        },
        plan: [],
        toolCalls: [],
        result: {},
        memory: {},
        status: AgentTaskStatus.AwaitingFeedback,
        permissionMode: AgentTaskPermissionMode.Confirm,
        riskLevel: AgentTaskRiskLevel.Low,
        idempotencyKey,
      }),
    );
    await this.writeEvent(
      task,
      AgentTaskEventType.TaskCreated,
      '已创建 Social Agent 聊天上下文',
      {
        permissionMode: task.permissionMode,
        idempotencyKey,
      },
    );
    return task;
  }

  private async refreshGenericConversationTitle(
    task: AgentTask,
    message: string,
  ): Promise<AgentTask> {
    if (task.taskType !== 'social_agent_chat') return task;
    const cleanMessage = cleanDisplayText(message, '').trim();
    if (!cleanMessage) return task;
    const nextTitle = inferSocialAgentThreadTitle({
      title: task.title,
      firstMessage: cleanMessage,
      goal: task.goal,
    });
    if (nextTitle === task.title) return task;
    const existingInput =
      task.input && typeof task.input === 'object' && !Array.isArray(task.input)
        ? task.input
        : {};
    return this.taskRepo.save({
      ...task,
      title: nextTitle,
      goal: cleanDisplayText(task.goal, '').trim() || cleanMessage,
      input: {
        ...existingInput,
        firstMessage:
          cleanDisplayText(existingInput.firstMessage, '').trim() ||
          cleanMessage,
      },
    });
  }

  async findActiveConversationTask(
    ownerUserId: number,
  ): Promise<AgentTask | null> {
    return this.taskRepo.findOne({
      where: {
        ownerUserId,
        taskType: 'social_agent_chat',
        status: In([
          AgentTaskStatus.Pending,
          AgentTaskStatus.Planning,
          AgentTaskStatus.AwaitingConfirmation,
          AgentTaskStatus.Executing,
          AgentTaskStatus.WaitingResult,
          AgentTaskStatus.WaitingReply,
          AgentTaskStatus.AwaitingFeedback,
        ]),
      },
      order: { updatedAt: 'DESC' },
    });
  }

  async assertTaskOwner(
    taskId: number,
    ownerUserId: number,
  ): Promise<AgentTask> {
    const task = await this.taskRepo.findOne({
      where: { id: taskId, ownerUserId },
    });
    if (!task)
      throw new NotFoundException(`Social agent task ${taskId} not found`);
    return task;
  }

  private async resolveAgentConnection(
    ownerUserId: number,
    preferredId: number | null,
  ): Promise<AgentConnection | null> {
    if (preferredId) {
      const explicit = await this.connectionRepo.findOne({
        where: {
          id: preferredId,
          userId: ownerUserId,
          status: ConnectionStatus.Active,
        },
      });
      if (explicit) return explicit;
    }
    return (
      (await this.connectionRepo.findOne({
        where: { userId: ownerUserId, status: ConnectionStatus.Active },
        order: { updatedAt: 'DESC' },
      })) ?? null
    );
  }

  private async writeEvent(
    task: AgentTask,
    eventType: AgentTaskEventType,
    summary: string,
    payload: Record<string, unknown> = {},
    actor: AgentTaskEventActor = AgentTaskEventActor.Agent,
  ): Promise<void> {
    try {
      await this.eventRepo.save(
        this.eventRepo.create({
          taskId: task.id,
          ownerUserId: task.ownerUserId,
          eventType,
          actor,
          summary: this.safeVarchar(summary, 500),
          payload: sanitizeForDisplay(payload) as Record<string, unknown>,
        }),
      );
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.task_lifecycle.event_write_failed',
          taskId: task.id,
          eventType,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private safeVarchar(value: unknown, max = 80): string {
    const text = cleanDisplayText(value, '');
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max - 1))}…`;
  }

  private positiveInt(value: unknown): number | null {
    return parseSocialAgentThreadTaskId(value);
  }
}
