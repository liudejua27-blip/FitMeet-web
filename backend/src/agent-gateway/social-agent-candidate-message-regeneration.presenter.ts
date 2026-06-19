import { cleanDisplayText } from '../common/display-text.util';

export type CandidateMessageDraftInput = {
  cardActionDraft?: Record<string, unknown>;
  candidates?: Array<Record<string, unknown> | undefined>;
  regenerate?: boolean;
  previousMessage?: unknown;
};

export function buildRegeneratedCandidateMessageDraft(
  input: CandidateMessageDraftInput,
): string {
  const candidate = input.candidates?.find(isRecord) ?? {};
  const name = cleanDisplayText(
    candidate.displayName ?? candidate.nickname ?? candidate.name,
    '',
  );
  const activity = firstString(
    candidate.activityType,
    candidate.activity,
    candidate.primaryInterest,
    firstArrayString(candidate.interests),
    firstArrayString(candidate.tags),
  );
  const time = firstString(
    candidate.time,
    candidate.availableTime,
    candidate.timePreference,
  );
  const area = firstString(candidate.area, candidate.city, candidate.location);
  const context = [
    activity ? `也喜欢${activity}` : '也在附近运动',
    time ? `时间偏好是${time}` : '',
    area ? `大致在${area}` : '',
  ].filter(Boolean);
  const greeting = name ? `你好 ${name}` : '你好';
  const body = context.length
    ? `看到你${context.join('，')}，感觉可以先轻松聊一下。`
    : '看到你的运动节奏和我比较接近，感觉可以先轻松聊一下。';
  const regenerated = `${greeting}，${body}如果你方便，我们可以先在站内确认时间和公共地点，再决定要不要一起约练。`;
  const previous = cleanDisplayText(input.previousMessage, '').trim();
  return previous && previous === regenerated
    ? `${greeting}，我想先用低压力的方式打个招呼：如果你最近也想约一次轻松运动，我们可以先站内聊时间和公共地点，合适再继续。`
    : regenerated;
}

function firstArrayString(value: unknown): unknown {
  return Array.isArray(value)
    ? value.find((item) => typeof item === 'string')
    : undefined;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const text = cleanDisplayText(value, '').trim();
    if (text) return text;
  }
  return '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
