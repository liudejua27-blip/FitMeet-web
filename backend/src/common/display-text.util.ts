const MOJIBAKE_TOKENS = [
  '锟',
  '鍐',
  '鍙',
  '鍦',
  '鍏',
  '鎴',
  '鐢',
  '閰',
  '閿',
  '鈥',
  '鈧',
  '�',
];

const TEST_TEXT_RE =
  /(?:^|\b)(?:e2e|test|mock|dummy|fake|seed|demo-user|asdf|qwer|lorem)(?:\b|$)|测试|測試|乱码|脏数据|真实\s*API|免费约练测试|一周三炮|一周三点|[甲乙丙丁]\d{3,}|(?:^|\s)[\u4e00-\u9fa5]{1,2}\d{2,6}(?:\s|$)/iu;

const SANITIZED_TEXT_FALLBACK = '内容已隐藏';

export function looksGarbled(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return MOJIBAKE_TOKENS.some((token) => value.includes(token));
}

export function isTestLikeText(value: unknown): boolean {
  return typeof value === 'string' && TEST_TEXT_RE.test(value);
}

export function cleanDisplayText(value: unknown, fallback = ''): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return fallback;
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) return fallback;
  if (looksGarbled(text) || isTestLikeText(text)) return fallback;
  return text;
}

export function isDisplayableText(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value !== 'string') return true;
  const text = value.trim();
  return !looksGarbled(text) && !isTestLikeText(text);
}

export function sanitizeForDisplay(value: unknown): unknown {
  if (typeof value === 'string') return cleanDisplayText(value, SANITIZED_TEXT_FALLBACK);
  if (Array.isArray(value)) {
    return value
      .map(sanitizeForDisplay)
      .filter((item) => !(typeof item === 'string' && item === SANITIZED_TEXT_FALLBACK));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sanitizeForDisplay(item),
      ]),
    );
  }
  return value;
}
