import type {
  FitMeetAgentThreadBranchSnapshot,
  FitMeetAgentThreadSummary,
  SocialAgentPermissionMode,
  SocialCodexReplayPackage,
  UserFacingAgentProgressEvent,
  UserFacingAgentResponse,
  UserFacingAgentSessionSnapshot,
} from '../../api/socialAgentApi';
import type { AgentCheckpointSummary } from '../../api/agentApprovalsApi';
import type { FitMeetAssistantRecovery } from './FitMeetAssistantUI.types';
import type {
  AgentConversationIntent,
  AgentMessageBranchState,
  AgentThreadMessage,
  AgentThreadSnapshot,
  Step,
} from './socialAgentThreadStore';
import type { AgentError, AgentStreamEvent } from './api';
import { isGenericSocialCodexProcessTitle } from '../../lib/socialCodexProcessCopy';
import {
  socialCodexThreadIdForTask,
  socialCodexThreadIdOrExisting,
} from './socialCodexThreadId';
import { agentCardDedupKeys } from './agentCardIdentity';
import { reduceSingleRunAssistantMessages } from './agentAssistantMessageReducer';

type StepState = Step['status'];

const AGENT_THREAD_STORAGE_KEY = 'fitmeet-agent-thread';
const AGENT_THREAD_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RECOVERY_TITLE = '这段需求还在';
const DEFAULT_RECOVERY_MESSAGE = '可以继续处理，我会从这里接着处理；也可以补充新的要求。';

export const technicalPublicTextPattern = new RegExp(
  [
    `\\b(${[
      ['trace', 'Id'].join(''),
      ['agent', 'Trace'].join(''),
      ['structured', 'Intent'].join(''),
      ['plan', 'ner'].join(''),
      'tool\\s*call',
      ['tool', 'Call'].join(''),
      ['tool', 'Calls'].join(''),
      ['Deep', 'Seek'].join(''),
      ['Open', 'AI'].join(''),
      ['raw', '\\s+', 'JSON'].join(''),
      'stack',
    ].join('|')})\\b`,
    ['Life', 'Graph', 'Agent'].join('\\s+'),
    ['Social', 'Match', 'Agent'].join('\\s+'),
    ['Meet', 'Loop', 'Agent'].join('\\s+'),
    '工具调用|数据库字段|错误堆栈|原始目标|从已保存的步骤继续|从已保存的工具步骤|从已保存的 Agent 状态|继续刚才保存的 Agent 步骤',
  ].join('|'),
  'i',
);

export const conversationSteps: Step[] = [
  { id: 'understand', label: '正在理解你的问题', status: 'pending' },
  { id: 'respond', label: '正在组织自然回复', status: 'pending' },
  { id: 'safety_filter', label: '正在检查必要边界', status: 'pending' },
];

export const socialSteps: Step[] = [
  { id: 'understand', label: '正在理解你的需求', status: 'pending' },
  { id: 'profile', label: '正在结合上下文', status: 'pending' },
  { id: 'search', label: '正在查找合适的信息', status: 'pending' },
  { id: 'rank', label: '正在整理可行选项', status: 'pending' },
  { id: 'safety_filter', label: '正在检查必要边界', status: 'pending' },
  { id: 'approval', label: '需要你确认后继续', status: 'pending' },
];

export function agentThreadStorageKey(userId?: number | string | null) {
  return `${AGENT_THREAD_STORAGE_KEY}:${userId ?? 'current'}`;
}

export function readStoredAgentThread(userId?: number | string | null): AgentThreadSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(agentThreadStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AgentThreadSnapshot>;
    if (!Array.isArray(parsed.messages) || typeof parsed.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > AGENT_THREAD_MAX_AGE_MS) return null;
    const messages = parsed.messages
      .filter(isAgentThreadMessage)
      .map(sanitizeStoredThreadMessage)
      .filter((message): message is AgentThreadMessage => Boolean(message));
    const userResult = isUserFacingAgentResponse(parsed.userResult)
      ? sanitizeRestoredResponse(parsed.userResult)
      : null;
    const activeTaskId = numberFromUnknown(parsed.activeTaskId);
    return {
      activeTaskId: numberFromUnknown(parsed.activeTaskId),
      activeThreadId: socialCodexThreadIdOrExisting(
        stringFromUnknown(parsed.activeThreadId),
        activeTaskId,
      ),
      messages,
      userResult,
      mode: isPermissionMode(parsed.mode) ? parsed.mode : 'limited_auto',
      branchSelections: sanitizeBranchSelections(parsed.branchSelections),
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function writeStoredAgentThread(
  userId: number | string | null | undefined,
  snapshot: Omit<AgentThreadSnapshot, 'savedAt'>,
) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      agentThreadStorageKey(userId),
      JSON.stringify({ ...snapshot, savedAt: Date.now() }),
    );
  } catch {
    // Local recovery is best-effort; server restore remains the source of truth.
  }
}

export function clearStoredAgentThread(userId?: number | string | null) {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(agentThreadStorageKey(userId));
}

export function sanitizeBranchSelections(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, raw]) => [key.trim(), Number(raw)] as const)
      .filter(
        ([key, index]) =>
          key.length > 0 && Number.isFinite(index) && Number.isInteger(index) && index > 0,
      ),
  );
}

export function isAgentThreadMessage(value: unknown): value is AgentThreadMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<AgentThreadMessage>;
  return (
    typeof message.id === 'string' &&
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string' &&
    (!message.result || isUserFacingAgentResponse(message.result))
  );
}

export function sanitizeStoredThreadMessage(message: AgentThreadMessage): AgentThreadMessage | null {
  if (message.role === 'user') {
    const content = publicText(message.content, '');
    return content ? { ...message, content, result: null } : null;
  }
  const result = message.result ? sanitizeRestoredResponse(message.result) : null;
  const content = publicText(message.content, result?.assistantMessage ?? '');
  const hasUsefulResult = Boolean(result && restoredResponseHasUsefulSurface(result));
  const nonBranchableSourced =
    isNonBranchableAssistantSource(message.assistantMessageSource) ||
    isNonBranchableAssistantSource(result?.assistantMessageSource);
  const isGenericRecovery =
    isGenericRecoveryAssistantText(message.content) ||
    isGenericRecoveryAssistantText(content) ||
    technicalPublicTextPattern.test(String(message.content ?? ''));
  if (isGenericRecovery && !hasUsefulResult) return null;
  if (!content && !hasUsefulResult) return null;
  return {
    ...message,
    content: isGenericRecovery ? '' : content || '我可以继续上次的话题，也可以重新开始。',
    result: hasUsefulResult ? result : null,
    conversationIntent: hasUsefulResult
      ? intentForRestoredResponse(result as UserFacingAgentResponse, 'conversation')
      : 'conversation',
    showSocialResult: hasUsefulResult
      ? intentForRestoredResponse(result as UserFacingAgentResponse, 'conversation') !==
        'conversation'
      : false,
    surfaceKind: isGenericRecovery ? 'recovery' : 'answer',
    assistantMessageSource: message.assistantMessageSource ?? result?.assistantMessageSource,
    branchable: !isGenericRecovery && !nonBranchableSourced,
  };
}

