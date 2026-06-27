import { ApiError } from '../api/baseClient';

const PREFIX = 'fitmeet:idempotency:';

export function getIdempotencyKey(scope: string): string {
  const key = storageKey(scope);
  const storage = getSessionStorage();
  const existing = storage?.getItem(key);
  if (existing) return existing;
  const generated = createUUID();
  storage?.setItem(key, generated);
  return generated;
}

export function clearIdempotencyKey(scope: string): void {
  getSessionStorage()?.removeItem(storageKey(scope));
}

export function clearAllIdempotencyKeys(): void {
  const storage = getSessionStorage();
  if (!storage) return;
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(PREFIX)) keys.push(key);
  }
  keys.forEach((key) => storage.removeItem(key));
}

export function shouldRetainIdempotencyKey(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  if (error.retryable) return true;
  return error.status === 408 || error.status === 429 || error.status >= 500;
}

function storageKey(scope: string): string {
  return `${PREFIX}${scope}`;
}

function getSessionStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function createUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
