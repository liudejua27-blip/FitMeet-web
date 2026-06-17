import { Injectable } from '@nestjs/common';

import { cleanDisplayText } from '../common/display-text.util';
import type {
  SocialAgentSlotKey,
  SocialAgentTaskSlot,
  SocialAgentTaskSlots,
} from './social-agent-task-memory-state-machine.service';

export type SocialCodexLifeGraphFactSensitivity =
  | 'public'
  | 'profile'
  | 'private'
  | 'sensitive';

export type SocialCodexLifeGraphWritePolicy =
  | 'low_risk_auto_save'
  | 'user_confirmation_required'
  | 'do_not_write';

export type SocialCodexLifeGraphFactProposal = {
  key: string;
  value: string;
  label: string;
  evidence: Array<{
    source: 'task_slot' | 'user_explicit' | 'agent_observation';
    quote: string;
    slotKey?: SocialAgentSlotKey;
    observedAt?: string;
  }>;
  confidence: number;
  sensitivity: SocialCodexLifeGraphFactSensitivity;
  writePolicy: SocialCodexLifeGraphWritePolicy;
  expiresAt: string | null;
  retention: {
    sourceUpdatedAt: string | null;
    ttlDays: number | null;
    basis: 'slot_completed_at' | 'slot_updated_at' | 'runtime_now';
  };
  reason: string;
};

export type SocialCodexLifeGraphGovernanceSummary = {
  total: number;
  autoSaveCount: number;
  confirmationRequiredCount: number;
  blockedCount: number;
  sensitiveCount: number;
  expiringFactKeys: string[];
};

export type SocialCodexLifeGraphUserVisibleFact = {
  key: string;
  label: string;
  displayValue: string;
  sensitivity: Exclude<SocialCodexLifeGraphFactSensitivity, 'sensitive'>;
  writePolicy: Exclude<SocialCodexLifeGraphWritePolicy, 'do_not_write'>;
  expiresAt: string | null;
  evidenceCount: number;
  reason: string;
};

@Injectable()
export class SocialCodexLifeGraphGovernanceService {
  proposeStableFactsFromSlots(
    slots: SocialAgentTaskSlots,
  ): SocialCodexLifeGraphFactProposal[] {
    const facts: SocialCodexLifeGraphFactProposal[] = [];
    this.addFact(facts, slots.activity, {
      key: 'preferred_activity',
      label: '常见活动偏好',
      sensitivity: 'profile',
      writePolicy: 'low_risk_auto_save',
      reason: '活动偏好有助于以后少重复询问，但不会公开给其他用户。',
      expiresInDays: 180,
    });
    this.addFact(facts, slots.time_window, {
      key: 'preferred_time_window',
      label: '常见可约时间',
      sensitivity: 'private',
      writePolicy: 'user_confirmation_required',
      reason: '时间偏好会影响后续推荐节奏，建议确认后写入长期记忆。',
      expiresInDays: 120,
    });
    this.addFact(facts, slots.geo_area ?? slots.location_text, {
      key: 'preferred_geo_area',
      label: '常用活动区域',
      sensitivity: 'private',
      writePolicy: 'user_confirmation_required',
      reason: '区域偏好属于位置相关信息，只保存粗粒度描述。',
      expiresInDays: 90,
    });
    this.addFact(facts, slots.intensity, {
      key: 'preferred_activity_intensity',
      label: '活动强度偏好',
      sensitivity: 'profile',
      writePolicy: 'low_risk_auto_save',
      reason: '强度偏好能提升约练匹配质量。',
      expiresInDays: 180,
    });
    this.addFact(facts, slots.safety_boundary, {
      key: 'first_meet_safety_boundary',
      label: '首次见面安全边界',
      sensitivity: 'private',
      writePolicy: 'low_risk_auto_save',
      reason: '安全边界是保护用户的长期规则，应优先保留。',
      expiresInDays: null,
    });
    this.addFact(facts, slots.invite_tone, {
      key: 'preferred_invite_tone',
      label: '邀请语气偏好',
      sensitivity: 'profile',
      writePolicy: 'low_risk_auto_save',
      reason: '邀请语气偏好只用于生成文案。',
      expiresInDays: 180,
    });
    return facts;
  }

  shouldWriteFact(fact: SocialCodexLifeGraphFactProposal): boolean {
    if (fact.writePolicy === 'do_not_write') return false;
    if (fact.sensitivity === 'sensitive') return false;
    return fact.confidence >= 0.65;
  }

  summarizeFactProposals(
    facts: SocialCodexLifeGraphFactProposal[],
  ): SocialCodexLifeGraphGovernanceSummary {
    return {
      total: facts.length,
      autoSaveCount: facts.filter(
        (fact) =>
          this.shouldWriteFact(fact) &&
          fact.writePolicy === 'low_risk_auto_save',
      ).length,
      confirmationRequiredCount: facts.filter(
        (fact) =>
          this.shouldWriteFact(fact) &&
          fact.writePolicy === 'user_confirmation_required',
      ).length,
      blockedCount: facts.filter((fact) => !this.shouldWriteFact(fact)).length,
      sensitiveCount: facts.filter((fact) => fact.sensitivity === 'sensitive')
        .length,
      expiringFactKeys: facts
        .filter((fact) => fact.expiresAt !== null)
        .map((fact) => fact.key),
    };
  }