export function isUserFacingAgentResponse(value: unknown): value is UserFacingAgentResponse {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<UserFacingAgentResponse>;
  return (
    typeof result.assistantMessage === 'string' &&
    typeof result.lightStatus === 'string' &&
    Array.isArray(result.cards) &&
    Boolean(result.safeStatus) &&
    Array.isArray(result.pendingConfirmations)
  );
}

export function isPermissionMode(value: unknown): value is SocialAgentPermissionMode {
  return (
    value === 'assist' ||
    value === 'confirm' ||
    value === 'manual_confirm' ||
    value === 'limited_auto' ||
    value === 'open' ||
    value === 'lab'
  );
}

export function isSocialActionIntent(text: string) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  if (
    /(不想|不用|不要|不需要|不是|先不|暂时不).{0,8}(交友|找人|约练|搭子|匹配|推荐人|活动|加好友|邀请)/.test(
      normalized,
    )
  ) {
    return false;
  }
  if (
    /(找回|查找|找一下|找找|帮我找|给我找|想找).{0,18}(聊天记录|消息记录|历史消息|历史会话|会话|密码|账号|设置|页面|入口|资料|个人资料|人物画像|画像|文件|订单|帮助|说明|客服|教程|规则|隐私政策|协议|账单|发票)/.test(
      normalized,
    )
  ) {
    return false;
  }
  if (
    /(怎么|如何|流程|是什么|为什么|能不能|可以吗|应该).{0,18}(找人|搭子|约练|匹配|推荐|活动|交友|发消息|邀请|加好友|报名|参加|发起|创建|认识.{0,6}(新朋友|朋友|人))/.test(
      normalized,
    ) ||
    /(有没有|是否有|支持|可以|能不能|能否).{0,18}(找人|搭子|约练|匹配|推荐|活动|交友|发消息|邀请|加好友|报名|参加|发起|创建).{0,12}(功能|入口|页面|流程|规则|说明|介绍|怎么用|如何用|能力)/.test(
      normalized,
    ) ||
    /(活动.*(怎么参加|如何参加|报名流程|参与流程)|邀请.*流程|加好友.*流程|新用户.*怎么.*(找人|找搭子|约练)|创建活动.*(先|需要).*画像)/.test(
      normalized,
    )
  ) {
    return false;
  }
  if (
    /(我)?(适合|应该|建议|更适合|比较适合|可以).{0,12}(认识|找|交往|接触|推荐).{0,16}(什么样|哪类|哪种|怎样|什么类型|类型).{0,12}(人|朋友|搭子|对象)|((想认识|想找|想交往|推荐).{0,12}(什么样|哪类|哪种|怎样|什么类型|类型).{0,12}(人|朋友|搭子|对象).{0,12}(适合|合适|更好|靠谱))|(推荐|分析|判断).{0,12}(适合我|我的|我适合).{0,18}(人|朋友|搭子|对象|类型|理想型)|(理想型|择友偏好|交友偏好).{0,16}(分析|建议|是什么|怎么判断|什么样)/.test(
      normalized,
    )
  ) {
    return false;
  }
  if (
    /(帮我找|给我找|想找|我要找|我想认识|想认识|低压力社交|找一个|找个|找人|找.{0,48}(女生|男生|女性|男性|人|搭子|伙伴|朋友|用户|候选|活动|局|约练)|约练|约跑|约球|认识.{0,16}(朋友|人|搭子)|推荐.{0,16}(用户|朋友|人|搭子|候选|活动|局|约练)|搜索.{0,16}(用户|朋友|人|搭子|候选|活动|局|约练)|匹配.{0,16}(用户|朋友|人|搭子|候选)|附近.{0,16}(用户|朋友|人|搭子|活动)|同城.{0,16}(用户|朋友|人|搭子|活动)|真实用户|约练用户|户外搭子|篮球搭子|约练搭子|一起.{0,16}(咖啡|拍照|跑步|健身|羽毛球|网球|篮球|徒步|户外|骑行|运动|训练)|周末.{0,16}(咖啡|拍照|跑步|健身|羽毛球|网球|篮球|徒步|户外|骑行|运动|训练)|参加.{0,8}(活动|约练)|发起.{0,8}(活动|约练)|加好友|发邀请|线下见面|线下活动)/.test(
      normalized,
    )
  ) {
    return true;
  }
  if (
    /((有没有|有无|筛一下|筛选|优先|最好|只要|更想|换成|找找).{0,18}(女生|男生|女性|男性|女的|男的|舞蹈|舞蹈生|编程|程序员|科技|摄影|音乐|读书|学生|同校|附近|同城))|^(女生|男生|女性|男性|女的|男的|舞蹈生|喜欢编程|会编程|附近的|同城的)[。.!！\s]*$/.test(
      normalized,
    )
  ) {
    return true;
  }
  const hasActivity =
    /(散步|跑步|羽毛球|篮球|健身|徒步|爬山|骑行|游泳|瑜伽|飞盘|网球|乒乓|咖啡|吃饭|电影|city\s*walk|citywalk)/i.test(
      normalized,
    );
  const hasTime =
    /(周末|今天|明天|后天|今晚|上午|下午|晚上|中午|早上|[0-9一二三四五六七八九十]+点)/i.test(
      normalized,
    );
  const hasPlace =
    /(附近|大学|公园|商场|体育馆|健身房|校区|区|市|青岛|上海|北京|深圳|广州|杭州|成都|武汉|南京)/i.test(
      normalized,
    );
  return hasActivity && hasTime && hasPlace;
}

export function stepsForPrompt(prompt: string) {
  return isSocialActionIntent(prompt) ? socialSteps : conversationSteps;
}

export function intentForPrompt(prompt: string): AgentConversationIntent {
  return isSocialActionIntent(prompt) ? 'social' : 'conversation';
}

export function cancelsOpportunityClarification(prompt: string) {
  return /(取消|先不找|不找了|不用找|暂停|算了)/i.test(prompt.trim());
}

export function continuesOpportunityClarification(prompt: string) {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized || cancelsOpportunityClarification(normalized)) return false;
  if (intentForPrompt(normalized) === 'social') return true;
  if (
    /(为什么|怎么|如何|功能|入口|设置|客服|找回|聊天记录|历史消息|隐私政策|规则|说明|你是不是|没懂|什么意思|解释一下|介绍一下)/.test(
      normalized,
    )
  ) {
    return false;
  }
  if (
    /^((可以|好|好的|嗯|行|那就)[，。！？\s]*(帮我)?(看看|看下|看一下|试试|继续|开始吧?)|(继续|开始|开始吧|试试|看一下|看看|帮我看看|帮我看下|那就看看|那就试试|可以看看|可以看下)[，。！？\s]*(吧|一下|看看|继续)?)$/i.test(
      normalized,
    )
  ) {
    return true;
  }
  const hasTime =
    /(今天|今晚|明天|后天|周末|下午|晚上|早上|上午|中午|工作日|周[一二三四五六日天])/.test(
      normalized,
    );
  const hasActivity =
    /(散步|跑步|健身|羽毛球|篮球|网球|瑜伽|徒步|户外|骑行|city\s*walk|citywalk|咖啡|拍照|训练|约练|运动)/.test(
      normalized,
    );
  const hasLocation =
    /(附近|大学|公园|校区|商场|广场|海边|地铁|路|街|区|市|青岛|崂山|市南|市北|李沧|黄岛)/.test(
      normalized,
    );
  const hasBoundaryOrPreference =
    /(公共场所|公开|不公开|站内聊|女生|男生|舞蹈|舞蹈生|同校|同城|低强度|高强度|安全|接受陌生人|不接受陌生人)/.test(
      normalized,
    );
  return [hasTime, hasActivity, hasLocation, hasBoundaryOrPreference].filter(Boolean)
    .length > 0;
}

