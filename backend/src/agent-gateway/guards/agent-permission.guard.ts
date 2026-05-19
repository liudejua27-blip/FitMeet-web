import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import type { Request } from 'express';
import {
  AgentPermission,
  AgentAction,
} from '../entities/agent-permission.entity';
import { AGENT_CONNECTION_KEY } from './agent-token.guard';
import {
  AgentConnection,
  AgentPermissionLevel,
} from '../entities/agent-connection.entity';
import {
  AgentActivityLog,
  LoggedAction,
  ActionResult,
} from '../entities/agent-activity-log.entity';
import {
  AgentActionLog,
  AgentActionRiskLevel,
  AgentActionStatus,
  AgentActionType,
} from '../entities/agent-action-log.entity';
import { AgentActionLogService } from '../agent-action-log.service';
import {
  SafetyEvent,
  SafetyEventType,
  Severity,
} from '../entities/safety-event.entity';

export const REQUIRE_PERMISSION = 'agentRequirePermission';
export const RequirePermission = (action: AgentAction) =>
  SetMetadata(REQUIRE_PERMISSION, action);

type AgentPermissionRequest = Request & {
  [AGENT_CONNECTION_KEY]?: AgentConnection;
};

/**
 * Map a granular AgentAction (permission key) to the audit taxonomy used
 * by AgentActionLog. Used so Blocked / quota-exceeded events show up in
 * the same audit timeline as Executed / PendingApproval events.
 */
function mapAgentActionToActionType(action: AgentAction): AgentActionType {
  switch (action) {
    case AgentAction.SendMessage:
    case AgentAction.GenerateMessage:
    case AgentAction.LabChat:
      return AgentActionType.SendMessage;
    case AgentAction.ContactRequest:
      return AgentActionType.AddFriend;
    case AgentAction.CreateActivity:
      return AgentActionType.CreateActivity;
    case AgentAction.JoinActivity:
      return AgentActionType.JoinActivity;
    case AgentAction.SubmitCompletionProof:
      return AgentActionType.SubmitProof;
    case AgentAction.CreateSocialRequest:
      return AgentActionType.CreateSocialRequest;
    case AgentAction.SearchProfiles:
      return AgentActionType.RunMatch;
    case AgentAction.GeneratePost:
      return AgentActionType.GenerateInvite;
    case AgentAction.ReportRisk:
    default:
      return AgentActionType.ReadProfile;
  }
}

