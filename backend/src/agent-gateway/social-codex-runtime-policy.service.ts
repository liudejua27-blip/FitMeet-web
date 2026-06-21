import { Injectable } from '@nestjs/common';

import { cleanDisplayText } from '../common/display-text.util';
import { SocialAgentToolName } from './social-agent-tool.types';

export type SocialCodexActionType =
  | 'summarize_intent'
  | 'create_opportunity_card'
  | 'publish_social_request'
  | 'search_public_candidates'
  | 'rank_candidates'
  | 'save_candidate'
  | 'generate_opener'
  | 'send_invite'
  | 'send_message'
  | 'exchange_contact'
  | 'reveal_precise_location'
  | 'update_sensitive_profile'
  | 'connect_candidate'
  | 'join_activity'
  | 'offline_meeting'
  | 'life_graph_writeback'
  | 'payment';

export type SocialCodexRiskLevel = 'low' | 'medium' | 'high' | 'blocked';

export type SocialCodexExecutionMode =
  | 'allow'
  | 'dry_run'
  | 'approval_required'
  | 'blocked';

export type SocialCodexPolicyDecision = {
  actionType: SocialCodexActionType;
  mode: SocialCodexExecutionMode;
  riskLevel: SocialCodexRiskLevel;
  reasons: string[];
  requiresApproval: boolean;
  dryRunRequired: boolean;
  auditRequired: boolean;
  sandbox: {
    redactFields: string[];
    readOnlyAccessAllowed: boolean;
    preciseLocationAllowed: boolean;
    contactExchangeAllowed: boolean;
    externalSideEffectAllowed: boolean;
    publicCandidateRequired: boolean;
    publicCandidateVerified: boolean;
    strangerConnectionAllowed: boolean;
    rateLimitRequired: boolean;
  };
  dryRunPreview: {
    required: boolean;
    title: string;
    summary: string;
    userVisibleFields: Record<string, unknown>;
    sideEffectAllowedBeforeApproval: boolean;
  };
  idempotencyKeyScope: string;
};

const HIGH_RISK_ACTIONS = new Set<SocialCodexActionType>([
  'send_invite',
  'send_message',
  'exchange_contact',
  'reveal_precise_location',
  'update_sensitive_profile',
  'connect_candidate',
  'join_activity',
  'offline_meeting',
  'payment',
]);

const MEDIUM_APPROVAL_ACTIONS = new Set<SocialCodexActionType>([
  'publish_social_request',
]);

const MEDIUM_RISK_ACTIONS = new Set<SocialCodexActionType>([
  'life_graph_writeback',
]);

const ACTION_BY_TOOL: Partial<
  Record<SocialAgentToolName, SocialCodexActionType>
> = {
  [SocialAgentToolName.PublishSocialRequest]: 'publish_social_request',
  [SocialAgentToolName.CreateSocialRequest]: 'create_opportunity_card',
  [SocialAgentToolName.SearchPublicIntents]: 'search_public_candidates',
  [SocialAgentToolName.SearchActivities]: 'search_public_candidates',
  [SocialAgentToolName.SearchMatches]: 'search_public_candidates',
  [SocialAgentToolName.ExplainMatches]: 'rank_candidates',
  [SocialAgentToolName.SaveCandidate]: 'save_candidate',
  [SocialAgentToolName.DraftOpener]: 'generate_opener',
  [SocialAgentToolName.SendMessageToCandidate]: 'send_invite',
  [SocialAgentToolName.SendMessage]: 'send_message',
  [SocialAgentToolName.ReplyMessage]: 'send_message',
  [SocialAgentToolName.ConnectCandidate]: 'connect_candidate',
  [SocialAgentToolName.AddFriend]: 'connect_candidate',
  [SocialAgentToolName.CreateActivity]: 'publish_social_request',
  [SocialAgentToolName.InviteActivity]: 'send_invite',
  [SocialAgentToolName.JoinActivity]: 'join_activity',
  [SocialAgentToolName.OfflineMeeting]: 'offline_meeting',
  [SocialAgentToolName.ShareLocation]: 'reveal_precise_location',
  [SocialAgentToolName.Payment]: 'payment',
  [SocialAgentToolName.UpdateAiProfileFromAnswers]: 'update_sensitive_profile',
  [SocialAgentToolName.UpdateProfileFromAgentContext]:
    'update_sensitive_profile',
};

