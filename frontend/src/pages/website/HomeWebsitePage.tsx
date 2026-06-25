import { Link } from 'react-router-dom';
import { SiteLink } from '../../components/navigation/SiteLink';
import { enterpriseLoopCopy, safetyItems } from '../../components/website/content/website-content';
import { AgentConversionBand } from '../../components/website/sections/AgentConversionBand';
import { FinalCTA } from '../../components/website/sections/FinalCTA';
import { WebsiteHero } from '../../components/website/sections/WebsiteHero';
import { WebsiteSection } from '../../components/website/sections/WebsiteSection';

export function HomeWebsitePage() {
  return (
    <>
      <WebsiteHero name="home" />

      <WebsiteSection
        label="Context"
        title="从问题流、信息流，升级为需求流社交。"
        body="传统社交让用户不停刷人和内容；FitMeet 让用户先表达当前需求，再由 Agent 把需求转换成可匹配、可发布、可确认的社交场景。"
      >
        <figure className="fm-demand-wallpaper">
          <img
            src="/images/fitmeet/generated/social-world-demand-wallpaper-1920.jpg"
            alt="FitMeet 需求流社交城市夜景与连接网络"
            width="1672"
            height="941"
            loading="lazy"
            decoding="async"
          />
          <figcaption>真实连接从具体场景开始：一起做什么、在哪里见、边界是否清楚。</figcaption>
        </figure>
        <div className="fm-context-brief">
          <article>
            <span>Before</span>
            <h3>刷更多人，仍然不知道该和谁开始。</h3>
            <p>
              用户只能靠头像、标签和附近列表猜测，真正的时间、地点、目的和边界要在聊天里反复确认。
            </p>
          </article>
          <article className="is-strong">
            <span>FitMeet</span>
            <h3>先表达需求，再出现合适的人和下一步。</h3>
            <p>
              需求被整理成约练、交友或搭子卡。确认后进入发现页，后续邀请、私信和加好友回到消息页承接。
            </p>
          </article>
        </div>
      </WebsiteSection>

      <AgentConversionBand />

      <WebsiteSection
        label="Matching Loop"
        title="核心不是刷更多人，而是把需求推进到下一步。"
        tone="deep"
      >
        <ol className="fm-flow-steps">
          {enterpriseLoopCopy.map(([step, body], index) => (
            <li key={step}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{step}</strong>
              <p>{body}</p>
            </li>
          ))}
        </ol>
      </WebsiteSection>

      <WebsiteSection label="Proof" title="安全感不靠长说明，而是出现在每个关键动作旁边。">
        <div className="fm-trust-rail">
          {safetyItems.slice(0, 4).map(([title, body]) => (
            <article key={title}>
              <span>{title}</span>
              <p>{body}</p>
            </article>
          ))}
          <div className="fm-trust-rail__actions">
            <Link to="/safety" className="fm-button fm-button--ghost">
              查看安全中心
            </Link>
            <SiteLink to="/discover" className="fm-button fm-button--primary">
              进入发现
            </SiteLink>
          </div>
        </div>
      </WebsiteSection>

      <FinalCTA
        label="FitMeet App"
        title="从一个明确需求开始，认识真正聊得来的人。"
        body="先让 Agent 生成需求卡，确认后进入发现页，再围绕同频用户开始邀请、私信或加好友。"
        primary={{ label: '进入发现', to: '/discover', siteLink: true }}
        secondary={{ label: '打开 App', to: '/download' }}
      />
    </>
  );
}
