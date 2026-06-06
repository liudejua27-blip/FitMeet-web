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

@Injectable()
export class SocialAgentMainAgentTurnEventsService {
  private readonly logger = new Logger(
    SocialAgentMainAgentTurnEventsService.name,
  );

  constructor(
    @InjectRepository(AgentTaskEvent)
    private readonly eventRepo: Repository<AgentTaskEvent>,
  ) {}

  async writeEvent(
    task: AgentTask,
    eventType: AgentTaskEventType,
    summary: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.eventRepo.save(
        this.eventRepo.create({
          taskId: task.id,
          ownerUserId: task.ownerUserId,
          eventType,
          actor: AgentTaskEventActor.Agent,
          summary,
          payload: sanitizeForDisplay(payload) as Record<string, unknown>,
        }),
      );
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.main_agent_turn.event_write_failed',
          taskId: task.id,
          eventType,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  async readTaskEvents(
    task: AgentTask,
    ownerUserId: number,
  ): Promise<Array<Record<string, unknown>>> {
    const events = await this.eventRepo.find({
      where: { taskId: task.id, ownerUserId },
      order: { createdAt: 'ASC', id: 'ASC' },
      take: 500,
    });
    return events.map((event) =>
      sanitizeForDisplay({
        id: event.id,
        taskId: event.taskId,
        eventType: event.eventType,
        actor: event.actor,
        summary: event.summary,
        payload: event.payload,
        stepId: event.stepId,
        toolCallId: event.toolCallId,
        createdAt: event.createdAt,
      }),
    ) as Array<Record<string, unknown>>;
  }
}
