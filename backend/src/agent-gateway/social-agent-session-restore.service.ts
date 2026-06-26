import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';
import { AgentApprovalService } from './agent-approval.service';
import { AgentRunCheckpointService } from './agent-run-checkpoint.service';
import { AgentSessionAssemblerService } from './agent-session-assembler.service';
import type { AgentApprovalRequest } from './entities/agent-approval-request.entity';
import {
  AgentRunCheckpoint,
  AgentRunCheckpointStatus,
  AgentRunCheckpointType,
} from './entities/agent-run-checkpoint.entity';
import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import type {
  SocialAgentAsyncRunSnapshot,
  SocialAgentChatReplanRunResult,
  SocialAgentChatRunResult,
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
import { socialAgentContextTurnLimit } from './social-agent-context-window';

type VisibleStepLabeler = (id: string, label: string) => string;

@Injectable()
export class SocialAgentSessionRestoreService {
  private readonly logger = new Logger(SocialAgentSessionRestoreService.name);
  private readonly restorableTaskStatuses = [
    AgentTaskStatus.Pending,
    AgentTaskStatus.Planning,
    AgentTaskStatus.AwaitingConfirmation,
    AgentTaskStatus.Executing,
    AgentTaskStatus.WaitingResult,
    AgentTaskStatus.WaitingReply,
  ];

  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    @InjectRepository(AgentTaskEvent)
    private readonly eventRepo: Repository<AgentTaskEvent>,
    private readonly approvals: AgentApprovalService,
    private readonly runState: SocialAgentRunStateService,
    private readonly assembler: AgentSessionAssemblerService,
    @Optional()
    private readonly checkpoints?: AgentRunCheckpointService,
    @Optional()
    private readonly config?: ConfigService,
  ) {}

  findLatestRestorableTask(ownerUserId: number): Promise<AgentTask | null> {
    return this.taskRepo.findOne({
      where: {
        ownerUserId,
        taskType: In([
          'social_agent',
          'social_agent_chat',
          'social_search',
          'activity_search',
        ]),
        status: In(this.restorableTaskStatuses),
      },
      order: { updatedAt: 'DESC' },
    });
  }

  async buildSessionSnapshot(input: {
    ownerUserId: number;
    task: AgentTask | null;
    visibleStepLabel: VisibleStepLabeler;
    includeNonRestorable?: boolean;
  }): Promise<SocialAgentSessionSnapshot> {
    const restoredAt = new Date().toISOString();
    if (!input.task) return this.assembler.emptySession(restoredAt);
    if (!input.includeNonRestorable && !this.isRestorableTask(input.task)) {
      return this.assembler.emptySession(restoredAt);
    }

    const context = await this.readTaskSessionContext(
      input.ownerUserId,
      input.task,
      input.visibleStepLabel,
      'session',
    );

    if (
      !input.includeNonRestorable &&
      this.shouldHideGenericCheckpointSession(input.task, context)
    ) {
      return this.assembler.emptySession(restoredAt);
    }

    return this.assembler.buildSessionSnapshot({
      task: input.task,
      events: context.events,
      result: context.result,
      latestRun: context.latestRun,
      pendingApprovals: context.pendingApprovals,
      conversationHistory: this.conversationHistory(input.task),
      restoredAt,
    });
  }

  private isRestorableTask(task: AgentTask): boolean {
    if (!this.restorableTaskStatuses.includes(task.status)) return false;
    const reason = cleanDisplayText(task.statusReason, '').trim();
    if (reason === 'task_conversation_unbound') return false;
    if (reason === 'social_intent_publish_dismissed') return false;
    if (this.hasDismissedSocialIntent(task)) return false;
    if (
      task.status === AgentTaskStatus.WaitingReply &&
      task.agentConnectionId == null
    ) {
      return false;
    }
    return true;
  }

  private hasDismissedSocialIntent(task: AgentTask): boolean {
    const result = this.record(task.result);
    const memory = this.record(task.memory);
    const publishSocialRequest = this.record(result.publishSocialRequest);
    const chatRun = this.record(result.chatRun);
    const socialAgentChat = this.record(memory.socialAgentChat);
    return [publishSocialRequest, chatRun, socialAgentChat].some(
      (record) =>
        record.dismissed === true ||
        this.text(record.publishStatus) === 'dismissed' ||
        this.text(record.status) === 'dismissed',
    );
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
        conversationHistory: this.conversationHistory(input.task),
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
    const [events, approvalRows, latestCheckpoint] = await Promise.all([
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
      this.checkpoints?.latestForTask(ownerUserId, task.id).catch((error) => {
        this.logger.warn(
          JSON.stringify({
            event: `social_agent.${source}.checkpoint_restore_failed`,
            taskId: task.id,
            message: error instanceof Error ? error.message : String(error),
          }),
        );
        return null;
      }) ?? Promise.resolve(null),
    ]);
    const eventDtos = events.map((event) => this.toEventDto(event));
    const pendingApprovals = approvalRows.map((approval) =>
      this.assembler.toPendingApprovalSnapshot(approval),
    );
    const latestRun = this.runState.readLatestStoredRun(task, visibleStepLabel);
    const result = this.withCheckpointRuntime(
      readSocialAgentRestorableResult({
        task,
        latestRun,
        events: eventDtos,
        visibleStepLabel,
      }),
      task,
      latestCheckpoint,
      pendingApprovals,
    );

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

  private conversationHistory(task: AgentTask) {
    return readSocialAgentConversationHistory(
      task,
      socialAgentContextTurnLimit(this.config),
    );
  }

  private withCheckpointRuntime(
    result: ReturnType<typeof readSocialAgentRestorableResult>,
    task: AgentTask,
    checkpoint: AgentRunCheckpoint | null,
    pendingApprovals: SocialAgentPendingApprovalSnapshot[],
  ): ReturnType<typeof readSocialAgentRestorableResult> {
    if (!checkpoint) return result;
    const runtime = {
      checkpointId: checkpoint.id,
      checkpointType: checkpoint.type,
      threadId:
        typeof checkpoint.state?.threadId === 'string'
          ? checkpoint.state.threadId
          : `agent-task:${task.id}`,
      canResume:
        checkpoint.status === AgentRunCheckpointStatus.Active &&
        checkpoint.type === AgentRunCheckpointType.Interrupt,
      canReplay: checkpoint.status === AgentRunCheckpointStatus.Active,
      canFork: checkpoint.status === AgentRunCheckpointStatus.Active,
      parentCheckpointId: checkpoint.parentCheckpointId ?? null,
      interrupt:
        typeof checkpoint.state?.interrupt === 'object' &&
        checkpoint.state.interrupt !== null
          ? checkpoint.state.interrupt
          : null,
    };
    if (result) {
      return {
        ...this.sanitizeRestoredResult(result, pendingApprovals),
        runtime: {
          ...(result.runtime ?? {}),
          ...runtime,
        },
      };
    }
    return {
      taskId: task.id,
      status: task.status,
      visibleSteps: Array.isArray(checkpoint.steps)
        ? checkpoint.steps.map((step) => ({ ...step }))
        : [],
      assistantMessage: this.safeCheckpointMessage(pendingApprovals),
      cards: [],
      socialRequestDraft: null,
      candidates: [],
      events: [],
      safeStatus: {
        blocked: false,
        level: 'low',
        boundaryNotes: [],
        requiredConfirmations: [],
      },
      approvalRequiredActions: [],
      runtime,
    } as unknown as SocialAgentChatRunResult;
  }

  private sanitizeRestoredResult(
    result: SocialAgentChatRunResult | SocialAgentChatReplanRunResult,
    pendingApprovals: SocialAgentPendingApprovalSnapshot[],
  ): SocialAgentChatRunResult | SocialAgentChatReplanRunResult {
    const assistantMessage = cleanDisplayText(result.assistantMessage, '');
    if (!this.isStaleCheckpointCopy(assistantMessage)) return result;
    return {
      ...result,
      assistantMessage: this.safeCheckpointMessage(pendingApprovals),
      message: this.safeCheckpointMessage(pendingApprovals),
      approvalRequiredActions:
        pendingApprovals.length > 0 ? result.approvalRequiredActions : [],
    };
  }

  private safeCheckpointMessage(
    pendingApprovals: SocialAgentPendingApprovalSnapshot[],
  ): string {
    if (pendingApprovals.length > 0) {
      return '还有一步需要你确认，我会在确认后继续。';
    }
    return '我可以继续上次的话题，也可以重新开始。';
  }

  private isStaleCheckpointCopy(value: string): boolean {
    if (!value) return false;
    return [
      '原始目标',
      '从已保存的步骤继续',
      '从已保存的工具步骤',
      '从已保存的 Agent 状态',
      '继续刚才保存的 Agent 步骤',
    ].some((pattern) => value.includes(pattern));
  }

  private record(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private text(value: unknown): string {
    return cleanDisplayText(value, '').trim();
  }

  private shouldHideGenericCheckpointSession(
    task: AgentTask,
    context: {
      pendingApprovals: SocialAgentPendingApprovalSnapshot[];
      result: ReturnType<typeof readSocialAgentRestorableResult>;
    },
  ): boolean {
    if (context.pendingApprovals.length > 0 || !context.result) return false;
    const result = context.result;
    if (result.assistantMessage !== this.safeCheckpointMessage([])) {
      return false;
    }
    if (
      result.socialRequestDraft ||
      (result.candidates?.length ?? 0) > 0 ||
      (result.cards?.length ?? 0) > 0 ||
      (result.approvalRequiredActions?.length ?? 0) > 0
    ) {
      return false;
    }
    return this.isGenericOrdinaryGoal(cleanDisplayText(task.goal, ''));
  }

  private isGenericOrdinaryGoal(goal: string): boolean {
    const normalized = goal.trim().toLowerCase();
    if (!normalized) return true;
    if (
      /找人|约练|搭子|活动|认识|交友|好友|邀请|候选|匹配|理想型|羽毛球|跑步|健身|户外|篮球|骑行|瑜伽|游泳/.test(
        normalized,
      )
    ) {
      return false;
    }
    return /你有什么功能|有什么功能|能做什么|会做什么|可以做什么|怎么用|如何使用|怎么使用|使用说明|介绍一下|介绍你自己|help|hello|你好|普通聊天|功能咨询|为什么|怎么回事|我的记忆|记忆.*没|上下文.*没|隐私|安全吗|安全性|数据/.test(
      normalized,
    );
  }
}