@Injectable()
export class SocialCodexRuntimePolicyService {
  evaluate(input: {
    actionType?: SocialCodexActionType | null;
    actionName?: string | null;
    toolName?: SocialAgentToolName | string | null;
    payload?: Record<string, unknown> | null;
    userConfirmed?: boolean | null;
  }): SocialCodexPolicyDecision {
    const payload = input.payload ?? {};
    const actionType = this.resolveActionType(
      input.actionType ?? input.actionName,
      input.toolName,
      payload,
    );
    const reasons: string[] = [];
    const containsContact = this.containsContact(payload);
    const containsPreciseLocation = this.containsPreciseLocation(payload);
    const publicCandidateRequired = this.requiresPublicCandidate(actionType);
    const publicCandidateVerified =
      !publicCandidateRequired || this.hasPublicCandidateBoundary(payload);
    const publicCandidateExplicitlyPrivate =
      publicCandidateRequired && this.hasPrivateCandidateBoundary(payload);
    const rateLimitExceeded = this.isRateLimited(actionType, payload);

    if (actionType === 'exchange_contact' && !input.userConfirmed) {
      reasons.push('涉及联系方式，必须先获得用户确认。');
    }
    if (containsContact && !input.userConfirmed) {
      reasons.push('消息内容包含联系方式，不能混在普通消息里自动发送。');
    }
    if (actionType === 'reveal_precise_location' && !input.userConfirmed) {
      reasons.push('涉及精确位置，必须先获得用户确认。');
    }
    if (containsPreciseLocation && !input.userConfirmed) {
      reasons.push('内容包含精确位置，必须先走位置公开确认。');
    }

    if (
      ((containsContact && actionType !== 'exchange_contact') ||
        (containsPreciseLocation &&
          actionType !== 'reveal_precise_location')) &&
      input.userConfirmed !== true
    ) {
      return this.decision(actionType, 'blocked', 'blocked', [
        ...reasons,
        '确认前禁止把精确位置或联系方式夹带在其他动作里。',
      ]);
    }

    if (publicCandidateExplicitlyPrivate) {
      return this.decision(actionType, 'blocked', 'blocked', [
        '陌生人连接、邀请或消息只能面向公开可发现候选人或已有关系。',
        '该候选人当前不是公开可发现状态，不能触达对方。',
      ]);
    }

    if (publicCandidateRequired && !publicCandidateVerified) {
      return this.decision(actionType, 'blocked', 'blocked', [
        '陌生人连接、邀请或消息只能面向公开可发现候选人或已有关系。',
        '执行前需要先验证候选人来自公开资料、公开动态、活动报名或公开约练意图。',
      ]);
    }

    if (rateLimitExceeded) {
      return this.decision(actionType, 'blocked', 'blocked', [
        '短时间内陌生人触达次数过多，社交安全边界已暂停继续执行。',
        '请稍后再试，或先等待对方回复。',
      ]);
    }

    if (MEDIUM_APPROVAL_ACTIONS.has(actionType)) {
      return this.decision(actionType, 'approval_required', 'medium', [
        ...reasons,
        '这是会公开到发现页的约练内容。',
        '发布前需要先预览内容，并由你确认后再继续。',
      ]);
    }

    if (HIGH_RISK_ACTIONS.has(actionType)) {
      return this.decision(actionType, 'approval_required', 'high', [
        ...reasons,
        '这是会影响真实用户、公开内容或隐私边界的动作。',
        '执行前需要先预览影响，并由你确认后再继续。',
      ]);
    }

    if (MEDIUM_RISK_ACTIONS.has(actionType)) {
      return this.decision(actionType, 'dry_run', 'medium', [
        '这是会影响用户长期体验的动作，需要先展示草稿。',
      ]);
    }

    return this.decision(actionType, 'allow', 'low', [
      '这是低风险的理解、整理或公开候选读取动作。',
    ]);
  }

  sanitizePayload(
    payload: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> {
    const source = payload ?? {};
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
      out[key] = this.sanitizeValue(key, value);
    }
    return out;
  }

