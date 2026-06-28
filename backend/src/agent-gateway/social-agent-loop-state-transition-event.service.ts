import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { sanitizeForDisplay } from '../common/display-text.util';
import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskEventActor,
  AgentTaskEventType,
} from './entities/agent-task.entity';

export type SocialAgentLoopStateTransitionInput = {
  task: Pick<AgentTask, 'id' | 'ownerUserId'>;
  fromState?: string | null;
  toState: string;
  publicLoopStage?: string | null;
  workflowState?: string | null;
  reason?: string | null;
  payload?: Record<string, unknown>;
};

@Injectable()
export class SocialAgentLoopStateTransitionEventService {
  private readonly logger = new Logger(
    SocialAgentLoopStateTransitionEventService.name,
  );

  constructor(
    @InjectRepository(AgentTaskEvent)
    private readonly eventRepo: Repository<AgentTaskEvent>,
  ) {}

  async writeTransition(
    input: SocialAgentLoopStateTransitionInput,
  ): Promise<void> {
    try {
      await this.eventRepo.save(
        this.eventRepo.create({
          taskId: input.task.id,
          ownerUserId: input.task.ownerUserId,
          eventType: AgentTaskEventType.LoopStateTransition,
          actor: AgentTaskEventActor.System,
          summary: this.summary(input),
          payload: sanitizeForDisplay({
            fromState: input.fromState ?? null,
            toState: input.toState,
            publicLoopStage: input.publicLoopStage ?? null,
            workflowState: input.workflowState ?? null,
            reason: input.reason ?? null,
            ...(input.payload ?? {}),
          }) as Record<string, unknown>,
        }),
      );
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.loop_state_transition_event_write_failed',
          taskId: input.task.id,
          fromState: input.fromState ?? null,
          toState: input.toState,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private summary(input: SocialAgentLoopStateTransitionInput): string {
    const from = input.fromState?.trim() || 'unknown';
    const to = input.toState.trim();
    return `Loop state transition: ${from} -> ${to}`.slice(0, 500);
  }
}
