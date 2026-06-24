import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';

import {
  MessagesService,
  RecentAgentConversationSignal,
} from '../messages/messages.service';
import { shouldRunBackgroundJobs } from '../common/process-role.util';
import { LifeGraphService } from '../life-graph/life-graph.service';
import {
  UserSocialRequest,
  UserSocialRequestStatus,
} from '../social-requests/social-request.entity';
import { AgentActionLogService } from './agent-action-log.service';
import {
  AgentActionRiskLevel,
  AgentActionStatus,
  AgentActionType,
} from './entities/agent-action-log.entity';
import {
  AgentConnection,
  ConnectionStatus,
} from './entities/agent-connection.entity';
import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskRiskLevel,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentPlannerService } from './social-agent-planner.service';
import { rememberSocialAgentCurrentTask } from './social-agent-memory.util';
import {
  SocialAgentRunNextResult,
  SocialAgentToolExecutorService,
  SocialAgentToolName,
} from './social-agent-tool-executor.service';

export type SocialAgentAutopilotTrigger = 'cron' | 'manual';

export interface SocialAgentAutopilotSummary {
  triggeredBy: SocialAgentAutopilotTrigger;
  skipped: boolean;
  reason?: string;
  enabled: boolean;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  maxTasksPerRun: number;
  scanned: {
    tasks: number;
    conversations: number;
    socialRequests: number;
  };
  queuedTasks: number;
  createdTasks: number;
  profileEnrichmentTasks: number;
  profileEnrichmentProposals: number;
  processedTasks: number;
  handledReplies: number;
  actionsExecuted: number;
  skippedDuplicates: number;
  errors: number;
  taskResults: Array<{
    taskId: number;
    status: AgentTaskStatus;
    executedSteps: number;
    handledReply: boolean;
    actionsExecuted: number;
  }>;
}

const ACTIVE_TASK_STATUSES = [
  AgentTaskStatus.Executing,
  AgentTaskStatus.WaitingResult,
  AgentTaskStatus.WaitingReply,
];

const ACTIVE_SOCIAL_REQUEST_STATUSES = [
  UserSocialRequestStatus.Matching,
  UserSocialRequestStatus.Matched,
  UserSocialRequestStatus.InvitationPending,
  UserSocialRequestStatus.Chatting,
];

const SYSTEM_OWNER_USER_ID = 0;

