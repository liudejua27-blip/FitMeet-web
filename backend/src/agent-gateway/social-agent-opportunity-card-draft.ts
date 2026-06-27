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
import { readSocialAgentOpportunityDraftClarification } from './social-agent-opportunity-draft-memory';
import {
  normalizeSocialAgentRankingPreference,
  rankingPreferenceLabels,
} from './social-agent-ranking-preference';

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

const DEFAULT_SAFETY_BOUNDARY =
  '首次见面优先公共场所，先站内沟通，不公开精确位置或联系方式';

export function buildSocialAgentOpportunityDraftFromTask(
  task: AgentTask,
  message: string,
): SocialAgentOpportunityDraftResult {
  const taskMemory = readSocialAgentTaskMemory(task);
  const slots = taskMemory.taskSlots ?? {};
  const slotSummary = taskMemory.taskSlotSummary ?? {};
  const pendingDraft = readSocialAgentOpportunityDraftClarification(task);
  const sourceText = [
    message,
    task.goal,
    taskMemory.currentGoal,
    pendingDraft?.sourceText,
  ]
    .map((item) => cleanDisplayText(item, ''))
    .filter(Boolean)
    .join(' ');
  const activity =
    canonicalActivity(
      slotText(slots, slotSummary, 'activity') ||
        inferActivity(message) ||
        cleanDisplayText(taskMemory.activeEntities.activityType, '') ||
        inferActivity(sourceText) ||
        inferActivity(task.goal),
    ) || '';
  const time =
    slotText(slots, slotSummary, 'time_window') ||
    inferTime(message) ||
    cleanDisplayText(taskMemory.activeEntities.timePreference, '') ||
    inferTime(sourceText) ||
    inferTime(task.goal);
  const location =
    slotText(slots, slotSummary, 'location_text') ||
    slotText(slots, slotSummary, 'geo_area') ||
    inferLocation(message) ||
    cleanDisplayText(taskMemory.activeEntities.locationPreference, '') ||
    inferLocation(sourceText) ||
    inferLocation(task.goal);
  const city =
    cleanDisplayText(taskMemory.activeEntities.city, '') ||
    slotText(slots, slotSummary, 'city') ||
    slotText(slots, slotSummary, 'geo_area') ||
    inferCity(location, sourceText, task.goal);
  const safetyBoundary =
    slotText(slots, slotSummary, 'safety_boundary') ||
    inferSafetyBoundary(sourceText) ||
    (allowsDefaultSafetyBoundary(sourceText) ? DEFAULT_SAFETY_BOUNDARY : '');
  const missing = [
    city ? null : '城市/大致区域',
    activity ? null : '活动',
    time ? null : '时间',
    location ? null : '地点',
    safetyBoundary ? null : '安全边界',
  ].filter((item): item is string => Boolean(item));

  if (missing.length > 0) {
    return {
      ready: false,
      missing,
      assistantMessage: `发布约练卡前我先一次性确认：还差 ${missing.join('、')}。你可以一句话补齐；如果安全边界不确定，可以说“按默认安全设置处理”或“按安全默认值处理”。补齐后我会先生成一张可确认的约练卡；确认前不会公开，也不会推荐候选。`,
    };
  }

  const candidatePreference =
    slotText(slots, slotSummary, 'candidate_preference') ||
    inferCandidatePreference(sourceText);
  const capacityLabel = inferCapacityLabel(sourceText);
  const intensity =
    slotText(slots, slotSummary, 'intensity') || inferIntensity(sourceText);
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
      rawText:
        cleanDisplayText(sourceText, '') ||
        cleanDisplayText(message, '') ||
        task.goal,
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
    '不会公开精确位置、联系方式或私密资料。';
  const capacityLabel = text(draft.capacityLabel) || '找 1 人';
  const published = input.published === true;
  const socialRequestId =
    input.socialRequestId ??
    positiveNumber(record(draft).socialRequestId) ??
    positiveNumber(record(draft.metadata).socialRequestId);
  const discoverHref =
    text(input.discoverHref) ||
    (input.publicIntentId
      ? `/discover?publicIntentId=${encodeURIComponent(input.publicIntentId)}`
      : '/discover');

  return {
    id: published
      ? `activity_plan:${task.id}:published:${input.publicIntentId ?? socialRequestId ?? 'ok'}`
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
      socialRequestId: socialRequestId ?? null,
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
        socialRequestId: socialRequestId ?? null,
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
              socialRequestId: socialRequestId ?? null,
              discoverHref,
              sideEffect: 'edit_draft_only',
            },
          },
        ]
      : [
          {
            id: `publish_to_discover:${task.id}`,
            label: '发布卡片',
            action: 'publish_to_discover',
            schemaAction: 'publish_to_discover',
            loopStage: 'activity_draft_created',
            requiresConfirmation: true,
            payload: {
              taskId: task.id,
              socialRequestDraft: draft,
              socialRequestId: socialRequestId ?? null,
              actionType: 'publish_social_request',
              sideEffect: 'publish_social_request',
              approvalRequired: true,
              checkpointRequired: true,
              resumeMode: 'resume_after_approval',
              idempotencyKey: `publish-to-discover:${task.id}`,
              riskLevel: 'medium',
              riskReasons: [
                '这张约练卡会公开到发现页',
                '不会公开精确位置、联系方式或私密资料',
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
              socialRequestId: socialRequestId ?? null,
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
              socialRequestId: socialRequestId ?? null,
              privateMatchMode: true,
              publicDiscoverPublishSkipped: true,
              sourceAction: 'activity.skip_publish',
              sideEffect: 'local_dismiss',
            },
          },
        ],
  };
}

