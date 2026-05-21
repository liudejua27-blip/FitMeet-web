import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AgentApprovalRequest,
  ApprovalStatus,
  ApprovalType,
} from './entities/agent-approval-request.entity';
import { AgentConnection } from './entities/agent-connection.entity';
import {
  AgentActivityLog,
  ActionResult,
  LoggedAction,
} from './entities/agent-activity-log.entity';
import {
  AgentActionStatus,
  AgentActionType,
} from './entities/agent-action-log.entity';
import { AgentActionLogService } from './agent-action-log.service';
import {
  mapApprovalToActionType,
  mapApprovalRiskLevel,
} from './approval-action-mapper';
import { AgentGatewayService } from './agent-gateway.service';
import { ActivitiesService } from '../activities/activities.service';
import { MessagesGateway } from '../messages/messages.gateway';
import { MessagesService } from '../messages/messages.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  UserSocialRequest,
  UserSocialRequestStatus,
} from '../social-requests/social-request.entity';
import {
  SocialRequestCandidate,
  SocialRequestCandidateStatus,
} from '../match/social-request-candidate.entity';
import {
  CreateActivityDto,
  SubmitActivityProofDto,
} from '../activities/dto/activity.dto';
import { SendMessageDto } from './dto/agent-gateway.dto';
import { User } from '../users/user.entity';
import { Follow } from '../friends/follow.entity';

/**
 * Replays the underlying real action of an approved AgentApprovalRequest.
 *
 * Contract per ApprovalType:
 *   SendMessage / FirstMessage
 *     payload: { toUserId, content, messageType?, socialRequestId?,
 *                activityId?, metadata? }
 *     → AgentGatewayService.sendMessage (carries approvalRequestId so the
 *       per-action gate is short-circuited)
 *
 *   ContactRequest / ContactExchange
 *     payload: { targetUserId, note? }
 *     → AgentGatewayService.requestContact
 *
 *   CreateActivity / OfflineMeeting
 *     payload: CreateActivityDto-shaped (type required)
 *     → ActivitiesService.create(userId, dto)
 *
 *   JoinActivity
 *     payload: { activityId }
 *     → ActivitiesService.join(activityId, userId)
 *
 *   SubmitCompletionProof / PhotoUpload
 *     payload: { activityId, proofType, photoUrl?, note?,
 *                locationApprox?, privacyMode? }
 *     → ActivitiesService.submitProof(activityId, userId, dto)
 *
 *   Anything else → no-op, logged as Success (the approval status itself
 *   is the outcome the caller cares about).
 *
 * Failure mode: any thrown error during the underlying action is caught
 * and surfaced via the return value AND the approval is rolled back to
 * Pending so the user can retry. We never silently swallow failures.
 *
 * Lives in the AgentGateway module to avoid cross-module circular deps;
 * ActivitiesModule is reached through forwardRef.
 */
@Injectable()
export class AgentApprovalDispatcherService {
  private readonly logger = new Logger(AgentApprovalDispatcherService.name);

