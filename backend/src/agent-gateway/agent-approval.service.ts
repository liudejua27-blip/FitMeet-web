import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import {
  AgentApprovalRequest,
  ApprovalRiskLevel,
  ApprovalStatus,
  ApprovalType,
} from './entities/agent-approval-request.entity';
import { AgentConnection } from './entities/agent-connection.entity';
import {
  AgentSettings,
  AgentSettingsMode,
} from './entities/agent-settings.entity';
import { AgentAutoActionType, canAutoExecute } from './agent-autonomy.policy';
import {
  AgentActivityLog,
  ActionResult,
  LoggedAction,
} from './entities/agent-activity-log.entity';
import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskEventActor,
  AgentTaskEventType,
} from './entities/agent-task.entity';
import { AgentWebhookService } from './agent-webhook.service';
import { RealtimeEventService } from '../realtime/realtime-event.service';
import { clearSocialAgentPendingAction } from './social-agent-memory.util';
import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';

/**
 * Approval lifecycle helpers + risk classifier.
 *
 * Use `classify()` to decide whether a given agent action requires user
 * approval, then `create()` to persist the request, then
 * `approve()` / `reject()` to resolve. `dispatchOnApprove` is a callback
 * the caller (typically AgentGatewayService) provides so the service
 * can stay decoupled from per-action wiring (avoiding a circular
 * dependency with AgentGatewayService.sendMessage).
 */
@Injectable()
export class AgentApprovalService {
  private readonly logger = new Logger(AgentApprovalService.name);

  constructor(
    @InjectRepository(AgentApprovalRequest)
    private readonly repo: Repository<AgentApprovalRequest>,
    @InjectRepository(AgentActivityLog)
    private readonly logRepo: Repository<AgentActivityLog>,
    private readonly webhooks: AgentWebhookService,
    @Optional()
    private readonly realtime?: RealtimeEventService,
    @Optional()
    @InjectRepository(AgentTask)
    private readonly taskRepo?: Repository<AgentTask>,
    @Optional()
    @InjectRepository(AgentTaskEvent)
    private readonly eventRepo?: Repository<AgentTaskEvent>,
  ) {}

  // ───────────────────────────────────────────────
  //  RISK CLASSIFIER
  // ───────────────────────────────────────────────

