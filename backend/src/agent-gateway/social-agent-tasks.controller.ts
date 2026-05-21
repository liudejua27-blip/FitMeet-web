import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Req,
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
import {
  SocialAgentToolExecutorService,
  SocialAgentToolName,
} from './social-agent-tool-executor.service';
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
      '帮我找青岛今晚一起跑步的人。';
    const task = await this.taskRepo.save(
      this.taskRepo.create({
        ownerUserId: req.user.id,
        agentConnectionId,
        taskType: optionalString(body.taskType) || 'social_agent_demo',
        title:
          cleanDisplayText(optionalString(body.title), '') ||
          'Social Agent 演示任务',
        goal,
        input: sanitizeForDisplay({
          ...(isRecord(body.input) ? body.input : {}),
          source: 'social_agent_console',
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
    return this.planner.planTask(id);
  }

  /** POST /api/social-agent/tasks/:id/run-next */
  @Post(':id/run-next')
  @HttpCode(200)
  runNext(@Req() req: FitMeetRequest, @Param('id', ParseIntPipe) id: number) {
    return this.executor.runNext(id, req.user.id);
  }

  /** GET /api/social-agent/tasks/:id */
  @Get(':id')
  async getTask(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.serializeTask(await this.assertTaskOwner(id, req.user.id));
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

  private async executeAction(
    ownerUserId: number,
    taskId: number,
    toolName: SocialAgentToolName,
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
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
