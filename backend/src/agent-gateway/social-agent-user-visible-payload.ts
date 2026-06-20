import { cleanDisplayText } from '../common/display-text.util';
import { redactSensitiveText } from '../common/privacy-redaction.util';
import type { SocialAgentEventV2Type } from './social-agent-event-v2.types';

const USER_VISIBLE_PAYLOAD_INTERNAL_KEY_RE =
  /^(?:traceId|agentTrace|structuredIntent|planner|debug|internal|stack|exception|prompt|systemPrompt|messages|content|payload|toolCall|toolCalls|toolInput|toolOutput|raw|rawJson|rawJSON|database|query|sql|embedding|vector|model|provider|apiKey|authorization|token|secret|password)$/i;
const USER_VISIBLE_PAYLOAD_SENSITIVE_KEY_RE =
  /(?:phone|mobile|tel|email|wechat|qq|contact|privateChat|chatContent|preciseLocation|precise_address|address|latitude|longitude|\blat\b|\blng\b|coordinates|payment|idCard|identity|realName|legalName|birth|health|bank|credit)/i;
const USER_VISIBLE_PAYLOAD_INTERNAL_TEXT_RE =
  /\b(?:traceId|agentTrace|structuredIntent|planner|raw JSON|rawJson|tool_call|toolCall|toolCalls|stack trace|system prompt|internal runtime|database query|sql query)\b/i;

const MAX_USER_VISIBLE_PAYLOAD_DEPTH = 5;
const MAX_USER_VISIBLE_PAYLOAD_KEYS = 50;
const MAX_USER_VISIBLE_PAYLOAD_ARRAY = 20;
const MAX_USER_VISIBLE_PAYLOAD_STRING = 500;

export function sanitizeSocialAgentUserVisiblePayload(
  type: SocialAgentEventV2Type,
  payload: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!payload) return undefined;
  if (type === 'assistant.delta') return payload;
  const sanitized = sanitizeUserVisiblePayloadValue(payload, 0);
  const record = recordValue(sanitized);
  if (!record) return undefined;
  return Object.keys(record).length > 0 ? record : undefined;
}

function sanitizeUserVisiblePayloadValue(
  value: unknown,
  depth: number,
  keyHint = '',
): unknown {
  if (value == null) return value;
  if (isUnsafeUserVisiblePayloadKey(keyHint)) return undefined;
  if (depth > MAX_USER_VISIBLE_PAYLOAD_DEPTH) return undefined;
  if (typeof value === 'string') {
    const redacted = cleanDisplayText(
      redactSensitiveText(value),
      '',
    ).slice(0, MAX_USER_VISIBLE_PAYLOAD_STRING);
    if (!redacted) return undefined;
    if (USER_VISIBLE_PAYLOAD_INTERNAL_TEXT_RE.test(redacted)) return undefined;
    return redacted;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    const sanitizedItems = value
      .slice(0, MAX_USER_VISIBLE_PAYLOAD_ARRAY)
      .map((item) => sanitizeUserVisiblePayloadValue(item, depth + 1))
      .filter((item) => item !== undefined);
    return sanitizedItems.length > 0 ? sanitizedItems : undefined;
  }
  const record = recordValue(value);
  if (!record) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record).slice(
    0,
    MAX_USER_VISIBLE_PAYLOAD_KEYS,
  )) {
    if (isUnsafeUserVisiblePayloadKey(key)) continue;
    const sanitized = sanitizeUserVisiblePayloadValue(item, depth + 1, key);
    if (sanitized !== undefined) out[key] = sanitized;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function isUnsafeUserVisiblePayloadKey(key: string): boolean {
  if (!key) return false;
  return (
    USER_VISIBLE_PAYLOAD_INTERNAL_KEY_RE.test(key) ||
    USER_VISIBLE_PAYLOAD_SENSITIVE_KEY_RE.test(key)
  );
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
