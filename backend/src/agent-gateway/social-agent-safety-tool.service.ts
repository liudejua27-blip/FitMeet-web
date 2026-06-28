import { BadRequestException, Injectable, Optional } from '@nestjs/common';

import {
  redactSensitiveText,
  redactSensitiveValue,
} from '../common/privacy-redaction.util';
import { SafetyService } from '../safety/safety.service';
import { SocialPolicyService } from '../social-policy/social-policy.service';
import type { FitMeetAlphaCard } from './fitmeet-alpha-agent.types';

export type SocialAgentSafetyLevel = 'low' | 'medium' | 'high' | 'blocked';

export interface SocialAgentSafetyPolicyInput {
  ownerUserId: number;
  taskId?: number;
  action: string;
  text?: string;
  payload?: Record<string, unknown>;
}

export interface SocialAgentSafetyPolicyResult {
  allowed: boolean;
  level: SocialAgentSafetyLevel;
  reasons: string[];
  requiredConfirmations: string[];
  redactedPayload: Record<string, unknown>;
  card?: FitMeetAlphaCard;
}

const CONTACT_RE =
  /(?:\+?86[-\s]?)?1[3-9]\d[-\s]?\d{4}[-\s]?\d{4}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:微信|wechat|wx|qq|QQ|联系方式|联系我)[:：\s]*[A-Za-z0-9_-]{4,32}/i;
const PRECISE_LOCATION_RE =
  /(?:-?\d{1,3}\.\d{4,})\s*[,，]\s*(?:-?\d{1,3}\.\d{4,})|[\u4e00-\u9fa5A-Za-z0-9]{2,}(?:路|街|巷|弄|小区|公寓|宿舍|号楼|楼|栋|单元|室)\d*[A-Za-z0-9-]*/i;
const HIGH_RISK_CONTENT_RE =
  /裸照|色情|诈骗|转账|打钱|贷款|赌博|威胁|恐吓|骚扰|人身攻击|身份证|银行卡|杀猪盘/i;

const BLOCKED_ACTIONS = new Set([
  'publish_social_request',
  'send_message',
  'send_message_to_candidate',
  'reply_message',
  'connect_candidate',
  'add_friend',
  'create_activity',
  'invite_activity',
  'join_activity',
  'offline_meeting',
]);

@Injectable()
export class SocialAgentSafetyToolService {
  constructor(
    private readonly safety: SafetyService,
    @Optional()
    private readonly socialPolicy?: SocialPolicyService,
  ) {}

  async checkSafetyPolicy(
    input: SocialAgentSafetyPolicyInput,
  ): Promise<SocialAgentSafetyPolicyResult> {
    await Promise.resolve();
    const payload = input.payload ?? {};
    const combinedText = [input.text, this.safeJsonText(payload), input.action]
      .filter(Boolean)
      .join('\n');
    const reasons: string[] = [];
    const requiredConfirmations: string[] = [];
    const publicTextDecision = this.socialPolicy?.inspectPublicText({
      action: input.action,
      text: input.text,
      payload,
    });

    const hasContact = CONTACT_RE.test(combinedText);
    const hasPreciseLocation = PRECISE_LOCATION_RE.test(combinedText);
    const hasHighRiskContent = HIGH_RISK_CONTENT_RE.test(combinedText);
    if (hasContact) {
      reasons.push('检测到手机号、邮箱、微信或 QQ 等直接联系方式。');
    }
    if (hasPreciseLocation) {
      reasons.push('检测到精确地址、门牌或坐标等位置细节。');
    }
    if (hasHighRiskContent) {
      reasons.push('检测到疑似骚扰、诈骗、转账或其他高风险内容。');
    }
    if (publicTextDecision && !publicTextDecision.allowed) {
      reasons.push(
        publicTextDecision.publicMessage || '公开内容包含隐私或安全风险字段。',
      );
    }

    const shouldBlock =
      BLOCKED_ACTIONS.has(input.action) &&
      (hasContact ||
        hasPreciseLocation ||
        hasHighRiskContent ||
        publicTextDecision?.allowed === false);
    const level: SocialAgentSafetyLevel = shouldBlock
      ? 'blocked'
      : hasHighRiskContent
        ? 'high'
        : hasContact ||
            hasPreciseLocation ||
            publicTextDecision?.allowed === false
          ? 'medium'
          : 'low';

    if (level === 'high' || level === 'blocked') {
      requiredConfirmations.push('safety_review_required');
    }
    const redactedPayload = this.redactPayload({
      ...payload,
      ...(input.text ? { text: input.text } : {}),
    });
    return {
      allowed: level !== 'blocked',
      level,
      reasons,
      requiredConfirmations,
      redactedPayload,
      ...(level === 'blocked'
        ? { card: this.safetyBoundaryCard(input, reasons) }
        : {}),
    };
  }

  async reportSafetyIssue(
    ownerUserId: number,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const targetType = this.targetType(input.targetType);
    const targetId = this.number(input.targetId);
    const reason = this.text(input.reason).slice(0, 60);
    const description = this.text(input.description).slice(0, 500);
    if (!targetType) throw new BadRequestException('invalid safety targetType');
    if (!targetId) throw new BadRequestException('invalid safety targetId');
    if (!reason) throw new BadRequestException('safety report reason required');

    const report = await this.safety.createReport(ownerUserId, {
      targetType,
      targetId,
      reason,
      description,
    });
    return {
      success: true,
      reportId: report.id,
      status: report.status,
      targetType: report.targetType,
      targetId: report.targetId,
      message: '已提交安全上报，平台会优先审核。',
    };
  }

  redactSensitiveOutput(
    input: Record<string, unknown>,
  ): Record<string, unknown> {
    const payload = this.isRecord(input.payload)
      ? input.payload
      : this.isRecord(input)
        ? input
        : {};
    return {
      success: true,
      payload: this.redactPayload(payload),
      text:
        typeof input.text === 'string'
          ? redactSensitiveText(input.text)
          : undefined,
    };
  }

  private safetyBoundaryCard(
    input: SocialAgentSafetyPolicyInput,
    reasons: string[],
  ): FitMeetAlphaCard {
    return {
      id: `safety_policy:${input.taskId ?? 'adhoc'}:${input.action}`,
      type: 'safety_boundary',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'safety.approval',
      title: '安全边界提醒',
      body: reasons[0] ?? '这个动作触碰了隐私或安全边界，我没有继续执行。',
      status: 'blocked',
      data: {
        taskId: input.taskId ?? null,
        action: input.action,
        reasons,
        requiredConfirmations: ['safety_review_required'],
      },
      actions: [],
    };
  }

  private redactPayload(
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    const redacted = redactSensitiveValue(payload);
    return this.isRecord(redacted) ? redacted : {};
  }

  private safeJsonText(value: unknown): string {
    try {
      return JSON.stringify(value ?? {});
    } catch {
      return '';
    }
  }

  private targetType(
    value: unknown,
  ): 'user' | 'post' | 'meet' | 'comment' | null {
    const text = this.text(value);
    if (text === 'user' || text === 'post' || text === 'meet') return text;
    if (text === 'comment') return text;
    if (text === 'activity') return 'meet';
    return null;
  }

  private number(value: unknown): number | null {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    return parsed;
  }

  private text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
