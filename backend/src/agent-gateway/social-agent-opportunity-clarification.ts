import { cleanDisplayText } from '../common/display-text.util';
import { sanitizeCity } from '../common/city.util';
import type { AgentTask } from './entities/agent-task.entity';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import {
  mergeSocialAgentBoundaries,
  mergeSocialAgentPreferences,
  readSocialAgentTaskMemory,
  transitionSocialAgentState,
} from './social-agent-memory.util';

export type SocialAgentOpportunityClarificationField =
  | 'city'
  | 'location'
  | 'time'
  | 'activity'
  | 'intensity'
  | 'relationshipGoal'
  | 'candidatePreference'
  | 'boundary'
  | 'strangerPolicy'
  | 'publicActivity';

export type SocialAgentOpportunityClarification = {
  complete: boolean;
  missing: SocialAgentOpportunityClarificationField[];
  assistantMessage: string;
  searchGoal: string;
};

type FieldSnapshot = Record<SocialAgentOpportunityClarificationField, string>;

export function evaluateSocialOpportunityClarification(input: {
  task: AgentTask;
  route: SocialAgentIntentRouterResult;
  message: string;
}): SocialAgentOpportunityClarification {
  mergeSocialAgentPreferences(input.task, input.message);
  mergeSocialAgentBoundaries(input.task, input.message);
  const memory = readSocialAgentTaskMemory(input.task);
  const fields = resolveFields(input);
  const missing = requiredFieldsForRoute(input.route).filter(
    (field) => !fields[field],
  );
  if (
    input.route.intent === 'social_search' &&
    fields.relationshipGoal &&
    !fields.candidatePreference &&
    isGenericRelationshipGoal(fields.relationshipGoal)
  ) {
    missing.push('candidatePreference');
  }
  const searchGoal = buildSearchGoal({
    message: input.message,
    currentGoal: memory.currentGoal,
    fields,
  });
  if (missing.length === 0) {
    return {
      complete: true,
      missing,
      assistantMessage: '',
      searchGoal,
    };
  }
  const previousClarificationFields = new Set(
    memory.currentTask.clarificationAskedFields.filter(isClarificationField),
  );
  const isFollowUpClarification =
    memory.currentTask.waitingFor === 'opportunity_clarification' &&
    memory.currentTask.awaitingSearchConfirmation === true &&
    memory.currentTask.clarificationTurns > 0;
  const freshMissing = missing.filter(
    (field) => !previousClarificationFields.has(field),
  );
  const assistantMessage = buildClarifyingQuestion({
    missing,
    fields,
    focusMissing:
      isFollowUpClarification && freshMissing.length > 0
        ? freshMissing
        : missing,
    followUp: isFollowUpClarification,
  });
  const askedFields = Array.from(
    new Set([...previousClarificationFields, ...missing]),
  );
  transitionSocialAgentState(input.task, 'user_message', {
    objective: 'social_opportunity_clarification',
    nextStep: assistantMessage,
    shouldSearchNow: false,
    awaitingSearchConfirmation: true,
    waitingFor: 'opportunity_clarification',
    lastCompletedStep: 'social_intent_detected',
    clarificationAskedFields: askedFields,
    clarificationMissingFields: missing,
    clarificationTurns: memory.currentTask.clarificationTurns + 1,
    clarificationAskedAt: new Date().toISOString(),
  });
  return {
    complete: false,
    missing,
    assistantMessage,
    searchGoal,
  };
}

function requiredFieldsForRoute(
  route: SocialAgentIntentRouterResult,
): SocialAgentOpportunityClarificationField[] {
  const base: SocialAgentOpportunityClarificationField[] = [
    'city',
    'location',
    'time',
    'activity',
    'intensity',
    'boundary',
    'strangerPolicy',
    'publicActivity',
  ];
  if (route.intent === 'social_search') {
    return [
      'city',
      'time',
      'activity',
      'intensity',
      'relationshipGoal',
      'boundary',
      'strangerPolicy',
      'publicActivity',
    ];
  }
  return base.filter((field) => field !== 'location');
}

export function isAwaitingSocialOpportunityClarification(
  taskContext: Record<string, unknown> | undefined,
): boolean {
  const currentTask = isRecord(taskContext?.currentTask)
    ? taskContext?.currentTask
    : {};
  return (
    currentTask.awaitingSearchConfirmation === true &&
    cleanDisplayText(currentTask.waitingFor, '') === 'opportunity_clarification'
  );
}