  /**
   * Decide whether the given action requires owner approval and at
   * what risk band. Pure function over (actionType, payload, settings,
   * ctx).
   *
   * Hard rules from product safety spec:
   *  - sending a message / first message → required
   *  - add friend / connect candidate → required
   *  - create / join / publish offline activity → required
   *  - contact exchange / location share / photo upload → required
   *  - night activity / alcohol / payment → required (high)
   *  - target user has unknown risk profile → required (high)
   *  - settings.requireApprovalForAll → required for any write
   *  - mode === Basic        → any write needs approval
   *  - mode === SandboxInternal → block contact with real users entirely
   *  - mode === Open         → platform safety filters still apply (handled
   *                            by capBlocked + context bumps below; this
   *                            mode does NOT bypass blocked-content,
   *                            blocked-user, payment, or harassment checks)
   */
  classify(input: {
    type: ApprovalType;
    actionType?: AgentAutoActionType;
    payload: Record<string, unknown>;
    settings: AgentSettings;
    ctx?: {
      isFirstContact?: boolean;
      targetRiskUnknown?: boolean;
      isNight?: boolean;
      involvesAlcohol?: boolean;
      involvesPayment?: boolean;
    };
  }): {
    requiresApproval: boolean;
    blocked: boolean;
    blockedReason?: string;
    riskLevel: ApprovalRiskLevel;
    summary: string;
    reasons: string[];
  } {
    const { type, settings, ctx = {} } = input;
    const actionType = input.actionType ?? this.toAutoActionType(type);
    const reasons: string[] = [];
    let risk: ApprovalRiskLevel = ApprovalRiskLevel.Low;
    const bumpRisk = (level: ApprovalRiskLevel) => {
      const order = [
        ApprovalRiskLevel.Low,
        ApprovalRiskLevel.Medium,
        ApprovalRiskLevel.High,
      ];
      if (order.indexOf(level) > order.indexOf(risk)) risk = level;
    };

    // SandboxInternal mode (legacy Lab): cannot touch real users at all
    // for any messaging / activity / contact action.
    if (settings.mode === AgentSettingsMode.SandboxInternal) {
      const realUserAction = [
        ApprovalType.SendMessage,
        ApprovalType.FirstMessage,
        ApprovalType.ContactRequest,
        ApprovalType.ContactExchange,
        ApprovalType.CreateActivity,
        ApprovalType.JoinActivity,
        ApprovalType.OfflineMeeting,
        ApprovalType.ShareLocation,
        ApprovalType.PhotoUpload,
      ].includes(type);
      if (realUserAction) {
        return {
          requiresApproval: false,
          blocked: true,
          blockedReason:
            'Sandbox mode: agent can only operate in the agent-to-agent sandbox.',
          riskLevel: ApprovalRiskLevel.High,
          summary: 'Action blocked by sandbox policy.',
          reasons: ['sandbox_internal_blocks_real_user_action'],
        };
      }
    }

    // Per-capability hard switches from settings.
    const capBlocked = this.checkCapability(type, settings, actionType);
    if (capBlocked) {
      return {
        requiresApproval: false,
        blocked: true,
        blockedReason: capBlocked,
        riskLevel: ApprovalRiskLevel.High,
        summary: `Action blocked: ${capBlocked}`,
        reasons: ['capability_disabled'],
      };
    }

    // Per-type baseline risk.
    let needs = false;
    switch (type) {
      case ApprovalType.SendMessage:
        needs = true;
        bumpRisk(
          settings.requireApprovalForFirstMessage || ctx.isFirstContact
            ? ApprovalRiskLevel.Medium
            : ApprovalRiskLevel.Low,
        );
        reasons.push('message_send_requires_explicit_approval');
        if (ctx.isFirstContact) reasons.push('first_contact_with_stranger');
        break;
      case ApprovalType.FirstMessage:
        needs = true;
        bumpRisk(ApprovalRiskLevel.Medium);
        reasons.push('first_contact_with_stranger');
        break;
      case ApprovalType.ContactRequest:
        needs = true;
        bumpRisk(ApprovalRiskLevel.Medium);
        reasons.push('contact_request_requires_explicit_approval');
        break;
      case ApprovalType.ContactExchange:
        needs = true;
        bumpRisk(ApprovalRiskLevel.High);
        reasons.push('contact_exchange_requires_explicit_approval');
        break;
      case ApprovalType.CreateActivity:
        needs = true;
        bumpRisk(ApprovalRiskLevel.Medium);
        reasons.push('activity_create_requires_explicit_approval');
        break;
      case ApprovalType.OfflineMeeting:
        needs = true;
        bumpRisk(ApprovalRiskLevel.High);
        reasons.push('offline_meeting_requires_high_risk_review_or_audit');
        break;
      case ApprovalType.JoinActivity:
        needs = true;
        bumpRisk(ApprovalRiskLevel.Medium);
        reasons.push('activity_invite_requires_approval_or_permission_source');
        break;
      case ApprovalType.ShareLocation:
        needs = true;
        bumpRisk(ApprovalRiskLevel.High);
        reasons.push('precise_location_high_risk');
        break;
      case ApprovalType.PhotoUpload:
      case ApprovalType.SubmitCompletionProof:
        if (settings.requireApprovalForPhotoUpload) {
          needs = true;
          bumpRisk(ApprovalRiskLevel.Medium);
          reasons.push('photo_upload_requires_review');
        }
        break;
      case ApprovalType.NightActivity:
        needs = true;
        bumpRisk(ApprovalRiskLevel.High);
        reasons.push('night_activity_high_risk');
        break;
      case ApprovalType.AlcoholActivity:
        needs = true;
        bumpRisk(ApprovalRiskLevel.High);
        reasons.push('alcohol_involved_high_risk');
        break;
      case ApprovalType.Payment:
        needs = true;
        bumpRisk(ApprovalRiskLevel.High);
        reasons.push('payment_requires_payment_intent_and_audit');
        break;
      case ApprovalType.UnknownRisk:
        needs = true;
        bumpRisk(ApprovalRiskLevel.High);
        reasons.push('target_risk_profile_unknown');
        break;
      case ApprovalType.PostPublish:
        needs = true;
        bumpRisk(ApprovalRiskLevel.Medium);
        reasons.push('public_publish_requires_explicit_approval');
        break;
      case ApprovalType.Custom:
      default:
        bumpRisk(ApprovalRiskLevel.Low);
        break;
    }

    // Contextual bumps.
    if (ctx.isNight) {
      needs = true;
      bumpRisk(ApprovalRiskLevel.High);
      reasons.push('night_activity_context');
    }
    if (ctx.involvesAlcohol) {
      needs = true;
      bumpRisk(ApprovalRiskLevel.High);
      reasons.push('alcohol_context');
    }
    if (ctx.involvesPayment) {
      needs = true;
      bumpRisk(ApprovalRiskLevel.High);
      reasons.push('payment_context');
    }
    if (ctx.targetRiskUnknown) {
      needs = true;
      bumpRisk(ApprovalRiskLevel.High);
      reasons.push('target_risk_profile_unknown');
    }
    const sensitiveWrite = this.classifySensitiveWrite(
      actionType,
      input.payload,
    );
    if (sensitiveWrite) {
      needs = true;
      bumpRisk(sensitiveWrite.riskLevel);
      reasons.push(sensitiveWrite.reason);
    }
    const schemaActionWrite =
      type === ApprovalType.Custom
        ? this.classifySchemaActionWrite(actionType, input.payload)
        : null;
    if (schemaActionWrite) {
      needs = true;
      bumpRisk(schemaActionWrite.riskLevel);
      reasons.push(schemaActionWrite.reason);
    }

    // Master switch.
    if (settings.requireApprovalForAll) {
      needs = true;
      reasons.push('user_requires_approval_for_all_actions');
    }

    if (!needs && !canAutoExecute(actionType, settings.mode, risk)) {
      needs = true;
      reasons.push(`${settings.mode}_requires_pending_${actionType}`);
    }

    return {
      requiresApproval: needs,
      blocked: false,
      riskLevel: risk,
      summary: this.buildSummary(type, input.payload),
      reasons: needs
        ? [...new Set(['approval_required_by_permission_engine', ...reasons])]
        : [
            ...new Set([
              `auto_execute_allowed_by_${settings.mode}`,
              ...reasons,
            ]),
          ],
    };
  }

