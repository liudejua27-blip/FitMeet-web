import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';

import { sanitizeForDisplay } from '../common/display-text.util';
import { AgentApprovalService } from './agent-approval.service';
import { AgentSessionAssemblerService } from './agent-session-assembler.service';
import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import type { AgentApprovalRequest } from './entities/agent-approval-request.entity';
import type {
  SocialAgentAsyncRunSnapshot,
  SocialAgentPendingApprovalSnapshot,
  SocialAgentSessionSnapshot,
  SocialAgentTaskTimelineSnapshot,
} from './social-agent-chat.types';
import { readSocialAgentConversationHistory } from './social-agent-chat-memory.presenter';
import {
  buildSocialAgentTimelineSnapshot,
  readSocialAgentRestorableResult,
} from './social-agent-chat-session.presenter';
import { SocialAgentRunStateService } from './social-agent-run-state.service';

type VisibleStepLabeler = (id: string, label: string) => string;

@Injectable()
export class SocialAgentSessionRestoreService {
  private readonly logger = new Logger(SocialAgentSessionRestoreService.name);

  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    @InjectRepository(AgentTaskEvent)
    private readonly eventRepo: Repository<AgentTaskEvent>,
    private readonly approvals: AgentApprovalService,
    private readonly runState: SocialAgentRunStateService,
    private readonly assembler: AgentSessionAssemblerService,
  ) {}

  findLatestRestorableTask(ownerUserId: number): Promise<AgentTask | null> {
    return this.taskRepo.findOne({
      where: {
        ownerUserId,
        taskType: In([
          'social_agent',
          'social_agent_chat',
          'social_agent_demo',
          'social_search',
          'activity_search',
        ]),
        status: Not(AgentTaskStatus.Cancelled),
      },
      order: { updatedAt: 'DESC' },
    });
  }

  async buildSessionSnapshot(input: {
    ownerUserId: number;
    task: AgentTask | null;
    visibleStepLabel: VisibleStepLabeler;
  }): Promise<SocialAgentSessionSnapshot> {
    const restoredAt = new Date().toISOString();
    if (!input.task) return this.assembler.emptySession(restoredAt);

    const context = await this.readTaskSessionContext(
      input.ownerUserId,
      input.task,
      input.visibleStepLabel,
      'session',
    );

    return this.assembler.buildSessionSnapshot({
      task: input.task,
      events: context.events,
      result: context.result,
      latestRun: context.latestRun,
      pendingApprovals: context.pendingApprovals,
      conversationHistory: readSocialAgentConversationHistory(input.task),
      restoredAt,
    });
  }

  async buildTaskTimeline(input: {
    ownerUserId: number;
    task: AgentTask;
    visibleStepLabel: VisibleStepLabeler;
  }): Promise<SocialAgentTaskTimelineSnapshot> {
    const restoredAt = new Date().toISOString();
    const context = await this.readTaskSessionContext(
      input.ownerUserId,
      input.task,
      input.visibleStepLabel,
      'timeline',
    );

    return buildSocialAgentTimelineSnapshot({
      task: input.task,
      taskSummary: this.assembler.toSessionTaskSummary(input.task),
      sessionMessages: this.assembler.buildSessionMessages({
        task: input.task,
        result: context.result,
        pendingApprovals: context.pendingApprovals,
        conversationHistory: readSocialAgentConversationHistory(input.task),
      }),
      memory: sanitizeForDisplay(input.task.memory) as Record<string, unknown>,
      result: context.result,
      events: context.events,
      latestRun: context.latestRun,
      pendingApprovals: context.pendingApprovals,
      candidateActions: this.assembler.readCandidateActions(input.task),
      restoredAt,
    });
  }

  private async readTaskSessionContext(
    ownerUserId: number,
    task: AgentTask,
    visibleStepLabel: VisibleStepLabeler,
    source: 'session' | 'timeline',
  ): Promise<{
    events: Array<Record<string, unknown>>;
    latestRun: SocialAgentAsyncRunSnapshot | null;
    pendingApprovals: SocialAgentPendingApprovalSnapshot[];
    result: ReturnType<typeof readSocialAgentRestorableResult>;
  }> {
    const [events, approvalRows] = await Promise.all([
      this.eventRepo.find({
        where: { taskId: task.id, ownerUserId },
        order: { createdAt: 'ASC', id: 'ASC' },
        take: 500,
      }),
      this.approvals.getPendingForTask(ownerUserId, task.id).catch((error) => {
        this.logger.warn(
          JSON.stringify({
            event: `social_agent.${source}.pending_approvals_failed`,
            taskId: task.id,
            message: error instanceof Error ? error.message : String(error),
          }),
        );
        return [] as AgentApprovalRequest[];
      }),
    ]);
    const eventDtos = events.map((event) => this.toEventDto(event));
    const pendingApprovals = approvalRows.map((approval) =>
      this.assembler.toPendingApprovalSnapshot(approval),
    );
    const latestRun = this.runState.readLatestStoredRun(task, visibleStepLabel);
    const result = readSocialAgentRestorableResult({
      task,
      latestRun,
      events: eventDtos,
      visibleStepLabel,
    });

    return {
      events: eventDtos,
      latestRun,
      pendingApprovals,
      result,
    };
  }

  private toEventDto(event: AgentTaskEvent): Record<string, unknown> {
    return sanitizeForDisplay({
      id: event.id,
      taskId: event.taskId,
      eventType: event.eventType,
      actor: event.actor,
      summary: event.summary,
      payload: event.payload,
      stepId: event.stepId,
      toolCallId: event.toolCallId,
      createdAt: event.createdAt,
    }) as Record<string, unknown>;
  }
}