export function buildSocialAgentSlotCompletionCard(input: {
  task: AgentTask;
  missing: string[];
  sourceText?: string | null;
}): FitMeetAlphaCard {
  const missing = input.missing.map((item) => text(item)).filter(Boolean);
  const taskMemory = readSocialAgentTaskMemory(input.task);
  const missingSlots = buildSlotClarificationMissingSlots(missing);
  const completedSlots = buildSlotClarificationCompletedSlots(input.task);
  const rankingPreference = normalizeSocialAgentRankingPreference(
    taskMemory.rankingPreference,
  );
  const slotPatch = buildSlotClarificationPatch(input.task);
  const missingCopy = missing.length ? missing.join('、') : '必要信息';
  return {
    id: `activity_slot_completion:${input.task.id}`,
    type: 'safety_boundary',
    schemaVersion: 'fitmeet.tool-ui.v1',
    schemaType: 'social_match.slot_completion',
    title: '补齐约练卡信息',
    body: `生成约练卡前还差：${missingCopy}。补齐后我会先生成确认卡，不会直接发布到发现页。`,
    status: 'waiting_confirmation',
    data: {
      taskId: input.task.id,
      schemaName: 'OpportunitySlotCompletion',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.slot_completion',
      workflowState: 'COLLECTING_SLOTS',
      waitingFor: missing.includes('安全边界')
        ? 'safety_boundary'
        : 'opportunity_slot_completion',
      missing,
      missingSlots,
      completedSlots,
      optionalSlots: [
        {
          key: 'intensity',
          label: '活动强度',
          required: false,
          skippable: true,
          prompt: '可选：低强度、正常、竞技一点',
        },
        {
          key: 'candidatePreference',
          label: '候选偏好',
          required: false,
          skippable: true,
          prompt: '可选：更近一点、时间更重要、能聊得来优先',
        },
      ],
      rankingPreference: {
        ...rankingPreference,
        labels: rankingPreferenceLabels(rankingPreference),
      },
      slotPatch,
      sourceText: text(input.sourceText),
      defaultSafetyMessage: '按默认安全设置处理',
      customSafetyPrompt:
        '请直接输入你的安全边界，例如：只在公共场所，先站内沟通。',
      cancelMessage: '取消这次约练卡发布',
    },
    actions: [
      {
        id: `slot_default_safety:${input.task.id}`,
        label: '使用默认安全设置',
        action: 'slot_completion.use_default_safety',
        schemaAction: 'slot_completion.use_default_safety',
        requiresConfirmation: false,
        payload: {
          taskId: input.task.id,
          message: '按默认安全设置处理',
          waitingFor: 'safety_boundary',
          missingSlots,
          slotPatch,
          rankingPreference,
        },
      },
      {
        id: `slot_custom_safety:${input.task.id}`,
        label: '自定义安全边界',
        action: 'slot_completion.custom_safety',
        schemaAction: 'slot_completion.custom_safety',
        requiresConfirmation: false,
        payload: {
          taskId: input.task.id,
          message: '我想自定义安全边界',
          waitingFor: 'safety_boundary',
          missingSlots,
          slotPatch,
          rankingPreference,
        },
      },
      {
        id: `slot_cancel:${input.task.id}`,
        label: '取消',
        action: 'slot_completion.cancel',
        schemaAction: 'slot_completion.cancel',
        requiresConfirmation: false,
        payload: {
          taskId: input.task.id,
          message: '取消这次约练卡发布',
          waitingFor: 'opportunity_slot_completion',
          missingSlots,
          slotPatch,
          rankingPreference,
        },
      },
    ],
  };
}

function buildSlotClarificationMissingSlots(missing: string[]) {
  return missing.map((label) => {
    const key = slotClarificationKey(label);
    return {
      key,
      label,
      required: true,
      skippable: false,
      prompt: slotClarificationPrompt(key),
    };
  });
}