export function responseAwaitsOpportunityClarification(response: UserFacingAgentResponse) {
  return (
    response.cards.length === 0 &&
    /为了只推荐安全、合适的机会|还差.{0,24}(城市|时间|运动强度|社交边界)/.test(
      response.assistantMessage,
    )
  );
}

export function shouldRestoreReplayTrace(
  replay: SocialCodexReplayPackage,
  intent: AgentConversationIntent,
) {
  if (hasReplayApprovalSignal(replay)) return true;
  if (hasReplaySocialProgressSignal(replay)) return true;
  if (intent !== 'conversation') return hasReplayVisibleSummary(replay) || replay.events.length > 0;
  return false;
}

export function intentForReplayTrace(
  replay: SocialCodexReplayPackage,
  fallback: AgentConversationIntent,
): AgentConversationIntent {
  if (replay.pendingApproval || replay.events.some((event) => event.type.startsWith('approval.'))) {
    return 'approval';
  }
  if (replay.summary?.pendingApproval) return 'approval';
  if (isSocialReplayStage(replay.summary?.currentStage)) return 'social';
  if (
    replay.events.some((event) =>
      /^(slot\.|candidate_search\.|opportunity_card\.created|safety_check\.done|memory\.saved)/.test(
        event.type,
      ),
    )
  ) {
    return 'social';
  }
  return fallback;
}

function hasReplayVisibleSummary(replay: SocialCodexReplayPackage) {
  const title = replay.summary?.title;
  if (typeof title !== 'string' || title.trim().length === 0) return false;
  if (isInternalReplaySummaryTitle(title) || isGenericSocialCodexProcessTitle(title)) {
    return hasReplayApprovalSignal(replay) || hasReplaySocialProgressSignal(replay);
  }
  return true;
}

function hasReplayApprovalSignal(replay: SocialCodexReplayPackage) {
  return (
    replay.pendingApproval ||
    Boolean(replay.summary?.pendingApproval) ||
    replay.events.some((event) => event.type.startsWith('approval.'))
  );
}

function hasReplaySocialProgressSignal(replay: SocialCodexReplayPackage) {
  const summary = replay.summary;
  return (
    isSocialReplayStage(summary?.currentStage) ||
    Boolean(summary?.hasOpportunityCard) ||
    Boolean(summary?.savedMemory) ||
    Boolean((summary?.candidateCount ?? 0) > 0) ||
    Boolean((summary?.activityCount ?? 0) > 0) ||
    replay.events.some((event) => {
      if (isSocialReplayStage(event.stage)) return true;
      return /^(slot\.|candidate_search\.|opportunity_card\.created|safety_check\.done|memory\.saved)/.test(
        event.type,
      );
    })
  );
}

function isInternalReplaySummaryTitle(title: string) {
  return /^[a-z][a-z0-9_.:-]*$/i.test(title.trim()) && title.includes('_');
}

function isSocialReplayStage(stage: unknown) {
  return (
    typeof stage === 'string' &&
    /^(profile_gate|slot_filling|create_opportunity_card|publish_to_discover|search_candidates|safety_filter|rank_candidates|generate_opener|approval|send_invite|life_graph_writeback)$/i.test(
      stage,
    )
  );
}

export function responseRequiresApproval(response: UserFacingAgentResponse) {
  return (
    response.safeStatus.blocked ||
    response.pendingConfirmations.length > 0 ||
    response.cards.some(isApprovalCard)
  );
}

export function intentForResponse(
  response: UserFacingAgentResponse,
  fallback: AgentConversationIntent,
): AgentConversationIntent {
  if (responseRequiresApproval(response)) return 'approval';
  return fallback;
}

export function intentForRestoredResponse(
  response: UserFacingAgentResponse,
  fallback: AgentConversationIntent,
): AgentConversationIntent {
  if (responseRequiresApproval(response)) return 'approval';
  const hasSocialSurface = response.cards.some(isSocialSurfaceCard);
  return hasSocialSurface ? 'social' : fallback;
}

export function sanitizeRestoredResponse(response: UserFacingAgentResponse): UserFacingAgentResponse {
  if (
    isFallbackAssistantResponse(response) &&
    isGenericRecoveryAssistantText(response.assistantMessage) &&
    (response.cards.some(isSocialSurfaceCard) ||
      response.pendingConfirmations.length > 0 ||
      response.safeStatus.blocked)
  ) {
    return {
      ...response,
      assistantMessage: '',
      assistantMessageSource: response.assistantMessageSource ?? 'fallback',
      lightStatus: '已整理回复',
    };
  }
  if (!isGenericCheckpointResponse(response)) return response;
  return {
    ...response,
    assistantMessageSource: response.assistantMessageSource ?? 'fallback',
    assistantMessage: '我可以继续上次的话题，也可以重新开始。',
    lightStatus: '已整理回复',
    cards: [],
    pendingConfirmations: [],
    safeStatus: {
      ...response.safeStatus,
      blocked: false,
      requiredConfirmations: [],
    },
  };
}

export function restoredResponseHasUsefulSurface(response: UserFacingAgentResponse) {
  const text = publicText(response.assistantMessage, '').trim();
  return (
    (Boolean(text) && !isGenericRecoveryAssistantText(text)) ||
    response.cards.some(isSocialSurfaceCard) ||
    response.pendingConfirmations.length > 0 ||
    response.safeStatus.blocked
  );
}

export function isGenericRecoveryAssistantText(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) return false;
  return genericRecoveryAssistantPattern().test(text);
}

export function isNonAnswerFallbackResponse(response: UserFacingAgentResponse) {
  const assistantMessage = String(response.assistantMessage ?? '').trim();
  return (
    (Boolean(response.recoveryNotice) ||
      isGenericRecoveryAssistantText(response.assistantMessage) ||
      (assistantMessage.length === 0 && isFallbackAssistantResponse(response))) &&
    !responseHasCheckpointRuntime(response) &&
    !response.cards.some(isSocialSurfaceCard) &&
    response.pendingConfirmations.length === 0 &&
    !response.safeStatus.blocked
  );
}

export function assistantMessageForUserFacingResult(
  response: UserFacingAgentResponse,
  fallback: string,
) {
  const text = publicText(response.assistantMessage, '').trim();
  if (
    response.workflow?.state === 'RECOVERY' &&
    (isFallbackAssistantResponse(response) || isGenericRecoveryAssistantText(text))
  ) {
    return response.workflow.recoveryMessage || '我保留了这段需求，可以从这里继续。';
  }
  if (isFallbackAssistantResponse(response) && isGenericRecoveryAssistantText(text)) {
    if (responseRequiresApproval(response)) {
      return '我把需要你确认的内容放在下面，确认前不会执行真实动作。';
    }
    if (response.cards.some(isSocialSurfaceCard)) {
      return '我把整理好的结果放在下面，你可以查看后再决定下一步。';
    }
  }
  return text || fallback;
}

