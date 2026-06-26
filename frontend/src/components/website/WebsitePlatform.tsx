import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { applyWebsiteMeta } from './layout/WebsiteMeta';
import { WebsiteLayout } from './layout/WebsiteLayout';
import { AboutWebsitePage } from '../../pages/website/AboutWebsitePage';
import { DemoWebsitePage } from '../../pages/website/DemoWebsitePage';
import { DownloadWebsitePage } from '../../pages/website/DownloadWebsitePage';
import { FeaturesWebsitePage } from '../../pages/website/FeaturesWebsitePage';
import { HomeWebsitePage } from '../../pages/website/HomeWebsitePage';
import { SafetyWebsitePage } from '../../pages/website/SafetyWebsitePage';
import { type WebsitePage } from './content/website-content';

export type { WebsitePage };
export { WebsiteLayout };

export function WebsitePlatform({ page }: { page: WebsitePage }) {
  const location = useLocation();

  useEffect(() => {
    applyWebsiteMeta(page);
  }, [page]);

  useEffect(() => {
    if (!location.hash) return;
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
  }, [location.hash, location.pathname]);

  return (
    <WebsiteLayout>
      {page === 'home' ? <HomeWebsitePage /> : null}
      {page === 'features' ? <FeaturesWebsitePage /> : null}
      {page === 'safety' ? <SafetyWebsitePage /> : null}
      {page === 'download' ? <DownloadWebsitePage /> : null}
      {page === 'about' ? <AboutWebsitePage /> : null}
      {page === 'demo' ? <DemoWebsitePage /> : null}
    </WebsiteLayout>
  );
}