  private checkCapability(
    type: ApprovalType,
    s: AgentSettings,
    actionType: AgentAutoActionType,
  ): string | null {
    switch (type) {
      case ApprovalType.SendMessage:
      case ApprovalType.FirstMessage:
        if (
          !s.allowSendMessage &&
          s.mode !== AgentSettingsMode.Assisted &&
          s.mode !== AgentSettingsMode.Basic
        ) {
          return 'Agent is not allowed to send messages.';
        }
        break;
      case ApprovalType.CreateActivity:
      case ApprovalType.OfflineMeeting:
        if (
          !s.allowCreateActivity &&
          s.mode !== AgentSettingsMode.Assisted &&
          s.mode !== AgentSettingsMode.Basic &&
          s.mode !== AgentSettingsMode.Normal &&
          s.mode !== AgentSettingsMode.Standard
        ) {
          return 'Agent is not allowed to create activities.';
        }
        break;
      case ApprovalType.JoinActivity:
        if (!s.allowJoinActivity)
          return 'Agent is not allowed to join activities.';
        break;
      case ApprovalType.ShareLocation:
        if (!s.allowShareLocation)
          return 'Agent is not allowed to share precise location.';
        break;
      case ApprovalType.PhotoUpload:
      case ApprovalType.SubmitCompletionProof:
        if (!s.allowUploadProof)
          return 'Agent is not allowed to upload photos / proof.';
        break;
      case ApprovalType.ContactRequest:
      case ApprovalType.ContactExchange:
        if (actionType === 'add_friend') break;
        if (!s.allowContactExchange)
          return 'Agent is not allowed to exchange contact info.';
        break;
    }
    return null;
  }

  private classifySensitiveWrite(
    actionType: AgentAutoActionType,
    payload: Record<string, unknown>,
  ): { riskLevel: ApprovalRiskLevel; reason: string } | null {
    const raw = [
      actionType,
      payload.actionType,
      payload.schemaAction,
      payload.action,
      payload.type,
      payload.intent,
      payload.fieldKey,
      payload.category,
    ]
      .map((value) => (typeof value === 'string' ? value : ''))
      .join(' ')
      .toLowerCase();
    if (!raw.trim()) return null;
    if (
      /\b(privacy|profile_visibility|visibility|discoverable|public_profile|modify_public_profile)\b/.test(
        raw,
      )
    ) {
      return {
        riskLevel: ApprovalRiskLevel.High,
        reason: 'privacy_change_requires_explicit_approval',
      };
    }
    if (
      /\b(update_sensitive_profile|sensitive_profile|sensitive_tag)\b/.test(raw)
    ) {
      return {
        riskLevel: ApprovalRiskLevel.High,
        reason: 'sensitive_profile_write_requires_explicit_approval',
      };
    }
    if (
      raw.includes('life_graph.accept_update') ||
      /\b(confirm_profile_update|life_graph_writeback|memory_write|write_memory|long_term_memory|profile_update)\b/.test(
        raw,
      )
    ) {
      return {
        riskLevel: ApprovalRiskLevel.Medium,
        reason: 'life_graph_memory_write_requires_explicit_approval',
      };
    }
    return null;
  }