export function responseHasCheckpointRuntime(response: UserFacingAgentResponse) {
  return response.workflow?.state === 'RECOVERY';
}

export function recoveryFromUserFacingResponse(
  response: UserFacingAgentResponse,
  prompt: string,
): FitMeetAssistantRecovery {
  const notice = response.recoveryNotice;
  const title = publicText(notice?.title, '').trim();
  const safeTitle =
    title && !isGenericRecoveryTitle(title) ? title : DEFAULT_RECOVERY_TITLE;
  const message = publicText(notice?.message, '').trim();
  const safeMessage =
    message && !isGenericRecoveryNoticeMessage(message)
      ? message
      : DEFAULT_RECOVERY_MESSAGE;
  return {
    kind: notice?.kind === 'checkpoint' ? 'checkpoint_available' : 'failed',
    title: safeTitle,
    message: safeMessage,
    prompt,
    retryable: notice?.retryable ?? true,
  };
}

function isGenericRecoveryTitle(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) return false;
  return genericRecoveryTitlePattern().test(text);
}

function isGenericRecoveryNoticeMessage(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) return false;
  return genericRecoveryNoticeMessagePattern().test(text);
}

function phrasePattern(parts: string[][], flags = '') {
  return new RegExp(parts.map((item) => item.join('')).join('|'), flags);
}

function genericRecoveryAssistantPattern() {
  return phrasePattern([
    ['这次', '处理', '没有', '完成'],
    ['这一步', '没有', '完成'],
    ['保留', '当前', '(?:对话|方向|上下文|需求)'],
    ['这段', '需求', '还在'],
    ['刚才', '的位置'],
    ['稍后', '继续'],
    ['稍后', '再试'],
    ['可以', '稍后', '再试'],
    ['我已经', '恢复了', '(?:上一次|这段|当前)'],
    ['我已经', '恢复了这段', '(?:对话|约练任务|任务)'],
    ['我可以', '继续上次的话题', '，也可以', '重新开始'],
    ['暂时', '没有', '顺利', '完成'],
    ['连接', '中断'],
    ['连接', '恢复'],
    ['处理', '时间', '有点久'],
    ['从已保存的', '(?:步骤|工具步骤|Agent 状态)'],
    ['继续', '刚才', '保存的 Agent ', '步骤'],
    ['原始', '目标'],
  ]);
}

function genericRecoveryTitlePattern() {
  return phrasePattern(
    [
      ['^(', '这次', '处理', '没有', '完成', ')$'],
      ['^(', '这一步', '没有', '完成', ')$'],
      ['^(', '这次', '没有', '顺利', '完成', ')$'],
      ['^(', '暂时', '没有', '顺利', '完成', ')$'],
      ['^(', '这次', '处理', '时间', '有点久', ')$'],
      ['^(', '处理', '时间', '有点久', ')$'],
      ['^(', '处理', '失败', ')$'],
      ['^(run failed)$'],
    ],
    'i',
  );
}

function genericRecoveryNoticeMessagePattern() {
  return phrasePattern(
    [
      ['这次', '处理', '没有', '完成'],
      ['这一步', '没有', '完成'],
      ['暂时', '没有', '顺利', '完成'],
      ['这次', '处理', '时间', '有点久'],
      ['处理', '时间', '有点久'],
      ['保留', '当前', '对话'],
      ['稍后', '再试'],
      ['可以', '稍后', '再试'],
      ['服务', '暂时', '不可用'],
      ['FitMeet Agent'],
    ],
    'i',
  );
}

export function isFallbackAssistantResponse(
  response: UserFacingAgentResponse | null | undefined,
) {
  return response?.assistantMessageSource === 'fallback';
}

export function isFallbackAssistantMessage(message: AgentThreadMessage) {
  return (
    message.assistantMessageSource === 'fallback' ||
    isFallbackAssistantResponse(message.result ?? null)
  );
}

export function isNonBranchableAssistantSource(value: unknown) {
  return (
    value === 'fallback' ||
    value === 'deterministic_route' ||
    value === 'deterministic_action'
  );
}

export function isDeterministicAssistantMessage(message: AgentThreadMessage) {
  return (
    message.assistantMessageSource === 'deterministic_route' ||
    message.assistantMessageSource === 'deterministic_action'
  );
}

export function isBranchableAssistantMessage(message: AgentThreadMessage) {
  return (
    message.role === 'assistant' &&
    message.branchable !== false &&
    !isFallbackAssistantMessage(message) &&
    !isDeterministicAssistantMessage(message) &&
    (message.surfaceKind === undefined || message.surfaceKind === 'answer')
  );
}

export function isGenericCheckpointResponse(response: UserFacingAgentResponse) {
  const assistantMessage = String(response.assistantMessage ?? '');
  const technical = technicalPublicTextPattern.test(assistantMessage);
  const genericGoal =
    /原始目标[：:]\s*(你有什么功能|有什么功能|能做什么|会做什么|可以做什么|怎么用|如何使用|怎么使用|使用说明|功能咨询|普通聊天|为什么|怎么回事|我的记忆|记忆.*没|上下文.*没|隐私|安全吗|安全性|数据)/i.test(
      assistantMessage,
    );
  const hasUsefulCards = response.cards.some(isSocialSurfaceCard);
  if (hasUsefulCards) return false;
  return technical || genericGoal;
}

export function isApprovalCard(card: { type?: string; schemaType?: string; data?: unknown }) {
  const schemaType = socialSurfaceSchemaType(card);
  return (
    card.type === 'opener_approval' ||
    card.type === 'safety_boundary' ||
    schemaType === 'safety.approval'
  );
}

export function isSocialSurfaceCard(card: { type?: string; schemaType?: string; data?: unknown }) {
  const schemaType = socialSurfaceSchemaType(card);
  return (
    card.type === 'candidate_card' ||
    card.type === 'activity_plan' ||
    card.type === 'activity_status' ||
    card.type === 'checkin_card' ||
    card.type === 'review_card' ||
    schemaType === 'social_match.candidate' ||
    schemaType === 'social_match.activity' ||
    schemaType === 'social_match.empty' ||
    schemaType === 'meet_loop.timeline' ||
    schemaType === 'life_graph.diff' ||
    isApprovalCard(card)
  );
}

function socialSurfaceSchemaType(card: { schemaType?: string; data?: unknown }) {
  const data = isRecord(card.data) ? card.data : {};
  return stringFromUnknown(card.schemaType) || stringFromUnknown(data.schemaType);
}

export function resolveIntentFromStreamEvent(event: AgentStreamEvent) {
  if (event.type === 'approval_required') return 'approval';
  if (event.type === 'progress' && isApprovalProgressEvent(event)) return 'approval';
  if (event.type === 'progress') {
    const surfaceIntent =
      typeof event.metadata?.surfaceIntent === 'string' ? event.metadata.surfaceIntent : null;
    if (surfaceIntent === 'approval') return 'approval';
    if (surfaceIntent === 'social') return 'social';
  }
  return null;
}

