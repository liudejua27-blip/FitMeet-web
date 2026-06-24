import { Injectable, Optional } from '@nestjs/common';

import { cleanDisplayText } from '../common/display-text.util';
import { LifeGraphFieldCategory } from '../life-graph/life-graph.enums';
import { LifeGraphService } from '../life-graph/life-graph.service';
import { SocialProfileService } from '../users/social-profile.service';
import type { AgentTask } from './entities/agent-task.entity';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import {
  mergeSocialAgentBoundaries,
  mergeSocialAgentPreferences,
  readSocialAgentTaskMemory,
  rememberSocialAgentCurrentTask,
} from './social-agent-memory.util';

export type SocialAgentProfileGateMissingField =
  | 'city'
  | 'activity'
  | 'availability'
  | 'boundary'
  | 'publicAuthorization';

export type SocialAgentProfileGateResult = {
  passed: boolean;
  missing: SocialAgentProfileGateMissingField[];
  assistantMessage: string;
  profileCompleteness: number | null;
};

export type SocialAgentMinimumProfileGateStatus =
  SocialAgentProfileGateResult & {
    readinessLevel: string | null;
    canEnterMatchPool: boolean;
    nextActions: string[];
  };

type LifeGraphFieldRecord = {
  category?: string;
  fieldKey?: string;
  fieldValue?: unknown;
  revoked?: boolean;
};

@Injectable()
export class SocialAgentProfileGateService {
  constructor(
    @Optional() private readonly lifeGraph?: LifeGraphService,
    @Optional() private readonly socialProfiles?: SocialProfileService,
  ) {}

  async getMinimumProfileStatus(
    ownerUserId: number,
  ): Promise<SocialAgentMinimumProfileGateStatus> {
    const [lifeGraph, socialProfile] = await Promise.all([
      this.readLifeGraph(ownerUserId),
      this.readSocialProfile(ownerUserId),
    ]);
    const missing: SocialAgentProfileGateMissingField[] = [];
    if (
      !this.hasAny([
        socialProfile?.city,
        this.lifeGraphValue(lifeGraph.fields, 'identity', 'city'),
        this.lifeGraphValue(lifeGraph.fields, 'identity', 'region'),
      ])
    ) {
      missing.push('city');
    }
    if (
      !this.hasAny([
        socialProfile?.fitnessGoals,
        socialProfile?.interestTags,
        this.lifeGraphValue(
          lifeGraph.fields,
          'fitness_activity',
          'sportsPreferences',
        ),
      ])
    ) {
      missing.push('activity');
    }
    if (
      !this.hasAny([
        socialProfile?.availableTimes,
        socialProfile?.weekdayAvailability,
        socialProfile?.weekendAvailability,
        this.lifeGraphValue(lifeGraph.fields, 'lifestyle', 'availableTimes'),
        this.lifeGraphValue(
          lifeGraph.fields,
          'lifestyle',
          'weekendAvailability',
        ),
      ])
    ) {
      missing.push('availability');
    }
    if (
      !this.hasAny([
        socialProfile?.privacyBoundary,
        socialProfile?.rejectRules,
        socialProfile?.avoidTraits,
        this.lifeGraphValue(
          lifeGraph.fields,
          'social_intent',
          'privacyBoundary',
        ),
        this.lifeGraphValue(
          lifeGraph.fields,
          'privacy_boundary',
          'privacyBoundary',
        ),
      ])
    ) {
      missing.push('boundary');
    }
    if (
      !(
        socialProfile?.profileDiscoverable === true ||
        socialProfile?.agentCanRecommendMe === true
      )
    ) {
      missing.push('publicAuthorization');
    }

    const profileCompleteness = this.numberValue(
      socialProfile?.completion?.percent ?? lifeGraph.completenessScore,
    );
    const passed = missing.length === 0;
    return {
      passed,
      missing,
      assistantMessage: passed ? '' : this.buildQuestion(missing),
      profileCompleteness,
      readinessLevel:
        cleanDisplayText(socialProfile?.completion?.readinessLevel, '') || null,
      canEnterMatchPool:
        passed &&
        (socialProfile?.completion?.canEnterMatchPool === true ||
          profileCompleteness === null ||
          profileCompleteness >= 65),
      nextActions: Array.isArray(socialProfile?.completion?.nextActions)
        ? socialProfile.completion.nextActions
            .map((item) => cleanDisplayText(item, ''))
            .filter(Boolean)
            .slice(0, 5)
        : missing.map((field) => this.missingFieldLabel(field)),
    };
  }

