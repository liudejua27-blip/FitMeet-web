import { Injectable, NotFoundException } from '@nestjs/common';

import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';
import { AgentTask } from './entities/agent-task.entity';
import { readSocialAgentTaskMemory } from './social-agent-memory.util';
import { SocialAgentRunStateService } from './social-agent-run-state.service';
import { SocialAgentSessionRestoreService } from './social-agent-session-restore.service';
import { SocialAgentTaskLifecycleService } from './social-agent-task-lifecycle.service';
import type {
  SocialAgentAsyncRunSnapshot,
  SocialAgentCurrentTaskSnapshot,
  SocialAgentSessionSnapshot,
  SocialAgentTaskTimelineSnapshot,
} from './social-agent-chat.types';
import { TonePolicyService } from './response-quality/tone-policy.service';

@Injectable()
export class SocialAgentSessionQueryService {
  constructor(
    private readonly runState: SocialAgentRunStateService,
    private readonly sessionRestore: SocialAgentSessionRestoreService,
    private readonly taskLifecycle: SocialAgentTaskLifecycleService,
    private readonly tonePolicy?: TonePolicyService,
  ) {}

  async getRunStatus(
    ownerUserId: number,
    taskId: number,
    runId: string,
  ): Promise<SocialAgentAsyncRunSnapshot> {
    const task = await this.taskLifecycle.assertTaskOwner(taskId, ownerUserId);
    const run = this.readStoredRun(task, runId);
    if (!run)
      throw new NotFoundException(`Social agent run ${runId} not found`);
    return {
      ...run,
      taskStatus: task.status,
      pollAfterMs: run.pollAfterMs ?? 1500,
    };
  }

  async getLatestSession(
    ownerUserId: number,
  ): Promise<SocialAgentSessionSnapshot> {
    const task =
      await this.sessionRestore.findLatestRestorableTask(ownerUserId);
    return this.sessionRestore.buildSessionSnapshot({
      ownerUserId,
      task,
      visibleStepLabel: (id, label) => this.userVisibleStepLabel(id, label),
    });
  }

  async getTaskSession(
    ownerUserId: number,
    taskId: number,
  ): Promise<SocialAgentSessionSnapshot> {
    const task = await this.taskLifecycle.assertTaskOwner(taskId, ownerUserId);
    return this.sessionRestore.buildSessionSnapshot({
      ownerUserId,
      task,
      visibleStepLabel: (id, label) => this.userVisibleStepLabel(id, label),
    });
  }

  async getCurrentTask(
    ownerUserId: number,
  ): Promise<SocialAgentCurrentTaskSnapshot | null> {
    const task =
      await this.sessionRestore.findLatestRestorableTask(ownerUserId);
    if (!task) return null;
    const taskMemory = readSocialAgentTaskMemory(task);
    return {
      taskId: task.id,
      status: task.status,
      agentState: taskMemory.currentTask.state,
      taskType: cleanDisplayText(task.taskType, 'social_agent_chat'),
      title: cleanDisplayText(task.title, 'FitMeet Social Agent 聊天'),
      goal: cleanDisplayText(task.goal, ''),
      memory: sanitizeForDisplay(task.memory) as Record<string, unknown>,
      result: sanitizeForDisplay(task.result) as Record<string, unknown>,
      updatedAt: this.isoDate(task.updatedAt),
      createdAt: this.isoDate(task.createdAt),
    };
  }

  async getTaskTimeline(
    ownerUserId: number,
    taskId: number,
  ): Promise<SocialAgentTaskTimelineSnapshot> {
    const task = await this.taskLifecycle.assertTaskOwner(taskId, ownerUserId);
    return this.sessionRestore.buildTaskTimeline({
      ownerUserId,
      task,
      visibleStepLabel: (id, label) => this.userVisibleStepLabel(id, label),
    });
  }

  private userVisibleStepLabel(id: string, label: string): string {
    return this.tonePolicy?.userStatus(id, label) ?? label;
  }

  private readStoredRun(
    task: AgentTask,
    runId: string,
  ): SocialAgentAsyncRunSnapshot | null {
    return this.runState.readStoredRun(task, runId, (id, label) =>
      this.userVisibleStepLabel(id, label),
    );
  }

  private isoDate(value: unknown): string {
    if (value instanceof Date) return value.toISOString();
    const text = cleanDisplayText(value, '');
    return text || new Date().toISOString();
  }
}