export function shouldAttachVisibleProcessToMessage(event: AgentStreamEvent) {
  if (event.type !== 'progress') return false;
  const processType =
    typeof event.metadata?.processType === 'string' ? event.metadata.processType : null;
  if (!processType || processType === 'run') return false;
  return true;
}

export function isApprovalProgressEvent(event: AgentStreamEvent) {
  if (event.type !== 'progress') return false;
  const metadata = event.metadata;
  if (!metadata || typeof metadata !== 'object') return false;
  return Boolean(
    'approvalId' in metadata ||
    'actionType' in metadata ||
    metadata.riskLevel ||
    metadata.kind === 'approval_required',
  );
}

export function findTaskId(result: UserFacingAgentResponse | null): number | null {
  if (!result) return null;
  const fromResponse = numberFromUnknown(result.taskId);
  if (fromResponse) return fromResponse;
  for (const card of result.cards) {
    const fromData = numberFromUnknown(card.data.taskId);
    if (fromData) return fromData;
    for (const action of card.actions) {
      const fromPayload = numberFromUnknown(action.payload?.taskId);
      if (fromPayload) return fromPayload;
    }
  }
  return null;
}

export function threadIdFromResponse(response: UserFacingAgentResponse | null): string | null {
  if (!response) return null;
  const taskId = findTaskId(response);
  for (const card of response.cards) {
    const cardTaskId = numberFromUnknown(card.data.taskId) ?? taskId;
    const fromData = socialCodexThreadIdOrExisting(
      stringFromUnknown(card.data.threadId),
      cardTaskId,
    );
    if (fromData) return fromData;
    for (const action of card.actions) {
      const actionTaskId = numberFromUnknown(action.payload?.taskId) ?? cardTaskId;
      const fromPayload = socialCodexThreadIdOrExisting(
        stringFromUnknown(action.payload?.threadId),
        actionTaskId,
      );
      if (fromPayload) return fromPayload;
    }
  }
  return socialCodexThreadIdForTask(taskId);
}

export function responseFromSessionSnapshot(
  snapshot: UserFacingAgentSessionSnapshot | null | undefined,
): UserFacingAgentResponse | null {
  if (!snapshot) return null;
  if (isUserFacingAgentResponse(snapshot.result)) return snapshot.result;
  const latestRunResult =
    snapshot.latestRun && typeof snapshot.latestRun === 'object'
      ? (snapshot.latestRun as { result?: unknown }).result
      : null;
  if (isUserFacingAgentResponse(latestRunResult)) return latestRunResult;
  const eventResult = snapshot.events
    ?.map((event) => (event.type === 'result' ? event.result : null))
    .find(isUserFacingAgentResponse);
  return eventResult ?? null;
}

export function messagesFromSessionSnapshot(
  snapshot: UserFacingAgentSessionSnapshot,
  restored: UserFacingAgentResponse | null,
  taskId: number | null,
): AgentThreadMessage[] {
  const sanitizedRestored = restored ? sanitizeRestoredResponse(restored) : null;
  const restoredMessages = snapshot.messages
    .map((item, index) => sessionMessageToThreadMessage(item, index, taskId))
    .filter((message): message is AgentThreadMessage => Boolean(message));
  if (!sanitizedRestored) return reduceSingleRunAssistantMessages(restoredMessages);
  const hasUsefulRestored = restoredResponseHasUsefulSurface(sanitizedRestored);
  if (!hasUsefulRestored) return reduceSingleRunAssistantMessages(restoredMessages);
  const lastIntent =
    [...restoredMessages].reverse().find((message) => message.conversationIntent)
      ?.conversationIntent ?? 'conversation';
  const resultMessageIndex = findRestoredResultMessageIndex(
    restoredMessages,
    sanitizedRestored,
  );
  const resultIntent = intentForRestoredResponse(sanitizedRestored, lastIntent);
  const showSocialResult = resultIntent === 'social' || resultIntent === 'approval';
  if (resultMessageIndex >= 0) {
    return reduceSingleRunAssistantMessages(
      restoredMessages.map((message, index) =>
        index === resultMessageIndex && message.role === 'assistant'
          ? {
              ...message,
              result: restoredResponseHasUsefulSurface(sanitizedRestored) ? sanitizedRestored : null,
              taskId,
              conversationIntent: resultIntent,
              showSocialResult,
              surfaceKind: isGenericRecoveryAssistantText(message.content) ? 'recovery' : 'answer',
              assistantMessageSource: sanitizedRestored.assistantMessageSource,
              branchable:
                !isGenericRecoveryAssistantText(message.content) &&
                !isNonBranchableAssistantSource(sanitizedRestored.assistantMessageSource),
            }
          : message,
      ),
    );
  }
  const restoredIsGeneric =
    isGenericRecoveryAssistantText(restored?.assistantMessage) ||
    isGenericRecoveryAssistantText(sanitizedRestored.assistantMessage);
  return reduceSingleRunAssistantMessages([
    ...restoredMessages,
    {
      id: `task-${taskId ?? 'latest'}-result`,
      role: 'assistant',
      content: restoredIsGeneric
        ? ''
        : publicText(sanitizedRestored.assistantMessage, '我已经恢复了这段对话。'),
      status: 'done',
      result: sanitizedRestored,
      taskId,
      conversationIntent: resultIntent,
      showSocialResult,
      surfaceKind: restoredIsGeneric ? 'recovery' : 'answer',
      assistantMessageSource: sanitizedRestored.assistantMessageSource,
      branchable:
        !restoredIsGeneric &&
        !isNonBranchableAssistantSource(sanitizedRestored.assistantMessageSource),
    },
  ]);
}

export function sessionMessageToThreadMessage(
  item: Record<string, unknown>,
  index: number,
  taskId: number | null,
): AgentThreadMessage | null {
  const roleCandidate = stringFromUnknown(item.role || item.sender || item.author);
  const role =
    roleCandidate === 'assistant' ? 'assistant' : roleCandidate === 'user' ? 'user' : null;
  if (!role) return null;
  const embeddedResult = isUserFacingAgentResponse(item.result)
    ? sanitizeRestoredResponse(item.result)
    : null;
  const content = publicText(item.content ?? item.message ?? item.text ?? item.body, '');
  const hasUsefulEmbeddedResult = Boolean(
    embeddedResult && restoredResponseHasUsefulSurface(embeddedResult),
  );
  if (!content && !hasUsefulEmbeddedResult) return null;
  if (role === 'assistant' && isGenericRecoveryAssistantText(content)) return null;
  const runtime = isRecord(item.runtime) ? item.runtime : null;
  const assistantSource =
    role === 'assistant'
      ? assistantMessageSourceFromUnknown(
          item.assistantMessageSource ?? item.messageSource ?? item.source,
        ) ?? embeddedResult?.assistantMessageSource
      : undefined;
  const conversationIntent =
    role === 'user'
      ? intentForPrompt(content)
      : embeddedResult
        ? intentForRestoredResponse(embeddedResult, 'conversation')
        : 'conversation';
  return {
    id: stringFromUnknown(item.id) || `task-${taskId ?? 'latest'}-${index}`,
    role,
    content:
      content ||
      publicText(embeddedResult?.assistantMessage, '我可以继续上次的话题，也可以重新开始。'),
    status: 'done',
    taskId,
    runId: stringFromUnknown(item.runId) || stringFromUnknown(runtime?.runId) || null,
    messageId:
      stringFromUnknown(item.messageId) || stringFromUnknown(runtime?.messageId) || null,
    result: hasUsefulEmbeddedResult ? embeddedResult : null,
    conversationIntent,
    showSocialResult:
      role === 'assistant' &&
      hasUsefulEmbeddedResult &&
      conversationIntent !== 'conversation',
    surfaceKind: role === 'assistant' ? 'answer' : undefined,
    assistantMessageSource: assistantSource,
    branchable:
      role === 'assistant'
        ? !isNonBranchableAssistantSource(assistantSource) &&
          !isNonBranchableAssistantSource(embeddedResult?.assistantMessageSource)
        : undefined,
  };
}

