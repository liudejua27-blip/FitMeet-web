import { Injectable } from '@nestjs/common';

import { cleanDisplayText } from '../../common/display-text.util';

const TECHNICAL_PATTERNS = [
  /\btraceId\b/gi,
  /\bagentTrace\b/gi,
  /\bplanner\b/gi,
  /\btool call\b/gi,
  /\btool_call\b/gi,
  /\bDeepSeek\b/gi,
  /\bOpenAI\b/gi,
  /\bSDK\b/gi,
  /\bdatabase\b/gi,
  /\bstack trace\b/gi,
  /\bguardrail\b/gi,
];

const USER_STATUSES: Record<string, string> = {
  understand: '正在理解你的需求',
  'task.created': '正在理解你的需求',
  permission: '正在检查安全边界',
  deepseek: '正在结合你的 Life Graph',
  profile: '正在结合你的 Life Graph',
  search: '正在筛选合适的人',
  rank: '正在排除时间不合适的人',
  safety_filter: '正在检查安全边界',
  reason: '正在生成开场白',
  icebreaker: '正在生成开场白',
  draft: '正在创建约练计划',
  done: '正在等待你确认',
  approval: '正在等待你确认',
  life_graph_update: '正在更新你的 Life Graph',
};

@Injectable()
export class TonePolicyService {
  cleanUserText(value: unknown, fallback = ''): string {
    const raw = cleanDisplayText(value, fallback).trim();
    if (!raw) return fallback;
    if (this.looksLikeRawPayload(raw)) return fallback;
    return TECHNICAL_PATTERNS.reduce(
      (text, pattern) => text.replace(pattern, ''),
      raw,
    )
      .replace(/\s{2,}/g, ' ')
      .replace(/["'`]{2,}/g, '')
      .trim();
  }

  userStatus(stepId: string, label?: string): string {
    const normalized = cleanDisplayText(stepId, '').trim();
    if (USER_STATUSES[normalized]) return USER_STATUSES[normalized];
    const cleanedLabel = this.cleanUserText(label, '');
    if (!cleanedLabel) return '正在理解你的需求';
    if (/Life Graph|画像/.test(cleanedLabel)) return '正在结合你的 Life Graph';
    if (/候选|筛选|匹配|搜索|检索/.test(cleanedLabel)) return '正在筛选合适的人';
    if (/安全|边界|风险/.test(cleanedLabel)) return '正在检查安全边界';
    if (/开场|消息/.test(cleanedLabel)) return '正在生成开场白';
    if (/活动|约练|计划/.test(cleanedLabel)) return '正在创建约练计划';
    if (/确认|等待/.test(cleanedLabel)) return '正在等待你确认';
    return cleanedLabel;
  }

  safeAssistantMessage(value: unknown, fallback: string): string {
    const cleaned = this.cleanUserText(value, fallback);
    return cleaned || fallback;
  }

  private looksLikeRawPayload(value: string): boolean {
    if (/^\s*[{[]/.test(value) && /["']?(traceId|stack|planner|tool|error)["']?/i.test(value)) {
      return true;
    }
    return /(TypeError|ReferenceError|QueryFailedError|UnhandledPromiseRejection)/i.test(value);
  }
}