  constructor(
    @Inject(forwardRef(() => AgentGatewayService))
    private readonly gateway: AgentGatewayService,
    @Inject(forwardRef(() => ActivitiesService))
    private readonly activities: ActivitiesService,
    @InjectRepository(AgentConnection)
    private readonly connRepo: Repository<AgentConnection>,
    @InjectRepository(AgentActivityLog)
    private readonly logRepo: Repository<AgentActivityLog>,
    @InjectRepository(AgentApprovalRequest)
    private readonly approvalRepo: Repository<AgentApprovalRequest>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserSocialRequest)
    private readonly socialRequestRepo: Repository<UserSocialRequest>,
    @InjectRepository(SocialRequestCandidate)
    private readonly socialCandidateRepo: Repository<SocialRequestCandidate>,
    @InjectRepository(Follow)
    private readonly followRepo: Repository<Follow>,
    private readonly messages: MessagesService,
    private readonly messagesGateway: MessagesGateway,
    private readonly notifications: NotificationsService,
    private readonly actionLogs: AgentActionLogService,
  ) {}

  /**
   * Returned to the controller. `ok=true` means the approval is Approved
   * and the underlying action has been executed (or was a no-op). `ok=false`
   * means execution failed and the approval has been rolled back to
   * Pending so the user can retry without re-approving.
   */
  async dispatch(approval: AgentApprovalRequest): Promise<{
    ok: boolean;
    skipped?: boolean;
    result?: unknown;
    errorMessage?: string;
  }> {
    try {
      const conn = await this.resolveConnection(approval);

      switch (approval.type) {
        case ApprovalType.SendMessage:
        case ApprovalType.FirstMessage: {
          const p = approval.payload as Record<string, unknown>;
          const dto: SendMessageDto = {
            toUserId: p.toUserId as number | undefined,
            content: p.content as string | undefined,
            messageType: p.messageType as string | undefined,
            socialRequestId: p.socialRequestId as number | undefined,
            activityId: p.activityId as number | undefined,
            agentTaskId:
              approval.agentTaskId ?? (p.agentTaskId as number | undefined),
            metadata: (p.metadata as Record<string, unknown>) ?? {
              source: 'approval_dispatch',
            },
            approvalRequestId: approval.id,
          };
          const result = conn
            ? await this.gateway.sendMessage(conn, dto)
            : await this.sendOwnerMessageDirectly(approval, dto);
          await this.advanceSocialRequestAfterMessage(approval);
          await this.writeLog(
            approval,
            conn,
            LoggedAction.SendMessage,
            {
              approvalId: approval.id,
              agentTaskId: approval.agentTaskId,
              toUserId: dto.toUserId,
            },
            ActionResult.Success,
          );
          await this.writeActionLog(
            approval,
            conn,
            AgentActionStatus.Executed,
            {
              outputSummary: 'send_message_dispatched',
              payload: { toUserId: dto.toUserId },
            },
          );
          return { ok: true, result };
        }

        case ApprovalType.ContactRequest:
        case ApprovalType.ContactExchange: {
          const p = approval.payload as Record<string, unknown>;
          if (approval.actionType === 'add_friend') {
            const targetUserId = p.targetUserId as number | undefined;
            if (!targetUserId) {
              throw new Error('AddFriend payload missing targetUserId');
            }
            await this.ensureFollowing(approval.userId, targetUserId);
            await this.writeLog(
              approval,
              conn,
              LoggedAction.ContactRequest,
              {
                approvalId: approval.id,
                agentTaskId: approval.agentTaskId,
                targetUserId,
                actionType: 'add_friend',
              },
              ActionResult.Success,
            );
            await this.writeActionLog(
              approval,
              conn,
              AgentActionStatus.Executed,
              {
                outputSummary: 'add_friend_dispatched',
                payload: { targetUserId, actionType: 'add_friend' },
              },
            );
            return { ok: true, result: { following: true, targetUserId } };
          }
          if (!conn) {
            throw new Error(
              'No agent connection available; cannot replay a ContactRequest approval.',
            );
          }
          const targetUserId = p.targetUserId as number | undefined;
          if (!targetUserId) {
            throw new Error('ContactRequest payload missing targetUserId');
          }
          const result = await this.gateway.requestContact(conn, {
            targetUserId,
            note: (p.note as string | undefined) ?? '',
          });
          await this.writeLog(
            approval,
            conn,
            LoggedAction.ContactRequest,
            {
              approvalId: approval.id,
              agentTaskId: approval.agentTaskId,
              targetUserId,
            },
            ActionResult.Success,
          );
          await this.writeActionLog(
            approval,
            conn,
            AgentActionStatus.Executed,
            {
              outputSummary: 'contact_request_dispatched',
              payload: { targetUserId },
            },
          );
          return { ok: true, result };
        }

        case ApprovalType.CreateActivity:
        case ApprovalType.OfflineMeeting: {
          const dto = approval.payload as unknown as CreateActivityDto;
          if (!dto?.type) {
            throw new Error('CreateActivity payload missing `type` field');
          }
          const activity = await this.activities.create(approval.userId, dto);
          await this.writeLog(
            approval,
            conn,
            LoggedAction.CreateActivity,
            {
              approvalId: approval.id,
              agentTaskId: approval.agentTaskId,
              activityId: activity.id,
            },
            ActionResult.Success,
          );
          await this.writeActionLog(
            approval,
            conn,
            AgentActionStatus.Executed,
            {
              outputSummary: 'create_activity_dispatched',
              payload: { activityId: activity.id },
            },
          );
          return { ok: true, result: activity };
        }

        case ApprovalType.JoinActivity: {
          const p = approval.payload as Record<string, unknown>;
          const activityId = p.activityId as number | undefined;
          if (!activityId) {
            throw new Error('JoinActivity payload missing activityId');
          }
          const activity = await this.activities.join(
            activityId,
            approval.userId,
          );
          await this.writeLog(
            approval,
            conn,
            LoggedAction.JoinActivity,
            {
              approvalId: approval.id,
              agentTaskId: approval.agentTaskId,
              activityId,
            },
            ActionResult.Success,
          );
          await this.writeActionLog(
            approval,
            conn,
            AgentActionStatus.Executed,
            {
              outputSummary: 'join_activity_dispatched',
              payload: { activityId },
            },
          );
          return { ok: true, result: activity };
        }

        case ApprovalType.SubmitCompletionProof:
        case ApprovalType.PhotoUpload: {
          const p = approval.payload as Record<string, unknown>;
          const activityId = p.activityId as number | undefined;
          if (!activityId) {
            throw new Error('SubmitCompletionProof payload missing activityId');
          }
          const dto: SubmitActivityProofDto = {
            proofType: p.proofType as SubmitActivityProofDto['proofType'],
            photoUrl: p.photoUrl as string | undefined,
            note: p.note as string | undefined,
            locationApprox: p.locationApprox as string | undefined,
            privacyMode: p.privacyMode as SubmitActivityProofDto['privacyMode'],
          };
          const proof = await this.activities.submitProof(
            activityId,
            approval.userId,
            dto,
          );
          await this.writeLog(
            approval,
            conn,
            LoggedAction.SubmitCompletionProof,
            {
              approvalId: approval.id,
              agentTaskId: approval.agentTaskId,
              activityId,
              proofId: proof.id,
            },
            ActionResult.Success,
          );
          await this.writeActionLog(
            approval,
            conn,
            AgentActionStatus.Executed,
            {
              outputSummary: 'submit_proof_dispatched',
              payload: { activityId, proofId: proof.id },
            },
          );
          return { ok: true, result: proof };
        }

        default: {
          this.logger.log(
            `Approval ${approval.id} type=${approval.type} has no auto-dispatch path; treated as no-op.`,
          );
          await this.writeLog(
            approval,
            conn,
            LoggedAction.Intercepted,
            {
              approvalId: approval.id,
              agentTaskId: approval.agentTaskId,
              type: approval.type,
              reason: 'no_dispatch_handler',
            },
            ActionResult.Success,
          );
          return { ok: true, skipped: true };
        }
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Dispatch failed';
      this.logger.warn(
        `Dispatch failed for approval ${approval.id} (${approval.type}): ${errorMessage}`,
      );
      // Roll back so the user can retry without re-approving.
      await this.approvalRepo.update(approval.id, {
        status: ApprovalStatus.Pending,
        respondedAt: null,
      });
      await this.writeLog(
        approval,
        null,
        LoggedAction.Intercepted,
        {
          approvalId: approval.id,
          agentTaskId: approval.agentTaskId,
          type: approval.type,
          error: errorMessage,
        },
        ActionResult.Error,
        errorMessage,
      );
      await this.writeActionLog(approval, null, AgentActionStatus.Failed, {
        outputSummary: `dispatch_failed: ${errorMessage}`,
        payload: { error: errorMessage },
        reason: 'approval_dispatch_failed',
      });
      return { ok: false, errorMessage };
    }
  }

  private async sendOwnerMessageDirectly(
    approval: AgentApprovalRequest,
    dto: SendMessageDto,
  ) {
    const toUserId = dto.toUserId ?? dto.recipientUserId;
    const content = dto.content ?? dto.text;
    if (!toUserId || !content) {
      throw new Error('SendMessage approval payload missing toUserId/content');
    }
    const sender = await this.userRepo.findOne({
      where: { id: approval.userId },
    });
    const { conversationId } = await this.messages.startConversation(
      approval.userId,
      toUserId,
    );
    const message = await this.messages.sendMessage(
      conversationId,
      approval.userId,
      content,
      {
        source: 'ai_delegate',
        senderType: 'agent',
        senderAgentId: approval.agentConnectionId,
        metadata: {
          ...(dto.metadata ?? {}),
          actorType: 'agent',
          actorUserId: approval.userId,
          agentConnectionId: approval.agentConnectionId,
          approvalRequestId: approval.id,
          agentTaskId: approval.agentTaskId,
          socialRequestId: dto.socialRequestId,
        },
      },
    );
    this.messagesGateway.pushNewMessageToUser(toUserId, message);

    try {
      await this.notifications.create({
        userId: toUserId,
        type: 'message',
        text: `${sender?.name ?? '某用户'} 的 AI 助手给你发来一条邀约`,
        fromUserId: approval.userId,
        fromUsername: sender?.name,
        fromAvatar: sender?.avatar,
        fromColor: sender?.color,
      });
    } catch {
      // best effort
    }
    return { conversationId, messageId: message.id };
  }

  private async resolveConnection(
    approval: AgentApprovalRequest,
  ): Promise<AgentConnection | null> {
    if (approval.agentConnectionId) {
      const c = await this.connRepo.findOne({
        where: { id: approval.agentConnectionId },
      });
      if (c) return c;
    }
    // Fallback: any connection owned by the same user (browser-driven
    // approvals from the demo flow may have no agent connection bound).
    return this.connRepo.findOne({
      where: { userId: approval.userId },
      order: { createdAt: 'DESC' },
    });
  }

  private async ensureFollowing(followerId: number, followingId: number) {
    const existing = await this.followRepo.findOne({
      where: { followerId, followingId },
    });
    if (!existing) {
      await this.followRepo.save(
        this.followRepo.create({ followerId, followingId }),
      );
    }
  }

  private async advanceSocialRequestAfterMessage(
    approval: AgentApprovalRequest,
  ) {
    if (approval.relatedCandidateId) {
      await this.socialCandidateRepo.update(
        { id: approval.relatedCandidateId },
        { status: SocialRequestCandidateStatus.Messaged },
      );
    }
    if (approval.relatedSocialRequestId) {
      await this.socialRequestRepo.update(
        { id: approval.relatedSocialRequestId, userId: approval.userId },
        { status: UserSocialRequestStatus.Chatting },
      );
    }
  }

  private async writeLog(
    approval: AgentApprovalRequest,
    conn: AgentConnection | null,
    action: LoggedAction,
    payload: Record<string, unknown>,
    result: ActionResult,
    blockReason?: string | null,
  ) {
    try {
      await this.logRepo.save(
        this.logRepo.create({
          agentConnectionId: conn?.id ?? approval.agentConnectionId ?? null,
          userId: approval.userId,
          action,
          payload,
          result,
          blockReason: blockReason ?? null,
          riskScore: 0,
        }),
      );
    } catch (err) {
      this.logger.warn(
        `Failed to write activity log for approval ${approval.id}: ${
          err instanceof Error ? err.message : 'unknown'
        }`,
      );
    }
  }

  /**
   * Mirrors every dispatch outcome into the unified `agent_action_logs`
   * table so an approved + executed PendingAction shows up alongside
   * autopilot / discovery / match entries in the audit trail.
   */
  private async writeActionLog(
    approval: AgentApprovalRequest,
    conn: AgentConnection | null,
    status: AgentActionStatus,
    extra: {
      outputSummary?: string;
      payload?: Record<string, unknown>;
      reason?: string;
    } = {},
  ) {
    const payloadAny = (approval.payload ?? {}) as Record<string, unknown>;
    const targetUserId =
      (payloadAny.toUserId as number | undefined) ??
      (payloadAny.targetUserId as number | undefined) ??
      null;
    await this.actionLogs.logAgentAction({
      ownerUserId: approval.userId,
      agentId: conn?.id ?? approval.agentConnectionId ?? null,
      actionType: mapApprovalToActionType(approval),
      actionStatus: status,
      riskLevel: mapApprovalRiskLevel(approval.riskLevel),
      agentTaskId: approval.agentTaskId,
      targetUserId,
      relatedSocialRequestId: approval.relatedSocialRequestId,
      relatedCandidateId: approval.relatedCandidateId,
      relatedActivityId: approval.relatedActivityId,
      inputSummary: approval.summary,
      outputSummary: extra.outputSummary ?? null,
      payload: {
        approvalId: approval.id,
        agentTaskId: approval.agentTaskId,
        approvalType: approval.type,
        ...(extra.payload ?? {}),
      },
      reason: extra.reason ?? 'approval_dispatched',
    });
  }
}
