import { SocialAgentToolName } from './social-agent-tool.types';

export type SocialAgentMessageRecord = Record<string, unknown> & {
  id?: string;
  conversationId?: string;
  text?: string;
  senderId?: number;
  senderType?: string;
};

export type SocialAgentLoopMemory = Record<string, unknown> & {
  taskId?: number;
  conversationId?: string;
  targetUserId?: number | null;
  lastMessageId?: string | null;
  lastAgentMessageId?: string | null;
  lastReceivedMessageId?: string | null;
  lastReadMessageId?: string | null;
  pendingMessageId?: string | null;
  latestReceivedMessage?: SocialAgentMessageRecord | null;
  latestReceivedMessages?: SocialAgentMessageRecord[];
  replySummary?: Record<string, unknown> | null;
  nextActionDecision?: Record<string, unknown> | null;
  processedMessageIds?: string[];
  sentMessageKeys?: string[];
  activityInviteKeys?: string[];
  paymentIntentKeys?: string[];
};

export type SocialAgentLoopKeyField =
  | 'sentMessageKeys'
  | 'activityInviteKeys'
  | 'paymentIntentKeys';

export function buildSocialAgentMessageDedupeKey(
  targetUserId: number | null | undefined,
  text: string,
): string {
  return `message:${targetUserId ?? 'unknown'}:${normalizeSocialAgentDedupeText(text)}`;
}

export function buildSocialAgentActivityInviteDedupeKey(
  toolName: SocialAgentToolName,
  dto: {
    invitedUserId?: number | null;
    title?: string | null;
    startTime?: string | null;
    city?: string | null;
    locationName?: string | null;
  },
): string {
  return [
    'activity',
    toolName,
    dto.invitedUserId ?? 'unknown',
    normalizeSocialAgentDedupeText(dto.title ?? ''),
    normalizeSocialAgentDedupeText(dto.startTime ?? ''),
    normalizeSocialAgentDedupeText(dto.city ?? ''),
    normalizeSocialAgentDedupeText(dto.locationName ?? ''),
  ].join(':');
}

export function buildSocialAgentPaymentIntentDedupeKey(input: {
  targetUserId: number | null;
  amount: number;
  currency: string;
  description: string;
}): string {
  return [
    'payment',
    input.targetUserId ?? 'unknown',
    input.amount.toFixed(2),
    input.currency,
    normalizeSocialAgentDedupeText(input.description),
  ].join(':');
}

export function normalizeSocialAgentDedupeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 180);
}

export function socialAgentLoopStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function appendSocialAgentLoopValue(
  values: string[],
  value: string | null | undefined,
): string[] {
  if (!value) return values.slice(-100);
  if (values.includes(value)) return values.slice(-100);
  return [...values, value].slice(-100);
}

export function toSocialAgentMessageArray(
  value: unknown,
): SocialAgentMessageRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => ({
      ...item,
      id: string(item.id ?? item.messageId),
      conversationId: string(item.conversationId),
      text: string(item.text ?? item.content),
      senderId: number(item.senderId),
      senderType: string(item.senderType),
    }));
}

export function filterNewSocialAgentCounterpartMessages(
  messages: SocialAgentMessageRecord[],
  cursor: string | null | undefined,
  ownerUserId: number,
): SocialAgentMessageRecord[] {
  const cursorIndex = cursor
    ? messages.findIndex((message) => message.id === cursor)
    : -1;
  const afterCursor =
    cursorIndex >= 0 ? messages.slice(cursorIndex + 1) : messages;
  return afterCursor.filter((message) => {
    if (message.senderType === 'agent') return false;
    if (number(message.senderId) === ownerUserId) return false;
    return Boolean(message.id || message.text);
  });
}

export function filterPendingSocialAgentCounterpartMessages(
  messages: SocialAgentMessageRecord[],
  cursor: string | null | undefined,
  loop: SocialAgentLoopMemory,
  ownerUserId: number,
): SocialAgentMessageRecord[] {
  const processed = new Set(loop.processedMessageIds ?? []);
  let candidates = filterNewSocialAgentCounterpartMessages(
    messages,
    cursor,
    ownerUserId,
  ).filter((message) => !message.id || !processed.has(message.id));

  if (candidates.length === 0 && loop.pendingMessageId) {
    const pending = messages.find(
      (message) =>
        message.id === loop.pendingMessageId &&
        message.senderType !== 'agent' &&
        number(message.senderId) !== ownerUserId &&
        !processed.has(loop.pendingMessageId ?? ''),
    );
    if (pending) candidates = [pending];
  }

  return candidates;
}

function string(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function number(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