  buildAuditPayload(input: {
    userId: number;
    taskId?: number | null;
    runId?: string | null;
    decision: SocialCodexPolicyDecision;
    payload?: Record<string, unknown> | null;
  }) {
    return {
      event: 'social_codex.policy_decision',
      userId: input.userId,
      taskId: input.taskId ?? null,
      runId: input.runId ?? null,
      actionType: input.decision.actionType,
      mode: input.decision.mode,
      riskLevel: input.decision.riskLevel,
      requiresApproval: input.decision.requiresApproval,
      dryRunRequired: input.decision.dryRunRequired,
      auditRequired: input.decision.auditRequired,
      reasons: input.decision.reasons,
      payload: this.sanitizePayload(input.payload),
    };
  }

  private decision(
    actionType: SocialCodexActionType,
    mode: SocialCodexExecutionMode,
    riskLevel: SocialCodexRiskLevel,
    reasons: string[],
  ): SocialCodexPolicyDecision {
    return {
      actionType,
      mode,
      riskLevel,
      reasons,
      requiresApproval: mode === 'approval_required',
      dryRunRequired: mode === 'dry_run' || mode === 'approval_required',
      auditRequired: mode !== 'allow',
      sandbox: {
        redactFields: [
          'phone',
          'mobile',
          'wechat',
          'weChat',
          'address',
          'exactLocation',
          'preciseLocation',
        ],
        readOnlyAccessAllowed: mode === 'allow',
        preciseLocationAllowed: false,
        contactExchangeAllowed: false,
        externalSideEffectAllowed: false,
        publicCandidateRequired: this.requiresPublicCandidate(actionType),
        publicCandidateVerified:
          !this.requiresPublicCandidate(actionType) ||
          reasons.some((reason) => reason.includes('公开可发现')) === false,
        strangerConnectionAllowed:
          mode === 'allow' || actionType === 'search_public_candidates',
        rateLimitRequired: this.requiresRateLimit(actionType),
      },
      dryRunPreview: this.buildDryRunPreview(actionType, mode, reasons),
      idempotencyKeyScope: `social_codex:${actionType}`,
    };
  }

  private buildDryRunPreview(
    actionType: SocialCodexActionType,
    mode: SocialCodexExecutionMode,
    reasons: string[],
  ): SocialCodexPolicyDecision['dryRunPreview'] {
    const required = mode === 'dry_run' || mode === 'approval_required';
    return {
      required,
      title: this.previewTitle(actionType),
      summary: required
        ? '执行前只生成草稿和可见预览，不会触达用户、公开内容或写入敏感信息。'
        : mode === 'blocked'
          ? '该动作当前被社交安全边界阻止，不会执行。'
          : '该动作仅用于低风险读取或整理。',
      userVisibleFields: {
        actionType,
        mode,
        reasons: reasons.slice(0, 4),
      },
      sideEffectAllowedBeforeApproval: false,
    };
  }

  private previewTitle(actionType: SocialCodexActionType): string {
    if (actionType === 'publish_social_request') return '约练发布草稿';
    if (actionType === 'save_candidate') return '候选收藏记录';
    if (actionType === 'send_invite') return '邀请发送草稿';
    if (actionType === 'send_message') return '消息发送草稿';
    if (actionType === 'connect_candidate') return '加好友请求草稿';
    if (actionType === 'join_activity') return '活动参与确认预览';
    if (actionType === 'offline_meeting') return '线下见面确认预览';
    if (actionType === 'exchange_contact') return '联系方式交换预览';
    if (actionType === 'reveal_precise_location') return '位置公开预览';
    if (actionType === 'update_sensitive_profile') return '画像更新预览';
    if (actionType === 'life_graph_writeback') return 'Life Graph 写入预览';
    if (actionType === 'payment') return '支付动作预览';
    return '工具执行预览';
  }

  private resolveActionType(
    value: unknown,
    toolName: SocialAgentToolName | string | null | undefined,
    payload: Record<string, unknown> = {},
  ): SocialCodexActionType {
    if (this.isActionType(value)) return value;
    if (
      toolName === SocialAgentToolName.CreateSocialRequest &&
      this.isPublishSocialRequestPayload(payload)
    ) {
      return 'publish_social_request';
    }
    if (this.isToolName(toolName)) {
      return ACTION_BY_TOOL[toolName] ?? 'summarize_intent';
    }
    const text = cleanDisplayText(value, '').toLowerCase();
    if (/publish|discover|公开|发布/.test(text))
      return 'publish_social_request';
    if (/invite|邀请/.test(text)) return 'send_invite';
    if (/message|私信|发消息/.test(text)) return 'send_message';
    if (/connect|friend|好友/.test(text)) return 'connect_candidate';
    if (/contact|phone|wechat|联系方式/.test(text)) return 'exchange_contact';
    if (/location|位置|地址/.test(text)) return 'reveal_precise_location';
    if (/profile|画像/.test(text)) return 'update_sensitive_profile';
    if (/save|favorite|bookmark|collect|收藏|保存|喜欢/.test(text))
      return 'save_candidate';
    if (/candidate|match|search|候选|匹配/.test(text))
      return 'search_public_candidates';
    return 'summarize_intent';
  }