  private classifySchemaActionWrite(
    actionType: AgentAutoActionType,
    payload: Record<string, unknown>,
  ): { riskLevel: ApprovalRiskLevel; reason: string } | null {
    const raw = [
      actionType,
      payload.actionType,
      payload.schemaAction,
      payload.action,
      payload.type,
      payload.intent,
      payload.toolName,
      payload.resumeMode,
    ]
      .map((value) => (typeof value === 'string' ? value : ''))
      .join(' ')
      .toLowerCase();
    if (!raw.trim()) return null;
    if (
      raw.includes('candidate.connect') ||
      /\b(connect_candidate|add_friend)\b/.test(raw)
    ) {
      return {
        riskLevel: ApprovalRiskLevel.Medium,
        reason: 'contact_request_requires_explicit_approval',
      };
    }
    if (/\b(exchange_contact|contact_exchange)\b/.test(raw)) {
      return {
        riskLevel: ApprovalRiskLevel.High,
        reason: 'contact_exchange_requires_explicit_approval',
      };
    }
    if (/\b(reveal_precise_location|share_precise_location)\b/.test(raw)) {
      return {
        riskLevel: ApprovalRiskLevel.High,
        reason: 'precise_location_high_risk',
      };
    }
    if (
      raw.includes('opener.confirm_send') ||
      /\b(send_message|send_candidate_message|send_invite|invite_candidate|reply_message)\b/.test(
        raw,
      )
    ) {
      return {
        riskLevel: ApprovalRiskLevel.Medium,
        reason: 'message_send_requires_explicit_approval',
      };
    }
    if (
      raw.includes('activity.confirm_create') ||
      /\b(create_activity|invite_activity|join_activity)\b/.test(raw)
    ) {
      return {
        riskLevel: ApprovalRiskLevel.Medium,
        reason: 'activity_create_requires_explicit_approval',
      };
    }
    if (
      raw.includes('meet_loop.resume') ||
      raw.includes('resume_after_approval')
    ) {
      return {
        riskLevel: ApprovalRiskLevel.Medium,
        reason: 'meet_loop_resume_requires_checkpoint_confirmation',
      };
    }
    if (/\b(payment|wallet|pay)\b/.test(raw)) {
      return {
        riskLevel: ApprovalRiskLevel.High,
        reason: 'payment_requires_payment_intent_and_audit',
      };
    }
    if (
      /\b(publish_social_request|public_publish|publish_activity|public_post)\b/.test(
        raw,
      )
    ) {
      return {
        riskLevel: ApprovalRiskLevel.Medium,
        reason: 'public_publish_requires_explicit_approval',
      };
    }
    return null;
  }

  private toAutoActionType(type: ApprovalType): AgentAutoActionType {
    switch (type) {
      case ApprovalType.SendMessage:
      case ApprovalType.FirstMessage:
        return 'send_message';
      case ApprovalType.ContactRequest:
        return 'add_friend';
      case ApprovalType.ContactExchange:
        return 'contact_exchange';
      case ApprovalType.CreateActivity:
        return 'create_activity';
      case ApprovalType.OfflineMeeting:
        return 'offline_meeting';
      case ApprovalType.JoinActivity:
        return 'invite_activity';
      case ApprovalType.Payment:
        return 'payment';
      case ApprovalType.PostPublish:
        return 'publish_social_request';
      default:
        return 'generate_suggestion';
    }
  }

  private buildSummary(
    type: ApprovalType,
    payload: Record<string, unknown>,
  ): string {
    const agentName =
      (payload._agentDisplayName as string) ||
      (payload._agentName as string) ||
      'Agent';
    const target =
      (payload._targetDisplayName as string) ||
      // eslint-disable-next-line @typescript-eslint/no-base-to-string, @typescript-eslint/restrict-template-expressions
      (payload.toUserId !== undefined ? `用户 #${payload.toUserId}` : '对方');
    switch (type) {
      case ApprovalType.SendMessage:
      case ApprovalType.FirstMessage:
        return `${agentName} 想代表你给 ${target} 发送${
          type === ApprovalType.FirstMessage ? '第一条' : '一条'
        }消息。`;
      case ApprovalType.ContactRequest:
      case ApprovalType.ContactExchange:
        return `${agentName} 想代表你和 ${target} 交换联系方式。`;
      case ApprovalType.CreateActivity:
        return `${agentName} 想代表你创建一个线下活动。`;
      case ApprovalType.OfflineMeeting:
        return `${agentName} 想代表你确认一个线下见面安排。`;
      case ApprovalType.JoinActivity:
        return `${agentName} 想代表你报名一个线下活动。`;
      case ApprovalType.ShareLocation:
        return `${agentName} 想代表你分享精确位置。`;
      case ApprovalType.PhotoUpload:
      case ApprovalType.SubmitCompletionProof:
        return `${agentName} 想代表你上传一张活动证明照片。`;
      case ApprovalType.NightActivity:
        return `${agentName} 想代表你确认一个夜间活动。`;
      case ApprovalType.AlcoholActivity:
        return `${agentName} 想代表你确认一个含酒精的活动。`;
      case ApprovalType.Payment:
        return `${agentName} 想代表你完成一次支付。`;
      case ApprovalType.UnknownRisk:
        return `${agentName} 想代表你执行一步需要确认的操作。`;
      case ApprovalType.PostPublish:
        return `${agentName} 想代表你发布一条动态。`;
      default:
        return `${agentName} 想代表你执行一个需要确认的动作。`;
    }
  }

  // ───────────────────────────────────────────────
  //  PERSISTENCE
  // ───────────────────────────────────────────────