function resolveFields(input: {
  task: AgentTask;
  route: SocialAgentIntentRouterResult;
  message: string;
}): FieldSnapshot {
  const memory = readSocialAgentTaskMemory(input.task);
  const entities = input.route.entities;
  const text = cleanDisplayText(input.message, '');
  const currentGoal = cleanDisplayText(memory.currentGoal, '');
  const taskSlots = readTaskSlotValues(input.task);
  const historyText = [
    currentGoal,
    ...memory.lastUserMessages.map((turn) => turn.text),
  ]
    .filter(Boolean)
    .slice(-4)
    .join(' ');
  const combined = `${historyText} ${text}`.trim();
  const boundaries = memory.boundaries;
  const relationshipGoal = relationshipGoalSummary(combined, memory.preferences);
  return {
    city:
      cleanDisplayText(entities.city, '') ||
      cleanDisplayText(memory.activeEntities.city, '') ||
      taskSlots.geo_area ||
      extractCity(combined),
    time:
      cleanDisplayText(entities.timePreference, '') ||
      cleanDisplayText(memory.activeEntities.timePreference, '') ||
      taskSlots.time_window ||
      extractTime(combined),
    location:
      cleanDisplayText(entities.locationPreference, '') ||
      cleanDisplayText(memory.activeEntities.locationPreference, '') ||
      taskSlots.location_text ||
      extractLocation(combined),
    activity:
      cleanDisplayText(entities.activityType, '') ||
      cleanDisplayText(memory.activeEntities.activityType, '') ||
      taskSlots.activity ||
      extractActivity(combined),
    intensity: taskSlots.intensity || extractIntensity(combined),
    relationshipGoal,
    candidatePreference: candidatePreferenceSummary(
      combined,
      memory.preferences,
      relationshipGoal,
    ),
    boundary:
      hasCommunicationBoundary(boundaries, combined) || boundaries.noAutoMessage
        ? boundarySummary(boundaries, combined)
        : taskSlots.safety_boundary
          ? taskSlots.safety_boundary
          : '',
    strangerPolicy: strangerPolicySummary(boundaries, combined),
    publicActivity:
      publicActivityFromSlot(taskSlots.visibility) ||
      publicActivitySummary(boundaries, combined),
  };
}

function readTaskSlotValues(task: AgentTask): Record<string, string> {
  const memory = isRecord(task.memory) ? task.memory : {};
  const taskSlots = isRecord(memory.taskSlots) ? memory.taskSlots : {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(taskSlots)) {
    if (!isRecord(value)) continue;
    if (!isTaskSlotUsableForClarification(key, value)) continue;
    const text = cleanDisplayText(value.value, '');
    if (text) out[key] = text;
  }
  return out;
}

function isTaskSlotUsableForClarification(
  key: string,
  slot: Record<string, unknown>,
): boolean {
  const state = cleanDisplayText(slot.state, '');
  const source = cleanDisplayText(slot.source, '');
  if (state === 'missing') return false;
  if (key === 'geo_area') return Boolean(slot.value);
  if (
    key === 'activity' ||
    key === 'time_window' ||
    key === 'location_text'
  ) {
    if (source === 'inferred' || state === 'inferred') return false;
  }
  return Boolean(slot.value);
}

function publicActivityFromSlot(value: string | undefined): string {
  const text = cleanDisplayText(value, '');
  if (!text) return '';
  if (/(可公开|公开到发现|发布到发现|公开发起)/.test(text)) {
    return '可公开发起活动';
  }
  if (/(暂不公开|不公开|不发发现)/.test(text)) {
    return '不公开发起活动';
  }
  return '';
}

function buildSearchGoal(input: {
  message: string;
  currentGoal: string;
  fields: FieldSnapshot;
}): string {
  const raw = cleanDisplayText(input.message, '');
  const currentGoal = cleanDisplayText(input.currentGoal, '');
  const parts = Array.from(
    new Set(
      [
        input.fields.city,
        input.fields.location,
        input.fields.time,
        input.fields.activity,
        input.fields.intensity,
        input.fields.relationshipGoal,
        input.fields.candidatePreference,
        input.fields.boundary,
      ].filter(Boolean),
    ),
  );
  const suffix = parts.length ? `（已确认：${parts.join('、')}）` : '';
  return `${raw || currentGoal || '帮我找合适的人'}${suffix}`.trim();
}

