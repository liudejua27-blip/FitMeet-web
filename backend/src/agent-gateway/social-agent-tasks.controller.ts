import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Optional,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';

import {
  AgentConnection,
  ConnectionStatus,
} from './entities/agent-connection.entity';
import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskPermissionMode,
  AgentTaskRiskLevel,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentPlannerService } from './social-agent-planner.service';
import type {
  SocialAgentPlanFailureContext,
  SocialAgentPlanReason,
} from './social-agent-planner.service';
import {
  SocialAgentToolExecutorService,
  SocialAgentToolName,
} from './social-agent-tool-executor.service';
import { SocialAgentChatService } from './social-agent-chat.service';
import { rememberSocialAgentShortTerm } from './social-agent-memory.util';
import { AgentLoopService } from './agent-loop.service';
import { summarizeSocialCodexRun } from './social-codex-run-summary';
import { SocialCodexTraceEvalService } from './social-codex-trace-eval.service';
import type { SocialAgentEventV2 } from './social-agent-event-v2.types';
import { SocialAgentEventStore } from './social-agent-event-store.service';
import { normalizeTaskBoundSocialAgentEvent } from './social-agent-thread-id.util';
import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';

type FitMeetRequest = Request & {
  user: { id: number };
};

type CreateSocialAgentTaskBody = {
  goal?: string;
  title?: string;
  taskType?: string;
  permissionMode?: AgentTaskPermissionMode;
  agentConnectionId?: number | null;
  input?: Record<string, unknown>;
  idempotencyKey?: string | null;
};

type ActionBody = Record<string, unknown>;
type ReplanBody = {
  reason?: SocialAgentPlanReason;
  userMessage?: string | null;
  failure?: SocialAgentPlanFailureContext | null;
};

const DEFAULT_SOCIAL_AGENT_TASK_TYPE = 'social_agent_chat';
const DEFAULT_SOCIAL_AGENT_TASK_TITLE = '新对话';
const DEFAULT_SOCIAL_AGENT_TASK_GOAL = '继续当前对话';
const SOCIAL_AGENT_TASK_API_SOURCE = 'social_agent_tasks_api';

