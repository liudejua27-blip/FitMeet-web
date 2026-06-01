import { Injectable, Logger } from '@nestjs/common';
import {
  SocialAgentLongTermMemoryService,
  LongTermMemorySnapshot,
} from './social-agent-long-term-memory.service';
import type { SocialAgentIntentType } from './social-agent-intent-router.service';

/**
 * RAG / SOP v1 (no Vector DB).
 *
 * Five document kinds:
 *  - `safety_sop`             — safety / boundary checklists, escalation steps
 *  - `opening_templates`      — first-message templates by activity / persona
 *  - `activity_sop`           — activity organising checklists (where / when / what to bring)
 *  - `successful_match_cases` — anonymised success stories used as soft examples
 *  - `user_memory_summary`    — projected from per-user long-term memory
 *
 * Retrieval is **intent-gated**: each `SocialAgentIntentType` opts in to a
 * subset of doc kinds. Documents returned here are *advisory only* — they
 * MUST NOT be used to filter or rank candidates. They are surfaced to the
 * planner / chat layer for explanations, scripts, and safety reminders.
 *
 * Backend is an in-memory seed catalog. The retrieval interface is shaped
 * so it can later be backed by an embedding store without changing callers.
 */

export type SocialAgentRagDocKind =
  | 'safety_sop'
  | 'opening_templates'
  | 'activity_sop'
  | 'successful_match_cases'
  | 'user_memory_summary';

export interface SafetySopDoc {
  kind: 'safety_sop';
  id: string;
  title: string;
  steps: string[];
  tags: string[];
}

export interface OpeningTemplateDoc {
  kind: 'opening_templates';
  id: string;
  scenario: string;
  template: string;
  tags: string[];
}

export interface ActivitySopDoc {
  kind: 'activity_sop';
  id: string;
  activityType: string;
  checklist: string[];
  tags: string[];
}

export interface SuccessfulMatchCaseDoc {
  kind: 'successful_match_cases';
  id: string;
  summary: string;
  highlights: string[];
  tags: string[];
}

export interface UserMemorySummaryDoc {
  kind: 'user_memory_summary';
  userId: number;
  preferencesSummary: string;
  boundariesSummary: string;
  activitySummary: string;
  matchSignalSummary: string;
  taskCount: number;
}

export type SocialAgentRagDoc =
  | SafetySopDoc
  | OpeningTemplateDoc
  | ActivitySopDoc
  | SuccessfulMatchCaseDoc
  | UserMemorySummaryDoc;

export interface SocialAgentRagRetrievalInput {
  intent: SocialAgentIntentType;
  ownerUserId: number;
  message: string;
  activityType?: string;
  limitPerKind?: number;
  /**
   * Optionally provide a preloaded long-term memory snapshot to avoid an
   * extra DB read when the caller has already fetched it for the same user.
   */
  longTermSnapshot?: LongTermMemorySnapshot | null;
}

export interface SocialAgentRagContext {
  intent: SocialAgentIntentType;
  retrievedKinds: SocialAgentRagDocKind[];
  safetySop: SafetySopDoc[];
  openingTemplates: OpeningTemplateDoc[];
  activitySop: ActivitySopDoc[];
  successfulMatchCases: SuccessfulMatchCaseDoc[];
  userMemorySummary: UserMemorySummaryDoc | null;
}

const INTENT_KIND_MAP: Record<SocialAgentIntentType, SocialAgentRagDocKind[]> =
  {
    casual_chat: [],
    product_help: [],
    workflow_help: [],
    profile_enrichment: ['user_memory_summary'],
    profile_enrichment_request: ['user_memory_summary'],
    correction_or_clarification: ['user_memory_summary'],
    profile_update: ['user_memory_summary'],
    social_search: [
      'opening_templates',
      'successful_match_cases',
      'user_memory_summary',
    ],
    activity_search: ['activity_sop', 'user_memory_summary'],
    candidate_followup: [
      'opening_templates',
      'safety_sop',
      'successful_match_cases',
    ],
    action_request: ['safety_sop', 'opening_templates'],
    safety_or_boundary: ['safety_sop'],
    unknown: [],
  };

@Injectable()
export class SocialAgentRagService {
  private readonly logger = new Logger(SocialAgentRagService.name);

  private readonly safetySop: SafetySopDoc[] = [
    {
      kind: 'safety_sop',
      id: 'safety.first_meet',
      title: '首次线下见面安全',
      steps: [
        '约在公开场所（咖啡馆 / 健身房 / 公园）',
        '将地点和时间同步一位朋友',
        '保留聊天与确认记录，不在首次见面交换住址',
        '若对方提出私下场所、转账或敏感请求，立即终止并上报',
      ],
      tags: ['first_meet', 'safety', 'offline'],
    },
    {
      kind: 'safety_sop',
      id: 'safety.message_boundary',
      title: '消息边界',
      steps: [
        '不替用户主动索要联系方式',
        '不发送涉及金钱、身份信息或位置的请求',
        '遇到骚扰 / 不当言辞，提示用户拉黑并记录 safety_event',
      ],
      tags: ['boundary', 'message'],
    },
  ];

