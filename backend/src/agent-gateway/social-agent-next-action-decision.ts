import {
  ActivityProofPolicy,
  ActivityType,
} from '../activities/entities/activity-template.entity';
import { sanitizeCity } from '../common/city.util';
import {
  AgentPermissionService,
  SocialAgentAction,
} from './agent-permission.service';
import {
  AgentTask,
  AgentTaskPermissionMode,
} from './entities/agent-task.entity';
import { getSocialAgentPermissionActionForTool } from './social-agent-tool-policy';
import { SocialAgentToolName } from './social-agent-tool.types';
import type {
  SocialAgentLoopMemory,
  SocialAgentMessageRecord,
} from './social-agent-loop-state';

export type SocialAgentPermissionGate = Pick<
  AgentPermissionService,
  'canExecute' | 'getAllowedActions'
>;

export type SocialAgentToolNameResolver = (
  value: unknown,
) => SocialAgentToolName | null;

export function buildSocialAgentReplySummaryPrompt(
  task: AgentTask,
  messages: SocialAgentMessageRecord[],
): string {
  return JSON.stringify({
    taskId: task.id,
    goal: task.goal,
    permissionMode: task.permissionMode,
    messages: messages.map((message) => ({
      id: message.id,
      text: message.text,
      senderId: message.senderId,
      createdAt: message.createdAt,
    })),
    outputSchema: {
      summary: 'one sentence Chinese summary',
      intent:
        'accept | ask_question | decline | payment | schedule | smalltalk | unknown',
      sentiment: 'positive | neutral | negative',
      needsReply: true,
      keyFacts: ['time/place/request constraints'],
    },
  });
}

export function buildSocialAgentNextActionPrompt(
  task: AgentTask,
  messages: SocialAgentMessageRecord[],
  summary: Record<string, unknown>,
  loop: SocialAgentLoopMemory,
  allowedActions: SocialAgentAction[],
): string {
  return JSON.stringify({
    taskId: task.id,
    goal: task.goal,
    permissionMode: task.permissionMode,
    allowedActions,
    socialLoop: {
      conversationId: loop.conversationId,
      targetUserId: loop.targetUserId,
      lastReceivedMessageId: loop.lastReceivedMessageId,
    },
    messages,
    summary,
    outputSchema: {
      nextAction:
        'reply_message | add_friend | invite_activity | offline_meeting | payment | stop',
      action: 'permission action name',
      toolName: 'reply_message or another executable tool name',
      input: {},
      reason: 'short Chinese reason',
      confidence: 0.8,
    },
  });
}

export function buildFallbackSocialAgentReplySummary(
  messages: SocialAgentMessageRecord[],
): Record<string, unknown> {
  const latestText = messages
    .map((message) => message.text)
    .filter(Boolean)
    .join(' / ');
  const intent = /(可以|好|行|约|见|ok|yes|sure)/i.test(latestText)
    ? 'accept'
    : /(多少钱|支付|付款|订金|费用|pay|price)/i.test(latestText)
      ? 'payment'
      : /(不|不了|改天|算了|decline|no)/i.test(latestText)
        ? 'decline'
        : /(哪里|几点|路线|怎么|吗|\?)/i.test(latestText)
          ? 'ask_question'
          : 'unknown';
  return {
    source: 'fallback',
    purpose: 'summarize_reply',
    summary: latestText ? `对方回复：${preview(latestText)}` : '对方有新回复。',
    intent,
    sentiment:
      intent === 'decline'
        ? 'negative'
        : intent === 'accept'
          ? 'positive'
          : 'neutral',
    needsReply: intent !== 'decline',
    keyFacts: [preview(latestText)].filter(Boolean),
  };
}