@Controller('social-agent/tasks')
@UseGuards(AuthGuard('jwt'))
export class SocialAgentTasksController {
  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    @InjectRepository(AgentTaskEvent)
    private readonly eventRepo: Repository<AgentTaskEvent>,
    @InjectRepository(AgentConnection)
    private readonly connectionRepo: Repository<AgentConnection>,
    private readonly planner: SocialAgentPlannerService,
    private readonly executor: SocialAgentToolExecutorService,
    private readonly chat: SocialAgentChatService,
    @Optional()
    private readonly agentLoop?: AgentLoopService,
    @Optional()
    private readonly traceEval?: SocialCodexTraceEvalService,
    @Optional()
    private readonly eventStore?: SocialAgentEventStore,
  ) {}

  /** POST /api/social-agent/tasks */
  @Post()
  async createTask(
    @Req() req: FitMeetRequest,
    @Body() body: CreateSocialAgentTaskBody,
  ) {
    const idempotencyKey = optionalString(body.idempotencyKey);
    if (idempotencyKey) {
      const existing = await this.taskRepo.findOne({
        where: { ownerUserId: req.user.id, idempotencyKey },
      });
      if (existing) return this.serializeTask(existing);
    }

    const agentConnectionId = await this.resolveAgentConnectionId(
      req.user.id,
      body.agentConnectionId,
    );
    const goal =
      cleanDisplayText(optionalString(body.goal), '') ||
      DEFAULT_SOCIAL_AGENT_TASK_GOAL;
    const task = await this.taskRepo.save(
      this.taskRepo.create({
        ownerUserId: req.user.id,
        agentConnectionId,
        taskType:
          optionalString(body.taskType) || DEFAULT_SOCIAL_AGENT_TASK_TYPE,
        title:
          cleanDisplayText(optionalString(body.title), '') ||
          DEFAULT_SOCIAL_AGENT_TASK_TITLE,
        goal,
        input: sanitizeForDisplay({
          ...(isRecord(body.input) ? body.input : {}),
          source: SOCIAL_AGENT_TASK_API_SOURCE,
        }) as Record<string, unknown>,
        plan: [],
        toolCalls: [],
        result: {},
        memory: {},
        status: AgentTaskStatus.Pending,
        permissionMode: this.normalizePermissionMode(body.permissionMode),
        riskLevel: AgentTaskRiskLevel.Low,
        idempotencyKey: idempotencyKey ?? null,
      }),
    );
    rememberSocialAgentShortTerm(task, {
      currentStep: {
        id: 'task.created',
        label: '已创建 Social Agent 任务',
        status: 'done',
        updatedAt: new Date().toISOString(),
      },
      steps: [
        {
          id: 'task.created',
          label: '已创建 Social Agent 任务',
          status: 'done',
          updatedAt: new Date().toISOString(),
        },
      ],
    });
    await this.taskRepo.save(task);

    return this.serializeTask(task);
  }

  /** POST /api/social-agent/tasks/:id/plan */
  @Post(':id/plan')
  @HttpCode(200)
  async planTask(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.assertTaskOwner(id, req.user.id);
    let planResult: Awaited<
      ReturnType<SocialAgentPlannerService['planTask']>
    > | null = null;
    const loopService = this.agentLoop ?? new AgentLoopService();
    const execution = await loopService.execute({
      taskId: id,
      goal: `Plan Social Agent task ${id}`,
      agent: 'Agent Brain',
      maxToolCalls: 1,
      timeoutMs: 30_000,
      plan: {
        reason: 'Manual task planning must pass through the unified AgentLoop.',
        tools: [
          {
            agent: 'Agent Brain',
            toolName: 'task_plan_plan_only',
            input: {},
          },
        ],
      },
      runner: async () => {
        planResult = await this.planner.planTask(id);
        return {
          taskId: planResult.taskId,
          source: planResult.source,
          fallbackReason: planResult.fallbackReason ?? null,
          planStepCount: planResult.plan.length,
        };
      },
    });
    if (!planResult) {
      throw new Error('AgentLoop did not produce a plan result');
    }
    const result = planResult as Awaited<
      ReturnType<SocialAgentPlannerService['planTask']>
    >;
    return {
      ...result,
      agentLoop: execution.loop,
    };
  }

  /** POST /api/social-agent/tasks/:id/replan */
  @Post(':id/replan')
  @HttpCode(200)
  async replanTask(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ReplanBody,
  ) {
    await this.assertTaskOwner(id, req.user.id);
    let replanResult: Awaited<
      ReturnType<SocialAgentPlannerService['replanTask']>
    > | null = null;
    const loopService = this.agentLoop ?? new AgentLoopService();
    const execution = await loopService.execute({
      taskId: id,
      goal: `Replan Social Agent task ${id}`,
      agent: 'Agent Brain',
      maxToolCalls: 1,
      timeoutMs: 30_000,
      plan: {
        reason: 'Manual task replan must pass through the unified AgentLoop.',
        tools: [
          {
            agent: 'Agent Brain',
            toolName: 'task_replan_plan_only',
            input: {
              reason: this.normalizeReplanReason(body.reason),
              userMessage: optionalString(body.userMessage),
              failure: isRecord(body.failure) ? body.failure : null,
            },
          },
        ],
      },
      runner: async ({ input }) => {
        replanResult = await this.planner.replanTask(id, {
          reason: this.normalizeReplanReason(body.reason),
          userMessage: optionalString(input.userMessage),
          failure: isRecord(input.failure) ? input.failure : null,
        });
        return {
          taskId: replanResult.taskId,
          source: replanResult.source,
          fallbackReason: replanResult.fallbackReason ?? null,
          replanAttempt: replanResult.replanAttempt,
          planStepCount: replanResult.plan.length,
        };
      },
    });
    if (!replanResult) {
      throw new Error('AgentLoop did not produce a replan result');
    }
    const result = replanResult as Awaited<
      ReturnType<SocialAgentPlannerService['replanTask']>
    >;
    return {
      ...result,
      agentLoop: execution.loop,
    };
  }

  /** POST /api/social-agent/tasks/:id/run-next */
  @Post(':id/run-next')
  @HttpCode(200)
  runNext(@Req() req: FitMeetRequest, @Param('id', ParseIntPipe) id: number) {
    return this.executor.runNext(id, req.user.id);
  }

  /** GET /api/social-agent/tasks/current */
  @Get('current')
  getCurrentTask(@Req() req: FitMeetRequest) {
    return this.chat.getCurrentTask(req.user.id);
  }

  /** GET /api/social-agent/tasks/:id/timeline */
  @Get(':id/timeline')
  getTimeline(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.chat.getTaskTimeline(req.user.id, id);
  }

  /** GET /api/social-agent/tasks/:id/events */
  @Get(':id/events')
  async getEvents(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.assertTaskOwner(id, req.user.id);
    const events = await this.eventRepo.find({
      where: { taskId: id, ownerUserId: req.user.id },
      order: { createdAt: 'ASC', id: 'ASC' },
      take: 500,
    });
    return { taskId: id, events };
  }

  /** GET /api/social-agent/tasks/:id/events/eval */
  @Get(':id/events/eval')
  async evaluateEvents(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.assertTaskOwner(id, req.user.id);
    const events = await this.eventRepo.find({
      where: { taskId: id, ownerUserId: req.user.id },
      order: { createdAt: 'ASC', id: 'ASC' },
      take: 1000,
    });
    const v2Events = events
      .map((event) => event.payload?.socialAgentEventV2)
      .filter((event): event is SocialAgentEventV2 =>
        this.isSocialAgentEventV2(event),
      );
    const evaluator = this.traceEval ?? new SocialCodexTraceEvalService();
    return {
      taskId: id,
      eventCount: events.length,
      socialCodexEventCount: v2Events.length,
      ...evaluator.evaluate(v2Events),
    };
  }

  /** GET /api/social-agent/tasks/:id/events/replay */
  @Get(':id/events/replay')
  async replayEvents(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Query('afterSeq') afterSeq?: string,
    @Query('afterEventId') afterEventId?: string,
    @Query('includeDebug') includeDebug?: string,
  ) {
    await this.assertTaskOwner(id, req.user.id);
    const replay = this.eventStore
      ? await this.eventStore.buildReplayPackage(id, req.user.id, {
          afterSeq: numberOrNull(afterSeq),
          afterEventId: optionalString(afterEventId),
          includeDebug: includeDebug === 'true',
        })
      : await this.buildReplayPackageFallback(id, req.user.id, {
          afterSeq: numberOrNull(afterSeq),
          afterEventId: optionalString(afterEventId),
          includeDebug: includeDebug === 'true',
        });
    const evaluator = this.traceEval ?? new SocialCodexTraceEvalService();
    return {
      ...replay,
      eval: evaluator.evaluate(replay.events),
    };
  }

  /** GET /api/social-agent/tasks/:id */
  @Get(':id')
  async getTask(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.serializeTask(await this.assertTaskOwner(id, req.user.id));
  }

  /** POST /api/social-agent/tasks/:id/actions/send-message */
  @Post(':id/actions/send-message')
  @HttpCode(200)
  sendMessage(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ActionBody,
  ) {
    return this.executeAction(
      req.user.id,
      id,
      SocialAgentToolName.SendMessage,
      body,
    );
  }

  /** POST /api/social-agent/tasks/:id/actions/add-friend */
  @Post(':id/actions/add-friend')
  @HttpCode(200)
  addFriend(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ActionBody,
  ) {
    return this.executeAction(
      req.user.id,
      id,
      SocialAgentToolName.AddFriend,
      body,
    );
  }

  /** POST /api/social-agent/tasks/:id/actions/invite-activity */
  @Post(':id/actions/invite-activity')
  @HttpCode(200)
  inviteActivity(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ActionBody,
  ) {
    return this.executeAction(
      req.user.id,
      id,
      SocialAgentToolName.InviteActivity,
      body,
    );
  }

  /** POST /api/social-agent/tasks/:id/actions/offline-meeting */
  @Post(':id/actions/offline-meeting')
  @HttpCode(200)
  offlineMeeting(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ActionBody,
  ) {
    return this.executeAction(
      req.user.id,
      id,
      SocialAgentToolName.OfflineMeeting,
      body,
    );
  }

  /** POST /api/social-agent/tasks/:id/actions/payment-intent */
  @Post(':id/actions/payment-intent')
  @HttpCode(200)
  paymentIntent(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ActionBody,
  ) {
    return this.executeAction(
      req.user.id,
      id,
      SocialAgentToolName.Payment,
      body,
    );
  }

  /** POST /api/social-agent/tasks/:id/tools/:toolName */
  @Post(':id/tools/:toolName')
  @HttpCode(200)
  callRegisteredTool(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('toolName') toolName: string,
    @Body() body: ActionBody,
  ) {
    return this.executeAction(req.user.id, id, toolName, body);
  }

  private async executeAction(
    ownerUserId: number,
    taskId: number,
    toolName: SocialAgentToolName | string,
    input: ActionBody,
  ) {
    await this.assertTaskOwner(taskId, ownerUserId);
    return this.executor.executeToolAction(
      taskId,
      toolName,
      input ?? {},
      ownerUserId,
    );
  }

  private async assertTaskOwner(
    taskId: number,
    ownerUserId: number,
  ): Promise<AgentTask> {
    const task = await this.taskRepo.findOne({
      where: { id: taskId, ownerUserId },
    });
    if (!task)
      throw new NotFoundException(`Social agent task ${taskId} not found`);
    return task;
  }

  private async resolveAgentConnectionId(
    ownerUserId: number,
    raw: number | null | undefined,
  ): Promise<number | null> {
    if (raw) {
      const explicit = await this.connectionRepo.findOne({
        where: {
          id: raw,
          userId: ownerUserId,
          status: ConnectionStatus.Active,
        },
      });
      if (explicit) return explicit.id;
    }

    const latest = await this.connectionRepo.findOne({
      where: { userId: ownerUserId, status: ConnectionStatus.Active },
      order: { updatedAt: 'DESC' },
    });
    return latest?.id ?? null;
  }

  private normalizePermissionMode(
    mode: AgentTaskPermissionMode | undefined,
  ): AgentTaskPermissionMode {
    return mode && Object.values(AgentTaskPermissionMode).includes(mode)
      ? mode
      : AgentTaskPermissionMode.LimitedAuto;
  }

  private normalizeReplanReason(
    reason: SocialAgentPlanReason | undefined,
  ): SocialAgentPlanReason {
    return reason &&
      ['user_follow_up', 'failure_recovery', 'manual_replan'].includes(reason)
      ? reason
      : 'failure_recovery';
  }

  private serializeTask(task: AgentTask) {
    return {
      id: task.id,
      ownerUserId: task.ownerUserId,
      agentConnectionId: task.agentConnectionId,
      taskType: task.taskType,
      title: cleanDisplayText(task.title, 'Social Agent 任务'),
      goal: cleanDisplayText(task.goal, '社交任务'),
      input: sanitizeForDisplay(task.input) as Record<string, unknown>,
      plan: sanitizeForDisplay(task.plan) as Record<string, unknown>[],
      toolCalls: sanitizeForDisplay(task.toolCalls) as Record<
        string,
        unknown
      >[],
      result: sanitizeForDisplay(task.result) as Record<string, unknown>,
      memory: sanitizeForDisplay(task.memory) as Record<string, unknown>,
      status: task.status,
      permissionMode: task.permissionMode,
      riskLevel: task.riskLevel,
      statusReason: cleanDisplayText(task.statusReason, ''),
      error: sanitizeForDisplay(task.error) as Record<string, unknown> | null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      completedAt: task.completedAt,
    };
  }

  private isSocialAgentEventV2(value: unknown): value is SocialAgentEventV2 {
    if (!isRecord(value)) return false;
    return (
      typeof value.type === 'string' &&
      typeof value.eventId === 'string' &&
      typeof value.seq === 'number' &&
      typeof value.threadId === 'string' &&
      typeof value.runId === 'string' &&
      typeof value.stage === 'string'
    );
  }

  private async buildReplayPackageFallback(
    taskId: number,
    ownerUserId: number,
    options: {
      afterSeq?: number | null;
      afterEventId?: string | null;
      includeDebug?: boolean;
    },
  ) {
    const rows = await this.eventRepo.find({
      where: { taskId, ownerUserId },
      order: { createdAt: 'ASC', id: 'ASC' },
      take: 1000,
    });
    const allEvents = rows
      .map((event) =>
        normalizeTaskBoundSocialAgentEvent(
          event.payload?.socialAgentEventV2,
          event.taskId,
        ),
      )
      .filter((event): event is SocialAgentEventV2 =>
        this.isSocialAgentEventV2(event),
      )
      .filter(
        (event) =>
          event.visibility === 'user_visible' ||
          (event.visibility === 'debug_only' && options.includeDebug === true),
      );
    const events = this.filterReplayCursor(allEvents, options);
    const terminalEvent =
      [...allEvents]
        .reverse()
        .find(
          (event) =>
            event.type === 'run.completed' || event.type === 'run.failed',
        ) ?? null;
    const terminalType = terminalEvent?.type ?? null;
    const summary = summarizeSocialCodexRun(allEvents);
    const replayEvents = this.attachReplaySummaryToTerminalEvent(
      events,
      terminalEvent?.eventId ?? null,
      summary,
    );
    const lastReplayEvent = replayEvents.at(-1) ?? null;
    return {
      taskId,
      threadId: lastReplayEvent?.threadId ?? allEvents.at(-1)?.threadId ?? null,
      runId: lastReplayEvent?.runId ?? allEvents.at(-1)?.runId ?? null,
      eventCount: allEvents.length,
      returnedCount: replayEvents.length,
      lastSeq: lastReplayEvent?.seq ?? null,
      lastEventId: lastReplayEvent?.eventId ?? null,
      terminalType,
      pendingApproval: summary.pendingApproval,
      summary,
      events: replayEvents,
    };
  }

  private attachReplaySummaryToTerminalEvent(
    events: SocialAgentEventV2[],
    terminalEventId: string | null,
    summary: ReturnType<typeof summarizeSocialCodexRun>,
  ): SocialAgentEventV2[] {
    if (!terminalEventId) return events;
    return events.map((event) => {
      if (event.eventId !== terminalEventId) return event;
      return {
        ...event,
        payload: {
          ...(event.payload ?? {}),
          summary,
        },
      };
    });
  }

  private filterReplayCursor(
    events: SocialAgentEventV2[],
    options: { afterSeq?: number | null; afterEventId?: string | null },
  ) {
    if (options.afterEventId) {
      const index = events.findIndex(
        (event) => event.eventId === options.afterEventId,
      );
      if (index >= 0) return events.slice(index + 1);
    }
    if (
      typeof options.afterSeq === 'number' &&
      Number.isFinite(options.afterSeq)
    ) {
      return events.filter((event) => event.seq > Number(options.afterSeq));
    }
    return events;
  }
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