function buildClarifyingQuestion(input: {
  missing: SocialAgentOpportunityClarificationField[];
  focusMissing: SocialAgentOpportunityClarificationField[];
  fields: FieldSnapshot;
  followUp: boolean;
}): string {
  const { fields, focusMissing, followUp, missing } = input;
  const labels: Record<SocialAgentOpportunityClarificationField, string> = {
    city: '城市/大致区域',
    location: '活动地点或大致区域',
    time: '时间',
    activity: '运动或见面场景',
    intensity: '运动强度',
    relationshipGoal: '想认识的人或关系目标',
    candidatePreference: '候选人偏好/理想型',
    boundary: '社交边界（公共场所、站内沟通、发送前确认）',
    strangerPolicy: '是否接受陌生人',
    publicActivity: '是否公开发起活动',
  };
  const missingText = focusMissing.map((field) => labels[field]).join('、');
  const allMissingText = missing.map((field) => labels[field]).join('、');
  const known = [
    fields.city ? `城市：${fields.city}` : '',
    fields.location ? `地点：${fields.location}` : '',
    fields.time ? `时间：${fields.time}` : '',
    fields.activity ? `场景：${fields.activity}` : '',
    fields.intensity ? `强度：${fields.intensity}` : '',
    fields.relationshipGoal ? `目标：${fields.relationshipGoal}` : '',
    fields.candidatePreference ? `偏好：${fields.candidatePreference}` : '',
    fields.boundary ? `边界：${fields.boundary}` : '',
    fields.strangerPolicy ? `陌生人策略：${fields.strangerPolicy}` : '',
    fields.publicActivity ? `公开活动：${fields.publicActivity}` : '',
  ].filter(Boolean);
  const knownText = known.length ? `我已经记下 ${known.join('，')}。` : '';
  if (followUp) {
    const prefix =
      focusMissing.length === missing.length
        ? `现在只差 ${allMissingText}`
        : `新增信息已记下，现在只差 ${allMissingText}`;
    return `${knownText}${prefix}。直接补这几项就可以；如果不确定，也可以说“由你按安全默认值处理”。`;
  }
  return `${knownText}为了只推荐安全、合适的机会，还差 ${missingText}。你可以一句话补齐，比如“青岛周末下午，青岛大学附近，轻松跑步，想认识同城周末有空、先运动再慢慢熟悉的人，只在公共场所，先站内聊，接受陌生人，可以公开发起活动”。`;
}

function extractActivity(text: string): string {
  const match = text.match(
    /(跑步|慢跑|夜跑|羽毛球|瑜伽|健身|撸铁|普拉提|徒步|户外|骑行|篮球|足球|网球|游泳|飞盘|咖啡|散步|拍照|city\s*walk|citywalk|约练|训练|低压力社交|认识新朋友|新朋友)/i,
  );
  return cleanDisplayText(match?.[1], '');
}

function extractCity(text: string): string {
  const match = text.match(
    /(青岛|北京|上海|深圳|广州|杭州|南京|成都|武汉|西安|重庆|苏州|厦门|天津|长沙|郑州|济南|宁波|合肥)/,
  );
  return sanitizeCity(match?.[1] ?? '');
}

function extractTime(text: string): string {
  const match = text.match(
    /(今晚|明天|后天|周末|工作日|上午|中午|下午|晚上|早上|午后|周[一二三四五六日天]|星期[一二三四五六日天])/,
  );
  return cleanDisplayText(match?.[1], '');
}

function extractLocation(text: string): string {
  const explicit = text.match(
    /(在|到|去|约在|地点在|附近在)?([^，。；.!?]{2,32}(大学|校区|操场|公园|球馆|体育馆|健身房|商场|广场|海边|海岸|咖啡馆|路线|河边|湖边|地铁站|附近))/i,
  );
  const value = cleanDisplayText(explicit?.[2], '');
  if (value) return value;
  if (/(附近|就近|离我近|不要太远|周边)/i.test(text)) return '附近/就近';
  return '';
}

function extractIntensity(text: string): string {
  if (/(低压力|轻松|随便|慢跑|散步|新手|不卷|别太累|轻量)/i.test(text))
    return '轻松/低压力';
  if (/(中等|正常强度|适中|配速)/i.test(text)) return '中等强度';
  if (/(高强度|冲刺|间歇|训练|进阶|认真练|强一点)/i.test(text))
    return '较高强度';
  return '';
}

