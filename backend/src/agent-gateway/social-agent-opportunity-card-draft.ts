import { cleanDisplayText } from '../common/display-text.util';
import {
  SocialRequestSafety,
  SocialRequestType,
  SocialRequestVisibility,
} from '../social-requests/social-request.entity';
import type { CreateSocialRequestDto } from '../social-requests/dto/create-social-request.dto';
import type { AgentTask } from './entities/agent-task.entity';
import type { FitMeetAlphaCard } from './fitmeet-alpha-agent.types';
import { readSocialAgentTaskMemory } from './social-agent-memory.util';

export type SocialAgentOpportunityDraft = CreateSocialRequestDto & {
  locationName: string;
  location: string;
  activityType: string;
  timePreference: string;
  capacityLabel: string;
};

export type SocialAgentOpportunityDraftResult =
  | { ready: true; draft: SocialAgentOpportunityDraft }
  | { ready: false; assistantMessage: string; missing: string[] };

export function buildSocialAgentOpportunityDraftFromTask(
  task: AgentTask,
  message: string,
): SocialAgentOpportunityDraftResult {
  const taskMemory = readSocialAgentTaskMemory(task);
  const slots = taskMemory.taskSlots ?? {};
  const slotSummary = taskMemory.taskSlotSummary ?? {};
  const sourceText = [message, task.goal, taskMemory.currentGoal]
    .map((item) => cleanDisplayText(item, ''))
    .filter(Boolean)
    .join(' ');
  const activity =
    canonicalActivity(
      slotText(slots, slotSummary, 'activity') ||
        inferActivity(message) ||
        cleanDisplayText(taskMemory.activeEntities.activityType, '') ||
        inferActivity(task.goal),
    ) || '';
  const time =
    slotText(slots, slotSummary, 'time_window') ||
    inferTime(message) ||
    cleanDisplayText(taskMemory.activeEntities.timePreference, '') ||
    inferTime(task.goal);
  const location =
    slotText(slots, slotSummary, 'location_text') ||
    slotText(slots, slotSummary, 'geo_area') ||
    inferLocation(message) ||
    cleanDisplayText(taskMemory.activeEntities.locationPreference, '') ||
    inferLocation(task.goal);
  const city =
    cleanDisplayText(taskMemory.activeEntities.city, '') ||
    slotText(slots, slotSummary, 'city') ||
    slotText(slots, slotSummary, 'geo_area') ||
    inferCity(location, message, task.goal) ||
    '青岛';
  const missing = [
    activity ? null : '活动',
    time ? null : '时间',
    location ? null : '地点',
  ].filter((item): item is string => Boolean(item));

  if (missing.length > 0) {
    return {
      ready: false,
      missing,
      assistantMessage: `发布约练卡前还差 ${missing.join('、')}。你补充后，我会先生成一张可确认的约练卡；确认前不会公开，也不会推荐候选。`,
    };
  }

  const candidatePreference =
    slotText(slots, slotSummary, 'candidate_preference') ||
    inferCandidatePreference(sourceText);
  const capacityLabel = inferCapacityLabel(sourceText);
  const intensity =
    slotText(slots, slotSummary, 'intensity') || inferIntensity(sourceText);
  const safetyBoundary =
    slotText(slots, slotSummary, 'safety_boundary') ||
    inferSafetyBoundary(sourceText) ||
    '首次见面优先公共场所，先站内沟通，不公开精确位置或联系方式';
  const title = opportunityTitle({ location, time, activity });
  const description = [
    `想找一个${time}在${location}一起${activity}的人。`,
    intensity ? `节奏偏${intensity}。` : null,
    capacityLabel ? `${capacityLabel}。` : null,
    candidatePreference ? `偏好：${candidatePreference}。` : null,
    safetyBoundary,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    ready: true,
    draft: {
      type: socialRequestType(activity),
      title,
      description,
      rawText: cleanDisplayText(message, '') || task.goal,
      city,
      radiusKm: 5,
      activityType: activity,
      timePreference: time,
      locationName: location,
      location,
      interestTags: uniqueStrings([activity, intensity, candidatePreference]),
      safetyRequirement: SocialRequestSafety.LowRiskOnly,
      visibility: SocialRequestVisibility.Public,
      agentAllowed: true,
      requireUserConfirmation: true,
      capacityLabel,
      metadata: {
        agentTaskId: task.id,
        source: 'social_agent_natural_language_publish',
        visibilityConsent: true,
        publishPolicy: 'confirm_before_public_publish',
        safetyBoundary,
        candidatePreference: candidatePreference || null,
        timePreference: time,
        locationPreference: location,
        intensity: intensity || null,
        capacityLabel,
      },
    },
  };
}

