const MOJIBAKE_RE =
  /[�]|(?:[閿燂拷鐢ㄦ垜浣犵殑绀句氦闇€姹傚湪鍙戦€佹秷鎭敹钘忓尮閰嶇‘璁ら檮杩戠湡瀹炲€欓€夌粌鑽夌]|鈫|鉁|锛|銆|€)/u;

const TEST_TEXT_RE =
  /(?:^|\b)(?:e2e|test|mock|dummy|fake|seed|demo-user|asdf|qwer|lorem)(?:\b|$)|测试|乱码|脏数据|免费约练测试|一周三点|[甲乙丙丁]\d{3,}/iu;

export function looksGarbled(value: unknown): boolean {
  return typeof value === 'string' && MOJIBAKE_RE.test(value);
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

export function cleanDisplayArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanDisplayText(item))
    .filter((item) => item && !isTestLikeText(item));
}

export function isDisplayableText(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value !== 'string') return true;
  const text = value.trim();
  return !looksGarbled(text) && !isTestLikeText(text);
}

export function isDisplayableRecordText(values: unknown[]): boolean {
  return values.every(isDisplayableText);
}

export function sanitizeDisplayValue(value: unknown): unknown {
  if (typeof value === 'string') return cleanDisplayText(value, '内容已隐藏');
  if (Array.isArray(value)) {
    return value
      .map(sanitizeDisplayValue)
      .filter((item) => !(typeof item === 'string' && item === '内容已隐藏'));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sanitizeDisplayValue(item),
      ]),
    );
  }
  return value;
}
