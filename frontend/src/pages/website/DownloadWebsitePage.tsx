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
      <WebsiteSection label="Download" title="把 Social World 的五个入口放进同一套 App 体验。">
        <div className="fm-download-stage" aria-label="FitMeet App Beta 展示">
          <div className="fm-download-stage__screens" aria-label="FitMeet App 四个核心页面">
            {[
              ['Agent', '/images/fitmeet/website/social-world-phone-agent-v3.jpg', 'FitMeet Agent 对话和约练卡页面'],
              ['发现', '/images/fitmeet/website/social-world-phone-discover-v3.jpg', 'FitMeet 发现页推荐匹配页面'],
              ['消息', '/images/fitmeet/website/social-world-phone-messages-v3.jpg', 'FitMeet 消息页和邀请页面'],
              ['我的', '/images/fitmeet/website/social-world-phone-profile-v3.jpg', 'FitMeet 个人中心隐私设置页面'],
            ].map(([label, src, alt]) => (
              <figure key={label}>
                <img src={src} alt={alt} loading="eager" decoding="async" />
                <figcaption>{label}</figcaption>
              </figure>
            ))}
          </div>
          <div>
            <span>Beta preview</span>
            <h3>一套 App，承接从需求到消息的完整闭环。</h3>
            <p>
              让社交更简单：首页看进度，发现页看真实需求，消息页继续推进，个人中心管理画像、兴趣和安全边界。
            </p>
          </div>
        </div>
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
      <WebsiteSection label="App Flow" title="每天只需要看懂这五个入口，Social World 就能继续推进。" tone="deep">
        <PhonePreview />
      </WebsiteSection>
      <WebsiteSection label="核心产品流程" title="用产品示意图说明 Agent、Discover 和 Messages 如何接上。">
        <ProductSurfaceGrid />
      </WebsiteSection>
      <WaitlistSection />
    </>
  );
}