@Injectable()
export class AgentPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(AgentConnection)
    private readonly connectionRepo: Repository<AgentConnection>,
    @InjectRepository(AgentPermission)
    private readonly permissionRepo: Repository<AgentPermission>,
    @InjectRepository(AgentActivityLog)
    private readonly logRepo: Repository<AgentActivityLog>,
    @InjectRepository(SafetyEvent)
    private readonly safetyRepo: Repository<SafetyEvent>,
    @InjectRepository(AgentActionLog)
    private readonly actionLogRepo: Repository<AgentActionLog>,
    private readonly actionLogs: AgentActionLogService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const requiredAction = this.reflector.get<AgentAction>(
      REQUIRE_PERMISSION,
      ctx.getHandler(),
    );
    if (!requiredAction) return true;

    const req = ctx.switchToHttp().getRequest<AgentPermissionRequest>();
    const conn = req[AGENT_CONNECTION_KEY];

    if (!conn) throw new ForbiddenException('No agent connection on request');

    const mappedActionType = mapAgentActionToActionType(requiredAction);

    // Check daily action limit and reset if needed
    const now = new Date();
    const resetNeeded =
      !conn.dailyResetAt ||
      conn.dailyResetAt.toDateString() !== now.toDateString();

    if (resetNeeded) {
      conn.dailyActionsUsed = 0;
      conn.dailyResetAt = now;
    }

    if (conn.dailyActionsUsed >= conn.dailyActionLimit) {
      await this.safetyRepo.save(
        this.safetyRepo.create({
          agentConnectionId: conn.id,
          userId: conn.userId,
          eventType: SafetyEventType.RateLimitExceeded,
          severity: Severity.Medium,
          description: `Daily action limit (${conn.dailyActionLimit}) reached`,
        }),
      );
      await this.actionLogs.logAgentAction({
        ownerUserId: conn.userId,
        agentId: conn.id,
        actionType: mappedActionType,
        actionStatus: AgentActionStatus.Failed,
        riskLevel: AgentActionRiskLevel.Medium,
        outputSummary: `blocked_rate_limit: used=${conn.dailyActionsUsed}/${conn.dailyActionLimit}`,
        payload: {
          permission: requiredAction,
          dailyActionsUsed: conn.dailyActionsUsed,
          dailyActionLimit: conn.dailyActionLimit,
        },
        reason: 'daily_action_limit_reached',
      });
      throw new ForbiddenException('Daily agent action limit reached');
    }

    if (conn.permissionLevel === AgentPermissionLevel.Open) {
      conn.dailyActionsUsed += 1;
      conn.lastActiveAt = now;
      await this.connectionRepo.update(conn.id, {
        dailyActionsUsed: conn.dailyActionsUsed,
        dailyResetAt: conn.dailyResetAt,
        lastActiveAt: conn.lastActiveAt,
      });
      req[AGENT_CONNECTION_KEY] = conn;
      return true;
    }

    const permission = await this.permissionRepo.findOne({
      where: { agentConnectionId: conn.id, action: requiredAction },
    });

    if (!permission || !permission.granted) {
      await this.logRepo.save(
        this.logRepo.create({
          agentConnectionId: conn.id,
          userId: conn.userId,
          action: requiredAction as unknown as LoggedAction,
          result: ActionResult.Blocked,
          blockReason: `Permission not granted: ${requiredAction}`,
        }),
      );
      await this.actionLogs.logAgentAction({
        ownerUserId: conn.userId,
        agentId: conn.id,
        actionType: mappedActionType,
        actionStatus: AgentActionStatus.Failed,
        riskLevel: AgentActionRiskLevel.Medium,
        outputSummary: `blocked_permission: ${requiredAction}`,
        payload: { permission: requiredAction, granted: false },
        reason: 'permission_not_granted',
      });
      throw new ForbiddenException(`Agent lacks permission: ${requiredAction}`);
    }

    // Per-permission daily cap (AgentPermission.constraints.maxPerDay).
    // We count executed AgentActionLog rows for this agent + action type
    // since the start of the local day. PendingApproval / Failed rows do
    // not count toward the quota.
    const cond = (permission.constraints ?? {}) as { maxPerDay?: unknown };
    const maxPerDay =
      typeof cond.maxPerDay === 'number' && cond.maxPerDay > 0
        ? Math.floor(cond.maxPerDay)
        : null;
    if (maxPerDay !== null) {
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const usedToday = await this.actionLogRepo.count({
        where: {
          agentId: conn.id,
          actionType: mappedActionType,
          actionStatus: AgentActionStatus.Executed,
          createdAt: MoreThanOrEqual(startOfDay),
        },
      });
      if (usedToday >= maxPerDay) {
        await this.actionLogs.logAgentAction({
          ownerUserId: conn.userId,
          agentId: conn.id,
          actionType: mappedActionType,
          actionStatus: AgentActionStatus.Failed,
          riskLevel: AgentActionRiskLevel.Medium,
          outputSummary: `blocked_max_per_day: used=${usedToday}/${maxPerDay}`,
          payload: {
            permission: requiredAction,
            maxPerDay,
            usedToday,
          },
          reason: 'max_per_day_exceeded',
        });
        throw new ForbiddenException(
          `Agent daily quota reached for ${requiredAction} (${usedToday}/${maxPerDay})`,
        );
      }
    }

    conn.dailyActionsUsed += 1;
    conn.lastActiveAt = now;
    await this.connectionRepo.update(conn.id, {
      dailyActionsUsed: conn.dailyActionsUsed,
      dailyResetAt: conn.dailyResetAt,
      lastActiveAt: conn.lastActiveAt,
    });
    req[AGENT_CONNECTION_KEY] = conn; // propagate updated counters

    return true;
  }
}
