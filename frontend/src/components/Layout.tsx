import { type ReactNode, useState } from 'react';
import clsx from 'clsx';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { usesFullBleedExperience } from '../routes/routeBoundaries';
import { useAuthStore, useMessageStore, useNotificationStore } from '../stores';
import { BackToTop } from './ui';

const navItems = [{ to: '/discover', label: '发现' }];

const bottomTabs = [
  { id: 'home', to: '/', label: '首页', icon: 'home' as const },
  { id: 'nearby', to: '/discover', label: '发现', icon: 'discover' as const },
  { id: 'agent', to: '/agent', label: 'Agent', icon: 'create' as const, isCreate: true },
  { id: 'messages', to: '/messages', label: '消息', icon: 'messages' as const, protected: true },
  { id: 'profile', to: '/profile', label: '我的', icon: 'profile' as const, protected: true },
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
    <nav aria-label="主导航" className="site-shell-nav sticky top-0 z-50">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="group flex items-center gap-3" aria-label="FitMeet 首页">
          <span className="site-shell-mark" aria-hidden="true">
            <img src="/favicon-192.png" alt="" width="38" height="38" />
          </span>
          <span className="font-display text-xl font-black tracking-tight text-cream">
            Fit<span className="text-lime">Meet</span>
          </span>
        </Link>

        <div className="hidden flex-1 items-center justify-center md:flex">
          <div className="site-shell-nav__links">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                aria-current={isActive(item.to) ? 'page' : undefined}
                className={clsx('site-shell-nav__link', isActive(item.to) && 'is-active')}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <button className="site-shell-search hidden lg:flex" onClick={() => navigate('/search')}>
          <SearchIcon />
          搜索运动、地点或用户
        </button>

        <div className="hidden items-center gap-2 md:flex">
          {isLoggedIn ? (
            <>
              <button className="site-shell-primary" onClick={() => navigate('/agent')}>
                告诉 Agent
              </button>
              <IconButton
                label="通知"
                count={unreadNotifs}
                onClick={() => navigate('/notifications')}
              >
                <BellIcon />
              </IconButton>
              <IconButton label="消息" count={totalUnread} onClick={() => navigate('/messages')}>
                <MessageIcon />
              </IconButton>
              <Link to="/profile" className="site-shell-user">
                <span style={{ background: user?.color || '#ff6a00' }}>
                  {user?.avatar || user?.name?.[0] || 'U'}
                </span>
                <strong>{user?.name || '我的主页'}</strong>
              </Link>
              <button className="site-shell-ghost site-shell-ghost--danger" onClick={logout}>
                退出
              </button>
            </>
          ) : (
            <>
              <button className="site-shell-ghost" onClick={openLogin}>
                登录
              </button>
              <button className="site-shell-primary" onClick={() => navigate('/discover')}>
                发布约练
              </button>
            </>
          )}
        </div>

        <div className="flex-1 md:hidden" />
        <button
          className="site-shell-menu md:hidden"
          aria-label={mobileOpen ? '关闭菜单' : '打开菜单'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((value) => !value)}
        >
          <span className={clsx(mobileOpen && 'translate-y-2 rotate-45')} />
          <span className={clsx(mobileOpen && 'opacity-0')} />
          <span className={clsx(mobileOpen && '-translate-y-2 -rotate-45')} />
        </button>
      </div>

      {mobileOpen && (
        <div className="site-shell-mobile md:hidden">
          <div className="grid gap-2">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                aria-current={isActive(item.to) ? 'page' : undefined}
                className={clsx('site-shell-mobile__link', isActive(item.to) && 'is-active')}
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {isLoggedIn ? (
              <button className="site-shell-mobile__danger col-span-2" onClick={logout}>
                退出登录
              </button>
            ) : (
              <>
                <button className="site-shell-mobile__button" onClick={openLogin}>
                  登录
                </button>
                <button
                  className="site-shell-mobile__primary"
                  onClick={() => navigate('/discover')}
                >
                  发布约练
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
  <button aria-label={label} className="site-shell-icon-button" onClick={onClick}>
    {children}
    {count > 0 && <span>{count > 99 ? '99+' : count}</span>}
  </button>
);

const BottomTabBar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isLoggedIn, openLogin } = useAuthStore();

  const handleTabClick = (tab: (typeof bottomTabs)[0]) => {
    if (tab.protected && !isLoggedIn) {
      openLogin();
      return;
    }
    navigate(tab.to);
  };

  return (
    <div className="site-shell-tabbar md:hidden">
      <div className="grid h-16 grid-cols-5">
        {bottomTabs.map((tab) => {
          const active = location.pathname === tab.to || location.pathname.startsWith(`${tab.to}/`);
          return (
            <button
              key={tab.id}
              aria-label={tab.label}
              className={clsx(
                'site-shell-tabbar__item',
                active && 'is-active',
                tab.isCreate && 'is-primary',
              )}
              onClick={() => handleTabClick(tab)}
            >
              {tab.isCreate ? <span>+</span> : <TabIcon icon={tab.icon} />}
              <small>{tab.label}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const Footer = () => (
  <footer className="site-shell-footer">
    <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 text-center">
      <nav className="flex flex-wrap justify-center gap-5" aria-label="合规链接">
        <Link to="/discover">发现</Link>
        <Link to="/agent">FitMeet Agent</Link>
        <Link to="/agent/settings">权限控制</Link>
        <Link to="/developers/social-skills">Agent API</Link>
        <Link to="/safety">安全中心</Link>
        <Link to="/terms">用户协议</Link>
        <Link to="/privacy">隐私政策</Link>
      </nav>
      <a href={icpUrl} target="_blank" rel="noreferrer">
        {icpText}
      </a>
    </div>
  </footer>
);

export const Layout = ({ children }: { children: ReactNode }) => {
  const location = useLocation();

  if (usesFullBleedExperience(location.pathname)) {
    return <>{children}</>;
  }

  return (
    <>
      <a href="#main-content" className="site-shell-skip">
        跳到主要内容
      </a>
      <Navbar />
      <main id="main-content" className="site-shell-main">
        {children}
      </main>
      <Footer />
      <BottomTabBar />
      <BackToTop />
    </>
  );
};

const SearchIcon = () => (
  <svg
    aria-hidden="true"
    className="h-4 w-4 shrink-0 text-lime"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
  >
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16L21 21" strokeLinecap="round" />
  </svg>
);

const BellIcon = () => (
  <svg
    aria-hidden="true"
    className="h-4 w-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
  >
    <path
      d="M6.5 9.5a5.5 5.5 0 1 1 11 0v3.1l1.6 2.8a.8.8 0 0 1-.7 1.2H4.6a.8.8 0 0 1-.7-1.2l1.6-2.8z"
      strokeLinejoin="round"
    />
    <path d="M9.5 18.5a2.5 2.5 0 0 0 5 0" strokeLinecap="round" />
  </svg>
);

const MessageIcon = () => (
  <svg
    aria-hidden="true"
    className="h-4 w-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
  >
    <path
      d="M5 6.5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-5 3v-3H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z"
      strokeLinejoin="round"
    />
  </svg>
);

const TabIcon = ({ icon }: { icon: 'home' | 'discover' | 'create' | 'messages' | 'profile' }) => {
  if (icon === 'home') {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M4 10.5L12 4l8 6.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6.5 9.8V20h11V9.8" strokeLinejoin="round" />
      </svg>
    );
  }

  if (icon === 'discover') {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="12" cy="12" r="7.5" />
        <path d="M9.7 14.3L14.8 9.2l-1.7 5.9-5.9 1.7z" strokeLinejoin="round" />
      </svg>
    );
  }

  if (icon === 'messages') {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path
          d="M5 6.5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-5 3v-3H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (icon === 'profile') {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 19a7 7 0 0 1 14 0" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
};
