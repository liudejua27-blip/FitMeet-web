import { Injectable } from '@nestjs/common';

import { cleanDisplayText } from '../common/display-text.util';
import type { AgentTask } from './entities/agent-task.entity';

export type SocialAgentSlotKey =
  | 'activity'
  | 'time_window'
  | 'location_text'
  | 'geo_area'
  | 'intensity'
  | 'visibility'
  | 'safety_boundary'
  | 'invite_tone';

export type SocialAgentSlotState =
  | 'missing'
  | 'inferred'
  | 'answered'
  | 'confirmed'
  | 'completed'
  | 'modified';

export type SocialAgentTaskSlot = {
  key: SocialAgentSlotKey;
  value: string;
  state: SocialAgentSlotState;
  source: 'user_message' | 'inferred' | 'system';
  updatedAt: string;
  completedAt?: string | null;
};

export type SocialAgentTaskSlots = Partial<
  Record<SocialAgentSlotKey, SocialAgentTaskSlot>
>;

export type SocialAgentSlotMergeResult = {
  slots: SocialAgentTaskSlots;
  changed: SocialAgentTaskSlot[];
  completed: SocialAgentTaskSlot[];
  missingRequired: SocialAgentSlotKey[];
};

const SLOT_LABELS: Record<SocialAgentSlotKey, string> = {
  activity: '活动',
  time_window: '时间',
  location_text: '地点',
  geo_area: '区域',
  intensity: '强度',
  visibility: '公开方式',
  safety_boundary: '安全边界',
  invite_tone: '邀请语气',
};

const REQUIRED_SOCIAL_SLOTS: SocialAgentSlotKey[] = [
  'activity',
  'time_window',
  'location_text',
];

@Injectable()
export class SocialAgentTaskMemoryStateMachineService {
  extractSlotsFromUserMessage(message: string): SocialAgentTaskSlots {
    const text = cleanDisplayText(message, '').trim();
    const now = new Date().toISOString();
    const slots: SocialAgentTaskSlots = {};
    const put = (
      key: SocialAgentSlotKey,
      value: string,
      state: SocialAgentSlotState = 'answered',
    ) => {
      const cleanValue = cleanDisplayText(value, '').trim();
      if (!cleanValue) return;
      slots[key] = {
        key,
        value: cleanValue,
        state,
        source: state === 'inferred' ? 'inferred' : 'user_message',
        updatedAt: now,
      };
    };

    const activity = this.extractActivity(text);
    if (activity) put('activity', activity);
    const timeWindow = this.extractTimeWindow(text);
    if (timeWindow) put('time_window', timeWindow);
    const location = this.extractLocation(text);
    if (location) put('location_text', location.value);
    if (location?.area) put('geo_area', location.area, 'inferred');
    const intensity = this.extractIntensity(text);
    if (intensity) put('intensity', intensity);
    const visibility = this.extractVisibility(text);
    if (visibility) put('visibility', visibility);
    const boundary = this.extractSafetyBoundary(text);
    if (boundary) put('safety_boundary', boundary);
    const tone = this.extractInviteTone(text);
    if (tone) put('invite_tone', tone);
    return slots;
  }

  mergeSlots(
    existing: SocialAgentTaskSlots,
    extracted: SocialAgentTaskSlots,
  ): SocialAgentSlotMergeResult {
    const next: SocialAgentTaskSlots = { ...existing };
    const changed: SocialAgentTaskSlot[] = [];
    const completed: SocialAgentTaskSlot[] = [];
    for (const key of Object.keys(extracted) as SocialAgentSlotKey[]) {
      const incoming = extracted[key];
      if (!incoming) continue;
      const previous = next[key];
      const state: SocialAgentSlotState =
        previous?.value && previous.value !== incoming.value
          ? 'modified'
          : previous?.state === 'completed' || previous?.state === 'confirmed'
            ? previous.state
            : incoming.state;
      const slot: SocialAgentTaskSlot = {
        ...incoming,
        state,
        completedAt: previous?.completedAt ?? null,
      };
      next[key] = slot;
      changed.push(slot);
    }

    for (const key of REQUIRED_SOCIAL_SLOTS) {
      const slot = next[key];
      if (!slot) continue;
      if (!this.isRequiredSlotAnswered(slot)) continue;
      if (slot.state === 'completed') continue;
      const done: SocialAgentTaskSlot = {
        ...slot,
        state: 'completed',
        completedAt: new Date().toISOString(),
      };
      next[key] = done;
      completed.push(done);
    }

    return {
      slots: next,
      changed,
      completed,
      missingRequired: this.getMissingRequiredSlots(next),
    };
  }

  markCompleted(slots: SocialAgentTaskSlots, slotKey: SocialAgentSlotKey) {
    const slot = slots[slotKey];
    if (!slot) return slots;
    return {
      ...slots,
      [slotKey]: {
        ...slot,
        state: 'completed' as const,
        completedAt: new Date().toISOString(),
      },
    };
  }

  getMissingRequiredSlots(slots: SocialAgentTaskSlots): SocialAgentSlotKey[] {
    return REQUIRED_SOCIAL_SLOTS.filter(
      (key) => !this.isRequiredSlotAnswered(slots[key]),
    );
  }

  avoidRepeatingAnsweredQuestions(
    missing: SocialAgentSlotKey[],
    slots: SocialAgentTaskSlots,
  ): SocialAgentSlotKey[] {
    return missing.filter((key) => !this.isRequiredSlotAnswered(slots[key]));
  }

