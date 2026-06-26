import { downloadOptions } from '../../components/website/content/website-content';
import { PhonePreview } from '../../components/website/sections/PhonePreview';
import { ProductSurfaceGrid } from '../../components/website/sections/ProductSurfaceGrid';
import { WaitlistSection } from '../../components/website/sections/WaitlistSection';
import { WebsiteHero } from '../../components/website/sections/WebsiteHero';
import { WebsiteSection } from '../../components/website/sections/WebsiteSection';

export function DownloadWebsitePage() {
  return (
    <>
      <WebsiteHero name="download" />
      <WebsiteSection label="Download" title="iOS、Android 和 Web 发现页先放在同一个下载入口。">
        <div className="fm-download-grid">
          {downloadOptions.map(([title, body]) => (
            <article key={title}>
              <span>Coming Soon</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </WebsiteSection>
      <WebsiteSection label="App Flow" title="用户每天只需要看懂这五个入口。" tone="deep">
        <PhonePreview />
      </WebsiteSection>
      <WebsiteSection label="核心产品流程" title="用产品示意图说明 Agent、发现和消息如何接上。">
        <ProductSurfaceGrid />
      </WebsiteSection>
      <WaitlistSection />
    </>
  );
}
