import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';
import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskEventActor,
  AgentTaskEventType,
  AgentTaskPermissionMode,
} from './entities/agent-task.entity';
import {
  createSocialAgentRunId,
  readLatestSocialAgentStoredRun,
} from './social-agent-chat-run.presenter';
import type {
  SocialAgentAsyncRunSnapshot,
  SocialAgentChatRunBody,
  SocialAgentChatRunResult,
  SocialAgentVisibleStep,
  StreamEmit,
} from './social-agent-chat.types';
import { SocialAgentRunStateService } from './social-agent-run-state.service';
import { SocialAgentTaskLifecycleService } from './social-agent-task-lifecycle.service';
import { parseSocialAgentThreadTaskId } from './social-agent-thread-id.util';

type ExecuteRun = (
  body: SocialAgentChatRunBody,
  emit?: StreamEmit,
) => Promise<SocialAgentChatRunResult>;

@Injectable()
export class SocialAgentQueuedRunService {
  private readonly logger = new Logger(SocialAgentQueuedRunService.name);

  constructor(
    @InjectRepository(AgentTaskEvent)
    private readonly eventRepo: Repository<AgentTaskEvent>,
    private readonly runState: SocialAgentRunStateService,
    private readonly taskLifecycle: SocialAgentTaskLifecycleService,
  ) {}

