import { WebsitePlatform } from '../components/website/WebsitePlatform';

export function PlatformPage({
  page = 'home',
}: {
  page?: 'home' | 'ecosystem' | 'app' | 'developers' | 'safety' | 'about' | 'lifeGraph' | 'demo';
}) {
  return <WebsitePlatform page={page} />;
}
