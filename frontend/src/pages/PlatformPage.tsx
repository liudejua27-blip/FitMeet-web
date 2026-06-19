import { WebsitePlatform } from '../components/website/WebsitePlatform';

export function PlatformPage({
  page = 'home',
}: {
  page?:
    | 'home'
    | 'features'
    | 'download'
    | 'developers'
    | 'safety'
    | 'about'
    | 'contact'
    | 'lifeGraph'
    | 'demo';
}) {
  return <WebsitePlatform page={page} />;
}
