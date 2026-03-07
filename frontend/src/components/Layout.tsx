import { useState, useCallback } from 'react';
import clsx from 'clsx';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore, useMessageStore, useNotificationStore } from '../stores';
import { LoginModal } from './auth';
import { BackToTop } from './ui';

const navItems = [
  { to: '/', label: '首页' },
  { to: '/discover', label: '🔥 发现' },
  { to: '/meet', label: '📍 约练' },
  { to: '/coach', label: '🏋️ 教练' },
  { to: '/profile', label: '👤 我的' },
];

const bottomTabs = [
  { to: '/', label: '首页', icon: '🏠', activeIcon: '🏠' },
  { to: '/discover', label: '发现', icon: '🔍', activeIcon: '🔥' },
  { to: '/create-post', label: '发布', icon: '➕', activeIcon: '➕', isCreate: true },
  { to: '/messages', label: '消息', icon: '💬', activeIcon: '💬', badge: 'messages' as const },
  { to: '/profile', label: '我的', icon: '👤', activeIcon: '👤' },
];

const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isLoggedIn, user, openLogin, logout } = useAuthStore();
  const totalUnread = useMessageStore((s) => s.totalUnread);
  const unreadNotifs = useNotificationStore((s) => s.unreadCount);

  const isActive = (path: string) => location.pathname === path;
  const toggleMenu = useCallback(() => setMobileOpen(v => !v), []);
  const closeMenu = useCallback(() => setMobileOpen(false), []);

  return (
    <nav aria-label="主导航" className="sticky top-0 z-50 border-b border-border bg-base/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link to="/" className="text-lg font-display font-extrabold tracking-tight text-white">
          FIT<span className="text-lime">MATE</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex flex-1 items-center gap-2 text-sm font-semibold">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              aria-current={isActive(item.to) ? 'page' : undefined}
              className={clsx(
                'rounded-full border border-transparent px-4 py-2 transition-colors',
                'font-display text-sm text-textMuted hover:text-white',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime',
                isActive(item.to) && 'border-lime bg-lime text-[#09090A]'
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="flex-1 md:hidden" />

        {/* Desktop: Search + Notifications + Auth */}
        <div className="hidden md:flex items-center gap-3 text-sm font-semibold">
          {/* Search */}
          <button
            className="rounded-full border border-border px-3 py-2 text-textMuted transition hover:border-borderStrong hover:text-white cursor-pointer"
            onClick={() => navigate('/search')}
            title="搜索"
          >
            🔍
          </button>

          {isLoggedIn ? (
            <>
              {/* Notifications */}
              <button
                className="relative rounded-full border border-border px-3 py-2 text-textMuted transition hover:border-borderStrong hover:text-white cursor-pointer"
                onClick={() => navigate('/notifications')}
                title="通知"
              >
                🔔
                {unreadNotifs > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white px-1">
                    {unreadNotifs > 99 ? '99+' : unreadNotifs}
                  </span>
                )}
              </button>
              {/* Messages */}
              <button
                className="relative rounded-full border border-border px-3 py-2 text-textMuted transition hover:border-borderStrong hover:text-white cursor-pointer"
                onClick={() => navigate('/messages')}
                title="消息"
              >
                💬
                {totalUnread > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white px-1">
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </span>
                )}
              </button>
              {/* User avatar */}
              <Link
                to="/profile"
                className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 transition hover:border-borderStrong"
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-[#09090A]"
                  style={{ background: user?.color || '#C8FF00' }}
                >
                  {user?.avatar || 'U'}
                </div>
                <span className="text-sm text-white max-w-[80px] truncate">{user?.name || '用户'}</span>
              </Link>
              <button
                className="rounded-full border border-border px-3 py-2 text-textMuted transition hover:border-red-500 hover:text-red-400 cursor-pointer text-xs"
                onClick={logout}
                title="退出登录"
              >
                退出
              </button>
            </>
          ) : (
            <>
              <button
                className="rounded-full border border-border px-4 py-2 text-textMuted transition hover:border-borderStrong hover:text-white cursor-pointer"
                onClick={openLogin}
              >
                登录
              </button>
              <button
                className="rounded-full bg-lime px-4 py-2 text-[#09090A] font-bold transition hover:shadow-glow cursor-pointer"
                onClick={openLogin}
              >
                免费注册
              </button>
            </>
          )}
        </div>

        {/* Mobile hamburger button */}
        <button
          className="md:hidden flex flex-col items-center justify-center gap-1.5 w-10 h-10 rounded-lg cursor-pointer"
          aria-label={mobileOpen ? '关闭菜单' : '打开菜单'}
          aria-expanded={mobileOpen}
          onClick={toggleMenu}
        >
          <span className={clsx('block h-0.5 w-5 bg-white transition-transform duration-200', mobileOpen && 'translate-y-2 rotate-45')} />
          <span className={clsx('block h-0.5 w-5 bg-white transition-opacity duration-200', mobileOpen && 'opacity-0')} />
          <span className={clsx('block h-0.5 w-5 bg-white transition-transform duration-200', mobileOpen && '-translate-y-2 -rotate-45')} />
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-base/95 backdrop-blur-xl px-4 pb-4 pt-2">
          <div className="flex flex-col gap-1">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                aria-current={isActive(item.to) ? 'page' : undefined}
                className={clsx(
                  'rounded-lg px-4 py-3 font-display text-sm font-semibold transition-colors',
                  isActive(item.to) ? 'bg-lime text-[#09090A]' : 'text-textMuted hover:text-white hover:bg-surface'
                )}
                onClick={closeMenu}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            {isLoggedIn ? (
              <button
                className="flex-1 rounded-full border border-border py-2.5 text-sm font-semibold text-red-400 transition hover:bg-red-500/10 cursor-pointer"
                onClick={() => { logout(); closeMenu(); }}
              >
                退出登录
              </button>
            ) : (
              <>
                <button
                  className="flex-1 rounded-full border border-border py-2.5 text-sm font-semibold text-textMuted transition hover:text-white cursor-pointer"
                  onClick={() => { openLogin(); closeMenu(); }}
                >
                  登录
                </button>
                <button
                  className="flex-1 rounded-full bg-lime py-2.5 text-sm font-bold text-[#09090A] transition hover:shadow-glow cursor-pointer"
                  onClick={() => { openLogin(); closeMenu(); }}
                >
                  免费注册
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

/** Mobile Bottom Tab Bar */
const BottomTabBar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isLoggedIn, openLogin } = useAuthStore();
  const totalUnread = useMessageStore((s) => s.totalUnread);

  const isActive = (path: string) => location.pathname === path;

  const handleTabClick = (tab: typeof bottomTabs[0]) => {
    if (tab.isCreate) {
      if (!isLoggedIn) {
        openLogin();
        return;
      }
      navigate('/discover', { state: { openCreatePost: true } });
      return;
    }
    if (tab.to === '/messages' && !isLoggedIn) {
      openLogin();
      return;
    }
    if (tab.to === '/profile' && !isLoggedIn) {
      openLogin();
      return;
    }
    navigate(tab.to);
  };

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-base/95 backdrop-blur-xl safe-area-bottom">
      <div className="flex items-center justify-around h-14">
        {bottomTabs.map((tab) => (
          <button
            key={tab.to}
            className={clsx(
              'flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition cursor-pointer relative',
              tab.isCreate
                ? ''
                : isActive(tab.to)
                  ? 'text-lime'
                  : 'text-textMuted hover:text-white'
            )}
            onClick={() => handleTabClick(tab)}
          >
            {tab.isCreate ? (
              <div className="w-10 h-10 rounded-full bg-lime flex items-center justify-center text-[#09090A] text-xl font-bold -mt-3 shadow-glow">
                ➕
              </div>
            ) : (
              <>
                <span className="text-lg leading-none">
                  {isActive(tab.to) ? tab.activeIcon : tab.icon}
                </span>
                <span className="text-[10px] font-display font-semibold">{tab.label}</span>
                {tab.badge === 'messages' && totalUnread > 0 && (
                  <span className="absolute top-1 right-1/4 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white px-0.5">
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </span>
                )}
              </>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export const Layout = ({ children }: { children: React.ReactNode }) => (
  <>
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-lime focus:px-4 focus:py-2 focus:text-[#09090A] focus:font-bold"
    >
      跳到主要内容
    </a>
    <Navbar />
    <main id="main-content" className="min-h-screen bg-base text-white pb-16 md:pb-0">{children}</main>
    <BottomTabBar />
    <BackToTop />
    <LoginModal />
  </>
);
