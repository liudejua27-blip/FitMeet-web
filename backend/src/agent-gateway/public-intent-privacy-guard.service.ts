import { Injectable } from '@nestjs/common';

import type { FitMeetAlphaCard } from './fitmeet-alpha-agent.types';

export type PublicIntentPrivacyGuardResult = {
  blocked: boolean;
  reasons: string[];
  fields: string[];
  message: string;
};

const PRIVACY_PATTERNS: Array<{ key: string; label: string; pattern: RegExp }> =
  [
    { key: 'phone', label: '手机号', pattern: /\b1[3-9]\d{9}\b/u },
    {
      key: 'wechat',
      label: '微信号',
      pattern: /(微信|wechat|weixin|wx|加我|联系方式)[:：\s]*[a-z0-9_-]{4,}/iu,
    },
    { key: 'qq', label: 'QQ', pattern: /\bqq[:：\s]*[1-9]\d{4,12}\b/iu },
    {
      key: 'email',
      label: '邮箱',
      pattern: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/iu,
    },
    {
      key: 'precise_address',
      label: '精确地址',
      pattern: /(门牌|单元|宿舍|几号楼|号楼|详细地址|家门口|住在).{0,24}/u,
    },
  ];

@Injectable()
export class PublicIntentPrivacyGuardService {
  inspect(value: unknown): PublicIntentPrivacyGuardResult {
    const text = this.flattenText(value);
    const hits = PRIVACY_PATTERNS.filter((item) => item.pattern.test(text));
    const labels = Array.from(new Set(hits.map((item) => item.label)));
    return {
      blocked: hits.length > 0,
      reasons: labels,
      fields: hits.map((item) => item.key),
      message:
        hits.length > 0
          ? `为了保护你的隐私，公开约练卡不能包含${labels.join('、')}。移除后我可以继续发布。`
          : '',
    };
  }

  buildBlockedCard(input: {
    taskId: number;
    result: PublicIntentPrivacyGuardResult;
    payload?: Record<string, unknown>;
  }): FitMeetAlphaCard {
    return {
      id: `privacy_guard:${input.taskId}`,
      type: 'candidate_empty_state',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.privacy_guard',
      title: '先移除公开联系方式',
      body: input.result.message,
      status: 'blocked',
      data: {
        schemaName: 'PublicIntentPrivacyGuardCard',
        schemaType: 'social_match.privacy_guard',
        taskId: input.taskId,
        reasons: input.result.reasons,
        fields: input.result.fields,
        safetyBoundary:
          '联系方式、精确住址和私密资料只适合在双方确认后的站内私信里沟通。',
        recoveryOptions: [
          {
            key: 'modify_card',
            label: '修改卡片',
            detail: '移除联系方式或精确地址后继续。',
            requiresConfirmation: false,
          },
        ],
      },
      actions: [
        {
          id: `privacy_guard:${input.taskId}:modify`,
          label: '修改卡片',
          action: 'activity.modify_time',
          schemaAction: 'activity.modify_time',
          requiresConfirmation: false,
          payload: {
            ...(input.payload ?? {}),
            taskId: input.taskId,
            sourceAction: 'privacy_guard.modify_card',
          },
        },
      ],
    };
  }

  private flattenText(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.flattenText(item)).join(' ');
    }
    if (value && typeof value === 'object') {
      return Object.values(value as Record<string, unknown>)
        .map((item) => this.flattenText(item))
        .join(' ');
    }
    return '';
  }
}