  async create(input: {
    userId: number;
    agentConnectionId: number | null;
    agentTaskId?: number | null;
    type: ApprovalType;
    actionType?: string;
    skillName?: string;
    payload: Record<string, unknown>;
    summary: string;
    riskLevel: ApprovalRiskLevel;
    reason?: string;
    createdBy?: 'ai' | 'agent' | 'system';
    relatedSocialRequestId?: number | null;
    relatedCandidateId?: number | null;
    relatedActivityId?: number | null;
    rationale?: string;
    ttlMs?: number;
  }): Promise<AgentApprovalRequest> {
    const ttl = input.ttlMs ?? 24 * 60 * 60 * 1000;
    const payloadAgentTaskId = numberOrNull(input.payload.agentTaskId);
    const agentTaskId = input.agentTaskId ?? payloadAgentTaskId;
    const actionType = input.actionType ?? this.toAutoActionType(input.type);
    const payload = this.withSocialCodexApprovalPayload(
      { ...input, actionType },
      agentTaskId,
    );
    const saved = await this.repo.save(
      this.repo.create({
        userId: input.userId,
        agentConnectionId: input.agentConnectionId,
        agentTaskId,
        type: input.type,
        actionType,
        skillName: input.skillName ?? actionType,
        payload,
        summary: input.summary,
        reason: input.reason ?? input.rationale ?? '',
        createdBy: input.createdBy ?? 'agent',
        relatedSocialRequestId:
          input.relatedSocialRequestId ??
          (input.payload.socialRequestId as number | undefined) ??
          null,
        relatedCandidateId:
          input.relatedCandidateId ??
          (input.payload.candidateRecordId as number | undefined) ??
          null,
        relatedActivityId:
          input.relatedActivityId ??
          (input.payload.activityId as number | undefined) ??
          null,
        riskLevel: input.riskLevel,
        agentRationale: input.rationale ?? '',
        expiresAt: new Date(Date.now() + ttl),
      }),
    );
    void this.emitApprovalWebhook(saved, 'approval.created');
    this.realtime?.emitToUser({
      userId: saved.userId,
      eventType: 'agent:approval_required',
      payload: {
        approvalId: saved.id,
        agentTaskId: saved.agentTaskId,
        actionType: saved.actionType,
        riskLevel: saved.riskLevel,
        summary: saved.summary,
        status: saved.status,
      },
      rooms: saved.agentTaskId ? [`agent_task:${saved.agentTaskId}`] : [],
      notification: {
        type: 'approval',
        text: saved.summary,
        pushPayload: { approvalId: saved.id, agentTaskId: saved.agentTaskId },
      },
    });
    return saved;
  }

  private withSocialCodexApprovalPayload(
    input: {
      type: ApprovalType;
      actionType?: string;
      skillName?: string;
      payload: Record<string, unknown>;
      summary: string;
      riskLevel: ApprovalRiskLevel;
      reason?: string;
      rationale?: string;
    },
    agentTaskId: number | null | undefined,
  ): Record<string, unknown> {
    const actionType = input.actionType ?? this.toAutoActionType(input.type);
    const idempotencyKey =
      stringOrNull(input.payload.idempotencyKey) ??
      stringOrNull(input.payload.resumeIdempotencyKey) ??
      this.approvalIdempotencyKey(input, agentTaskId);
    const dryRunPreview = this.buildDryRunPreview({
      type: input.type,
      actionType,
      skillName: input.skillName ?? actionType,
      payload: input.payload,
      summary: input.summary,
      riskLevel: input.riskLevel,
      idempotencyKey,
    });
    return sanitizeForDisplay({
      ...input.payload,
      ...(agentTaskId ? { agentTaskId } : {}),
      idempotencyKey,
      dryRunPreview,
      socialCodex: {
        ...(isRecord(input.payload.socialCodex)
          ? input.payload.socialCodex
          : {}),
        approvalPolicy: {
          required: true,
          lifecycleNode: 'approval',
          sideEffectsBeforeApproval: 'none',
          resumeAfterDecision: true,
          auditRequired: true,
        },
        dryRunPreview,
        safetyBoundary: {
          noContactBeforeApproval: true,
          noPreciseLocationRevealBeforeApproval: true,
          noExternalContactExchangeBeforeApproval: true,
        },
        reason: input.reason ?? input.rationale ?? null,
      },
    }) as Record<string, unknown>;
  }

  private buildDryRunPreview(input: {
    type: ApprovalType;
    actionType: string;
    skillName: string;
    payload: Record<string, unknown>;
    summary: string;
    riskLevel: ApprovalRiskLevel;
    idempotencyKey: string;
  }) {
    const visibleContent =
      stringOrNull(input.payload.message) ??
      stringOrNull(input.payload.text) ??
      stringOrNull(input.payload.title) ??
      stringOrNull(input.payload.summary) ??
      null;
    return {
      schemaVersion: 'fitmeet.social_codex.approval_preview.v1',
      title: this.previewTitle(input.type, input.actionType),
      summary: input.summary,
      actionType: input.actionType,
      skillName: input.skillName,
      riskLevel: input.riskLevel,
      visibleToOtherUser: this.otherUserVisibility(input.type),
      sideEffectBoundary: '确认前不会执行、不会触达对方、不会公开内容。',
      dataBoundary: this.dataBoundary(input.type, input.actionType),
      idempotencyKey: input.idempotencyKey,
      ...(visibleContent
        ? { contentPreview: visibleContent.slice(0, 300) }
        : {}),
    };
  }