function relationshipGoalSummary(
  text: string,
  preferences: ReturnType<typeof readSocialAgentTaskMemory>['preferences'],
): string {
  const explicitIdeal = text.match(
    /(理想型是|希望认识|想认识)([^，。；.!?]{2,48})(的人|朋友|搭子|伙伴|对象)?/i,
  );
  if (explicitIdeal?.[2]) {
    return cleanRelationshipGoal(explicitIdeal[2]);
  }
  const direct = text.match(
    /(帮我找|给我找|我要找|想找|希望找|找一个|找个)([^，。；.!?]{2,48})(的人|朋友|搭子|伙伴|对象)?/i,
  );
  const genericSearchGoal = direct?.[2] ? cleanRelationshipGoal(direct[2]) : '';
  if (
    genericSearchGoal &&
    /(同城.{0,8}有空|附近.{0,8}有空|周末有空|有空|愿意|慢热|开朗|外向|安静|靠谱|稳定|边界|低压力|先运动|慢慢熟悉)/i.test(
      genericSearchGoal,
    )
  ) {
    return genericSearchGoal;
  }
  if (
    genericSearchGoal &&
    /(同校|校友|同学|女生|男生|同性|同城|附近|大学|学校|校园|校区)/i.test(
      genericSearchGoal,
    )
  ) {
    return genericSearchGoal;
  }
  if (/(新朋友|认识朋友|交朋友|扩圈|社交圈)/i.test(text)) {
    return '认识新朋友';
  }
  if (
    /(运动搭子|约练搭子|跑步搭子|羽毛球搭子|篮球搭子|户外搭子|拍照搭子|健身搭子|徒步搭子|咖啡搭子|篮球.{0,6}搭子|拍照.{0,6}搭子|跑步.{0,6}搭子|户外.{0,6}搭子)/i.test(
      text,
    )
  ) {
    return '找运动搭子';
  }
  if (preferences.preferredTraits.length > 0) {
    return preferences.preferredTraits.slice(0, 3).join('、');
  }
  if (preferences.socialStyle) {
    return preferences.socialStyle === 'slow_warm'
      ? '慢热、低压力相处'
      : '更外向、愿意互动';
  }
  return '';
}

function cleanRelationshipGoal(value: string): string {
  return cleanDisplayText(value, '')
    .replace(/^(一些|一个|个)/, '')
    .replace(/^(人|朋友|搭子)一起/, '一起')
    .replace(/(的人|的朋友|的搭子|的伙伴|的对象)$/, '')
    .trim();
}

function candidatePreferenceSummary(
  text: string,
  preferences: ReturnType<typeof readSocialAgentTaskMemory>['preferences'],
  relationshipGoal: string,
): string {
  const explicitPreference = text.match(
    /(理想型是|偏好是|希望认识|想认识|更想认识|最好是|希望是)([^，。；.!?]{2,56})(的人|朋友|搭子|伙伴|对象)?/i,
  );
  if (explicitPreference?.[2]) {
    return cleanRelationshipGoal(explicitPreference[2]);
  }
  const descriptivePerson = text.match(
    /([^，。；.!?]{2,56}(同校|校友|同城|附近|周末有空|慢热|开朗|外向|安静|靠谱|稳定|低压力|先运动|慢慢熟悉|公共场所|站内聊|女生|男生|同性)[^，。；.!?]{0,32})(的人|朋友|搭子|伙伴|对象)/i,
  );
  if (descriptivePerson?.[1]) {
    return cleanRelationshipGoal(descriptivePerson[1]);
  }
  if (
    relationshipGoal &&
    !isGenericRelationshipGoal(relationshipGoal)
  ) {
    return relationshipGoal;
  }
  const activityCompanion = text.match(
    /(跑步|羽毛球|篮球|户外|健身|徒步|骑行|瑜伽|网球|游泳|拍照|咖啡|约练|运动|训练).{0,8}(搭子|伙伴|朋友)|(?:搭子|伙伴|朋友).{0,8}(跑步|羽毛球|篮球|户外|健身|徒步|骑行|瑜伽|网球|游泳|拍照|咖啡|约练|运动|训练)/i,
  );
  if (activityCompanion) {
    return `${cleanDisplayText(activityCompanion[1] ?? activityCompanion[3] ?? '运动', '')}搭子`;
  }
  if (/(认识新朋友|新朋友|交朋友|扩圈)/i.test(text)) {
    const style = /(轻松|低压力|慢热|公共场所|站内聊|周末有空|同城)/i.test(
      text,
    )
      ? '低压力新朋友'
      : '新朋友';
    return style;
  }
  if (preferences.preferredTraits.length > 0) {
    return preferences.preferredTraits.slice(0, 3).join('、');
  }
  if (preferences.socialStyle) {
    return preferences.socialStyle === 'slow_warm'
      ? '慢热、低压力相处'
      : '更外向、愿意互动';
  }
  return '';
}