  toUserVisibleFactSummaries(
    facts: SocialCodexLifeGraphFactProposal[],
  ): SocialCodexLifeGraphUserVisibleFact[] {
    return facts
      .filter((fact) => this.shouldWriteFact(fact))
      .filter((fact) => fact.writePolicy !== 'do_not_write')
      .filter((fact) => fact.sensitivity !== 'sensitive')
      .map((fact) => ({
        key: fact.key,
        label: fact.label,
        displayValue: this.redactForDisplay(fact.key, fact.value),
        sensitivity: fact.sensitivity as Exclude<
          SocialCodexLifeGraphFactSensitivity,
          'sensitive'
        >,
        writePolicy: fact.writePolicy as Exclude<
          SocialCodexLifeGraphWritePolicy,
          'do_not_write'
        >,
        expiresAt: fact.expiresAt,
        evidenceCount: fact.evidence.length,
        reason: fact.reason,
      }));
  }

  private addFact(
    facts: SocialCodexLifeGraphFactProposal[],
    slot: SocialAgentTaskSlot | undefined,
    config: {
      key: string;
      label: string;
      sensitivity: SocialCodexLifeGraphFactSensitivity;
      writePolicy: SocialCodexLifeGraphWritePolicy;
      reason: string;
      expiresInDays: number | null;
    },
  ) {
    if (!slot?.value) return;
    const value = cleanDisplayText(slot.value, '').trim();
    if (!value || this.isOneOffNoise(value)) return;
    const retention = this.retentionFor(slot, config.expiresInDays);
    facts.push({
      key: config.key,
      value,
      label: config.label,
      evidence: [
        {
          source:
            slot.source === 'user_message' ? 'user_explicit' : 'task_slot',
          quote: value,
          slotKey: slot.key,
          observedAt: retention.sourceUpdatedAt ?? undefined,
        },
      ],
      confidence:
        slot.state === 'confirmed' || slot.state === 'completed' ? 0.82 : 0.7,
      sensitivity: this.sensitivityFor(config.key, value, config.sensitivity),
      writePolicy: this.writePolicyFor(config.key, value, config.writePolicy),
      expiresAt: retention.expiresAt,
      retention: {
        sourceUpdatedAt: retention.sourceUpdatedAt,
        ttlDays: config.expiresInDays,
        basis: retention.basis,
      },
      reason: config.reason,
    });
  }

  private retentionFor(
    slot: SocialAgentTaskSlot,
    expiresInDays: number | null,
  ): {
    sourceUpdatedAt: string | null;
    expiresAt: string | null;
    basis: 'slot_completed_at' | 'slot_updated_at' | 'runtime_now';
  } {
    const completedAt = this.validIsoDate(slot.completedAt);
    const updatedAt = this.validIsoDate(slot.updatedAt);
    const source = completedAt ?? updatedAt ?? new Date();
    const basis = completedAt
      ? 'slot_completed_at'
      : updatedAt
        ? 'slot_updated_at'
        : 'runtime_now';
    return {
      sourceUpdatedAt:
        completedAt?.toISOString() ?? updatedAt?.toISOString() ?? null,
      expiresAt:
        expiresInDays == null
          ? null
          : new Date(
              source.getTime() + expiresInDays * 24 * 60 * 60 * 1000,
            ).toISOString(),
      basis,
    };
  }

  private validIsoDate(value: unknown): Date | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  private writePolicyFor(
    key: string,
    value: string,
    fallback: SocialCodexLifeGraphWritePolicy,
  ): SocialCodexLifeGraphWritePolicy {
    if (
      this.containsSensitiveDirectIdentifier(value) ||
      this.containsPreciseLocationIdentifier(value)
    ) {
      return 'do_not_write';
    }
    if (key === 'preferred_geo_area' && /(门牌|宿舍|楼栋|单元)/.test(value)) {
      return 'do_not_write';
    }
    return fallback;
  }

  private sensitivityFor(
    key: string,
    value: string,
    fallback: SocialCodexLifeGraphFactSensitivity,
  ): SocialCodexLifeGraphFactSensitivity {
    if (this.containsSensitiveDirectIdentifier(value)) return 'sensitive';
    if (this.containsPreciseLocationIdentifier(value)) return 'sensitive';
    if (key.includes('geo') || /(大学|小区|附近|区域|区)/.test(value))
      return 'private';
    return fallback;
  }

  private containsSensitiveDirectIdentifier(value: string): boolean {
    return (
      /(电话|手机号|手机|微信|vx|wechat|wxid|住址|门牌|宿舍|身份证|私聊|加我)/i.test(
        value,
      ) || /1[3-9]\d{9}/.test(value)
    );
  }

  private containsPreciseLocationIdentifier(value: string): boolean {
    const text = value.trim();
    if (!text) return false;
    if (/(经度|纬度|坐标|定位|导航|地图链接|高德|百度地图|腾讯地图)/i.test(text)) {
      return true;
    }
    if (/(amap|gaode|baidu|qq\.com\/map|maps?|geo:)/i.test(text)) {
      return true;
    }
    if (/\b-?\d{1,3}\.\d{4,}\s*[,，]\s*-?\d{1,3}\.\d{4,}\b/.test(text)) {
      return true;
    }
    return false;
  }

  private redactForDisplay(key: string, value: string): string {
    const clean = cleanDisplayText(value, '').trim();
    if (!clean) return '';
    if (
      this.containsSensitiveDirectIdentifier(clean) ||
      this.containsPreciseLocationIdentifier(clean)
    ) {
      return '已隐藏敏感信息';
    }
    if (key === 'preferred_geo_area') {
      return clean
        .replace(/\d+\s*(号|栋|楼|单元|室|房|门)/g, '附近')
        .replace(/(宿舍|寝室|住址).*/g, '公共区域附近')
        .slice(0, 36);
    }
    return clean.slice(0, 36);
  }

  private isOneOffNoise(value: string): boolean {
    return /^(可以|好的|行|嗯|随便|都行|不知道|再说)$/.test(value.trim());
  }
}
