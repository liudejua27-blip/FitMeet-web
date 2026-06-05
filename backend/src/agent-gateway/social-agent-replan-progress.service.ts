import { Injectable, Logger } from '@nestjs/common';
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
} from './entities/agent-task.entity';
import {
  appendShortTermMemoryItem,
  rememberSocialAgentShortTerm,
} from './social-agent-memory.util';
import { SocialAgentRunStateService } from './social-agent-run-state.service';
import type { SocialAgentVisibleStep } from './social-agent-chat.types';

type CompleteReplanStepInput = {
  task: AgentTask;
  ownerUserId: number;
  taskId: number;
  runId: string;
  visibleSteps: SocialAgentVisibleStep[];
  id: string;
  label: string;
  eventType: AgentTaskEventType;
  payload?: Record<string, unknown>;
};

type CompleteReplanStepResult = {
  task: AgentTask;
  visibleSteps: SocialAgentVisibleStep[];
};

@Injectable()
export class SocialAgentReplanProgressService {
  private readonly logger = new Logger(SocialAgentReplanProgressService.name);

  constructor(
    @InjectRepository(AgentTaskEvent)
    private readonly eventRepo: Repository<AgentTaskEvent>,
    private readonly runState: SocialAgentRunStateService,
  ) {}

  async completeStep(
    input: CompleteReplanStepInput,
  ): Promise<CompleteReplanStepResult> {
    const step: SocialAgentVisibleStep = {
      id: input.id,
      label: input.label,
      status: 'done',
    };
    const visibleSteps = [...input.visibleSteps, step];

    this.rememberShortTermStep(input.task, input.id, input.label, 'running');
    this.rememberShortTermStep(input.task, input.id, input.label, 'done');
    await this.writeEvent(
      input.task,
      input.eventType,
      input.label,
      input.payload ?? {},
    );
    const task = await this.runState.updateRunSnapshot(
      input.ownerUserId,
      input.taskId,
      input.runId,
      {
        status: 'running',
        phase: input.id,
        message: input.label,
        visibleSteps,
      },
      (_, label) => label,
    );

    return { task, visibleSteps };
  }

  private rememberShortTermStep(
    task: AgentTask,
    id: string,
    label: string,
    status: string,
  ) {
    const step = {
      id,
      label,
      status,
      updatedAt: new Date().toISOString(),
    };
    rememberSocialAgentShortTerm(task, {
      currentStep: step,
      steps: appendShortTermMemoryItem(task, 'steps', step, 40),
    });
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
          event: 'social_agent.replan_progress_event_write_failed',
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
}