function isGenericRelationshipGoal(value: string): boolean {
  const text = cleanDisplayText(value, '');
  if (!text) return false;
  return /^(认识新朋友|找运动搭子|运动搭子|约练搭子|跑步搭子|羽毛球搭子|篮球搭子|户外搭子|健身搭子|徒步搭子|拍照搭子|咖啡搭子)$/.test(
    text,
  );
}

function hasCommunicationBoundary(
  boundaries: ReturnType<typeof readSocialAgentTaskMemory>['boundaries'],
  text: string,
): boolean {
  return (
    boundaries.publicPlaceOnly ||
    boundaries.noContactExchange ||
    boundaries.noNightMeet ||
    boundaries.noAutoMessage ||
    boundaries.excludedGenders.length > 0 ||
    /(公共场所|公开场所|站内聊|先聊天|不交换|不加微信|不留电话|不要夜间|不要晚上|不要自动|先确认|发送前确认|安全边界|社交边界)/i.test(
      text,
    )
  );
}

function boundarySummary(
  boundaries: ReturnType<typeof readSocialAgentTaskMemory>['boundaries'],
  text: string,
): string {
  const parts = [
    boundaries.publicPlaceOnly || /(公共场所|公开场所)/i.test(text)
      ? '公共场所'
      : '',
    boundaries.noContactExchange ||
    /(不交换|不加微信|不留电话|站内聊)/i.test(text)
      ? '先站内沟通'
      : '',
    boundaries.noNightMeet || /(不要夜间|不要晚上|不晚上)/i.test(text)
      ? '避开夜间'
      : '',
    boundaries.noAutoMessage || /(不要自动|先确认|发送前确认)/i.test(text)
      ? '发送前确认'
      : '',
    boundaries.acceptsStrangers === true ||
    /(接受陌生人|愿意认识陌生人|可以认识陌生人)/i.test(text)
      ? '接受陌生人'
      : '',
    boundaries.acceptsStrangers === false ||
    /(不接受陌生人|不要陌生人|只推荐熟人)/i.test(text)
      ? '不接受陌生人'
      : '',
    boundaries.publicActivityAllowed === true ||
    /(可以公开发起活动|愿意公开发起活动|公开发起)/i.test(text)
      ? '可公开发起活动'
      : '',
    boundaries.publicActivityAllowed === false ||
    /(不公开发起活动|不要公开发起活动|别公开发起活动|不公开发起)/i.test(text)
      ? '不公开发起活动'
      : '',
  ].filter(Boolean);
  return parts.length ? parts.join('、') : '发送前确认';
}

function strangerPolicySummary(
  boundaries: ReturnType<typeof readSocialAgentTaskMemory>['boundaries'],
  text: string,
): string {
  if (
    boundaries.acceptsStrangers === true ||
    /(接受陌生人|愿意认识陌生人|可以认识陌生人)/i.test(text)
  ) {
    return '接受陌生人';
  }
  if (
    boundaries.acceptsStrangers === false ||
    /(不接受陌生人|不要陌生人|只推荐熟人)/i.test(text)
  ) {
    return '不接受陌生人';
  }
  return '';
}

function publicActivitySummary(
  boundaries: ReturnType<typeof readSocialAgentTaskMemory>['boundaries'],
  text: string,
): string {
  if (
    boundaries.publicActivityAllowed === false ||
    /(不公开发起活动|不要公开发起活动|别公开发起活动|不公开发起)/i.test(text)
  ) {
    return '不公开发起活动';
  }
  if (
    boundaries.publicActivityAllowed === true ||
    /(可以公开发起活动|愿意公开发起活动|公开发起)/i.test(text)
  ) {
    return '可公开发起活动';
  }
  return '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isClarificationField(
  value: string,
): value is SocialAgentOpportunityClarificationField {
  return [
    'city',
    'location',
    'time',
    'activity',
    'intensity',
    'relationshipGoal',
    'candidatePreference',
    'boundary',
    'strangerPolicy',
    'publicActivity',
  ].includes(value);
}
