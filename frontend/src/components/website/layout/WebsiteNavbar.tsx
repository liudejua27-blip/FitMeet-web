import clsx from 'clsx';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SiteLink } from '../../navigation/SiteLink';
import { navItems } from '../content/website-content';

export function WebsiteNavbar() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className={clsx('fm-nav', menuOpen && 'is-menu-open')}>
      <Link to="/" className="fm-brand" aria-label="FitMeet 首页">
        <span>
          <img src="/favicon-192.png" alt="FitMeet" width="38" height="38" />
        </span>
        <strong>FitMeet</strong>
      </Link>
      <button
        type="button"
        className="fm-nav__menu"
        aria-expanded={menuOpen}
        aria-controls="fitmeet-website-nav"
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? '关闭菜单' : '打开菜单'}
      </button>
      <nav id="fitmeet-website-nav" aria-label="FitMeet 官网导航">
        {navItems.map((item) => {
          const active =
            item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
          return (
            <SiteLink
              key={item.to}
              to={item.to}
              aria-current={active ? 'page' : undefined}
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </SiteLink>
          );
        })}
      </nav>
      <div className="fm-nav__actions">
        <SiteLink to="/discover" className="fm-button fm-button--ghost">
          进入发现
        </SiteLink>
        <Link to="/download" className="fm-button fm-button--primary">
          打开 App
        </Link>
      </div>
    </header>
  );
}
