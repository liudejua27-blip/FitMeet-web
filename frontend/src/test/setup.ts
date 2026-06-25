import '@testing-library/jest-dom/vitest';

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.has(key) ? values.get(key)! : null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, String(value));
    },
  };
}

function ensureStorage(key: 'localStorage' | 'sessionStorage') {
  const win = typeof window === 'undefined' ? undefined : window;
  const storage = createMemoryStorage();

  if (win) {
    Object.defineProperty(win, key, {
      configurable: true,
      value: storage,
      writable: true,
    });
  }

  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: storage,
    writable: true,
  });
}

ensureStorage('localStorage');
ensureStorage('sessionStorage');
