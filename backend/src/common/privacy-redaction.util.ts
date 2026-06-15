const SENSITIVE_KEY_RE =
  /phone|mobile|tel|email|wechat|qq|openid|token|password|secret|authorization|message|content|privatechat|chat|address|location|lat|lng|latitude|longitude|precise|contact|payment|birth|health|period|privacy|idcard|identity|realname|legalname|bank(?:card)?|creditcard|credit_card|paymentcard|payment_card/i;
const FULL_REDACT_KEY_RE =
  /token|password|secret|authorization|openid|idcard|identity|realname|legalname|bank(?:card)?|creditcard|credit_card|paymentcard|payment_card/i;

const PHONE_RE = /(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d[-\s]?\d{4}[-\s]?\d{4}(?!\d)/g;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const WECHAT_QQ_RE =
  /(?:微信|wechat|wx|qq|QQ|联系方式|联系我)[:：\s]*[A-Za-z0-9_-]{4,32}/gi;
const ID_CARD_RE =
  /(?<![A-Za-z0-9])\d{6}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?![A-Za-z0-9])/g;
const BANK_CARD_RE = /(?<!\d)(?:\d[ -]?){15,19}(?!\d)/g;
const COORDINATE_PAIR_RE =
  /(?<!\d)(?:-?\d{1,3}\.\d{4,})\s*[,，]\s*(?:-?\d{1,3}\.\d{4,})(?!\d)/g;
const ADDRESS_HINT_RE =
  /[\u4e00-\u9fa5A-Za-z0-9]{2,}(?:路|街|巷|弄|小区|公寓|宿舍|号楼|楼|栋|单元|室)\d*[A-Za-z0-9-]*/g;

export const REDACTED_VALUE = '[REDACTED]';

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_RE.test(key);
}

function shouldFullyRedactKey(key: string): boolean {
  return FULL_REDACT_KEY_RE.test(key);
}

export function redactSensitiveText(text: string): string {
  return text
    .replace(EMAIL_RE, '[REDACTED_EMAIL]')
    .replace(PHONE_RE, '[REDACTED_PHONE]')
    .replace(WECHAT_QQ_RE, '[REDACTED_CONTACT]')
    .replace(ID_CARD_RE, '[REDACTED_ID_CARD]')
    .replace(BANK_CARD_RE, '[REDACTED_BANK_CARD]')
    .replace(COORDINATE_PAIR_RE, '[REDACTED_LOCATION]')
    .replace(ADDRESS_HINT_RE, '[REDACTED_ADDRESS]');
}

export function redactSensitiveValue(value: unknown, keyHint = ''): unknown {
  if (value == null) return value;
  if (isSensitiveKey(keyHint)) {
    if (Array.isArray(value)) return value.length ? [REDACTED_VALUE] : [];
    if (typeof value === 'object') return REDACTED_VALUE;
    if (typeof value === 'string' && shouldFullyRedactKey(keyHint)) {
      return REDACTED_VALUE;
    }
    if (typeof value === 'number') return REDACTED_VALUE;
    if (typeof value === 'boolean') return value;
  }
  if (typeof value === 'string') return redactSensitiveText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveValue(item, keyHint));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        redactSensitiveValue(item, key),
      ]),
    );
  }
  return value;
}