export function buildSocialAgentPublishConfirmationCard(input: {
  task: AgentTask;
  draft: SocialAgentOpportunityDraft;
  published?: boolean;
  publicIntentId?: string | null;
  socialRequestId?: number | null;
  discoverHref?: string | null;
  publicIntentHref?: string | null;
}): FitMeetAlphaCard {
  const { task, draft } = input;
  const activityType = text(draft.activityType) || '约练';
  const time = text(draft.timePreference) || '时间待确认';
  const location = text(draft.locationName ?? draft.location) || '公共场所';
  const city = text(draft.city) || '同城';
  const safetyBoundary =
    text(record(draft.metadata).safetyBoundary) ||
    '不会公开精确位置、联系方式或私密画像。';
  const capacityLabel = text(draft.capacityLabel) || '找 1 人';
  const published = input.published === true;
  const discoverHref =
    text(input.discoverHref) ||
    (input.publicIntentId
      ? `/discover?publicIntentId=${encodeURIComponent(input.publicIntentId)}`
      : '/discover');

  return {
    id: published
      ? `activity_plan:${task.id}:published:${input.publicIntentId ?? input.socialRequestId ?? 'ok'}`
      : `activity_plan:${task.id}:publish_confirmation`,
    type: published ? 'activity_status' : 'activity_plan',
    schemaVersion: 'fitmeet.tool-ui.v1',
    schemaType: 'social_match.activity',
    title: published ? '约练卡已发布' : '约练卡待发布',
    body: published
      ? `${city} · ${time} · ${activityType}。这张卡已同步到发现页，公开可发现用户可以看到。`
      : `${city} · ${time} · ${activityType}。确认后会同步到发现页，附近公开可发现用户可以看到这张卡。${safetyBoundary}`,
    status: published ? 'completed' : 'waiting_confirmation',
    data: {
      taskId: task.id,
      schemaName: 'OpportunityCard',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.activity',
      opportunityCard: true,
      opportunityType: 'activity',
      opportunityTitle: text(draft.title) || `${activityType}约练`,
      city,
      time,
      locationName: location,
      location,
      activityType,
      intensity: text(record(draft.metadata).intensity) || null,
      capacityLabel,
      safetyBoundary,
      publishPolicy: 'confirm_before_public_publish',
      approvalPolicy: published ? '已由你确认发布' : '发布到发现前必须由你确认',
      publicIntentId: input.publicIntentId ?? null,
      socialRequestId: input.socialRequestId ?? null,
      discoverHref,
      publicIntentHref: input.publicIntentHref ?? null,
      autoPublished: published,
      publishStatus: published ? 'published' : 'draft',
      confirmedContext: [
        `城市：${city}`,
        `时间：${time}`,
        `活动：${activityType}`,
        `地点：${location}`,
      ],
      opportunity: {
        id: `opportunity:${task.id}:activity`,
        type: 'activity',
        title: text(draft.title) || `${activityType}约练`,
        subtitle: `${time} · ${location}`,
        summary: text(draft.description),
        city,
        location,
        time,
        activityType,
        tags: uniqueStrings([
          location,
          time,
          activityType,
          text(record(draft.metadata).intensity),
        ]),
        safetyBoundary,
        capacityLabel,
        publicIntentId: input.publicIntentId ?? null,
        discoverHref,
        publicIntentHref: input.publicIntentHref ?? null,
        autoPublished: published,
        recommendedNextAction: published
          ? '我会根据这张卡继续帮你找合适的人。'
          : '确认发布后，我会同步到发现页。',
      },
    },
    actions: published
      ? [
          {
            id: `modify_activity_plan:${task.id}`,
            label: '修改卡片',
            action: 'reschedule_meet_loop',
            schemaAction: 'activity.modify_time',
            loopStage: 'activity_confirmed',
            requiresConfirmation: false,
            payload: {
              taskId: task.id,
              socialRequestDraft: draft,
              publicIntentId: input.publicIntentId ?? null,
              socialRequestId: input.socialRequestId ?? null,
              discoverHref,
              sideEffect: 'edit_draft_only',
            },
          },
        ]
      : [
          {
            id: `publish_to_discover:${task.id}`,
            label: '确认发布',
            action: 'publish_to_discover',
            schemaAction: 'publish_to_discover',
            loopStage: 'activity_draft_created',
            requiresConfirmation: true,
            payload: {
              taskId: task.id,
              socialRequestDraft: draft,
              actionType: 'publish_social_request',
              sideEffect: 'publish_social_request',
              approvalRequired: true,
              checkpointRequired: true,
              resumeMode: 'resume_after_approval',
              idempotencyKey: `publish-to-discover:${task.id}`,
              riskLevel: 'medium',
              riskReasons: [
                '这张约练卡会公开到发现页',
                '不会公开精确位置、联系方式或私密画像',
              ],
            },
          },
          {
            id: `modify_activity_plan:${task.id}`,
            label: '修改卡片',
            action: 'reschedule_meet_loop',
            schemaAction: 'activity.modify_time',
            loopStage: 'activity_draft_created',
            requiresConfirmation: false,
            payload: {
              taskId: task.id,
              socialRequestDraft: draft,
              sideEffect: 'edit_draft_only',
            },
          },
          {
            id: `skip_publish_activity:${task.id}`,
            label: '暂不发布',
            action: 'activity.skip_publish',
            schemaAction: 'activity.skip_publish',
            loopStage: 'activity_draft_created',
            requiresConfirmation: false,
            payload: {
              taskId: task.id,
              socialRequestDraft: draft,
              privateMatchMode: true,
              publicDiscoverPublishSkipped: true,
              sourceAction: 'activity.skip_publish',
              sideEffect: 'local_dismiss',
            },
          },
        ],
  };
}