@Injectable()
export class SocialAgentAutopilotService {
  private readonly logger = new Logger(SocialAgentAutopilotService.name);
  private running = false;
  private lastRunAt: Date | null = null;
  private lastSummary: SocialAgentAutopilotSummary | null = null;

  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    @InjectRepository(UserSocialRequest)
    private readonly requestRepo: Repository<UserSocialRequest>,
    @InjectRepository(AgentConnection)
    private readonly connectionRepo: Repository<AgentConnection>,
    private readonly messages: MessagesService,
    private readonly planner: SocialAgentPlannerService,
    private readonly executor: SocialAgentToolExecutorService,
    private readonly actionLogs: AgentActionLogService,
    @Optional()
    private readonly lifeGraph?: LifeGraphService,
  ) {}

  @Cron('*/10 * * * * *')
  async onCron(): Promise<void> {
    if (!shouldRunBackgroundJobs()) return;
    if (!isEnabled()) return;
    const intervalMs = configuredIntervalMs();
    if (
      this.lastRunAt &&
      Date.now() - this.lastRunAt.getTime() < intervalMs - 1000
    ) {
      return;
    }

    try {
      await this.runOnce('cron');
    } catch (error) {
      this.logger.error(
        `Social Agent Autopilot cron failed: ${
          error instanceof Error ? error.stack || error.message : String(error)
        }`,
      );
    }
  }

  async runOnce(
    triggeredBy: SocialAgentAutopilotTrigger = 'manual',
    ownerUserId?: number,
  ): Promise<SocialAgentAutopilotSummary> {
    if (this.running) {
      const skipped = this.emptySummary(triggeredBy, 'already_running');
      this.lastSummary = skipped;
      return skipped;
    }

    this.running = true;
    this.lastRunAt = new Date();
    const summary = this.emptySummary(triggeredBy);
    summary.skipped = false;

    await this.writeAutopilotLog('social_agent_autopilot.started', {
      ownerUserId,
      actionStatus: AgentActionStatus.Planned,
      status: 'started',
      payload: { triggeredBy, ownerUserId: ownerUserId ?? null },
    });

    try {
      const tasks = new Map<number, AgentTask>();
      const maxTasks = configuredMaxTasksPerRun();

      for (const task of await this.collectStatusTasks(ownerUserId, maxTasks)) {
        tasks.set(task.id, task);
      }
      summary.scanned.tasks = tasks.size;

      await this.collectRecentConversationTasks(
        tasks,
        ownerUserId,
        maxTasks,
        summary,
      );
      await this.collectSocialRequestTasks(
        tasks,
        ownerUserId,
        maxTasks,
        summary,
      );

      summary.queuedTasks = tasks.size;
      for (const task of [...tasks.values()].slice(0, maxTasks)) {
        await this.processTask(task, summary);
      }
    } catch (error) {
      summary.errors += 1;
      await this.writeAutopilotLog('social_agent_autopilot.error', {
        ownerUserId,
        actionStatus: AgentActionStatus.Failed,
        status: 'error',
        payload: {
          triggeredBy,
          error: error instanceof Error ? error.message : String(error),
        },
        reason: error instanceof Error ? error.message : String(error),
      });
      this.logger.error(
        `Social Agent Autopilot run failed: ${
          error instanceof Error ? error.stack || error.message : String(error)
        }`,
      );
    } finally {
      this.running = false;
      summary.completedAt = new Date().toISOString();
      summary.durationMs =
        new Date(summary.completedAt).getTime() -
        new Date(summary.startedAt).getTime();
      await this.writeAutopilotLog('social_agent_autopilot.completed', {
        ownerUserId,
        actionStatus:
          summary.errors > 0
            ? AgentActionStatus.Failed
            : AgentActionStatus.Executed,
        status: summary.errors > 0 ? 'completed_with_errors' : 'completed',
        payload: summary as unknown as Record<string, unknown>,
      });
      this.lastSummary = summary;
    }

    return summary;
  }

  getStatus() {
    const intervalMs = configuredIntervalMs();
    return {
      enabled: isEnabled(),
      running: this.running,
      intervalSeconds: Math.round(intervalMs / 1000),
      maxTasksPerRun: configuredMaxTasksPerRun(),
      lastRunAt: this.lastRunAt,
      nextRunAt:
        this.lastRunAt && isEnabled()
          ? new Date(this.lastRunAt.getTime() + intervalMs)
          : null,
      lastSummary: this.lastSummary,
      env: {
        ENABLE_SOCIAL_AGENT_AUTOPILOT:
          process.env.ENABLE_SOCIAL_AGENT_AUTOPILOT ?? null,
        SOCIAL_AGENT_AUTOPILOT_INTERVAL_SECONDS:
          process.env.SOCIAL_AGENT_AUTOPILOT_INTERVAL_SECONDS ?? null,
        SOCIAL_AGENT_AUTOPILOT_MAX_TASKS_PER_RUN:
          process.env.SOCIAL_AGENT_AUTOPILOT_MAX_TASKS_PER_RUN ?? null,
        SOCIAL_AGENT_PROFILE_ENRICHMENT_ENABLED:
          process.env.SOCIAL_AGENT_PROFILE_ENRICHMENT_ENABLED ?? null,
        SOCIAL_AGENT_PROFILE_ENRICHMENT_INTERVAL_HOURS:
          process.env.SOCIAL_AGENT_PROFILE_ENRICHMENT_INTERVAL_HOURS ?? null,
      },
    };
  }

  private async collectStatusTasks(
    ownerUserId: number | undefined,
    limit: number,
  ): Promise<AgentTask[]> {
    return this.taskRepo.find({
      where: {
        status: In(ACTIVE_TASK_STATUSES),
        ...(ownerUserId != null ? { ownerUserId } : {}),
      },
      order: { updatedAt: 'DESC' },
      take: limit,
    });
  }

  private async collectRecentConversationTasks(
    tasks: Map<number, AgentTask>,
    ownerUserId: number | undefined,
    maxTasks: number,
    summary: SocialAgentAutopilotSummary,
  ): Promise<void> {
    if (tasks.size >= maxTasks) return;

    const signals = await this.messages.getRecentAgentConversationSignals({
      since: recentMessageSince(),
      limit: maxTasks * 2,
      ownerUserId,
    });
    summary.scanned.conversations = signals.length;

    const profileEnrichmentOwners = new Set<number>();
    for (const signal of signals) {
      if (tasks.size >= maxTasks) return;
      const task = await this.taskForConversationSignal(signal, summary);
      if (task) tasks.set(task.id, task);
      if (!profileEnrichmentOwners.has(signal.ownerUserId)) {
        profileEnrichmentOwners.add(signal.ownerUserId);
        await this.createPeriodicProfileEnrichmentTask(signal, summary);
      }
    }
  }

  private async createPeriodicProfileEnrichmentTask(
    signal: RecentAgentConversationSignal,
    summary: SocialAgentAutopilotSummary,
  ): Promise<AgentTask | null> {
    if (!this.lifeGraph || !isProfileEnrichmentEnabled()) return null;
    const sourceMessage = profileEnrichmentSourceText(signal.text);
    if (!sourceMessage) return null;

    const since = profileEnrichmentSince();
    const existing = await this.taskRepo.findOne({
      where: {
        ownerUserId: signal.ownerUserId,
        taskType: 'profile_enrichment',
        createdAt: MoreThan(since),
      },
      order: { createdAt: 'DESC' },
    });
    if (existing) {
      summary.skippedDuplicates += 1;
      return null;
    }

    const task = await this.taskRepo.save(
      this.taskRepo.create({
        ownerUserId: signal.ownerUserId,
        agentConnectionId: signal.agentConnectionId,
        taskType: 'profile_enrichment',
        title: '定期整理画像',
        goal: '根据最近聊天整理可确认的画像偏好，等待用户确认后再保存。',
        input: {
          source: 'periodic_profile_enrichment',
          conversationId: signal.conversationId,
          messageId: signal.messageId,
          fromUserId: signal.fromUserId,
          sourceMessage,
          intervalHours: profileEnrichmentIntervalHours(),
        },
        plan: [],
        toolCalls: [],
        result: {},
        memory: {},
        status: AgentTaskStatus.Pending,
        permissionMode: AgentTaskPermissionMode.Confirm,
        riskLevel: AgentTaskRiskLevel.Low,
        idempotencyKey: `profile_enrichment:${signal.ownerUserId}:periodic:${profileEnrichmentBucket()}`,
        statusReason: 'periodic_profile_enrichment',
      }),
    );
    summary.createdTasks += 1;
    summary.profileEnrichmentTasks += 1;

    const proposal = await this.lifeGraph.extractFromChat(signal.ownerUserId, {
      message: sourceMessage,
      taskId: task.id,
      messageId: signal.messageId,
      context: {
        intent: 'periodic_profile_enrichment',
        source: 'social_agent_autopilot',
        conversationId: signal.conversationId,
        fromUserId: signal.fromUserId,
      },
    });
    const proposedFieldCount = proposal.proposedFields.length;
    summary.profileEnrichmentProposals += proposedFieldCount > 0 ? 1 : 0;

    task.result = {
      ...(task.result ?? {}),
      profileUpdateProposal: {
        proposalId: proposal.proposalId,
        proposedFieldCount,
        confirmationRequired: proposal.confirmationRequired,
        missingFields: proposal.missingFields,
      },
    };

    if (proposedFieldCount > 0) {
      task.status = AgentTaskStatus.AwaitingFeedback;
      task.statusReason = 'life_graph_profile_confirmation';
      rememberSocialAgentCurrentTask(task, {
        objective: 'profile_enrichment',
        nextStep: '等待用户确认是否保存画像更新建议',
        shouldSearchNow: false,
        profileSaved: false,
        waitingFor: 'life_graph_profile_confirmation',
        lastCompletedStep: 'life_graph_profile_proposed',
      });
    } else {
      task.status = AgentTaskStatus.Succeeded;
      task.statusReason = 'profile_enrichment_no_fields';
    }

    await this.taskRepo.save(task);
    await this.writeAutopilotLog('social_agent_autopilot.profile_enrichment', {
      ownerUserId: signal.ownerUserId,
      agentId: signal.agentConnectionId,
      agentTaskId: task.id,
      actionStatus:
        proposedFieldCount > 0
          ? AgentActionStatus.Planned
          : AgentActionStatus.Executed,
      status: proposedFieldCount > 0 ? 'proposal_created' : 'no_fields',
      payload: {
        taskId: task.id,
        conversationId: signal.conversationId,
        messageId: signal.messageId,
        proposedFieldCount,
      },
    });
    return task;
  }

  private async collectSocialRequestTasks(
    tasks: Map<number, AgentTask>,
    ownerUserId: number | undefined,
    maxTasks: number,
    summary: SocialAgentAutopilotSummary,
  ): Promise<void> {
    if (tasks.size >= maxTasks) return;

    const requests = await this.requestRepo.find({
      where: {
        agentAllowed: true,
        status: In(ACTIVE_SOCIAL_REQUEST_STATUSES),
        updatedAt: MoreThan(recentSocialRequestSince()),
        ...(ownerUserId != null ? { userId: ownerUserId } : {}),
      },
      order: { updatedAt: 'DESC' },
      take: maxTasks,
    });
    summary.scanned.socialRequests = requests.length;

    for (const request of requests) {
      if (tasks.size >= maxTasks) return;
      const task = await this.taskForSocialRequest(request, summary);
      if (task) tasks.set(task.id, task);
    }
  }

  private async taskForConversationSignal(
    signal: RecentAgentConversationSignal,
    summary: SocialAgentAutopilotSummary,
  ): Promise<AgentTask | null> {
    let task = await this.findTaskFromSignal(signal);
    if (task && this.hasProcessedMessage(task, signal.messageId)) {
      summary.skippedDuplicates += 1;
      return null;
    }

    if (!task) {
      task = await this.taskRepo.save(
        this.taskRepo.create({
          ownerUserId: signal.ownerUserId,
          agentConnectionId: signal.agentConnectionId,
          taskType: 'conversation_reply_autopilot',
          title: '继续推进社交对话',
          goal: `处理用户 #${signal.fromUserId} 的新回复，并在权限范围内继续推进。`,
          input: {
            source: 'recent_agent_conversation',
            conversationId: signal.conversationId,
            messageId: signal.messageId,
            fromUserId: signal.fromUserId,
          },
          plan: [],
          toolCalls: [],
          result: {},
          memory: {},
          status: AgentTaskStatus.WaitingReply,
          permissionMode:
            this.permissionModeFromMetadata(signal.metadata) ??
            AgentTaskPermissionMode.Confirm,
          riskLevel: AgentTaskRiskLevel.Low,
          idempotencyKey: `conversation:${signal.conversationId}:autopilot`,
          statusReason: 'recent_conversation_message',
        }),
      );
      summary.createdTasks += 1;
    }

    return this.rememberPendingMessage(task, signal);
  }

  private async taskForSocialRequest(
    request: UserSocialRequest,
    summary: SocialAgentAutopilotSummary,
  ): Promise<AgentTask | null> {
    const idempotencyKey = `social_request:${request.id}:autopilot`;
    const existing = await this.taskRepo.findOne({ where: { idempotencyKey } });
    if (existing) return existing;

    const agentConnectionId = await this.resolveAgentConnectionId(request);
    if (!agentConnectionId) return null;

    let task: AgentTask;
    try {
      task = await this.taskRepo.save(
        this.taskRepo.create({
          ownerUserId: request.userId,
          agentConnectionId,
          taskType: 'social_request_autopilot',
          title: request.title || '待推进社交需求',
          goal: request.rawText || request.description || request.title,
          input: {
            source: 'recent_social_request',
            socialRequestId: request.id,
            requestType: request.type,
            city: request.city,
            activityType: request.activityType,
            interestTags: request.interestTags ?? [],
          },
          plan: [],
          toolCalls: [],
          result: {},
          memory: {
            socialRequest: {
              id: request.id,
              status: request.status,
              updatedAt: request.updatedAt,
            },
          },
          status: AgentTaskStatus.Pending,
          permissionMode: this.permissionModeForRequest(request),
          riskLevel: AgentTaskRiskLevel.Low,
          idempotencyKey,
          statusReason: 'recent_social_request',
        }),
      );
    } catch {
      return this.taskRepo.findOne({ where: { idempotencyKey } });
    }

    summary.createdTasks += 1;
    await this.planner.planExistingTask(task);
    return task;
  }

  private async processTask(
    task: AgentTask,
    summary: SocialAgentAutopilotSummary,
  ): Promise<void> {
    try {
      const fresh = await this.taskRepo.findOne({ where: { id: task.id } });
      if (!fresh) return;
      if (this.isTerminalTaskStatus(fresh.status)) return;

      if (
        fresh.status !== AgentTaskStatus.WaitingReply &&
        fresh.status !== AgentTaskStatus.WaitingResult &&
        (!Array.isArray(fresh.plan) || fresh.plan.length === 0)
      ) {
        await this.planner.planExistingTask(fresh);
      }

      const result = await this.executor.runNext(fresh.id, fresh.ownerUserId);
      summary.processedTasks += 1;
      summary.handledReplies += result.handledReply ? 1 : 0;
      const actionsExecuted = this.countActionCalls(result);
      summary.actionsExecuted += actionsExecuted;
      summary.taskResults.push({
        taskId: fresh.id,
        status: result.status,
        executedSteps: result.executedSteps,
        handledReply: result.handledReply,
        actionsExecuted,
      });
    } catch (error) {
      summary.errors += 1;
      await this.writeAutopilotLog('social_agent_autopilot.error', {
        ownerUserId: task.ownerUserId,
        agentId: task.agentConnectionId,
        agentTaskId: task.id,
        actionStatus: AgentActionStatus.Failed,
        status: 'task_error',
        payload: {
          taskId: task.id,
          error: error instanceof Error ? error.message : String(error),
        },
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private isTerminalTaskStatus(status: AgentTaskStatus): boolean {
    return [
      AgentTaskStatus.Succeeded,
      AgentTaskStatus.Failed,
      AgentTaskStatus.Cancelled,
    ].includes(status);
  }

  private async findTaskFromSignal(
    signal: RecentAgentConversationSignal,
  ): Promise<AgentTask | null> {
    const taskId = this.number(signal.metadata?.agentTaskId);
    if (taskId) {
      const task = await this.taskRepo.findOne({
        where: { id: taskId, ownerUserId: signal.ownerUserId },
      });
      if (task) return task;
    }

    return this.taskRepo
      .createQueryBuilder('task')
      .where('task.ownerUserId = :ownerUserId', {
        ownerUserId: signal.ownerUserId,
      })
      .andWhere('task.agentConnectionId = :agentConnectionId', {
        agentConnectionId: signal.agentConnectionId,
      })
      .andWhere(
        `"task"."memory" -> 'socialLoop' ->> 'conversationId' = :conversationId`,
        {
          conversationId: signal.conversationId,
        },
      )
      .orderBy('task.updatedAt', 'DESC')
      .getOne();
  }

  private async rememberPendingMessage(
    task: AgentTask,
    signal: RecentAgentConversationSignal,
  ): Promise<AgentTask> {
    const memory = this.isRecord(task.memory) ? task.memory : {};
    const loop = this.isRecord(memory.socialLoop) ? memory.socialLoop : {};

    task.memory = {
      ...memory,
      socialLoop: {
        ...loop,
        taskId: task.id,
        conversationId: signal.conversationId,
        targetUserId: signal.fromUserId,
        pendingMessageId: signal.messageId,
        latestReceivedMessage: {
          id: signal.messageId,
          conversationId: signal.conversationId,
          text: signal.text,
          senderId: signal.fromUserId,
          senderType: 'user',
          createdAt: signal.createdAt,
        },
        updatedAt: new Date().toISOString(),
      },
    };
    return this.taskRepo.save(task);
  }

  private hasProcessedMessage(task: AgentTask, messageId: string): boolean {
    const memory = this.isRecord(task.memory) ? task.memory : {};
    const loop = this.isRecord(memory.socialLoop) ? memory.socialLoop : {};
    const processed = Array.isArray(loop.processedMessageIds)
      ? loop.processedMessageIds
      : [];
    return (
      processed.includes(messageId) ||
      loop.lastReadMessageId === messageId ||
      loop.lastReceivedMessageId === messageId
    );
  }

  private async resolveAgentConnectionId(
    request: UserSocialRequest,
  ): Promise<number | null> {
    if (request.agentId) {
      const agent = await this.connectionRepo.findOne({
        where: { id: request.agentId, status: ConnectionStatus.Active },
      });
      if (agent) return agent.id;
    }

    const agent = await this.connectionRepo.findOne({
      where: { userId: request.userId, status: ConnectionStatus.Active },
      order: { updatedAt: 'DESC' },
    });
    return agent?.id ?? null;
  }

  private permissionModeForRequest(
    request: UserSocialRequest,
  ): AgentTaskPermissionMode {
    const fromMetadata = this.permissionModeFromMetadata(request.metadata);
    if (fromMetadata) return fromMetadata;
    return request.requireUserConfirmation
      ? AgentTaskPermissionMode.Confirm
      : AgentTaskPermissionMode.LimitedAuto;
  }

  private permissionModeFromMetadata(
    metadata: Record<string, unknown> | null | undefined,
  ): AgentTaskPermissionMode | null {
    const raw =
      typeof metadata?.permissionMode === 'string'
        ? metadata.permissionMode
        : null;
    if (
      raw &&
      Object.values(AgentTaskPermissionMode).includes(
        raw as AgentTaskPermissionMode,
      )
    ) {
      return raw as AgentTaskPermissionMode;
    }
    return null;
  }

  private countActionCalls(result: SocialAgentRunNextResult): number {
    const internalTools = new Set<SocialAgentToolName>([
      SocialAgentToolName.ReadTaskConversationMessages,
      SocialAgentToolName.SummarizeReply,
      SocialAgentToolName.DecideNextSocialAction,
      SocialAgentToolName.ReadMessageEvents,
    ]);
    return result.toolCalls.filter(
      (call) =>
        call.status === 'succeeded' && !internalTools.has(call.toolName),
    ).length;
  }

  private async writeAutopilotLog(
    eventType: string,
    input: {
      ownerUserId?: number;
      agentId?: number | null;
      agentTaskId?: number | null;
      actionStatus: AgentActionStatus;
      status: string;
      payload: Record<string, unknown>;
      reason?: string | null;
    },
  ): Promise<void> {
    await this.actionLogs.logAgentAction({
      ownerUserId: input.ownerUserId ?? SYSTEM_OWNER_USER_ID,
      agentId: input.agentId ?? null,
      agentTaskId: input.agentTaskId ?? null,
      actionType: AgentActionType.AgentEvent,
      actionStatus: input.actionStatus,
      riskLevel: AgentActionRiskLevel.Low,
      eventType,
      status: input.status,
      inputSummary: eventType,
      outputSummary: input.status,
      payload: input.payload,
      reason: input.reason ?? null,
    });
  }

  private emptySummary(
    triggeredBy: SocialAgentAutopilotTrigger,
    reason?: string,
  ): SocialAgentAutopilotSummary {
    return {
      triggeredBy,
      skipped: Boolean(reason),
      reason,
      enabled: isEnabled(),
      startedAt: new Date().toISOString(),
      completedAt: reason ? new Date().toISOString() : null,
      durationMs: reason ? 0 : null,
      maxTasksPerRun: configuredMaxTasksPerRun(),
      scanned: { tasks: 0, conversations: 0, socialRequests: 0 },
      queuedTasks: 0,
      createdTasks: 0,
      profileEnrichmentTasks: 0,
      profileEnrichmentProposals: 0,
      processedTasks: 0,
      handledReplies: 0,
      actionsExecuted: 0,
      skippedDuplicates: 0,
      errors: 0,
      taskResults: [],
    };
  }

  private number(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}

function isEnabled(): boolean {
  return (
    String(process.env.ENABLE_SOCIAL_AGENT_AUTOPILOT ?? '')
      .trim()
      .toLowerCase() === 'true'
  );
}

function configuredIntervalMs(): number {
  const raw = Number(process.env.SOCIAL_AGENT_AUTOPILOT_INTERVAL_SECONDS);
  const seconds = Number.isFinite(raw) && raw > 0 ? raw : 60;
  return Math.max(10, Math.min(seconds, 3600)) * 1000;
}

function configuredMaxTasksPerRun(): number {
  const raw = Number(process.env.SOCIAL_AGENT_AUTOPILOT_MAX_TASKS_PER_RUN);
  const maxTasks = Number.isFinite(raw) && raw > 0 ? raw : 20;
  return Math.max(1, Math.min(Math.floor(maxTasks), 100));
}

function recentMessageSince(): Date {
  return new Date(
    Date.now() - Math.max(configuredIntervalMs() * 3, 5 * 60 * 1000),
  );
}

function recentSocialRequestSince(): Date {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

function isProfileEnrichmentEnabled(): boolean {
  return (
    String(process.env.SOCIAL_AGENT_PROFILE_ENRICHMENT_ENABLED ?? 'true')
      .trim()
      .toLowerCase() !== 'false'
  );
}

function profileEnrichmentIntervalHours(): number {
  const raw = Number(
    process.env.SOCIAL_AGENT_PROFILE_ENRICHMENT_INTERVAL_HOURS,
  );
  const hours = Number.isFinite(raw) && raw > 0 ? raw : 72;
  return Math.max(1, Math.min(Math.floor(hours), 24 * 30));
}

function profileEnrichmentIntervalMs(): number {
  return profileEnrichmentIntervalHours() * 60 * 60 * 1000;
}

function profileEnrichmentSince(): Date {
  return new Date(Date.now() - profileEnrichmentIntervalMs());
}

function profileEnrichmentBucket(): number {
  return Math.floor(Date.now() / profileEnrichmentIntervalMs());
}

function profileEnrichmentSourceText(text: string): string {
  const sanitized = sanitizeProfileEnrichmentText(text);
  if (sanitized.length < 4) return '';
  if (!hasProfileEnrichmentSignal(sanitized)) return '';
  return sanitized.slice(0, 240);
}

function sanitizeProfileEnrichmentText(text: string): string {
  return (text ?? '')
    .replace(/\b1[3-9]\d{9}\b/g, '[联系方式已隐藏]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[联系方式已隐藏]')
    .replace(/(?:微信|wechat|wx)[:：\s]*[A-Za-z0-9_-]{4,}/gi, '微信已隐藏')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasProfileEnrichmentSignal(text: string): boolean {
  return /喜欢|偏好|爱好|常去|方便|不方便|周末|工作日|早上|上午|中午|下午|晚上|青岛|附近|区域|公共场所|安全|边界|不接受|不想|希望|想认识|跑步|散步|健身|羽毛球|篮球|游泳|瑜伽|骑行|咖啡|聊天|citywalk|run|gym|coffee|weekend|weekday/i.test(
    text,
  );
}
