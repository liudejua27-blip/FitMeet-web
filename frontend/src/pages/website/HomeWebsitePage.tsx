import { Link } from 'react-router-dom';
import { SiteLink } from '../../components/navigation/SiteLink';
import {
  enterpriseLoopCopy,
  safetyItems,
  socialWorldPrimitives,
} from '../../components/website/content/website-content';
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
        title="Social World 不是更多信息流，而是更清楚的社交路径。"
        body="传统社交让用户不停刷人和内容；FitMeet 让用户先表达当前需求，再由 Agent 把需求转换成可匹配、可发布、可确认的真实场景。"
      >
        <div className="fm-startup-signal-board" aria-label="FitMeet Social World 产品信号">
          <div className="fm-startup-signal-board__copy">
            <span>Social World OS</span>
            <h3>把“想认识人”拆成可完成、可确认、可恢复的产品步骤。</h3>
            <p>
              用户不再靠刷卡碰运气。FitMeet 先确认需求，再同步发现页，随后把匹配、私信、加好友和约练推进到同一个上下文里。
            </p>
          </div>
          <div className="fm-startup-product-stack" aria-label="Social World 工作流">
            <article>
              <span>01</span>
              <strong>Say</strong>
              <p>说出想找谁、做什么、何时方便。</p>
            </article>
            <article>
              <span>02</span>
              <strong>Confirm</strong>
              <p>生成卡片后再确认公开。</p>
            </article>
            <article>
              <span>03</span>
              <strong>Meet</strong>
              <p>候选和消息继续承接。</p>
            </article>
          </div>
        </div>
        <div className="fm-social-primitives" aria-label="FitMeet Social World primitives">
          <div className="fm-social-primitives__intro">
            <span>Product primitives</span>
            <h3>不是泛聊天机器人，而是一套社交执行系统。</h3>
            <p>
              每一次连接都被拆成更小、更确定的动作。用户知道当前在哪一步，也知道下一步会发生什么。
            </p>
          </div>
          <div className="fm-social-primitives__rail">
            {socialWorldPrimitives.map(([name, title, body], index) => (
              <article key={name}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{name}</strong>
                <h4>{title}</h4>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
        <div className="fm-context-brief fm-context-brief--compact">
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
        title="让社交更简单：不是刷更多人，而是推进下一步。"
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
        title="进入 Social World，从一个明确需求开始。"
        body="先让 Agent 生成需求卡，确认后进入发现页，再围绕同频用户开始邀请、私信或加好友。"
        primary={{ label: '进入发现', to: '/discover', siteLink: true }}
        secondary={{ label: '打开 App', to: '/download' }}
      />
    </>
  );
}