export function shouldCreateOpportunityCardBeforeCandidates(
  message: string,
): boolean {
  const textValue = cleanDisplayText(message, '').toLowerCase();
  if (!textValue) return false;
  if (
    /(不发布|不要发布|先不发布|暂不发布|不用发布|私密匹配|只私下匹配)/i.test(
      textValue,
    )
  ) {
    return false;
  }
  const hasTrainingActivity =
    /(跑步|慢跑|健身|羽毛球|篮球|网球|瑜伽|徒步|骑行|运动|训练)/i.test(
      textValue,
    );
  const hasPeopleOrDiscoveryIntent =
    /(搭子|约练|约跑|找|一起|想认识|认识.{0,12}(人|朋友|搭子|伙伴)|候选|推荐|筛选|公开可发现的人|合适的人)/i.test(
      textValue,
    );
  const hasPublishIntent =
    /(发布|公开发起|发起活动|发布卡片|发布约练|公开发布|发布到发现|发到发现|同步到发现|发现页|公开可发现)/i.test(
      textValue,
    );
  if (hasTrainingActivity && hasPublishIntent) return true;
  if (hasTrainingActivity && hasPeopleOrDiscoveryIntent) return true;
  return /(约练|约跑|搭子|找.{0,10}(跑步|慢跑|健身|羽毛球|篮球|网球|瑜伽|徒步|骑行|运动|训练).{0,10}(人|搭子|伙伴|朋友)?|想认识.{0,20}(跑步|慢跑|健身|羽毛球|篮球|网球|瑜伽|徒步|骑行|运动|训练).{0,10}(人|搭子|伙伴|朋友)?|一起.{0,10}(跑步|慢跑|健身|羽毛球|篮球|网球|瑜伽|徒步|骑行|运动|训练))/i.test(
    textValue,
  );
}

function slotText(
  slots: Record<string, unknown>,
  summary: Record<string, string>,
  key: string,
): string {
  const slot = record(slots[key]);
  const state = text(slot.state);
  const source = text(slot.source);
  const value = text(slot.value ?? slots[key]);
  if (value && state !== 'missing') {
    if (
      ['activity', 'time_window', 'location_text'].includes(key) &&
      (state === 'inferred' || source === 'inferred')
    ) {
      return '';
    }
    return value;
  }
  return text(summary[key]);
}

function inferActivity(value: string): string {
  const match = cleanDisplayText(value, '').match(
    /(健身|散步|跑步|慢跑|羽毛球|篮球|徒步|爬山|骑行|游泳|瑜伽|飞盘|网球|乒乓|咖啡|city\s*walk|citywalk)/i,
  );
  return match?.[1] ? cleanDisplayText(match[1], '') : '';
}

