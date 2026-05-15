export const STORAGE_KEYS = {
  authStore: 'fitmeet-auth',
  legacyAuthStore: 'fitmate-auth',
  messagesStore: 'fitmeet-messages',
  legacyMessagesStore: 'fitmate-messages',
  notificationsStore: 'fitmeet-notifications',
  legacyNotificationsStore: 'fitmate-notifications',
  refreshToken: 'fitmeet-refresh-token',
  legacyRefreshToken: 'fitmate-refresh-token',
  socialStore: 'fitmeet-social',
  legacySocialStore: 'fitmate-social',
  token: 'fitmeet-token',
  legacyToken: 'fitmate-token',
} as const;

function migrateStorageKey(storage: Storage | undefined, legacyKey: string, currentKey: string) {
  if (!storage || legacyKey === currentKey) return;

  try {
    const current = storage.getItem(currentKey);
    const legacy = storage.getItem(legacyKey);
    if (current === null && legacy !== null) {
      storage.setItem(currentKey, legacy);
    }
    if (legacy !== null) {
      storage.removeItem(legacyKey);
    }
  } catch {
    // Storage can be unavailable in private mode or constrained test environments.
  }
}

export function migrateLocalStorageKey(legacyKey: string, currentKey: string) {
  migrateStorageKey(
    typeof window === 'undefined' ? undefined : window.localStorage,
    legacyKey,
    currentKey,
  );
}
