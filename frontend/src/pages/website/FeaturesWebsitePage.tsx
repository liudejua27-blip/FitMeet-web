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

const featureOperatingStack = [
  ['Intent first', '先确定当前需求，再进入推荐。'],
  ['Confirmable output', '公开内容先变成可检查结果。'],
  ['One context', '发现、候选和消息沿用同一上下文。'],
] as const;

export function FeaturesWebsitePage() {
  return (
    <>
      <WebsiteHero name="features" />
      <WebsiteSection
        label="Product"
        title="一次真实社交，被拆成几项清楚的产品能力。"
        body="FitMeet 的入口不是无限滑动，而是当前需求：想认识什么样的人，为什么现在可以开始，下一步应该怎样确认。"
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
        <div className="fm-feature-system-strip" aria-label="FitMeet 产品架构原则">
          {featureOperatingStack.map(([title, body]) => (
            <article key={title}>
              <span>{title}</span>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </WebsiteSection>
      <WebsiteSection
        label="Agent"
        title="Agent 负责理解和生成，执行权始终留给用户。"
        tone="deep"
      >
        <div className="fm-primitive-ledger" aria-label="FitMeet 产品能力账本">
          <div>
            <span>Capability ledger</span>
            <h3>所有能力只服务一个目标：让真实连接更容易开始。</h3>
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
        title="先体验一次需求到连接的闭环。"
        body="告诉 Agent 想约练、交友还是找搭子，在哪里，什么时间，喜欢什么节奏。"
        primary={{ label: '体验 Agent', to: '/agent' }}
        secondary={{ label: '进入发现', to: '/discover', siteLink: true }}
      />
    </>
  );
}
