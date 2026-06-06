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
import { createSocialAgentRunId } from './social-agent-chat-run.presenter';
import type {
  SocialAgentAsyncRunSnapshot,
  SocialAgentChatRunBody,
  SocialAgentChatRunResult,
  SocialAgentVisibleStep,
  StreamEmit,
} from './social-agent-chat.types';
import { SocialAgentRunStateService } from './social-agent-run-state.service';
import { SocialAgentTaskLifecycleService } from './social-agent-task-lifecycle.service';

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
    visibleStepLabel: (id: string, label: string) => string;
  }): Promise<SocialAgentAsyncRunSnapshot> {
    const goal = cleanDisplayText(input.body.goal, '').trim();
    if (!goal) throw new BadRequestException('请输入你的社交需求');
    const permissionMode = this.normalizePermissionMode(
      input.body.permissionMode,
    );
    const idempotencyKey =
      cleanDisplayText(input.body.idempotencyKey, '') ||
      `social-agent-chat:${input.ownerUserId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    const task = await this.taskLifecycle.createOrReuseTask({
      ownerUserId: input.ownerUserId,
      goal,
      permissionMode,
      idempotencyKey,
    });
    const runId = createSocialAgentRunId();
    const queuedRun = await this.runState.queueChatRun({
      task,
      runId,
      goal,
    });

    void this.executeQueuedRun({
      ownerUserId: input.ownerUserId,
      taskId: task.id,
      body: {
        ...input.body,
        goal,
        permissionMode,
        idempotencyKey,
      },
      runId,
      executeRun: input.executeRun,
      visibleStepLabel: input.visibleStepLabel,
    }).catch((error) => {
      this.logger.error(
        JSON.stringify({
          event: 'social_agent.chat_run.background_failed',
          taskId: task.id,
          runId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      void this.markRunFailed(
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
    });

    return queuedRun;
  }

  private async executeQueuedRun(input: {
    ownerUserId: number;
    taskId: number;
    body: SocialAgentChatRunBody;
    runId: string;
    executeRun: ExecuteRun;
    visibleStepLabel: (id: string, label: string) => string;
  }): Promise<SocialAgentChatRunResult> {
    const visibleSteps: SocialAgentVisibleStep[] = [];
    await this.updateRunSnapshot(input, {
      status: 'running',
      phase: 'understand',
      startedAt: new Date().toISOString(),
      message: '正在理解需求',
    });
    const result = await input.executeRun(input.body, async (event) => {
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
    return result;
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
    return this.runState.updateRunSnapshot(
      input.ownerUserId,
      input.taskId,
      input.runId,
      patch,
      input.visibleStepLabel,
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
