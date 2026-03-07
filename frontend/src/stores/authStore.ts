import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserProfile } from '../types';
import * as api from '../api/client';
import * as dataService from '../services/dataService';

const REFRESH_TOKEN_KEY = 'fitmate-refresh-token';

interface AuthState {
  isLoggedIn: boolean;
  user: UserProfile | null;
  showLoginModal: boolean;
  loading: boolean;
  error: string | null;
  /** Email login */
  login: (credentials: { email: string; password: string }) => Promise<void>;
  /** Phone SMS login */
  loginWithPhone: (phone: string, code: string) => Promise<void>;
  /** WeChat OAuth login */
  loginWithWechat: (code: string) => Promise<void>;
  /** Send SMS verification code */
  sendSmsCode: (phone: string) => Promise<void>;
  register: (data: { email: string; password: string; name: string }) => Promise<void>;
  logout: () => void;
  openLogin: () => void;
  closeLogin: () => void;
  updateProfile: (data: Partial<UserProfile>) => void;
  /** Restore session from stored token on app start */
  restoreSession: () => Promise<void>;
}

function handleAuthResult(
  result: api.AuthResult,
  set: (state: Partial<AuthState>) => void,
) {
  api.setToken(result.access_token);
  if (result.refresh_token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, result.refresh_token);
  }
  set({
    isLoggedIn: true,
    user: result.user as UserProfile,
    showLoginModal: false,
    loading: false,
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
      error: null,

      login: async (credentials) => {
        set({ loading: true, error: null });
        try {
          const result = await api.login(credentials);
          handleAuthResult(result, set);
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : 'Unknown login error';
          set({ loading: false, error: message || '登录失败' });
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
          set({ loading: false, error: message || '验证码登录失败' });
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
          set({ loading: false, error: message || '微信登录失败' });
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
          set({ loading: false, error: message || '发送验证码失败' });
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
          set({ loading: false, error: message || '注册失败' });
          throw err;
        }
      },

      logout: () => {
        api.clearToken();
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        set({ isLoggedIn: false, user: null });
      },

      openLogin: () => set({ showLoginModal: true, error: null }),
      closeLogin: () => set({ showLoginModal: false, error: null }),

      updateProfile: (data) => {
        set((state) => ({
          user: state.user ? { ...state.user, ...data } : null,
        }));
        // Sync with backend
        dataService.updateUserProfile(data);
      },

      restoreSession: async () => {
        const token = api.getToken();
        if (!token) return;
        try {
          const user = await api.getProfile();
          set({ isLoggedIn: true, user: user as UserProfile });
        } catch {
          // Token expired — try refresh
          const rt = localStorage.getItem(REFRESH_TOKEN_KEY);
          if (rt) {
            try {
              const result = await api.refreshToken(rt);
              handleAuthResult(result, set);
              return;
            } catch {
              // Refresh also failed
            }
          }
          api.clearToken();
          localStorage.removeItem(REFRESH_TOKEN_KEY);
          set({ isLoggedIn: false, user: null });
        }
      },
    }),
    {
      name: 'fitmate-auth',
      partialize: (state) => ({
        isLoggedIn: state.isLoggedIn,
        user: state.user,
      }),
    },
  ),
);