export function buildFallbackSocialAgentNextAction(
  task: AgentTask,
  messages: SocialAgentMessageRecord[],
  summary: Record<string, unknown>,
  loop: SocialAgentLoopMemory,
): Record<string, unknown> {
  const latestText = messages
    .map((message) => message.text)
    .filter(Boolean)
    .join(' / ');
  const targetUserId =
    loop.targetUserId ??
    number(messages[messages.length - 1]?.senderId) ??
    null;
  const intent = string(summary.intent);
  const acceptedActivityInput = targetUserId
    ? buildSocialAgentMeetLoopActivityInput(
        task,
        summary,
        latestText,
        targetUserId,
      )
    : null;

  if (intent === 'decline') {
    return {
      source: 'fallback',
      nextAction: 'stop',
      action: null,
      toolName: null,
      input: {},
      reason: '对方暂时拒绝，停止推进并等待新的上下文。',
      confidence: 0.72,
    };
  }

  if (
    intent === 'accept' &&
    targetUserId &&
    task.permissionMode === AgentTaskPermissionMode.LimitedAuto
  ) {
    return {
      source: 'fallback',
      nextAction: 'offline_meeting',
      action: SocialAgentAction.OfflineMeet,
      toolName: SocialAgentToolName.OfflineMeeting,
      input: acceptedActivityInput ?? { targetUserId },
      reason: '对方接受邀约，Limited Auto Mode 可继续安排线下见面。',
      confidence: 0.76,
    };
  }

  if (
    intent === 'accept' &&
    targetUserId &&
    task.permissionMode === AgentTaskPermissionMode.Confirm
  ) {
    return {
      source: 'fallback',
      nextAction: 'invite_activity',
      action: SocialAgentAction.SendInvite,
      toolName: SocialAgentToolName.InviteActivity,
      input: acceptedActivityInput ?? { targetUserId },
      reason: '对方接受邀约，Confirm Mode 可生成活动邀请。',
      confidence: 0.72,
    };
  }

  return {
    source: 'fallback',
    nextAction: 'reply_message',
    action: SocialAgentAction.SendMessage,
    toolName: SocialAgentToolName.ReplyMessage,
    input: {
      conversationId: loop.conversationId,
      targetUserId,
      text: buildFallbackSocialAgentReplyText(latestText, summary),
    },
    reason: '继续用低压力回复确认细节。',
    confidence: 0.7,
  };
}

export function buildSocialAgentMeetLoopActivityInput(
  task: AgentTask,
  summary: Record<string, unknown>,
  latestText: string,
  targetUserId: number,
): Record<string, unknown> {
  const type =
    activityType(summary.activityType ?? task.input?.['activityType']) ??
    ActivityType.Running;
  return {
    targetUserId,
    title: task.title || '约练邀请',
    description: string(summary.summary) ?? preview(latestText),
    type,
    locationName:
      string(summary.locationName ?? summary.location) ?? '公共场所待确认',
    city: sanitizeCity(summary.city ?? task.input?.['city']),
    startTime: string(summary.startTime ?? summary.time),
    durationMinutes: number(summary.durationMinutes) ?? 45,
    proofRequired: true,
    proofPolicy: ActivityProofPolicy.MutualOrProof,
    icebreakerTasks: [
      '到达后先确认彼此状态和活动节奏。',
      '活动结束后互相确认是否完成。',
    ],
    allowPreciseLocation: false,
    publicPlaceOnly: true,
    noPreciseLocation: true,
    meetLoopStage: 'activity_confirmation',
    lifeGraphUpdatePreview:
      '完成后我会更新你的近期活动节奏、偏好边界和低压力社交信号。',
    trustScoreUpdatePreview: '完成与评价会更新可信度，用来提升后续推荐可信度。',
  };
}

export function normalizeSocialAgentNextActionDecision(
  task: AgentTask,
  raw: Record<string, unknown>,
  loop: SocialAgentLoopMemory,
  permissions: SocialAgentPermissionGate,
  resolveToolName: SocialAgentToolNameResolver = normalizeKnownToolName,
): Record<string, unknown> {
  const rawNextAction =
    string(raw.nextAction ?? raw.actionType) ?? 'reply_message';
  let toolName =
    resolveToolName(raw.toolName) ??
    toolForSocialAgentNextAction(rawNextAction, resolveToolName);
  if (!toolName) toolName = SocialAgentToolName.ReplyMessage;

  let input = isRecord(raw.input) ? { ...raw.input } : {};
  if (toolName === SocialAgentToolName.ReplyMessage) {
    input = {
      conversationId: string(input.conversationId) ?? loop.conversationId,
      targetUserId: number(input.targetUserId) ?? loop.targetUserId ?? null,
      text:
        string(input.text ?? raw.replyText ?? raw.message) ??
        buildFallbackSocialAgentReplyText('', raw),
      ...input,
    };
  }
  if (
    [
      SocialAgentToolName.AddFriend,
      SocialAgentToolName.InviteActivity,
      SocialAgentToolName.OfflineMeeting,
      SocialAgentToolName.Payment,
    ].includes(toolName)
  ) {
    const targetUserId =
      number(input.targetUserId) ?? loop.targetUserId ?? null;
    input = {
      targetUserId,
      ...input,
    };
    if (
      targetUserId &&
      [
        SocialAgentToolName.InviteActivity,
        SocialAgentToolName.OfflineMeeting,
      ].includes(toolName)
    ) {
      input = {
        ...buildSocialAgentMeetLoopActivityInput(
          task,
          raw,
          string(raw.reason) ?? '',
          targetUserId,
        ),
        ...input,
        targetUserId,
        allowPreciseLocation: false,
        publicPlaceOnly: true,
        noPreciseLocation: true,
      };
    }
  }
  if (
    toolName === SocialAgentToolName.Payment &&
    !positiveAmount(input.amount)
  ) {
    toolName = SocialAgentToolName.ReplyMessage;
    input = {
      conversationId: loop.conversationId,
      targetUserId: loop.targetUserId ?? null,
      text: '我可以继续帮你处理支付意图。你想确认一下具体金额吗？',
    };
  }

  const permissionAction = getSocialAgentPermissionActionForTool(
    task.permissionMode,
    toolName,
  );
  if (
    permissionAction &&
    !permissions.canExecute(task.permissionMode, permissionAction)
  ) {
    const fallbackTool = permissions.canExecute(
      task.permissionMode,
      SocialAgentAction.SendMessage,
    )
      ? SocialAgentToolName.ReplyMessage
      : null;
    if (!fallbackTool) {
      return {
        source: string(raw.source) ?? 'normalized',
        nextAction: 'stop',
        action: null,
        toolName: null,
        input: {},
        reason: `Permission mode ${task.permissionMode} blocks ${toolName}`,
        confidence: number(raw.confidence) ?? 0.5,
      };
    }
    toolName = fallbackTool;
    input = {
      conversationId: loop.conversationId,
      targetUserId: loop.targetUserId ?? null,
      text: buildFallbackSocialAgentReplyText('', raw),
    };
  }

  const nextAction =
    rawNextAction === 'stop' ? 'stop' : nextActionForSocialAgentTool(toolName);
  if (nextAction === 'stop') {
    return {
      source: string(raw.source) ?? 'normalized',
      nextAction: 'stop',
      action: null,
      toolName: null,
      input: {},
      reason: string(raw.reason) ?? 'No further social action is needed.',
      confidence: number(raw.confidence) ?? 0.6,
    };
  }

  return {
    ...raw,
    nextAction,
    action: getSocialAgentPermissionActionForTool(
      task.permissionMode,
      toolName,
    ),
    toolName,
    input,
    reason: string(raw.reason) ?? `Execute ${toolName}`,
    confidence: number(raw.confidence) ?? 0.65,
  };
}

