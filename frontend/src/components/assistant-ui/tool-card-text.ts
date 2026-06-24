export function normalizeInlineProductText(value?: string | null) {
  if (!value) return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

export function safeImageSrc(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}
