import { Injectable } from '@nestjs/common';

import { cleanDisplayText } from '../common/display-text.util';
import type { AgentTask } from './entities/agent-task.entity';
import { buildSocialAgentKnownTaskSlotConstraints } from './social-agent-task-slot-constraints.presenter';

export type SocialAgentSlotKey =
  | 'activity'
  | 'time_window'
  | 'location_text'
  | 'geo_area'
  | 'intensity'
  | 'visibility'
  | 'safety_boundary'
  | 'invite_tone'
  | 'candidate_preference';

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

export type SocialAgentSlotTaskType =
  | 'social_match'
  | 'publish_social_request'
  | 'send_invite'
  | 'meet_loop'
  | 'friendship'
  | 'conversation';

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
  candidate_preference: '候选偏好',
};

const REQUIRED_SOCIAL_SLOTS_BY_TASK_TYPE: Record<
  SocialAgentSlotTaskType,
  SocialAgentSlotKey[]
> = {
  conversation: [],
  social_match: ['activity', 'time_window', 'location_text'],
  publish_social_request: [
    'activity',
    'time_window',
    'location_text',
    'visibility',
    'safety_boundary',
  ],
  send_invite: [
    'activity',
    'time_window',
    'location_text',
    'invite_tone',
    'safety_boundary',
  ],
  meet_loop: ['activity', 'time_window', 'location_text', 'safety_boundary'],
  friendship: ['activity', 'location_text', 'safety_boundary'],
};

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
    const candidatePreference = this.extractCandidatePreference(text);
    if (candidatePreference) put('candidate_preference', candidatePreference);
    return slots;
  }

  mergeSlots(
    existing: SocialAgentTaskSlots,
    extracted: SocialAgentTaskSlots,
    taskType: SocialAgentSlotTaskType = 'social_match',
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

    for (const key of this.requiredSlotsForTaskType(taskType)) {
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
      missingRequired: this.getMissingRequiredSlots(next, taskType),
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

  requiredSlotsForTaskType(
    taskType: SocialAgentSlotTaskType = 'social_match',
  ): SocialAgentSlotKey[] {
    return (
      REQUIRED_SOCIAL_SLOTS_BY_TASK_TYPE[taskType] ??
      REQUIRED_SOCIAL_SLOTS_BY_TASK_TYPE.social_match
    );
  }

  getMissingRequiredSlots(
    slots: SocialAgentTaskSlots,
    taskType: SocialAgentSlotTaskType = 'social_match',
  ): SocialAgentSlotKey[] {
    return this.requiredSlotsForTaskType(taskType).filter(
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
    const taskSlotSummary = this.publicSlotSummary(slots);
    const knownTaskSlotConstraints =
      buildSocialAgentKnownTaskSlotConstraints(slots);
    const taskMemory = this.isRecord(root.taskMemory) ? root.taskMemory : {};
    const boundaries = this.isRecord(taskMemory.boundaries)
      ? taskMemory.boundaries
      : {};
    const publicActivityAllowed = this.publicActivityAllowedFromVisibility(
      slots.visibility?.value,
    );
    const nextBoundaries =
      publicActivityAllowed === null
        ? boundaries
        : {
            ...boundaries,
            publicActivityAllowed,
          };
    task.memory = {
      ...root,
      taskSlots: slots,
      taskSlotSummary,
      knownTaskSlotConstraints,
      taskMemory: {
        ...taskMemory,
        taskSlots: slots,
        taskSlotSummary,
        knownTaskSlotConstraints,
        ...(Object.keys(nextBoundaries).length > 0
          ? { boundaries: nextBoundaries }
          : {}),
      },
    };
  }

  applyUserMessage(
    task: AgentTask,
    message: string,
    taskType: SocialAgentSlotTaskType = this.taskTypeForTask(task),
  ): SocialAgentSlotMergeResult {
    const existing = this.readSlots(task);
    const extracted = this.extractSlotsFromUserMessage(message);
    const merged = this.mergeSlots(existing, extracted, taskType);
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
      ['answered', 'confirmed', 'completed', 'modified'].includes(slot.state),
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
    const rawValue =
      named?.[1] ??
      text.match(
        /(青岛|北京|上海|深圳|广州|杭州|南京|成都|武汉|西安|重庆|苏州|厦门|天津|长沙|郑州|济南|宁波|合肥)/,
      )?.[1];
    if (!rawValue) return null;
    const value = this.cleanLocationText(rawValue);
    const area = value.match(/(崂山区|市南区|市北区|李沧区|黄岛区)/)?.[1];
    return { value, area };
  }

  private cleanLocationText(value: string): string {
    return cleanDisplayText(value, '')
      .replace(
        /(附近|周边)(?:找|约|想找|一起|跑步|慢跑|散步|健身|羽毛球|篮球|轻松|低强度).*$/,
        '$1',
      )
      .replace(
        /(大学|公园|广场|中心|大学城)(?:找|约|想找|一起|跑步|慢跑|散步|健身|羽毛球|篮球|轻松|低强度).*$/,
        '$1',
      )
      .replace(
        /((?:崂山区|市南区|市北区|李沧区|黄岛区|青岛大学|五四广场|奥帆中心|大学城|附近)(?:附近|周边)?)(?:同校|校友|女生|男生|学生|大学生).*$/,
        '$1',
      )
      .trim();
  }

  private extractIntensity(text: string): string | null {
    if (/(低强度|轻松|慢|不累|随便走走|散步)/.test(text)) return '低强度';
    if (/(中等|适中|正常强度)/.test(text)) return '中等强度';
    if (/(高强度|认真练|训练|冲刺)/.test(text)) return '高强度';
    return null;
  }

  private extractVisibility(text: string): string | null {
    if (
      /(不要公开|先不公开|不发发现|不发布到发现|不要发布到发现|不要发到发现)/.test(
        text,
      )
    )
      return '暂不公开';
    if (/(可以公开|公开到发现|发到发现|发布到发现)/.test(text))
      return '可公开到发现';
    if (/(公开|大家能看到|让别人看到)/.test(text)) return '可公开到发现';
    return null;
  }

  private publicActivityAllowedFromVisibility(
    value: string | undefined,
  ): boolean | null {
    const text = cleanDisplayText(value, '');
    if (!text) return null;
    if (/暂不公开|不公开/.test(text)) return false;
    if (/可公开|公开到发现|发布到发现/.test(text)) return true;
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

  private extractCandidatePreference(text: string): string | null {
    const parts: string[] = [];
    if (/(女生|女孩|女孩子|女性|女舞蹈生|女同学|女大学生)/.test(text))
      parts.push('女生');
    if (/(男生|男孩|男孩子|男性|男同学|男大学生)/.test(text))
      parts.push('男生');
    if (/(舞蹈生|学舞蹈|跳舞|舞蹈|舞者)/.test(text)) parts.push('舞蹈相关');
    const publicInterestPreference =
      this.extractPublicInterestCandidatePreference(text);
    if (publicInterestPreference) parts.push(publicInterestPreference);
    if (/(同校|校友|青岛大学学生|大学生|学生)/.test(text))
      parts.push('同校/学生');
    if (/(附近|同城|崂山区|市南区|市北区|李沧区|黄岛区)/.test(text))
      parts.push('附近同城');
    const explicit = text.match(
      /(理想型是|偏好是|希望认识|想认识|更想认识|最好是)([^，。；.!?]{2,32})/,
    );
    if (explicit?.[2]) {
      parts.push(
        cleanDisplayText(explicit[2], '')
          .replace(/^(一个|个|一些)/, '')
          .replace(/(的人|的朋友|的搭子|的伙伴|的对象)$/, '')
          .trim(),
      );
    }
    return (
      Array.from(new Set(parts.filter(Boolean)))
        .slice(0, 4)
        .join('、') || null
    );
  }

  private extractPublicInterestCandidatePreference(
    text: string,
  ): string | null {
    const hasPreferenceContext =
      /(喜欢|兴趣|爱好|公开资料|标签|理想型|偏好|希望认识|想认识|更想认识|最好是|会|学|专业|从事)/.test(
        text,
      );
    if (!hasPreferenceContext) return null;

    const parts: string[] = [];
    const add = (label: string) => {
      if (!parts.includes(label)) parts.push(label);
    };

    if (/(编程|代码|程序|软件|开发|计算机|人工智能|AI|科技)/i.test(text)) {
      add('编程/科技相关');
    }
    if (/(摄影|拍照|相机|影像)/.test(text)) add('摄影相关');
    if (/(音乐|唱歌|乐队|吉他|钢琴|民谣)/.test(text)) add('音乐相关');
    if (/(读书|阅读|文学|写作)/.test(text)) add('阅读写作相关');
    if (/(动漫|二次元|游戏|电竞)/.test(text)) add('动漫/游戏相关');
    if (/(咖啡|探店|电影|展览|city ?walk|城市漫步)/i.test(text)) {
      add('生活方式相近');
    }
    return parts.slice(0, 2).join('、') || null;
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

  private taskTypeForTask(task: AgentTask): SocialAgentSlotTaskType {
    const root = this.isRecord(task.memory) ? task.memory : {};
    const rootTaskMemory = this.isRecord(root.taskMemory)
      ? root.taskMemory
      : {};
    const currentTask = this.isRecord(root.currentTask) ? root.currentTask : {};
    const taskMemoryCurrentTask = this.isRecord(rootTaskMemory.currentTask)
      ? rootTaskMemory.currentTask
      : {};
    const rawType =
      typeof currentTask.type === 'string'
        ? currentTask.type
        : typeof taskMemoryCurrentTask.type === 'string'
          ? taskMemoryCurrentTask.type
          : typeof root.taskType === 'string'
            ? root.taskType
            : typeof rootTaskMemory.taskType === 'string'
              ? rootTaskMemory.taskType
              : task.taskType;
    if (rawType === 'publish_social_request') return 'publish_social_request';
    if (rawType === 'send_invite' || rawType === 'send_message')
      return 'send_invite';
    if (rawType === 'meet_loop') return 'meet_loop';
    if (rawType === 'friendship' || rawType === 'connect_candidate')
      return 'friendship';
    if (rawType === 'conversation') return 'conversation';
    return 'social_match';
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
}
