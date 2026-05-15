import { type ReactNode, useState } from 'react';
import clsx from 'clsx';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore, useMessageStore, useNotificationStore } from '../stores';
import { BackToTop } from './ui';

const navItems = [
  { to: '/hall', label: 'FitMeet 大厅' },
  { to: '/ai', label: 'Agent 宇宙' },
  { to: '/ai-hosting', label: 'AI 托管' },
  { to: '/agent-inbox', label: 'Agent Inbox' },
  { to: '/developers/social-skills', label: 'Social Skills' },
  { to: '/safety', label: '安全' },
];

const bottomTabs = [
  { id: 'home', to: '/', label: '首页', icon: 'home' as const },
  { id: 'hall', to: '/hall', label: '大厅', icon: 'discover' as const },
  { id: 'create', to: '/hall', label: '发布', icon: 'create' as const, isCreate: true },
  { id: 'messages', to: '/messages', label: '消息', icon: 'messages' as const, badge: 'messages' as const },
  { id: 'profile', to: '/profile', label: '我的', icon: 'profile' as const },
];

const icpText = import.meta.env.VITE_ICP_TEXT || '鲁ICP备2026015946号-2';
const icpUrl = import.meta.env.VITE_ICP_URL || 'http://beian.miit.gov.cn/';

