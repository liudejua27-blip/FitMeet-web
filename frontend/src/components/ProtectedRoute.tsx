import { useEffect } from 'react';
import { useAuthStore } from '../stores';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Route guard — keeps the user on the requested URL but opens the login modal
 * when they are not authenticated. Once the user logs in, the page renders
 * automatically because `isLoggedIn` flips to true. No redirect to "/" so the
 * deep link is preserved (e.g. /social-request/new).
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isLoggedIn, restoring, openLogin } = useAuthStore();

  useEffect(() => {
    if (!isLoggedIn && !restoring) {
      openLogin();
    }
  }, [isLoggedIn, restoring, openLogin]);

  if (restoring) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center" role="status" aria-label="恢复会话中">
        <div className="w-6 h-6 border-2 border-lime border-t-transparent rounded-full animate-spin" />
        <span className="sr-only">正在恢复登录状态…</span>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3 text-sm text-textMuted">
        <p>请先登录后查看该页面。</p>
        <button
          type="button"
          onClick={openLogin}
          className="rounded-lg bg-lime px-4 py-2 text-sm font-black text-white hover:bg-brand2"
        >
          打开登录
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
