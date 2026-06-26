import { type ReactNode } from 'react';
import { WebsiteFooter } from './WebsiteFooter';
import { WebsiteNavbar } from './WebsiteNavbar';

export function WebsiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="fitmeet-website fm-site fm-enterprise-site">
      <WebsiteNavbar />
      <main>{children}</main>
      <WebsiteFooter />
    </div>
  );
}