  async getMinimumProfileStatusWithTaskSlots(
    ownerUserId: number,
    taskSlots: Record<string, unknown> | null | undefined,
  ): Promise<SocialAgentMinimumProfileGateStatus> {
    const status = await this.getMinimumProfileStatus(ownerUserId);
    const slots = this.readTaskSlotValues(taskSlots);
    const missing = status.missing.filter(
      (field) => !this.taskSlotsSatisfy(field, slots),
    );
    const passed = missing.length === 0;
    return {
      ...status,
      passed,
      missing,
      assistantMessage: passed ? '' : this.buildQuestion(missing),
      canEnterMatchPool: passed,
      nextActions: missing.map((field) => this.missingFieldLabel(field)),
    };
  }

  async evaluateForSocialExecution(input: {
    ownerUserId: number;
    task: AgentTask;
    route: SocialAgentIntentRouterResult;
    message: string;
  }): Promise<SocialAgentProfileGateResult> {
    mergeSocialAgentPreferences(input.task, input.message);
    mergeSocialAgentBoundaries(input.task, input.message);

    const lifeGraph = await this.readLifeGraph(input.ownerUserId);
    const memory = readSocialAgentTaskMemory(input.task);
    const taskSlots = this.readTaskSlots(input.task);
    const text = [
      input.task.goal,
      ...memory.lastUserMessages.map((item) => item.text),
      input.message,
    ]
      .filter(Boolean)
      .join(' ');
    const routeEntities = input.route.entities;

    const missing: SocialAgentProfileGateMissingField[] = [];
    if (
      !this.hasAny([
        routeEntities.city,
        memory.activeEntities.city,
        taskSlots.city,
        taskSlots.geo_area,
        taskSlots.location_text,
        this.lifeGraphValue(lifeGraph.fields, 'identity', 'city'),
        this.lifeGraphValue(lifeGraph.fields, 'identity', 'region'),
        this.extractCity(text),
      ])
    ) {
      missing.push('city');
    }
    if (
      !this.hasAny([
        routeEntities.activityType,
        memory.activeEntities.activityType,
        taskSlots.activity,
        ...memory.preferences.interests,
        this.lifeGraphValue(
          lifeGraph.fields,
          'fitness_activity',
          'sportsPreferences',
        ),
        this.extractActivity(text),
      ])
    ) {
      missing.push('activity');
    }
    if (
      !this.hasAny([
        routeEntities.timePreference,
        memory.activeEntities.timePreference,
        taskSlots.time_window,
        this.lifeGraphValue(lifeGraph.fields, 'lifestyle', 'availableTimes'),
        this.lifeGraphValue(
          lifeGraph.fields,
          'lifestyle',
          'weekendAvailability',
        ),
        this.extractTime(text),
      ])
    ) {
      missing.push('availability');
    }
    if (this.requiresActionConsent(input.route)) {
      if (
        !(
          memory.boundaries.publicPlaceOnly ||
          memory.boundaries.noAutoMessage ||
          memory.boundaries.noContactExchange ||
          memory.boundaries.noNightMeet ||
          this.hasAny([taskSlots.safety_boundary]) ||
          this.hasAny([
            this.lifeGraphValue(
              lifeGraph.fields,
              'social_intent',
              'privacyBoundary',
            ),
            this.lifeGraphValue(
              lifeGraph.fields,
              'privacy_boundary',
              'privacyBoundary',
            ),
            this.extractBoundary(text),
          ])
        )
      ) {
        missing.push('boundary');
      }
      if (
        memory.boundaries.publicActivityAllowed === null &&
        !this.hasPublicAuthorizationSlot(taskSlots.visibility)
      ) {
        missing.push('publicAuthorization');
      }
    }

    if (missing.length === 0) {
      return {
        passed: true,
        missing,
        assistantMessage: '',
        profileCompleteness: lifeGraph.completenessScore,
      };
    }

    const assistantMessage = this.buildQuestion(missing);
    rememberSocialAgentCurrentTask(input.task, {
      objective: 'minimum_profile_gate',
      nextStep: assistantMessage,
      shouldSearchNow: false,
      awaitingSearchConfirmation: true,
      waitingFor: 'minimum_profile_gate',
      lastCompletedStep: 'social_intent_detected',
      clarificationMissingFields: missing,
    });
    return {
      passed: false,
      missing,
      assistantMessage,
      profileCompleteness: lifeGraph.completenessScore,
    };
  }