function buildSlotClarificationCompletedSlots(task: AgentTask) {
  const patch = buildSlotClarificationPatch(task);
  const entries: Array<[string, string, string | null]> = [
    ['city', '城市/大致区域', patch.city],
    ['activity', '活动', patch.activity],
    ['time', '时间', patch.time],
    ['location', '地点', patch.location],
    ['safety_boundary', '安全边界', patch.safetyBoundary],
    ['candidatePreference', '候选偏好', patch.candidatePreference],
  ];
  return entries
    .filter(([, , value]) => Boolean(text(value)))
    .map(([key, label, value]) => ({
      key,
      label,
      value: text(value),
    }));
}

function buildSlotClarificationPatch(task: AgentTask) {
  const memory = readSocialAgentTaskMemory(task);
  const slots = memory.taskSlots ?? {};
  const summary = memory.taskSlotSummary ?? {};
  return {
    city:
      text(memory.activeEntities.city) ||
      slotText(slots, summary, 'city') ||
      slotText(slots, summary, 'geo_area'),
    activity:
      text(memory.activeEntities.activityType) ||
      slotText(slots, summary, 'activity'),
    time:
      text(memory.activeEntities.timePreference) ||
      slotText(slots, summary, 'time_window'),
    location:
      text(memory.activeEntities.locationPreference) ||
      slotText(slots, summary, 'location_text') ||
      slotText(slots, summary, 'geo_area'),
    safetyBoundary: slotText(slots, summary, 'safety_boundary'),
    candidatePreference: slotText(slots, summary, 'candidate_preference'),
  };
}

function slotClarificationKey(label: string): string {
  if (/城市|区域/.test(label)) return 'city';
  if (/活动/.test(label)) return 'activity';
  if (/时间/.test(label)) return 'time';
  if (/地点|位置/.test(label)) return 'location';
  if (/安全|边界/.test(label)) return 'safety_boundary';
  return label;
}

function slotClarificationPrompt(key: string): string {
  switch (key) {
    case 'city':
      return '例如：青岛、市南区、青岛大学附近';
    case 'activity':
      return '例如：散步、羽毛球、跑步、健身';
    case 'time':
      return '例如：今晚 7 点、周末下午、明天下午';
    case 'location':
      return '例如：五四广场、中山公园、学校附近';
    case 'safety_boundary':
      return '例如：按默认安全设置处理，或只在公共场所见面';
    default:
      return '可以一句话补齐，也可以跳过可选项。';
  }
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
  const source = cleanDisplayText(value, '');
  const match =
    source.match(
      /(\d{1,2}[./月]\d{1,2}日?\s*(?:今天|明天|后天|周[一二三四五六日天]|周末)?\s*(?:早上|上午|中午|下午|晚上|今晚)?\s*(?:\d{1,2}|[一二两三四五六七八九十]+)(?::\d{2})?\s*点?(?:半|左右)?)/i,
    ) ??
    source.match(
      /((?:今天|明天|后天|周[一二三四五六日天]|周末)?\s*(?:早上|上午|中午|下午|晚上|今晚)?\s*(?:\d{1,2}|[一二两三四五六七八九十]+)(?::\d{2})?\s*点(?:半|左右)?)/i,
    ) ??
    source.match(/(\d{1,2}:\d{2})/) ??
    source.match(
      /(今天晚上|今天早上|今天上午|今天下午|今晚|明天上午|明天下午|明天晚上|周末上午|周末下午|周末晚上|周末|工作日晚间|早上|上午|下午|晚上|中午)/i,
    );
  return match?.[1] ? cleanDisplayText(match[1], '') : '';
}

function inferLocation(value: string): string {
  const source = cleanDisplayText(value, '');
  const cityVenue = source.match(
    /((?:青岛|上海|北京|深圳|广州|杭州|成都|武汉|南京)[\u4e00-\u9fa5A-Za-z0-9·-]{0,16}(?:公园|广场|体育馆|健身房|大学|校区|商场|书店|咖啡店|中心)(?:附近|周边)?)/i,
  );
  const match =
    cityVenue ??
    source.match(
      /((?:青岛大学|崂山区|市南区|市北区|李沧区|黄岛区|朝阳公园|中山公园|奥帆中心|五四广场|大学|公园|体育馆|健身房|校区|商场|书店|咖啡店)(?:附近|周边)?)/i,
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

function allowsDefaultSafetyBoundary(value: string): boolean {
  const source = cleanDisplayText(value, '');
  return /(按安全默认值处理|按默认安全设置处理|默认安全设置|按默认安全边界|默认安全边界|由你按安全默认值|安全默认值|按平台安全默认|按平台默认安全规则|使用默认安全方案|默认就行|安全方面按常规处理)/i.test(
    source,
  );
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

function positiveNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return cleanDisplayText(value, '').trim();
}
