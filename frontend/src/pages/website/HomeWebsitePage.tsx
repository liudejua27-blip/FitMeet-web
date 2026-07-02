import { Link } from 'react-router-dom';
import { SiteLink } from '../../components/navigation/SiteLink';
import { enterpriseLoopCopy, safetyItems } from '../../components/website/content/website-content';
import { AgentConversionBand } from '../../components/website/sections/AgentConversionBand';
import { FinalCTA } from '../../components/website/sections/FinalCTA';
import { WebsiteHero } from '../../components/website/sections/WebsiteHero';
import { WebsiteSection } from '../../components/website/sections/WebsiteSection';

const homepageSystemSignals = [
  ['Context', '先说清真实场景', '想找谁、做什么、何时方便、哪些边界不能越过，先进入同一个需求对象。'],
  ['Control', '关键动作保持确认', '发布、邀请、私信、加好友都先让用户看见结果，再决定是否推进。'],
  ['Continuity', '发现和消息共享上下文', '需求卡、候选理由、开场白和后续回复沿用同一条记录。'],
] as const;

const homepageExecutionLayers = [
  ['Capture', '把自然语言收束成明确需求', '不是先推荐陌生人，而是先确定用户此刻想发生什么。'],
  ['Structure', '生成能被用户检查的卡片', '时间、地点、目标、兴趣和安全边界以产品字段呈现。'],
  ['Publish', '确认后才进入公开发现', 'Discover 读取同一条记录，避免聊天里说过但页面不可见。'],
  ['Connect', '候选、私信和好友回到同一会话', '关系推进不再断在不同页面和不同上下文之间。'],
] as const;

export function HomeWebsitePage() {
  return (
    <>
      <WebsiteHero name="home" />

      <WebsiteSection
        label="Context"
        title="Social World 不是堆更多人，而是让连接路径变清楚。"
        body="FitMeet 把社交从“刷到谁算谁”改成一套可理解、可确认、可继续的路径。用户先表达需求，Agent 再把需求变成能进入发现、匹配和消息的真实场景。"
      >
        <div className="fm-home-system-panel" aria-label="FitMeet Social World 系统视图">
          <div className="fm-home-system-panel__copy">
            <span>Social World OS</span>
            <h3>把“想认识人”拆成用户能看懂、也能随时停下的路径。</h3>
            <p>
              传统社交把目的、时间、地点和边界丢进聊天里慢慢试探。FitMeet
              先把这些信号结构化，再把发布、匹配、私信和好友关系接回同一套上下文。
            </p>
            <div className="fm-home-system-panel__status" aria-label="产品路径状态">
              <span>Intent</span>
              <i aria-hidden="true" />
              <span>Card</span>
              <i aria-hidden="true" />
              <span>Discover</span>
              <i aria-hidden="true" />
              <span>Inbox</span>
            </div>
          </div>
          <div className="fm-home-system-panel__grid">
            {homepageSystemSignals.map(([label, title, body]) => (
              <article key={label}>
                <span>{label}</span>
                <strong>{title}</strong>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="fm-home-execution-panel" aria-label="FitMeet Social World 执行层">
          <div className="fm-home-execution-panel__lead">
            <span>Execution model</span>
            <h3>不是泛聊天机器人，而是受确认约束的执行层。</h3>
            <p>
              每个动作都有清晰的输入、输出和下一步。AI 可以整理、提取和生成文案，但公开、联系和保存关系必须回到用户确认。
            </p>
          </div>
          <div className="fm-home-execution-panel__list">
            {homepageExecutionLayers.map(([label, title, body]) => (
              <article key={label}>
                <span>{label}</span>
                <h4>{title}</h4>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </WebsiteSection>

      <AgentConversionBand />

      <WebsiteSection
        label="Matching Loop"
        title="让社交更简单：知道当前状态，也知道下一步。"
        tone="deep"
      >
        <div className="fm-home-loop-panel">
          <ol className="fm-flow-steps">
            {enterpriseLoopCopy.map(([step, body], index) => (
              <li key={step}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{step}</strong>
                <p>{body}</p>
              </li>
            ))}
          </ol>
          <aside className="fm-home-loop-panel__aside" aria-label="Social World 产品原则">
            <span>Operating principle</span>
            <h3>AI 做整理，人做决定。</h3>
            <p>
              FitMeet Agent 可以分类、提取、总结和生成开场白；但发布、匹配授权、私信、加好友和资料保存都必须通过确定性服务和用户确认。
            </p>
          </aside>
        </div>
      </WebsiteSection>

      <WebsiteSection label="Proof" title="安全感不靠长说明，而是出现在每个关键动作旁边。">
        <div className="fm-home-trust-panel">
          <div className="fm-home-trust-panel__copy">
            <span>Trust layer</span>
            <h3>把风险控制放在界面里，而不是藏在说明文档里。</h3>
            <p>
              用户在发布前、联系前、公开前都应该看见边界。FitMeet
              用确认、撤回、审计和默认隐藏，把安全机制变成每一步的可见反馈。
            </p>
          </div>
          <div className="fm-trust-rail">
            {safetyItems.slice(0, 4).map(([title, body]) => (
              <article key={title}>
                <span>{title}</span>
                <p>{body}</p>
              </article>
            ))}
          </div>
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
        title="从一个明确需求开始进入 Social World。"
        body="先让 Agent 生成需求卡，确认后进入发现页，再围绕同频用户开始邀请、私信或加好友。"
        primary={{ label: '进入发现', to: '/discover', siteLink: true }}
        secondary={{ label: '打开 App', to: '/download' }}
      />
    </>
  );
}