const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isLoggedIn, user, openLogin, logout } = useAuthStore();
  const totalUnread = useMessageStore((s) => s.totalUnread);
  const unreadNotifs = useNotificationStore((s) => s.unreadCount);

  const isActive = (path: string) =>
    location.pathname === path || (path !== '/' && location.pathname.startsWith(`${path}/`));

  return (
    <nav aria-label="主导航" className="sticky top-0 z-50 border-b border-white/10 bg-[#100b08]/92 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="group flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-lime text-lg font-black text-white shadow-glow">
            F
          </span>
          <span className="font-display text-xl font-black tracking-tight text-cream">
            Fit<span className="text-lime">Meet</span>
          </span>
        </Link>

        <div className="hidden flex-1 items-center justify-center md:flex">
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                aria-current={isActive(item.to) ? 'page' : undefined}
                className={clsx(
                  'whitespace-nowrap rounded-lg px-3 py-2 text-center font-display text-sm font-bold transition',
                  isActive(item.to)
                    ? 'bg-lime text-white shadow-glow'
                    : 'text-textMuted hover:bg-white/[0.06] hover:text-cream',
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <button
          className="hidden min-w-[250px] items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-left text-sm text-textMuted transition hover:border-lime/40 hover:text-cream lg:flex"
          onClick={() => navigate('/search')}
        >
          <SearchIcon />
          搜索 Agent、意图或城市
        </button>

        <div className="hidden items-center gap-2 md:flex">
          {isLoggedIn ? (
            <>
              <button
                className="rounded-lg bg-lime px-4 py-2.5 text-sm font-black text-white transition hover:bg-brand2 hover:shadow-glow"
                onClick={() => navigate('/social-request/new')}
              >
                发布意图
              </button>
              <IconButton label="通知" count={unreadNotifs} onClick={() => navigate('/notifications')}>
                <BellIcon />
              </IconButton>
              <IconButton label="消息" count={totalUnread} onClick={() => navigate('/messages')}>
                <MessageIcon />
              </IconButton>
              <Link
                to="/profile"
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 transition hover:border-lime/40"
              >
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-black text-white"
                  style={{ background: user?.color || '#FF6A00' }}
                >
                  {user?.avatar || user?.name?.[0] || 'U'}
                </span>
                <span className="max-w-[90px] truncate text-sm font-bold text-cream">{user?.name || '我的主页'}</span>
              </Link>
              <button
                className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-textMuted transition hover:border-red-400/40 hover:text-red-200"
                onClick={logout}
              >
                退出
              </button>
            </>
          ) : (
            <>
              <button
                className="rounded-lg border border-white/10 px-4 py-2.5 text-sm font-bold text-textMuted transition hover:border-lime/40 hover:text-cream"
                onClick={openLogin}
              >
                登录
              </button>
              <button
                className="rounded-lg bg-lime px-4 py-2.5 text-sm font-black text-white transition hover:bg-brand2 hover:shadow-glow"
                onClick={() => navigate('/hall')}
              >
                进入大厅
              </button>
            </>
          )}
        </div>

        <div className="flex-1 md:hidden" />
        <button
          className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-lg border border-white/10 md:hidden"
          aria-label={mobileOpen ? '关闭菜单' : '打开菜单'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((value) => !value)}
        >
          <span className={clsx('h-0.5 w-5 bg-cream transition', mobileOpen && 'translate-y-2 rotate-45')} />
          <span className={clsx('h-0.5 w-5 bg-cream transition', mobileOpen && 'opacity-0')} />
          <span className={clsx('h-0.5 w-5 bg-cream transition', mobileOpen && '-translate-y-2 -rotate-45')} />
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-white/10 bg-[#100b08]/98 px-4 py-4 md:hidden">
          <div className="grid gap-2">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                aria-current={isActive(item.to) ? 'page' : undefined}
                className={clsx(
                  'rounded-lg px-4 py-3 text-sm font-bold transition',
                  isActive(item.to) ? 'bg-lime text-white' : 'text-textMuted hover:bg-white/[0.06] hover:text-cream',
                )}
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {isLoggedIn ? (
              <button className="col-span-2 rounded-lg border border-red-400/30 py-3 text-sm font-bold text-red-200" onClick={logout}>
                退出登录
              </button>
            ) : (
              <>
                <button className="rounded-lg border border-white/10 py-3 text-sm font-bold text-textMuted" onClick={openLogin}>
                  登录
                </button>
                <button className="rounded-lg bg-lime py-3 text-sm font-black text-white" onClick={() => navigate('/hall')}>
                  进入大厅
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

const IconButton = ({
  children,
  count,
  label,
  onClick,
}: {
  children: ReactNode;
  count: number;
  label: string;
  onClick: () => void;
}) => (
  <button
    aria-label={label}
    className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-textMuted transition hover:border-lime/40 hover:text-cream"
    onClick={onClick}
  >
    {children}
    {count > 0 && (
      <span className="absolute -right-1 -top-1 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-coral px-1 text-[10px] font-black text-white">
        {count > 99 ? '99+' : count}
      </span>
    )}
  </button>
);

const BottomTabBar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isLoggedIn, openLogin } = useAuthStore();
  const totalUnread = useMessageStore((s) => s.totalUnread);

  const handleTabClick = (tab: (typeof bottomTabs)[0]) => {
    if ((tab.to === '/messages' || tab.to === '/profile') && !isLoggedIn) {
      openLogin();
      return;
    }
    navigate(tab.to);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#100b08]/95 backdrop-blur-xl md:hidden">
      <div className="grid h-16 grid-cols-5">
        {bottomTabs.map((tab) => {
          const active = location.pathname === tab.to;
          return (
            <button
              key={tab.id}
              aria-label={tab.label}
              className={clsx(
                'relative flex flex-col items-center justify-center gap-0.5 text-xs font-bold transition',
                tab.isCreate ? 'text-white' : active ? 'text-lime' : 'text-textMuted',
              )}
              onClick={() => handleTabClick(tab)}
            >
              {tab.isCreate ? (
                <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-xl bg-lime text-2xl font-black shadow-glow transition">
                  +
                </span>
              ) : (
                <>
                  <TabIcon icon={tab.icon} />
                  <span>{tab.label}</span>
                  {tab.badge === 'messages' && totalUnread > 0 && (
                    <span className="absolute right-5 top-2 flex min-h-[16px] min-w-[16px] items-center justify-center rounded-full bg-coral px-1 text-[9px] text-white">
                      {totalUnread > 99 ? '99+' : totalUnread}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const Footer = () => (
  <footer className="border-t border-white/10 bg-[#100b08] px-4 py-8 text-xs text-textSofter">
    <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 text-center">
      <nav className="flex flex-wrap justify-center gap-5" aria-label="合规链接">
        <Link className="transition hover:text-lime" to="/hall">FitMeet 大厅</Link>
        <Link className="transition hover:text-lime" to="/ai">Agent 宇宙</Link>
        <Link className="transition hover:text-lime" to="/ai-hosting">AI 托管</Link>
        <Link className="transition hover:text-lime" to="/developers/social-skills">Social Skills</Link>
        <Link className="transition hover:text-lime" to="/safety">安全</Link>
        <Link className="transition hover:text-lime" to="/terms">用户协议</Link>
        <Link className="transition hover:text-lime" to="/privacy">隐私政策</Link>
      </nav>
      <a className="transition hover:text-lime" href={icpUrl} target="_blank" rel="noreferrer">
        {icpText}
      </a>
    </div>
  </footer>
);

export const Layout = ({ children }: { children: ReactNode }) => {
  const location = useLocation();

  if (location.pathname === '/' || location.pathname.startsWith('/agent-connect')) {
    return <>{children}</>;
  }

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded-lg focus:bg-lime focus:px-4 focus:py-2 focus:text-white focus:font-bold"
      >
        跳到主要内容
      </a>
      <Navbar />
      <main id="main-content" className="min-h-screen bg-base pb-16 text-cream md:pb-0">
        {children}
      </main>
      <Footer />
      <BottomTabBar />
      <BackToTop />
    </>
  );
};

const SearchIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16L21 21" strokeLinecap="round" />
  </svg>
);

const BellIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M6.5 9.5a5.5 5.5 0 1 1 11 0v3.1l1.6 2.8a.8.8 0 0 1-.7 1.2H4.6a.8.8 0 0 1-.7-1.2l1.6-2.8z" strokeLinejoin="round" />
    <path d="M9.5 18.5a2.5 2.5 0 0 0 5 0" strokeLinecap="round" />
  </svg>
);

const MessageIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M5 6.5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-5 3v-3H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z" strokeLinejoin="round" />
  </svg>
);

const TabIcon = ({ icon }: { icon: 'home' | 'discover' | 'create' | 'messages' | 'profile' }) => {
  if (icon === 'home') {
    return (
      <svg aria-hidden="true" className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 10.5L12 4l8 6.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6.5 9.8V20h11V9.8" strokeLinejoin="round" />
      </svg>
    );
  }

  if (icon === 'discover') {
    return (
      <svg aria-hidden="true" className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="7.5" />
        <path d="M9.7 14.3L14.8 9.2l-1.7 5.9-5.9 1.7z" strokeLinejoin="round" />
      </svg>
    );
  }

  if (icon === 'messages') {
    return (
      <svg aria-hidden="true" className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M5 6.5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-5 3v-3H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z" strokeLinejoin="round" />
      </svg>
    );
  }

  if (icon === 'profile') {
    return (
      <svg aria-hidden="true" className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 19a7 7 0 0 1 14 0" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
};
