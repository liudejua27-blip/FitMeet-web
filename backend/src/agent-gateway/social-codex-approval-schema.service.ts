import { Injectable } from '@nestjs/common';

export type SocialCodexApprovalSchema = {
  actionType: string;
  title: string;
  detail: string;
  confirmationLabel: string;
  riskLevel: string;
  dryRunPreviewTitle: string;
  executionBoundary: string;
  resumePolicy: string;
  auditNote: string;
};

type ApprovalSchemaInput = {
  actionType?: string | null;
  summary?: string | null;
  riskLevel?: string | null;
  payload?: Record<string, unknown> | null;
};

@Injectable()
export class SocialCodexApprovalSchemaService {
  schemaFor(input: ApprovalSchemaInput): SocialCodexApprovalSchema {
    const actionType = this.normalizeActionType(input.actionType);
    const riskLevel = this.safeString(input.riskLevel) || 'medium';
    const summary = this.safeString(input.summary);
    const base = this.baseSchema(actionType);
    return {
      ...base,
      actionType,
      riskLevel,
      detail: summary || base.detail,
    };
  }

  enrichPayload(input: ApprovalSchemaInput): Record<string, unknown> {
    const payload = this.isRecord(input.payload) ? { ...input.payload } : {};
    const schema = this.schemaFor(input);
    const dryRunPreview = this.isRecord(payload.dryRunPreview)
      ? payload.dryRunPreview
      : {
          title: schema.dryRunPreviewTitle,
          visibleTo: this.visibleTo(schema.actionType),
          executionBoundary: schema.executionBoundary,
          reversible: this.isReversible(schema.actionType),
        };
    return {
      ...payload,
      socialCodexApproval: schema,
      dryRunPreview,
      executionBoundary: payload.executionBoundary ?? schema.executionBoundary,
      resumePolicy: payload.resumePolicy ?? schema.resumePolicy,
      auditRequired: true,
      sideEffectAllowedBeforeApproval: false,
    };
  }

  private baseSchema(
    actionType: string,
  ): Omit<SocialCodexApprovalSchema, 'riskLevel'> {
    if (actionType === 'publish_social_request') {
      return {
        actionType,
        title: '发布到发现前需要你确认',
        detail:
          '确认后，这张约练卡会出现在发现页，其他公开可发现用户可以看到。',
        confirmationLabel: '确认发布',
        dryRunPreviewTitle: '预览将公开的约练卡',
        executionBoundary:
          '只公开约练卡范围信息，不公开手机号、精确住址或私聊内容。',
        resumePolicy: '同意后从发布发现步骤继续；拒绝后保留草稿。',
        auditNote: '发布确认会保留记录，后续可撤回公开。',
      };
    }
    if (actionType === 'send_invite' || actionType === 'send_message') {
      return {
        actionType,
        title: '发送邀请前需要你确认',
        detail: '确认后，对方会收到这条邀请或开场白。',
        confirmationLabel: '确认发送',
        dryRunPreviewTitle: '预览将发送给对方的内容',
        executionBoundary: '不会自动追加联系方式、精确位置或超出预览的内容。',
        resumePolicy: '同意后从发送邀请步骤继续；拒绝后不会联系对方。',
        auditNote: '发送确认会保留记录，并避免重复发送。',
      };
    }
    if (actionType === 'connect_candidate' || actionType === 'add_friend') {
      return {
        actionType,
        title: '申请加好友前需要你确认',
        detail: '确认后，对方会看到你的好友申请。',
        confirmationLabel: '确认申请',
        dryRunPreviewTitle: '预览好友申请',
        executionBoundary: '只发送好友申请，不自动发送后续消息或交换联系方式。',
        resumePolicy: '同意后从好友申请步骤继续；拒绝后仅保留候选记录。',
        auditNote: '好友申请会保留确认记录，可在候选动作里追踪。',
      };
    }
    if (actionType === 'exchange_contact') {
      return {
        actionType,
        title: '交换联系方式前需要你确认',
        detail: '联系方式属于高敏信息，确认前不会展示或发送。',
        confirmationLabel: '确认交换',
        dryRunPreviewTitle: '预览将交换的联系方式范围',
        executionBoundary:
          '只交换你明确同意的联系方式，不自动同步其它账号信息。',
        resumePolicy: '同意后从联系方式交换步骤继续；拒绝后继续平台内沟通。',
        auditNote: '联系方式交换会写入高风险审计日志。',
      };
    }
    if (actionType === 'reveal_precise_location') {
      return {
        actionType,
        title: '公开精确位置前需要你确认',
        detail: '精确位置属于高敏信息，确认前只使用大致区域。',
        confirmationLabel: '确认公开位置',
        dryRunPreviewTitle: '预览将公开的位置粒度',
        executionBoundary: '默认只公开区域；精确地点必须由你单独确认。',
        resumePolicy: '同意后从位置公开步骤继续；拒绝后保留模糊区域。',
        auditNote: '位置公开确认会写入高风险审计日志。',
      };
    }
    if (actionType === 'update_sensitive_profile') {
      return {
        actionType,
        title: '写入敏感画像前需要你确认',
        detail: '这类画像会影响长期推荐，确认前不会保存到个人信息。',
        confirmationLabel: '确认写入',
        dryRunPreviewTitle: '预览将写入的画像变化',
        executionBoundary: '只写入你确认的稳定事实，可撤回、导出或删除。',
        resumePolicy: '同意后继续保存画像更新；拒绝后不保存该事实。',
        auditNote: '敏感画像写入会记录证据、来源和过期策略。',
      };
    }
    return {
      actionType,
      title: '执行这个动作前需要你确认',
      detail: '这个动作可能影响你和他人的社交体验，确认前不会执行。',
      confirmationLabel: '确认执行',
      dryRunPreviewTitle: '预览将执行的动作',
      executionBoundary:
        '确认前不会触达对方或公开内容；确认后只执行预览中的内容。',
      resumePolicy:
        '同意后接着当前进度继续；拒绝后停止这个动作，不会触达对方。',
      auditNote: '确认结果会保留记录。',
    };
  }

  private normalizeActionType(value: unknown): string {
    const raw = this.safeString(value);
    if (!raw) return 'unknown_action';
    if (raw === 'message_candidate') return 'send_invite';
    if (raw === 'friend_request') return 'connect_candidate';
    if (raw === 'publish_to_discover') return 'publish_social_request';
    return raw;
  }

  private visibleTo(actionType: string) {
    if (actionType === 'publish_social_request') return '发现页公开可发现用户';
    if (actionType === 'connect_candidate' || actionType === 'add_friend')
      return '目标用户';
    if (actionType === 'send_invite' || actionType === 'send_message')
      return '被邀请用户';
    if (actionType === 'exchange_contact') return '双方';
    if (actionType === 'reveal_precise_location') return '约练参与者';
    return '相关用户';
  }

  private isReversible(actionType: string) {
    return (
      actionType === 'publish_social_request' ||
      actionType === 'update_sensitive_profile'
    );
  }

  private safeString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
}