  private previewTitle(type: ApprovalType, actionType: string): string {
    if (type === ApprovalType.PostPublish || /publish/i.test(actionType)) {
      return '发布到发现前预览';
    }
    if (
      type === ApprovalType.SendMessage ||
      type === ApprovalType.FirstMessage ||
      /message|invite/i.test(actionType)
    ) {
      return '发送前预览';
    }
    if (
      type === ApprovalType.ContactRequest ||
      /connect|friend/i.test(actionType)
    ) {
      return '加好友并聊天前预览';
    }
    if (type === ApprovalType.ShareLocation) return '公开位置前预览';
    if (type === ApprovalType.Payment) return '支付前预览';
    return '执行前预览';
  }

  private otherUserVisibility(type: ApprovalType): string {
    switch (type) {
      case ApprovalType.SendMessage:
      case ApprovalType.FirstMessage:
      case ApprovalType.ContactRequest:
      case ApprovalType.ContactExchange:
      case ApprovalType.JoinActivity:
        return '确认后对方会看到这次联系或邀请。';
      case ApprovalType.PostPublish:
      case ApprovalType.CreateActivity:
        return '确认后公开可发现用户可能看到这张卡片。';
      case ApprovalType.ShareLocation:
        return '确认后会公开你允许展示的位置范围。';
      default:
        return '确认后才会执行这个动作。';
    }
  }

  private dataBoundary(type: ApprovalType, actionType: string): string {
    if (type === ApprovalType.ShareLocation || /location/i.test(actionType)) {
      return '默认只使用地点范围；精确位置必须再次确认。';
    }
    if (
      type === ApprovalType.ContactExchange ||
      /contact|wechat|phone/i.test(actionType)
    ) {
      return '不会在确认前交换手机号、微信或外部联系方式。';
    }
    if (type === ApprovalType.PostPublish || /publish/i.test(actionType)) {
      return '会过滤联系方式、精确住址和敏感画像字段。';
    }
    return '只使用当前任务必要信息；确认记录会保留，方便你之后追踪和撤回。';
  }

  private approvalIdempotencyKey(
    input: {
      type: ApprovalType;
      actionType?: string;
      payload: Record<string, unknown>;
    },
    agentTaskId: number | null | undefined,
  ): string {
    const target =
      stringOrNull(input.payload.targetUserId) ??
      stringOrNull(input.payload.candidateUserId) ??
      stringOrNull(input.payload.activityId) ??
      stringOrNull(input.payload.socialRequestId) ??
      'target';
    return [
      'approval',
      agentTaskId ?? 'task',
      input.actionType ?? input.type,
      target,
    ].join(':');
  }

