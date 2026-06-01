import { WebsitePlatform } from '../components/website/WebsitePlatform';

export function PlatformPage({
  page = 'home',
}: {
  page?: 'home' | 'ecosystem' | 'app' | 'developers' | 'safety' | 'about' | 'lifeGraph';
}) {
  return <WebsitePlatform page={page} />;
}
