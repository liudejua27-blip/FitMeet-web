import { Link } from 'react-router-dom';
import { SiteLink } from '../../components/navigation/SiteLink';
import {
  agentCapabilities,
  featurePillars,
  socialWorldPrimitives,
} from '../../components/website/content/website-content';
import { FinalCTA } from '../../components/website/sections/FinalCTA';
import { WebsiteHero } from '../../components/website/sections/WebsiteHero';
import { WebsiteSection } from '../../components/website/sections/WebsiteSection';

export function FeaturesWebsitePage() {
  return (
    <>
      <WebsiteHero name="features" />
      <WebsiteSection
        label="Product"
        title="围绕约练、交友和搭子，把一次社交拆成 Social World 的基础能力。"
        body="FitMeet 的入口不是无限滑动，而是当前需求：我想认识什么样的人、为什么现在可以开始，以及下一步应该怎么确认。"
      >
        <div className="fm-capability-matrix">
          {featurePillars.map(([title, body]) => (
            <article key={title}>
              <span>Feature</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </WebsiteSection>
      <WebsiteSection
        label="Agent"
        title="Agent 负责理解、生成和筛选；执行权始终留给用户。"
        tone="deep"
      >
        <div className="fm-primitive-ledger" aria-label="FitMeet 产品能力账本">
          <div>
            <span>Capability ledger</span>
            <h3>每个能力都服务于同一个目标：让真实连接更容易开始。</h3>
          </div>
          <ol>
            {socialWorldPrimitives.map(([name, title, body]) => (
              <li key={name}>
                <strong>{name}</strong>
                <span>{title}</span>
                <p>{body}</p>
              </li>
            ))}
          </ol>
        </div>
        <div className="fm-proof-ledger">
          {agentCapabilities.map(([title, body]) => (
            <article key={title}>
              <span>FitMeet Agent</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
        <div className="fm-section-actions">
          <Link to="/agent" className="fm-button fm-button--primary">
            体验 Agent
          </Link>
          <SiteLink to="/discover" className="fm-button fm-button--ghost">
            进入发现
          </SiteLink>
        </div>
      </WebsiteSection>
      <FinalCTA
        label="Try FitMeet"
        title="先体验一次 Social World 的需求闭环。"
        body="你可以直接告诉 Agent：想约练、交友还是找搭子，在哪里，什么时间，喜欢什么节奏。"
        primary={{ label: '体验 Agent', to: '/agent' }}
        secondary={{ label: '进入发现', to: '/discover', siteLink: true }}
      />
    </>
  );
}