  readSlots(task: AgentTask): SocialAgentTaskSlots {
    const root = this.isRecord(task.memory) ? task.memory : {};
    const raw = this.isRecord(root.taskSlots) ? root.taskSlots : {};
    const out: SocialAgentTaskSlots = {};
    for (const key of Object.keys(SLOT_LABELS) as SocialAgentSlotKey[]) {
      const item = raw[key];
      if (!this.isRecord(item)) continue;
      const value = cleanDisplayText(item.value, '');
      if (!value) continue;
      out[key] = {
        key,
        value,
        state: this.slotState(item.state),
        source:
          item.source === 'inferred' || item.source === 'system'
            ? item.source
            : 'user_message',
        updatedAt: cleanDisplayText(item.updatedAt, new Date().toISOString()),
        completedAt: cleanDisplayText(item.completedAt, '') || null,
      };
    }
    return out;
  }

  writeSlots(task: AgentTask, slots: SocialAgentTaskSlots): void {
    const root = this.isRecord(task.memory) ? task.memory : {};
    task.memory = {
      ...root,
      taskSlots: slots,
      taskSlotSummary: this.publicSlotSummary(slots),
    };
  }

  applyUserMessage(
    task: AgentTask,
    message: string,
  ): SocialAgentSlotMergeResult {
    const existing = this.readSlots(task);
    const extracted = this.extractSlotsFromUserMessage(message);
    const merged = this.mergeSlots(existing, extracted);
    this.writeSlots(task, merged.slots);
    return merged;
  }

  publicSlotSummary(slots: SocialAgentTaskSlots): Record<string, string> {
    const summary: Record<string, string> = {};
    for (const key of Object.keys(SLOT_LABELS) as SocialAgentSlotKey[]) {
      const slot = slots[key];
      if (slot?.value) summary[SLOT_LABELS[key]] = slot.value;
    }
    return summary;
  }

  private isAnswered(slot: SocialAgentTaskSlot | undefined): boolean {
    return Boolean(
      slot?.value &&
      ['answered', 'confirmed', 'completed', 'modified', 'inferred'].includes(
        slot.state,
      ),
    );
  }

  private isRequiredSlotAnswered(
    slot: SocialAgentTaskSlot | undefined,
  ): boolean {
    return Boolean(
      slot?.value &&
        ['answered', 'confirmed', 'completed', 'modified'].includes(
          slot.state,
        ),
    );
  }

  private extractActivity(text: string): string | null {
    const activities = [
      '羽毛球',
      '篮球',
      '跑步',
      '慢跑',
      '散步',
      '爬山',
      '徒步',
      '骑行',
      '健身',
      '瑜伽',
      '游泳',
      '咖啡',
      '聊天',
      'city walk',
      'citywalk',
    ];
    return (
      activities.find((item) =>
        text.toLowerCase().includes(item.toLowerCase()),
      ) ?? null
    );
  }

  private extractTimeWindow(text: string): string | null {
    const matches = text.match(
      /(周末(?:上午|中午|下午|晚上)?|周六(?:上午|下午|晚上)?|周日(?:上午|下午|晚上)?|今晚|明天(?:上午|下午|晚上)?|今天(?:上午|下午|晚上)?|工作日晚上|下班后)/,
    );
    return matches?.[1] ?? null;
  }

  private extractLocation(
    text: string,
  ): { value: string; area?: string } | null {
    const named = text.match(
      /((?:崂山区|市南区|市北区|李沧区|黄岛区|青岛大学|五四广场|奥帆中心|大学城|附近)[\u4e00-\u9fa5A-Za-z0-9·-]{0,12})/,
    );
    if (!named) return null;
    const value = named[1];
    const area = value.match(/(崂山区|市南区|市北区|李沧区|黄岛区)/)?.[1];
    return { value, area };
  }

  private extractIntensity(text: string): string | null {
    if (/(低强度|轻松|慢|不累|随便走走|散步)/.test(text)) return '低强度';
    if (/(中等|适中|正常强度)/.test(text)) return '中等强度';
    if (/(高强度|认真练|训练|冲刺)/.test(text)) return '高强度';
    return null;
  }

  private extractVisibility(text: string): string | null {
    if (/(可以公开|公开到发现|发到发现|发布到发现)/.test(text))
      return '可公开到发现';
    if (/(不要公开|先不公开|不发发现)/.test(text)) return '暂不公开';
    return null;
  }

  private extractSafetyBoundary(text: string): string | null {
    if (
      /(公开场所|公共场所|人多|平台内|不交换联系方式|不留电话|不加微信)/.test(
        text,
      )
    ) {
      return '首次见面优先公共场所，先在平台内沟通';
    }
    return null;
  }

  private extractInviteTone(text: string): string | null {
    if (/(轻松|自然|别尴尬|低压力)/.test(text)) return '轻松自然';
    if (/(直接|简短|少废话)/.test(text)) return '简短直接';
    if (/(礼貌|温和|客气)/.test(text)) return '温和礼貌';
    return null;
  }

  private slotState(value: unknown): SocialAgentSlotState {
    return value === 'inferred' ||
      value === 'answered' ||
      value === 'confirmed' ||
      value === 'completed' ||
      value === 'modified'
      ? value
      : 'missing';
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
}
