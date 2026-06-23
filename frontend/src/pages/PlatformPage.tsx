import { WebsitePlatform } from '../components/website/WebsitePlatform';

export function PlatformPage({
  page = 'home',
}: {
  page?:
    | 'home'
    | 'features'
    | 'download'
    | 'safety'
    | 'about'
    | 'demo';
}) {
  return <WebsitePlatform page={page} />;
}
