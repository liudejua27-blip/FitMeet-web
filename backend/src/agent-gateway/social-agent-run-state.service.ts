import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';
import { MessagesService } from '../messages/messages.service';
import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskEventActor,
  AgentTaskEventType,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import type {
  SocialAgentAsyncRunSnapshot,
  SocialAgentChatReplanRunResult,
  SocialAgentFollowUpContext,
  SocialAgentVisibleStep,
} from './social-agent-chat.types';
import type { SocialAgentPlannerResult } from './social-agent-planner.service';
import {
  readLatestSocialAgentStoredRun,
  readSocialAgentStoredRun,
  withSocialAgentStoredRun,
} from './social-agent-chat-run.presenter';

type VisibleStepLabeler = (id: string, label: string) => string;

type MarkRunFailedOptions = {
  message?: string;
  statusReason?: string;
};

@Injectable()
export class SocialAgentRunStateService {
  private readonly logger = new Logger(SocialAgentRunStateService.name);

  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    @InjectRepository(AgentTaskEvent)
    private readonly eventRepo: Repository<AgentTaskEvent>,
    private readonly messages: MessagesService,
  ) {}

  async queueChatRun(input: {
    task: AgentTask;
    runId: string;
    goal: string;
  }): Promise<SocialAgentAsyncRunSnapshot> {
    const { task, runId, goal } = input;
    const now = new Date().toISOString();
    const queuedRun: SocialAgentAsyncRunSnapshot = {
      taskId: task.id,
      runId,
      status: 'queued',
      phase: 'queued',
      message: '已收到需求，正在后台搜索候选人。',
      visibleSteps: [
        {
          id: 'task.created',
          label: '已创建 Social Agent 任务',
          status: 'done',
        },
      ],
      queuedAt: now,
      startedAt: null,
      updatedAt: now,
      completedAt: null,
      failedAt: null,
      pollAfterMs: 1500,
      taskStatus: task.status,
      error: null,
      replan: null,
      result: null,
    };
    task.status = AgentTaskStatus.Planning;
    task.statusReason = 'chat_run_queued';
    task.result = withSocialAgentStoredRun(task.result, queuedRun);
    await this.taskRepo.save(task);
    await this.writeEvent(
      task,
      AgentTaskEventType.Note,
      'Social Agent 任务已进入后台队列',
      { runId, goal },
    );
    return queuedRun;
  }

  async queueReplanRun(input: {
    task: AgentTask;
    runId: string;
    followUp: SocialAgentFollowUpContext;
  }): Promise<SocialAgentAsyncRunSnapshot> {
    const { task, runId, followUp } = input;
    const now = new Date().toISOString();
    const queuedRun: SocialAgentAsyncRunSnapshot = {
      taskId: task.id,
      runId,
      status: 'queued',
      phase: 'queued',
      message: '已收到补充，正在后台重新规划。',
      visibleSteps: [
        {
          id: 'append_context',
          label: '已写入当前任务上下文',
          status: 'done',
        },
      ],
      queuedAt: now,
      startedAt: null,
      updatedAt: now,
      completedAt: null,
      failedAt: null,
      pollAfterMs: 1500,
      error: null,
      replan: null,
      result: null,
    };
    task.status = AgentTaskStatus.Planning;
    task.statusReason = 'follow_up_replan_queued';
    task.result = withSocialAgentStoredRun(task.result, queuedRun);
    await this.taskRepo.save(task);
    await this.writeEvent(
      task,
      AgentTaskEventType.SocialAgentReplanQueued,
      '已进入后台重新规划队列',
      {
        runId,
        userMessage: followUp.userMessage,
        refreshedGoal: followUp.refreshedGoal,
      },
      AgentTaskEventActor.System,
    );
    return queuedRun;
  }

  async updateRunSnapshot(
    ownerUserId: number,
    taskId: number,
    runId: string,
    patch: Partial<SocialAgentAsyncRunSnapshot>,
    visibleStepLabel: VisibleStepLabeler,
  ): Promise<AgentTask> {
    const task = await this.assertTaskOwner(taskId, ownerUserId);
    const existing = this.readStoredRun(task, runId, visibleStepLabel);
    if (!existing) {
      throw new NotFoundException(`Social agent run ${runId} not found`);
    }

    const now = new Date().toISOString();
    const next: SocialAgentAsyncRunSnapshot = {
      ...existing,
      ...patch,
      taskId,
      runId,
      updatedAt: now,
      pollAfterMs: patch.pollAfterMs ?? existing.pollAfterMs ?? 1500,
      visibleSteps: patch.visibleSteps ?? existing.visibleSteps ?? [],
    };
    if (next.status === 'running' && !next.startedAt) next.startedAt = now;
    if (next.status === 'failed' && !next.failedAt) next.failedAt = now;
    if (next.status === 'completed' && !next.completedAt) {
      next.completedAt = now;
    }

    task.result = withSocialAgentStoredRun(task.result, next);
    if (next.status === 'running' || next.status === 'queued') {
      task.status = AgentTaskStatus.Planning;
      task.statusReason = `follow_up_replan_${next.phase}`;
    }
    if (next.status === 'failed') {
      task.status = AgentTaskStatus.AwaitingFeedback;
      task.statusReason = 'follow_up_replan_failed_context_saved';
      task.error = this.errorPayload(next.error ?? '重新规划失败');
    }
    return this.taskRepo.save(task);
  }

  async markRunFailed(
    ownerUserId: number,
    taskId: number,
    runId: string,
    error: unknown,
    visibleStepLabel: VisibleStepLabeler,
    options: MarkRunFailedOptions = {},
  ): Promise<void> {
    const errorPayload = this.errorPayload(error);
    const task = await this.updateRunSnapshot(
      ownerUserId,
      taskId,
      runId,
      {
        status: 'failed',
        phase: 'failed',
        message:
          options.message ?? '重新规划失败，已保留你的补充信息。你可以重试。',
        error: errorPayload,
      },
      visibleStepLabel,
    );
    if (options.statusReason) {
      task.statusReason = options.statusReason;
      await this.taskRepo.save(task);
    }
    await this.writeEvent(
      task,
      AgentTaskEventType.SocialAgentReplanFailed,
      '异步重新规划失败，补充信息已保留',
      { runId, error: errorPayload },
      AgentTaskEventActor.System,
    );
    await this.writeInboxEventBestEffort(task, 'social_agent.replan.failed', {
      runId,
      error: errorPayload,
    });
  }

  async completeReplanRun(input: {
    ownerUserId: number;
    taskId: number;
    runId: string;
    visibleSteps: SocialAgentVisibleStep[];
    replan: SocialAgentPlannerResult;
    result: SocialAgentChatReplanRunResult;
    visibleStepLabel: VisibleStepLabeler;
  }): Promise<AgentTask> {
    const candidateCount = input.result.candidates.length;
    const task = await this.updateRunSnapshot(
      input.ownerUserId,
      input.taskId,
      input.runId,
      {
        status: 'completed',
        phase: 'completed',
        completedAt: new Date().toISOString(),
        message: '已根据补充要求刷新计划和候选人',
        visibleSteps: [...input.visibleSteps],
        replan: input.replan,
        result: input.result,
        error: null,
      },
      input.visibleStepLabel,
    );
    await this.writeEvent(
      task,
      AgentTaskEventType.SocialAgentReplanCompleted,
      '异步重新规划已完成',
      {
        runId: input.runId,
        candidateCount,
        replanAttempt: input.replan.replanAttempt,
      },
      AgentTaskEventActor.System,
    );
    await this.writeInboxEventBestEffort(
      task,
      'social_agent.replan.completed',
      {
        runId: input.runId,
        candidateCount,
      },
    );
    return task;
  }

  readStoredRun(
    task: AgentTask,
    runId: string,
    visibleStepLabel: VisibleStepLabeler,
  ): SocialAgentAsyncRunSnapshot | null {
    return readSocialAgentStoredRun(task, runId, visibleStepLabel);
  }

  readLatestStoredRun(
    task: AgentTask,
    visibleStepLabel: VisibleStepLabeler,
  ): SocialAgentAsyncRunSnapshot | null {
    return readLatestSocialAgentStoredRun(task, visibleStepLabel);
  }

  private async assertTaskOwner(
    taskId: number,
    ownerUserId: number,
  ): Promise<AgentTask> {
    const task = await this.taskRepo.findOne({
      where: { id: taskId, ownerUserId },
    });
    if (!task) {
      throw new NotFoundException(`Social agent task ${taskId} not found`);
    }
    return task;
  }

  private async writeEvent(
    task: AgentTask,
    eventType: AgentTaskEventType,
    summary: string,
    payload: Record<string, unknown> = {},
    actor: AgentTaskEventActor = AgentTaskEventActor.Agent,
  ) {
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
          event: 'social_agent.run_state_event_write_failed',
          taskId: task.id,
          eventType,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private async writeInboxEventBestEffort(
    task: AgentTask,
    eventType: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    if (!task.agentConnectionId) return;
    try {
      await this.messages.createAgentInboxEvent({
        agentConnectionId: task.agentConnectionId,
        ownerUserId: task.ownerUserId,
        eventType,
        contentPreview:
          cleanDisplayText(metadata.error, '') || 'Social Agent 任务已更新',
        unread: true,
        dedupeKey: `${task.agentConnectionId}:${eventType}:${task.id}:${cleanDisplayText(metadata.runId, 'run')}`,
        metadata: {
          ...metadata,
          agentTaskId: task.id,
        },
      });
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.run_state_inbox_event_failed',
          taskId: task.id,
          eventType,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private errorPayload(error: unknown): Record<string, unknown> {
    const rawMessage = this.isRecord(error)
      ? cleanDisplayText(error.message, '')
      : error instanceof Error
        ? error.message
        : safeUnknownText(error);
    return {
      code: this.isRecord(error)
        ? cleanDisplayText(error.code, 'social_agent_replan_failed')
        : 'social_agent_replan_failed',
      message: cleanDisplayText(rawMessage, '重新规划失败'),
    };
  }

  private safeVarchar(value: unknown, max = 80): string {
    const text = cleanDisplayText(value, '');
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max - 1))}…`;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}

function safeUnknownText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    typeof value === 'symbol'
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}