  async getPending(userId: number) {
    await this.expireStalePendingApprovals({ userId });
    return this.repo.find({
      where: {
        userId,
        status: ApprovalStatus.Pending,
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async getPendingForTask(userId: number, agentTaskId: number) {
    await this.expireStalePendingApprovals({ userId, agentTaskId });
    return this.repo.find({
      where: {
        userId,
        agentTaskId,
        status: ApprovalStatus.Pending,
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async getById(id: number, userId: number) {
    const row = await this.repo.findOne({ where: { id, userId } });
    if (!row) throw new NotFoundException('Approval not found');
    return row;
  }

  /**
   * Approves the request and (if possible) dispatches the underlying
   * action. The dispatcher is provided by the caller to avoid a
   * circular dependency on AgentGatewayService.
   */
  async approve(
    id: number,
    userId: number,
    dispatcher?: (approval: AgentApprovalRequest) => Promise<unknown>,
  ): Promise<{
    approval: AgentApprovalRequest;
    dispatched: boolean;
    dispatchResult?: unknown;
    dispatchError?: string;
  }> {
    const row = await this.repo.findOne({ where: { id, userId } });
    if (!row) throw new NotFoundException('Approval not found');
    if (row.status !== ApprovalStatus.Pending) {
      return {
        approval: row,
        dispatched: false,
        dispatchResult: { idempotent: true, status: row.status },
      };
    }
    if (row.expiresAt < new Date()) {
      row.status = ApprovalStatus.Expired;
      const expired = await this.repo.save(row);
      await this.clearResolvedTaskPendingAction(expired);
      await this.writeApprovalTaskEvent(expired, 'expired');
      throw new BadRequestException('Approval has expired');
    }
    row.status = ApprovalStatus.Approved;
    row.respondedAt = new Date();
    const saved = await this.repo.save(row);

    let dispatched = false;
    let dispatchResult: unknown;
    let dispatchError: string | undefined;
    if (dispatcher) {
      try {
        dispatchResult = await dispatcher(saved);
        dispatched = true;
      } catch (err) {
        dispatchError = err instanceof Error ? err.message : 'Dispatch failed';
        this.logger.warn(
          `Approval ${id} approved but dispatch failed: ${dispatchError}`,
        );
      }
    }
    if (!dispatchError && !this.isDispatchFailureResult(dispatchResult)) {
      await this.clearResolvedTaskPendingAction(saved);
    }
    await this.writeApprovalTaskEvent(saved, 'approved', {
      dispatched,
      dispatchError,
    });
    void this.emitApprovalWebhook(saved, 'approval.approved', {
      dispatched,
      dispatchResult,
      dispatchError,
    });
    await this.writeDecisionLog(saved, ActionResult.Success);
    this.realtime?.emitToUser({
      userId: saved.userId,
      eventType: 'agent:completed',
      payload: {
        approvalId: saved.id,
        agentTaskId: saved.agentTaskId,
        status: saved.status,
        dispatched,
        dispatchError,
      },
      rooms: saved.agentTaskId ? [`agent_task:${saved.agentTaskId}`] : [],
    });
    return { approval: saved, dispatched, dispatchResult, dispatchError };
  }

  private isDispatchFailureResult(result: unknown): boolean {
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      return false;
    }
    const record = result as Record<string, unknown>;
    return record.ok === false || typeof record.errorMessage === 'string';
  }

  async reject(id: number, userId: number) {
    const row = await this.repo.findOne({ where: { id, userId } });
    if (!row) throw new NotFoundException('Approval not found');
    if (row.status !== ApprovalStatus.Pending) {
      throw new BadRequestException(
        `Approval already resolved (${row.status})`,
      );
    }
    row.status = ApprovalStatus.Rejected;
    row.respondedAt = new Date();
    const saved = await this.repo.save(row);
    await this.clearResolvedTaskPendingAction(saved);
    await this.writeApprovalTaskEvent(saved, 'rejected');
    await this.writeDecisionLog(saved, ActionResult.Blocked);
    void this.emitApprovalWebhook(saved, 'approval.rejected');
    this.realtime?.emitToUser({
      userId: saved.userId,
      eventType: 'agent:completed',
      payload: {
        approvalId: saved.id,
        agentTaskId: saved.agentTaskId,
        status: saved.status,
      },
      rooms: saved.agentTaskId ? [`agent_task:${saved.agentTaskId}`] : [],
    });
    return saved;
  }

  private async emitApprovalWebhook(
    approval: AgentApprovalRequest,
    event: 'approval.created' | 'approval.approved' | 'approval.rejected',
    extra: Record<string, unknown> = {},
  ) {
    try {
      await this.webhooks.emitToConnection(approval.agentConnectionId, event, {
        approvalId: approval.id,
        userId: approval.userId,
        type: approval.type,
        actionType: approval.actionType,
        skillName: approval.skillName,
        status: approval.status,
        riskLevel: approval.riskLevel,
        summary: approval.summary,
        relatedSocialRequestId: approval.relatedSocialRequestId,
        relatedCandidateId: approval.relatedCandidateId,
        relatedActivityId: approval.relatedActivityId,
        ...extra,
        agentTaskId: approval.agentTaskId,
      });
    } catch (err) {
      this.logger.warn(
        `Failed to emit ${event} webhook for approval ${approval.id}: ${(err as Error).message}`,
      );
    }
  }

  private async writeDecisionLog(
    approval: AgentApprovalRequest,
    result: ActionResult,
  ) {
    try {
      await this.logRepo.save(
        this.logRepo.create({
          agentConnectionId: approval.agentConnectionId ?? null,
          userId: approval.userId,
          action: this.toLoggedAction(approval),
          payload: {
            approvalId: approval.id,
            agentTaskId: approval.agentTaskId,
            actionType: approval.actionType,
            socialRequestId: approval.relatedSocialRequestId,
            candidateRecordId: approval.relatedCandidateId,
            decision: approval.status,
          },
          result,
          riskScore: 0,
          blockReason:
            approval.status === ApprovalStatus.Rejected
              ? 'User rejected pending action'
              : null,
        }),
      );
    } catch (err) {
      this.logger.warn(
        `Failed to write approval decision log ${approval.id}: ${(err as Error).message}`,
      );
    }
  }

  private async clearResolvedTaskPendingAction(
    approval: AgentApprovalRequest,
  ): Promise<void> {
    if (!this.taskRepo || !approval.agentTaskId) return;
    try {
      const task = await this.taskRepo.findOne({
        where: {
          id: approval.agentTaskId,
          ownerUserId: approval.userId,
        },
      });
      if (!task) return;
      clearSocialAgentPendingAction(task, approval.id);
      await this.taskRepo.save(task);
    } catch (err) {
      this.logger.warn(
        `Failed to clear pending task action for approval ${approval.id}: ${(err as Error).message}`,
      );
    }
  }

  private async expireStalePendingApprovals(input: {
    userId: number;
    agentTaskId?: number;
  }): Promise<void> {
    const rows = await this.repo.find({
      where: {
        userId: input.userId,
        ...(input.agentTaskId ? { agentTaskId: input.agentTaskId } : {}),
        status: ApprovalStatus.Pending,
      },
      take: input.agentTaskId ? 50 : 100,
    });
    const now = new Date();
    const expiredRows = rows.filter((row) => row.expiresAt < now);
    for (const row of expiredRows) {
      row.status = ApprovalStatus.Expired;
      const saved = await this.repo.save(row);
      await this.clearResolvedTaskPendingAction(saved);
      await this.writeApprovalTaskEvent(saved, 'expired');
    }
  }

  private async writeApprovalTaskEvent(
    approval: AgentApprovalRequest,
    decision: 'approved' | 'rejected' | 'expired',
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    if (!this.eventRepo || !approval.agentTaskId) return;
    const summary = this.approvalDecisionSummary(approval, decision);
    try {
      await this.eventRepo.save(
        this.eventRepo.create({
          taskId: approval.agentTaskId,
          ownerUserId: approval.userId,
          eventType: AgentTaskEventType.ConfirmationReceived,
          actor:
            decision === 'expired'
              ? AgentTaskEventActor.System
              : AgentTaskEventActor.User,
          summary,
          payload: sanitizeForDisplay({
            approvalId: approval.id,
            approvalType: approval.type,
            actionType: approval.actionType,
            status: approval.status,
            decision,
            riskLevel: approval.riskLevel,
            summary: approval.summary,
            relatedSocialRequestId: approval.relatedSocialRequestId,
            relatedCandidateId: approval.relatedCandidateId,
            relatedActivityId: approval.relatedActivityId,
            respondedAt: approval.respondedAt,
            expiresAt: approval.expiresAt,
            ...extra,
          }) as Record<string, unknown>,
        }),
      );
    } catch (err) {
      this.logger.warn(
        `Failed to write approval task event ${approval.id}: ${(err as Error).message}`,
      );
    }
  }

  private approvalDecisionSummary(
    approval: AgentApprovalRequest,
    decision: 'approved' | 'rejected' | 'expired',
  ): string {
    const label =
      decision === 'approved'
        ? '用户已批准'
        : decision === 'rejected'
          ? '用户已拒绝'
          : '确认请求已过期';
    return `${label}：${approval.summary || approval.actionType || approval.type}`;
  }

  private toLoggedAction(approval: AgentApprovalRequest): LoggedAction {
    if (approval.actionType === 'add_friend')
      return LoggedAction.ContactRequest;
    switch (approval.type) {
      case ApprovalType.SendMessage:
      case ApprovalType.FirstMessage:
        return LoggedAction.SendMessage;
      case ApprovalType.ContactRequest:
      case ApprovalType.ContactExchange:
        return LoggedAction.ContactRequest;
      case ApprovalType.CreateActivity:
      case ApprovalType.OfflineMeeting:
        return LoggedAction.CreateActivity;
      case ApprovalType.JoinActivity:
        return LoggedAction.JoinActivity;
      case ApprovalType.PhotoUpload:
      case ApprovalType.SubmitCompletionProof:
        return LoggedAction.SubmitCompletionProof;
      default:
        return LoggedAction.Intercepted;
    }
  }

  /**
   * Used by the agent-token side to confirm an approval is still
   * usable before performing the underlying action a second time.
   */
  async assertApproved(
    approvalId: number,
    userId: number,
    type: ApprovalType,
  ): Promise<AgentApprovalRequest> {
    const row = await this.repo.findOne({ where: { id: approvalId, userId } });
    if (!row) throw new NotFoundException('Approval not found');
    if (row.type !== type)
      throw new BadRequestException('Approval type mismatch');
    if (row.status !== ApprovalStatus.Approved)
      throw new ForbiddenException('Approval not granted');
    if (row.expiresAt < new Date())
      throw new ForbiddenException('Approval expired');
    return row;
  }
}

/** Convenience helper for callers that want to detect night-time. */
export function isNightHour(d: Date = new Date()): boolean {
  const h = d.getHours();
  return h >= 22 || h < 6;
}

export function detectAlcoholInText(text?: string | null): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  return /酒|啤酒|白酒|红酒|alcohol|beer|wine|whisky|cocktail|bar\b/.test(t);
}

export function detectPaymentInText(text?: string | null): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  return /转账|红包|付款|支付|venmo|paypal|wire transfer|gift card/.test(t);
}

/** Returns true when a Date string or {start} appears to be in night hours. */
export function timeFieldIsNight(value?: string | Date | null): boolean {
  if (!value) return false;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  return isNightHour(d);
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function stringOrNull(value: unknown): string | null {
  const text = cleanDisplayText(value, '').trim();
  return text || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

interface AgentConnectionLike {
  id: number;
  userId: number;
}
export type { AgentConnection, AgentConnectionLike };