function canonicalActivity(value: string): string {
  const normalized = cleanDisplayText(value, '');
  if (/慢跑|跑步|running/i.test(normalized)) return '跑步';
  if (/city\s*walk|citywalk|散步/i.test(normalized)) return '散步';
  return normalized;
}

function inferTime(value: string): string {
  const match = cleanDisplayText(value, '').match(
    /(今天晚上|今天早上|今天上午|今天下午|今晚|明天上午|明天下午|明天晚上|周末上午|周末下午|周末晚上|周末|工作日晚间|早上|上午|下午|晚上|中午|[0-9一二三四五六七八九十]+点)/i,
  );
  return match?.[1] ? cleanDisplayText(match[1], '') : '';
}

function inferLocation(value: string): string {
  const match = cleanDisplayText(value, '').match(
    /((?:青岛大学|崂山区|市南区|市北区|李沧区|黄岛区|朝阳公园|奥帆中心|五四广场|大学|公园|体育馆|健身房|校区|商场|书店|咖啡店)(?:附近|周边)?)/i,
  );
  return match?.[1] ? cleanDisplayText(match[1], '') : '';
}

function inferCity(...values: string[]): string {
  const joined = values.map((item) => cleanDisplayText(item, '')).join(' ');
  const match = joined.match(/(青岛|上海|北京|深圳|广州|杭州|成都|武汉|南京)/);
  return match?.[1] ?? '';
}

function inferIntensity(value: string): string {
  const source = cleanDisplayText(value, '');
  if (/轻松|低强度|不卷|慢跑|放松/i.test(source)) return '轻松';
  if (/3\s*[-~到至]\s*5\s*km|3-5公里|三到五公里/i.test(source)) return '3-5km';
  if (/高强度|配速|冲刺/i.test(source)) return '有强度';
  return '';
}

function inferCapacityLabel(value: string): string {
  const source = cleanDisplayText(value, '');
  if (/(找|约|想找).{0,6}(1|一)\s*人/i.test(source)) return '找 1 人';
  const match = source.match(/(找|约|想找).{0,6}([2-9二三四五六七八九])\s*人/i);
  if (!match?.[2]) return '找 1 人';
  return `找 ${chineseNumber(match[2])} 人`;
}

function inferCandidatePreference(value: string): string {
  const source = cleanDisplayText(value, '');
  if (/先站内沟通|站内聊|不交换联系方式/i.test(source)) return '先站内沟通';
  if (/轻松聊天|轻松聊|能聊天/i.test(source)) return '轻松聊天';
  return '';
}

function inferSafetyBoundary(value: string): string {
  const source = cleanDisplayText(value, '');
  if (/先站内沟通|站内聊|不交换联系方式/i.test(source)) {
    return '先站内沟通，不公开手机号或微信，见面前再确认公共路线';
  }
  if (/公共场所|公开路线|白天/i.test(source)) {
    return '优先公共场所和公开路线，不公开精确位置或联系方式';
  }
  return '';
}

function opportunityTitle(input: {
  location: string;
  time: string;
  activity: string;
}): string {
  const shortLocation = input.location.replace(/附近|周边/g, '');
  const timeLabel = /早上|上午|晨/i.test(input.time)
    ? '晨'
    : /晚上|今晚/i.test(input.time)
      ? '晚'
      : '';
  return `${shortLocation}${timeLabel}${input.activity}搭子`;
}

function socialRequestType(activity: string): SocialRequestType {
  const normalized = activity.toLowerCase();
  if (/跑|run/.test(normalized)) return SocialRequestType.RunningPartner;
  if (/健身|训练|gym|fitness/.test(normalized))
    return SocialRequestType.FitnessPartner;
  if (/咖啡/.test(normalized)) return SocialRequestType.CoffeeChat;
  if (/散步|city/.test(normalized)) return SocialRequestType.CityWalk;
  return SocialRequestType.Custom;
}

function chineseNumber(value: string): string {
  const map: Record<string, string> = {
    二: '2',
    三: '3',
    四: '4',
    五: '5',
    六: '6',
    七: '7',
    八: '8',
    九: '9',
  };
  return map[value] ?? value;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.map((value) => text(value)).filter(Boolean)),
  ).slice(0, 20);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return cleanDisplayText(value, '').trim();
}
