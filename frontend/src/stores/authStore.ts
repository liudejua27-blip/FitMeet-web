import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserProfile } from '../types';
import * as api from '../api/client';
import * as dataService from '../services/dataService';
import { STORAGE_KEYS, migrateLocalStorageKey } from '../lib/storageKeys';

const REFRESH_TOKEN_KEY = STORAGE_KEYS.refreshToken;
migrateLocalStorageKey(STORAGE_KEYS.legacyRefreshToken, REFRESH_TOKEN_KEY);
migrateLocalStorageKey(STORAGE_KEYS.legacyAuthStore, STORAGE_KEYS.authStore);

interface AuthState {
  isLoggedIn: boolean;
  user: UserProfile | null;
  showLoginModal: boolean;
  loading: boolean;
  restoring: boolean;
  error: string | null;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  loginWithPhone: (phone: string, code: string) => Promise<void>;
  loginWithWechat: (code: string) => Promise<void>;
  sendSmsCode: (phone: string) => Promise<void>;
  register: (data: { email: string; password: string; name: string }) => Promise<void>;
  logout: () => void;
  openLogin: () => void;
  closeLogin: () => void;
  updateProfile: (data: Partial<UserProfile>) => void;
  refreshProfile: () => Promise<void>;
  restoreSession: () => Promise<void>;
}

function handleAuthResult(
  result: api.AuthResult,
  set: (state: Partial<AuthState>) => void,
) {
  api.setToken(result.access_token);
  if (result.refresh_token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, result.refresh_token);
    localStorage.removeItem(STORAGE_KEYS.legacyRefreshToken);
  }
  set({
    isLoggedIn: true,
    user: result.user as UserProfile,
    showLoginModal: false,
    loading: false,
    restoring: false,
    error: null,
  });
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isLoggedIn: false,
      user: null,
      showLoginModal: false,
      loading: false,
      restoring: true,
      error: null,

      login: async (credentials) => {
        set({ loading: true, error: null });
        try {
          const result = await api.login(credentials);
          handleAuthResult(result, set);
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : 'Unknown login error';
          set({ loading: false, error: message || '登录失败，请稍后重试' });
          throw err;
        }
      },

      loginWithPhone: async (phone, code) => {
        set({ loading: true, error: null });
        try {
          const result = await api.loginWithPhone(phone, code);
          handleAuthResult(result, set);
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : 'Unknown login error';
          set({ loading: false, error: message || '验证码登录失败，请稍后重试' });
          throw err;
        }
      },

      loginWithWechat: async (code) => {
        set({ loading: true, error: null });
        try {
          const result = await api.loginWithWechat(code);
          handleAuthResult(result, set);
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : 'Unknown login error';
          set({ loading: false, error: message || '微信登录失败，请稍后重试' });
          throw err;
        }
      },

      sendSmsCode: async (phone) => {
        set({ loading: true, error: null });
        try {
          await api.sendSmsCode(phone);
          set({ loading: false });
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : 'Unknown error';
          set({ loading: false, error: message || '验证码发送失败，请稍后重试' });
          throw err;
        }
      },

      register: async (data) => {
        set({ loading: true, error: null });
        try {
          const result = await api.register(data);
          handleAuthResult(result, set);
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : 'Unknown register error';
          set({ loading: false, error: message || '注册失败，请稍后重试' });
          throw err;
        }
      },

      logout: () => {
        api.clearToken();
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(STORAGE_KEYS.legacyRefreshToken);
        set({ isLoggedIn: false, user: null, restoring: false });
      },

      openLogin: () => set({ showLoginModal: true, error: null }),
      closeLogin: () => set({ showLoginModal: false, error: null }),

      updateProfile: (data) => {
        set((state) => ({
          user: state.user ? { ...state.user, ...data } : null,
        }));
        dataService.updateUserProfile(data);
      },

      refreshProfile: async () => {
        const user = await api.getProfile();
        set({ isLoggedIn: true, user: user as UserProfile });
      },

      restoreSession: async () => {
        const token = api.getToken();
        if (!token) {
          set({ isLoggedIn: false, user: null, restoring: false });
          return;
        }
        try {
          const user = await api.getProfile();
          set({ isLoggedIn: true, user: user as UserProfile, restoring: false });
        } catch {
          const rt = localStorage.getItem(REFRESH_TOKEN_KEY);
          if (rt) {
            try {
              const result = await api.refreshToken(rt);
              handleAuthResult(result, set);
              return;
            } catch {
              // Refresh also failed.
            }
          }
          api.clearToken();
          localStorage.removeItem(REFRESH_TOKEN_KEY);
          localStorage.removeItem(STORAGE_KEYS.legacyRefreshToken);
          set({ isLoggedIn: false, user: null, restoring: false });
        }
      },
    }),
    {
      name: STORAGE_KEYS.authStore,
      partialize: (state) => ({
        isLoggedIn: state.isLoggedIn,
        user: state.user,
      }),
    },
  ),
);