function findRestoredResultMessageIndex(
  messages: AgentThreadMessage[],
  result: UserFacingAgentResponse,
) {
  const resultKeys = restoredResultKeys(result);
  const resultText = normalizeComparableAssistantText(result.assistantMessage);
  return messages.findIndex((message) => {
    if (message.role !== 'assistant') return false;
    const messageKeys = restoredMessageKeys(message);
    if (sharesAnyKey(resultKeys, messageKeys)) return true;
    const messageText = normalizeComparableAssistantText(message.content);
    if (!resultText || !messageText) return false;
    if (messageText === resultText) return true;
    const minComparableLength = 24;
    return (
      messageText.length >= minComparableLength &&
      resultText.length >= minComparableLength &&
      (messageText.includes(resultText) || resultText.includes(messageText))
    );
  });
}

function restoredMessageKeys(message: AgentThreadMessage) {
  const keys = new Set<string>();
  addKey(keys, 'run', message.runId);
  addKey(keys, 'message', message.messageId);
  if (message.result) {
    for (const key of restoredResultKeys(message.result)) keys.add(key);
  }
  return keys;
}

function restoredResultKeys(result: UserFacingAgentResponse) {
  const keys = new Set<string>();
  addKey(keys, 'workflow', result.workflow?.workflowId);
  addKey(keys, 'workflow-state', result.workflow?.state);
  for (const confirmation of result.pendingConfirmations) {
    addKey(keys, 'approval', confirmation.id);
    addKey(keys, 'approval-action', confirmation.actionType);
  }
  for (const card of result.cards) {
    for (const key of agentCardDedupKeys(card)) keys.add(key);
  }
  return keys;
}

function addKey(keys: Set<string>, prefix: string, value: unknown) {
  const text =
    typeof value === 'number' && Number.isFinite(value)
      ? String(value)
      : stringFromUnknown(value);
  if (text) keys.add(`${prefix}:${text}`);
}

function sharesAnyKey(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) return false;
  for (const key of left) {
    if (right.has(key)) return true;
  }
  return false;
}

function normalizeComparableAssistantText(value: unknown) {
  return publicText(value, '')
    .replace(/\s+/g, '')
    .trim();
}

function assistantMessageSourceFromUnknown(value: unknown) {
  return value === 'llm' ||
    value === 'fallback' ||
    value === 'deterministic_route' ||
    value === 'deterministic_action'
    ? value
    : undefined;
}

export function branchForAssistant(
  messages: AgentThreadMessage[],
  messageId: string,
): AgentMessageBranchState | undefined {
  const messageIndex = messages.findIndex((message) => message.id === messageId);
  const previousUser = [...messages.slice(0, Math.max(0, messageIndex))]
    .reverse()
    .find((message) => message.role === 'user');
  if (!previousUser) return undefined;
  const groupId = `branch-${previousUser.id}`;
  const variants = messages.filter(
    (message) => isBranchableAssistantMessage(message) && message.branch?.groupId === groupId,
  );
  if (variants.length === 0) return { groupId, index: 1, count: 1 };
  return { groupId, index: variants.length + 1, count: variants.length + 1 };
}

export function decorateAssistantBranches(
  messages: AgentThreadMessage[],
  selections: Record<string, number>,
  syncStatus: Record<string, AgentMessageBranchState['syncStatus']> = {},
): AgentThreadMessage[] {
  const groups = new Map<string, AgentThreadMessage[]>();
  let currentUserId: string | null = null;
  const branchMarkedGroups = new Set([
    ...Object.keys(selections),
    ...messages
      .map((message) => message.branch?.groupId)
      .filter((groupId): groupId is string => Boolean(groupId)),
  ]);
  for (const message of messages) {
    if (message.role === 'user') {
      currentUserId = message.id;
      continue;
    }
    if (!isBranchableAssistantMessage(message) || !currentUserId) continue;
    const groupId = `branch-${currentUserId}`;
    if (!branchMarkedGroups.has(groupId)) continue;
    groups.set(groupId, [...(groups.get(groupId) ?? []), message]);
  }
  return messages.map((message) => {
    if (!isBranchableAssistantMessage(message)) return message;
    const groupEntry = Array.from(groups.entries()).find(([, items]) =>
      items.some((item) => item.id === message.id),
    );
    if (!groupEntry || groupEntry[1].length < 2) return message;
    const [groupId, variants] = groupEntry;
    const index = variants.findIndex((item) => item.id === message.id) + 1;
    const activeIndex = selections[groupId] ?? variants.length;
    return {
      ...message,
      branch: {
        groupId,
        index,
        count: variants.length,
        activeIndex,
        syncStatus: syncStatus[groupId] ?? message.branch?.syncStatus ?? 'idle',
      },
    };
  });
}

export function buildBranchSnapshot(
  messages: AgentThreadMessage[],
  selections: Record<string, number>,
): FitMeetAgentThreadBranchSnapshot | null {
  const decorated = decorateAssistantBranches(messages, selections);
  const branchMessages = decorated.filter(
    (message) =>
      isBranchableAssistantMessage(message) && message.branch && message.branch.count > 1,
  );
  if (branchMessages.length === 0) return null;
  const liveBranchGroups = new Set(
    branchMessages
      .map((message) => message.branch?.groupId)
      .filter((groupId): groupId is string => Boolean(groupId)),
  );
  const liveSelections = Object.fromEntries(
    Object.entries(selections).filter(([groupId]) => liveBranchGroups.has(groupId)),
  );
  const branchCount = branchMessages.reduce(
    (count, message) => Math.max(count, message.branch?.count ?? 0),
    0,
  );
  const activeMessage =
    branchMessages.find((message) => {
      const branch = message.branch;
      return branch ? branch.index === (branch.activeIndex ?? branch.count) : false;
    }) ?? branchMessages.at(-1);
  return {
    activeBranchId: activeMessage?.id ?? null,
    branchSelections: liveSelections,
    branchCount,
    parentMessageId: activeMessage?.branch?.groupId ?? null,
    updatedAt: new Date().toISOString(),
    metadata: buildThreadMetadata(messages, null),
  };
}

export function buildThreadMetadata(
  messages: AgentThreadMessage[],
  result: UserFacingAgentResponse | null,
): Record<string, unknown> {
  if (messages.length === 0 && !result) return {};
  const latest = messages.at(-1);
  return {
    schemaVersion: 1,
    client: 'fitmeet-web',
    messageCount: messages.length,
    latestMessageId: latest?.id ?? null,
    latestRole: latest?.role ?? null,
    latestStatus: latest?.status ?? null,
    latestPreview: latest?.content ? latest.content.slice(0, 140) : null,
    lastSyncedAt: new Date().toISOString(),
    resultStatus: result?.workflow?.state ?? null,
  };
}