  private readonly openingTemplates: OpeningTemplateDoc[] = [
    {
      kind: 'opening_templates',
      id: 'opening.running.casual',
      scenario: '跑步搭子 · 轻松开场',
      template:
        '嗨～看到你也喜欢晨跑。我一般在 {{city}} {{place}} 跑 5-8 公里，配速 {{pace}}。如果合得来，下周可以一起约一次？',
      tags: ['running', 'casual', 'first_message'],
    },
    {
      kind: 'opening_templates',
      id: 'opening.gym.respectful',
      scenario: '健身约练 · 尊重式开场',
      template:
        '你好，看你训练计划挺系统的，我目前在练 {{plan}}。如果你愿意，可以聊聊各自训练偏好，再决定要不要一起练。',
      tags: ['gym', 'respectful', 'first_message'],
    },
    {
      kind: 'opening_templates',
      id: 'opening.coffee.lowstakes',
      scenario: '运动后咖啡 · 低压力',
      template:
        '运动完想喝杯咖啡放松一下，{{area}} 附近你有推荐的店吗？要不要一起？',
      tags: ['coffee', 'low_pressure'],
    },
  ];

  private readonly activitySop: ActivitySopDoc[] = [
    {
      kind: 'activity_sop',
      id: 'activity.running',
      activityType: '跑步',
      checklist: [
        '约定具体地点（公园 / 操场 / 跑道）',
        '说明配速区间，避免节奏差距过大',
        '提醒携带水 / 反光装备（夜跑）',
        '约定碰头点 + 预计时长',
      ],
      tags: ['running', 'outdoor'],
    },
    {
      kind: 'activity_sop',
      id: 'activity.gym',
      activityType: '健身',
      checklist: [
        '确认门店与时段（高峰期器械紧张）',
        '说明训练计划（推拉腿 / 全身 / 有氧）',
        '是否需要互相保护重量（spotter）',
      ],
      tags: ['gym', 'indoor'],
    },
    {
      kind: 'activity_sop',
      id: 'activity.hiking',
      activityType: '徒步',
      checklist: [
        '确认路线难度与往返时长',
        '检查天气与装备（鞋 / 水 / 防晒）',
        '至少同步一位非同行人路线',
      ],
      tags: ['hiking', 'outdoor', 'safety'],
    },
  ];

  private readonly successfulMatchCases: SuccessfulMatchCaseDoc[] = [
    {
      kind: 'successful_match_cases',
      id: 'case.running.weekly',
      summary:
        '两位用户因每周固定晨跑配速接近匹配成功，第三次见面后建立稳定搭子关系。',
      highlights: ['配速匹配', '固定时段', '低压力开场'],
      tags: ['running', 'stable_match'],
    },
    {
      kind: 'successful_match_cases',
      id: 'case.gym.spotter',
      summary: '健身房互为 spotter 起步，先以训练为目标，后逐渐成为朋友。',
      highlights: ['共同目标', '尊重式开场', '渐进信任'],
      tags: ['gym', 'spotter'],
    },
  ];

  constructor(
    private readonly longTermMemory: SocialAgentLongTermMemoryService,
  ) {}

  async retrieve(
    input: SocialAgentRagRetrievalInput,
  ): Promise<SocialAgentRagContext> {
    const kinds = INTENT_KIND_MAP[input.intent] ?? [];
    const context: SocialAgentRagContext = {
      intent: input.intent,
      retrievedKinds: kinds,
      safetySop: [],
      openingTemplates: [],
      activitySop: [],
      successfulMatchCases: [],
      userMemorySummary: null,
    };
    if (kinds.length === 0) return context;

    const limit = Math.max(1, Math.min(input.limitPerKind ?? 3, 8));
    const message = (input.message ?? '').toLowerCase();
    const activityType = (input.activityType ?? '').toLowerCase();

    if (kinds.includes('safety_sop')) {
      context.safetySop = this.filterByTags(
        this.safetySop,
        message,
        activityType,
      ).slice(0, limit);
    }
    if (kinds.includes('opening_templates')) {
      context.openingTemplates = this.filterByTags(
        this.openingTemplates,
        message,
        activityType,
      ).slice(0, limit);
    }
    if (kinds.includes('activity_sop')) {
      context.activitySop = this.filterByTags(
        this.activitySop,
        message,
        activityType,
      ).slice(0, limit);
    }
    if (kinds.includes('successful_match_cases')) {
      context.successfulMatchCases = this.filterByTags(
        this.successfulMatchCases,
        message,
        activityType,
      ).slice(0, limit);
    }
    if (kinds.includes('user_memory_summary')) {
      context.userMemorySummary = await this.buildUserMemorySummary(
        input.ownerUserId,
        input.longTermSnapshot ?? undefined,
      ).catch((error) => {
        this.logger.warn(
          JSON.stringify({
            event: 'social_agent.rag.user_memory_summary_failed',
            ownerUserId: input.ownerUserId,
            message: error instanceof Error ? error.message : String(error),
          }),
        );
        return null;
      });
    }
    return context;
  }