  async runQueued(input: {
    ownerUserId: number;
    body: SocialAgentChatRunBody;
    executeRun: ExecuteRun;
    signal?: AbortSignal | null;
    visibleStepLabel: (id: string, label: string) => string;
    waitForCompletionMs?: number;
  }): Promise<SocialAgentAsyncRunSnapshot> {
    this.assertNotAborted(input.signal);
    const goal = cleanDisplayText(input.body.goal, '').trim();
    if (!goal) throw new BadRequestException('请输入你的社交需求');
    const permissionMode = this.normalizePermissionMode(
      input.body.permissionMode,
    );
    const idempotencyKey =
      cleanDisplayText(input.body.idempotencyKey, '') ||
      `social-agent-chat:${input.ownerUserId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    const requestedTaskId = this.requestedTaskId(input.body);
    const task = await this.taskLifecycle.createOrReuseTask({
      ownerUserId: input.ownerUserId,
      goal,
      permissionMode,
      idempotencyKey,
      taskId: requestedTaskId,
    });
    this.assertNotAborted(input.signal);
    const runId = createSocialAgentRunId();
    const queuedRun = await this.runState.queueChatRun({
      task,
      runId,
      goal,
    });

    const executionPromise = this.executeQueuedRun({
      ownerUserId: input.ownerUserId,
      taskId: task.id,
      body: {
        ...input.body,
        taskId: task.id,
        goal,
        permissionMode,
        idempotencyKey,
      },
      runId,
      executeRun: input.executeRun,
      signal: input.signal ?? null,
      visibleStepLabel: input.visibleStepLabel,
    }).catch(async (error) => {
      const recovered = await this.recoverLatestCompletedRun({
        ownerUserId: input.ownerUserId,
        taskId: task.id,
        visibleStepLabel: input.visibleStepLabel,
      });
      if (recovered) {
        this.logger.warn(
          JSON.stringify({
            event: 'social_agent.chat_run.recovered_latest_completed_run',
            taskId: task.id,
            runId,
            recoveredRunId: recovered.runId,
            message: error instanceof Error ? error.message : String(error),
          }),
        );
        return recovered;
      }
      this.logger.error(
        JSON.stringify({
          event: 'social_agent.chat_run.background_failed',
          taskId: task.id,
          runId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      await this.markRunFailed(
        input.ownerUserId,
        task.id,
        runId,
        error,
        input.visibleStepLabel,
        {
          message: '搜索失败，请稍后重试。',
          statusReason: 'chat_run_failed',
        },
      ).catch((markError) => {
        this.logger.error(
          JSON.stringify({
            event: 'social_agent.chat_run.mark_failed_failed',
            taskId: task.id,
            runId,
            message:
              markError instanceof Error
                ? markError.message
                : String(markError),
          }),
        );
      });
      return null;
    });

    const waitForCompletionMs = Math.max(0, input.waitForCompletionMs ?? 0);
    if (waitForCompletionMs > 0) {
      const completed = await this.resolveWithin(
        executionPromise,
        waitForCompletionMs,
      );
      if (completed) return completed;
      const recovered = await this.recoverLatestCompletedRun({
        ownerUserId: input.ownerUserId,
        taskId: task.id,
        visibleStepLabel: input.visibleStepLabel,
      });
      if (recovered) return recovered;
    }
    void executionPromise.catch(() => undefined);
    return queuedRun;
  }

  private async executeQueuedRun(input: {
    ownerUserId: number;
    taskId: number;
    body: SocialAgentChatRunBody;
    runId: string;
    executeRun: ExecuteRun;
    signal?: AbortSignal | null;
    visibleStepLabel: (id: string, label: string) => string;
  }): Promise<SocialAgentAsyncRunSnapshot> {
    this.assertNotAborted(input.signal);
    const visibleSteps: SocialAgentVisibleStep[] = [];
    await this.updateRunSnapshot(input, {
      status: 'running',
      phase: 'understand',
      startedAt: new Date().toISOString(),
      message: '正在理解需求',
    });
    this.assertNotAborted(input.signal);
    const result = await input.executeRun(input.body, async (event) => {
      if (input.signal?.aborted) return;
      if (event.type !== 'step') return;
      const existingIndex = visibleSteps.findIndex(
        (step) => step.id === event.step.id,
      );
      if (existingIndex >= 0) {
        visibleSteps[existingIndex] = event.step;
      } else {
        visibleSteps.push(event.step);
      }
      await this.updateRunSnapshot(input, {
        status: 'running',
        phase: event.step.id,
        message: event.step.label,
        visibleSteps: [...visibleSteps],
      });
    });
    this.assertNotAborted(input.signal);
    const task = await this.updateRunSnapshot(input, {
      status: 'completed',
      phase: 'completed',
      completedAt: new Date().toISOString(),
      message: '已完成搜索并刷新候选人',
      visibleSteps: result.visibleSteps,
      result,
      error: null,
    });
    await this.writeEvent(
      task,
      AgentTaskEventType.Note,
      'Social Agent 后台搜索已完成',
      {
        runId: input.runId,
        candidateCount: result.candidates.length,
      },
    );
    const now = new Date().toISOString();
    const storedRun =
      typeof (this.runState as Partial<SocialAgentRunStateService>)
        .readStoredRun === 'function'
        ? this.runState.readStoredRun(task, input.runId, input.visibleStepLabel)
        : null;
    return (
      storedRun ?? {
        taskId: input.taskId,
        runId: input.runId,
        status: 'completed',
        phase: 'completed',
        message: '已完成搜索并刷新候选人',
        visibleSteps: result.visibleSteps,
        queuedAt: now,
        startedAt: null,
        updatedAt: now,
        completedAt: now,
        failedAt: null,
        pollAfterMs: 1500,
        error: null,
        replan: null,
        result,
      }
    );
  }

  private async resolveWithin<T>(
    promise: Promise<T | null>,
    timeoutMs: number,
  ): Promise<T | null> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<null>((resolve) => {
          timeout = setTimeout(() => resolve(null), timeoutMs);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private async updateRunSnapshot(
    input: {
      ownerUserId: number;
      taskId: number;
      runId: string;
      visibleStepLabel: (id: string, label: string) => string;
    },
    patch: Partial<SocialAgentAsyncRunSnapshot>,
  ): Promise<AgentTask> {
    try {
      return await this.runState.updateRunSnapshot(
        input.ownerUserId,
        input.taskId,
        input.runId,
        patch,
        input.visibleStepLabel,
      );
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.chat_run.snapshot_update_failed',
          taskId: input.taskId,
          runId: input.runId,
          phase: patch.phase,
          status: patch.status,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return this.taskLifecycle.assertTaskOwner(
        input.taskId,
        input.ownerUserId,
      );
    }
  }

  private async recoverLatestCompletedRun(input: {
    ownerUserId: number;
    taskId: number;
    visibleStepLabel: (id: string, label: string) => string;
  }): Promise<SocialAgentAsyncRunSnapshot | null> {
    const task = await this.taskLifecycle
      .assertTaskOwner(input.taskId, input.ownerUserId)
      .catch(() => null);
    if (!task) return null;
    const latest = readLatestSocialAgentStoredRun(task, input.visibleStepLabel);
    if (latest?.status !== 'completed') return null;
    if (!this.isUsableChatRunResult(latest.result)) return null;
    return latest;
  }

  private isUsableChatRunResult(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const result = value as Partial<SocialAgentChatRunResult>;
    return (
      typeof result.taskId === 'number' &&
      Array.isArray(result.visibleSteps) &&
      Array.isArray(result.candidates) &&
      Array.isArray(result.cards)
    );
  }

  private async markRunFailed(
    ownerUserId: number,
    taskId: number,
    runId: string,
    error: unknown,
    visibleStepLabel: (id: string, label: string) => string,
    options: { message?: string; statusReason?: string } = {},
  ): Promise<void> {
    await this.runState.markRunFailed(
      ownerUserId,
      taskId,
      runId,
      error,
      visibleStepLabel,
      options,
    );
  }

  private assertNotAborted(signal?: AbortSignal | null): void {
    if (signal?.aborted) throw new Error('Subagent worker job cancelled.');
  }

  private requestedTaskId(body: SocialAgentChatRunBody): number | null {
    return (
      parseSocialAgentThreadTaskId(body.taskId) ??
      parseSocialAgentThreadTaskId(body.clientContext?.threadId)
    );
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
          event: 'social_agent.queued_run.event_write_failed',
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

  private normalizePermissionMode(
    mode: AgentTaskPermissionMode | undefined,
  ): AgentTaskPermissionMode {
    return mode && Object.values(AgentTaskPermissionMode).includes(mode)
      ? mode
      : AgentTaskPermissionMode.Confirm;
  }
}