export function threadBranchSnapshot(thread: FitMeetAgentThreadSummary) {
  const direct = thread.branch;
  if (direct?.branchSelections) return direct;
  const custom = thread.custom?.assistantThread;
  if (!custom || typeof custom !== 'object' || Array.isArray(custom)) return null;
  const record = custom as FitMeetAgentThreadBranchSnapshot;
  return record.branchSelections ? record : null;
}

export function numberFromUnknown(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

export function stepIdFromLightStatus(status: string): string {
  if (/确认关键信息|补充信息|补齐/i.test(status)) return 'clarify';
  if (status.includes('Life Graph') || status.includes('长期偏好') || status.includes('画像')) return 'profile';
  if (status.includes('筛选')) return 'search';
  if (status.includes('排除')) return 'rank';
  if (status.includes('安全')) return 'safety_filter';
  if (status.includes('确认')) return 'approval';
  if (status.includes('约练')) return 'activity_plan';
  if (status.includes('更新')) return 'life_graph_update';
  return 'understand';
}

export function isApprovalProgressStepId(stepId: string) {
  return stepId === 'approval' || stepId === 'confirm';
}

export function mergeProgressStep(
  steps: Step[],
  event: UserFacingAgentProgressEvent,
  intent: AgentConversationIntent,
): Step[] {
  const baseSteps = steps.filter((step) => !isLocalCoveringStatusStep(step));
  const nextStatus: StepState =
    event.state === 'done'
      ? 'success'
      : event.state === 'failed'
        ? 'error'
        : event.state === 'waiting'
          ? 'waiting'
          : 'running';
  const rawLabel = publicText(event.title, event.kind === 'tool' ? '正在整理当前信息' : '正在理解你的需求');
  const processType =
    typeof event.metadata?.processType === 'string' && event.metadata.processType.trim()
      ? event.metadata.processType.trim()
      : undefined;
  const label = processType ? rawLabel : publicStepLabel(event.id, rawLabel, intent);
  const detail = event.detail ? publicText(event.detail, '') || undefined : undefined;
  const agentName =
    typeof event.metadata?.agentName === 'string' && event.metadata.agentName.trim()
      ? event.metadata.agentName.trim()
      : undefined;
  const index = baseSteps.findIndex((step) => {
    if (processType === 'approval') {
      return step.processType === 'approval' || isApprovalProgressStepId(step.id);
    }
    if (step.id !== event.id) return false;
    if (!processType) return !step.processType;
    return step.processType === processType;
  });
  const nextStep: Step = {
    id: event.id,
    label,
    status: nextStatus,
    kind: event.kind,
    processType,
    agentName,
    detail,
    metadata: event.metadata,
    snapshot: event.snapshot,
  };

  if (processType === 'run_summary') {
    const preservedApprovalSteps = baseSteps.filter(
      (step) =>
        step.processType === 'approval' ||
        isApprovalProgressStepId(step.id),
    );
    const waitingApprovalStep = preservedApprovalSteps.find(
      (step) => step.status === 'waiting',
    );
    const withoutPreviousSummaries = preservedApprovalSteps.filter(
      (step) => step.processType !== 'run_summary' && step.id !== event.id,
    );
    const summaryStep =
      waitingApprovalStep && nextStep.status === 'success'
        ? {
            ...nextStep,
            label: waitingApprovalStep.label || nextStep.label,
            status: 'waiting' as const,
            detail:
              waitingApprovalStep.detail ??
              nextStep.detail ??
              '确认后我会接着处理。',
            metadata: {
              ...nextStep.metadata,
              pendingApproval: true,
              preservedApproval: true,
            },
          }
        : nextStep;
    return [...withoutPreviousSummaries, summaryStep];
  }

  if (index >= 0) {
    return baseSteps.map((step, itemIndex) =>
      itemIndex === index
        ? {
            ...nextStep,
            metadata: {
              ...step.metadata,
              ...nextStep.metadata,
            },
            snapshot: nextStep.snapshot ?? step.snapshot,
          }
        : step.status === 'running' && nextStatus === 'running'
          ? { ...step, status: 'success' }
          : step,
    );
  }

  return [
    ...baseSteps.map((step) =>
      step.status === 'running' ? { ...step, status: 'success' as const } : step,
    ),
    nextStep,
  ];
}

export function mergeApprovalRequiredStep(
  steps: Step[],
  event: Extract<AgentStreamEvent, { type: 'approval_required' }>,
): Step[] {
  const baseSteps = steps.filter((step) => !isLocalCoveringStatusStep(step));
  const label = publicStepLabel('approval', event.summary || '需要你确认后继续', 'approval');
  const approvalIndex = baseSteps.findIndex(
    (step) => step.processType === 'approval' || isApprovalProgressStepId(step.id),
  );
  const metadata = {
    processType: 'approval',
    actionType: event.actionType,
    approvalId: event.approvalId,
    riskLevel: event.riskLevel,
    summary: event.summary,
  };

  if (approvalIndex >= 0) {
    return baseSteps.map((step, index) => {
      if (index !== approvalIndex) {
        return step.status === 'running' ? { ...step, status: 'success' as const } : step;
      }
      return {
        ...step,
        id: isApprovalProgressStepId(step.id) ? step.id : 'approval',
        label,
        status: 'waiting' as const,
        processType: step.processType ?? 'approval',
        metadata: {
          ...step.metadata,
          ...metadata,
        },
      };
    });
  }

  return [
    ...baseSteps.map((step) =>
      step.status === 'running' ? { ...step, status: 'success' as const } : step,
    ),
    {
      id: 'approval',
      label,
      status: 'waiting' as const,
      kind: 'tool',
      processType: 'approval',
      metadata,
    },
  ];
}

export function mergeStep(
  steps: Step[],
  id: string,
  label: string,
  status: 'pending' | 'running' | 'waiting' | 'done' | 'failed',
  intent: AgentConversationIntent = 'conversation',
): Step[] {
  const baseSteps = steps.filter((step) => !isLocalCoveringStatusStep(step));
  const nextStatus: StepState =
    status === 'done' ? 'success' : status === 'failed' ? 'error' : status;
  const publicLabel = publicStepLabel(id, label, intent);
  const index = baseSteps.findIndex((step) => step.id === id);
  if (index >= 0) {
    return baseSteps.map((step, itemIndex) =>
      itemIndex === index
        ? { ...step, label: publicLabel, status: nextStatus }
        : step.status === 'running' && nextStatus === 'running'
          ? { ...step, status: 'success' }
          : step,
    );
  }
  return [
    ...baseSteps.map((step) =>
      step.status === 'running' ? { ...step, status: 'success' as const } : step,
    ),
    { id, label: publicLabel, status: nextStatus },
  ];
}

function isLocalCoveringStatusStep(step: Step) {
  return step.id === 'local-covering-status' || step.metadata?.source === 'local.covering_status';
}

export function publicText(value: unknown, fallback: string) {
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  if (technicalPublicTextPattern.test(text)) return fallback;
  if (/^\s*[{[][\s\S]*[}\]]\s*$/.test(text)) return fallback;
  return text;
}

export function publicStepLabel(
  id: string,
  label: string,
  intent: AgentConversationIntent = 'conversation',
) {
  const key = `${id} ${label}`.toLowerCase();
  if (isSafeProductProcessLabel(label)) return label;
  if (/已(记录|记住|保存|补齐|确认)|已把/.test(label)) return label;
  if (/clarify|补充|关键信息/.test(key)) return '正在确认需要补充的信息';
  if (intent === 'conversation') {
    if (/safe|guard|risk|boundary|安全|边界/.test(key)) return '正在检查必要边界';
    if (/approval|confirm|human|确认/.test(key)) return '需要你确认后继续';
    return '正在组织自然回复';
  }
  if (/approval|confirm|human|确认/.test(key)) return '需要你确认后继续';
  if (/safe|guard|risk|boundary|安全/.test(key)) return '正在检查必要边界';
  if (/rank|time|schedule|排除/.test(key)) return '正在整理可行选项';
  if (/match|search|candidate|social|筛选/.test(key)) return '正在查找合适的信息';
  if (/life|profile|graph|memory|画像/.test(key)) return '正在结合上下文';
  if (/understand|intent|think|route|理解/.test(key)) return '正在理解你的需求';
  const allowed = [...conversationSteps, ...socialSteps].map((step) => step.label);
  return allowed.includes(label) ? label : '正在组织自然回复';
}

function isSafeProductProcessLabel(label: string) {
  return /^(正在|还在)(理解你的需求|理解你的约练需求|整理你的约练需求|读取你的偏好|读取你的上下文|检查必要信息|检查画像完整度|补齐约练信息|生成约练卡|准备同步到发现|准备发布到发现|筛选公开可发现的人|查找公开可发现的人|检查安全边界|整理推荐理由|整理合适机会|排序合适机会|生成开场白|准备邀请确认|准备邀请|整理长期偏好|整理可记住的偏好)/u.test(
    label.trim(),
  );
}

export function createAgentRecoveryFromError(
  error: AgentError,
  prompt: string,
  fallbackKind: FitMeetAssistantRecovery['kind'] = 'failed',
): FitMeetAssistantRecovery {
  if (error.recoveryNotice) {
    const title = publicText(error.recoveryNotice.title, '').trim();
    const message = publicText(error.recoveryNotice.message, '').trim();
    return {
      kind: error.recoveryNotice.kind === 'checkpoint' ? 'checkpoint_available' : fallbackKind,
      title: title && !isGenericRecoveryTitle(title) ? title : DEFAULT_RECOVERY_TITLE,
      message:
        message && !isGenericRecoveryNoticeMessage(message)
          ? message
          : DEFAULT_RECOVERY_MESSAGE,
      prompt,
      retryable: error.recoveryNotice.retryable,
    };
  }
  const kindByCode: Partial<Record<AgentError['code'], FitMeetAssistantRecovery['kind']>> = {
    ABORTED: 'stopped',
    MISSING_INFO: 'missing_info',
    UNAUTHORIZED: 'unauthorized',
    SAFETY_BLOCKED: 'safety',
  };
  const title = publicText(error.title, '').trim();
  const message = publicText(error.message, '').trim();
  return {
    kind: kindByCode[error.code] ?? fallbackKind,
    title:
      title && !isGenericRecoveryTitle(title) && !isGenericRecoveryNoticeMessage(title)
        ? title
        : DEFAULT_RECOVERY_TITLE,
    message:
      message && !isGenericRecoveryNoticeMessage(message)
        ? message
        : DEFAULT_RECOVERY_MESSAGE,
    prompt,
    retryable: error.retryable,
  };
}

export function createInlineAuthRecovery(prompt: string): FitMeetAssistantRecovery {
  return {
    kind: 'unauthorized',
    title: '登录后继续',
    message: '登录后我才能保存这段对话、恢复上下文，并在你需要时继续处理任务。',
    prompt,
    retryable: false,
  };
}

export function createCheckpointAvailableRecovery(
  checkpoint: AgentCheckpointSummary | null | undefined,
): FitMeetAssistantRecovery | null {
  if (!checkpoint) return null;
  const waitingStep = checkpoint.steps.find((step) => step.status === 'waiting');
  const failedStep = checkpoint.steps.find(
    (step) => step.status === 'error' || step.status === 'failed',
  );
  const hasUserActionRequired = checkpoint.resumable || Boolean(waitingStep);
  const hasUsefulRetry = checkpoint.canRetry && Boolean(failedStep);
  if (!hasUserActionRequired && !hasUsefulRetry) return null;
  const action = checkpoint.resumable
    ? 'resume'
    : checkpoint.canRetry
      ? 'retry'
      : checkpoint.canReplay
        ? 'replay'
        : checkpoint.canFork
          ? 'fork'
          : null;
  if (!action) return null;
  const sourceLabel =
    publicText(checkpoint.sourceStep?.label ?? '', '').trim() ||
    waitingStep?.label ||
    checkpoint.steps.at(-1)?.label ||
    '上一次处理步骤';
  if (isGenericCheckpointLabel(sourceLabel)) return null;
  const visibleSteps = checkpoint.steps
    .filter(
      (step) =>
        step.stepId &&
        step.label &&
        (step.status === 'waiting' ||
          step.status === 'error' ||
          step.status === 'failed' ||
          step.retryable),
    )
    .slice(-4)
    .map((step) => ({
      stepId: step.stepId,
      label: publicText(step.label, '已保存步骤'),
      status: step.status,
      retryable: step.retryable,
      replayable: step.replayable,
      forkable: step.forkable,
    }));
  return {
    kind: 'checkpoint_available',
    title: hasUserActionRequired ? '有个动作需要你确认' : '可以继续处理',
    message: `我可以继续「${sourceLabel}」，也可以忽略它，直接开始新的对话。`,
    prompt: hasUserActionRequired ? '继续处理刚才需要确认的步骤。' : '重试刚才失败的步骤。',
    retryable: true,
    checkpoint: {
      checkpointId: checkpoint.id,
      stepId: checkpoint.sourceStep?.stepId ?? null,
      action,
      steps: visibleSteps,
    },
  };
}

export function isGenericCheckpointLabel(label: string) {
  const normalized = label.trim().toLowerCase();
  if (!normalized) return true;
  return /^(你有什么功能|有什么功能|上一次处理步骤|已整理回复|正在整理回复|整理结果|agent 状态已更新)$/i.test(
    normalized,
  );
}

export function shouldFetchCheckpointRecovery(
  response: UserFacingAgentResponse | null,
  taskStatus: string | null,
  explicitTaskRoute: boolean,
) {
  if (!response) return false;
  if (responseRequiresApproval(response)) return true;
  if (
    isGenericCheckpointResponse(response) ||
    isGenericRecoveryAssistantText(response.assistantMessage)
  ) {
    return false;
  }
  if (explicitTaskRoute && response.cards.some(isSocialSurfaceCard)) return true;
  return taskStatus === 'awaiting_confirmation';
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) return error.name === 'AbortError';
  if (error instanceof Error) return error.name === 'AbortError';
  return false;
}

export function stringFromUnknown(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function nextId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