  private isPublishSocialRequestPayload(
    payload: Record<string, unknown>,
  ): boolean {
    const mode = cleanDisplayText(
      payload.mode ??
        payload.intent ??
        payload.visibility ??
        payload.audience ??
        payload.discoverability,
      '',
    ).toLowerCase();
    return (
      this.truthy(payload.publish) ||
      this.truthy(payload.isPublic) ||
      this.truthy(payload.public) ||
      this.truthy(payload.publiclyVisible) ||
      this.truthy(payload.syncPublicIntent) ||
      this.truthy(payload.discoverable) ||
      this.truthy(payload.publicIntentEnabled) ||
      mode === 'publish' ||
      mode === 'public' ||
      mode === 'everyone' ||
      mode === 'discoverable' ||
      mode === 'public_discoverable' ||
      mode === 'recommendable'
    );
  }

  private isActionType(value: unknown): value is SocialCodexActionType {
    return (
      typeof value === 'string' &&
      [
        'summarize_intent',
        'create_opportunity_card',
        'publish_social_request',
        'search_public_candidates',
        'rank_candidates',
        'save_candidate',
        'generate_opener',
        'send_invite',
        'send_message',
        'exchange_contact',
        'reveal_precise_location',
        'update_sensitive_profile',
        'connect_candidate',
        'join_activity',
        'offline_meeting',
        'life_graph_writeback',
        'payment',
      ].includes(value)
    );
  }

  private isToolName(value: unknown): value is SocialAgentToolName {
    return (
      typeof value === 'string' &&
      Object.values(SocialAgentToolName).includes(value as SocialAgentToolName)
    );
  }

  private truthy(value: unknown): boolean {
    if (value === true) return true;
    const text =
      typeof value === 'string' && value.trim()
        ? value.trim().toLowerCase()
        : '';
    return (
      text === 'true' || text === '1' || text === 'yes' || text === 'public'
    );
  }

  private containsContact(payload: Record<string, unknown>): boolean {
    return Object.entries(payload).some(([key, value]) => {
      if (this.isContactKey(key)) return true;
      if (typeof value === 'string') return this.stringContainsContact(value);
      if (Array.isArray(value)) {
        return value.some((item) => this.valueContainsContact(item));
      }
      return this.isRecord(value) ? this.containsContact(value) : false;
    });
  }

  private containsPreciseLocation(payload: Record<string, unknown>): boolean {
    return Object.entries(payload).some(([key, value]) => {
      if (
        /^(exactLocation|preciseLocation|address|lat|lng|longitude|latitude)$/i.test(
          key,
        )
      ) {
        return true;
      }
      if (typeof value === 'string')
        return this.stringContainsPreciseLocation(value);
      if (Array.isArray(value)) {
        return value.some((item) => this.valueContainsPreciseLocation(item));
      }
      return this.isRecord(value) ? this.containsPreciseLocation(value) : false;
    });
  }

  private requiresPublicCandidate(actionType: SocialCodexActionType): boolean {
    return (
      actionType === 'send_invite' ||
      actionType === 'send_message' ||
      actionType === 'connect_candidate' ||
      actionType === 'exchange_contact'
    );
  }

  private requiresRateLimit(actionType: SocialCodexActionType): boolean {
    return (
      actionType === 'send_invite' ||
      actionType === 'send_message' ||
      actionType === 'connect_candidate' ||
      actionType === 'exchange_contact'
    );
  }