  private async readLifeGraph(userId: number): Promise<{
    completenessScore: number | null;
    fields: LifeGraphFieldRecord[];
  }> {
    if (!this.lifeGraph) return { completenessScore: null, fields: [] };
    try {
      const graph = await this.lifeGraph.getLifeGraph(userId);
      const fields = Object.values(graph.fields ?? {})
        .flat()
        .filter((field) =>
          Boolean(field && typeof field === 'object'),
        ) as LifeGraphFieldRecord[];
      return {
        completenessScore: graph.completeness?.completenessScore ?? null,
        fields,
      };
    } catch {
      return { completenessScore: null, fields: [] };
    }
  }

  private async readSocialProfile(userId: number): Promise<
    | (Record<string, unknown> & {
        completion?: Record<string, unknown>;
      })
    | null
  > {
    if (!this.socialProfiles) return null;
    try {
      const profile = await this.socialProfiles.get(userId);
      return profile as unknown as Record<string, unknown> & {
        completion?: Record<string, unknown>;
      };
    } catch {
      return null;
    }
  }

  private lifeGraphValue(
    fields: LifeGraphFieldRecord[],
    category: `${LifeGraphFieldCategory}`,
    fieldKey: string,
  ): unknown {
    return fields.find(
      (field) =>
        field.revoked !== true &&
        field.category === category &&
        field.fieldKey === fieldKey,
    )?.fieldValue;
  }

  private buildQuestion(missing: SocialAgentProfileGateMissingField[]) {
    const missingText = missing
      .map((field) => this.missingFieldLabel(field))
      .join('、');
    const examples = [
      '可以，我先把基础资料补齐，这样不会乱推荐，也不会误公开你的需求。',
      `我会一次性确认这些信息，还差：${missingText}。`,
      '你可以直接一句话补齐；每一项都可以说“暂不确定”，也可以选择“本次使用，不保存”。',
      this.profileGateExample(missing),
    ];
    if (missing.includes('publicAuthorization')) {
      examples.push(
        '如果愿意让这张约练卡出现在发现页，也可以说“可以公开到发现”。',
      );
    }
    return examples.join('\n');
  }

  private profileGateExample(
    missing: SocialAgentProfileGateMissingField[],
  ): string {
    if (
      missing.includes('boundary') ||
      missing.includes('publicAuthorization')
    ) {
      return '你可以一句话回答，例如：“青岛市南区，周末下午，低强度散步，第一次只接受公共场所，先站内聊，暂不公开到发现”。';
    }
    return '你可以一句话回答，例如：“青岛市南区，周末下午，低强度散步”。';
  }

  private missingFieldLabel(field: SocialAgentProfileGateMissingField) {
    const labels: Record<SocialAgentProfileGateMissingField, string> = {
      city: '城市/大致区域',
      activity: '想参与的运动或社交场景',
      availability: '可约时间',
      boundary: '社交边界（公共场所、站内沟通、发送前确认）',
      publicAuthorization: '是否允许公开发起活动（也可以选择不公开）',
    };
    return labels[field];
  }

  private hasAny(values: unknown[]) {
    return values.some((value) => {
      if (Array.isArray(value)) return value.length > 0;
      return cleanDisplayText(value, '') !== '';
    });
  }