  private filterByTags<T extends { tags: string[] }>(
    docs: T[],
    message: string,
    activityType: string,
  ): T[] {
    if (!message && !activityType) return docs.slice();
    const scored = docs
      .map((doc) => {
        const score = doc.tags.reduce((sum, tag) => {
          const lower = tag.toLowerCase();
          let next = sum;
          if (activityType && lower.includes(activityType)) next += 2;
          if (message && message.includes(lower)) next += 1;
          return next;
        }, 0);
        return { doc, score };
      })
      .sort((a, b) => b.score - a.score);
    const positive = scored
      .filter((entry) => entry.score > 0)
      .map((entry) => entry.doc);
    return positive.length > 0 ? positive : docs.slice();
  }

  private async buildUserMemorySummary(
    userId: number,
    preloaded?: LongTermMemorySnapshot | null,
  ): Promise<UserMemorySummaryDoc | null> {
    const snapshot =
      preloaded ?? (await this.longTermMemory.readSnapshot(userId));
    if (!snapshot || snapshot.taskCount === 0) return null;
    return summariseSnapshot(snapshot);
  }
}

function summariseSnapshot(
  snapshot: LongTermMemorySnapshot,
): UserMemorySummaryDoc {
  const prefBits: string[] = [];
  const profileFacts = Object.entries(snapshot.profileFacts)
    .map(
      ([key, value]) =>
        `${key}:${Array.isArray(value) ? value.join('、') : value}`,
    )
    .slice(0, 8);
  if (profileFacts.length > 0) {
    prefBits.push(`画像事实：${profileFacts.join('；')}`);
  }
  if (snapshot.socialGoals.length > 0) {
    prefBits.push(`社交目标：${snapshot.socialGoals.slice(-3).join('、')}`);
  }
  if (snapshot.availability.length > 0) {
    prefBits.push(`可约时间：${snapshot.availability.slice(-3).join('、')}`);
  }
  if (snapshot.preferences.interests.length > 0) {
    prefBits.push(
      `兴趣：${snapshot.preferences.interests.slice(0, 5).join('、')}`,
    );
  }
  if (snapshot.preferences.socialStyle) {
    prefBits.push(`社交风格：${snapshot.preferences.socialStyle}`);
  }
  if (snapshot.preferences.communicationStyle) {
    prefBits.push(`沟通风格：${snapshot.preferences.communicationStyle}`);
  }
  if (snapshot.preferences.preferredTraits.length > 0) {
    prefBits.push(
      `偏好特质：${snapshot.preferences.preferredTraits.slice(0, 5).join('、')}`,
    );
  }

  const boundaryBits: string[] = [];
  if (snapshot.boundaries.noNightMeet) boundaryBits.push('不约夜间见面');
  if (snapshot.boundaries.publicPlaceOnly) boundaryBits.push('仅公开场所');
  if (snapshot.boundaries.noAutoMessage) boundaryBits.push('禁止自动发消息');
  if (snapshot.boundaries.noContactExchange)
    boundaryBits.push('不交换联系方式');
  if (snapshot.boundaries.excludedGenders.length > 0) {
    boundaryBits.push(
      `排除性别：${snapshot.boundaries.excludedGenders.join('、')}`,
    );
  }

  const activityBits: string[] = [];
  if (snapshot.activityPreferences.favoriteCities.length > 0) {
    activityBits.push(
      `城市：${snapshot.activityPreferences.favoriteCities.slice(-3).join('、')}`,
    );
  }
  if (snapshot.activityPreferences.favoriteActivityTypes.length > 0) {
    activityBits.push(
      `活动：${snapshot.activityPreferences.favoriteActivityTypes.slice(-3).join('、')}`,
    );
  }
  if (snapshot.activityPreferences.favoriteTimePreferences.length > 0) {
    activityBits.push(
      `时间：${snapshot.activityPreferences.favoriteTimePreferences.slice(-3).join('、')}`,
    );
  }

  const success = snapshot.matchSignals.successfulMatches.length;
  const failed = snapshot.matchSignals.failedMatches.length;
  const matchBits = `历史匹配：成功样本 ${success} 条，否决样本 ${failed} 条`;

  return {
    kind: 'user_memory_summary',
    userId: snapshot.userId,
    preferencesSummary: prefBits.join('；') || '尚未沉淀偏好',
    boundariesSummary: boundaryBits.join('；') || '尚未沉淀边界',
    activitySummary: activityBits.join('；') || '尚未沉淀活动偏好',
    matchSignalSummary: matchBits,
    taskCount: snapshot.taskCount,
  };
}