export function toolForSocialAgentNextAction(
  value: string,
  resolveToolName: SocialAgentToolNameResolver = normalizeKnownToolName,
): SocialAgentToolName | null {
  switch (value) {
    case 'reply_message':
    case 'send_message':
    case 'send_message_to_candidate':
      return SocialAgentToolName.ReplyMessage;
    case 'add_friend':
    case 'connect_candidate':
      return SocialAgentToolName.AddFriend;
    case 'invite_activity':
    case 'send_invite':
      return SocialAgentToolName.InviteActivity;
    case 'offline_meeting':
    case 'offline_meet':
      return SocialAgentToolName.OfflineMeeting;
    case 'payment':
      return SocialAgentToolName.Payment;
    case 'stop':
      return null;
    default:
      return resolveToolName(value);
  }
}

export function nextActionForSocialAgentTool(
  toolName: SocialAgentToolName | null,
): string {
  switch (toolName) {
    case SocialAgentToolName.ReplyMessage:
    case SocialAgentToolName.SendMessage:
    case SocialAgentToolName.SendMessageToCandidate:
      return 'reply_message';
    case SocialAgentToolName.AddFriend:
    case SocialAgentToolName.ConnectCandidate:
      return 'add_friend';
    case SocialAgentToolName.InviteActivity:
      return 'invite_activity';
    case SocialAgentToolName.OfflineMeeting:
      return 'offline_meeting';
    case SocialAgentToolName.Payment:
      return 'payment';
    default:
      return 'stop';
  }
}

export function buildFallbackSocialAgentReplyText(
  latestText: string,
  summary: Record<string, unknown>,
): string {
  const summaryText = string(summary.summary) ?? preview(latestText);
  if (/(几点|时间|路线|哪里|地点)/i.test(latestText)) {
    return '可以，我们先把时间、地点和路线确认清楚。我倾向公开场地，节奏按你舒服的来。';
  }
  if (summaryText) {
    return `收到，我理解是：${summaryText}。我们可以继续按这个方向推进。`;
  }
  return '收到，我会继续帮你低压力推进这次约练。';
}

export function parseSocialAgentJsonObject(
  text: string,
): Record<string, unknown> {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  const parsed = JSON.parse(trimmed) as unknown;
  return isRecord(parsed) ? parsed : {};
}

function normalizeKnownToolName(value: unknown): SocialAgentToolName | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return Object.values(SocialAgentToolName).includes(
    normalized as SocialAgentToolName,
  )
    ? (normalized as SocialAgentToolName)
    : null;
}

function preview(value: unknown, max = 160): string {
  const text = string(value) ?? '';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function number(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function positiveAmount(value: unknown): number | undefined {
  const amount = number(value);
  if (amount == null || amount <= 0) return undefined;
  return Math.round(amount * 100) / 100;
}

function activityType(value: unknown): ActivityType | undefined {
  return typeof value === 'string' &&
    Object.values(ActivityType).includes(value as ActivityType)
    ? (value as ActivityType)
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