  private hasPublicCandidateBoundary(
    payload: Record<string, unknown>,
  ): boolean {
    if (
      this.hasScalar(payload.connectionId) ||
      this.hasScalar(payload.conversationId) ||
      this.hasScalar(payload.agentConnectionId) ||
      this.hasScalar(payload.candidateRecordId) ||
      this.hasScalar(payload.socialRequestId) ||
      this.hasScalar(payload.publicIntentId) ||
      this.hasScalar(payload.activityId)
    ) {
      return true;
    }
    const relationship = cleanDisplayText(
      payload.relationship,
      '',
    ).toLowerCase();
    if (/(friend|connected|好友|已连接)/.test(relationship)) return true;
    if (
      payload.publiclyDiscoverable === true ||
      payload.isPublicCandidate === true
    )
      return true;
    const visibility = cleanDisplayText(
      payload.candidateVisibility ?? payload.visibility,
      '',
    ).toLowerCase();
    if (/(public|discoverable|公开|可发现)/.test(visibility)) return true;
    const source = cleanDisplayText(
      payload.source ?? payload.candidateSource,
      '',
    ).toLowerCase();
    if (
      /(public|discover|公开|发现|activity_signup|public_intent)/.test(source)
    )
      return true;
    const candidate = payload.candidate;
    if (this.isRecord(candidate))
      return this.hasPublicCandidateBoundary(candidate);
    return false;
  }

  private hasPrivateCandidateBoundary(
    payload: Record<string, unknown>,
  ): boolean {
    const visibility = cleanDisplayText(
      payload.candidateVisibility ?? payload.visibility,
      '',
    ).toLowerCase();
    if (/(private|hidden|closed|不可见|私密|不公开|关闭)/.test(visibility)) {
      return true;
    }
    if (
      payload.publiclyDiscoverable === false ||
      payload.isPublicCandidate === false ||
      payload.discoverable === false
    ) {
      return true;
    }
    const candidate = payload.candidate;
    return this.isRecord(candidate)
      ? this.hasPrivateCandidateBoundary(candidate)
      : false;
  }

  private isRateLimited(
    actionType: SocialCodexActionType,
    payload: Record<string, unknown>,
  ): boolean {
    if (!this.requiresRateLimit(actionType)) return false;
    const recent = this.numberFromUnknown(
      payload.recentStrangerContactCount ??
        payload.recentInviteCount ??
        payload.recentMessageCount,
    );
    const daily = this.numberFromUnknown(
      payload.dailyStrangerContactCount ??
        payload.dailyInviteCount ??
        payload.dailyMessageCount,
    );
    return (recent !== null && recent >= 5) || (daily !== null && daily >= 20);
  }

  private numberFromUnknown(value: unknown): number | null {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  private hasScalar(value: unknown): boolean {
    return (
      (typeof value === 'number' && Number.isFinite(value) && value > 0) ||
      (typeof value === 'string' && value.trim().length > 0)
    );
  }

  private sanitizeValue(key: string, value: unknown): unknown {
    if (this.isSensitiveKey(key)) return '[redacted]';
    if (this.isRecord(value)) return this.sanitizePayload(value);
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeValue('', item));
    }
    if (typeof value === 'string') {
      if (
        this.stringContainsContact(value) ||
        this.stringContainsPreciseLocation(value)
      ) {
        return '[redacted]';
      }
      return cleanDisplayText(value, '').slice(0, 500);
    }
    return value;
  }

  private valueContainsContact(value: unknown): boolean {
    if (typeof value === 'string') return this.stringContainsContact(value);
    if (Array.isArray(value))
      return value.some((item) => this.valueContainsContact(item));
    return this.isRecord(value) ? this.containsContact(value) : false;
  }

  private valueContainsPreciseLocation(value: unknown): boolean {
    if (typeof value === 'string')
      return this.stringContainsPreciseLocation(value);
    if (Array.isArray(value))
      return value.some((item) => this.valueContainsPreciseLocation(item));
    return this.isRecord(value) ? this.containsPreciseLocation(value) : false;
  }

  private stringContainsContact(value: string): boolean {
    return /(\b1[3-9]\d{9}\b|微信|wechat|vx[:：]?)/i.test(value);
  }

  private stringContainsPreciseLocation(value: string): boolean {
    return /(门牌|单元|楼栋|宿舍|经度|纬度|\d+\.\d{4,})/.test(value);
  }

  private isSensitiveKey(key: string): boolean {
    return (
      this.isContactKey(key) ||
      /(address|exactLocation|preciseLocation|privateMessage|conversationText)/i.test(
        key,
      )
    );
  }

  private isContactKey(key: string): boolean {
    return /^(phone|mobile|wechat|weChat|contact|contactInfo|contactMethod)$/i.test(
      key,
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
