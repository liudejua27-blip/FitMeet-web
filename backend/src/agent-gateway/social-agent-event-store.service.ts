import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskEventActor,
  AgentTaskEventType,
} from './entities/agent-task.entity';
import { sanitizeForDisplay } from '../common/display-text.util';
import type {
  SocialAgentEventV2,
  SocialAgentEventV2Visibility,
} from './social-agent-event-v2.types';
import { parseSocialAgentThreadTaskId } from './social-agent-thread-id.util';

export type SocialCodexReplayOptions = {
  afterSeq?: number | null;
  afterEventId?: string | null;
  includeDebug?: boolean;
  take?: number;
};

export type SocialCodexReplayPackage = {
  taskId: number;
  threadId: string | null;
  runId: string | null;
  eventCount: number;
  returnedCount: number;
  lastSeq: number | null;
  lastEventId: string | null;
  terminalType: 'run.completed' | 'run.failed' | null;
  pendingApproval: boolean;
  events: SocialAgentEventV2[];
};

@Injectable()
export class SocialAgentEventStore {
  private readonly logger = new Logger(SocialAgentEventStore.name);

  constructor(
    @InjectRepository(AgentTaskEvent)
    private readonly eventRepo: Repository<AgentTaskEvent>,
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
  ) {}

  async appendEvent(task: AgentTask | null, event: SocialAgentEventV2) {
    if (!task || event.visibility === 'internal') return;
    try {
      await this.eventRepo.save(
        this.eventRepo.create({
          taskId: task.id,
          ownerUserId: task.ownerUserId,
          eventType: this.eventType(event),
          actor: AgentTaskEventActor.Agent,
          summary: event.display?.title?.slice(0, 500) ?? event.type,
          payload: sanitizeForDisplay({
            socialAgentEventV2: event,
          }) as Record<string, unknown>,
        }),
      );
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.v2_event.append_failed',
          taskId: task.id,
          eventType: event.type,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  async appendEventByTaskId(
    ownerUserId: number,
    taskId: number | null,
    event: SocialAgentEventV2,
  ) {
    if (!taskId) return;
    const task = await this.taskRepo.findOne({
      where: { id: taskId, ownerUserId },
    });
    await this.appendEvent(task ?? null, event);
  }

  async listEventsByTask(taskId: number) {
    return this.eventRepo.find({
      where: { taskId },
      order: { createdAt: 'ASC' },
    });
  }

  async listSocialCodexEventsByTask(
    taskId: number,
    ownerUserId?: number | null,
    options: SocialCodexReplayOptions = {},
  ) {
    const rows = await this.eventRepo.find({
      where:
        typeof ownerUserId === 'number'
          ? { taskId, ownerUserId }
          : { taskId },
      order: { createdAt: 'ASC', id: 'ASC' },
      take: Math.max(1, Math.min(options.take ?? 1000, 2000)),
    });
    const events = rows
      .map((event) => event.payload?.socialAgentEventV2)
      .filter((event): event is SocialAgentEventV2 =>
        this.isSocialAgentEventV2(event),
      )
      .filter((event) => this.isReplayVisible(event.visibility, options));
    return this.filterReplayCursor(events, options);
  }

  async buildReplayPackage(
    taskId: number,
    ownerUserId?: number | null,
    options: SocialCodexReplayOptions = {},
  ): Promise<SocialCodexReplayPackage> {
    const allEvents = await this.listSocialCodexEventsByTask(taskId, ownerUserId, {
      ...options,
      afterSeq: null,
      afterEventId: null,
    });
    const events = this.filterReplayCursor(allEvents, options);
    const last = events.at(-1) ?? null;
    const terminalEvent = [...allEvents]
      .reverse()
      .find(
        (event) => event.type === 'run.completed' || event.type === 'run.failed',
      );
    const terminalType: 'run.completed' | 'run.failed' | null =
      terminalEvent?.type === 'run.completed' || terminalEvent?.type === 'run.failed'
        ? terminalEvent.type
        : null;
    return {
      taskId,
      threadId: last?.threadId ?? allEvents.at(-1)?.threadId ?? null,
      runId: last?.runId ?? allEvents.at(-1)?.runId ?? null,
      eventCount: allEvents.length,
      returnedCount: events.length,
      lastSeq: last?.seq ?? null,
      lastEventId: last?.eventId ?? null,
      terminalType,
      pendingApproval: allEvents.some((event, index) => {
        if (event.type !== 'approval.required') return false;
        return !allEvents
          .slice(index + 1)
          .some(
            (candidate) =>
              candidate.type === 'approval.resolved' &&
              this.sameApprovalIdentity(event, candidate),
          );
      }),
      events,
    };
  }

  async listEventsByThread(threadId: string | number) {
    const taskId = parseSocialAgentThreadTaskId(threadId);
    if (!taskId) return [];
    return this.listEventsByTask(taskId);
  }

  async getLatestRun(threadIdOrTaskId: string | number) {
    const events = await this.listEventsByThread(threadIdOrTaskId);
    return events
      .map((event) => event.payload?.socialAgentEventV2)
      .filter((event): event is SocialAgentEventV2 =>
        this.isSocialAgentEventV2(event),
      )
      .at(-1);
  }

  private eventType(event: SocialAgentEventV2): AgentTaskEventType {
    if (event.type === 'approval.required') {
      return AgentTaskEventType.ConfirmationRequested;
    }
    if (event.type === 'approval.resolved') {
      return AgentTaskEventType.ConfirmationReceived;
    }
    if (event.type === 'run.failed') return AgentTaskEventType.TaskFailed;
    if (event.type === 'run.completed') return AgentTaskEventType.TaskSucceeded;
    if (event.type === 'assistant.delta') {
      return AgentTaskEventType.SocialAgentMessageAssistant;
    }
    if (event.type === 'candidate_search.done') {
      return AgentTaskEventType.SocialAgentCandidatesReturned;
    }
    return AgentTaskEventType.Note;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private isSocialAgentEventV2(value: unknown): value is SocialAgentEventV2 {
    if (!this.isRecord(value)) return false;
    return (
      typeof value.type === 'string' &&
      typeof value.eventId === 'string' &&
      typeof value.seq === 'number' &&
      typeof value.createdAt === 'string' &&
      typeof value.userId === 'string' &&
      typeof value.threadId === 'string' &&
      typeof value.runId === 'string' &&
      typeof value.stage === 'string' &&
      typeof value.visibility === 'string'
    );
  }

  private isReplayVisible(
    visibility: SocialAgentEventV2Visibility,
    options: SocialCodexReplayOptions,
  ) {
    if (visibility === 'internal') return false;
    if (visibility === 'debug_only') return options.includeDebug === true;
    return true;
  }

  private filterReplayCursor(
    events: SocialAgentEventV2[],
    options: SocialCodexReplayOptions,
  ) {
    if (options.afterEventId) {
      const index = events.findIndex(
        (event) => event.eventId === options.afterEventId,
      );
      if (index >= 0) return events.slice(index + 1);
    }
    if (typeof options.afterSeq === 'number' && Number.isFinite(options.afterSeq)) {
      return events.filter((event) => event.seq > Number(options.afterSeq));
    }
    return events;
  }

  private sameApprovalIdentity(
    required: SocialAgentEventV2,
    resolved: SocialAgentEventV2,
  ): boolean {
    const requiredKey = this.approvalIdentity(required);
    const resolvedKey = this.approvalIdentity(resolved);
    return Boolean(requiredKey && resolvedKey && requiredKey === resolvedKey);
  }

  private approvalIdentity(event: SocialAgentEventV2): string | null {
    const payload = this.isRecord(event.payload) ? event.payload : {};
    const approvalId = this.scalar(payload.approvalId);
    if (approvalId) return `approval:${approvalId}`;
    const checkpointId =
      this.scalar(payload.checkpointId) ??
      (this.isRecord(payload.resumeCursor)
        ? this.scalar(payload.resumeCursor.checkpointId)
        : null);
    if (checkpointId) return `checkpoint:${checkpointId}`;
    const actionType = this.scalar(payload.actionType);
    if (actionType) return `action:${actionType}`;
    return null;
  }

  private scalar(value: unknown): string | null {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'string' && value.trim()) return value.trim();
    return null;
  }
}