  private requiresActionConsent(route: SocialAgentIntentRouterResult): boolean {
    return (
      route.shouldExecuteAction === true ||
      route.replyStrategy === 'execute_action' ||
      route.intent === 'action_request'
    );
  }

  private readTaskSlots(task: AgentTask): Record<string, string> {
    const memory = this.isRecord(task.memory) ? task.memory : {};
    const rawSlots = this.isRecord(memory.taskSlots) ? memory.taskSlots : {};
    const taskMemory = this.isRecord(memory.taskMemory)
      ? memory.taskMemory
      : {};
    const nestedSlots = this.isRecord(taskMemory.taskSlots)
      ? taskMemory.taskSlots
      : {};
    return {
      ...this.readTaskSlotValues(nestedSlots),
      ...this.readTaskSlotValues(rawSlots),
    };
  }

  private readTaskSlotValues(taskSlots: unknown): Record<string, string> {
    const rawSlots = this.isRecord(taskSlots) ? taskSlots : {};
    const out: Record<string, string> = {};
    for (const [key, raw] of Object.entries(rawSlots)) {
      if (!this.isRecord(raw)) continue;
      if (!this.isTaskSlotUsableForGate(key, raw)) continue;
      const value = cleanDisplayText(raw.value, '').trim();
      if (!value) continue;
      out[key] = value;
    }
    return out;
  }

  private isTaskSlotUsableForGate(
    key: string,
    slot: Record<string, unknown>,
  ): boolean {
    const value = cleanDisplayText(slot.value, '').trim();
    if (!value) return false;
    const state = cleanDisplayText(slot.state, '');
    const source = cleanDisplayText(slot.source, '');
    if (state === 'missing') return false;
    if (key === 'geo_area') return true;
    if (state === 'inferred' || source === 'inferred') return false;
    return true;
  }

  private taskSlotsSatisfy(
    field: SocialAgentProfileGateMissingField,
    taskSlots: Record<string, string>,
  ) {
    if (field === 'city') {
      return this.hasAny([
        taskSlots.city,
        taskSlots.geo_area,
        taskSlots.location_text,
      ]);
    }
    if (field === 'activity') return this.hasAny([taskSlots.activity]);
    if (field === 'availability') return this.hasAny([taskSlots.time_window]);
    if (field === 'boundary') return this.hasAny([taskSlots.safety_boundary]);
    if (field === 'publicAuthorization') {
      return this.hasPublicAuthorizationSlot(taskSlots.visibility);
    }
    return false;
  }

  private hasPublicAuthorizationSlot(value: unknown) {
    const text = cleanDisplayText(value, '');
    return /(公开|不公开|暂不公开|发现)/.test(text);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }

  private extractCity(text: string) {
    return cleanDisplayText(
      text.match(
        /(青岛|北京|上海|深圳|广州|杭州|南京|成都|武汉|西安|重庆|苏州|厦门|天津|长沙|郑州|济南|宁波|合肥)/,
      )?.[1],
      '',
    );
  }

  private extractTime(text: string) {
    return cleanDisplayText(
      text.match(
        /(今晚|明天|后天|周末|工作日|上午|中午|下午|晚上|早上|午后|周[一二三四五六日天]|星期[一二三四五六日天])/,
      )?.[1],
      '',
    );
  }

  private extractActivity(text: string) {
    return cleanDisplayText(
      text.match(
        /(跑步|慢跑|夜跑|羽毛球|瑜伽|健身|撸铁|普拉提|徒步|户外|骑行|篮球|足球|网球|游泳|飞盘|咖啡|散步|拍照|city\s*walk|citywalk)/i,
      )?.[1],
      '',
    );
  }

  private extractBoundary(text: string) {
    return /(公共场所|公开场所|站内聊|先聊天|不交换|不加微信|不留电话|不要夜间|不要晚上|不要自动|先确认|发送前确认|安全边界|社交边界)/i.test(
      text,
    )
      ? '安全边界已说明'
      : '';
  }

  private numberValue(value: unknown): number | null {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
}
