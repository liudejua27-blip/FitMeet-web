import { downloadOptions } from '../../components/website/content/website-content';
import { PhonePreview } from '../../components/website/sections/PhonePreview';
import { ProductSurfaceGrid } from '../../components/website/sections/ProductSurfaceGrid';
import { WaitlistSection } from '../../components/website/sections/WaitlistSection';
import { WebsiteHero } from '../../components/website/sections/WebsiteHero';
import { WebsiteSection } from '../../components/website/sections/WebsiteSection';

const downloadFlowCheckpoints = ['首页进度', '发现匹配', '消息承接', '个人边界'];

export function DownloadWebsitePage() {
  return (
    <>
      <WebsiteHero name="download" />
      <WebsiteSection label="Download" title="五个入口，承接同一条 Social World 路径。">
        <div className="fm-download-stage" aria-label="FitMeet App Beta 展示">
          <figure className="fm-download-stage__poster">
            <img
              src="/images/fitmeet/website/social-world-download-app-v1.jpg"
              alt="FitMeet App 黑金宣传视觉，展示 Agent、发现、消息和个人中心"
              loading="eager"
              decoding="async"
            />
          </figure>
          <div>
            <span>Beta preview</span>
            <h3>一套 App，承接从需求到消息的闭环。</h3>
            <p>
              让社交更简单：首页看进度，发现页看真实需求，消息页继续推进，个人中心管理画像、兴趣和安全边界。
            </p>
            <div className="fm-download-stage__checkpoints" aria-label="FitMeet App 核心入口">
              {downloadFlowCheckpoints.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
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
      <WebsiteSection label="App Flow" title="每天只看懂几个入口，Social World 就能继续推进。" tone="deep">
        <PhonePreview />
      </WebsiteSection>
      <WebsiteSection label="核心产品流程" title="从 Agent 到 Messages，用户始终知道下一步。">
        <ProductSurfaceGrid />
      </WebsiteSection>
      <WaitlistSection />
    </>
  );
}
